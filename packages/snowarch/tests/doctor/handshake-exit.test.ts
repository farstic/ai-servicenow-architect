// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
import { expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { trackTempDir } from '../helpers/server-child.js';

/**
 * ARC-09-C130 — the handshake against a server that exits without reading its stdin.
 *
 * `handshake()` wrote to the server child's stdin and listened for neither an `error` on that stream nor the child's
 * `exit`. A server that had stopped reading turned the next write into an EPIPE with no listener: an uncaught
 * exception, which killed a doctor run, and in the package suite failed vitest's run with "1 unhandled error" after
 * every test had passed (#414, and #437's release dry run under a full gate's load).
 *
 * THE STAND-IN IS DETERMINISTIC. It closes its stdin before it answers `initialize`, so the handshake's next write, the
 * `notifications/initialized` it sends on that answer, goes to a pipe nobody reads: an EPIPE every time, not a race.
 * Then it exits with code 3.
 *
 * THE HANDSHAKE RUNS IN A CHILD, from the build. An uncaught error there ends that process with the EPIPE on its stderr,
 * so the case tells "the handshake reported the exit" from "the process died". Run in-process, the runner would catch
 * the error for the whole run, not for this case.
 */
const here = dirname(fileURLToPath(import.meta.url));
const CHECKS = pathToFileURL(resolve(here, '../../dist/doctor/checks.js')).href;
const scratch = trackTempDir(mkdtempSync(join(tmpdir(), 'handshake-exit-')));

it('ARC-09-C130 — a server that exits without reading its stdin is reported by its exit code, and nothing is uncaught', () => {
  const standIn = join(scratch, 'exits.mjs');
  writeFileSync(standIn, [
    "import { closeSync } from 'node:fs';",
    'closeSync(0);',
    'const answer = { jsonrpc: "2.0", id: 1, result: { protocolVersion: "2024-11-05", capabilities: {}, serverInfo: { name: "stand-in", version: "0" } } };',
    'process.stdout.write(`${JSON.stringify(answer)}\\n`);',
    'setTimeout(() => process.exit(3), 300);',
    '',
  ].join('\n'));
  const driver = join(scratch, 'driver.mjs');
  writeFileSync(driver, [
    `import { handshake } from ${JSON.stringify(CHECKS)};`,
    `const h = await handshake(${JSON.stringify(standIn)}, 10_000);`,
    'process.stdout.write(JSON.stringify(h));',
    '',
  ].join('\n'));

  const r = spawnSync(process.execPath, [driver], { encoding: 'utf8', timeout: 30_000 });
  expect(r.stderr, 'the handshake left an uncaught error').not.toMatch(/EPIPE|Error:/);
  expect(r.status, r.stderr).toBe(0);
  const h = JSON.parse(r.stdout) as { tools: string[]; capabilities: unknown; error?: string };
  expect(h.error).toBe('the server exited with code 3 before the handshake finished');
  expect(h.tools).toEqual([]);
});
