/**
 * Shared HTTP server for SSE/Streamable HTTP transport, REST API, and dashboard.
 * Used when TRANSPORT=sse or TRANSPORT=http.
 */
import { createServer } from 'http';
import { authMiddleware } from './auth-middleware.js';
import { logger } from '../utils/logging.js';
/**
 * Lightweight Express-like HTTP server without the Express dependency.
 * Supports routing, CORS, auth middleware, and JSON body parsing.
 */
export class ServiceNowMcpHttpServer {
    options;
    routes = [];
    middlewares = [];
    server = null;
    corsOrigin;
    allowedOrigins;
    constructor(options) {
        this.options = options;
        this.corsOrigin = options.corsOrigin;
        this.allowedOrigins = options.allowedOrigins;
    }
    /** Register a route. */
    route(method, path, handler, requiresAuth = true) {
        this.routes.push({ method: method.toUpperCase(), path, handler, requiresAuth });
    }
    /** Convenience methods. */
    get(path, handler, requiresAuth = true) { this.route('GET', path, handler, requiresAuth); }
    post(path, handler, requiresAuth = true) { this.route('POST', path, handler, requiresAuth); }
    delete(path, handler, requiresAuth = true) { this.route('DELETE', path, handler, requiresAuth); }
    /** Add a global middleware. */
    use(middleware) {
        this.middlewares.push(middleware);
    }
    /** Get the underlying HTTP server (for SSE/WebSocket upgrades). */
    getHttpServer() {
        if (!this.server)
            throw new Error('Server not started');
        return this.server;
    }
    /** Start listening. */
    async start() {
        this.server = createServer(async (req, res) => {
            // CORS — reflect a request Origin only when it's allow-listed; otherwise fall back to the
            // configured CORS_ORIGIN (default '*'). Avoids blindly echoing arbitrary origins.
            const origin = Array.isArray(req.headers.origin) ? req.headers.origin[0] : req.headers.origin;
            if (origin && this.allowedOrigins.includes(origin)) {
                res.setHeader('Access-Control-Allow-Origin', origin);
                res.setHeader('Vary', 'Origin');
            }
            else {
                res.setHeader('Access-Control-Allow-Origin', this.corsOrigin);
            }
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, mcp-session-id');
            res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');
            res.setHeader('Access-Control-Max-Age', '86400');
            // Handle preflight
            if (req.method === 'OPTIONS') {
                res.writeHead(204);
                res.end();
                return;
            }
            try {
                await this.handleRequest(req, res);
            }
            catch (error) {
                logger.error('HTTP request error', error);
                if (!res.headersSent) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Internal server error' }));
                }
            }
        });
        return new Promise((resolve) => {
            this.server.listen(this.options.port, this.options.host, () => {
                logger.info(`HTTP server listening on ${this.options.host}:${this.options.port}`);
                resolve();
            });
        });
    }
    /** Stop the server. */
    async stop() {
        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(() => resolve());
            }
            else {
                resolve();
            }
        });
    }
    async handleRequest(req, res) {
        const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
        const pathname = url.pathname;
        const method = req.method?.toUpperCase() || 'GET';
        // Find matching route
        const route = this.routes.find(r => {
            if (r.method !== method)
                return false;
            return matchPath(r.path, pathname);
        });
        if (!route) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not found' }));
            return;
        }
        // Auth check
        if (route.requiresAuth) {
            const authPassed = await new Promise((resolve) => {
                authMiddleware(req, res, () => resolve(true));
                // If authMiddleware ended the response, resolve false
                if (res.writableEnded)
                    resolve(false);
            });
            if (!authPassed)
                return;
        }
        // Parse JSON body for POST/PUT/PATCH
        if (['POST', 'PUT', 'PATCH'].includes(method)) {
            try {
                req.body = await parseJsonBody(req);
            }
            catch {
                req.body = {};
            }
        }
        // Parse URL params
        const params = extractParams(route.path, pathname);
        req.params = params;
        req.query = Object.fromEntries(url.searchParams);
        await route.handler(req, res);
    }
}
/** Parse JSON body from request stream. */
function parseJsonBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => {
            const body = Buffer.concat(chunks).toString();
            if (!body)
                return resolve({});
            try {
                resolve(JSON.parse(body));
            }
            catch {
                reject(new Error('Invalid JSON body'));
            }
        });
        req.on('error', reject);
    });
}
/** Simple path matching with :param support. */
function matchPath(pattern, pathname) {
    const patternParts = pattern.split('/');
    const pathParts = pathname.split('/');
    if (patternParts.length !== pathParts.length)
        return false;
    return patternParts.every((p, i) => p.startsWith(':') || p === pathParts[i]);
}
/** Extract named params from path. */
function extractParams(pattern, pathname) {
    const params = {};
    const patternParts = pattern.split('/');
    const pathParts = pathname.split('/');
    patternParts.forEach((p, i) => {
        if (p.startsWith(':')) {
            params[p.slice(1)] = pathParts[i];
        }
    });
    return params;
}
/** Create an HTTP server with defaults from env vars. */
export function createHttpServer() {
    const port = process.env.PORT || '3000';
    const allowedOrigins = new Set([`http://localhost:${port}`, `http://127.0.0.1:${port}`]);
    for (const o of (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean))
        allowedOrigins.add(o);
    return new ServiceNowMcpHttpServer({
        port: parseInt(port, 10),
        host: process.env.HOST || '0.0.0.0',
        corsOrigin: process.env.CORS_ORIGIN || '*',
        allowedOrigins: [...allowedOrigins],
    });
}
//# sourceMappingURL=http-server.js.map