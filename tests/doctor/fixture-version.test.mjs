// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
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

test('ARC-09-C137 — no banner test reads the checkout\'s own package.json', () => {
  const files = execFileSync('git', ['ls-files', 'tests', 'tools/snowarch/tests'], { cwd: REAL_ROOT, encoding: 'utf8' })
    .trim().split('\n').filter((f) => f.endsWith('.test.mjs'));
  const banner = files.filter((f) => /hooks\/session-start\.mjs|integrityNudge/.test(readFileSync(join(REAL_ROOT, f), 'utf8')));
  assert.ok(banner.length >= 4, `the sweep found ${banner.length} banner test(s) — it read nothing`);
  const reads = banner.filter((f) => /REAL_ROOT[^\n]{0,40}package\.json/.test(readFileSync(join(REAL_ROOT, f), 'utf8')));
  assert.deepEqual(reads, [], 'a banner test reads the checkout\'s package.json; build the world from FIXTURE_VERSION');
});
