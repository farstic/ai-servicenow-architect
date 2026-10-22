// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C199 — the upgrade record's judge carries two functions of `semver.mjs` and one constant of
 * `upgrade-check.mjs`, because it imports nothing; these cases hold each copy equal to its original.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareTags, MAX_AGE_MS, parseTag, recordSays } from '../tools/snowarch/lib/upgrade-record.mjs';
import { compareSemver, parseSemver } from '../tools/snowarch/lib/semver.mjs';
import { MAX_AGE_MS as RECORD_MAX_AGE_MS } from '../tools/snowarch/lib/upgrade-check.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Releases, prereleases in §11.4's own order, a `-dev` version, tags without `v`, and strings that are no version. */
const TAGS = ['v9.2.3', 'v9.2.4', 'v9.9.0', 'v9.10.0', 'v9.2.4-alpha', 'v9.2.4-alpha.1', 'v9.2.4-alpha.beta',
  'v9.2.4-beta', 'v9.2.4-beta.2', 'v9.2.4-beta.11', 'v9.2.4-rc.1', 'v9.2.4-rc.2', 'v9.2.4-rc.10', 'v9.2.4-dev',
  '9.2.4', '9.2.4-rc.1', 'v9.2', 'garbage', ''];

/** The outcome of a call: its value, or that it threw. */
const outcome = (fn) => { try { return { value: fn() }; } catch { return { threw: true }; } };

test('ARC-09-C199 — the judge parses every tag as semver.mjs does', () => {
  for (const tag of TAGS) assert.deepEqual(parseTag(tag), parseSemver(tag), tag);
});

test('ARC-09-C199 — the judge orders every pair of tags as semver.mjs does, and throws where it throws', () => {
  let pairs = 0;
  for (const a of TAGS) {
    for (const b of TAGS) {
      assert.deepEqual(outcome(() => compareTags(a, b)), outcome(() => compareSemver(a, b)), `${a} against ${b}`);
      pairs += 1;
    }
  }
  assert.equal(pairs, TAGS.length ** 2);
  // The table holds what the comparison is for: equal, lower, a prerelease below its release, numeric order.
  assert.equal(compareTags('v9.2.3', 'v9.2.3'), 0);
  assert.equal(compareTags('v9.2.3', 'v9.2.4'), -1);
  assert.equal(compareTags('v9.9.0', 'v9.10.0'), -1);
  assert.equal(compareTags('v9.2.4-rc.10', 'v9.2.4'), -1);
  assert.equal(compareTags('v9.2.4-rc.2', 'v9.2.4-rc.10'), -1);
});

test('ARC-09-C199 — the judge\'s freshness window is upgrade-check.mjs\'s', () => {
  assert.equal(MAX_AGE_MS, RECORD_MAX_AGE_MS);
});

test('ARC-09-C199 — the judge imports nothing, so the banner loads one module for it', () => {
  const text = readFileSync(join(ROOT, 'tools/snowarch/lib/upgrade-record.mjs'), 'utf8');
  assert.deepEqual(text.split('\n').filter((l) => /^\s*import\b|\bimport\(/.test(l)), []);
});

test('ARC-09-C199 — a development tree, where `here` is unknown, keeps rules 1 and 3 and loses only 2 and C210', () => {
  const now = Date.parse('2026-10-22T12:00:00Z');
  const fresh = { checkedAt: '2026-10-22T11:00:00Z', behind: true, latestTag: 'v9.2.0' };
  assert.equal(recordSays({ ...fresh, source: 'upgrade' }, { here: null, now }).speak, false, 'rule 1');
  assert.equal(recordSays({ ...fresh, latestTag: 'v9.2.0-rc.1' }, { here: null, now }).speak, false, 'rule 3');
  assert.equal(recordSays({ ...fresh, localTag: 'v9.0.0' }, { here: null, now }).speak, true, 'rule 2 needs `here`');
  assert.equal(recordSays({ ...fresh, latestTag: 'v9.1.0' }, { here: null, now }).speak, true, 'C210 needs `here`');
  assert.equal(recordSays({ ...fresh, latestTag: 'v9.1.0' }, { here: 'v9.1.0', now }).speak, false, 'and has it here');
});
