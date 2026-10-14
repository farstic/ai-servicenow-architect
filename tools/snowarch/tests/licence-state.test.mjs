// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-11-C1 — the licence as this checkout holds it: the files and the line.
//
// `core.mjs` judges a text; this layer finds the text (`.local/licence.json`) and the list it is judged
// against (`.local/revocations.json`, written only by a fetch somebody started), and says the result in
// the one line the banner, the doctor and the server's first answer all print. Enforcement is on every
// build (ARC-11-C6): `licence-unconditional.test.mjs` holds that no variable turns it off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  bannerLine, CLI_ALLOWED, licenceStatus, listStale, readListCache, REFUSED, REMEDY,
  writeListCache,
} from '../lib/licence/state.mjs';
import * as state from '../lib/licence/state.mjs';
import { licencePath, revocationsPath } from '../lib/local-paths.mjs';
import { keyPair, licence, licenceText, listDoc, productKeys } from './helpers/licence.mjs';
import { tempDir } from './helpers/temp.mjs';

const primary = keyPair();
const recovery = keyPair();
const stranger = keyPair();
const KEYS = productKeys(primary, recovery);
const NOW = new Date('2026-10-10T12:00:00Z');

function checkout(t, { licenceFile = null, cache = null } = {}) {
  const root = tempDir('snowarch-licence-state-', t);
  mkdirSync(join(root, '.local'), { recursive: true });
  if (licenceFile !== null) writeFileSync(licencePath(root), licenceFile);
  if (cache !== null) writeFileSync(revocationsPath(root), typeof cache === 'string' ? cache : JSON.stringify(cache));
  return root;
}

const status = (root) => licenceStatus(root, { keys: KEYS, now: NOW });

test('ARC-11-C1 — the two .local paths', () => {
  assert.equal(licencePath('/c'), join('/c', '.local', 'licence.json'));
  assert.equal(revocationsPath('/c'), join('/c', '.local', 'revocations.json'));
});

test('ARC-11-C6 — the refused states, and the commands that run without a licence, as a list', () => {
  assert.deepEqual([...REFUSED], ['missing', 'invalid', 'expired', 'revoked']);
  // The five a person needs to see and repair the state (R1), and bootstrap in full (ruling A): installing is
  // how a licence is first seen. A later addition is a visible decision: it changes this list.
  assert.deepEqual([...CLI_ALLOWED], ['licence', 'doctor', 'status', 'version', 'upgrade', 'bootstrap']);
  // And one form of one command: `mode design`, which deregisters before a folder is deleted (INSTALL.md, Uninstall).
  assert.deepEqual(JSON.parse(JSON.stringify(state.CLI_ALLOWED_FORMS ?? null)), { mode: ['design'] });
});

test('ARC-11-C6 — the banner line has the settled shapes, and no state carries a word for enforcement', () => {
  const s = (state, over = {}) => ({ state, id: null, scope: 'live', validUntil: null, perpetual: false, ...over });
  const lic = { id: 'LIC-2026-0002', validUntil: '2027-10-10' };
  assert.equal(bannerLine(s('ok', lic)), 'Licence: ok · LIC-2026-0002 · until 2027-10-10');
  assert.equal(bannerLine(s('ok', { id: 'LIC-2026-0001', perpetual: true })), 'Licence: ok · LIC-2026-0001 · perpetual');
  assert.equal(bannerLine(s('ok', { ...lic, scope: 'design-only' })), 'Licence: ok · LIC-2026-0002 · design-only · until 2027-10-10');
  assert.equal(bannerLine(s('expiring', { ...lic, validUntil: '2026-10-20' })), 'Licence: expiring · LIC-2026-0002 · until 2026-10-20');
  assert.equal(bannerLine(s('missing')), 'Licence: missing');
  assert.equal(bannerLine(s('revoked', lic)), 'Licence: revoked');
  assert.equal(bannerLine(s('expired', lic)), 'Licence: expired');
  assert.equal(bannerLine(s('invalid')), 'Licence: invalid');
});

test('ARC-11-C1 — the checkout\'s status: missing, then ok, then revoked by the cached list', (t) => {
  assert.equal(status(checkout(t)).state, 'missing');
  const text = licenceText(licence(), primary);
  const ok = status(checkout(t, { licenceFile: text }));
  assert.equal(ok.state, 'ok');
  assert.equal(ok.enforced, true);
  assert.equal(ok.list, null);
  const cache = { checkedAt: NOW.toISOString(), source: 'fixture',
    list: listDoc({ version: 3, revoked: [{ id: 'LIC-2026-0002', revokedAt: '2026-10-09', reason: 'ended' }] }, primary) };
  const revoked = status(checkout(t, { licenceFile: text, cache }));
  assert.equal(revoked.state, 'revoked');
  assert.equal(revoked.enforced, true);
  assert.deepEqual(revoked.list, { version: 3, checkedAt: NOW.toISOString() });
});

test('ARC-11-C1 — a cache that is malformed, or holds a list no product key signed, is no list at all', (t) => {
  const text = licenceText(licence(), primary);
  assert.equal(status(checkout(t, { licenceFile: text, cache: '{not json' })).state, 'ok');
  const forged = { checkedAt: NOW.toISOString(), source: 'fixture',
    list: listDoc({ version: 9, revoked: [{ id: 'LIC-2026-0002', revokedAt: '2026-10-09', reason: 'breach' }] }, stranger) };
  const s = status(checkout(t, { licenceFile: text, cache: forged }));
  assert.equal(s.state, 'ok');
  assert.equal(s.list, null);
});

test('ARC-11-C1 — the list is stale when there is none, when it is a day old, or when it is from the future', () => {
  const at = (iso) => ({ checkedAt: iso });
  assert.equal(listStale(null, NOW), true);
  assert.equal(listStale(at('2026-10-10T11:00:00Z'), NOW), false);
  assert.equal(listStale(at('2026-10-09T12:00:00Z'), NOW), true);
  assert.equal(listStale(at('2026-10-10T13:00:00Z'), NOW), true);
  assert.equal(listStale(at('yesterday'), NOW), true);
});

test('ARC-11-C1 — the cache is written whole, 0600, and read back', (t) => {
  const root = checkout(t);
  const list = listDoc({ version: 1, revoked: [] }, primary);
  writeListCache(root, { list, checkedAt: NOW.toISOString(), source: 'file:///fixture main:revocations.json' });
  assert.deepEqual(readListCache(root), { checkedAt: NOW.toISOString(), source: 'file:///fixture main:revocations.json', list });
  if (process.platform !== 'win32') assert.equal(statSync(revocationsPath(root)).mode & 0o777, 0o600);
  assert.equal(readFileSync(revocationsPath(root), 'utf8').endsWith('\n'), true);
});

test('ARC-11-C1 — the remedy names the command that explains the state', () => {
  // The launcher is a parameter, so the case passes a placeholder rather than spelling a shell.
  assert.ok(REMEDY('<cli>').startsWith('Run <cli> licence check to see why'), REMEDY('<cli>'));
  // No way out but a licence: the remedy names no variable (ARC-11-C6).
  assert.doesNotMatch(REMEDY('<cli>'), /SNOW_|unset/);
  assert.match(REMEDY('<cli>'), /install a valid licence as \.local\/licence\.json\./);
});
