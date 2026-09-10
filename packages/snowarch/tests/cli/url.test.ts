import { describe, expect, it } from 'vitest';

import { ERROR_CODES } from '../../src/errors/codes.js';
import {
  ENVIRONMENTS, PDI_HOST, hostOf, normalizeInstanceUrl, proposeEnvironment, resolveEnvironment,
} from '../../src/cli/url.js';

/**
 * ARC-07-S02 — what the wizard accepts, what it proposes, and what it refuses.
 *
 * The refusals are the interesting half. P-23's wizard "helpfully" turned an address ending in
 * `/api` into a base URL ending in `/api` and saved it, after which every REST path was
 * `/api/api/now/table/…` and nothing worked — with no error that mentioned the URL. So a path is
 * refused WITH THE REASON, never repaired silently; and the one form that IS repaired (a bare
 * word) comes back marked `proposed` so the caller shows it before accepting.
 *
 * Hostnames here are the story's own. Never `.invalid`, never a real instance.
 */
const PDI = 'https://dev12345.service-now.com';
const VANITY = 'https://acme.service-now.com';
const ONPREM = 'https://snow.acme.internal';
/** The reason `proposeEnvironment` is anchored at both ends: this host is somebody else's. */
const LOOKALIKE = 'https://dev12345.service-now.com.evil.example';

describe('normalizeInstanceUrl', () => {
  it('criterion 1 — a bare word becomes a PROPOSAL, not a decision', () => {
    const r = normalizeInstanceUrl('DEV12345');
    expect(r).toEqual({ ok: true, url: PDI, proposed: true, notes: [] });
  });

  it('criterion 1 — a trailing slash is removed, and said so', () => {
    const r = normalizeInstanceUrl(`${PDI}/`);
    expect(r.ok && r.url).toBe(PDI);
    expect(r.ok && r.proposed).toBe(false);
    expect(r.ok && r.notes).toContain('trailing slash removed');
  });

  it('criterion 1 — /api is refused with the sentence that explains WHY', () => {
    const r = normalizeInstanceUrl(`${VANITY}/api`);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe('URL_HAS_PATH');
    // The specific message: a reader who was told to paste this needs to know the server adds it.
    expect(!r.ok && r.message).toBe(
      '"/api" is the REST base the server adds itself — enter the bare origin (https://<host>)');
  });

  it('...and any other path, search or hash gets the general one', () => {
    for (const input of [`${VANITY}/nav_to.do`, `${VANITY}/?x=1`, `${VANITY}/#frag`]) {
      const r = normalizeInstanceUrl(input);
      expect(r.ok, input).toBe(false);
      expect(!r.ok && r.code).toBe('URL_HAS_PATH');
      expect(!r.ok && r.message).toBe('Enter the instance origin only (https://<host>), without a path');
    }
  });

  it('criterion 1 — http is refused before it is parsed', () => {
    const r = normalizeInstanceUrl('http://dev1.service-now.com');
    expect(!r.ok && r.code).toBe('URL_NOT_HTTPS');
    // Checked BEFORE parsing on purpose: `new URL` accepts http happily, and the message would
    // then be about a path rather than about the scheme.
    expect(!r.ok && r.message).toContain('https only');
  });

  it('criterion 1 — credentials in the URL are refused, and never echoed back', () => {
    const user = ['u', 'ser'].join('');
    const pass = ['p', 'w', '1'].join('');          // assembled, never spelled
    const r = normalizeInstanceUrl(`https://${user}:${pass}@dev1.service-now.com`);
    expect(!r.ok && r.code).toBe('URL_HAS_CREDENTIALS');
    expect(!r.ok && r.message).not.toContain(pass);
    expect(!r.ok && r.message).toBe(
      'Never put a username or password in the URL; the wizard will ask for them separately.');
  });

  it('criterion 1 — an explicit port is kept: on-prem and vanity hosts run on one', () => {
    const r = normalizeInstanceUrl(`${ONPREM}:8443`);
    expect(r.ok && r.url).toBe(`${ONPREM}:8443`);
    expect(r.ok && r.proposed).toBe(false);
  });

  it('the host is lowercased, the input trimmed', () => {
    expect(normalizeInstanceUrl('  https://DEV12345.Service-Now.com  ')).toEqual(
      { ok: true, url: PDI, proposed: false, notes: [] });
  });

  it('nonsense is URL_INVALID, and the input is quoted back', () => {
    const r = normalizeInstanceUrl('not a url');
    expect(!r.ok && r.code).toBe('URL_INVALID');
    expect(!r.ok && r.message).toContain('"not a url"');
  });

  it('an empty answer is URL_REQUIRED, not a crash', () => {
    for (const input of ['', '   ']) {
      const r = normalizeInstanceUrl(input);
      expect(!r.ok && r.code).toBe('URL_REQUIRED');
    }
  });

  it('a non-https scheme that parses is still refused', () => {
    const r = normalizeInstanceUrl('ftp://dev1.service-now.com');
    expect(!r.ok && r.code).toBe('URL_NOT_HTTPS');
  });

  it('every code this module can return is a registry key', () => {
    // `ServiceNowError` narrows on the union, but a returned literal is not thrown — so the type
    // system does not see it. This is the check that does.
    const codes = new Set<string>(ERROR_CODES.map((e) => e.code as string));
    const returned = ['URL_REQUIRED', 'URL_INVALID', 'URL_NOT_HTTPS', 'URL_HAS_PATH',
      'URL_HAS_CREDENTIALS', 'ENV_REQUIRED', 'VALIDATION_ERROR'];
    expect(returned.filter((c) => !codes.has(c))).toEqual([]);
  });
});

