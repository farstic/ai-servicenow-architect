/**
 * ARC-09-S07 — the parts of `upgrade` that do not need a tree.
 *
 * The classifier, the tag ordering, the plan renderer and the cache: four things whose failures
 * are all of the same kind — a user reading a sentence that is not true. They are unit-tested
 * because each has cases the e2e harness cannot reach cheaply (a 407, a prerelease ordering, a
 * clock that went backwards), and because a plan is text a person acts on.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  classifyGitFetchError, doctorLines, parseSemver, renderPlan, sortTags,
} from '../../tools/snowarch/lib/commands/upgrade.mjs';
import { failureLines } from '../../tools/snowarch/lib/doctor/panel.mjs';
import {
  MAX_AGE_MS, REFRESH_AFTER_MS, cachePath, isFresh, needsRefresh, readUpgradeCheck,
  writeUpgradeCheck,
} from '../../tools/snowarch/lib/upgrade-check.mjs';

const isWindows = process.platform === 'win32';

test('the classifier names a remedy only for a shape it recognises', () => {
  // Git's own words are printed by the CALLER, always. What this decides is whether a second,
  // actionable line is added — and a confident wrong remedy costs more than none.
  assert.equal(classifyGitFetchError('fatal: could not resolve host: github.com').kind, 'dns');
  assert.match(classifyGitFetchError('fatal: could not resolve host: github.com').line,
    /DNS failure for github\.com.*HTTPS_PROXY.*TROUBLESHOOTING\.md#proxy_unreachable/);

  assert.equal(classifyGitFetchError('SSL certificate problem: unable to get local issuer certificate').kind, 'tls');
  assert.match(classifyGitFetchError('SSL certificate problem: self signed certificate').line,
    /http\.sslCAInfo.*NODE_EXTRA_CA_CERTS.*#tls_ca_untrusted/);

  assert.equal(classifyGitFetchError('Received HTTP code 407 from proxy after CONNECT').kind, 'proxy-auth');
  assert.match(classifyGitFetchError('proxy authentication required').line, /\(407\)/);

  assert.equal(classifyGitFetchError('fatal: unable to access \'https://x/\': Failed to connect to 127.0.0.1 port 9: Connection refused').kind, 'proxy');

  // The honest answer when the shape is new: no line at all, and the caller falls back to a
  // sentence that promises nothing about the cause.
  assert.deepEqual(classifyGitFetchError('fatal: the remote end hung up unexpectedly'),
    { kind: 'unknown', line: null });
  assert.deepEqual(classifyGitFetchError(''), { kind: 'unknown', line: null });
  assert.deepEqual(classifyGitFetchError(undefined), { kind: 'unknown', line: null });
});

test('a prerelease sorts BELOW the release it precedes, and a non-tag is not a tag', () => {
  assert.deepEqual(sortTags(['v1.2.0', 'v1.10.0', 'v1.2.10', 'v0.9.9']).map((t) => t.tag),
    ['v1.10.0', 'v1.2.10', 'v1.2.0', 'v0.9.9']);
  // 10 > 2 by NUMBER, not by string: `v1.10.0` sorting under `v1.2.0` is the classic version of
  // this bug and it would silently offer an older release as the newest.
  assert.equal(sortTags(['v1.2.0', 'v1.10.0'])[0].tag, 'v1.10.0');

  assert.deepEqual(sortTags(['v2.0.0', 'v2.0.0-rc.1']).map((t) => t.tag), ['v2.0.0', 'v2.0.0-rc.1']);
  assert.deepEqual(sortTags(['nightly', 'v', 'v1', 'v1.2', 'release-1.2.3']), []);
  assert.equal(parseSemver('v2.0.0-rc.1').pre, 'rc.1');
  assert.equal(parseSemver('v2.0.0').pre, null);
});

test('the plan block says the five things a reader has to decide from', () => {
  const text = renderPlan({
    from: 'v2.0.0', to: 'v2.1.0', commits: 12, date: '2026-10-14',
    tagInfo: { contract: 'a'.repeat(64), docsPin: 'b'.repeat(40) },
    floor: { line: 'claude-floor 2.1.214 (installed 2.1.260 ok)', below: false },
    steps: [{ step: 'B02', title: 'the documentation corpus', files: ['vendor/docs-areas.txt'] }],
    store: { line: 'store: schema v1 → v1 (no migration)' },
    restart: 'restart claude',
  });
  assert.match(text, /^Upgrade plan: v2\.0\.0 → v2\.1\.0 \(12 commits, 2026-10-14\)$/m);
  assert.match(text, /tag verified: contract aaaaaaa… · docs-pin bbbbbbb · claude-floor 2\.1\.214/);
  assert.match(text, /steps that will re-run: B02 the documentation corpus \(vendor\/docs-areas\.txt changed\)/);
  assert.match(text, /store: schema v1 → v1 \(no migration\)/);
  assert.match(text, /credentials: untouched/);
  // The sha is SHORTENED, never printed whole: a plan is read, and 64 characters of hex in the
  // middle of a sentence is a line nobody finishes.
  assert.equal(text.includes('a'.repeat(64)), false);

  const nothing = renderPlan({
    from: 'v2.0.0', to: 'v2.0.1', commits: 1, date: null,
    tagInfo: {}, floor: { line: null }, steps: [], store: { line: 'store: none' },
  });
  assert.match(nothing, /steps that will re-run: none \(only the preflight and the summary\)/);
  assert.match(nothing, /\(1 commit\)/, 'one commit is not "1 commits"');
  assert.match(nothing, /claude-floor not stated/);
});

test('the cache is the hook\'s contract: three keys that may never be renamed', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'snowarch-upgrade-cache-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const written = writeUpgradeCheck(dir,
    { latestTag: 'v2.1.0', localTag: 'v2.0.0', localDistance: 3, behind: true });
  // SUPERSET, NOT EQUALITY — and the difference is this test's own title. It promises three names
  // that may never be RENAMED; `deepEqual` on the sorted keys froze the whole set at six, so ADDING
  // a field failed a test about removing one. ARC-08-C17's `source` marker did exactly that: the
  // over-assertion was the test's, not the change's, and a test that fails for a property it does
  // not name teaches the next author to delete it rather than to read it.
  //
  // What must never happen is a key going away or changing its spelling under a reader that has no
  // way to notice — the SessionStart hook and the banner both read this file and both fail quietly.
  // A new key beside them breaks nobody. So: everything that has ever been in this file is still in
  // it, by name.
  for (const key of ['behind', 'checkedAt', 'latestTag', 'localDistance', 'localTag', 'remote']) {
    assert.ok(key in written, `${key} left the cache — something reads it and will not say so`);
  }
  // …and the three of them the banner reads, named again with the story that owns them, because
  // that is the promise in the title.
  for (const key of ['behind', 'latestTag', 'checkedAt']) {
    assert.ok(key in written, `${key} is the banner's contract (ARC-08-S08)`);
  }
  assert.equal(readUpgradeCheck(dir).latestTag, 'v2.1.0');
  if (!isWindows) assert.equal(statSync(cachePath(dir)).mode & 0o777, 0o600);

  // A malformed file is an ABSENT one — the hook reads this on every session start and must not
  // be the thing that breaks one.
  writeFileSync(cachePath(dir), '{ half written');
  assert.equal(readUpgradeCheck(dir), null);
  writeFileSync(cachePath(dir), '{"latestTag":"v9"}');
  assert.equal(readUpgradeCheck(dir), null, 'a file with no `behind` is not an answer');
});

test('freshness: a week old is silence, and a clock that went backwards is too', () => {
  const at = (ms) => ({ behind: true, latestTag: 'v1', checkedAt: new Date(ms).toISOString() });
  const now = () => new Date(1_000_000_000_000);

  assert.equal(isFresh(at(1_000_000_000_000 - 1000), { now }), true);
  assert.equal(isFresh(at(1_000_000_000_000 - MAX_AGE_MS + 1000), { now }), true);
  assert.equal(isFresh(at(1_000_000_000_000 - MAX_AGE_MS - 1000), { now }), false);
  assert.equal(isFresh(at(1_000_000_000_000 + 60_000), { now }), false, 'a check from the future');
  assert.equal(isFresh({ behind: true }, { now }), false, 'no checkedAt is not fresh');
  assert.equal(isFresh(null, { now }), false);

  // The doctor refreshes on a different, shorter clock than the banner trusts: a day versus a week,
  // so a daily doctor keeps the nudge alive and a checkout nobody runs the doctor in goes quiet.
  assert.ok(REFRESH_AFTER_MS < MAX_AGE_MS);
  assert.equal(needsRefresh(at(1_000_000_000_000 - 2 * REFRESH_AFTER_MS), { now }), true);
  assert.equal(needsRefresh(at(1_000_000_000_000 - 1000), { now }), false);
});

/**
 * ARC-09-C46 — U7 named a number and not what it counted.
 *
 * The owner's rc.4 → rc.5 upgrade printed `[U7/7] doctor` and then `DOCTOR: 31 ok, 3 warn, 1 fail
 * (4 skip)` and the Mode line, nothing else. They had to run `./snowarch doctor` a second time to
 * learn the failure was E-27. The lines were in the parsed report the whole time and were dropped
 * with it — ARC-08-C3's defect one command over, and B09 had already fixed it for the bootstrap.
 *
 * So the renderer is B09's, imported rather than re-typed, and the tally now lives INSIDE the same
 * function as the lines. That is the part that closes the row: the two were separable, and for one
 * release a caller printed the number and skipped the list. There is nothing left to skip.
 */
