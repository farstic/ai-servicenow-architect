// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { routeToolInvocation } from '../../src/tools/index.js';
import {
  assertIntegrity, currentIntegrity, initIntegrity, initLicence, integrityRefusalFields, resetIntegrityForTests,
  resetLicenceForTests, takeIntegrityNotice,
} from '../../src/licence/session.js';
import { ERROR_CODE_NAMES } from '../../src/errors/codes.js';
import { checkout, fixtureDir, keysOf, licence, licenceText, pair, releaseCheckout, removeFixtureDirs } from './fixtures.js';

/**
 * ARC-11-C141 — the server's half of restore-and-continue (the owner's ruling, 2026-10-14; the architect's Q8, R4).
 *
 * At its start the server checks the checkout in full, once (the mtime trick has no purchase here), and restores what
 * it can. A restore continues, and its line rides the session's first answer as the licence notice does, because the
 * server's stdout is the protocol and nothing else may be written there. A tree that cannot be restored refuses every
 * tool with INTEGRITY_NOT_VERIFIED, after the licence: one refusal names one reason.
 */
const primary = pair();
const KEYS = keysOf(primary, pair());

afterEach(() => { resetLicenceForTests(); resetIntegrityForTests(); removeFixtureDirs(); });

const route = (name: string, args: Record<string, unknown> = {}) => routeToolInvocation(null as never, name, args);
const audit = (): string => {
  const file = join(fixtureDir('snowarch-integrity-audit-'), 'audit.jsonl');
  process.env.SNOW_AUDIT_FILE = file;
  return file;
};
afterEach(() => { delete process.env.SNOW_AUDIT_FILE; });

describe('ARC-11-C141 — the server restores at its start, and refuses only what it cannot restore', () => {
  it('INTEGRITY_NOT_VERIFIED is a registered code', () => {
    expect(ERROR_CODE_NAMES.has('INTEGRITY_NOT_VERIFIED')).toBe(true);
  });

  it('a signed tree is verified: no refusal, no notice', () => {
    const root = releaseCheckout({ key: primary });
    expect(initIntegrity({ root, keys: KEYS }).state).toBe('verified');
    expect(() => assertIntegrity()).not.toThrow();
    expect(takeIntegrityNotice()).toBeNull();
  });

  it('a changed skill is put back at the start; the line rides the first answer once, and every tool runs', () => {
    const file = audit();
    const root = releaseCheckout({ key: primary });
    writeFileSync(join(root, '.claude/skills/s/SKILL.md'), 'my edit\n');
    const e = initIntegrity({ root, keys: KEYS });
    expect(e.state).toBe('restored');
    expect(readFileSync(join(root, '.claude/skills/s/SKILL.md'), 'utf8')).toBe('signed skill\n');
    expect(() => assertIntegrity()).not.toThrow();
    expect(takeIntegrityNotice()).toMatch(/^Integrity: restored — The AI Architect's own files are not yours to change under this licence: 1 file restored from v9\.1\.0, /);
    expect(takeIntegrityNotice()).toBeNull();
    expect(JSON.parse(readFileSync(file, 'utf8').trim())).toMatchObject({ gate: 'integrity', action: 'restored', tag: 'v9.1.0',
      files: ['.claude/skills/s/SKILL.md'], moved: [] });
  });

  it('the start hashes in full: a change with its mtime and size put back is still found', () => {
    audit();
    const root = releaseCheckout({ key: primary });
    // A whole-second mtime, so the one put back below is the same to the last digit: `utimesSync` drops the
    // sub-millisecond part a file system records, and a stamp off by that much would make the stat key see the edit.
    const p = join(root, 'CLAUDE.md');
    const at = new Date('2026-10-14T12:00:00.000Z');
    utimesSync(p, at, at);
    // A verified run first records the stat key, which the hook and the launcher trust.
    initIntegrity({ root, keys: KEYS });
    resetIntegrityForTests();
    const before = statSync(p);
    writeFileSync(p, '# SIGNED\n');                    // same length as '# signed\n'
    utimesSync(p, at, at);
    const after = statSync(p);
    expect([after.mtimeMs, after.size], 'the stat key would see this edit, so the case could not tell a full hash from it')
      .toEqual([before.mtimeMs, before.size]);
    expect(initIntegrity({ root, keys: KEYS }).state).toBe('restored');
  });

  it('a tree that cannot be restored refuses every tool with INTEGRITY_NOT_VERIFIED, the line its message', async () => {
    const root = releaseCheckout({ key: primary, cache: false });
    mkdirSync(join(root, '.local'), { recursive: true });
    writeFileSync(join(root, '.local', 'licence.json'), licenceText(licence(), primary));
    initLicence({ root, keys: KEYS });
    initIntegrity({ root, keys: KEYS });
    const line = 'Integrity: cannot restore — no signed manifest for v9.1.0 — Run ./snowarch licence check --refresh to fetch it; '
      + 'if it says none is published, reinstall from a signed release tag.';
    await expect(route('snow_core_instances_index')).rejects.toMatchObject({ code: 'INTEGRITY_NOT_VERIFIED', message: line });
    expect(integrityRefusalFields()).toEqual({ state: 'missing', tag: 'v9.1.0' });
  });

  it('the licence is asked first: with both refused, the refusal is LICENCE_NOT_VALID', async () => {
    const root = releaseCheckout({ key: primary, cache: false });
    initLicence({ root, keys: KEYS });
    initIntegrity({ root, keys: KEYS });
    await expect(route('snow_core_instances_index')).rejects.toMatchObject({ code: 'LICENCE_NOT_VALID' });
  });

  it('outside an engine checkout (the published package, a test root) nothing is checked and nothing refused', async () => {
    const root = checkout();
    writeFileSync(join(root, '.local', 'licence.json'), licenceText(licence(), primary));
    initLicence({ root, keys: KEYS });
    expect(initIntegrity({ root, keys: KEYS })).toMatchObject({ state: 'exempt', why: 'not-engine' });
    await expect(route('snow_core_instances_index')).resolves.toBeDefined();
    expect(currentIntegrity().state).toBe('exempt');
  });
});
