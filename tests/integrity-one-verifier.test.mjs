// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-11-C141 — ONE VERIFIER (the architect's ruling Q1, 2026-10-14).
 *
 * The server, both CLIs, the SessionStart hook and the doctor's E-32 must give one answer to "is this tree the signed
 * release", so the reading half of the integrity manifest lives once, in the server's build
 * (`packages/snowarch/dist/licence/integrity.js`), and the engine re-exports it. The ruling asked for IDENTITY, not
 * parity: a parity pair is two implementations that a later edit can split, and a case comparing their answers on a
 * fixture would stay green while they disagreed on the next one.
 *
 * So the assertion is `===` on the functions themselves, through the engine's own import path.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as engine from '../tools/snowarch/lib/licence/manifest.mjs';
import * as dist from '../packages/snowarch/dist/licence/integrity.js';

/** The reading half: everything a verdict is made of. The signer's half stays in the engine. */
const ONE = ['MANIFEST_FORMAT', 'COVERAGE', 'hashBytes', 'isCovered', 'readManifest', 'checkTree', 'readManifestCache',
  'cachedManifest', 'isDevVersion', 'tagCommit', 'releaseTagOf', 'integrityStatus', 'integrityLine', 'integrityRemedy'];

test('ARC-11-C141 — the engine\'s integrity verdict is the server build\'s, function for function', () => {
  for (const name of ONE) {
    assert.ok(name in dist, `the build exports no ${name}`);
    assert.equal(engine[name], dist[name], `the engine's ${name} is a second implementation, not the build's`);
  }
});

test('ARC-11-C141 — the signer\'s half stays in the engine, and the build has none of it', () => {
  for (const name of ['signManifest', 'manifestFromArchive', 'archiveDiffers', 'tarEntries', 'writeManifestCache']) {
    assert.equal(typeof engine[name], 'function', `the engine lost ${name}`);
    assert.equal(name in dist, false, `the build carries ${name}, which only a release needs`);
  }
});
