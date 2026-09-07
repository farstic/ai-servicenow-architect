/**
 * A2A Protocol routes — mount on the HTTP server.
 *
 * Endpoints:
 *   GET  /.well-known/agent.json    — Agent card (no auth)
 *   POST /a2a/tasks/send            — Send a task (synchronous)
 *   POST /a2a/tasks/sendSubscribe   — Send a task (SSE streaming)
 *   GET  /a2a/tasks/:taskId         — Get task status
 *   POST /a2a/tasks/:taskId/cancel  — Cancel a task
 */
import type { ServiceNowMcpHttpServer } from '../transport/http-server.js';
export declare function mountA2ARoutes(httpServer: ServiceNowMcpHttpServer): void;
//# sourceMappingURL=index.d.ts.map