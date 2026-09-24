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

import { diff, EXPECTED_FAIL_ON_RUNNERS, normalise, PLATFORMS, snapshotPath, WINDOWS_DIFFERS,
  wouldDrop }
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

/**
 * ARC-08-C30, the fix-up — A SNAPSHOT'S COUNTS ARE ITS OWN ROWS, TALLIED.
 *
 * I added E-29's row to all three snapshots and not its count. `summary.ok` stayed 26 while the
 * rows said 27, and nothing here noticed: **every `bootstrap` cell on all three operating systems
 * failed** — ubuntu 20/22/24, macos 20/22/24, windows 20/22/24 and no-gitbash — with
 * `doctor-snapshot: linux differs … summary.ok: 26 → 27`. Ten cells for one arithmetic slip that a
 * single local assertion can catch.
 *
 * WHY THE SNAPSHOT IS EDITED RATHER THAN REGENERATED, which is the thing that made the slip
 * possible and is worth writing down: these files encode a CI RUNNER, not a developer's machine.
 * Regenerating `snapshot-darwin.json` from a properly design-only bootstrapped clone on this
 * machine produced **eleven** differing rows, not one — `E-00 fail → ok` (a runner has no Claude
 * Code CLI), `E-23 ok → warn` (this machine has stale registrations), `E-27 skip → ok`,
 * `E-28 skip → warn` (network), and six `SV-* skip → ok` (a runner has not installed dependencies
 * before the doctor). So a derived one-row edit is the correct operation and `--write` from a
 * laptop is not; what a derived edit needs is this guard, because the reason to prefer it — the
 * environment is not reproducible here — is exactly the reason nothing else can check it.
 */
test('each snapshot\'s summary is the tally of its own rows', () => {
  for (const platform of PLATFORMS) {
    const snapshot = load(platform);
    const tally = { ok: 0, warn: 0, fail: 0, skip: 0 };
    for (const check of snapshot.checks) {
      assert.ok(check.status in tally, `${platform}: ${check.id} has status "${check.status}"`);
      tally[check.status] += 1;
    }
    for (const status of Object.keys(tally)) {
      assert.equal(snapshot.summary[status], tally[status],
        `${platform}: summary.${status} says ${snapshot.summary[status]} and the rows say `
        + `${tally[status]} — a row was added or changed without its count`);
    }
    // `fixable` counts FINDINGS that can be repaired, not rows that could be — `summariseMerged`
    // adds one only when the result is `fail` or `warn` AND fixable. My first version of this
    // assertion counted every row declaring `fixable: true` and said `0 !== 8`; the semantics were
    // in `checks/index.mjs:179` and I had inferred them instead of reading them.
    const repairable = snapshot.checks
      .filter((c) => c.fixable && (c.status === 'fail' || c.status === 'warn')).length;
    assert.equal(snapshot.summary.fixable, repairable,
      `${platform}: summary.fixable says ${snapshot.summary.fixable} and the repairable findings `
      + `are ${repairable}`);
  }
});

// ─── `--write` refuses a stale capture ─────────────────────────────────────────────────────────
//
// THE TRAP THIS CLOSES, exactly as it was found. `docs/CONTRIBUTING.md` spells the snapshot recipe
// as `node scripts/ci/doctor-snapshot.mjs --in doctor.json --write`, and a **committed** `doctor.json`
// sat at the repository root from 2026-09-11 to 2026-09-24: a real local run from the 10th, added in
// the same commit as this script, read by nothing. Six ways it was a leftover, and one way it was
// dangerous — that command SUCCEEDED from it instead of failing for a missing input. Measured against
// the darwin snapshot on the day it was found:
//
//     E-00: status fail → ok          E-29: in the snapshot, MISSING from this run
//     E-21: status ok → fail          E-28: in the snapshot, MISSING from this run
//     E-27: status skip → ok          SV-09: in the snapshot, MISSING from this run
//
// So `--write` would have deleted three checks added after the capture and inverted three statuses,
// silently. Removing the file disarms it once; this refuses it for ever, which is the half that
// survives the next person running `./snowarch doctor --json > doctor.json` and forgetting when.
//
// The stale report is BUILT FROM THE COMMITTED SNAPSHOT here rather than committed as a fixture —
// committing a stale laptop capture to test the guard against stale laptop captures would be the
// defect wearing the test's clothes, and a pasted fixture would rot the moment a check is added.

test('C33: --write refuses a report missing checks the snapshot carries, and names them', () => {
  const platform = present[0];
  const snapshot = load(platform);
  // IN THE SNAPSHOT'S OWN ORDER, which is the order `diff` reports in and the order a reader
  // comparing the two files scans. Deriving it from the snapshot rather than typing the three names
  // is also what keeps this case honest if one of them is ever retired.
  const wanted = new Set(['E-28', 'E-29', 'SV-09']);
  const dropped = snapshot.checks.map((c) => c.id).filter((id) => wanted.has(id));
  assert.ok(dropped.length >= 1, 'none of the three ids is in the snapshot — the case is vacuous');

  // The stale capture's shape: the same run, minus the checks that did not exist when it was taken.
  const stale = { ...snapshot, checks: snapshot.checks.filter((c) => !dropped.includes(c.id)) };
  assert.deepEqual(wouldDrop(snapshot, stale), dropped,
    'the guard does not name exactly the checks a --write would delete');
});

test('C33: a NEW check is not a reason to refuse — writing it in is what --write is for', () => {
  const snapshot = load(present[0]);
  const withNew = { ...snapshot,
    checks: [...snapshot.checks, { id: 'E-99', status: 'ok', fixable: false }] };
  assert.deepEqual(wouldDrop(snapshot, withNew), [],
    'a report carrying a new check was refused, which would block every added check');
  // ...and the reverse direction is still caught, so the asymmetry is the point rather than an oversight.
  assert.deepEqual(wouldDrop(withNew, snapshot), ['E-99']);
});

test('C33: an identical report drops nothing', () => {
  const snapshot = load(present[0]);
  assert.deepEqual(wouldDrop(snapshot, snapshot), []);
});
