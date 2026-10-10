// ARC-11-C1 — the CLI and the server reach the same verdict on the same licence, with the same keys.
//
// TWO COPIES, BECAUSE THE SERVER IMPORTS NOTHING FROM OUTSIDE ITS PACKAGE. The key list, the
// canonical form, the signature check, the states and the banner wording exist once in
// `tools/snowarch/lib/licence/` and once in `packages/snowarch/src/licence/`. A doctor that says
// `ok` while the server refuses, or a banner that says `revoked` while the server serves, is the
// failure two copies invite, and nothing but a comparison notices it. This file is that comparison,
// run against the server's COMMITTED build, which is what a checkout actually starts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import * as cli from '../lib/licence/core.mjs';
import { PRODUCT_KEYS as CLI_KEYS } from '../lib/licence/keys.mjs';
import { bannerLine as cliBanner, REMEDY as CLI_REMEDY } from '../lib/licence/state.mjs';
import { listSource as cliSource } from '../lib/licence/fetch.mjs';
import { keyPair, licence, licenceText, listDoc, productKeys } from './helpers/licence.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const dist = (rel) => import(pathToFileURL(join(ROOT, 'packages/snowarch/dist', rel)).href);
const server = await dist('licence/core.js');
const { PRODUCT_KEYS: SERVER_KEYS } = await dist('licence/keys.js');
const serverState = await dist('licence/state.js');
const { remedyFor } = await dist('errors/codes.js');

const primary = keyPair();
const recovery = keyPair();
const stranger = keyPair();
const KEYS = productKeys(primary, recovery);
const NOW = new Date('2026-10-10T12:00:00Z');

test('ARC-11-C1 — the two key lists are the same list', () => {
  assert.deepEqual(SERVER_KEYS, CLI_KEYS);
});

test('ARC-11-C1 — the two canonical forms and fingerprints agree', () => {
  const values = [
    {}, [], null, 'x', 0, -1.5, true, { b: [1, { d: 4, c: 3 }], a: 'ü' }, { a: undefined, b: null },
    licence(), { nested: { deeper: { deepest: [null, false, 'Тест'] } } },
  ];
  for (const v of values) assert.equal(server.canonicalJson(v), cli.canonicalJson(v), JSON.stringify(v));
  assert.throws(() => server.canonicalJson({ n: Number.POSITIVE_INFINITY }), /finite/);
  for (const k of [primary, recovery, stranger]) assert.equal(server.fingerprint(k.publicKey), cli.fingerprint(k.publicKey));
});

/** Every verdict the core can reach, each as the text of a file and the options it is read with. */
function cases() {
  const { valid_until: _, ...forever } = licence({ id: 'LIC-2026-0001' });
  const doc = JSON.parse(licenceText(licence(), primary));
  doc.licence.valid_until = '2099-12-31';
  const revoked = cli.readList(listDoc({ version: 4, revoked: [{ id: 'LIC-2026-0002', revokedAt: '2026-10-09', reason: 'breach' }] }, primary), { keys: KEYS });
  return [
    ['ok', licenceText(licence(), primary), {}],
    ['recovery', licenceText(licence(), recovery), {}],
    ['stranger', licenceText(licence(), stranger), {}],
    ['perpetual', licenceText(forever, primary), {}],
    ['perpetual stranger', licenceText(forever, stranger), {}],
    ['expiring', licenceText(licence({ valid_until: '2026-10-20' }), primary), {}],
    ['last day', licenceText(licence({ valid_until: '2026-10-10' }), primary), {}],
    ['expired', licenceText(licence({ valid_until: '2026-10-09' }), primary), {}],
    ['design-only', licenceText(licence({ scope: 'design-only' }), primary), {}],
    ['forged', JSON.stringify(doc), {}],
    ['missing', null, {}],
    ['garbage', 'not json', {}],
    ['bad id', licenceText(licence({ id: 'LIC-1' }), primary), {}],
    ['revoked', licenceText(licence(), primary), { list: revoked }],
    ['no keys', licenceText(licence(), primary), { keys: [] }],
  ];
}

test('ARC-11-C1 — the CLI and the server reach the same status on every case', () => {
  for (const [name, text, opts] of cases()) {
    const o = { keys: KEYS, now: NOW, list: null, ...opts };
    assert.deepEqual(server.checkLicence(text, o), cli.checkLicence(text, o), name);
  }
});

test('ARC-11-C1 — the CLI and the server read the same lists the same way, and keep the same one', () => {
  const entry = { id: 'LIC-2026-0002', revokedAt: '2026-10-11', reason: 'other' };
  const docs = [
    listDoc({ version: 1, revoked: [entry] }, primary),
    listDoc({ version: 2, revoked: [] }, recovery),
    listDoc({ version: 1, revoked: [entry] }, stranger),
    listDoc({ version: 1, revoked: [{ ...entry, notes: 'free text' }] }, primary),
    'not json',
  ];
  for (const doc of docs) assert.deepEqual(server.readList(doc, { keys: KEYS }), cli.readList(doc, { keys: KEYS }));
  const [one, two] = docs.slice(0, 2).map((d) => cli.readList(d, { keys: KEYS }));
  assert.deepEqual(server.newerList(two, one), cli.newerList(two, one));
  assert.deepEqual(server.newerList(one, two), cli.newerList(one, two));
});

test('ARC-11-C1 — the banner line and the server\'s notice say the state in the same words', () => {
  for (const [name, text, opts] of cases()) {
    const s = cli.checkLicence(text, { keys: KEYS, now: NOW, list: null, ...opts });
    for (const enforced of [false, true]) {
      assert.equal(serverState.licenceLine(s, { enforced }), cliBanner(s, { enforced }), `${name} enforced=${enforced}`);
    }
  }
});

test('ARC-11-C1 — the CLI refuses with the remedy the server\'s error code carries', () => {
  const spell = { cli: '<cli>', bootstrap: '<bootstrap>' };
  assert.equal(CLI_REMEDY(spell.cli), remedyFor('LICENCE_NOT_VALID', spell).remedy);
});

test('ARC-11-C1 — the CLI and the server read the list\'s address from the same config the same way', () => {
  const configs = [
    { licence: { revocations: { repo: 'farstic/snowarch-licences', ref: 'main', path: 'revocations.json' } } },
    { licence: { revocations: { repo: 'file:///tmp/list.git', ref: 'main', path: 'revocations.json' } } },
    { licence: {} }, {}, null,
  ];
  for (const c of configs) assert.deepEqual(serverState.listSource(c), cliSource(c), JSON.stringify(c));
});
