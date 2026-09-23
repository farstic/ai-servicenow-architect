/**
 * ARC-09-S12 — one comparator, and it is the specification's, not ours.
 *
 * `rehearse.sh 2.0.0-rc.10` could not cut the release:
 *
 *   release: 2.0.0-rc.10 is not greater than the latest tag v2.0.0-rc.9
 *
 * The prerelease compared as a string, and `"rc.10" < "rc.9"`. Two copies had it — the release
 * preflight's `compareVersions` and the engine's `sortTags` — written separately and wrong the same
 * way, which is what this programme keeps finding whenever one rule is stated twice.
 *
 * The release check was the loud failure. The quiet one mattered more: `sortTags` is how
 * `./snowarch upgrade --pre` picks a target, so a checkout on rc.9 would have been told it was
 * already newest and never offered rc.10 — and `E-28` reads the same order, so the doctor would
 * have agreed. A wrong answer both instruments give is not detectable by comparing them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { compareSemver, comparePre, parseSemver, sortTags } from '../tools/snowarch/lib/semver.mjs';
import { compareVersions, latestTag } from '../scripts/lib/release/preflight.mjs';

/**
 * §11's own worked example, in the specification's order.
 *
 * Asserted as a CHAIN rather than as pairs: every adjacent step, and then every pair transitively,
 * because a comparator can be right about neighbours and still not define an order — and it is the
 * order that `Array.sort` relies on.
 */
const SPEC = ['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta',
  '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0'];

test('semver §11 — the specification\'s own example, every pair', () => {
  for (let i = 0; i < SPEC.length; i += 1) {
    for (let j = 0; j < SPEC.length; j += 1) {
      const got = Math.sign(compareSemver(SPEC[i], SPEC[j]));
      assert.equal(got, Math.sign(i - j), `${SPEC[i]} vs ${SPEC[j]}`);
    }
  }
});

test('the case that blocked rc.10 — a two-digit prerelease', () => {
  // The whole defect in one line: as strings `"rc.10" < "rc.9"`, as versions it is not.
  assert.ok(compareSemver('9.0.0-rc.10', '9.0.0-rc.9') > 0, 'rc.10 is not greater than rc.9');
  assert.ok(compareSemver('9.0.0-rc.9', '9.0.0-rc.2') > 0, 'rc.9 is not greater than rc.2');
  assert.ok(compareSemver('9.0.0', '9.0.0-rc.10') > 0, 'the release does not beat its prerelease');
  // …and the next one along, so the fix is not "10 is special".
  assert.ok(compareSemver('9.0.0-rc.11', '9.0.0-rc.10') > 0);
  assert.ok(compareSemver('9.0.0-rc.100', '9.0.0-rc.99') > 0);
});

test('§11.4 — numeric fields rank below alphanumeric, and more fields beat fewer', () => {
  assert.ok(comparePre('1', 'alpha') < 0, 'a numeric identifier must rank below an alphanumeric one');
  assert.ok(comparePre('rc.1', 'rc') > 0, 'more fields must beat fewer when the prefix is equal');
  assert.equal(comparePre('rc.1', 'rc.1'), 0);
});

test('sortTags puts the newest first, prereleases under their release', () => {
  const got = sortTags(['v9.0.0-rc.2', 'v9.0.0-rc.10', 'v9.0.0-rc.9', 'v9.0.0', 'v1.9.0', 'rubbish'])
    .map((t) => t.tag);
  assert.deepEqual(got, ['v9.0.0', 'v9.0.0-rc.10', 'v9.0.0-rc.9', 'v9.0.0-rc.2', 'v1.9.0']);
  // `rubbish` is dropped, not ranked — `parseSemver` returning null is the filter.
  assert.equal(parseSemver('rubbish'), null);
});

test('the release preflight and the engine now answer with the same function', () => {
  // The point of the story, asserted rather than described: ONE rule. If these two ever disagree
  // again it is because a second copy came back, and this is the test that says so.
  for (const [a, b] of [['9.0.0-rc.10', '9.0.0-rc.9'], ['9.0.0', '9.0.0-rc.10'],
    ['1.0.0-alpha.1', '1.0.0-alpha'], ['9.0.0-rc.2', '9.0.0-rc.9']]) {
    assert.equal(Math.sign(compareVersions(a, b)), Math.sign(compareSemver(a, b)), `${a} vs ${b}`);
  }
  assert.equal(latestTag(['v9.0.0-rc.2', 'v9.0.0-rc.9', 'v9.0.0-rc.10']), 'v9.0.0-rc.10');
});

test('a version it cannot parse throws instead of ranking', () => {
  // A comparator that returned 0 for an unparsed string would report "the same version", and
  // `Array.sort` would believe it — the damage surfaces as a wrong release order, nowhere near the
  // input that caused it.
  assert.throws(() => compareSemver('9.0', '9.0.0'), /not a version this product can order/);
  assert.throws(() => compareSemver('9.0.0', 'latest'), /not a version this product can order/);
});
