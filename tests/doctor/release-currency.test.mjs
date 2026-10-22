// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C31 — E-28 against a remote that has tags, which CI never had until `v9.0.0-rc.1`.
 *
 * The check asks `git ls-remote --tags` what exists there and compares it with this checkout. Every
 * case below injects that answer through `ctx.exec`, so nothing here reaches a network, and each
 * uses ITS OWN root — the first version of this fixture shared one, and a case that ran after a
 * successful one was reading the cache that one wrote rather than the state it meant to set up.
 */
import { test } from 'node:test';
import { spellings } from '../../tools/snowarch/lib/text.mjs';
import assert from 'node:assert/strict';
import { initFixtureRepo } from '../../tools/snowarch/tests/helpers/fixture-git.mjs';

/**
 * The launcher these regexes hold, DERIVED AND ESCAPED — ARC-07-W17.
 *
 * `host.mjs`'s release-currency remedy reads `${cliOf(ctx)} upgrade`, and this file's ctx comes from
 * `contextFor`, which defaults to the process — so on the Windows runner the product correctly renders
 * `.\snowarch.cmd upgrade` and a POSIX regex fails. `RegExp.escape` is not on Node 20, so the escape is
 * explicit: the spelling contains `.` and `\`, both of which mean something else in a pattern.
 */
const ESCAPED_CLI = spellings().cli.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

import { hostChecks } from '../../tools/snowarch/lib/doctor/checks/host.mjs';
import { runChecks } from '../../tools/snowarch/lib/doctor/runner.mjs';
import { writeUpgradeCheck } from '../../tools/snowarch/lib/upgrade-check.mjs';
import { tempDir } from '../../tools/snowarch/tests/helpers/temp.mjs';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { NO_PROMPT_ENV } from '../../tools/snowarch/lib/spawn-env.mjs';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { doctorCommand, runDoctor } from '../../tools/snowarch/lib/doctor/index.mjs';
import { createRegistry } from '../../tools/snowarch/lib/doctor/registry.mjs';

const REAL_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const E28 = hostChecks().find((c) => c.id === 'E-28');

/** `git ls-remote --tags --refs` output for a set of tag names. */
const lsRemote = (tags) => tags
  .map((t) => `0000000000000000000000000000000000000000\trefs/tags/${t}`).join('\n');

/** THE RUNNER'S REAL CLOCK: epoch milliseconds, which is what crashed the check. */
const realClock = () => Date.now();

/**
 * The stub, answering each command it is GIVEN — `ls-remote`, `describe`, `rev-parse`.
 *
 * ARC-09-C47's lesson, met a THIRD time by this fixture. It already carried a comment saying a stub
 * must answer the command it is given, because a `describe` answered with ls-remote output had once
 * told the check this tree was on a tag called "0000…\trefs/tags/v9.1.0". E-28 now also asks
 * `git rev-parse --short HEAD`, to say WHERE a development checkout is, and the two-branch stub
 * answered that with ls-remote output too — producing `development checkout at 0000…refs/tags/v9.1.0`.
 * A stub with a default branch will keep doing this every time the check learns a new question, so
 * this one answers by command and returns '' for anything it was not taught.
 */
const gitStub = ({ tags = [], localTag = null, head = 'abc1234' } = {}) => (_cmd, args) => {
  if (args.includes('ls-remote')) return lsRemote(tags);
  if (args.includes('describe')) return localTag ? `${localTag}\n` : '';
  if (args.includes('rev-parse')) return `${head}\n`;
  return '';
};

async function e28(t, { tags = [], localTag = null, head = 'abc1234', now = realClock,
  cache = null, noNetwork = false } = {}) {
  const root = tempDir('snowarch-e28-', t);
  if (cache) writeUpgradeCheck(root, { ...cache, now: () => new Date() });
  return E28.run({ root, flags: { noNetwork }, now, exec: gitStub({ tags, localTag, head }) });
}

test('ARC-09-C190 — E-28 asks the remote with prompts off, and leaves a stored credential to its helper', async (t) => {
  const root = tempDir('snowarch-e28-', t);
  const seen = [];
  const answer = gitStub({ tags: ['v9.1.0'], localTag: 'v9.0.0' });
  const exec = (cmd, args, opts) => {
    if (args.includes('ls-remote')) seen.push({ args, env: opts?.env ?? null });
    return answer(cmd, args);
  };
  const r = await E28.run({ root, flags: { noNetwork: false }, now: realClock, exec, env: { MARK: 'kept' } });
  assert.equal(r.status, 'warn', r.detail);
  assert.equal(seen.length, 1, 'E-28 did not ask the remote');
  const { args, env } = seen[0];
  assert.deepEqual([env?.GIT_TERMINAL_PROMPT, env?.GIT_ASKPASS, env?.SSH_ASKPASS, env?.GCM_INTERACTIVE],
    ['0', '', '', 'never'], 'git may still prompt');
  assert.equal(env?.MARK, 'kept', 'the doctor\'s own environment was dropped');
  assert.equal(args.some((a) => /credential\.helper/.test(a)), false, 'a stored credential would no longer apply');
});

