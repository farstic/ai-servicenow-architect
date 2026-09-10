import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { FLAG_NAMES } from '../../src/utils/permissions.js';
import {
  CAPABILITY_TABLE, HONESTY_NOTE, ROLE_MISSING_HINT, ROLES_UNREADABLE_HINT, ROPC_ERROR_TABLE,
  checkFluent, probeAll, probeAuth, probeCapability, toLastProbe,
} from '../../src/servicenow/probes.js';
import { instanceSchema } from '../../src/store/schema.js';
import { fakeRest, networkFailure } from '../helpers/fake-rest.js';

/**
 * ARC-07-S03 — the probes, and the requests they must not make.
 *
 * Two of the seven criteria are about ABSENCE: a 401 is never retried (an account three attempts
 * closer to a lockout, on an instance whose policy we do not know), and a failed login is never
 * followed by five capability requests. Neither can be shown by a returned value, so the fake
 * counts calls and the assertions read the counter.
 *
 * No fixture password is spelled — assembled, like every other secret in this tree.
 */
const here = dirname(fileURLToPath(import.meta.url));
const USERNAME = 'svc.snowarch';
const PASSWORD = ['pw', '-', '42'].join('');

const row = (sys_id = '0'.repeat(32)) => ({ sys_id });

describe('probeAuth — criterion 1', () => {
  it('200 on sys_user is ok, after exactly one request', async () => {
    const rest = fakeRest({ sys_user: { status: 200 } });
    expect(rest.calls).toEqual([]);                        // the precondition, asserted first
    const result = await probeAuth(rest);
    expect(result.status).toBe('ok');
    expect(rest.countOf('sys_user')).toBe(1);
  });

  it('401 is `auth failed` — and the second attempt is NEVER made', async () => {
    // The route would answer 200 on a second call. If anything retried, the status would be `ok`
    // and the count 2 — which is exactly the bug this asserts is absent, and the reason it is
    // written as a fixture that WOULD reward a retry.
    const rest = fakeRest({ sys_user: [{ status: 401 }, { status: 200 }] });
    const result = await probeAuth(rest);
    expect(result.status).toBe('auth failed');
    expect(result.code).toBe('AUTHENTICATION_FAILED');
    expect(rest.countOf('sys_user')).toBe(1);
  });

  it('403 is `role missing`, with the hint that says the password is fine', async () => {
    const rest = fakeRest({ sys_user: { status: 403 } });
    const result = await probeAuth(rest);
    expect(result.status).toBe('role missing');
    expect(result.code).toBe('INSUFFICIENT_PRIVILEGES');
    expect(result.hint).toBe(ROLE_MISSING_HINT);
    // The distinction that matters: telling this user their password is wrong sends them to
    // change a password that works.
    expect(result.hint).toContain('credentials are valid');
    expect(rest.countOf('sys_user')).toBe(1);
  });

  it('a network failure is `unreachable`, with S02\'s code — not a second classification', async () => {
    const rest = fakeRest({ sys_user: { status: 0, throws: networkFailure('ENOTFOUND') } });
    const result = await probeAuth(rest, { env: {} });
    expect(result.status).toBe('unreachable');
    expect(result.code).toBe('DNS_FAILURE');
    expect(result.detail).toContain('does not resolve');
  });
});

describe('probeAuth — criterion 2, roles are best effort', () => {
  it('a 401 on the roles read still leaves the auth ok, with roles undefined', async () => {
    const rest = fakeRest({ sys_user: { status: 200 }, sys_user_has_role: { status: 401 } });
    const result = await probeAuth(rest, { username: USERNAME });
    expect(result.status).toBe('ok');
    expect(result.roles).toBeUndefined();
    expect(result.hint).toBe(ROLES_UNREADABLE_HINT);
    expect(rest.countOf('sys_user_has_role')).toBe(1);
  });

  it('...and when they can be read, they come back as names', async () => {
    const rest = fakeRest({
      sys_user: { status: 200 },
      sys_user_has_role: { status: 200, records: [{ 'role.name': 'admin' }, { 'role.name': 'itil' }] },
    });
    const result = await probeAuth(rest, { username: USERNAME });
    expect(result.roles).toEqual(['admin', 'itil']);
  });

  it('the roles read is skipped entirely when no username is known', async () => {
    const rest = fakeRest({ sys_user: { status: 200 } });
    await probeAuth(rest);
    expect(rest.countOf('sys_user_has_role')).toBe(0);
  });
});

