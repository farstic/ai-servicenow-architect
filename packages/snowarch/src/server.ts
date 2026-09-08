#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import dotenv from 'dotenv';
import { instanceManager } from './servicenow/instances.js';
import { collectToolCatalog } from './tools/index.js';
import { getResources, readResource } from './resources/index.js';
import { logger } from './utils/logging.js';
import { ServiceNowError } from './utils/errors.js';
import { getPackageVersion } from './utils/version.js';

dotenv.config();

// Require at least one instance to be configured
const hasLegacy = !!process.env.SERVICENOW_INSTANCE_URL;
const hasMulti = Object.keys(process.env).some(k => /^SN_INSTANCE_[A-Z0-9_]+_URL$/.test(k));
const hasConfig = !!process.env.SN_INSTANCES_CONFIG;
if (!hasLegacy && !hasMulti && !hasConfig) {
  logger.error('No ServiceNow instance configured. Set SERVICENOW_INSTANCE_URL or SN_INSTANCES_CONFIG.');
  process.exit(1);
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

async function main() {
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