const REPORT = {
  summary: { ok: 31, warn: 3, fail: 1, skip: 4 },
  checks: [
    { id: 'E-01', status: 'ok', title: 'node' },
    { id: 'E-28', status: 'warn', title: 'release currency', detail: 'v9.9.8 available',
      remedy: './snowarch upgrade' },
    { id: 'E-27', status: 'fail', title: 'Claude Code registration status',
      detail: 'design-only is not in force: a local-scope entry keeps the server loaded',
      remedy: './snowarch mode design' },
    { id: 'E-30', status: 'warn', title: 'proxy' },
    { id: 'E-40', status: 'skip', title: 'network' },
  ],
};

test('ARC-09-C46 — U7 prints the tally AND every check it counted, failures first', () => {
  const lines = doctorLines(REPORT);

  assert.equal(lines[0], 'DOCTOR: 31 ok, 3 warn, 1 fail (4 skip)',
    'the tally must survive the fix — this row adds to U7, it does not replace what was there');

  // THE DEFECT, named: a reader must be able to act without running the doctor again.
  assert.equal(lines[1],
    'E-27 FAIL Claude Code registration status: design-only is not in force: a local-scope entry '
    + 'keeps the server loaded — ./snowarch mode design',
    'the failing check is not named with its remedy on the line after the tally');

  // Failures FIRST: a reader scanning for what stopped them should not pass two warnings to reach
  // it. E-28 appears before E-30 in the report and after E-27 here, which is the whole ordering.
  assert.deepEqual(lines.slice(2).map((l) => l.split(' ')[0]), ['E-28', 'E-30']);
  assert.match(lines[2], /E-28 WARN release currency: v9\.9\.8 available — \.\/snowarch upgrade/);

  // A check with no detail and no remedy still gets a line — its ID and title are the point.
  assert.equal(lines[3], 'E-30 WARN proxy');

  // `ok` and `skip` are NOT printed: 31 ok lines would bury the one that matters, and a skip is
  // already reported by the doctor's own run. The tally still counts them, which is its job.
  assert.equal(lines.length, 4);
  assert.equal(lines.filter((l) => /E-01|E-40/.test(l)).length, 0);
});

