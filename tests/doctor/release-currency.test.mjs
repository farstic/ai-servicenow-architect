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
