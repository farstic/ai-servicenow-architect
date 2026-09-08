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

export function createServer(): Server {
  const server = new Server(
    {
      name: 'snowarch',
      version: getPackageVersion(),
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  const tools = collectToolCatalog();

  // ─── Tools ──────────────────────────────────────────────────────────────────

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: collectToolCatalog() };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    logger.info(`Tool called: ${name}`);

    try {
      const tool = tools.find(t => t.name === name);
      if (!tool) {
        throw new ServiceNowError(`Unknown tool: ${name}`, 'UNKNOWN_TOOL');
      }

      const instanceName = (args as Record<string, unknown>)?.['instance'] as string | undefined;
      const client = instanceManager.getClient(instanceName);

      const { routeToolInvocation } = await import('./tools/index.js');
      const result = await routeToolInvocation(client, name, args || {});

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
      const client = instanceManager.getClient();
      const result = await readResource(client, uri);
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
  const toolCount = collectToolCatalog().length;

  for (const note of report.notes) logger.info(note);
  for (const err of report.configErrors) logger.error(`${err.code}: ${err.message}`);
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
  // stdio is the only transport. The HTTP/SSE transport, the REST API, the A2A routes
  // and the dashboard were removed with D-03 item 6; nothing else can be mounted here.
  await server.connect(new StdioServerTransport());
  logger.info(`snowarch ${getPackageVersion()} ready on stdio (${collectToolCatalog().length} tools)`);
}

main().catch((error) => {
  logger.error('Server startup failed', error);
  process.exit(1);
});
