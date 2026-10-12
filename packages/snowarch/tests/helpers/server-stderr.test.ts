// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
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
 */
describe('ARC-09-C132 — the server-stderr helper', () => {
  it('waits for the end-of-startup line, however slowly the module reaches it', async () => {
    const dir = trackTempDir(mkdtempSync(join(tmpdir(), 'snowarch-c132-')));
    try {
      const slow = join(dir, 'slow-server.mjs');
      writeFileSync(slow, "setTimeout(() => console.error('[INFO] licence: Licence: missing'), 2000);\n"
        + 'setInterval(() => {}, 1000);\n');
      const stderr = await serverStderr(slow, {}, dir);
      expect(stderr).toContain('[INFO] licence: Licence: missing');
    } finally {
      removeTempDir(dir);
    }
  }, 40_000);
});
