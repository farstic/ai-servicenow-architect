#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { existsSync } from 'node:fs';
import dotenv from 'dotenv';
import { instanceManager } from './servicenow/instances.js';
import { runWithInstance } from './servicenow/context.js';
import {
  CORE_TOOLS_UNCONFIGURED, NO_INSTANCE_MESSAGE, setAdvertisedCount, setFullCatalogueSize,
  setToolListChangedNotifier,
} from './tools/status.js';
import { isUnderCloudSyncFolder } from './store/index.js';
import { collectToolCatalog } from './tools/index.js';
import { getResources, readResource } from './resources/index.js';
import { logger } from './utils/logging.js';
import { ServiceNowError } from './utils/errors.js';
import { getPackageVersion } from './utils/version.js';

// dotenv ONLY when asked, and only for a file that exists. A bare `dotenv.config()` reads
// the .env of whatever directory the server happens to start in — for an MCP server that is
// the user's project, so an unrelated `WRITE_ENABLED=true` in their repo would arm writes on
// this server without anyone choosing it (P-22).
const envFile = process.env.SNOW_ENV_FILE;
if (envFile && existsSync(envFile)) {
  dotenv.config({ path: envFile });
}

// ─── Create MCP Server ───────────────────────────────────────────────────────

/**
 * What `tools/list` returns. The full catalogue once an instance is loaded; the five
 * instance-free core tools before that.
 */
function advertisedTools(): ReturnType<typeof collectToolCatalog> {
  const all = collectToolCatalog();
  if (instanceManager.loadedCount() > 0) return all;
  return all.filter((t) => (CORE_TOOLS_UNCONFIGURED as readonly string[]).includes(t.name));
}

export function createServer(): Server {
  const server = new Server(
    {
      name: 'snowarch',
      version: getPackageVersion(),
    },
    {
      capabilities: {
        // listChanged: the server re-advertises its tool set after
        // snow_core_instances_reload, so a user who runs `./snowarch instance add` in
        // another terminal does not have to restart Claude Code (S-02, CONFIRMED).
        tools: { listChanged: true },
        resources: {},
      },
    }
  );

  const tools = collectToolCatalog();

  // ─── Tools ──────────────────────────────────────────────────────────────────

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    // Unconfigured, only the five tools that need no instance are advertised. Offering the
    // full catalogue would put ~397 tools in front of a session where every one of them
    // fails — the list is the honest statement of what can actually be called.
    const advertised = advertisedTools();
    setAdvertisedCount(advertised.length);
    return { tools: advertised };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    logger.info(`Tool called: ${name}`);

    try {
      const tool = tools.find(t => t.name === name);
      if (!tool) {
        throw new ServiceNowError(`Unknown tool: ${name}`, 'UNKNOWN_TOOL');
      }

      // A tool that exists but needs an instance we do not have. UNKNOWN_TOOL is reserved
      // for names that exist in no configuration — telling a user their tool does not exist,
      // when it does and is merely unusable right now, sends them looking in the wrong place.
      if (instanceManager.loadedCount() === 0
        && !(CORE_TOOLS_UNCONFIGURED as readonly string[]).includes(name)) {
        throw new ServiceNowError(NO_INSTANCE_MESSAGE, 'NO_INSTANCE_CONFIGURED');
      }

      const instanceName = (args as Record<string, unknown>)?.['instance'] as string | undefined;
      const { routeToolInvocation } = await import('./tools/index.js');

      // The instance-free core tools are dispatched WITHOUT resolving a client or entering a
      // runtime. Resolving one first would throw "no instance is configured" from inside the
      // very tools whose job is to report that — which is what happened the first time this
      // ran, and is why the probe exercises them rather than trusting the guard above.
      if ((CORE_TOOLS_UNCONFIGURED as readonly string[]).includes(name)) {
        const result = await routeToolInvocation(null as never, name, args || {});
        return { content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }] };
      }

      const client = instanceManager.getClient(instanceName);

      // Every tool call runs inside the addressed instance's runtime, so the ~166 require*()
      // gates read THAT instance's effective flags rather than process.env. One switch, and
      // writes refuse on prod while the same call succeeds on the PDI — no second process.
      const runtime = instanceManager.getEntry(instanceName?.toLowerCase()) ?? instanceManager.current();
      const result = await runWithInstance(runtime, () => routeToolInvocation(client, name, args || {}));

      return {
        content: [
          {
            type: 'text' as const,
            text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      logger.error(`Tool execution error: ${name}`, error);

      if (error instanceof ServiceNowError) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error: ${error.message} (Code: ${error.code})`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: `Error executing tool: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  });

  // ─── Resources (@ mentions) ─────────────────────────────────────────────────

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return { resources: getResources() };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    try {
      if (instanceManager.loadedCount() === 0) {
        throw new ServiceNowError(NO_INSTANCE_MESSAGE, 'NO_INSTANCE_CONFIGURED');
      }
      const client = instanceManager.getClient();
      // Resource reads need an instance for the same reason tool calls do.
      const result = await runWithInstance(instanceManager.current(), () => readResource(client, uri));
      const mimeType = uri === 'servicenow://query-syntax' ? 'text/markdown' : 'application/json';
      const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);

      return {
        contents: [{ uri, mimeType, text }],
      };
    } catch (error) {
      logger.error(`Resource read error: ${uri}`, error);
      throw error;
    }
  });

  return server;
}

