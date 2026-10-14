// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
import { afterEach, describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertLicensed, currentLicence, initLicence, licenceAuditField, licenceRefusalFields, resetLicenceForTests,
  takeLicenceNotice,
} from '../../src/licence/session.js';
import { ServiceNowError } from '../../src/utils/errors.js';
import { remedyFor } from '../../src/errors/codes.js';
import { checkout, fromToday, keysOf, licence, licenceText, listText, pair, removeFixtureDirs } from './fixtures.js';

/**
 * ARC-11-C1 — the server's licence session: computed once at start, refusing on every build (ARC-11-C6),
 * one notice on the first answer, and the id in the audit trail only from an authentic licence.
 */
const primary = pair();
const KEYS = keysOf(primary, pair());
function start(file: string | null = null, cache: string | null = null): string {
  const root = checkout();
  if (file !== null) writeFileSync(join(root, '.local', 'licence.json'), file);
  if (cache !== null) writeFileSync(join(root, '.local', 'revocations.json'), cache);
  initLicence({ root, keys: KEYS });
  return root;
}

const refusal = (): ServiceNowError | null => {
  try { assertLicensed(); return null; } catch (e) { return e as ServiceNowError; }
};

afterEach(() => { resetLicenceForTests(); removeFixtureDirs(); });

describe('ARC-11-C1 — the server\'s licence session', () => {
  it('with no licence: one notice on the first answer, naming the state, and no audit key', () => {
    start();
    expect(currentLicence().state).toBe('missing');
    expect(takeLicenceNotice()).toMatch(/^Licence: missing — this checkout has no licence\. Run /);
    expect(takeLicenceNotice()).toBeNull();
    expect(licenceAuditField()).toEqual({});
  });

  it('refuses every call with no licence, on every build, with the code and the remedy', () => {
    start();
    const e = refusal();
    expect(e).toBeInstanceOf(ServiceNowError);
    expect(e?.code).toBe('LICENCE_NOT_VALID');
    expect(e?.message).toMatch(/^licence missing — no tool runs without a valid licence\. /);
    expect(e?.message).toContain('licence check to see why');
    expect(e?.message).not.toMatch(/SNOW_|unset/);
  });

  it('refuses a design-only licence, naming the scope (ruling (d))', () => {
    start(licenceText(licence({ scope: 'design-only' }), primary));
    const e = refusal();
    expect(e?.code).toBe('LICENCE_NOT_VALID');
    expect(e?.message).toMatch(/^licence LIC-2026-0002 covers design-only; live needs a live-scope licence/);
  });

  it('serves a live licence in force, and an expiring one', () => {
    start(licenceText(licence(), primary));
    expect(refusal()).toBeNull();
    expect(takeLicenceNotice()).toBeNull();
    resetLicenceForTests();
    start(licenceText(licence({ valid_until: fromToday(10) }), primary));
    expect(refusal()).toBeNull();
    expect(takeLicenceNotice()).toMatch(/^Licence: expiring · LIC-2026-0002 · until \d{4}-\d{2}-\d{2} — 10 days left/);
  });

  it('names the last day in the notice, and says "1 day left" on the day before it (ARC-11-C6 step 7)', () => {
    // 23:59:59 UTC on 2026-10-10: the last day still counts (docs/USER-GUIDE.md), and serves.
    const now = (): Date => new Date('2026-10-10T23:59:59Z');
    for (const [until, why] of [['2026-10-10', 'last day'], ['2026-10-11', '1 day left'], ['2026-10-20', '10 days left']]) {
      resetLicenceForTests();
      const root = checkout();
      writeFileSync(join(root, '.local', 'licence.json'), licenceText(licence({ valid_until: until }), primary));
      initLicence({ root, keys: KEYS, now });
      expect(refusal()).toBeNull();
      expect(takeLicenceNotice()).toMatch(new RegExp(`^Licence: expiring · LIC-2026-0002 · until ${until} — ${why}\\. Run `));
    }
  });

  it('refuses a revoked licence, read from the cached list', () => {
    const list = listText(3, [{ id: 'LIC-2026-0002', revokedAt: fromToday(-1), reason: 'breach' }], primary);
    start(licenceText(licence(), primary), JSON.stringify({ checkedAt: new Date().toISOString(), source: 'fixture', list: JSON.parse(list) }));
    expect(refusal()?.message).toMatch(/^licence revoked \(LIC-2026-0002\) — /);
  });

  it('puts the id in the audit line only when the signature holds — revoked and expired included', () => {
    start(licenceText(licence(), primary));
    expect(licenceAuditField()).toEqual({ licence: 'LIC-2026-0002' });
    resetLicenceForTests();
    start(licenceText(licence({ valid_until: fromToday(-3) }), primary));
    expect(licenceAuditField()).toEqual({ licence: 'LIC-2026-0002' });
    resetLicenceForTests();
    const forged = JSON.parse(licenceText(licence(), primary));
    forged.licence.id = 'LIC-2026-9999';
    start(JSON.stringify(forged));
    expect(licenceAuditField()).toEqual({});
  });

  it('names a refusal for the audit trail: the id only when its signature holds, and why (polish 2)', () => {
    // The owner's rc.1 sitting found the refusals left no trace. A refused attempt is evidence, so the
    // router's refusal writes one line naming the licence and the state; a forged file's id is unverified
    // text, so it is never written.
    start();
    expect(licenceRefusalFields()).toEqual({ licence: 'missing', state: 'missing' });
    resetLicenceForTests();
    const list = listText(3, [{ id: 'LIC-2026-0002', revokedAt: fromToday(-1), reason: 'breach' }], primary);
    start(licenceText(licence(), primary),
      JSON.stringify({ checkedAt: new Date().toISOString(), source: 'fixture', list: JSON.parse(list) }));
    expect(licenceRefusalFields()).toEqual({ licence: 'LIC-2026-0002', state: 'revoked' });
    resetLicenceForTests();
    start(licenceText(licence({ valid_until: fromToday(-3) }), primary));
    expect(licenceRefusalFields()).toEqual({ licence: 'LIC-2026-0002', state: 'expired' });
    resetLicenceForTests();
    start(licenceText(licence({ scope: 'design-only' }), primary));
    expect(licenceRefusalFields()).toEqual({ licence: 'LIC-2026-0002', state: 'scope' });
    resetLicenceForTests();
    const forged = JSON.parse(licenceText(licence(), primary));
    forged.licence.id = 'LIC-2026-9999';
    start(JSON.stringify(forged));
    expect(licenceRefusalFields()).toEqual({ licence: 'missing', state: 'invalid' });
  });

  it('carries the remedy the CLI prints, and keeps the code out of the always-loaded rule file', () => {
    // Placeholders, not a shell: what is under test is the sentence, and the launcher is filled in by the caller.
    const entry = remedyFor('LICENCE_NOT_VALID', { cli: '<cli>', bootstrap: '<bootstrap>' });
    expect(entry.remedy.startsWith('Run <cli> licence check to see why')).toBe(true);
    expect(entry.command).toBe('<cli> licence check');
    expect(entry.showInRule).toBe(false);
  });
});
