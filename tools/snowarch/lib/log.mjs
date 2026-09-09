// ARC-06-S02 — the only way this CLI writes anything, so redaction cannot be forgotten.
import { appendFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { redact } from './redact.mjs';
import { root } from './config.mjs';

const KEEP = 10;

/** `yyyymmdd-hhmmss`, local time — a log an operator finds by eye, not by parsing. */
function stamp(now = new Date()) {
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}`
    + `-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
}

/**
 * A logger for one command run.
 *
 * The file is opened LAZILY: a `version` that prints one line should not leave a log behind, and a
 * command that never writes should not create `.local/logs` on a read-only checkout. Mode 0600 on
 * POSIX because a log of a wizard run can contain an instance URL and a username — redacted, but
 * still nobody else's business.
 */
export function createLogger({ command, quiet = false, verbose = false, json = false,
  logRoot = root, now = new Date(), out = process.stdout, err = process.stderr } = {}) {
  let file = null;
  const dir = join(logRoot, '.local', 'logs');

  const toFile = (line) => {
    if (file === null) {
      try {
        mkdirSync(dir, { recursive: true, mode: 0o700 });
        file = join(dir, `${command}-${stamp(now)}.log`);
        appendFileSync(file, '', { mode: 0o600 });
        rotate();
      } catch { file = false; return; }        // a read-only checkout logs to the console only
    }
    if (file === false) return;
    try { appendFileSync(file, `${line}\n`); } catch { /* never fail a command over its own log */ }
  };

  /** Keep the last KEEP logs. Oldest by name, which sorts by time because the stamp does. */
  const rotate = () => {
    const logs = readdirSync(dir).filter((f) => f.endsWith('.log')).sort();
    for (const f of logs.slice(0, Math.max(0, logs.length - KEEP))) {
      rmSync(join(dir, f), { force: true });
    }
  };

  // EVERY line, console and file alike, goes through `redact` here. There is no second path.
  const write = (stream, prefix, message) => {
    const line = redact(`${prefix}${message}`);
    toFile(line);
    // `--json` keeps stdout parseable: prose goes to stderr so a caller can read the object.
    if (!quiet) (json ? err : stream).write(`${line}\n`);
  };

  return {
    step: (m) => write(out, '', m),
    ok: (m) => write(out, '', m),
    warn: (m) => write(err, 'warning: ', m),
    fail: (m) => write(err, 'error: ', m),
    note: (m) => write(err, '', m),
    debug: (m) => { if (verbose) write(err, 'debug: ', m); },
    /** The object a `--json` command prints. Never redacted-into: it is data, not prose. */
    json: (value) => { toFile('(json output)'); out.write(`${JSON.stringify(value, null, 2)}\n`); },
    get logFile() { return file || null; },
  };
}
