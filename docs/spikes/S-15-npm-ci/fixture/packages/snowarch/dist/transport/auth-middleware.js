/**
 * Express-compatible middleware that validates Bearer tokens.
 * If SNMCP_API_KEY is not set, all requests pass through (dev mode).
 */
export function authMiddleware(req, res, next) {
    const apiKey = process.env.SNMCP_API_KEY;
    // No API key configured — dev mode, skip auth
    if (!apiKey) {
        req.authenticated = true;
        return next();
    }
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing or invalid Authorization header. Use: Bearer <SNMCP_API_KEY>' }));
        return;
    }
    const token = authHeader.slice(7);
    if (token !== apiKey) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid API key' }));
        return;
    }
    req.authenticated = true;
    next();
}
/** Check if auth is required (API key is configured). */
export function isAuthRequired() {
    return !!process.env.SNMCP_API_KEY;
}
//# sourceMappingURL=auth-middleware.js.map