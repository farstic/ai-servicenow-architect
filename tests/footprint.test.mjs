// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C259 — the footprint gate (`scripts/ci/footprint.mjs`, ci.yml's "footprint (production install)") counts the same
 * megabyte as the rest of the product, 10^6 bytes. It had no test of its own: its figure on develop's last run, "15.3 MB (limit
 * 80)", was 16.04 MB in the unit the install page uses, and a gate whose unit is not the page's is a limit nobody can compare.
 * The limit stays 80: the unit moves, and the figure with it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';

const SCRIPT = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'scripts', 'ci', 'footprint.mjs');
const footprint = (dir, limit = '80') => spawnSync(process.execPath, [SCRIPT, limit, dir], { encoding: 'utf8' });

test('ARC-09-C259 — a tree of 1,500,000 bytes is 1.5 MB, and the line says what it summed', (t) => {
  const dir = tempDir('c259-footprint-', t);
  writeFileSync(join(dir, 'a.js'), Buffer.alloc(1_500_000, 120));
  const r = footprint(dir);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'node_modules: 1.5 MB (limit 80) — summed file content, 1 files');
});

test('ARC-09-C259 — the limit is in the same megabytes: 81,000,000 bytes is over 80, and 79,000,000 is not', (t) => {
  const over = tempDir('c259-footprint-over-', t);
  writeFileSync(join(over, 'a.js'), Buffer.alloc(81_000_000, 120));
  const failed = footprint(over);
  assert.equal(failed.status, 1, 'a tree of 81 MB passed an 80 MB limit (2^20-byte megabytes: 77.2)');
  assert.match(failed.stderr, /footprint: 81\.0 MB exceeds the 80 MB limit/);
  const under = tempDir('c259-footprint-under-', t);
  writeFileSync(join(under, 'a.js'), Buffer.alloc(79_000_000, 120));
  const passed = footprint(under);
  assert.equal(passed.status, 0, passed.stderr);
  assert.match(passed.stdout, /^node_modules: 79\.0 MB \(limit 80\)/);
});
