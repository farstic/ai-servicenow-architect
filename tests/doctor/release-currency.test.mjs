/**
 * ARC-09-C31 — E-28 against a remote that has tags, which CI never had until `v2.0.0-rc.1`.
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
  return E28.run({ root, noNetwork, now, exec: () => lsRemote(tags) });
}

test('C31 — a newer release tag is a warn, with the clock the runner actually passes', async (t) => {
  const r = await e28(t, { tags: ['v2.1.0'] });
  assert.equal(r.status, 'warn', `crashed or skipped instead: ${r.detail}`);
  assert.match(r.detail, /v2\.1\.0 available/);
  assert.match(r.detail, /\.\/snowarch upgrade/);
});

test('C31 — a PRERELEASE on its own is not "available", and that is the decision', async (t) => {
  // `releaseTags()` filters prereleases by default and E-28 uses the same `t.pre === null` rule,
  // so "a prerelease is not an upgrade" is already how this product behaves everywhere. Recorded
  // here as a decision rather than left as an accident of a filter: a maintainer's release
  // candidate must not nudge every user to upgrade to it.
  const r = await e28(t, { tags: ['v2.0.0-rc.1'] });
  assert.equal(r.status, 'skip');
  assert.match(r.detail, /advertises no release tags/);
});

test('C31 — a prerelease BESIDE a release reports the release', async (t) => {
  const r = await e28(t, { tags: ['v2.0.0', 'v2.1.0-rc.3'] });
  assert.equal(r.status, 'warn');
  assert.match(r.detail, /v2\.0\.0 available/);
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
  const r = await e28(t, { tags: [], cache: { latestTag: 'v2.0.0', localTag: 'v2.0.0', behind: false } });
  assert.equal(r.status, 'ok', `crashed or warned instead: ${r.detail}`);
  assert.match(r.detail, /up to date/);
});

test('C31 — a cache that says BEHIND still warns, without asking the remote again', async (t) => {
  let asked = 0;
  const root = mkdtempSync(join(tmpdir(), 'snowarch-e28-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeUpgradeCheck(root, { latestTag: 'v9.0.0', localTag: 'v2.0.0', behind: true, now: () => new Date() });
  const r = await E28.run({ root, noNetwork: false, now: realClock,
    exec: () => { asked += 1; return lsRemote(['v9.0.0']); } });
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
    exec: (cmd, args) => { if (args[0] === 'ls-remote') calls += 1; return lsRemote(['v2.0.0-rc.1']); } };

  const first = await E28.run(ctx);
  assert.equal(first.status, 'skip');
  assert.equal(first.detail, 'origin advertises no release tags');
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

test('C32 — --no-network tells a checked-and-empty run from one that never ran', async (t) => {
  const never = mkdtempSync(join(tmpdir(), 'snowarch-e28-'));
  const checked = mkdtempSync(join(tmpdir(), 'snowarch-e28-'));
  const sawOne = mkdtempSync(join(tmpdir(), 'snowarch-e28-'));
  t.after(() => [never, checked, sawOne].forEach((d) => rmSync(d, { recursive: true, force: true })));
  writeUpgradeCheck(checked, { latestTag: null, localTag: null, behind: false, now: () => new Date() });
  writeUpgradeCheck(sawOne, { latestTag: 'v2.1.0', localTag: 'v2.0.0', behind: true, now: () => new Date() });

  const run = (root) => E28.run({ root, noNetwork: true, now: realClock, exec: () => '' });

  assert.equal((await run(never)).detail, '--no-network, and nothing has been checked yet');
  assert.match((await run(checked)).detail,
    /^--no-network; the last check \(.+\) found no release tags$/);
  assert.match((await run(sawOne)).detail, /^--no-network; the last check \(.+\) saw v2\.1\.0$/);
  for (const root of [never, checked, sawOne]) assert.equal((await run(root)).status, 'skip');
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
    exec: (cmd, args) => { if (args[0] === 'ls-remote') calls += 1; return lsRemote(['v2.1.0']); } });

  assert.equal(calls, 1, 'an expired cache did not cost a remote call');
  assert.equal(r.status, 'warn', `an expired empty outcome pinned the check: ${r.detail}`);
  assert.match(r.detail, /^v2\.1\.0 available/);

  // ...and a fresh one does not: the same fixture one hour old asks nothing.
  const fresh = mkdtempSync(join(tmpdir(), 'snowarch-e28-'));
  t.after(() => rmSync(fresh, { recursive: true, force: true }));
  writeUpgradeCheck(fresh, { latestTag: null, localTag: null, behind: false,
    now: () => new Date(Date.now() - 60 * 60 * 1000) });
  let freshCalls = 0;
  const still = await E28.run({ root: fresh, noNetwork: false, now: realClock,
    exec: (cmd, args) => { if (args[0] === 'ls-remote') freshCalls += 1; return lsRemote(['v2.1.0']); } });
  assert.equal(freshCalls, 0, 'a one-hour-old cache spent a remote call');
  assert.match(still.detail, /^origin advertised no release tags · last checked /);
});

test('C32 — the release-tag paths are unchanged, in both directions', async (t) => {
  // The half that stops this chore from quietly turning a warn into a skip. A release still warns,
  // a matching one is still ok, and both still say what they always said.
  const behind = await e28(t, { tags: ['v2.1.0'] });
  assert.equal(behind.status, 'warn');
  assert.match(behind.detail, /^v2\.1\.0 available — run \.\/snowarch upgrade$/);

  const current = mkdtempSync(join(tmpdir(), 'snowarch-e28-'));
  t.after(() => rmSync(current, { recursive: true, force: true }));
  writeUpgradeCheck(current, { latestTag: 'v2.0.0', localTag: 'v2.0.0', behind: false, now: () => new Date() });
  const r = await E28.run({ root: current, noNetwork: false, now: realClock, exec: () => lsRemote(['v2.0.0']) });
  assert.equal(r.status, 'ok');
  assert.match(r.detail, /^up to date \(v2\.0\.0\) · last checked /);
});
