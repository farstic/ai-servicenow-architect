// ARC-11-C1 — the SessionStart banner's licence line: second, on every path, from the cache, no fetch.
//
// This is the line the CLAUDE.md sentence reads: `enforced` with missing, invalid, expired or revoked
// means no deliverable; anything else is information. So the line must exist on every path the
// banner takes, say `enforced` exactly when the session's environment does, and never be bought with
// a fetch — the hook reads `.local/revocations.json` as some earlier fetch left it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { banner } from '../../tools/snowarch/hooks/session-start.mjs';
import { licencePath, revocationsPath } from '../../tools/snowarch/lib/local-paths.mjs';
import { keyPair, licence, licenceText, listDoc, productKeys } from '../../tools/snowarch/tests/helpers/licence.mjs';
import { tempDir } from '../../tools/snowarch/tests/helpers/temp.mjs';

const primary = keyPair();
const KEYS = productKeys(primary, keyPair());
const NOW = Date.parse('2026-10-10T12:00:00Z');

function unbootstrapped(t) {
  const root = tempDir('snowarch-licence-banner-', t);
  mkdirSync(join(root, '.local'), { recursive: true });
  return root;
}

test('ARC-11-C1 — the licence line follows the Mode line, warn only by default', async (t) => {
  const r = await banner({ root: unbootstrapped(t), env: {} });
  assert.equal(r.path, 'unbootstrapped');
  assert.match(r.lines[0], /^Mode: /);
  assert.equal(r.lines[1], 'Licence: missing · warn only');
  assert.equal(r.lines.length, 2);
});

test('ARC-11-C1 — the line says enforced when the session\'s environment does', async (t) => {
  const r = await banner({ root: unbootstrapped(t), env: { SNOW_LICENCE_ENFORCE: 'true' } });
  assert.equal(r.lines[1], 'Licence: missing · enforced');
});

test('ARC-11-C1 — the cached list is applied, and the hook never refreshes it, however stale', async (t) => {
  const root = unbootstrapped(t);
  writeFileSync(licencePath(root), licenceText(licence(), primary));
  const cache = `${JSON.stringify({ checkedAt: '2020-01-01T00:00:00.000Z', source: 'fixture',
    list: listDoc({ version: 2, revoked: [{ id: 'LIC-2026-0002', revokedAt: '2026-10-09', reason: 'breach' }] }, primary) }, null, 2)}\n`;
  writeFileSync(revocationsPath(root), cache);
  const r = await banner({ root, now: NOW, env: { SNOW_LICENCE_ENFORCE: 'true' }, licenceKeys: KEYS });
  assert.equal(r.lines[1], 'Licence: revoked · enforced');
  assert.equal(readFileSync(revocationsPath(root), 'utf8'), cache, 'the hook rewrote the list');
});

test('ARC-11-C1 — a licence in force names itself and its term', async (t) => {
  const root = unbootstrapped(t);
  writeFileSync(licencePath(root), licenceText(licence(), primary));
  const r = await banner({ root, now: NOW, env: {}, licenceKeys: KEYS });
  assert.equal(r.lines[1], 'Licence: ok · LIC-2026-0002 · until 2027-10-10');
});
