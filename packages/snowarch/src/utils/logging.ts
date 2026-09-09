/**
 * Structured stderr logger.
 *
 * - SNOW_LOG_LEVEL, then LOG_LEVEL (error | warn | info | debug, default: info) gates which
 *   messages are emitted. SNOW_LOG_LEVEL is what `.mcp.json` passes (01 §5); LOG_LEVEL stays as a
 *   fallback so an existing environment keeps working.
 * - REDACT_SENSITIVE_DATA deep-scrubs sensitive keys (passwords, tokens, secrets, …) and
 *   credential-shaped STRING VALUES from logged data before output. It is on by default
 *   (`!== 'false'`), and was opt-in (`=== 'true'`) until ARC-04-S10: a default that has to be
 *   switched on protects nobody who did not already know to switch it on, and the people most
 *   likely to paste a log into a ticket are the ones who never set it.
 *   `REDACT_SENSITIVE_DATA=false` opts out for local debugging. That is dangerous by design —
 *   it prints credentials — and is documented as such.
 * All output goes to stderr so stdout stays a clean JSON-RPC stream for the MCP stdio transport.
 */
type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const LEVEL_ORDER: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };

function activeLevel(): number {
  const lvl = (process.env.SNOW_LOG_LEVEL || process.env.LOG_LEVEL || 'info').toLowerCase();
  return LEVEL_ORDER[lvl as LogLevel] ?? LEVEL_ORDER.info;
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

function redactValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Error) return value; // keep message/stack intact
  if (depth > 6) return value;
  if (Array.isArray(value)) return value.map((v) => redactValue(v, depth + 1));
  if (typeof value === 'string') return CREDENTIAL_VALUE.test(value) ? '***' : value;
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? '***' : redactValue(v, depth + 1);
    }
    return out;
  }
  return value;
}

function scrub(data: unknown): unknown {
  // On unless explicitly turned off. `!== 'false'` rather than `=== 'true'`: the previous form
  // meant an unset variable — the normal case — printed credentials.
  return process.env.REDACT_SENSITIVE_DATA !== 'false' ? redactValue(data) : data;
}

function emit(level: LogLevel, tag: string, message: string, data?: unknown): void {
  if (LEVEL_ORDER[level] > activeLevel()) return;
  if (data === undefined || data === '') {
    console.error(`[${tag}] ${message}`);
  } else {
    console.error(`[${tag}] ${message}`, scrub(data));
  }
}

export const logger = {
  debug(message: string, data?: unknown): void { emit('debug', 'DEBUG', message, data); },
  info(message: string, data?: unknown): void { emit('info', 'INFO', message, data); },
  warn(message: string, data?: unknown): void { emit('warn', 'WARN', message, data); },
  error(message: string, error?: unknown): void { emit('error', 'ERROR', message, error); },
};
