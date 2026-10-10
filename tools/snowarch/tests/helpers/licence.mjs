/**
 * ARC-11-C1 — keys and licences made by the test that uses them.
 *
 * Nothing here is ever a committed key. The shipped key list is the owner's two public keys and
 * nothing else (`licence-keys-guard.test.mjs`), so every test generates its own pairs and INJECTS
 * them as the product's list. A test that signed with a key from the repository would pass against
 * a product that trusted that key, which is the one product this must never be.
 *
 * A helper rather than exports from a test file: `node --test` runs every test a file registers, so
 * a test file that another test imports runs its own cases twice.
 */
import { generateKeyPairSync } from 'node:crypto';

import { fingerprint, signLicence, signList } from '../../lib/licence/core.mjs';

/** A fresh Ed25519 pair, as PEM, the shape `licence keygen` writes. */
export function keyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }),
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  };
}

/** The key list a release would ship, built from two pairs. */
export const productKeys = (primary, recovery) => [
  { role: 'primary', fingerprint: fingerprint(primary.publicKey), publicKey: primary.publicKey },
  { role: 'recovery', fingerprint: fingerprint(recovery.publicKey), publicKey: recovery.publicKey },
];

/** A licence payload with every field, `over` replacing any of them. */
export const licence = (over = {}) => ({
  id: 'LIC-2026-0002',
  licensee: 'Test Licensee',
  org: 'Test Org',
  scope: 'live',
  issued: '2026-01-15',
  valid_until: '2027-10-10',
  issuer: 'Test Issuer',
  notes: '',
  ...over,
});

/** A licence file's text, signed by `key`, exactly as `licence issue` writes it. */
export const licenceText = (payload, key) => `${JSON.stringify(signLicence(payload, key.privateKey), null, 2)}\n`;

/** A signed revocation list document. */
export const listDoc = (list, key) => signList(list, key.privateKey);