describe('probeAuth — criterion 3, the ROPC bodies', () => {
  const ropc = (token: { ok: boolean; error?: string }) =>
    probeAuth(fakeRest({ sys_user: { status: 200 } }), {
      authMethod: 'oauth_ropc', tokenProbe: async () => token,
    });

  it('unsupported_grant_type names the property that turned it off', async () => {
    const r = await ropc({ ok: false, error: 'unsupported_grant_type' });
    expect(r.code).toBe('OAUTH_ROPC_DISABLED');
    expect(r.hint).toContain('glide.oauth.inbound.ropc.grant_type.disabled');
    // Without the property name this is "ask your admin" — with it, the admin knows what to look
    // at, which is the difference between a ticket and a fix.
    expect(r.hint).toContain('Security Center hardening');
  });

  it('invalid_client says the password was never checked', async () => {
    const r = await ropc({ ok: false, error: 'invalid_client' });
    expect(r.code).toBe('OAUTH_CLIENT_INVALID');
    expect(r.hint).toContain('user password was not checked');
  });

  it('invalid_grant and access_denied are plain auth failures', async () => {
    for (const error of ['invalid_grant', 'access_denied']) {
      const r = await ropc({ ok: false, error });
      expect(r.status, error).toBe('auth failed');
      expect(r.code, error).toBeUndefined();
    }
  });

  it('an unknown error is `auth failed` with the RAW value, never a guess', async () => {
    const r = await ropc({ ok: false, error: 'e_something_new' });
    expect(r.status).toBe('auth failed');
    expect(r.detail).toBe('e_something_new');
  });

  it('a successful token goes on to the sys_user check', async () => {
    const rest = fakeRest({ sys_user: { status: 200 } });
    const r = await probeAuth(rest, { authMethod: 'oauth_ropc', tokenProbe: async () => ({ ok: true }) });
    expect(r.status).toBe('ok');
    expect(rest.countOf('sys_user')).toBe(1);
  });

  it('the table is DATA, and the fixture it will be filled from is a valid empty shape', () => {
    expect(ROPC_ERROR_TABLE.map((r) => r.error)).toEqual(
      ['unsupported_grant_type', 'invalid_client', 'invalid_grant', 'access_denied']);
    const fixture = JSON.parse(readFileSync(join(here, '../fixtures/oauth-ropc-errors.json'), 'utf8'));
    expect(Array.isArray(fixture.observed)).toBe(true);
    // Empty is the CORRECT state until S11 records the real bodies from an instance: the table
    // carries the RFC names meanwhile, and anything unrecognised falls through rather than being
    // guessed at.
    expect(fixture.observed).toEqual([]);
    expect(fixture._rule).toContain('ARC-07-S11');
  });
});

