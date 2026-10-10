// ARC-11-C1 — the licence as this checkout holds it: the files, the enforcement switch, the line.
//
// `core.mjs` judges a text; this layer finds the text (`.local/licence.json`), the list it is judged
// against (`.local/revocations.json`, written only by a fetch somebody started) and whether
// SNOW_LICENCE_ENFORCE is on — and says the result in the one line the banner, the doctor and the
// server's first answer all print.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  bannerLine, CLI_ALLOWED, ENFORCE_VAR, isEnforced, licenceStatus, listStale, readListCache, REFUSED, REMEDY,
  writeListCache,
} from '../lib/licence/state.mjs';
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

const status = (root, env = {}) => licenceStatus(root, { keys: KEYS, now: NOW, env });

test('ARC-11-C1 — the two .local paths', () => {
  assert.equal(licencePath('/c'), join('/c', '.local', 'licence.json'));
  assert.equal(revocationsPath('/c'), join('/c', '.local', 'revocations.json'));
});

test('ARC-11-C1 — enforcement is on only for the exact string "true", like every flag', () => {
  assert.equal(ENFORCE_VAR, 'SNOW_LICENCE_ENFORCE');
  assert.equal(isEnforced({ SNOW_LICENCE_ENFORCE: 'true' }), true);
  for (const v of [undefined, '', 'TRUE', '1', 'yes', ' true']) {
    assert.equal(isEnforced({ SNOW_LICENCE_ENFORCE: v }), false, String(v));
  }
  assert.deepEqual([...REFUSED], ['missing', 'invalid', 'expired', 'revoked']);
  assert.deepEqual([...CLI_ALLOWED], ['licence', 'doctor', 'status', 'version', 'upgrade']);
});

test('ARC-11-C1 — the banner line has the settled shapes', () => {
  const s = (state, over = {}) => ({ state, id: null, scope: 'live', validUntil: null, perpetual: false, ...over });
  const lic = { id: 'LIC-2026-0002', validUntil: '2027-10-10' };
  assert.equal(bannerLine(s('ok', lic), { enforced: false }), 'Licence: ok · LIC-2026-0002 · until 2027-10-10');
  assert.equal(bannerLine(s('ok', lic), { enforced: true }), 'Licence: ok · LIC-2026-0002 · until 2027-10-10');
  assert.equal(bannerLine(s('ok', { id: 'LIC-2026-0001', perpetual: true }), { enforced: false }),
    'Licence: ok · LIC-2026-0001 · perpetual');
  assert.equal(bannerLine(s('ok', { ...lic, scope: 'design-only' }), { enforced: false }),
    'Licence: ok · LIC-2026-0002 · design-only · until 2027-10-10');
  assert.equal(bannerLine(s('expiring', { ...lic, validUntil: '2026-10-20' }), { enforced: false }),
    'Licence: expiring · LIC-2026-0002 · until 2026-10-20 · warn only');
  assert.equal(bannerLine(s('expiring', { ...lic, validUntil: '2026-10-20' }), { enforced: true }),
    'Licence: expiring · LIC-2026-0002 · until 2026-10-20 · enforced');
  assert.equal(bannerLine(s('missing'), { enforced: false }), 'Licence: missing · warn only');
  assert.equal(bannerLine(s('missing'), { enforced: true }), 'Licence: missing · enforced');
  assert.equal(bannerLine(s('revoked', lic), { enforced: true }), 'Licence: revoked · enforced');
  assert.equal(bannerLine(s('expired', lic), { enforced: false }), 'Licence: expired · warn only');
  assert.equal(bannerLine(s('invalid'), { enforced: false }), 'Licence: invalid · warn only');
});

test('ARC-11-C1 — the checkout\'s status: missing, then ok, then revoked by the cached list', (t) => {
  assert.equal(status(checkout(t)).state, 'missing');
  const text = licenceText(licence(), primary);
  const ok = status(checkout(t, { licenceFile: text }));
  assert.equal(ok.state, 'ok');
  assert.equal(ok.enforced, false);
  assert.equal(ok.list, null);
  const cache = { checkedAt: NOW.toISOString(), source: 'fixture',
    list: listDoc({ version: 3, revoked: [{ id: 'LIC-2026-0002', revokedAt: '2026-10-09', reason: 'ended' }] }, primary) };
  const revoked = status(checkout(t, { licenceFile: text, cache }), { SNOW_LICENCE_ENFORCE: 'true' });
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
  assert.match(REMEDY('./snowarch'), /^Run \.\/snowarch licence check to see why/);
  assert.match(REMEDY('./snowarch'), /SNOW_LICENCE_ENFORCE/);
});
