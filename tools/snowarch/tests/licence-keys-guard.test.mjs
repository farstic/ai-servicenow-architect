// ARC-11-C1 — the shipped key modules hold public keys and nothing else.
//
// THE PRIVATE KEYS ARE THE OWNER'S, AND ONLY THE OWNER'S. `licence keygen` writes them outside the
// checkout and refuses anywhere inside it; this is the other half: no file that ships may carry
// private key material, however it got there. A PEM private key always says so in its armour —
// `-----BEGIN PRIVATE KEY-----`, or `ENCRYPTED PRIVATE KEY` — so the marker is the test.
//
// THE COUNT IS 0 OR 2, AND THEN EXACTLY 2. The branch is built with an empty list: the owner runs
// keygen on their own machine and relays the two PUBLIC keys, and they are committed as C1's last code
// commit. Until then every licence is `invalid` or `missing`, and warn-only, so nothing changes for
// anyone. That final commit narrows `ALLOWED_COUNTS` to [2]: a release with one key has no recovery
// key, and one with three trusts a key the owner did not make.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPublicKey } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fingerprint } from '../lib/licence/core.mjs';
import { PRODUCT_KEYS } from '../lib/licence/keys.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ALLOWED_COUNTS = [0, 2];

/** Every file that carries the key list: the CLI's, the server's source, and the server's committed build. */
const SITES = [
  'tools/snowarch/lib/licence/keys.mjs',
  'packages/snowarch/src/licence/keys.ts',
  'packages/snowarch/dist/licence/keys.js',
];

/** Text a shipped key module must never contain, however it is spelled in the armour. */
const privateMaterial = (text) => /PRIVATE KEY/.test(text);

test('ARC-11-C1 — no key module carries private key material', () => {
  for (const rel of SITES) {
    assert.equal(privateMaterial(readFileSync(join(ROOT, rel), 'utf8')), false, `${rel} holds a private key`);
  }
});

test('ARC-11-C1 — the guard sees a private key when there is one', () => {
  const planted = `export const PRODUCT_KEYS = [];\n// -----BEGIN PRIVATE KEY-----\n`;
  assert.equal(privateMaterial(planted), true);
  assert.equal(privateMaterial('-----BEGIN ENCRYPTED PRIVATE KEY-----'), true);
  assert.equal(privateMaterial('-----BEGIN PUBLIC KEY-----'), false);
});

test('ARC-11-C1 — the shipped list is empty until the owner\'s keys land, then a primary and a recovery key', () => {
  assert.ok(ALLOWED_COUNTS.includes(PRODUCT_KEYS.length),
    `${PRODUCT_KEYS.length} product keys — the list holds ${ALLOWED_COUNTS.join(' or ')}`);
  if (PRODUCT_KEYS.length === 0) return;
  assert.deepEqual(PRODUCT_KEYS.map((k) => k.role), ['primary', 'recovery']);
  for (const k of PRODUCT_KEYS) {
    assert.equal(createPublicKey(k.publicKey).asymmetricKeyType, 'ed25519', `${k.role} is not an Ed25519 key`);
    assert.equal(k.fingerprint, fingerprint(k.publicKey), `${k.role}'s fingerprint is not its key's`);
  }
  assert.notEqual(PRODUCT_KEYS[0].fingerprint, PRODUCT_KEYS[1].fingerprint, 'the recovery key is the primary key');
});

test('ARC-11-C1 — the list cannot be changed by whoever imports it', () => {
  assert.ok(Object.isFrozen(PRODUCT_KEYS));
  assert.throws(() => { PRODUCT_KEYS.push({ role: 'primary', fingerprint: 'x', publicKey: 'x' }); });
});
