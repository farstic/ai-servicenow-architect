// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C140 — B01 runs whenever its signed manifest is not held, whatever its inputs say.
 *
 * The owner upgraded from 2.0.13 to 2.1.0-rc.1. U4 was 2.0.13's code, which fetches no manifest; U6's bootstrap printed
 * `[B01/09] workspace … ok (cached)`, because B01's inputs had not moved; and U7 ended `E-32 FAIL … no signed manifest
 * for v2.1.0-rc.1`. The cache is B01's OUTPUT, so the runner asks B01 whether it is there (`outputMissing`), the way
 * E-32 reads it (`cachedManifest`), and runs B01 when it is not.
 *
 * The end-to-end proof, the owner's own sequence, is in `tests/upgrade/upgrade-licence.e2e.test.mjs`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import * as B01 from '../lib/steps/B01.mjs';
import { runSteps } from '../lib/steps/index.mjs';
import { hashFor } from '../lib/inputs.mjs';
import { integrityLine, integrityRemedy, integrityStatus, readManifestCache, writeManifestCache }
  from '../lib/licence/manifest.mjs';
import { releaseManifestPath } from '../lib/local-paths.mjs';
import { keyPair, listRepo, manifestDoc, productKeys } from './helpers/licence.mjs';
import { makeCheckout } from './helpers/workspace.mjs';
import { tempDir } from './helpers/temp.mjs';

const signer = keyPair();
const KEYS = productKeys(signer, keyPair());
const NOW = '2026-10-14T09:00:00.000Z';

const config = (root) => JSON.parse(readFileSync(join(root, 'engine.config.json'), 'utf8'));

/** A checkout at `version` whose config names `repo` as the licences repository (`null`: none named). */
function releaseCheckout(t, version, repo) {
  const root = makeCheckout({}, t);
  writeFileSync(join(root, 'package.json'), `${JSON.stringify({ name: 'f', version }, null, 2)}\n`);
  const base = config(root);
  writeFileSync(join(root, 'engine.config.json'), `${JSON.stringify(repo === null ? base : { ...base,
    licence: { revocations: { repo, ref: 'main', path: 'revocations.json' } } }, null, 2)}\n`);
  return root;
}

const ctxFor = (root, over = {}) => ({
  root, config: config(root), mode: 'design-only', node: { present: true, version: '22.11.0' },
  env: process.env, licenceKeys: KEYS,
  state: { steps: {}, registration: 'project', hooksDisabledByBootstrap: false },
  line: () => {}, ...over,
});

const cacheWith = (root, doc, tag) => writeManifestCache(root, { tag, doc, checkedAt: NOW, source: 'fixture' });
/** A repository that cannot be reached: a fetch from it is `unreachable`, so B01 would warn if it fetched. */
const gone = (t) => pathToFileURL(join(tempDir('snowarch-c140-gone-', t), 'missing.git')).href;
const published = (t) => listRepo(t, { 'releases/v9.1.0.json': `${JSON.stringify(manifestDoc('v9.1.0', signer))}\n` });

// ── One reader: B01's question and E-32's state, for every cache ─────────────────────────────────────────────────

test('ARC-09-C140 — B01 declares outputMissing, and the runner asks it', () => {
  assert.equal(typeof B01.outputMissing, 'function', 'B01 has no outputMissing: nothing tells the runner the manifest is gone');
});

test('ARC-09-C140 — one reader: B01\'s verdict and E-32\'s state agree for every cache', (t) => {
  const cases = [
    { name: 'missing', plant: () => {}, e32: 'missing', missing: true },
    { name: 'unreadable', plant: (root) => {
      mkdirSync(join(root, '.local'), { recursive: true });
      writeFileSync(releaseManifestPath(root), '{ not json');
    }, e32: 'missing', missing: true },
    { name: 'not verifying', plant: (root) => cacheWith(root, manifestDoc('v9.1.0', keyPair()), 'v9.1.0'),
      e32: 'invalid', missing: true },
    { name: 'another tag', plant: (root) => cacheWith(root, manifestDoc('v9.0.0', signer), 'v9.0.0'),
      e32: 'other', missing: true },
    // This tag's: held, so B01 has nothing to fetch. E-32 then checks the tree, which this fixture is not: modified.
    { name: 'this tag', plant: (root) => cacheWith(root, manifestDoc('v9.1.0', signer), 'v9.1.0'),
      e32: 'modified', missing: false },
  ];
  for (const c of cases) {
    const root = releaseCheckout(t, '9.1.0', 'owner/licences');
    c.plant(root);
    const e32 = integrityStatus(root, { keys: KEYS, commitOf: () => null });
    assert.equal(e32.state, c.e32, `${c.name}: E-32 read ${e32.state}`);
    assert.equal(B01.outputMissing?.(ctxFor(root)), c.missing, `${c.name}: B01's verdict disagrees with E-32's ${e32.state}`);
  }
});

test('ARC-09-C140 — a development tree, or a config that names no manifests, owes nothing', (t) => {
  const dev = releaseCheckout(t, '9.1.0-dev', 'owner/licences');
  assert.equal(integrityStatus(dev, { keys: KEYS }).state, 'dev');
  assert.equal(B01.outputMissing?.(ctxFor(dev)), false);
  // No source: nothing could be fetched, so running B01 for it would be a run for nothing on every bootstrap.
  assert.equal(B01.outputMissing?.(ctxFor(releaseCheckout(t, '9.1.0', null))), false);
});

// ── The runner: cached by its inputs, run for its output ─────────────────────────────────────────────────────────

/** B01 alone through the real runner, with a recorded `ok` whose hash is this tree's: cached, unless it owes output. */
async function runB01(root, over = {}) {
  const ctx = ctxFor(root, over);
  const state = { steps: { B01: { status: 'ok', inputsHash: hashFor('B01', ctx), finishedAt: NOW, durationMs: 0 } },
    registration: 'project', hooksDisabledByBootstrap: false };
  const lines = [];
  const r = await runSteps({ root, ctx, state, steps: [B01], onLine: (l) => lines.push(l), save: () => {} });
  return { ...r, lines, entry: state.steps.B01 };
}

test('ARC-09-C140 — inputs unchanged and the manifest held: B01 is cached, and nothing is fetched', async (t) => {
  // The repository is unreachable: a fetch would warn, so a clean cache line is proof nothing was fetched.
  const root = releaseCheckout(t, '9.1.0', gone(t));
  cacheWith(root, manifestDoc('v9.1.0', signer), 'v9.1.0');
  const r = await runB01(root);
  assert.equal(r.summary.cached, 1, r.lines.join('\n'));
  assert.deepEqual(r.lines, ['[B01/01] workspace … ok (cached)']);
});

test('ARC-09-C140 — inputs unchanged and no manifest held: B01 runs and fetches it, and the next run is cached', async (t) => {
  const root = releaseCheckout(t, '9.1.0', published(t));
  const first = await runB01(root);
  assert.equal(first.summary.cached, 0, `B01 was cached with no manifest held:\n${first.lines.join('\n')}`);
  assert.ok(first.lines.includes('release manifest: v9.1.0 fetched (1 file)'), first.lines.join('\n'));
  assert.equal(first.entry.status, 'ok');
  assert.equal(readManifestCache(root)?.tag, 'v9.1.0');
  // Its own write does not make it stale: the recorded hash is the same, and the output is there now.
  const second = await runB01(root);
  assert.equal(second.summary.cached, 1, `B01 ran again after it fetched:\n${second.lines.join('\n')}`);
});

test('ARC-09-C140 — a cache that holds another release\'s manifest is fetched again', async (t) => {
  const root = releaseCheckout(t, '9.1.0', published(t));
  cacheWith(root, manifestDoc('v9.0.0', signer), 'v9.0.0');
  const r = await runB01(root);
  assert.equal(r.summary.cached, 0, r.lines.join('\n'));
  assert.ok(r.lines.includes('release manifest: v9.1.0 fetched (1 file)'), r.lines.join('\n'));
  assert.equal(readManifestCache(root)?.tag, 'v9.1.0');
});

test('ARC-09-C140 — no network: B01 warns with the reason, E-32 is missing with the remedy, and nothing throws', async (t) => {
  const root = releaseCheckout(t, '9.1.0', gone(t));
  const r = await runB01(root);
  assert.equal(r.code, 0, r.lines.join('\n'));
  assert.equal(r.entry.status, 'warn');
  assert.match(r.entry.detail, /^release manifest: could not be reached \(.+\)$/);
  const s = integrityStatus(root, { keys: KEYS, commitOf: () => null });
  assert.equal(integrityLine(s), 'Integrity: no signed manifest for v9.1.0 — reinstall from a signed release tag');
  // The spelling is the caller's; `<cli>` keeps this case off every shell's own launcher name.
  assert.equal(integrityRemedy(s, '<cli>'),
    'Run <cli> licence check --refresh to fetch it; if it says none is published, reinstall from a signed release tag.');
});
