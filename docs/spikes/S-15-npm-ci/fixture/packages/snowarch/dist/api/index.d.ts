/**
 * REST API routes — HTTP wrapper around MCP tools, resources, and prompts.
 *
 * Endpoints:
 *   GET  /api/tools          — List all available tools
 *   GET  /api/tools/:name    — Get single tool schema
 *   POST /api/tool           — Execute a tool
 *   GET  /api/resources      — List MCP resources
 *   GET  /api/resource       — Read a resource by URI (?uri=...)
 *   GET  /api/prompts        — List prompts
 *   GET  /api/instances      — List configured ServiceNow instances
 *   POST /api/instances/switch — Switch active instance
 */
import type { ServiceNowMcpHttpServer } from '../transport/http-server.js';
export declare function mountApiRoutes(httpServer: ServiceNowMcpHttpServer): void;
//# sourceMappingURL=index.d.ts.map