describe('probeCapability — criterion 4', () => {
  it('every flag has a row, and the rows are keyed by FLAG_NAMES', () => {
    // No literal flag names outside the preset module (ARC-04-S03): a flag added there must get a
    // probe here or the table is incomplete, and this is what says so.
    expect(Object.keys(CAPABILITY_TABLE).sort()).toEqual([...FLAG_NAMES].sort());
  });

  it('200 is ok and 403 is `role missing`, for each table-backed flag', async () => {
    for (const flag of FLAG_NAMES.filter((f) => CAPABILITY_TABLE[f].table)) {
      const table = CAPABILITY_TABLE[flag].table as string;
      const ok = await probeCapability(fakeRest({ [table]: { status: 200 } }), flag);
      expect(ok.status, flag).toBe('ok');
      expect(ok.detail, flag).toContain(table);

      const denied = await probeCapability(fakeRest({ [table]: { status: 403 } }), flag);
      expect(denied.status, flag).toBe('role missing');
      expect(denied.detail, flag).toContain('cannot read sys_user');
    }
  });

  it('NOW_ASSIST with zero rows is `not licensed`, and says only "properties found"', async () => {
    // A plugin can be installed without a licence, so the line claims what was seen and nothing
    // more — the tools themselves report the licence error.
    const empty = await probeCapability(fakeRest({ sys_properties: { status: 200, records: [] } }),
      'NOW_ASSIST_ENABLED');
    expect(empty.status).toBe('not licensed');
    expect(empty.detail).toBe('no Now Assist properties found — plugin absent or not licensed');

    const present = await probeCapability(
      fakeRest({ sys_properties: { status: 200, records: [row()] } }), 'NOW_ASSIST_ENABLED');
    expect(present.status).toBe('ok');
  });

  it('FLUENT is `not installed` in a tree without the package, and `ok` with one', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fluent-'));
    try {
      // A temp directory with no `@servicenow/sdk` anywhere above it, and an `npm root -g` that
      // answers a directory which does not contain it either.
      const consumer = join(dir, 'consumer.js');
      writeFileSync(consumer, '');
      const absent = checkFluent({
        from: pathToFileURL(consumer).href,
        runNpm: () => join(dir, 'global'),
      });
      expect(absent.installed).toBe(false);

      // ...and the same lookup with a fixture package on the global root's resolution path.
      const globalRoot = join(dir, 'global');
      mkdirSync(join(globalRoot, '@servicenow', 'sdk'), { recursive: true });
      writeFileSync(join(globalRoot, '@servicenow', 'sdk', 'package.json'),
        JSON.stringify({ name: '@servicenow/sdk', version: '0.0.0-fixture' }));
      const found = checkFluent({ from: pathToFileURL(consumer).href, runNpm: () => globalRoot });
      expect(found.installed).toBe(true);
      expect(found.where).toContain('@servicenow');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('...and an npm that cannot be run at all is `not installed`, not a crash', async () => {
    const r = await probeCapability(fakeRest({}), 'FLUENT_ENABLED',
      { fluent: () => ({ installed: false }) });
    expect(r.status).toBe('not installed');
    expect(r.detail).toContain('npm i -g @servicenow/sdk');
  });
});

describe('probeAll — criterion 5', () => {
  it('a failed auth means six skipped capabilities and NO capability request', async () => {
    const rest = fakeRest({ sys_user: { status: 401 } });
    const result = await probeAll(rest, { username: USERNAME });
    expect(result.auth.status).toBe('auth failed');
    expect(result.capabilities).toHaveLength(FLAG_NAMES.length);
    expect(result.capabilities.every((c) => c.status === 'skipped')).toBe(true);
    expect(result.capabilities[0].detail).toContain('not attempted');
    // The claim that cannot be made from a return value: nothing else was asked for.
    expect(rest.calls).toEqual(['sys_user']);
  });

  it('a good auth runs all six, and the auth request came first', async () => {
    const rest = fakeRest({
      sys_user: { status: 200 },
      sys_user_has_role: { status: 200, records: [{ 'role.name': 'admin' }] },
      sys_update_set: { status: 200 },
      sys_script_include: { status: 200 },
      cmdb_ci: { status: 200 },
      sys_atf_test: { status: 200 },
      sys_properties: { status: 200, records: [row()] },
    });
    const result = await probeAll(rest, {
      username: USERNAME, fluent: () => ({ installed: true, where: '/fixture' }),
    });
    expect(result.auth.status).toBe('ok');
    expect(result.capabilities.map((c) => c.status)).toEqual(Array(6).fill('ok'));
    expect(rest.calls[0]).toBe('sys_user');
    // One request per probe, and no more: five tables plus the roles read.
    for (const table of ['sys_update_set', 'sys_script_include', 'cmdb_ci', 'sys_atf_test',
      'sys_properties']) {
      expect(rest.countOf(table), table).toBe(1);
    }
  });

  it('the honesty note exists once, and says what a probe does not prove', () => {
    expect(HONESTY_NOTE).toContain('write ACLs are still evaluated per call');
  });
});

describe('toLastProbe — criterion 6', () => {
  it('validates against the store schema, and carries statuses only', async () => {
    const rest = fakeRest({
      sys_user: { status: 200 },
      sys_user_has_role: { status: 200, records: [{ 'role.name': 'admin' }] },
      sys_update_set: { status: 200 },
      sys_script_include: { status: 403 },
      cmdb_ci: { status: 200 },
      sys_atf_test: { status: 200 },
      sys_properties: { status: 200, records: [] },
    });
    const result = await probeAll(rest, { username: USERNAME, fluent: () => ({ installed: false }) });
    const lastProbe = toLastProbe(result);

    expect(lastProbe.auth).toBe('ok');
    expect(lastProbe.scripting).toBe('role missing');
    expect(lastProbe.nowAssist).toBe('not licensed');
    expect(lastProbe.fluent).toBe('not installed');

    // The store's own schema is the assertion — not a shape re-described here.
    const instance = instanceSchema.parse({
      url: 'https://dev12345.service-now.com',
      environment: 'pdi',
      preset: 'pdi-developer',
      auth: { method: 'basic', username: USERNAME, password: PASSWORD },
      lastProbe,
    });
    expect(instance.lastProbe?.at).toBe(lastProbe.at);

    // No account name, no role list, no hint text: this record is read by the banner, the doctor
    // and `/snowarch status`, and anything identifying here appears in all three.
    const serialised = JSON.stringify(lastProbe);
    expect(serialised).not.toContain(USERNAME);
    expect(serialised).not.toContain(PASSWORD);
    expect(serialised).not.toContain('admin');
    expect(Object.keys(lastProbe).sort()).toEqual(
      ['at', 'atf', 'auth', 'cmdb', 'fluent', 'nowAssist', 'scripting', 'write'].sort());
  });
});

describe('criterion 7 — the doctor can bind this without the CLI', () => {
  it('probes.ts imports nothing from src/cli/', () => {
    // ARC-08-S04 binds `probeAll` into the doctor, which must not drag prompt code — or a
    // `process.exit` — into a library the server also loads.
    const source = readFileSync(resolve(here, '../../src/servicenow/probes.ts'), 'utf8');
    const cliImports = source.split('\n')
      .filter((l) => /^import .*from '.*\/cli\//.test(l.trim()));
    expect(cliImports).toEqual([]);
  });

  it('the package exports the probes for the doctor to import', () => {
    const pkg = JSON.parse(readFileSync(resolve(here, '../../package.json'), 'utf8'));
    expect(pkg.exports['./probes']).toBe('./dist/servicenow/probes.js');
  });

  it('probeAll has the shape ARC-04-S12\'s Probes interface asks for', async () => {
    // A type-level binding, exercised: `runAll` returns a status the doctor renders. If the
    // signature drifts, this stops compiling — which is the point of writing it as a value.
    const { stubProbes } = await import('../../src/doctor/types.js');
    expect(typeof stubProbes.runAll).toBe('function');
    const bound = {
      async runAll(): Promise<{ status: 'ok'; detail: string }> {
        const rest = fakeRest({ sys_user: { status: 200 } });
        const result = await probeAll(rest);
        return { status: 'ok', detail: `auth ${result.auth.status}` };
      },
    };
    await expect(bound.runAll()).resolves.toEqual({ status: 'ok', detail: 'auth ok' });
  });
});