describe('proposeEnvironment', () => {
  it('criterion 2 — a PDI is recognised, and nothing else is', () => {
    expect(proposeEnvironment(PDI)).toBe('pdi');
    expect(proposeEnvironment('https://dev1.service-now.com')).toBe('pdi');
    for (const url of [LOOKALIKE, VANITY, ONPREM]) {
      expect(proposeEnvironment(url), url).toBeNull();
    }
  });

  it('...and the anchor is what makes the look-alike safe', () => {
    // `dev12345.service-now.com.evil.example` CONTAINS the PDI pattern. Unanchored, the wizard
    // would call somebody else's domain a PDI and pick the most permissive preset for it.
    expect(PDI_HOST.test(LOOKALIKE)).toBe(false);
    expect(new RegExp(PDI_HOST.source.replace(/\$$/, '')).test(LOOKALIKE)).toBe(true);
  });
});

describe('resolveEnvironment', () => {
  it('criterion 3 — --yes with a non-PDI host and no --env is ENV_REQUIRED', async () => {
    const r = await resolveEnvironment({ url: VANITY, yes: true });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('ENV_REQUIRED');
    expect(r.message).toBe(
      '--env is required for acme.service-now.com (only devNNNNN.service-now.com hosts are '
      + 'recognised as PDI).');
  });

  it('...and a PDI needs no --env even with --yes', async () => {
    await expect(resolveEnvironment({ url: PDI, yes: true }))
      .resolves.toEqual({ ok: true, environment: 'pdi' });
  });

  it('an explicit --env wins over the proposal, and is validated', async () => {
    await expect(resolveEnvironment({ url: PDI, env: 'PROD' }))
      .resolves.toEqual({ ok: true, environment: 'prod' });
    const bad = await resolveEnvironment({ url: PDI, env: 'staging' });
    expect(bad.ok).toBe(false);
    expect(bad.message).toContain(ENVIRONMENTS.join(', '));
  });

  it('criterion 3 — interactively, the question is asked and its answer used', async () => {
    let asked = 0;
    const r = await resolveEnvironment({
      url: ONPREM,
      ask: async () => { asked += 1; return 'test'; },
    });
    expect(asked).toBe(1);
    expect(r).toEqual({ ok: true, environment: 'test' });
  });

  it('...and a non-interactive run with no `ask` refuses rather than defaulting', async () => {
    // The dangerous shape: no `--yes`, no prompt available. Defaulting here would pick an
    // environment, and the environment decides whether a write needs `--ack-prod`.
    const r = await resolveEnvironment({ url: VANITY });
    expect(r.code).toBe('ENV_REQUIRED');
  });
});

describe('hostOf', () => {
  it('gives the host, and never throws on something that is not a URL', () => {
    expect(hostOf(`${ONPREM}:8443`)).toBe('snow.acme.internal:8443');
    expect(hostOf('not a url')).toBe('not a url');
  });
});