test('ARC-09-C46 control — the tally cannot be printed without its lines', () => {
  // NON-VACUITY AND THE CLOSED PATH IN ONE. The defect was a caller that could take the number and
  // leave the list. There is now no way to ask for one: a report with failures always renders more
  // than one line, and the count is index 0 of the same array.
  assert.ok(doctorLines(REPORT).length > 1,
    'the tally is separable from its lines again — this is exactly the C46 defect');

  // A healthy report is still ONE line, or every clean upgrade grows noise it has no reason to.
  const healthy = { summary: { ok: 35, warn: 0, fail: 0, skip: 4 }, checks: [
    { id: 'E-01', status: 'ok', title: 'node' }] };
  assert.deepEqual(doctorLines(healthy), ['DOCTOR: 35 ok, 0 warn, 0 fail (4 skip)']);

  // And the shapes that reach this on a bad day. A doctor whose JSON did not parse is `null`, and
  // U7 must print nothing rather than `DOCTOR: undefined ok` — the caller's `if (report?.summary)`
  // guard used to live at the call site, so moving it had to bring the behaviour with it.
  assert.deepEqual(doctorLines(null), []);
  assert.deepEqual(doctorLines({}), []);
  assert.deepEqual(doctorLines({ summary: { ok: 1, warn: 0, fail: 0, skip: 0 } }),
    ['DOCTOR: 1 ok, 0 warn, 0 fail (0 skip)'], 'a summary with no checks array must not throw');
});

test('ARC-09-C46 — B09 keeps the output it had, which is why the renderer could be shared', () => {
  // BOTH DIRECTIONS. `failureLines` is B09's view and is now defined over `nonOkLines`; if that
  // refactor had changed what the bootstrap prints, this row would have broken B09's summary to
  // fix U7's. Fail-only, and byte-identical to the template it replaced.
  assert.deepEqual(failureLines(REPORT), [
    'E-27 FAIL Claude Code registration status: design-only is not in force: a local-scope entry '
    + 'keeps the server loaded — ./snowarch mode design',
  ]);
  assert.equal(failureLines(REPORT).length, 1, 'a warning reached B09\'s failure list');
  assert.deepEqual(failureLines({ checks: [] }), []);
  assert.deepEqual(failureLines(null), []);

  // The two views share one implementation, so the fail line must be the same string in both.
  assert.equal(failureLines(REPORT)[0], doctorLines(REPORT)[1]);
});

