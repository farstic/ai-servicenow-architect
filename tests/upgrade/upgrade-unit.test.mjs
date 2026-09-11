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
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  classifyGitFetchError, parseSemver, renderPlan, sortTags,
} from '../../tools/snowarch/lib/commands/upgrade.mjs';
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
  assert.deepEqual(Object.keys(written).sort(),
    ['behind', 'checkedAt', 'latestTag', 'localDistance', 'localTag', 'remote']);
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
