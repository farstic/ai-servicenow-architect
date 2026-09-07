/**
 * Shared HTTP server for SSE/Streamable HTTP transport, REST API, and dashboard.
 * Used when TRANSPORT=sse or TRANSPORT=http.
 */
import { type Server as HttpServer } from 'http';
import { type AuthRequest } from './auth-middleware.js';
export interface HttpServerOptions {
    port: number;
    host: string;
    corsOrigin: string;
    allowedOrigins: string[];
}
type Middleware = (req: AuthRequest, res: any, next: () => void) => void;
type RouteHandler = (req: AuthRequest, res: any) => void | Promise<void>;
/**
 * Lightweight Express-like HTTP server without the Express dependency.
 * Supports routing, CORS, auth middleware, and JSON body parsing.
 */
export declare class ServiceNowMcpHttpServer {
    private options;
    private routes;
    private middlewares;
    private server;
    private corsOrigin;
    private allowedOrigins;
    constructor(options: HttpServerOptions);
    /** Register a route. */
    route(method: string, path: string, handler: RouteHandler, requiresAuth?: boolean): void;
    /** Convenience methods. */
    get(path: string, handler: RouteHandler, requiresAuth?: boolean): void;
    post(path: string, handler: RouteHandler, requiresAuth?: boolean): void;
    delete(path: string, handler: RouteHandler, requiresAuth?: boolean): void;
    /** Add a global middleware. */
    use(middleware: Middleware): void;
    /** Get the underlying HTTP server (for SSE/WebSocket upgrades). */
    getHttpServer(): HttpServer;
    /** Start listening. */
    start(): Promise<void>;
    /** Stop the server. */
    stop(): Promise<void>;
    private handleRequest;
}
/** Create an HTTP server with defaults from env vars. */
export declare function createHttpServer(): ServiceNowMcpHttpServer;
export {};
//# sourceMappingURL=http-server.d.ts.map