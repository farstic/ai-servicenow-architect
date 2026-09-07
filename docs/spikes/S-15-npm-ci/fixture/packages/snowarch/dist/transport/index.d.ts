/**
 * Transport factory — selects and configures the MCP transport based on TRANSPORT env var.
 *
 * Supported transports:
 *   stdio (default) — Standard I/O (child process pipes)
 *   sse             — Server-Sent Events over HTTP
 *   http            — Streamable HTTP (MCP 2025-03-26 spec)
 */
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { type ServiceNowMcpHttpServer } from './http-server.js';
export type TransportType = 'stdio' | 'sse' | 'http';
export declare function getTransportType(): TransportType;
/**
 * Connect the MCP server to the selected transport.
 * Returns the HTTP server instance if using SSE/HTTP transport (for mounting API routes).
 */
export declare function connectTransport(server: Server, toolCount: number, createServerFn?: () => Server): Promise<ServiceNowMcpHttpServer | null>;
/** Host/Origin allowlists for DNS-rebinding protection, from bind config + ALLOWED_ORIGINS env. */
export declare function getOriginPolicy(): {
    allowedHosts: string[];
    allowedOrigins: string[];
};
export { ServiceNowMcpHttpServer } from './http-server.js';
//# sourceMappingURL=index.d.ts.map