// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
//
// ARC-09-C138 — a release's manifest verifies under the CI fixture keys, as it does on a real install.
//
// Release run 38515024672 for v2.1.0-rc.1 failed "Judge the report" on all three systems: E-32 read "the
// signed manifest for v2.1.0-rc.1 does not verify — not signed by a key this product ships". The evidence
// doctor ran under the C6 fixture-keys hook, whose module trusted the fixture keys only, so the owner's
// primary-signed manifest was checked against a key made for the run. The product was right: the tag
// verified locally and on a real install.
//
// The fixture is the manifest the owner published for rc.1 (snowarch-licences, releases/v2.1.0-rc.1.json),
// public data, vendored so that this runs offline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { PRODUCT_KEYS } from '../tools/snowarch/lib/licence/keys.mjs';
import { integrityStatus, readManifest, writeManifestCache } from '../tools/snowarch/lib/licence/manifest.mjs';
import { keyPair, productKeys } from '../tools/snowarch/tests/helpers/licence.mjs';
import { fixtureKeysHook } from '../tools/snowarch/tests/helpers/licence-hook/index.mjs';
import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';
import { REAL_ROOT } from './doctor/helpers/tree.mjs';

const DOC = JSON.parse(readFileSync(join(REAL_ROOT, 'tests/fixtures/release-manifest-v2.1.0-rc.1.json'), 'utf8'));
const NOT_SHIPPED = /not signed by a key this product ships/;

/** The keys a module written by the hook exports, read in a plain process. */
async function hookKeys(t) {
  const dir = tempDir('snowarch-c138-hook-', t);
  const hook = fixtureKeysHook(dir, productKeys(keyPair(), keyPair()));
  return { hook, keys: (await import(hook.keysUrl)).PRODUCT_KEYS };
}

/** A tree at the rc.1 version, holding the published manifest as its cache. */
function rcTree(t) {
  const root = tempDir('snowarch-c138-tree-', t);
  writeFileSync(join(root, 'package.json'), `${JSON.stringify({ name: 'fixture', version: '2.1.0-rc.1' })}\n`);
  mkdirSync(join(root, '.local'), { recursive: true });
  writeManifestCache(root, { tag: 'v2.1.0-rc.1', doc: DOC, checkedAt: '2026-10-14T00:00:00Z', source: 'fixture' });
  return root;
}

test('ARC-09-C138 — the published rc.1 manifest verifies with the keys the product ships', () => {
  const read = readManifest(DOC, { keys: PRODUCT_KEYS });
  assert.equal(read.ok, true, read.reason);
  assert.equal(read.manifest.tag, 'v2.1.0-rc.1');
});

test('ARC-09-C138 — and with the keys the CI fixture hook trusts; the fixture keys alone would refuse it', async (t) => {
  const { keys } = await hookKeys(t);
  const read = readManifest(DOC, { keys });
  assert.equal(read.ok, true, `the fixture module refuses a product-signed manifest: ${read.reason}`);
  const fixtureOnly = keys.filter((k) => !PRODUCT_KEYS.some((s) => s.fingerprint === k.fingerprint));
  assert.equal(fixtureOnly.length, 2, 'the module carries the run\'s own two keys');
  assert.match(readManifest(DOC, { keys: fixtureOnly }).reason ?? '', NOT_SHIPPED, 'the defect this replaces');
});

test('ARC-09-C138 — E-32 under the hook, as the evidence step runs it, gets past the key to the tree', async (t) => {
  // The real mechanism: a child started with the hook's `--import`, in which the product's own PRODUCT_KEYS
  // import resolves to the fixture module. The fixture tree is not the tag's, so the answer is `modified`;
  // what matters is that the signature verdict, the one run 38515024672 failed, is no longer `invalid`.
  const { hook } = await hookKeys(t);
  const root = rcTree(t);
  const lib = pathToFileURL(join(REAL_ROOT, 'tools/snowarch/lib/licence/manifest.mjs')).href;
  const code = `const m = await import(${JSON.stringify(lib)});`
    + `console.log(JSON.stringify(m.integrityStatus(${JSON.stringify(root)}, { commitOf: () => ${JSON.stringify(DOC.manifest.commit)} })));`;
  const r = spawnSync(process.execPath, [...hook.importArgs, '--input-type=module', '-e', code], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const s = JSON.parse(r.stdout.trim().split('\n').pop());
  assert.notEqual(s.state, 'invalid', `E-32 under the hook: ${s.reason}`);
  assert.equal(s.state, 'modified');
  // ...and in this process, with no hook, the shipped keys give the same verdict.
  assert.equal(integrityStatus(root, { commitOf: () => DOC.manifest.commit }).state, 'modified');
});