// ─── ARC-09-C53 — U7's Mode line is the user's words, not the JSON boundary's mask ─────────────
//
// U7 printed `Mode: live — instance=<label> (<label>) preset=custom …` while `./snowarch doctor`
// a second later printed `instance=pdi (pdi)` (owner's sitting, 2026-09-23).
//
// `<label>` is NOT an unfilled template. It is `LABEL_MASK` from `doctor/json-boundary.mjs`, and the
// masking is deliberate and correct: `--json` is the form that TRAVELS — an issue template asks a
// stranger to paste it — so labels and hosts leave as `<label>` / `<host>`. The bug is that U7 runs
// `doctor --json`, parses the masked stdout, and prints its `modeLine` to the user's own terminal,
// where the mask is not wanted and the reader owns the words.
//
// The unmasked line is already on disk: `doctor/index.mjs` caches the report at line 331 BEFORE
// `maskForJson` is applied at 514/543, and U7 already passes `--write-cache`. So this is a matter of
// reading the line from the copy meant for this machine rather than the copy meant to be pasted.
import { finish } from '../../tools/snowarch/lib/commands/upgrade.mjs';
import { CACHE_FILE } from '../../tools/snowarch/lib/doctor-cache.mjs';

const MASKED = 'Mode: live — instance=<label> (<label>) preset=custom — doctor 2026-09-24 14 ok';
const REAL = 'Mode: live — instance=pdi (pdi) preset=custom — doctor 2026-09-24 14 ok';

/** A throwaway tree, removed when the case ends. */
function tempDir(prefix, t) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** A tree whose doctor cache carries the UNMASKED line, as the real doctor writes it. */
function treeWithCache(t, modeLine = REAL) {
  const root = tempDir('snowarch-u7-', t);
  mkdirSync(join(root, dirname(CACHE_FILE)), { recursive: true });
  writeFileSync(join(root, CACHE_FILE), JSON.stringify({
    version: 1, at: '2026-09-24T12:00:00.000Z', writer: 'doctor', mode: 'live',
    modeLine, checks: [], summary: { ok: 14, warn: 1, fail: 0, skip: 25 },
  }));
  return root;
}

/** U7 with the doctor stubbed: bootstrap succeeds, the doctor prints MASKED json on stdout. */
async function runU7(root, { modeLine = MASKED } = {}) {
  const lines = [];
  const log = { step: (l) => lines.push(l), fail: (l) => lines.push(l), warn: (l) => lines.push(l) };
  const run = (_cmd, args) => (args.includes('doctor')
    ? { status: 0, stdout: JSON.stringify({ mode: 'live', modeLine,
      summary: { ok: 14, warn: 1, fail: 0, skip: 25 }, checks: [] }) }
    : { status: 0 });
  await finish({ root, env: {}, log, run, target: 'v9.1.0', latest: 'v9.1.0',
    remote: 'origin', now: () => new Date('2026-09-24T12:00:00.000Z'), state: { mode: 'live' } });
  return lines;
}

test('ARC-09-C53 — U7 prints the label the user owns, not the JSON boundary\'s mask', async (t) => {
  const root = treeWithCache(t);
  const lines = await runU7(root);
  const mode = lines.find((l) => l.startsWith('Mode:')) ?? '';
  assert.notEqual(mode, '', `U7 printed no Mode line at all: ${JSON.stringify(lines)}`);
  assert.equal(mode.includes('<label>'), false,
    `U7 printed the JSON boundary's mask to the user's terminal: ${mode}`);
  assert.match(mode, /instance=pdi \(pdi\)/,
    'U7 did not print the instance label the doctor cached for this machine');
});

test('ARC-09-C53 — with no cached line, U7 says nothing rather than printing a mask', async (t) => {
  // The degradation that matters: a masked line is worse than no line, because it reads as a value.
  const root = tempDir('snowarch-u7-nocache-', t);
  const lines = [];
  const log = { step: (l) => lines.push(l), fail: (l) => lines.push(l), warn: (l) => lines.push(l) };
  const run = (_cmd, args) => (args.includes('doctor')
    ? { status: 0, stdout: JSON.stringify({ mode: 'live', modeLine: MASKED,
      summary: { ok: 1, warn: 0, fail: 0, skip: 0 }, checks: [] }) }
    : { status: 0 });
  await finish({ root, env: {}, log, run, target: 'v9.1.0', latest: 'v9.1.0', remote: 'origin',
    now: () => new Date('2026-09-24T12:00:00.000Z'), state: { mode: 'live' } });
  assert.equal(lines.some((l) => l.includes('<label>')), false,
    `a mask reached the user's terminal with no cache to read: ${JSON.stringify(lines)}`);
});
