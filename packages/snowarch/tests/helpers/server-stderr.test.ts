// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { removeTempDir, trackTempDir } from './server-child.js';
import { serverStderr } from './server-stderr.js';

/**
 * ARC-09-C132 — a spawned-server test reads the line it waits for, however slowly the child starts.
 *
 * `tests/store/masking.test.ts` read a child's stderr at a fixed 1.5 s. On test (windows-latest, node 20), run
 * 38280270992's first attempt, the child took 5333 ms, against 1599 to 2075 ms on every other run of the same
 * case, and the case read an empty stderr where the product writes STORE_NOT_FOUND at start. A module that logs
 * its end-of-startup line after 2 s stands in for that slow start.
 *
 * The stand-ins behave as the server does at stdin's end: they exit (server.ts:395). A helper that returned while
 * its child still ran failed every Windows cell of run 38286365851, where a directory a live child holds cannot be
 * removed: "EPERM, Permission denied" on node 24, "EBUSY: resource busy or locked, rmdir" on node 22.
 */
/** A stand-in for the server: `body`, then an exit at stdin's end, as the server's transport does. */
const standIn = (body: string): string => `${body}\nprocess.stdin.on('end', () => process.exit(0));\nprocess.stdin.resume();\n`;
describe('ARC-09-C132 — the server-stderr helper', () => {
  it('waits for the end-of-startup line, however slowly the module reaches it', async () => {
    const dir = trackTempDir(mkdtempSync(join(tmpdir(), 'snowarch-c132-')));
    try {
      const slow = join(dir, 'slow-server.mjs');
      writeFileSync(slow, standIn("setTimeout(() => console.error('[INFO] licence: Licence: missing'), 2000);"));
      const started = Date.now();
      const stderr = await serverStderr(slow, {}, dir);
      expect(stderr).toContain('[INFO] licence: Licence: missing');
      // At the line, not at the 30 s cap: a helper that waited out its cap would pass the line check too.
      expect(Date.now() - started).toBeLessThan(15_000);
    } finally {
      removeTempDir(dir);
    }
  }, 40_000);

  it('returns what there is when the line never comes, at the timeout, rather than hanging', async () => {
    const dir = trackTempDir(mkdtempSync(join(tmpdir(), 'snowarch-c132-')));
    try {
      const silent = join(dir, 'silent-server.mjs');
      writeFileSync(silent, standIn("console.error('[INFO] store: none');"));
      const started = Date.now();
      const stderr = await serverStderr(silent, {}, dir, { timeout: 3000 });
      expect(stderr).toContain('[INFO] store: none');
      expect(stderr).not.toMatch(/\[INFO\] licence: /);
      expect(Date.now() - started).toBeLessThan(20_000);
    } finally {
      removeTempDir(dir);
    }
  }, 40_000);

  it('returns only once the child has exited, so the case can remove the directory it ran in', async () => {
    const dir = trackTempDir(mkdtempSync(join(tmpdir(), 'snowarch-c132-')));
    try {
      const marker = join(dir, 'exited');
      const module = join(dir, 'server.mjs');
      writeFileSync(module, standIn("import { writeFileSync } from 'node:fs';\n"
        + "process.on('exit', () => writeFileSync(process.env.C132_MARKER, 'exited'));\n"
        + "console.error('[INFO] licence: Licence: missing');"));
      const stderr = await serverStderr(module, { C132_MARKER: marker }, dir);
      expect(stderr).toContain('[INFO] licence: ');
      // The child ran its own exit: it was ended the way a client ends the server, and the helper waited for it.
      expect(existsSync(marker)).toBe(true);
    } finally {
      removeTempDir(dir);
    }
  }, 40_000);
});
