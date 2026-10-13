// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-11-C7 — the instrument the regression proof reads, `scripts/ci/hook-compare.mjs`. STRUCTURE only: what it reads
// from its arguments and from the hook, how it ranks, and what it calls over the margin. A duration is never asserted
// here (ARC-09-C24); the figures are the instrument's output, recorded in the C7 row.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compare, parseArgs, pathOf, quantile } from '../scripts/ci/hook-compare.mjs';

const SCRIPT = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'scripts', 'ci', 'hook-compare.mjs');

test('ARC-11-C7 — hook-compare reads two refs or more, five rounds of ten by default, and refuses the rest', () => {
  assert.deepEqual(parseArgs(['v1', 'v2']), { refs: ['v1', 'v2'], rounds: 5, runs: 10, marginMs: null, keep: false });
  assert.deepEqual(parseArgs(['a', 'b', 'c', '--rounds', '3', '--runs', '4', '--margin-ms', '25', '--keep']),
    { refs: ['a', 'b', 'c'], rounds: 3, runs: 4, marginMs: 25, keep: true });
  assert.match(parseArgs(['v1']).error, /two refs or more/);
  assert.match(parseArgs(['v1', 'v2', '--runs', '0']).error, /--runs takes a whole number of at least 1/);
  assert.match(parseArgs(['v1', 'v2', '--margin-ms', 'x']).error, /--margin-ms takes a whole number of at least 0/);
  assert.match(parseArgs(['v1', 'v2', '--fast']).error, /unknown option --fast/);
});

test('ARC-11-C7 — the quantiles are nearest rank, on any order of input', () => {
  const ten = [7, 1, 10, 4, 2, 9, 3, 8, 6, 5];
  assert.deepEqual([0, 0.5, 0.9, 1].map((p) => quantile(ten, p)), [1, 5, 9, 10]);
  assert.equal(quantile([42], 0.5), 42);
  assert.equal(quantile([], 0.5), null);
  assert.deepEqual(ten.slice(0, 3), [7, 1, 10], 'the input is not sorted in place');
});

test('ARC-11-C7 — the path is the one the hook names on its phases line, and none when it names none', () => {
  const rerun = 'banner-phases: path=rerun total=141 ms · cache-read+decision 6 · doctor 136 · render 0\n';
  assert.equal(pathOf(rerun), 'rerun');
  assert.equal(pathOf('banner-phases: path=cache total=6 ms · cache-read+decision 6 · render 0'), 'cache');
  assert.equal(pathOf(''), null);
  assert.equal(pathOf(null), null);
});

test('ARC-11-C7 — each later install is compared with the first, and over the margin on either path is over', () => {
  const at = (ref, cache, rerun) => ({ ref, times: { cache, rerun } });
  const base = at('v2.0.13', [30, 34, 38], [160, 170, 180]);
  const within = compare([base, at('rc', [31, 35, 39], [180, 195, 200])], 25);
  assert.deepEqual(within,
    { base: 'v2.0.13', rows: [{ ref: 'rc', delta: { cache: 1, rerun: 25 }, over: false }], over: false });
  const over = compare([base, at('rc', [31, 35, 39], [180, 196, 200])], 25);
  assert.deepEqual([over.rows[0].delta.rerun, over.rows[0].over, over.over], [26, true, true]);
  const cacheOver = compare([base, at('rc', [60, 61, 62], [150, 160, 170])], 25);
  assert.deepEqual([cacheOver.rows[0].delta, cacheOver.over], [{ cache: 27, rerun: -10 }, true]);
  assert.equal(compare([base, at('rc', [90, 91, 92], [900, 901, 902])]).over, false, 'no margin, no verdict');
});

test('ARC-11-C7 — a usage error exits 2 before anything is cloned', () => {
  const r = spawnSync(process.execPath, [SCRIPT, 'v1'], { encoding: 'utf8' });
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /^hook-compare: name two refs or more/);
  assert.match(r.stderr, /usage: node scripts\/ci\/hook-compare\.mjs <ref> <ref>/);
  assert.equal(r.stdout, '');
});
