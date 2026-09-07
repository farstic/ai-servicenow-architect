/**
 * Bearer token authentication middleware for HTTP/SSE transport.
 * Validates SNMCP_API_KEY when set; skips auth in dev mode (no key configured).
 */
import type { IncomingMessage, ServerResponse } from 'http';
export interface AuthRequest extends IncomingMessage {
    authenticated?: boolean;
}
/**
 * Express-compatible middleware that validates Bearer tokens.
 * If SNMCP_API_KEY is not set, all requests pass through (dev mode).
 */
export declare function authMiddleware(req: AuthRequest, res: ServerResponse, next: () => void): void;
/** Check if auth is required (API key is configured). */
export declare function isAuthRequired(): boolean;
//# sourceMappingURL=auth-middleware.d.ts.map