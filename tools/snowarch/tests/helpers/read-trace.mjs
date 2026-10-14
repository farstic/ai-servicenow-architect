// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-11-C7 — every path a child process reads through `fs`, for a test that must show a file was NOT read.
 *
 * Preloaded with `--import` (`readTraceImport()` gives the flag, a URL so Windows takes it), it wraps `readFileSync`,
 * `openSync` and `readdirSync` on the builtin, syncs the ESM bindings so a module that imported them by name calls
 * the wrapper too, and writes one path a line to the file named by `SNOWARCH_TEST_READ_TRACE` when the process exits.
 * Module loading does not go through these, so a module's own source never appears: what appears is what the
 * program chose to read.
 */
import { createRequire, syncBuiltinESMExports } from 'node:module';

const require = createRequire(import.meta.url);
const fs = require('node:fs');
const out = process.env.SNOWARCH_TEST_READ_TRACE;

if (out) {
  const seen = [];
  for (const name of ['readFileSync', 'openSync', 'readdirSync']) {
    const original = fs[name];
    fs[name] = function traced(path, ...rest) {
      if (typeof path === 'string' || path instanceof URL) seen.push(String(path));
      return original.call(this, path, ...rest);
    };
  }
  syncBuiltinESMExports();
  const write = fs.writeFileSync;
  process.on('exit', () => write(out, `${seen.join('\n')}\n`));
}

/** The `--import` flag that preloads this file, for `NODE_OPTIONS`. */
export const readTraceImport = () => `--import=${new URL(import.meta.url).href}`;
