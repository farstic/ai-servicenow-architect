// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C259 — one decimal size unit, and the guard that keeps it one.
 *
 * The product counted a megabyte two ways (2^20 bytes in the bootstrap's `[docs]` line, B00, B04, install-metrics and the footprint
 * gate; 10^6 in `docs status`, docs-real and the install page) and printed GiB as "GB" in the two launchers: the same working tree
 * read 279 MB in the bootstrap and 293 MB on the page. `tools/snowarch/lib/size.mjs` is the one definition, 10^6 and 10^9, as the
 * architect ruled on 2026-11-01. Two tests keep it that way:
 *
 *  1. No byte divisor is written anywhere else under `tools/`, `scripts/ci` or in the launchers: not `1024 * 1024`, `1024 ** n`,
 *     `2 ** 20`, `1048576`, `1073741824`, and not a division by `1e6`, `1e9`, `1_000_000` or `1_000_000_000`. A byte count is
 *     turned into a number of megabytes by `megabytes()`, and compared to a floor by `MB` or `GB`. The three lines that turn
 *     nanoseconds into milliseconds, and any `maxBuffer`, are the only allowances.
 *  2. The disk floor is the same number of bytes in `B00.mjs`, `bootstrap.sh` and `bootstrap.ps1`, each read from its own file.
 *     The launchers run before Node is known to exist, so they cannot import the module and hold the floor as a named number.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DISK_FULL, DISK_SPARSE } from '../tools/snowarch/lib/steps/B00.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const SCANNED = ['tools', 'scripts/ci', 'bootstrap.sh', 'bootstrap.ps1'];
const LITERAL = /1024\s*\*\*\s*[234]|1024\s*\*\s*1024|\b2\s*\*\*\s*(?:20|30)\b|\b1_?048_?576\b|\b1_?073_?741_?824\b/;
const DIVISION = /\/\s*\(?\s*(?:1e6|1e9|1_?000_?000(?:_?000)?)\b/;
const SIZE_MODULE = 'tools/snowarch/lib/size.mjs';
/** The only nanoseconds-to-milliseconds lines, by file and exact text: a time, not a size. */
const NS_TO_MS = new Map([
  ['scripts/ci/banner-timing.mjs', 'return { ms: Number(process.hrtime.bigint() - started) / 1e6, r };'],
  ['scripts/ci/hook-compare.mjs', 'return { ms: Number(process.hrtime.bigint() - t0) / 1e6, took: pathOf(r.stderr) };'],
  ['tools/snowarch/hooks/session-start.mjs', 'marks.push([name, Number(nowNs - last) / 1e6]);'],
]);

/** The lines of a file that spell a binary megabyte or gigabyte, or divide by a decimal one, outside the allowances. */
function byteDivisors(rel, text) {
  if (rel === SIZE_MODULE) return [];
  return text.split('\n').flatMap((line, i) => {
    const t = line.trim();
    if (!LITERAL.test(t) && !DIVISION.test(t)) return [];
    if (/\bmaxBuffer\b/.test(t) || NS_TO_MS.get(rel) === t) return [];
    return [`${rel}:${i + 1}: ${t.slice(0, 110)}`];
  });
}

test('ARC-09-C259 — no byte divisor is written outside size.mjs: the instrument flags each shape, passes each allowance, and finds none in the tree', () => {
  // The instrument first. A scan that cannot flag a shape finds none, and "none" would then prove nothing.
  for (const shape of ['const mb = (b) => Math.round(b / (1024 * 1024));', 'const GIB = 1024 ** 3;', 'const mb = bytes / 1048576;',
    'x = Math.round(b / 1e6);', 'const g = b / 1_000_000_000;', 'if (free < 1073741824) die();']) {
    assert.equal(byteDivisors('x.mjs', shape).length, 1, `the scan does not flag: ${shape}`);
  }
  for (const allowed of ['execFileSync(\'git\', a, { maxBuffer: 64 * 1024 * 1024 });', 'const n = 5 / 2;', 'const s = Math.round(ms / 100) / 10;']) {
    assert.equal(byteDivisors('x.mjs', allowed).length, 0, `the scan flags an allowance: ${allowed}`);
  }
  for (const [rel, line] of NS_TO_MS) {
    assert.equal(byteDivisors(rel, line).length, 0, `${rel}: the nanosecond line is flagged`);
    assert.equal(byteDivisors('elsewhere.mjs', line).length, 1, 'the nanosecond allowance holds for its own file and no other');
  }
  assert.equal(byteDivisors(SIZE_MODULE, 'export const MB = 1e6; const x = b / 1e6;').length, 0, 'size.mjs is the one place a divisor may be');

  const files = execFileSync('git', ['ls-files', '-z', '--', ...SCANNED], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 })
    .split('\0').filter((f) => /\.(mjs|js|ts|sh|ps1|cmd|yml)$/.test(f));
  assert.ok(files.length > 150, `the scan found only ${files.length} files: git did not list the tree`);
  const found = files.flatMap((rel) => byteDivisors(rel, read(rel)));
  assert.deepEqual(found, [], `a size is divided or spelled outside tools/snowarch/lib/size.mjs (use megabytes(), MB or GB):\n${found.join('\n')}`);
});

test('ARC-09-C259 — the disk floor is the same bytes in B00.mjs, bootstrap.sh and bootstrap.ps1, each read from its own file, and the architecture page names it', () => {
  const sh = (text) => /^DISK_FLOOR_BYTES=(\d+)\s*$/m.exec(text)?.[1];
  const ps = (text) => /^\$DiskFloorBytes = (\d+)\s*$/m.exec(text)?.[1];
  const launcherSh = read('bootstrap.sh');
  const launcherPs = read('bootstrap.ps1');
  assert.ok(sh(launcherSh), 'bootstrap.sh holds no DISK_FLOOR_BYTES=<bytes>: its floor is not written as a number of bytes');
  assert.ok(ps(launcherPs), 'bootstrap.ps1 holds no $DiskFloorBytes = <bytes>: its floor is not written as a number of bytes');
  assert.equal(Number(sh(launcherSh)), DISK_SPARSE, 'bootstrap.sh refuses at another number of bytes than B00 does');
  assert.equal(Number(ps(launcherPs)), DISK_SPARSE, 'bootstrap.ps1 refuses at another number of bytes than B00 does');
  // The control: a launcher whose floor was changed, as it was before this row (1 GiB), is not the floor, so this test can fail.
  assert.notEqual(Number(sh(launcherSh.replace(/^DISK_FLOOR_BYTES=\d+/m, 'DISK_FLOOR_BYTES=1073741824'))), DISK_SPARSE);
  assert.notEqual(Number(ps(launcherPs.replace(/^\$DiskFloorBytes = \d+/m, '$DiskFloorBytes = 1073741824'))), DISK_SPARSE);
  // The page that says where each step refuses, in the same unit.
  assert.ok(read('docs/ARCHITECTURE.md').includes(`less than ${DISK_SPARSE / 1e9} GB free (${DISK_FULL / 1e9} GB for the full corpus)`),
    'docs/ARCHITECTURE.md does not say the floors in gigabytes of 10^9 bytes');
});
