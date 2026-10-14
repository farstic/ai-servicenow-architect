// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-11-C7 — a release's signed manifest, fetched over the revocation list's transport and cached for E-32.
//
// Against local list repositories (`listRepo`), so every outcome is a real git answer: a manifest published for the tag,
// none, one that does not verify, one for another release, a repository that cannot be reached, and no repository at all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { manifestSays, manifestSource, refreshManifest } from '../lib/licence/fetch.mjs';
import { readManifestCache } from '../lib/licence/manifest.mjs';
import { keyPair, listRepo, manifestDoc, productKeys } from './helpers/licence.mjs';
import { tempDir } from './helpers/temp.mjs';

const primary = keyPair();
const KEYS = productKeys(primary, keyPair());
const NOW = new Date('2026-10-13T12:00:00Z');
const json = (doc) => `${JSON.stringify(doc, null, 2)}\n`;

function root(t) {
  const dir = tempDir('snowarch-manifest-fetch-', t);
  mkdirSync(join(dir, '.local'), { recursive: true });
  return dir;
}

const refresh = (dir, config, over = {}) => refreshManifest(dir, { config, tag: 'v9.1.0', keys: KEYS, now: NOW, env: {},
  ...over });

test('ARC-11-C7 — the manifests come from licence.manifests, else from the revocation list\'s repository', () => {
  assert.deepEqual(manifestSource({ licence: { revocations: { repo: 'owner/licences', ref: 'main', path: 'revocations.json' } } }),
    { url: 'https://github.com/owner/licences.git', ref: 'main', dir: 'releases' });
  assert.deepEqual(manifestSource({ licence: { revocations: { repo: 'owner/licences' },
    manifests: { repo: 'file:///tmp/m.git', ref: 'signed', dir: 'tags' } } }),
  { url: 'file:///tmp/m.git', ref: 'signed', dir: 'tags' });
  assert.deepEqual(manifestSource({ licence: { manifests: { repo: 'owner/licences' } } }),
    { url: 'https://github.com/owner/licences.git', ref: 'main', dir: 'releases' });
  assert.equal(manifestSource({ licence: {} }), null);
  assert.equal(manifestSource({}), null);
});

test('ARC-11-C7 — a published manifest for the tag is fetched, verified and cached', (t) => {
  const repo = listRepo(t, { 'releases/v9.1.0.json': json(manifestDoc('v9.1.0', primary)) });
  const dir = root(t);
  const r = refresh(dir, { licence: { revocations: { repo } } });
  assert.deepEqual([r.outcome, r.tag, r.files], ['fetched', 'v9.1.0', 1]);
  assert.equal(manifestSays(r), 'release manifest: v9.1.0 fetched (1 file)');
  const cache = readManifestCache(dir);
  assert.deepEqual([cache.tag, cache.checkedAt, cache.doc.manifest.tag], ['v9.1.0', NOW.toISOString(), 'v9.1.0']);
  assert.match(cache.source, / main:releases\/v9\.1\.0\.json$/);
});

test('ARC-11-C7 — with write false the manifest is verified and returned, and nothing is cached', (t) => {
  const repo = listRepo(t, { 'releases/v9.1.0.json': json(manifestDoc('v9.1.0', primary)) });
  const dir = root(t);
  const r = refresh(dir, { licence: { revocations: { repo } } }, { write: false });
  assert.equal(r.outcome, 'fetched');
  assert.equal(r.entry.doc.manifest.tag, 'v9.1.0');
  assert.equal(readManifestCache(dir), null);
});

test('ARC-11-C7 — none published, one that does not verify, another release\'s: each said, and the cache untouched', (t) => {
  const dir = root(t);
  const none = refresh(dir, { licence: { revocations: { repo: listRepo(t, { 'revocations.json': '{}' }) } } });
  assert.equal(manifestSays(none), 'release manifest: none is published for v9.1.0');

  const forged = refresh(dir, { licence: { revocations: { repo: listRepo(t, {
    'releases/v9.1.0.json': json(manifestDoc('v9.1.0', keyPair())) }) } } });
  assert.equal(manifestSays(forged),
    'release manifest: the one published for v9.1.0 does not verify (not signed by a key this product ships) — ignored');

  const other = refresh(dir, { licence: { revocations: { repo: listRepo(t, {
    'releases/v9.1.0.json': json(manifestDoc('v9.0.0', primary)) }) } } });
  assert.equal(manifestSays(other),
    'release manifest: the one published for v9.1.0 does not verify (it is v9.0.0\'s) — ignored');
  assert.equal(readManifestCache(dir), null);
});

test('ARC-11-C7 — an unreachable repository, and none configured, leave the cache as it was', (t) => {
  const dir = root(t);
  const gone = pathToFileURL(join(tempDir('snowarch-manifest-none-', t), 'missing.git')).href;
  const unreachable = refresh(dir, { licence: { revocations: { repo: gone } } });
  assert.equal(unreachable.outcome, 'unreachable');
  assert.match(manifestSays(unreachable), /^release manifest: could not be reached \(.+\)$/);
  assert.equal(manifestSays(refresh(dir, { licence: {} })), 'release manifest: none configured (engine.config.json → licence)');
  assert.equal(readManifestCache(dir), null);
});
