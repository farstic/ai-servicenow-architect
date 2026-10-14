// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C137 — a fixture's version is the fixture's. The v2.1.0-rc.1 rehearsal's post-write suite failed the
// three hook tests of AC 1: `greenTree` copied the checkout's package.json, which a release had by then written to
// 2.1.0-rc.1, and a release tree with no signed manifest puts E-32's Integrity line into the banner. Nothing the
// banner tests assert may depend on the version the checkout happens to carry — develop's -dev, a release
// candidate's, or a release's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { isDevVersion } from '../../tools/snowarch/lib/licence/manifest.mjs';
import { FIXTURE_VERSION, greenTree, readJson, REAL_ROOT } from './helpers/tree.mjs';

test('ARC-09-C137 — a green tree carries the fixture version, a dev one, whatever the checkout carries', (t) => {
  assert.ok(isDevVersion(FIXTURE_VERSION), `${FIXTURE_VERSION} is not a dev version, so E-32 would judge it`);
  assert.equal(readJson(greenTree(t), 'package.json').version, FIXTURE_VERSION);
});

test('ARC-09-C137 — no banner test names package.json: the fixture helper builds the version of record', () => {
  // WIDENED in ARC-11-C10's PR. The first form matched `REAL_ROOT…package.json` only, which was the read its own
  // control planted; the architect's control C read the file through `new URL('../../package.json', import.meta.url)`
  // and stayed green. So any occurrence of the name in a banner test is a finding: a world takes its version from
  // `greenTree`, `releaseTree` or `writeFixturePackage`, and an assertion names the file through VERSION_OF_RECORD.
  const SELF = 'tests/doctor/fixture-version.test.mjs';
  const files = execFileSync('git', ['ls-files', 'tests', 'tools/snowarch/tests'], { cwd: REAL_ROOT, encoding: 'utf8' })
    .trim().split('\n').filter((f) => f.endsWith('.test.mjs') && f !== SELF);
  const text = (f) => readFileSync(join(REAL_ROOT, f), 'utf8');
  const banner = files.filter((f) => /hooks\/session-start\.mjs|integrityNudge/.test(text(f)));
  assert.ok(banner.length >= 4, `the sweep found ${banner.length} banner test(s) — it read nothing`);
  const named = banner.filter((f) => text(f).includes('package.json'));
  assert.deepEqual(named, [], 'a banner test names package.json; take the version from the fixture helper');
});
