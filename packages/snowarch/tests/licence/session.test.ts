import { afterEach, describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertLicensed, currentLicence, initLicence, licenceAuditField, resetLicenceForTests, takeLicenceNotice,
} from '../../src/licence/session.js';
import { ServiceNowError } from '../../src/utils/errors.js';
import { remedyFor } from '../../src/errors/codes.js';
import { checkout, fromToday, keysOf, licence, licenceText, listText, pair } from './fixtures.js';

/**
 * ARC-11-C1 — the server's licence session: computed once at start, refusing under enforcement,
 * one notice on the first answer, and the id in the audit trail only from an authentic licence.
 */
const primary = pair();
const KEYS = keysOf(primary, pair());
const ENFORCED = { SNOW_LICENCE_ENFORCE: 'true' };

function start(env: Record<string, string>, file: string | null = null, cache: string | null = null): string {
  const root = checkout();
  if (file !== null) writeFileSync(join(root, '.local', 'licence.json'), file);
  if (cache !== null) writeFileSync(join(root, '.local', 'revocations.json'), cache);
  initLicence({ root, env, keys: KEYS });
  return root;
}

const refusal = (): ServiceNowError | null => {
  try { assertLicensed(); return null; } catch (e) { return e as ServiceNowError; }
};

afterEach(() => resetLicenceForTests());

describe('ARC-11-C1 — the server\'s licence session', () => {
  it('is warn only by default: nothing refused, one notice on the first answer, no audit key', () => {
    start({});
    expect(currentLicence().state).toBe('missing');
    expect(refusal()).toBeNull();
    expect(takeLicenceNotice()).toMatch(/^Licence: missing · warn only — /);
    expect(takeLicenceNotice()).toBeNull();
    expect(licenceAuditField()).toEqual({});
  });

  it('refuses every call under enforcement with no licence, with the code and the remedy', () => {
    start(ENFORCED);
    const e = refusal();
    expect(e).toBeInstanceOf(ServiceNowError);
    expect(e?.code).toBe('LICENCE_NOT_VALID');
    expect(e?.message).toMatch(/^licence missing — SNOW_LICENCE_ENFORCE is "true", so no tool runs without a valid licence/);
    expect(e?.message).toContain('licence check to see why');
  });

  it('refuses a design-only licence under enforcement, naming the scope (ruling (d))', () => {
    start(ENFORCED, licenceText(licence({ scope: 'design-only' }), primary));
    const e = refusal();
    expect(e?.code).toBe('LICENCE_NOT_VALID');
    expect(e?.message).toMatch(/^licence LIC-2026-0002 covers design-only; live needs a live-scope licence/);
  });

  it('serves a live licence in force, and an expiring one, under enforcement', () => {
    start(ENFORCED, licenceText(licence(), primary));
    expect(refusal()).toBeNull();
    expect(takeLicenceNotice()).toBeNull();
    resetLicenceForTests();
    start(ENFORCED, licenceText(licence({ valid_until: fromToday(10) }), primary));
    expect(refusal()).toBeNull();
    expect(takeLicenceNotice()).toMatch(/^Licence: expiring · LIC-2026-0002 · until \d{4}-\d{2}-\d{2} · enforced — 10 days left/);
  });

  it('refuses a revoked licence, read from the cached list', () => {
    const list = listText(3, [{ id: 'LIC-2026-0002', revokedAt: fromToday(-1), reason: 'breach' }], primary);
    start(ENFORCED, licenceText(licence(), primary), JSON.stringify({ checkedAt: new Date().toISOString(), source: 'fixture', list: JSON.parse(list) }));
    expect(refusal()?.message).toMatch(/^licence revoked \(LIC-2026-0002\) — /);
  });

  it('puts the id in the audit line only when the signature holds — revoked and expired included', () => {
    start({}, licenceText(licence(), primary));
    expect(licenceAuditField()).toEqual({ licence: 'LIC-2026-0002' });
    resetLicenceForTests();
    start({}, licenceText(licence({ valid_until: fromToday(-3) }), primary));
    expect(licenceAuditField()).toEqual({ licence: 'LIC-2026-0002' });
    resetLicenceForTests();
    const forged = JSON.parse(licenceText(licence(), primary));
    forged.licence.id = 'LIC-2026-9999';
    start({}, JSON.stringify(forged));
    expect(licenceAuditField()).toEqual({});
  });

  it('carries the remedy the CLI prints, and keeps the code out of the always-loaded rule file', () => {
    const entry = remedyFor('LICENCE_NOT_VALID', { cli: './snowarch', bootstrap: './bootstrap.sh' });
    expect(entry.remedy).toMatch(/^Run \.\/snowarch licence check to see why/);
    expect(entry.command).toBe('./snowarch licence check');
    expect(entry.showInRule).toBe(false);
  });
});