// ─── Start ────────────────────────────────────────────────────────────────────

/**
 * The startup line (01 §5). It names the store that was used and the instances that came
 * out of it, so "which file configured this" is answerable from the log rather than by
 * guessing. Every path is masked — a log reaches screen shares and bug reports.
 *
 * It does NOT exit when nothing is configured. The old guard exited on missing env vars,
 * which is wrong now that a store can configure the server, and unconfigured start is
 * ARC-04-S04's subject; until then the server runs and individual tools fail with a
 * reason, which is more useful than a process that vanishes.
 */
function logStartup(): void {
  // Reload before reporting. `instanceManager` is a module-level singleton, and ESM
  // evaluates imports BEFORE the importing module's body — so its constructor ran before
  // the dotenv branch above. Without this, a store or instance named by SNOW_ENV_FILE
  // would be read too late to matter, and the startup line would describe a state the
  // server is not in. Caught by tests/store/dotenv.test.ts.
  const report = instanceManager.reload();
  const version = getPackageVersion();
  // The ADVERTISED count, not the catalogue's. Unconfigured, five tools can be called and
  // 397 exist; printing 397 beside "mode: unconfigured" invites the reader to try one.
  const toolCount = advertisedTools().length;

  for (const note of report.notes) logger.info(note);
  for (const err of report.configErrors) logger.error(`${err.code}: ${err.message}`);
  for (const w of report.warnings) logger.warn(w);
  for (const nl of report.notLoaded) logger.warn(`instance ${nl.label} not loaded — ${nl.code}: ${nl.message}`);

  if (process.platform === 'win32') logger.info('file modes: ACL-inherited (Windows)');
  if (report.path && isUnderCloudSyncFolder(report.path)) {
    logger.warn('store is under a cloud-sync folder; 0600 does not prevent synchronisation');
  }

  const where = report.path ? `${report.source} (${report.path})` : `${report.source}`;
  const instances = report.loaded.length > 0
    ? report.loaded.map((label) => {
        const e = instanceManager.getEntry(label);
        return `${label} (${e?.environment ?? '?'}, ${e?.preset ?? '?'}${label === instanceManager.getCurrentName() ? ', default' : ''})`;
      }).join(', ')
    : 'none';
  const mode = report.loaded.length > 0 ? '' : ' — mode: unconfigured';
  logger.info(`snowarch ${version} — store: ${where} — instances: ${instances}${mode} — tools: ${toolCount}`);
}

async function main() {
  logStartup();
  const server = createServer();

  // The reload tool re-advertises the tool set through the server it is running in; giving
  // it a callback keeps tools/status.ts free of an import back into the server module.
  setFullCatalogueSize(collectToolCatalog().length);
  setAdvertisedCount(advertisedTools().length);
  setToolListChangedNotifier(() => { void server.sendToolListChanged(); });

  // stdio is the only transport. The HTTP/SSE transport, the REST API, the A2A routes
  // and the dashboard were removed with D-03 item 6; nothing else can be mounted here.
  const transport = new StdioServerTransport();

  // Exit when the client closes the transport (stdin EOF), with code 0.
  //
  // A signal is deliberately NOT used: Windows has no SIGTERM delivery, and on POSIX a
  // process killed by an unhandled SIGTERM reports a signal rather than an exit code — so a
  // test asserting "exited 0" could not pass on either. ARC-04-S10 adds the audit-writer
  // flush at this point; until then there is nothing buffered to lose.
  transport.onclose = () => {
    logger.info('stdio closed by the client — exiting');
    process.exit(0);
  };

  await server.connect(transport);
  logger.info(`snowarch ${getPackageVersion()} ready on stdio (${advertisedTools().length} tools advertised, `
    + `${collectToolCatalog().length} in the catalogue)`);
}

main().catch((error) => {
  logger.error('Server startup failed', error);
  process.exit(1);
});
