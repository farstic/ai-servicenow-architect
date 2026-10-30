// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
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
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { diff, EXPECTED_FAIL_ON_RUNNERS, normalise, PLATFORMS, snapshotPath, WINDOWS_DIFFERS,
  wouldDrop }
  from '../../scripts/ci/doctor-snapshot.mjs';
import * as compare from '../../scripts/ci/doctor-snapshot.mjs';
import { engineChecks } from '../../tools/snowarch/lib/doctor/checks/index.mjs';
import { hostChecks } from '../../tools/snowarch/lib/doctor/checks/host.mjs';
import { TIMED_OUT } from '../../tools/snowarch/lib/probe-net.mjs';
import { tempDir } from '../../tools/snowarch/tests/helpers/temp.mjs';
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
  // closed: exactly the checks a hosted runner is expected to fail, and nothing else. E-00 and E-31 are the
  // list — a runner has no Claude Code and no licence — and the snapshots were taken on runners, which is also
  // why they are the honest record of what the platforms answer rather than of what I expected.
  for (const platform of present) {
    const s = load(platform);
    assert.equal(s.mode, 'design-only', `${platform}: the snapshot is not a design-only install`);
    assert.equal(s.schema, 1);
    const failing = s.checks.filter((c) => c.status === 'fail').map((c) => c.id);
    assert.deepEqual(failing, [...EXPECTED_FAIL_ON_RUNNERS],
      `${platform}: the snapshot records failures the runner does not explain`);
    assert.equal(s.summary.fail, EXPECTED_FAIL_ON_RUNNERS.length);
    // ARC-11-C1 allowed one warning, E-31's, while a missing licence was information. From ARC-11-C6 step 5 it is a
    // FAIL the runner explains (EXPECTED_FAIL_ON_RUNNERS), so a design-only install carries no warning at all.
    assert.deepEqual(s.checks.filter((c) => c.status === 'warn').map((c) => c.id), [],
      `${platform}: a WARN in the snapshot — a design-only install should have nothing to warn about`);
    assert.equal(s.summary.warn, 0);
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

// ─── …and the REFUSAL AT THE CALL SITE, which is where the trap actually lives ─────────────────
//
// The three cases above drive `wouldDrop()` and prove the helper. They do NOT prove the command:
// neutralising the `die` in `doctor-snapshot.mjs --write` left them 8/8 green, and the thing a
// committed `doctor.json` armed was the COMMAND — `--write` from a stale capture, silently deleting
// checks. The only measurement of that was taken by hand (`-19 +4` on snapshot-darwin.json), and a
// finding that can only be measured by hand is a test that has not been written yet.
//
// So this spawns the real CLI. `--root` and `--platform` keep every byte inside a temp tree: a test
// that exercised `--write` against the committed fixtures would be the hazard it is testing for.

/** A temp root with one snapshot in it, plus a stale report that is missing `drop` ids. */
function staleTree(t, drop) {
  const root = tempDir('snowarch-snapwrite-', t);
  mkdirSync(join(root, 'tests/fixtures/doctor'), { recursive: true });
  const snapshot = normalise(REPORT);
  const target = join(root, 'tests/fixtures/doctor/snapshot-linux.json');
  writeFileSync(target, `${JSON.stringify(snapshot, null, 2)}\n`);
  const stale = { ...REPORT, checks: REPORT.checks.filter((c) => !drop.includes(c.id)) };
  const inPath = join(root, 'stale.json');
  writeFileSync(inPath, JSON.stringify(stale));
  return { root, target, inPath, before: readFileSync(target, 'utf8') };
}

const runCli = (args) => spawnSync(process.execPath,
  [join(REAL_ROOT, 'scripts/ci/doctor-snapshot.mjs'), ...args],
  { encoding: 'utf8', cwd: REAL_ROOT });

test('C33: the CLI refuses --write from a stale report, and writes nothing', (t) => {
  const ids = normalise(REPORT).checks.map((c) => c.id);
  assert.ok(ids.length >= 4, 'the report fixture is too small for this case to mean anything');
  const drop = ids.slice(0, 3);

  const { root, target, inPath, before } = staleTree(t, drop);
  const r = runCli(['--in', inPath, '--write', '--root', root, '--platform', 'linux']);

  assert.notEqual(r.status, 0, `--write accepted a stale report: ${r.stdout}${r.stderr}`);
  const out = `${r.stdout}${r.stderr}`;
  assert.match(out, /is missing 3 check\(s\) the snapshot has/);
  for (const id of drop) assert.ok(out.includes(id), `the refusal does not name ${id}`);
  assert.match(out, /Nothing was written/);
  // THE BYTES. The message could say anything; what matters is that the snapshot did not move.
  assert.equal(readFileSync(target, 'utf8'), before, 'the snapshot was written despite the refusal');
});

test('C33: --allow-dropping-checks means it, and only then', (t) => {
  const ids = normalise(REPORT).checks.map((c) => c.id);
  const drop = ids.slice(0, 3);
  const { root, target, inPath, before } = staleTree(t, drop);

  const r = runCli(['--in', inPath, '--write', '--root', root, '--platform', 'linux',
    '--allow-dropping-checks']);
  assert.equal(r.status, 0, `the escape hatch did not work: ${r.stdout}${r.stderr}`);
  const after = readFileSync(target, 'utf8');
  assert.notEqual(after, before, 'nothing was written with the removal allowed');
  const written = JSON.parse(after);
  for (const id of drop) {
    assert.equal(written.checks.some((c) => c.id === id), false, `${id} survived a deliberate drop`);
  }
});

test('C33: a report that drops nothing is written without the flag', (t) => {
  // The other direction, so the refusal is not merely "--write never works": a complete report is
  // written exactly as before, which is what every CI run does.
  const { root, target, inPath, before } = staleTree(t, []);
  const r = runCli(['--in', inPath, '--write', '--root', root, '--platform', 'linux']);
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
  assert.match(`${r.stdout}${r.stderr}`, /wrote .*snapshot-linux\.json/);
  assert.equal(readFileSync(target, 'utf8'), before, 'a complete report changed the snapshot');
});

// ── ARC-09-C253 — a check that asks origin may get no answer, and the compare does not call that a difference ───────────────
// On e7664b67 `bootstrap (windows-latest, node 24)` failed this compare with `E-28: status ok → warn`, `summary.ok 29 → 28` and
// `summary.warn 0 → 1`, and the job's own report said "origin did not answer within 15 s". E-28 lists origin's tags; one unanswered
// `ls-remote` on a hosted runner turned a green PR red, and merge-gated needs every cell. The architect's ruling of 2026-10-29: keep
// the network path (only this job exercises it on each OS), and name an E-28 that got no answer as NOT COMPARABLE, with a test for both
// sides: an `ok` to `warn` that is that no-answer passes, and any other change in E-28 still fails.

const E28 = hostChecks().find((c) => c.id === 'E-28');
const realClock = () => Date.now();
const lsRemote = (tags) => tags.map((tag) => `0000000000000000000000000000000000000000\trefs/tags/${tag}`).join('\n');

/** E-28 as the doctor reports it, run for real against a git that answers each command it is given: its result under its id. */
async function e28Entry(t, { fail = null, tags = [], localTag = null } = {}) {
  const exec = (_cmd, args) => {
    if (args.includes('ls-remote')) {
      if (fail) throw Object.assign(new Error('git failed'), fail);
      return lsRemote(tags);
    }
    if (args.includes('describe')) return localTag ? `${localTag}\n` : '';
    if (args.includes('rev-parse')) return 'abc1234\n';
    return '';
  };
  const r = await E28.run({ root: tempDir('snowarch-c253-', t), flags: { noNetwork: false }, now: realClock, exec });
  return { id: 'E-28', fixable: false, ...r };
}

/** A full report shaped like the platform's snapshot, with `entry` in place of its check of that id and the summary tallied again. */
function rawFrom(snapshot, entry) {
  const checks = snapshot.checks.map((c) => (c.id === entry.id ? entry : { ...c, detail: 'a detail' }));
  const summary = { ok: 0, warn: 0, fail: 0, skip: 0, fixable: 0 };
  // `fixable` counts the FINDINGS that can be repaired, not the rows that could be (summariseMerged)
  for (const c of checks) { summary[c.status] += 1; if (c.fixable === true && (c.status === 'fail' || c.status === 'warn')) summary.fixable += 1; }
  return { schema: snapshot.schema, mode: snapshot.mode, summary, checks };
}

const NO_ANSWER = [
  ['a timeout', { code: TIMED_OUT, signal: 'SIGTERM', status: null, stderr: '' }],
  ['a name that does not resolve', { status: 128, stderr: 'fatal: unable to access the remote: Could not resolve host\n' }],
  ['a refusal git words in its own way', { status: 128, stderr: 'warning: something first\nerror: something nothing names\n' }],
];

test('ARC-09-C253 — E-28 with no answer from origin is not a difference, and the compare says it was not compared', async (t) => {
  const base = load('linux');
  assert.equal(base.checks.find((c) => c.id === 'E-28').status, 'ok', 'the premise: the snapshot holds E-28 ok');
  // the control: E-28 answered, and ok, is the snapshot
  const answered = await e28Entry(t, { tags: ['v9.0.0'] });
  assert.equal(answered.status, 'ok', answered.detail);
  assert.deepEqual(diff(base, normalise(rawFrom(base, answered))), []);
  for (const [name, fail] of NO_ANSWER) {
    const silent = await e28Entry(t, { fail });
    assert.equal(silent.status, 'warn', `${name}: ${silent.detail}`);
    const n = normalise(rawFrom(base, silent));
    assert.deepEqual(diff(base, n), [], `${name}: E-28 with no answer was called a difference (${silent.detail})`);
    const notes = compare.notices(base, n);
    assert.equal(notes.length, 1, `${name}: the compare did not say what it did not compare`);
    assert.match(notes[0], /^E-28: not compared/);
    assert.match(notes[0], /origin did not answer/);
  }
});

test('ARC-09-C253 — any other change in E-28 still fails, and so does the same shape in another check', async (t) => {
  const base = load('linux');
  // a release that is available: a warn that names its tag, so it is a finding about the install and not about the network
  const available = await e28Entry(t, { tags: ['v9.1.0'], localTag: 'v9.0.0' });
  assert.equal(available.status, 'warn', available.detail);
  assert.deepEqual(diff(base, normalise(rawFrom(base, available))), ['E-28: status ok → warn', 'summary.ok: 29 → 28', 'summary.warn: 0 → 1']);
  assert.deepEqual(compare.notices(base, normalise(rawFrom(base, available))), [], 'a run that compared E-28 said it did not');
  for (const [name, entry] of [
    ['crashed', { id: 'E-28', status: 'fail', fixable: false, detail: 'check crashed' }],
    ['skipped', { id: 'E-28', status: 'skip', fixable: false, detail: '--no-network' }],
    ['the cached form of "available", which also has refreshed:false and names the tag', { id: 'E-28', status: 'warn', fixable: false, data: { latestTag: 'v9.1.0', refreshed: false } }],
    // the no-answer data on a status that is not a warn is not the no-answer: the compare excuses a warn and nothing else
    ['a fail that carries the no-answer data', { id: 'E-28', status: 'fail', fixable: false, data: { remote: 'origin', refreshed: false } }],
    ['a skip that carries the no-answer data', { id: 'E-28', status: 'skip', fixable: false, data: { remote: 'origin', refreshed: false } }],
    ['a warn with data of another shape', { id: 'E-28', status: 'warn', fixable: false, data: { remote: 'origin' } }],
    ['a warn with no data', { id: 'E-28', status: 'warn', fixable: false }]]) {
    assert.notDeepEqual(diff(base, normalise(rawFrom(base, entry))), [], `E-28 ${name} passed the compare`);
  }
  // only E-28 is excused: the no-answer shape on another check is a difference, named by its id
  const silent = await e28Entry(t, { fail: NO_ANSWER[0][1] });
  const first = base.checks[0].id;
  const raw = rawFrom(base, { id: first, status: 'warn', fixable: false, data: silent.data });
  const lines = diff(base, normalise(raw));
  assert.ok(lines.some((l) => l.startsWith(`${first}: status`)), `${first} with the no-answer shape was excused: ${lines}`);
});

test('ARC-09-C253 — the no-answer shape is the one E-28 gives for every way origin fails to answer, and for no other warn', async (t) => {
  // Tied to the check itself, not to a copy of its data in this file: if E-28's warn for an unanswered origin stops carrying the
  // shape the compare reads, or a warn that names a tag starts to, this fails.
  const unanswered = (entry) => compare.normalise(rawFrom(load('linux'), entry)).notComparable?.includes('E-28') === true;
  for (const [name, fail] of NO_ANSWER) assert.equal(unanswered(await e28Entry(t, { fail })), true, name);
  assert.equal(unanswered(await e28Entry(t, { tags: ['v9.1.0'], localTag: 'v9.0.0' })), false, 'an available release');
  assert.equal(unanswered(await e28Entry(t, { tags: ['v9.0.0'] })), false, 'an answer that is ok');
  assert.equal(unanswered(await e28Entry(t, { tags: [] })), false, 'an origin that advertises no release');
});

/** A temp root holding the real linux snapshot, and a report to compare with it. */
function compareTree(t, raw) {
  const root = tempDir('snowarch-c253-cli-', t);
  mkdirSync(join(root, 'tests/fixtures/doctor'), { recursive: true });
  const target = join(root, 'tests/fixtures/doctor/snapshot-linux.json');
  writeFileSync(target, readFileSync(snapshotPath('linux', REAL_ROOT)));
  const inPath = join(root, 'doctor.json');
  writeFileSync(inPath, JSON.stringify(raw));
  return { root, inPath, target, before: readFileSync(target, 'utf8') };
}

test('ARC-09-C253 — the CLI passes a run whose E-28 got no answer and says so; it fails the available release; --write refuses the first', async (t) => {
  const base = load('linux');
  const silent = await e28Entry(t, { fail: NO_ANSWER[0][1] });
  const a = compareTree(t, rawFrom(base, silent));
  const ok = runCli(['--in', a.inPath, '--root', a.root, '--platform', 'linux']);
  assert.equal(ok.status, 0, `${ok.stdout}${ok.stderr}`);
  assert.match(ok.stdout, /matches/);
  assert.match(ok.stdout, /E-28: not compared/, 'a pass that did not look at E-28 did not say so');
  // and the job summary, which a reader opens before the log, says it too
  const summaryFile = join(a.root, 'summary.md');
  const withSummary = spawnSync(process.execPath, [join(REAL_ROOT, 'scripts/ci/doctor-snapshot.mjs'), '--in', a.inPath, '--root', a.root, '--platform', 'linux', '--summary'],
    { encoding: 'utf8', cwd: REAL_ROOT, env: { ...process.env, GITHUB_STEP_SUMMARY: summaryFile } });
  assert.equal(withSummary.status, 0, `${withSummary.stdout}${withSummary.stderr}`);
  assert.match(readFileSync(summaryFile, 'utf8'), /not compared.*E-28|E-28.*not compared/s, 'the job summary does not say E-28 was not compared');
  // the same run, taken as a snapshot, is refused: a snapshot is never written from a check that was not answered
  const w = runCli(['--in', a.inPath, '--write', '--root', a.root, '--platform', 'linux']);
  assert.notEqual(w.status, 0, `--write accepted a run in which E-28 was not answered: ${w.stdout}${w.stderr}`);
  assert.match(`${w.stdout}${w.stderr}`, /E-28/);
  assert.match(`${w.stdout}${w.stderr}`, /Nothing was written/);
  assert.equal(readFileSync(a.target, 'utf8'), a.before, 'the snapshot was written from an unanswered run');
  // an available release is a real difference
  const available = await e28Entry(t, { tags: ['v9.1.0'], localTag: 'v9.0.0' });
  const b = compareTree(t, rawFrom(base, available));
  const bad = runCli(['--in', b.inPath, '--root', b.root, '--platform', 'linux']);
  assert.equal(bad.status, 1, `${bad.stdout}${bad.stderr}`);
  assert.match(bad.stderr, /E-28: status ok → warn/);
});
