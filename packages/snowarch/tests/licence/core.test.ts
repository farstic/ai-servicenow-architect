import { describe, expect, it } from 'vitest';
import { generateKeyPairSync, sign } from 'node:crypto';
import {
  canonicalJson, checkLicence, fingerprint, LICENCE_FORMAT, LIST_FORMAT, newerList, readList,
  type ProductKey,
} from '../../src/licence/core.js';
import { PRODUCT_KEYS } from '../../src/licence/keys.js';

/**
 * ARC-11-C1 — the server's copy of the licence core, on its own.
 *
 * `tools/snowarch/tests/licence-parity.test.mjs` holds this copy equal to the CLI's on every case;
 * these are the cases a reader of the server should not have to leave the package to find. The
 * server never signs anything, so the tests sign with node:crypto directly — over the same canonical
 * form, which is what makes a signature made anywhere checkable here.
 *
 * Every key is generated here. None is ever committed (the guard test holds that).
 */
function pair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  };
}

const primary = pair();
const recovery = pair();
const stranger = pair();
const KEYS: ProductKey[] = [
  { role: 'primary', fingerprint: fingerprint(primary.publicKey), publicKey: primary.publicKey },
  { role: 'recovery', fingerprint: fingerprint(recovery.publicKey), publicKey: recovery.publicKey },
];
const NOW = new Date('2026-10-10T12:00:00Z');

const payload = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'LIC-2026-0002', licensee: 'Test Licensee', org: 'Test Org', scope: 'live', issued: '2026-01-15',
  valid_until: '2027-10-10', issuer: 'Test Issuer', notes: '', ...over,
});

function signed(format: string, field: 'licence' | 'list', body: unknown, key = primary): string {
  const value = sign(null, Buffer.from(canonicalJson(body), 'utf8'), key.privateKey).toString('base64');
  return JSON.stringify({ format, [field]: body, signature: { alg: 'Ed25519', key: fingerprint(key.publicKey), value } });
}

const check = (text: string | null, list: ReturnType<typeof readList> | null = null, keys = KEYS) =>
  checkLicence(text, { keys, now: NOW, list: list && list.ok ? list : null });

describe('ARC-11-C1 — the server\'s licence core', () => {
  it('verifies a licence signed by either product key, and nothing a stranger signed', () => {
    expect(check(signed(LICENCE_FORMAT, 'licence', payload())).state).toBe('ok');
    expect(check(signed(LICENCE_FORMAT, 'licence', payload(), recovery)).key).toBe('recovery');
    expect(check(signed(LICENCE_FORMAT, 'licence', payload(), stranger)).state).toBe('invalid');
  });

  it('refuses a forged field, and reports no id from a licence whose signature fails', () => {
    const doc = JSON.parse(signed(LICENCE_FORMAT, 'licence', payload()));
    doc.licence.scope = 'design-only';
    const s = check(JSON.stringify(doc));
    expect([s.state, s.id, s.signatureValid]).toEqual(['invalid', null, false]);
  });

  it('reads expiry in UTC days: the last day is expiring, the next is expired', () => {
    expect(check(signed(LICENCE_FORMAT, 'licence', payload({ valid_until: '2026-10-10' }))).state).toBe('expiring');
    expect(check(signed(LICENCE_FORMAT, 'licence', payload({ valid_until: '2026-10-09' }))).state).toBe('expired');
    expect(check(signed(LICENCE_FORMAT, 'licence', payload({ valid_until: '2026-11-10' }))).state).toBe('ok');
  });

  it('applies a list only when a product key signed it, and never one with a lower version', () => {
    const entry = { id: 'LIC-2026-0002', revokedAt: '2026-10-11', reason: 'ended' };
    const good = readList(signed(LIST_FORMAT, 'list', { version: 3, revoked: [entry] }), { keys: KEYS });
    expect(check(signed(LICENCE_FORMAT, 'licence', payload()), good).state).toBe('revoked');
    expect(readList(signed(LIST_FORMAT, 'list', { version: 3, revoked: [entry] }, stranger), { keys: KEYS }).ok).toBe(false);
    const older = readList(signed(LIST_FORMAT, 'list', { version: 2, revoked: [] }), { keys: KEYS });
    expect(newerList(good.ok ? good : null, older.ok ? older : null)).toBe(good);
  });

  it('is missing with no file, and invalid with no shipped key', () => {
    expect(check(null).state).toBe('missing');
    expect(check(signed(LICENCE_FORMAT, 'licence', payload()), null, []).state).toBe('invalid');
  });

  it('ships a frozen list of 0 or 2 public keys', () => {
    expect([0, 2]).toContain(PRODUCT_KEYS.length);
    expect(Object.isFrozen(PRODUCT_KEYS)).toBe(true);
  });
});
