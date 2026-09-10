// ARC-08-S11 — the doctor's answer, per check, held to a snapshot.
//
// Eleven ARCs name a doctor check as their proof. A check that quietly stops running takes the
// evidence for somebody else's story with it, and nothing else in CI notices: a doctor reporting
// `28 ok` where it used to report `29 ok` still exits 0, still says `0 fail`, still goes green.
//
// Two halves. Here: the normaliser is proved on fixtures, and the three committed snapshots are
// held to the registry — so a new check id fails THIS test, on every cell, naming the id. In the
// bootstrap cells: `scripts/ci/doctor-snapshot.mjs` compares a real design-only run against the
// snapshot for that platform, which is the half that needs an install to exist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { diff, EXPECTED_FAIL_ON_RUNNERS, normalise, PLATFORMS, snapshotPath, WINDOWS_DIFFERS }
  from '../../scripts/ci/doctor-snapshot.mjs';
import { engineChecks } from '../../tools/snowarch/lib/doctor/checks/index.mjs';
import { REAL_ROOT } from './helpers/tree.mjs';

const REPORT = JSON.parse(readFileSync(
  join(REAL_ROOT, 'tests/fixtures/doctor/status-design.json'), 'utf8'));

const load = (p) => JSON.parse(readFileSync(snapshotPath(p, REAL_ROOT), 'utf8'));
const present = PLATFORMS.filter((p) => existsSync(snapshotPath(p, REAL_ROOT)));

test('the normaliser keeps the answer and drops everything that legitimately moves', () => {
  const n = normalise(REPORT);
  assert.deepEqual(Object.keys(n).sort(), ['checks', 'mode', 'schema', 'summary']);
  assert.deepEqual(Object.keys(n.checks[0]).sort(), ['fixable', 'id', 'status']);
  // The volatile fields, named: a snapshot holding any of these fails on a correct run, which
  // trains everyone to update it without reading it — and then it is a chore, not a guard.
  const text = JSON.stringify(n);
  for (const field of ['ranAt', 'durationMs', 'contractSha', 'modeLine', 'engine', 'detail',
    'remedy', 'title', 'node']) {
    assert.ok(!text.includes(field), `${field} survived normalisation`);
  }
  assert.equal(n.checks.length, REPORT.checks.length, 'a check was lost in normalisation');
});

test('normalising is stable — the same report twice is the same snapshot', () => {
  assert.deepEqual(normalise(REPORT), normalise(JSON.parse(JSON.stringify(REPORT))));
  assert.deepEqual(diff(normalise(REPORT), normalise(REPORT)), []);
});

test('the diff names the check, not just the fact of a difference', () => {
  const base = normalise(REPORT);
  const changed = { ...base, checks: base.checks.map((c) => (c.id === 'E-01' ? { ...c, status: 'fail' } : c)) };
  assert.deepEqual(diff(base, changed), ['E-01: status ok → fail']);

  // The one this test exists for: a check id nobody added to the snapshots.
  const added = { ...base, checks: [...base.checks, { id: 'E-99', status: 'ok', fixable: false }] };
  const lines = diff(base, added);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^E-99: NEW check, not in any snapshot/);
  assert.match(lines[0], /snapshot-linux\.json/, 'the message does not say where to add it');

  const removed = { ...base, checks: base.checks.filter((c) => c.id !== 'E-05') };
  assert.deepEqual(diff(base, removed), ['E-05: in the snapshot, MISSING from this run']);
});

test('all three platforms have a snapshot', () => {
  // The tolerance in the CI script — "no snapshot for this platform yet" passes, so a NEW platform
  // can be bootstrapped from an artifact — is safe only because of this assertion. One of the
  // three going missing fails here, on every cell, rather than passing quietly in the cell that
  // needed it.
  assert.deepEqual(present, [...PLATFORMS],
    `missing: ${PLATFORMS.filter((p) => !present.includes(p)).join(', ')} — `
    + 'produce it with scripts/ci/doctor-snapshot.mjs --write on that platform, or from its artifact');
});

test('every check in the registry is in every snapshot, and nothing else is', () => {
  // AC 2, and the reason this test runs everywhere rather than only after a bootstrap: adding a
  // check id without updating the snapshots is red HERE, with the id named, on the first cell.
  const registry = engineChecks().map((c) => c.id).sort();
  for (const platform of present) {
    const ids = load(platform).checks.map((c) => c.id).sort();
    const missing = registry.filter((id) => !ids.includes(id));
    const extra = ids.filter((id) => !registry.includes(id));
    assert.deepEqual(missing, [], `snapshot-${platform}.json is missing: ${missing.join(', ')}`);
    assert.deepEqual(extra, [], `snapshot-${platform}.json has ids the registry does not: ${extra.join(', ')}`);
  }
});

test('Windows differs from the POSIX platforms only in the documented rows', () => {
  if (present.length < PLATFORMS.length) return;   // the previous test already reported it
  const [linux, darwin, win32] = ['linux', 'darwin', 'win32'].map(load);
  // linux and darwin are the same install answering the same questions: any difference between
  // them is a finding, not a platform.
  assert.deepEqual(diff(linux, darwin), [], 'linux and darwin disagree — neither is "the POSIX one"');
  const differing = diff(linux, win32).map((l) => l.split(':')[0]);
  const undocumented = differing.filter((id) => !WINDOWS_DIFFERS.includes(id));
  assert.deepEqual(undocumented, [],
    `Windows differs in rows nobody documented: ${undocumented.join(', ')} — `
    + 'either it is a bug on Windows, or WINDOWS_DIFFERS needs the row and the reason');
  console.log(`    windows differs in: ${differing.length ? differing.join(', ') : '(nothing)'}`);
});

test('the snapshots are design-only, and fail only where the runner explains it', () => {
  // A snapshot of a broken install makes the broken install the standard, so what may fail here is
  // closed: exactly the checks a hosted runner is expected to fail, and nothing else. E-00 is the
  // list — a runner has no Claude Code — and the snapshots were taken on runners, which is also
  // why they are the honest record of what the platforms answer rather than of what I expected.
  for (const platform of present) {
    const s = load(platform);
    assert.equal(s.mode, 'design-only', `${platform}: the snapshot is not a design-only install`);
    assert.equal(s.schema, 1);
    const failing = s.checks.filter((c) => c.status === 'fail').map((c) => c.id);
    assert.deepEqual(failing, [...EXPECTED_FAIL_ON_RUNNERS],
      `${platform}: the snapshot records failures the runner does not explain`);
    assert.equal(s.summary.fail, EXPECTED_FAIL_ON_RUNNERS.length);
    assert.equal(s.summary.warn, 0,
      `${platform}: a WARN in the snapshot — a design-only install should have nothing to warn about`);
  }
});