test('C31 — a newer release tag is a warn, with the clock the runner actually passes', async (t) => {
  const r = await e28(t, { tags: ['v9.1.0'], localTag: 'v9.0.0' });
  assert.equal(r.status, 'warn', `crashed or skipped instead: ${r.detail}`);
  assert.match(r.detail, /v9\.1\.0 available/);
  // ARC-07-W17, rule 2 — derived and escaped. `contextFor` defaults to the process, so on the Windows
  // cells the product renders `.\snowarch.cmd upgrade` and a POSIX literal here fails for no defect.
  assert.match(r.detail, new RegExp(`${ESCAPED_CLI} upgrade`));
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
  const r = await e28(t, { tags: ['v9.0.0', 'v9.1.0-rc.3'], localTag: 'v8.9.0' });
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
  const root = tempDir('snowarch-e28-', t);
  writeUpgradeCheck(root, { latestTag: 'v9.0.0', localTag: 'v9.0.0-rc.1', behind: true, now: () => new Date() });
  // ARC-09-C47 — the stub answers the command it is given, and the counter counts what this
  // test's own message claims: a REMOTE call. E-28 now also runs `git describe` to notice a
  // record left behind by an interrupted upgrade; that is local, and the property being
  // protected here — "without asking the remote again" — is untouched by it.
  const r = await E28.run({ root, flags: { noNetwork: false }, now: realClock,
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
  const root = tempDir('snowarch-e28-', t);
  const r = await E28.run({ root, flags: { noNetwork: true }, now: realClock,
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
  const root = tempDir('snowarch-e28-', t);
  let calls = 0;
  const ctx = { root, flags: { noNetwork: false }, now: realClock,
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
  const root = tempDir('snowarch-e28-', t);
  writeUpgradeCheck(root, { latestTag: null, localTag: null, behind: false, now: () => new Date() });

  const r = await E28.run({ root, flags: { noNetwork: false }, now: realClock, exec: () => lsRemote([]) });
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
  const never = tempDir('snowarch-e28-', t);
  const checked = tempDir('snowarch-e28-', t);
  const sawOne = tempDir('snowarch-e28-', t);
  writeUpgradeCheck(checked, { latestTag: null, localTag: null, behind: false, now: () => new Date() });
  writeUpgradeCheck(sawOne, { latestTag: 'v9.1.0', localTag: 'v9.0.0', behind: true, now: () => new Date() });

  let execCalls = 0;
  const through = async (root) => {
    const { results } = await runChecks([E28],
      { root, flags: { noNetwork: true }, now: realClock, exec: () => { execCalls += 1; return ''; } },
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
    { root: '/nonexistent', flags: { noNetwork: true }, now: realClock, exec: () => { throw new Error('ran'); } },
    { noNetwork: true });
  const r = results.find((x) => x.id === 'E-27');
  assert.equal(r.status, 'skip');
  assert.match(r.detail, /--no-network/);
  // ...and `--quick` still skips E-28 itself, offline or not: that is a cost contract about
  // spawning, and this check spawns git.
  const quick = await runChecks([E28],
    { root: '/nonexistent', flags: { noNetwork: false }, now: realClock, exec: () => { throw new Error('ran'); } },
    { quick: true });
  assert.equal(quick.results.find((x) => x.id === 'E-28').status, 'skip');
});

test('C32 — the window expiring asks again, and a release that appeared is found', async (t) => {
  // The other half of "at most once per 24 h": at most, not never. A stale empty outcome must not
  // pin the check silent — the whole point of caching it is to spend one call per window, and a
  // release published in the meantime has to be seen on the next one.
  const root = tempDir('snowarch-e28-', t);
  const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
  writeUpgradeCheck(root, { latestTag: null, localTag: null, behind: false, now: () => twentyFiveHoursAgo });

  let calls = 0;
  const r = await E28.run({ root, flags: { noNetwork: false }, now: realClock,
    exec: (cmd, args) => {
      if (args[0] === 'ls-remote') calls += 1;
      return gitStub({ tags: ['v9.1.0'], localTag: 'v9.0.0' })(cmd, args);
    } });

  assert.equal(calls, 1, 'an expired cache did not cost a remote call');
  assert.equal(r.status, 'warn', `an expired empty outcome pinned the check: ${r.detail}`);
  assert.match(r.detail, /^v9\.1\.0 available/);

  // ...and a fresh one does not: the same fixture one hour old asks nothing.
  const fresh = tempDir('snowarch-e28-', t);
  writeUpgradeCheck(fresh, { latestTag: null, localTag: null, behind: false,
    now: () => new Date(Date.now() - 60 * 60 * 1000) });
  let freshCalls = 0;
  const still = await E28.run({ root: fresh, flags: { noNetwork: false }, now: realClock,
    exec: (cmd, args) => { if (args[0] === 'ls-remote') freshCalls += 1; return lsRemote(['v9.1.0']); } });
  assert.equal(freshCalls, 0, 'a one-hour-old cache spent a remote call');
  assert.match(still.detail, /^origin advertised no release tags · last checked /);
});

test('C32 — the release-tag paths are unchanged, in both directions', async (t) => {
  // The half that stops this chore from quietly turning a warn into a skip. A release still warns,
  // a matching one is still ok, and both still say what they always said.
  const behind = await e28(t, { tags: ['v9.1.0'], localTag: 'v9.0.0' });
  assert.equal(behind.status, 'warn');
  assert.match(behind.detail, new RegExp(`^v9\\.1\\.0 available — run ${ESCAPED_CLI} upgrade$`));

  const current = tempDir('snowarch-e28-', t);
  writeUpgradeCheck(current, { latestTag: 'v9.0.0', localTag: 'v9.0.0', behind: false, now: () => new Date() });
  // The tree IS on v9.0.0 in this scenario, so `describe` says so; a stub that answered
  // ls-remote output to that question would be describing a tree nobody has.
  const r = await E28.run({ root: current, flags: { noNetwork: false }, now: realClock,
    exec: gitStub({ tags: ['v9.0.0'], localTag: 'v9.0.0' }) });
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
  const root = tempDir('snowarch-c47-', t);
  writeUpgradeCheck(root, { ...cache, now: () => new Date() });
  return E28.run({ root, flags: { noNetwork }, now: realClock, exec: gitFor({ describe, tags }) });
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
  const root = tempDir('snowarch-c47-', t);
  // RELEASE tags, deliberately. The owner's own record named prereleases, and a prerelease is
  // caught by check 3 before check 2 is reached — so a test written with their exact tags passes
  // whether or not this check exists. Found by the control: disabling the `describe` comparison
  // failed nothing. The interrupted upgrade is the same shape with release tags: the plan phase
  // wrote v9.0.0/behind, U5 moved the tree to v9.1.0, `finish()` never ran.
  writeUpgradeCheck(root, { localTag: 'v9.0.0', latestTag: 'v9.1.0', behind: true,
    source: 'upgrade-check', now: () => new Date() });

  let askedRemote = 0;
  const r = await E28.run({ root, flags: { noNetwork: false }, now: realClock,
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

// ─── The three shapes a checkout can be in, once a release exists ──────────────────────────────
//
// E-28 was written when this product had no release, so `latest` was always null and the check
// always skipped. The day v2.0.0 was tagged it started answering — and answered wrongly for the
// commonest shape of all, because `behind` was `localTag !== latest` and `describeExact` returns
// `null` on an untagged HEAD. Every `develop` checkout and every CI bootstrap cell was declared
// behind and told to `./snowarch upgrade`, which would move a development checkout onto the tag and
// discard what the person was working on. It reddened every pull request in the repository.
//
// Three shapes, one test each, so the next reader does not have to infer which is which.

test('E-28 — an untagged HEAD is a development checkout, not a checkout that is behind', async (t) => {
  const r = await e28(t, { tags: ['v9.1.0'], localTag: null, head: 'deadbee' });
  assert.equal(r.status, 'ok', `an untagged checkout is not a problem to fix: ${r.detail}`);
  assert.match(r.detail, /^development checkout at deadbee; latest release v9\.1\.0$/);
  // NO REMEDY. The remedy was the harm: it told a developer to upgrade the tree they are working in.
  assert.equal(r.command ?? null, null, 'a development checkout was handed an upgrade remedy');
  assert.doesNotMatch(r.detail, /available|upgrade/, 'the sentence still reads as a nudge');
});

test('E-28 — a tagged HEAD older than the latest release IS behind, and says so', async (t) => {
  const r = await e28(t, { tags: ['v9.1.0'], localTag: 'v9.0.0' });
  assert.equal(r.status, 'warn');
  assert.match(r.detail, new RegExp(`^v9\\.1\\.0 available — run ${ESCAPED_CLI} upgrade$`));
});

test('E-28 — a tagged HEAD at the latest release is up to date', async (t) => {
  const r = await e28(t, { tags: ['v9.1.0'], localTag: 'v9.1.0' });
  assert.equal(r.status, 'ok');
  assert.match(r.detail, /^up to date \(v9\.1\.0\)$/);
});

test('E-28 — the comparison is the comparator, not string equality (ARC-09-S12)', async (t) => {
  // `!==` called a checkout standing on a tag NEWER than the latest release "behind" — which is
  // what a tag cut locally before it is pushed is — and it is the same class as rc.10 sorting below
  // rc.9. A newer local tag is not behind, and the sentence names the tag the tree is actually on.
  const ahead = await e28(t, { tags: ['v9.1.0'], localTag: 'v9.2.0' });
  assert.equal(ahead.status, 'ok', `a newer local tag was called behind: ${ahead.detail}`);
  assert.match(ahead.detail, /^up to date \(v9\.2\.0\)$/);

  // ...and a prerelease of the latest IS behind it, which string equality also got right only by
  // accident: §11.3, a release outranks every prerelease of the same triple.
  const pre = await e28(t, { tags: ['v9.1.0'], localTag: 'v9.1.0-rc.4' });
  assert.equal(pre.status, 'warn', `a prerelease of the release was not behind it: ${pre.detail}`);
  assert.match(pre.detail, /v9\.1\.0 available/);
});

test('E-28 — a tag this product cannot order is a named skip, not an invented answer', async (t) => {
  // Somebody else's naming on the same commit. A comparator that threw here would crash the doctor;
  // one that guessed would report a currency answer it does not have.
  const r = await e28(t, { tags: ['v9.1.0'], localTag: 'release-2026-09' });
  assert.equal(r.status, 'skip', `crashed or guessed instead: ${r.detail}`);
  assert.match(r.detail, /not a version this product can order/);
  assert.match(r.detail, /latest release v9\.1\.0/, 'the skip does not say what it could not compare to');
});

test('E-28 — a development checkout writes behind:false, so the banner does not nag', async (t) => {
  // The SessionStart banner nudges on `behind === true` with a `latestTag`. A development checkout
  // that cached `behind: true` would be told to upgrade itself away at the top of every session,
  // which is the same harm one layer further out.
  const r = await e28(t, { tags: ['v9.1.0'], localTag: null });
  assert.equal(r.status, 'ok');
  assert.equal(r.data?.behind, false, 'a development checkout cached behind:true');
  assert.equal(r.data?.latestTag, 'v9.1.0', 'the latest release was not recorded');
  assert.equal(r.data?.localTag ?? null, null);
});

test('E-28 under the doctor\'s own --no-network spawns nothing: the flag reaches it as the doctor passes it', async (t) => {
  // The cases above build the check's context by hand. The doctor builds it with the flag at `ctx.flags.noNetwork`
  // (doctor/index.mjs), and only a run through runDoctor proves the check reads it where the doctor puts it. A clone
  // with no origin makes a spawned `ls-remote` fail loudly instead of quietly reaching the network.
  const root = tempDir('snowarch-e28-flags-', t);
  initFixtureRepo((args) => execFileSync('git', args), root, ['-q', '-b', 'main']);
  assert.equal(spawnSync('git', ['-C', root, 'remote', 'get-url', 'origin']).status === 0, false,
    'the fixture has no origin');
  const config = JSON.parse(readFileSync(join(REAL_ROOT, 'engine.config.json'), 'utf8'));
  writeFileSync(join(root, 'engine.config.json'), `${JSON.stringify(config, null, 2)}\n`);
  writeFileSync(join(root, 'package.json'), readFileSync(join(REAL_ROOT, 'package.json')));
  const { report } = await runDoctor({ root, config, registry: createRegistry([E28]), noNetwork: true,
    writeCache: false });
  const r = report.checks.find((c) => c.id === 'E-28');
  assert.equal(r.status, 'skip', `E-28 under --no-network: ${r.status} — ${r.detail}`);
  assert.match(r.detail, /^--no-network, and nothing has been checked yet$/);
});

// ── ARC-09-C207 — a remote that will not list its tags is a warning about the remote, never a crash ─────────────────

/** The reason the upgrade gives, without its `upgrade: ` framing: a credential wanted, or no such repository. */
const REFUSED_AUTH = 'origin asked for credentials, or was not found — it may be private or moved; check it with '
  + 'git remote get-url origin';

/**
 * A child process that answers every request with `status`: its port, and a log of when it RECEIVED each request and
 * when it SENT the answer, in epoch milliseconds. E-28's git runs synchronously, so a server in this process could not
 * answer it. The log is what tells "the server answered late" from "git sat on the answer" if the case ever runs out
 * of E-28's budget again: it did once, on a Windows cell (ARC-09-C207's follow-up, run 39418593899).
 */
async function answering(t, status) {
  const head = status === 401 ? "{ 'WWW-Authenticate': 'Basic realm=\"fixture\"' }" : '{}';
  const server = spawn(process.execPath, ['-e', [
    `const s = require('node:http').createServer((q, r) => { const got = Date.now(); r.writeHead(${status}, ${head});`,
    "  r.end(() => process.stdout.write(`REQ ${got} ${Date.now()} ${q.method} ${q.url}\\n`)); });",
    "s.listen(0, '127.0.0.1', () => process.stdout.write(`PORT ${s.address().port}\\n`));",
  ].join('\n')], { stdio: ['ignore', 'pipe', 'inherit'] });
  t.after(() => server.kill());
  const log = [];
  let buffered = '';
  return new Promise((resolve, reject) => {
    server.stdout.on('data', (d) => {
      buffered += String(d);
      const lines = buffered.split('\n');
      buffered = lines.pop();
      for (const line of lines) {
        const port = /^PORT (\d+)$/.exec(line);
        if (port) resolve({ port: Number(port[1]), log });
        else if (line.startsWith('REQ ')) log.push(line);
      }
    });
    server.once('error', reject);
  });
}

/** The last `max` characters of a trace file, or why there is none. */
const traceTail = (file, max = 4000) => {
  try { const text = readFileSync(file, 'utf8'); return text.length > max ? `…${text.slice(-max)}` : text; } catch (e) { return `(none: ${e.code ?? e.message})`; }
};

/** A checkout whose origin is `url`, and an environment in which no prompt, stored helper, global configuration or
 * proxy answers in the remote's place. The askpass program leaves a mark if git ever asks. */
function refusedBy(t, url) {
  const root = tempDir('snowarch-c207-', t);
  initFixtureRepo((args) => execFileSync('git', args), root, ['-q', '-b', 'main']);
  execFileSync('git', ['-C', root, 'remote', 'add', 'origin', url]);
  assert.equal(execFileSync('git', ['-C', root, 'remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim(), url,
    'the origin was not set');
  const aside = tempDir('snowarch-c207-aside-', t);
  const marker = join(aside, 'asked');
  const askpass = join(aside, 'askpass.sh');
  writeFileSync(askpass, `#!/bin/sh\necho asked >> '${marker}'\necho\n`);
  chmodSync(askpass, 0o755);
  const empty = join(aside, 'gitconfig');
  writeFileSync(empty, '');
  const env = { ...process.env, GIT_ASKPASS: askpass, GIT_CONFIG_GLOBAL: empty, GIT_CONFIG_NOSYSTEM: '1' };
  for (const k of ['GIT_TERMINAL_PROMPT', 'SSH_ASKPASS', 'GCM_INTERACTIVE',
    'HTTPS_PROXY', 'HTTP_PROXY', 'ALL_PROXY', 'https_proxy', 'http_proxy', 'all_proxy']) delete env[k];
  return { root, env, marker, aside };
}

/** What each C207 case must answer: E-28's reason, and git's own last line after it. */
const C207_CASES = {
  401: { name: '401', reason: REFUSED_AUTH,
    fatal: /^fatal: could not read Username for 'http:\/\/127\.0\.0\.1:\d+': terminal prompts disabled$/ },
  404: { name: '404', reason: REFUSED_AUTH,
    fatal: /^fatal: repository 'http:\/\/127\.0\.0\.1:\d+\/fixture\.git\/' not found$/ },
  // `.invalid` never resolves (RFC 6761), so this is a DNS failure on any machine, answered by its own resolver.
  DNS: { name: 'DNS',
    reason: 'DNS failure for snowarch-e28.invalid — check the network; if you are behind a corporate proxy, git reads '
      + 'HTTPS_PROXY / http.proxy (docs/TROUBLESHOOTING.md#proxy_unreachable)',
    fatal: /^fatal: unable to access 'http:\/\/snowarch-e28\.invalid\/fixture\.git\/': Could not resolve host: snowarch-e28\.invalid$/ },
};

/** E-28's sentence when its git runs out of its budget. */
const TIMED_OUT_SENTENCE = 'origin did not answer within 15 s';

/** E-28's budget, which its timeout sentence spells, and what its kill and the runner around it may add. */
const E28_BUDGET_MS = 15_000;
const KILL_SLACK_MS = 5_000;

/**
 * ARC-09-C214 — whether git's trace proves the OS stalled the start of git-remote-http: its last line is git's own
 * `start_command: git-remote-http …`, and nothing follows it, so the helper never wrote its first line ("resolved
 * executable dir"), which every git process writes when it starts. A git that does not trace `start_command` (Apple's
 * 2.39 does not) never proves it.
 */
const helperStartStalled = (trace) => /\btrace: start_command: git-remote-https? /
  .test(String(trace).split('\n').filter((l) => l.trim()).at(-1) ?? '');

/**
 * How one C207 case is judged from what was measured: E-28's result, how long it took, how many requests the case's
 * server received during it, and git's trace of it. Throws the assertion that failed.
 *
 * ARC-09-C214 — one exception, bound to the evidence, never to the outcome: when the server received nothing and the
 * trace proves the helper's start stalled, E-28's exact timeout sentence is asserted instead, within its budget, and
 * the case reports `'stalled'`. A hang in this code before git was spawned leaves no such trace, and is refused.
 */
function judged(c, { status, detail, elapsed, received, trace }, why = () => '') {
  assert.equal(status, 'warn', why());
  if (received === 0 && helperStartStalled(trace)) {
    assert.equal(detail, TIMED_OUT_SENTENCE, why());
    assert.ok(elapsed < E28_BUDGET_MS + KILL_SLACK_MS, `E-28 answered after its budget: ${elapsed} ms\n${why()}`);
    return 'stalled';
  }
  // The reason first, then git's own last line, which is the truth the reason was read from.
  const [reason, fatal, ...rest] = String(detail).split('\n');
  assert.equal(reason, c.reason, why());
  assert.match(fatal ?? '', c.fatal, why());
  assert.deepEqual(rest, [], `${c.name}: more than the reason and git's line: ${detail}`);
  return 'answered';
}

/** A trace file's whole text, or '' when git wrote none. */
const traceOf = (file) => { try { return readFileSync(file, 'utf8'); } catch { return ''; } };

/** The line a CI log is counted by, after each stall the evidence proved. */
const STALLED = 'helper start stalled — ARC-09-C214';
const WARM_UP_MS = 60_000;

/**
 * ARC-09-C214 (a) — git-remote-http is started once against the case's server before E-28's measured call, with a
 * budget of its own and with prompts off as E-28 has them, and the server must have received its request: a cold start
 * the OS stalls is paid here, and a stall past this budget fails the case by name.
 */
async function warmedUp(c, root, env) {
  const before = c.server.log.length;
  const started = Date.now();
  // No pipes: a helper still starting when its git is killed holds none open, so the case never waits on it.
  await new Promise((resolve) => {
    const git = spawn('git', ['ls-remote', '--tags', '--refs', 'origin', 'v*'],
      { cwd: root, env: { ...env, ...NO_PROMPT_ENV }, timeout: WARM_UP_MS, stdio: 'ignore' });
    git.once('close', resolve);
    git.once('error', resolve);
  });
  for (let waited = 0; c.server.log.length === before && waited < 500; waited += 25) {
    await new Promise((resolve) => { setTimeout(resolve, 25); });
  }
  assert.notEqual(c.server.log.length, before, `${c.name}: the warm-up's git asked the server nothing in `
    + `${Date.now() - started} ms, its budget ${WARM_UP_MS} ms — ARC-09-C214`);
}

test('ARC-09-C207 — a remote that wants a credential, has no such repository, or does not resolve is a warning with its reason, never a crash', async (t) => {
  const s401 = await answering(t, 401);
  const s404 = await answering(t, 404);
  const cases = [
    { ...C207_CASES[401], url: `http://127.0.0.1:${s401.port}/fixture.git`, server: s401 },
    { ...C207_CASES[404], url: `http://127.0.0.1:${s404.port}/fixture.git`, server: s404 },
    { ...C207_CASES.DNS, url: 'http://snowarch-e28.invalid/fixture.git' },
  ];
  const details = [];
  for (const c of cases) {
    const { root, env, marker, aside } = refusedBy(t, c.url);
    // git's own account of the call, written to files so it never mixes into the stderr E-28 classifies.
    const traces = { GIT_TRACE: join(aside, 'trace.txt'), GIT_TRACE_CURL: join(aside, 'trace-curl.txt') };
    // The DNS case has no server to prove a warm-up by; the two before it started the same helper.
    if (c.server) await warmedUp(c, root, env);
    const before = c.server?.log.length ?? 0;
    const started = Date.now();
    const { results } = await runChecks([E28], { root, flags: { noNetwork: false }, now: realClock,
      env: { ...env, ...traces } });
    const elapsed = Date.now() - started;
    // The server's lines arrive only now: E-28's git ran synchronously, so this process read no pipe meanwhile.
    for (let waited = 0; c.server && c.server.log.length === before && waited < 500; waited += 25) {
      await new Promise((resolve) => { setTimeout(resolve, 25); });
    }
    const r = results.find((x) => x.id === 'E-28');
    details.push(String(r.detail));
    // On a failure, everything that tells a slow server from a slow git, measured in this run.
    const why = () => [`${c.name}: E-28 answered in ${elapsed} ms: ${r.status} — ${r.detail}`,
      ...(c.server?.log ?? []).map((l, i) => { const [, got, sent, ...what] = l.split(' ');
        const at = (ms) => `${ms - started < 0 ? '' : '+'}${ms - started} ms`;
        return `${i < before ? 'warm-up' : 'server'}: received ${at(Number(got))}, sent ${at(Number(sent))}, `
          + `${what.join(' ')}`; }),
      ...Object.entries(traces).map(([k, f]) => `${k}:\n${traceTail(f)}`)].join('\n');
    const verdict = judged(c, { status: r.status, detail: r.detail, elapsed,
      received: (c.server?.log.length ?? 0) - before, trace: traceOf(traces.GIT_TRACE) }, why);
    if (verdict === 'stalled') t.diagnostic(`${STALLED} (${c.name}, E-28 answered in ${elapsed} ms)`);
    assert.equal(existsSync(marker), false, `${c.name}: git ran the askpass program, so a terminal would have prompted`);
    // Nothing was measured, so nothing is recorded: the banner must not report a check that never happened (AC 4).
    assert.equal(existsSync(join(root, '.local', 'upgrade-check.json')), false, `${c.name}: the cache was written`);
  }
  // No E-28 detail is headed as if the upgrade had run, or reads as a crash of this code.
  for (const d of details) {
    assert.doesNotMatch(d, /^upgrade:/m, d);
    assert.equal(d.includes('check crashed'), false, d);
  }
});

test('ARC-09-C207 — the doctor exits 0 when E-28 is its only check that is not ok', async (t) => {
  // The doctor gives its checks the process environment (`childEnv`), so this case uses the one failure that no helper,
  // prompt or proxy changes into another: a name that never resolves. Whatever the failure, the exit is the claim.
  const { root } = refusedBy(t, 'http://snowarch-e28.invalid/fixture.git');
  writeFileSync(join(root, 'engine.config.json'), readFileSync(join(REAL_ROOT, 'engine.config.json')));
  writeFileSync(join(root, 'package.json'), readFileSync(join(REAL_ROOT, 'package.json')));
  const chunks = [];
  const code = await doctorCommand({ flags: { json: true }, out: { write: (s) => chunks.push(s) },
    err: { write: () => {} }, cwd: root, registry: createRegistry([E28]), input: { isTTY: false } });
  const report = JSON.parse(chunks.join(''));
  const r = report.checks.find((c) => c.id === 'E-28');
  assert.equal(r.status, 'warn', `${r.status} — ${r.detail}`);
  assert.equal(report.summary.fail, 0, JSON.stringify(report.summary));
  assert.equal(code, 0, `the doctor exited ${code} on a warning`);
});

test('ARC-09-C207 — a remote that does not answer in E-28\'s budget, or fails in a way nothing names, is a warning too', async (t) => {
  // Node's own shape for a sync child killed at its timeout, measured: code ETIMEDOUT, signal SIGTERM, no status. The
  // code is read from `os.constants`, as probe-net reads it, because the contract owns the spelled name.
  const { TIMED_OUT } = await import('../../tools/snowarch/lib/probe-net.mjs');
  const throwing = (error) => (_cmd, args) => {
    if (args.includes('ls-remote')) throw Object.assign(new Error('git failed'), error);
    return '';
  };
  const slow = await E28.run({ root: tempDir('snowarch-c207-slow-', t), flags: { noNetwork: false }, now: realClock,
    exec: throwing({ code: TIMED_OUT, signal: 'SIGTERM', status: null, stderr: '' }) });
  assert.equal(slow.status, 'warn', slow.detail);
  assert.equal(slow.detail, 'origin did not answer within 15 s');
  const odd = await E28.run({ root: tempDir('snowarch-c207-odd-', t), flags: { noNetwork: false }, now: realClock,
    exec: throwing({ status: 128, stderr: 'warning: something first\nerror: something nothing names\n' }) });
  assert.equal(odd.status, 'warn', odd.detail);
  // No `fatal:` line, so git's last line is the one shown.
  assert.equal(odd.detail, "could not list origin's release tags\nerror: something nothing names");
});

// ── ARC-09-C214 — a helper whose start the OS stalled is told from a remote that did not answer, by the evidence ─────

/**
 * git's trace of E-28's call in the one Windows failure that captured it: test (windows-latest, node 24), run
 * 39458581800, job 118752530729. git started git-remote-http at 29.789 and the helper never wrote its own first line,
 * "resolved executable dir", which every git process writes when it starts. The server received nothing, and E-28
 * answered at its budget with its timeout sentence.
 */
const STALLED_ON_WINDOWS = `${[
  '16:44:29.018939 exec-cmd.c:266          trace: resolved executable dir: C:/Program Files/Git/ucrt64/bin',
  "16:44:29.034783 git.c:506               trace: built-in: git ls-remote --tags --refs origin 'v*'",
  '16:44:29.034783 run-command.c:673       trace: run_command: GIT_DIR=.git git remote-http origin '
    + 'http://127.0.0.1:53110/fixture.git',
  '16:44:29.034783 run-command.c:945       trace: start_command: git remote-http origin http://127.0.0.1:53110/fixture.git',
  '16:44:29.042595 exec-cmd.c:266          trace: resolved executable dir: C:/Program Files/Git/ucrt64/libexec/git-core',
  '16:44:29.046631 git.c:816               trace: exec: git-remote-http origin http://127.0.0.1:53110/fixture.git',
  '16:44:29.046631 run-command.c:673       trace: run_command: git-remote-http origin http://127.0.0.1:53110/fixture.git',
  '16:44:29.789532 run-command.c:945       trace: start_command: git-remote-http origin http://127.0.0.1:53110/fixture.git',
].join('\n')}\n`;

/** What that run measured, as the C207 case passes it to `judged`. */
const STALLED_RUN = { status: 'warn', detail: TIMED_OUT_SENTENCE, elapsed: 15011, received: 0, trace: STALLED_ON_WINDOWS };

test('ARC-09-C214 — the recorded Windows stall is accepted on its evidence: the server was asked nothing, and git\'s trace ends at the helper\'s start', () => {
  assert.equal(judged(C207_CASES[401], STALLED_RUN), 'stalled');
});

test('ARC-09-C214 — a timeout is refused whenever the evidence does not prove the helper\'s start stalled', () => {
  const lines = STALLED_ON_WINDOWS.trimEnd().split('\n');
  const refused = [
    // A hang in this code before git was spawned leaves no trace at all: the outcome alone is not the evidence.
    ['no trace', { trace: '' }],
    ['the trace ends before git started the helper', { trace: `${lines.slice(0, -1).join('\n')}\n` }],
    ['the helper wrote its first line', { trace: `${STALLED_ON_WINDOWS}16:44:29.790001 exec-cmd.c:266          trace: `
      + 'resolved executable dir: C:/Program Files/Git/ucrt64/libexec/git-core\n' }],
    ['the server received a request', { received: 1 }],
    ['E-28 answered long after its budget', { elapsed: 20_001 }],
    ['git said something after the sentence', { detail: `${TIMED_OUT_SENTENCE}\nfatal: early EOF` }],
    ['another sentence', { detail: REFUSED_AUTH }],
  ];
  for (const [name, change] of refused) {
    assert.throws(() => judged(C207_CASES[401], { ...STALLED_RUN, ...change }), assert.AssertionError, name);
  }
  // The answer C207 asserts is still judged as an answer, whatever the trace holds.
  assert.equal(judged(C207_CASES[401], { ...STALLED_RUN, received: 1, elapsed: 40, detail: `${REFUSED_AUTH}\n`
    + "fatal: could not read Username for 'http://127.0.0.1:53110': terminal prompts disabled" }), 'answered');
});

// ── ARC-09-C210 — a record no newer than this tree's release is up to date, whichever tree wrote it ─────────────────

/** What U2 writes before moving a tree that has no reachable release tag: the from-tree's own measurement. */
const TAGLESS_RECORD = { localTag: null, latestTag: 'v9.2.0', behind: true, source: 'upgrade-check' };

test('ARC-09-C210 — a fresh record naming this tree\'s own release is "up to date", though a tagless tree wrote it', async (t) => {
  // The owner's first upgrade against farstic/snowarch, from an export with no reachable tag: U2 wrote this record,
  // the tree moved to v9.2.0, and U7's E-28 answered from the cache "v9.2.0 available". E-28's rule for a record that
  // describes another tree needs a localTag, and this one has none.
  const r = await e28With(t, { cache: TAGLESS_RECORD, describe: 'v9.2.0', tags: ['v9.2.0'] });
  assert.equal(r.status, 'ok', r.detail);
  assert.match(r.detail, /^up to date \(v9\.2\.0\)/, r.detail);
});

test('ARC-09-C210 — the same record on a tree below its latest release still says that release is available', async (t) => {
  const r = await e28With(t, { cache: TAGLESS_RECORD, describe: 'v9.1.0', tags: ['v9.2.0'] });
  assert.equal(r.status, 'warn', r.detail);
  assert.match(r.detail, /^v9\.2\.0 available/, r.detail);
});
