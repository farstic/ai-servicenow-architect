const LEVEL_ORDER = { error: 0, warn: 1, info: 2, debug: 3 };
function activeLevel() {
    const lvl = (process.env.SNOW_LOG_LEVEL || process.env.LOG_LEVEL || 'info').toLowerCase();
    return LEVEL_ORDER[lvl] ?? LEVEL_ORDER.info;
}
const SENSITIVE_KEY = /pass(word)?|secret|token|authorization|api[_-]?key|client[_-]?secret|credential|cookie/i;
/**
 * A credential-shaped string, wherever it appears.
 *
 * Scrubbing by KEY alone missed the case that matters most: `{ headers: { Authorization:
 * 'Basic <base64>' } }` is caught by the key, but the same string reached the log unscrubbed
 * whenever it arrived under an innocent key — inside an array, an error's `config`, a nested
 * request dump. The value is recognisable on its own, so it is matched on its own.
 */
const CREDENTIAL_VALUE = /^(Basic|Bearer)\s+\S+/i;
function redactValue(value, depth = 0) {
    if (value === null || value === undefined)
        return value;
    if (value instanceof Error)
        return value; // keep message/stack intact
    if (depth > 6)
        return value;
    if (Array.isArray(value))
        return value.map((v) => redactValue(v, depth + 1));
    if (typeof value === 'string')
        return CREDENTIAL_VALUE.test(value) ? '***' : value;
    if (typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)) {
            out[k] = SENSITIVE_KEY.test(k) ? '***' : redactValue(v, depth + 1);
        }
        return out;
    }
    return value;
}
function scrub(data) {
    // On unless explicitly turned off. `!== 'false'` rather than `=== 'true'`: the previous form
    // meant an unset variable — the normal case — printed credentials.
    return process.env.REDACT_SENSITIVE_DATA !== 'false' ? redactValue(data) : data;
}
function emit(level, tag, message, data) {
    if (LEVEL_ORDER[level] > activeLevel())
        return;
    if (data === undefined || data === '') {
        console.error(`[${tag}] ${message}`);
    }
    else {
        console.error(`[${tag}] ${message}`, scrub(data));
    }
}
export const logger = {
    debug(message, data) { emit('debug', 'DEBUG', message, data); },
    info(message, data) { emit('info', 'INFO', message, data); },
    warn(message, data) { emit('warn', 'WARN', message, data); },
    error(message, error) { emit('error', 'ERROR', message, error); },
};
