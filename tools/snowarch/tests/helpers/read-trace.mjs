// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
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

/**
 * ARC-11-C141 — and every path it `stat`s, to a file of its own (`SNOWARCH_TEST_STAT_TRACE`), for a test that counts
 * them: the hook's stat key stats each covered file instead of reading it. Kept apart from the reads, so no case that
 * asks "was this read" can be answered by a `stat`.
 */
const statOut = process.env.SNOWARCH_TEST_STAT_TRACE;
if (statOut) {
  const statted = [];
  for (const name of ['statSync', 'lstatSync']) {
    const original = fs[name];
    fs[name] = function traced(path, ...rest) {
      if (typeof path === 'string' || path instanceof URL) statted.push(String(path));
      return original.call(this, path, ...rest);
    };
  }
  syncBuiltinESMExports();
  const write = fs.writeFileSync;
  process.on('exit', () => write(statOut, `${statted.join('\n')}\n`));
}

/** The `--import` flag that preloads this file, for `NODE_OPTIONS`. */
export const readTraceImport = () => `--import=${new URL(import.meta.url).href}`;
