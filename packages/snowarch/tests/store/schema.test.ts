import { describe, expect, it } from 'vitest';
import { completeFlags, parseStore, STORE_VERSION } from '../../src/store/schema.js';

const base = {
  version: 1,
  defaultInstance: 'pdi',
  instances: {
    pdi: {
      url: 'https://dev12345.service-now.com',
      environment: 'pdi',
      auth: { method: 'basic', username: 'admin', password: 'secret' },
      preset: 'pdi-developer',
      flags: { WRITE_ENABLED: 'true', CMDB_WRITE_ENABLED: 'true', SCRIPTING_ENABLED: 'true',
               ATF_ENABLED: 'true', NOW_ASSIST_ENABLED: 'false', FLUENT_ENABLED: 'false' },
      toolPackage: 'full',
      maxRecords: 100,
      prodWriteAck: false,
    },
  },
};
const clone = () => JSON.parse(JSON.stringify(base));
const err = (raw: unknown) => { const r = parseStore(raw); if (!('error' in r)) throw new Error('expected an error'); return r.error; };
const ok = (raw: unknown) => { const r = parseStore(raw); if ('error' in r) throw new Error(`expected success, got ${r.error.code}: ${r.error.message}`); return r.store; };

describe('criterion 4 — the two shapes that look right and behave wrong', () => {
  it('a BOOLEAN flag is refused, naming instances.pdi.flags.WRITE_ENABLED', () => {
    // The env path compares byte-exactly against "true", so a JSON boolean reads as
    // absent — the user would believe writes were armed when they were not.
    const s = clone(); s.instances.pdi.flags.WRITE_ENABLED = true;
    const e = err(s);
    expect(e.code).toBe('STORE_SCHEMA_INVALID');
    expect(e.message).toContain('instances.pdi.flags.WRITE_ENABLED');
    expect(e.message).toContain('must be the string "true" or "false"');
  });

  it('auth.method "client_credentials" is refused, naming instances.pdi.auth.method', () => {
    const s = clone(); s.instances.pdi.auth = { method: 'client_credentials', clientId: 'a', clientSecret: 'b' };
    const e = err(s);
    expect(e.code).toBe('STORE_SCHEMA_INVALID');
    expect(e.message).toContain('instances.pdi.auth.method');
    expect(e.message).toContain('must be "basic" or "oauth_ropc"');
  });

  it('basic loads with username + password', () => {
    expect(ok(clone()).instances.pdi.auth.method).toBe('basic');
  });

  it('oauth_ropc loads with clientId + clientSecret + username + password', () => {
    const s = clone();
    s.instances.pdi.auth = { method: 'oauth_ropc', clientId: 'id', clientSecret: 'sec', username: 'u', password: 'p' };
    expect(ok(s).instances.pdi.auth.method).toBe('oauth_ropc');
  });

  it('oauth_ropc without a clientSecret is refused, naming the field', () => {
    const s = clone();
    s.instances.pdi.auth = { method: 'oauth_ropc', clientId: 'id', username: 'u', password: 'p' };
    expect(err(s).message).toContain('instances.pdi.auth.clientSecret');
  });
});

describe('version', () => {
  // ARC-09-S06 split the one `STORE_SCHEMA_UNSUPPORTED` in two. The remedy is what differs, and
  // it is the whole reason: a store from the FUTURE needs a newer checkout, a store from the PAST
  // needs migrating — and telling the second reader to upgrade sends them to a command that
  // changes nothing while their file sits there.
  it('a NEWER version says to upgrade the checkout, not to edit the store', () => {
    const s = clone(); s.version = 2;
    const e = err(s);
    expect(e.code).toBe('STORE_SCHEMA_NEWER');
    expect(e.message).toContain(`newer than this server supports (${STORE_VERSION})`);
    expect(e.message).toContain('./snowarch upgrade');
  });
  it('an OLDER version says to migrate, and never mentions upgrading', () => {
    const s = clone(); s.version = 0;
    const e = err(s);
    expect(e.code).toBe('STORE_SCHEMA_OUTDATED');
    expect(e.message).toContain(`older than this server (${STORE_VERSION})`);
    expect(e.message).toContain('./snowarch store migrate');
    expect(e.message).not.toContain('upgrade');
  });
  it('an unsupported version is not reported as a malformed store', () => {
    const s = clone(); s.version = 2; s.instances = 'nonsense';
    expect(err(s).code).toBe('STORE_SCHEMA_NEWER');
  });
});

describe('url and label', () => {
  it.each([
    ['a trailing slash', 'https://dev1.service-now.com/'],
    ['a path', 'https://dev1.service-now.com/api'],
    ['http', 'http://dev1.service-now.com'],
  ])('refuses %s', (_why, url) => {
    const s = clone(); s.instances.pdi.url = url;
    expect(err(s).message).toContain('instances.pdi.url');
  });

  it('refuses a label that does not match the slug pattern', () => {
    const s = clone(); s.instances = { 'PDI Prod': s.instances.pdi };
    expect(err(s).code).toBe('STORE_SCHEMA_INVALID');
  });

  it('refuses an unknown key rather than ignoring it', () => {
    const s = clone(); s.instances.pdi.wrtieEnabled = 'true';
    expect(err(s).code).toBe('STORE_SCHEMA_INVALID');
  });
});

describe('flags completion', () => {
  it('fewer than six flags is allowed; the absent ones read as "false"', () => {
    const s = clone(); s.instances.pdi.flags = { WRITE_ENABLED: 'true' };
    const store = ok(s);
    const complete = completeFlags(store.instances.pdi.flags);
    expect(complete.WRITE_ENABLED).toBe('true');
    expect(complete.SCRIPTING_ENABLED).toBe('false');
    expect(Object.keys(complete)).toHaveLength(6);
  });

  it('defaults fill in for absent optional fields', () => {
    const s = clone();
    delete s.instances.pdi.toolPackage; delete s.instances.pdi.maxRecords; delete s.instances.pdi.prodWriteAck;
    const store = ok(s);
    expect(store.instances.pdi.toolPackage).toBe('full');
    expect(store.instances.pdi.maxRecords).toBe(100);
    expect(store.instances.pdi.prodWriteAck).toBe(false);
  });

  it('maxRecords outside 1–1000 is refused', () => {
    const s = clone(); s.instances.pdi.maxRecords = 0;
    expect(err(s).message).toContain('instances.pdi.maxRecords');
  });
});

describe('lastProbe passthrough', () => {
  it('an unknown probe key does not invalidate the store — ARC-07-S03 adds keys without a version bump', () => {
    const s = clone();
    s.instances.pdi.lastProbe = { at: '2026-09-04T10:00:00Z', auth: 'ok', somethingNew: 'ok' };
    expect(ok(s).instances.pdi.lastProbe).toMatchObject({ somethingNew: 'ok' });
  });
});
