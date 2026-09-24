/**
 * ARC-09-C31 — E-28 against a remote that has tags, which CI never had until `v9.0.0-rc.1`.
 *
 * The check asks `git ls-remote --tags` what exists there and compares it with this checkout. Every
 * case below injects that answer through `ctx.exec`, so nothing here reaches a network, and each
 * uses ITS OWN root — the first version of this fixture shared one, and a case that ran after a
 * successful one was reading the cache that one wrote rather than the state it meant to set up.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { hostChecks } from '../../tools/snowarch/lib/doctor/checks/host.mjs';
import { runChecks } from '../../tools/snowarch/lib/doctor/runner.mjs';
import { writeUpgradeCheck } from '../../tools/snowarch/lib/upgrade-check.mjs';

const E28 = hostChecks().find((c) => c.id === 'E-28');

/** `git ls-remote --tags --refs` output for a set of tag names. */
const lsRemote = (tags) => tags
  .map((t) => `0000000000000000000000000000000000000000\trefs/tags/${t}`).join('\n');

/** THE RUNNER'S REAL CLOCK: epoch milliseconds, which is what crashed the check. */
const realClock = () => Date.now();

async function e28(t, { tags = [], now = realClock, cache = null, noNetwork = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'snowarch-e28-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  if (cache) writeUpgradeCheck(root, { ...cache, now: () => new Date() });
  // ARC-09-C47 — the stub must answer the command it is GIVEN. E-28 now also asks
  // `git describe --tags --exact-match`, and a stub that returned ls-remote output to that
  // question was telling the check this tree is on a tag called
  // "0000…\trefs/tags/v9.1.0" — which no checkout is. Empty is the honest fixture answer:
  // these cases are about tags and caching, and their tree is not on a tag.
  const exec = (_cmd, args) => (args.includes('describe') ? '' : lsRemote(tags));
  return E28.run({ root, noNetwork, now, exec });
}

test('C31 — a newer release tag is a warn, with the clock the runner actually passes', async (t) => {
  const r = await e28(t, { tags: ['v9.1.0'] });
  assert.equal(r.status, 'warn', `crashed or skipped instead: ${r.detail}`);
  assert.match(r.detail, /v9\.1\.0 available/);
  assert.match(r.detail, /\.\/snowarch upgrade/);
});

test('C31 — a PRERELEASE on its own is not "available", and that is the decision', async (t) => {
  // `releaseTags()` filters prereleases by default and E-28 uses the same `t.pre === null` rule,
  // so "a prerelease is not an upgrade" is already how this product behaves everywhere. Recorded
  // here as a decision rather than left as an accident of a filter: a maintainer's release
  // candidate must not nudge every user to upgrade to it.
  const r = await e28(t, { tags: ['v9.0.0-rc.1'] });
  assert.equal(r.status, 'skip');
  // ARC-08 (Sitting A) — and it must SAY that is what happened. "advertises no release tags" reads
  // as "the remote is empty" to somebody standing on v9.0.0-rc.2, which is where the owner was.
  assert.match(r.detail, /no non-prerelease tags/);
  assert.match(r.detail, /rc tags are ignored/, 'the decision is stated, not left to be inferred');
});

test('C31 — a prerelease BESIDE a release reports the release', async (t) => {
  const r = await e28(t, { tags: ['v9.0.0', 'v9.1.0-rc.3'] });
  assert.equal(r.status, 'warn');
  assert.match(r.detail, /v9\.0\.0 available/);
  assert.doesNotMatch(r.detail, /rc\.3/);
});

test('C31 — junk on the remote is ignored, never a crash', async (t) => {
  // A tag that is not a version at all, and one that is `v`-shaped but unparsable. Both arrive
  // from `ls-remote` exactly like a real one; neither may take the check down.
  for (const tags of [['not-a-version'], ['v'], ['vNEXT'], ['v1.2.3.4.5'], ['']]) {
    const r = await e28(t, { tags: tags.filter(Boolean) });
    assert.ok(['skip', 'ok', 'warn'].includes(r.status),
      `${JSON.stringify(tags)} produced ${r.status}: ${r.detail}`);
    assert.doesNotMatch(String(r.detail), /crashed/);
  }
});

test('C31 — a cache from an earlier run is read, not crashed on', async (t) => {
  // THE PATH THAT NEEDED NO RELEASE TAG. Before the fix this threw `now(...).getTime is not a
  // function` from `isFresh`, so any machine that had ever completed one successful check would
  // have failed every networked run afterwards — the rc.1 tag exposed the other path, this one was
  // waiting for anybody.
  const r = await e28(t, { tags: [], cache: { latestTag: 'v9.0.0', localTag: 'v9.0.0', behind: false } });
  assert.equal(r.status, 'ok', `crashed or warned instead: ${r.detail}`);
  assert.match(r.detail, /up to date/);
});

test('C31 — a cache that says BEHIND still warns, without asking the remote again', async (t) => {
  let asked = 0;
  const root = mkdtempSync(join(tmpdir(), 'snowarch-e28-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeUpgradeCheck(root, { latestTag: 'v9.0.0', localTag: 'v9.0.0-rc.1', behind: true, now: () => new Date() });
  // ARC-09-C47 — the stub answers the command it is given, and the counter counts what this
  // test's own message claims: a REMOTE call. E-28 now also runs `git describe` to notice a
  // record left behind by an interrupted upgrade; that is local, and the property being
  // protected here — "without asking the remote again" — is untouched by it.
  const r = await E28.run({ root, noNetwork: false, now: realClock,
    exec: (_cmd, args) => {
      if (args.includes('describe')) return 'v9.0.0-rc.1\n';
      asked += 1;
      return lsRemote(['v9.0.0']);
    } });
  assert.equal(r.status, 'warn');
  assert.match(r.detail, /v9\.0\.0 available/);
  assert.equal(asked, 0, 'a fresh cache must not cost a remote call');
});

test('C31 — --no-network says what the last check saw, and asks nothing', async (t) => {
  let asked = 0;
  const root = mkdtempSync(join(tmpdir(), 'snowarch-e28-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const r = await E28.run({ root, noNetwork: true, now: realClock,
    exec: () => { asked += 1; return ''; } });
  assert.equal(r.status, 'skip');
  assert.match(r.detail, /--no-network/);
  assert.equal(asked, 0);
});

// ─── ARC-09-C32 — the empty outcome is cached, and two branches had to learn about it ─────────
//
// ARC-09-S07 says E-28 "refreshes the cache at most once per 24 h". The no-release path returned
// BEFORE `writeUpgradeCheck`, so nothing was cached, `needsRefresh` was true for ever, and every
// networked doctor run spent an `ls-remote` with a 15 s budget. Measured before the fix: three
// runs, three calls, no cache.
//
// Caching it is not a one-line change, because two other branches assumed "a cache implies a
// release": the cached hit would have printed `ok "up to date (no tag)"` — currency with something
// that does not exist — and `--no-network` branched on `latestTag` being TRUTHY, so a run that DID
// check and found nothing would have said "nothing has been checked yet". The third is the one
// that turns a true statement into a false one, and it only exists because of the first.
//
// The three sentences are asserted VERBATIM below. Present tense for what the check sees now, past
// for what the cache remembers — the distinction a cache introduces, and the reason the wording is
// part of the change rather than incidental to it.

test('C32 — the empty outcome is cached: three runs, one remote call', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'snowarch-e28-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  let calls = 0;
  const ctx = { root, noNetwork: false, now: realClock,
    exec: (cmd, args) => { if (args[0] === 'ls-remote') calls += 1; return lsRemote(['v9.0.0-rc.1']); } };

  const first = await E28.run(ctx);
  assert.equal(first.status, 'skip');
  assert.equal(first.detail,
    'origin advertises no non-prerelease tags; rc tags are ignored by this check');
  assert.equal(calls, 1);

  for (const run of [2, 3]) {
    const again = await E28.run(ctx);
    assert.equal(again.status, 'skip', `run ${run}`);
    assert.match(again.detail, /^origin advertised no release tags · last checked /,
      `run ${run} did not read the cache`);
    assert.equal(calls, 1, `run ${run} spent another remote call`);
  }
});

test('C32 — a cached empty outcome never reads as "up to date"', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'snowarch-e28-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeUpgradeCheck(root, { latestTag: null, localTag: null, behind: false, now: () => new Date() });

  const r = await E28.run({ root, noNetwork: false, now: realClock, exec: () => lsRemote([]) });
  assert.equal(r.status, 'skip');
  assert.match(r.detail, /^origin advertised no release tags · last checked /);
  // The sentence this replaces, which claimed currency with something that does not exist.
  assert.doesNotMatch(r.detail, /up to date/);
  assert.doesNotMatch(r.detail, /no tag/);
});

test('C32 — --no-network tells a checked-and-empty run from one that never ran, THROUGH THE RUNNER', async (t) => {
  // THIS TEST WAS WRONG AND THE PRODUCT PROVED IT. Its first version called `E28.run(...)` directly
  // with `noNetwork: true` and asserted the three sentences. They are real sentences in the check,
  // and the doctor could never show them: `planRun` skips every `network: true` check by the FLAG,
  // before any body runs, so the live report said `E-28 skip release currency: --no-network` and
  // nothing more. Driving the body past the framework is the passes-for-the-wrong-reason class —
  // the same one this whole acceptance pass keeps finding, this time in my own test.
  //
  // Those sentences had been unreachable since ARC-09-S07 wrote them (`9c4592d`); C32 extended dead
  // code rather than creating it. The fix-up makes them reachable — E-28 declares `offline: true`,
  // the runner runs an offline check under `--no-network` — and this case goes THROUGH `runChecks`,
  // which is the only way to assert that a user would actually see them.
  const never = mkdtempSync(join(tmpdir(), 'snowarch-e28-'));
  const checked = mkdtempSync(join(tmpdir(), 'snowarch-e28-'));
  const sawOne = mkdtempSync(join(tmpdir(), 'snowarch-e28-'));
  t.after(() => [never, checked, sawOne].forEach((d) => rmSync(d, { recursive: true, force: true })));
  writeUpgradeCheck(checked, { latestTag: null, localTag: null, behind: false, now: () => new Date() });
  writeUpgradeCheck(sawOne, { latestTag: 'v9.1.0', localTag: 'v9.0.0', behind: true, now: () => new Date() });

  let execCalls = 0;
  const through = async (root) => {
    const { results } = await runChecks([E28],
      { root, noNetwork: true, now: realClock, exec: () => { execCalls += 1; return ''; } },
      { noNetwork: true });
    return results.find((r) => r.id === 'E-28');
  };

  assert.equal((await through(never)).detail, '--no-network, and nothing has been checked yet');
  assert.match((await through(checked)).detail,
    /^--no-network; the last check \(.+\) found no release tags$/);
  assert.match((await through(sawOne)).detail, /^--no-network; the last check \(.+\) saw v9\.1\.0$/);

  // The promise `offline: true` makes, and the flag cannot enforce: no subprocess under
  // `--no-network`. Without this the opt-out would be a way to reach the network while claiming not
  // to — which is worse than the skip it replaces.
  assert.equal(execCalls, 0, 'an offline check spawned something under --no-network');
});

test('C32 — a network check WITHOUT `offline` is still skipped by the flag', async () => {
  // The other direction on the runner change, so the opt-out stays an opt-out. `planRun` is the
  // thing under test here, not E-28: a check that has not claimed an offline answer must not start
  // getting one.
  const plain = { ...E28, id: 'E-27', offline: false };
  const { results } = await runChecks([plain],
    { root: '/nonexistent', noNetwork: true, now: realClock, exec: () => { throw new Error('ran'); } },
    { noNetwork: true });
  const r = results.find((x) => x.id === 'E-27');
  assert.equal(r.status, 'skip');
  assert.match(r.detail, /--no-network/);
  // ...and `--quick` still skips E-28 itself, offline or not: that is a cost contract about
  // spawning, and this check spawns git.
  const quick = await runChecks([E28],
    { root: '/nonexistent', noNetwork: false, now: realClock, exec: () => { throw new Error('ran'); } },
    { quick: true });
  assert.equal(quick.results.find((x) => x.id === 'E-28').status, 'skip');
});

test('C32 — the window expiring asks again, and a release that appeared is found', async (t) => {
  // The other half of "at most once per 24 h": at most, not never. A stale empty outcome must not
  // pin the check silent — the whole point of caching it is to spend one call per window, and a
  // release published in the meantime has to be seen on the next one.
  const root = mkdtempSync(join(tmpdir(), 'snowarch-e28-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
  writeUpgradeCheck(root, { latestTag: null, localTag: null, behind: false, now: () => twentyFiveHoursAgo });

  let calls = 0;
  const r = await E28.run({ root, noNetwork: false, now: realClock,
    exec: (cmd, args) => { if (args[0] === 'ls-remote') calls += 1; return lsRemote(['v9.1.0']); } });

  assert.equal(calls, 1, 'an expired cache did not cost a remote call');
  assert.equal(r.status, 'warn', `an expired empty outcome pinned the check: ${r.detail}`);
  assert.match(r.detail, /^v9\.1\.0 available/);

  // ...and a fresh one does not: the same fixture one hour old asks nothing.
  const fresh = mkdtempSync(join(tmpdir(), 'snowarch-e28-'));
  t.after(() => rmSync(fresh, { recursive: true, force: true }));
  writeUpgradeCheck(fresh, { latestTag: null, localTag: null, behind: false,
    now: () => new Date(Date.now() - 60 * 60 * 1000) });
  let freshCalls = 0;
  const still = await E28.run({ root: fresh, noNetwork: false, now: realClock,
    exec: (cmd, args) => { if (args[0] === 'ls-remote') freshCalls += 1; return lsRemote(['v9.1.0']); } });
  assert.equal(freshCalls, 0, 'a one-hour-old cache spent a remote call');
  assert.match(still.detail, /^origin advertised no release tags · last checked /);
});

test('C32 — the release-tag paths are unchanged, in both directions', async (t) => {
  // The half that stops this chore from quietly turning a warn into a skip. A release still warns,
  // a matching one is still ok, and both still say what they always said.
  const behind = await e28(t, { tags: ['v9.1.0'] });
  assert.equal(behind.status, 'warn');
  assert.match(behind.detail, /^v9\.1\.0 available — run \.\/snowarch upgrade$/);

  const current = mkdtempSync(join(tmpdir(), 'snowarch-e28-'));
  t.after(() => rmSync(current, { recursive: true, force: true }));
  writeUpgradeCheck(current, { latestTag: 'v9.0.0', localTag: 'v9.0.0', behind: false, now: () => new Date() });
  // The tree IS on v9.0.0 in this scenario, so `describe` says so; a stub that answered
  // ls-remote output to that question would be describing a tree nobody has.
  const r = await E28.run({ root: current, noNetwork: false, now: realClock,
    exec: (_cmd, args) => (args.includes('describe') ? 'v9.0.0\n' : lsRemote(['v9.0.0'])) });
  assert.equal(r.status, 'ok');
  assert.match(r.detail, /^up to date \(v9\.0\.0\) · last checked /);
});

/**
 * ARC-09-C47 — the doctor reported currency from records that had never measured it.
 *
 * Two sightings from the owner's sitting, and they are DIFFERENT failures:
 *
 *   after a COMPLETED `--pre` upgrade, on a tree at rc.5:
 *     { localTag: "v9.0.0-rc.5", latestTag: "v9.0.0-rc.5", behind: false }
 *     → `E-28 ok release currency: up to date (v9.0.0-rc.5) · last checked …`
 *   after an INTERRUPTED one, on a tree at rc.6:
 *     { localTag: "v9.0.0-rc.5", behind: true }
 *     → `E-28 warn release currency: v9.0.0-rc.6 available — run ./snowarch upgrade`
 *
 * The first AGREES with its tree and is still wrong: `finish()` wrote `behind: false` as a
 * literal, and `latestTag` is a prerelease, which this check's live rule never stores. The second
 * DISAGREES with its tree: the plan phase's record outlived the upgrade that was interrupted
 * before `finish()` ran. A fix for one leaves the other standing, which is why there are three
 * checks and not one.
 */
const gitFor = ({ describe: tag, tags = [] }) => (_cmd, args) => (
  args.includes('describe') ? `${tag}\n` : lsRemote(tags));

async function e28With(t, { cache, describe, tags = [], noNetwork = false }) {
  const root = mkdtempSync(join(tmpdir(), 'snowarch-c47-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeUpgradeCheck(root, { ...cache, now: () => new Date() });
  return E28.run({ root, noNetwork, now: realClock, exec: gitFor({ describe, tags }) });
}

test('ARC-09-C47 — an upgrade\'s own record is not a currency measurement', async (t) => {
  // `finish()` now writes `source: 'upgrade'` and no verdict. Offline, the check must say which
  // record it found rather than answering the question from it.
  const r = await e28With(t, {
    cache: { localTag: 'v9.0.0-rc.6', source: 'upgrade' },
    describe: 'v9.0.0-rc.6',
    noNetwork: true,
  });
  assert.equal(r.status, 'skip');
  assert.match(r.detail, /the last record is an upgrade's, not a currency check/);
  // And NOT the C32 sentence, which would claim a check ran and found nothing.
  assert.doesNotMatch(r.detail, /advertised no release tags/);
});

test('ARC-09-C47 — a record describing another tree is not used (the interrupted upgrade)', async (t) => {
  // The owner's second sighting: the plan phase's record, on a tree that has moved. Networked,
  // because the disagreement is found with `git describe` and `--no-network` promises no spawn —
  // so offline this check deliberately does not run, and the test says which path it is on.
  //
  // The observable is NOT a message: `notCurrency` makes the check MEASURE instead of reading a
  // verdict out of the record. So the assertion is that the stale `behind: true` was not used —
  // the remote says v9.0.0 is the newest release and the tree is on it, so the answer is `ok`,
  // where the cached record would have said "v9.0.0-rc.6 available".
  const root = mkdtempSync(join(tmpdir(), 'snowarch-c47-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  // RELEASE tags, deliberately. The owner's own record named prereleases, and a prerelease is
  // caught by check 3 before check 2 is reached — so a test written with their exact tags passes
  // whether or not this check exists. Found by the control: disabling the `describe` comparison
  // failed nothing. The interrupted upgrade is the same shape with release tags: the plan phase
  // wrote v9.0.0/behind, U5 moved the tree to v9.1.0, `finish()` never ran.
  writeUpgradeCheck(root, { localTag: 'v9.0.0', latestTag: 'v9.1.0', behind: true,
    source: 'upgrade-check', now: () => new Date() });

  let askedRemote = 0;
  const r = await E28.run({ root, noNetwork: false, now: realClock,
    exec: (_cmd, args) => {
      if (args.includes('describe')) return 'v9.1.0\n';
      askedRemote += 1;
      return lsRemote(['v9.1.0']);
    } });

  assert.equal(askedRemote, 1, 'it answered from the stale record instead of measuring');
  assert.equal(r.status, 'ok');
  assert.match(r.detail, /up to date \(v9\.1\.0\)/);
  assert.doesNotMatch(r.detail, /available — run/, 'the stale record still drove the answer');
});

test('ARC-09-C47 — a prerelease latestTag is not a measurement, marker or no marker', async (t) => {
  // The owner's FIRST sighting, and the check that works on records written before this fix:
  // no `source` key at all, `localTag` agreeing with the tree, and still not evidence, because
  // E-28's live rule stores only non-prerelease tags.
  const r = await e28With(t, {
    cache: { localTag: 'v9.0.0-rc.5', latestTag: 'v9.0.0-rc.5', behind: false },
    describe: 'v9.0.0-rc.5',
    noNetwork: true,
  });
  assert.equal(r.status, 'skip');
  assert.match(r.detail, /names a prerelease \(v9\.0\.0-rc\.5\), which a currency check never stores/);
  assert.doesNotMatch(r.detail, /up to date/, 'it still reported currency from an assertion');
});

test('ARC-09-C47 — a real measurement is still trusted, and still answers offline', async (t) => {
  // THE DIRECTION THAT MATTERS MOST. Three refusals that refused everything would be worse than
  // the defect: the banner and the offline doctor would go silent. A record from a genuine
  // currency check, on the tree it describes, with a release tag, is reported exactly as before.
  const fresh = await e28With(t, {
    cache: { localTag: 'v9.0.0', latestTag: 'v9.1.0', behind: true, source: 'currency' },
    describe: 'v9.0.0',
    noNetwork: true,
  });
  assert.equal(fresh.status, 'skip', 'offline is always a skip; the detail is what carries the news');
  assert.match(fresh.detail, /the last check .* saw v9\.1\.0/);
  assert.doesNotMatch(fresh.detail, /stale record|upgrade's, not a currency|prerelease/);

  // ...and a cached up-to-date record is still `ok`, networked, without re-fetching.
  const uptodate = await e28With(t, {
    cache: { localTag: 'v9.0.0', latestTag: 'v9.0.0', behind: false, source: 'currency' },
    describe: 'v9.0.0',
  });
  assert.equal(uptodate.status, 'ok');
  assert.match(uptodate.detail, /up to date \(v9\.0\.0\)/);
});
