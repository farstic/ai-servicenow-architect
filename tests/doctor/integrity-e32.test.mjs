// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-11-C7 — E-32, the build's integrity: the files a release ships, checked against the manifest the owner signs
// for its tag. In the quick set and offline, like E-31: it reads the cached manifest and hashes the covered files as
// they are on disk, and it never reaches the network itself. A mismatch is reported, never refused.
//
// A release tree with NO manifest is a FAIL, not a warning (the architect's ruling, 2026-10-13): deleting the
// manifest is the cheapest tamper, so it must read as one. A development tree has no signed manifest to check, and
// skips.
//
// The release here is 9.1.0, the far-future version the upgrade e2e uses, because no test may spell the version the
// next release will carry (ARC-09-C12a).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { engineChecks } from '../../tools/snowarch/lib/doctor/checks/index.mjs';
import { REAL_ROOT, greenTree, readJson } from './helpers/tree.mjs';

const NOW = new Date('2026-10-13T12:00:00Z');
const declared = () => engineChecks().filter((c) => c.id === 'E-32');

/** A green tree whose version of record is `version`, and nothing cached beside it. */
function treeAt(t, version) {
  return greenTree(t, { extra: { 'package.json': { ...readJson(REAL_ROOT, 'package.json'), version } } });
}

const ctxFor = (root) => ({ root, env: {}, platform: process.platform, home: '', flags: {}, now: () => NOW.getTime() });

/** E-32, or a failure that says it is not there — never a TypeError on `undefined.run`. */
function e32() {
  const [check] = declared();
  assert.ok(check, 'E-32 is not declared');
  return check;
}

test('ARC-11-C7 — E-32 is declared once: repo section, fail, quick, offline, spawns nothing, never fixed', () => {
  assert.equal(declared().length, 1, `E-32 is declared ${declared().length} times`);
  const c = e32();
  assert.deepEqual(
    [c.section, c.severity, c.quick, c.network, c.spawns, c.fixable],
    ['repo', 'fail', true, false, false, false],
  );
});

test('ARC-11-C7 — a release tree with no signed manifest is a FAIL that names its tag', async (t) => {
  const r = await e32().run(ctxFor(treeAt(t, '9.1.0')));
  assert.equal(r.status, 'fail', r.detail);
  assert.equal(r.detail, 'Integrity: no signed manifest for v9.1.0 — reinstall from a signed release tag');
});

test('ARC-11-C7 — a development tree has no signed manifest to check, and skips', async (t) => {
  const r = await e32().run(ctxFor(treeAt(t, '9.1.0-dev')));
  assert.equal(r.status, 'skip', r.detail);
});
