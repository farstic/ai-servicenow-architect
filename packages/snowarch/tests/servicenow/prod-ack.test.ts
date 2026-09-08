import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { instanceManager } from '../../src/servicenow/instances.js';
import type { ServiceNowError } from '../../src/utils/errors.js';

/**
 * D-05 end to end, through the store: a prod instance raised above read-only without an
 * explicit acknowledgement is NOT LOADED, and says why.
 *
 * The fixture deliberately produces the shapes a narrower one could not — which is the
 * lesson from S02's two findings, where a fixture that could only make 0700 directories
 * hid a rule that was wrong for 0755. Here that means: prod at read-only, prod raised via a
 * PRESET, prod raised via a single CUSTOM flag that is not WRITE, and prod raised in a way
 * the dependency rule cancels.
 */
const KEYS = ['SNOW_STORE', 'CLAUDE_PROJECT_DIR', 'SERVICENOW_INSTANCE_URL', 'WRITE_ENABLED'] as const;
let saved: Record<string, string | undefined>;
let tmp: string;

type Instance = Record<string, unknown>;

function store(instances: Record<string, Instance>, defaultInstance?: string): void {
  const dir = join(tmp, '.local');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const p = join(dir, 'instances.json');
  writeFileSync(p, JSON.stringify({ version: 1, defaultInstance, instances }, null, 2), { mode: 0o600 });
  chmodSync(p, 0o600);
}

const instance = (over: Instance = {}): Instance => ({
  url: 'https://dev12345.service-now.com',
  environment: 'pdi',
  auth: { method: 'basic', username: 'admin', password: 'secret' },
  preset: 'pdi-developer',
  toolPackage: 'full',
  maxRecords: 100,
  prodWriteAck: false,
  ...over,
});

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  tmp = mkdtempSync(join(tmpdir(), 'snowarch-prod-'));
  process.env.CLAUDE_PROJECT_DIR = tmp;
});

afterEach(() => {
  for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  rmSync(tmp, { recursive: true, force: true });
  instanceManager.reload();
});

describe('criterion 2 - prod acknowledgement', () => {
  it('prod at preset full without prodWriteAck is not loaded, and the reason carries --ack-prod', () => {
    store({ prod: instance({ environment: 'prod', preset: 'full' }) });
    const r = instanceManager.reload();

    expect(r.loaded).toEqual([]);
    expect(r.notLoaded).toHaveLength(1);
    expect(r.notLoaded[0].code).toBe('PROD_WRITE_NOT_ACKNOWLEDGED');
    expect(r.notLoaded[0].message).toContain('./snowarch instance set-preset prod full --ack-prod');
  });

  it('the same instance loads with prodWriteAck true', () => {
    store({ prod: instance({ environment: 'prod', preset: 'full', prodWriteAck: true }) });
    const r = instanceManager.reload();
    expect(r.loaded).toEqual(['prod']);
    expect(instanceManager.getEntry('prod')?.effectiveFlags.WRITE_ENABLED).toBe('true');
  });

  it('prod at read-only loads with no acknowledgement — the cap is the default, not a penalty', () => {
    store({ prod: instance({ environment: 'prod', preset: 'read-only' }) });
    expect(instanceManager.reload().loaded).toEqual(['prod']);
  });

  it('ANY flag counts, not only WRITE: custom prod with ATF alone is refused', () => {
    store({ prod: instance({ environment: 'prod', preset: 'custom', flags: { ATF_ENABLED: 'true' } }) });
    const r = instanceManager.reload();
    expect(r.loaded).toEqual([]);
    expect(r.notLoaded[0].code).toBe('PROD_WRITE_NOT_ACKNOWLEDGED');
  });

  it('a contradiction the dependency rule cancels does NOT count as raised', () => {
    // custom prod declaring SCRIPTING without WRITE is, in effect, read-only. Refusing it
    // would be refusing a store that grants nothing — the prod check reads EFFECTIVE flags,
    // which is why the rules run in that order.
    store({ prod: instance({ environment: 'prod', preset: 'custom', flags: { SCRIPTING_ENABLED: 'true' } }) });
    const r = instanceManager.reload();
    expect(r.loaded).toEqual(['prod']);
    expect(instanceManager.getEntry('prod')?.effectiveFlags.SCRIPTING_ENABLED).toBe('false');
    expect(r.warnings.join(' ')).toContain('FLAG_DEPENDENCY_VIOLATION');
  });

  it('a refused instance is still listed, with its reason — not silently absent', () => {
    store({ pdi: instance(), prod: instance({ environment: 'prod', preset: 'full' }) }, 'pdi');
    instanceManager.reload();
    const listed = instanceManager.listAll();
    expect(listed.map((i) => i.name).sort()).toEqual(['pdi', 'prod']);
    const prod = listed.find((i) => i.name === 'prod');
    expect(prod?.status).toBe('not_loaded');
    expect(prod?.reason).toContain('PROD_WRITE_NOT_ACKNOWLEDGED');
  });

  it('switching to a refused instance returns INSTANCE_NOT_LOADED with the reason', () => {
    store({ pdi: instance(), prod: instance({ environment: 'prod', preset: 'full' }) }, 'pdi');
    instanceManager.reload();
    try {
      instanceManager.switch('prod');
      throw new Error('expected a throw');
    } catch (e) {
      expect((e as ServiceNowError).code).toBe('INSTANCE_NOT_LOADED');
      expect((e as ServiceNowError).message).toContain('--ack-prod');
    }
  });

  it('an unknown label is a different answer, and lists what IS configured including refused ones', () => {
    store({ pdi: instance(), prod: instance({ environment: 'prod', preset: 'full' }) }, 'pdi');
    instanceManager.reload();
    try {
      instanceManager.switch('uat');
      throw new Error('expected a throw');
    } catch (e) {
      expect((e as ServiceNowError).code).toBe('UNKNOWN_INSTANCE');
      expect((e as ServiceNowError).message).toContain('Configured: pdi, prod');
    }
  });
});

describe('criterion 1 - switching changes which flags apply', () => {
  it('pdi allows a write and prod refuses it, in one process', () => {
    store({
      pdi: instance({ environment: 'pdi', preset: 'pdi-developer' }),
      prod: instance({ environment: 'prod', preset: 'read-only' }),
    }, 'pdi');
    instanceManager.reload();

    expect(instanceManager.getEntry('pdi')?.effectiveFlags.WRITE_ENABLED).toBe('true');
    instanceManager.switch('prod');
    expect(instanceManager.current().label).toBe('prod');
    expect(instanceManager.current().effectiveFlags.WRITE_ENABLED).toBe('false');
    instanceManager.switch('pdi');
    expect(instanceManager.current().effectiveFlags.WRITE_ENABLED).toBe('true');
  });
});

describe('criterion 4 - a preset whose stored flags disagree', () => {
  it('a store that OMITS flags entirely does not mismatch its own preset', () => {
    // Found by spawning the server, not by a unit test: `register()` used to pass
    // completeFlags(inst.flags), which turns an absent `flags` key into six explicit
    // "false" values — so every preset instance without a flags key reported
    // PRESET_FLAGS_MISMATCH against the preset it had just declared. The unit test missed
    // it because it passed a PARTIAL object where production passed a completed one: the
    // fixture could not produce the failing shape.
    store({ pdi: instance({ preset: 'pdi-developer' }) });   // note: no `flags` key
    const r = instanceManager.reload();
    expect(r.loaded).toEqual(['pdi']);
    expect(r.warnings.join(' ')).not.toContain('PRESET_FLAGS_MISMATCH');
    expect(instanceManager.getEntry('pdi')?.effectiveFlags).toEqual({
      WRITE_ENABLED: 'true', CMDB_WRITE_ENABLED: 'true', SCRIPTING_ENABLED: 'true',
      ATF_ENABLED: 'true', NOW_ASSIST_ENABLED: 'false', FLUENT_ENABLED: 'false',
    });
  });

  it('the preset wins and PRESET_FLAGS_MISMATCH is reported', () => {
    store({ pdi: instance({ preset: 'pdi-developer', flags: { FLUENT_ENABLED: 'true' } }) });
    const r = instanceManager.reload();
    expect(instanceManager.getEntry('pdi')?.effectiveFlags.FLUENT_ENABLED).toBe('false');
    expect(r.warnings.join(' ')).toContain('PRESET_FLAGS_MISMATCH');
    expect(r.warnings.join(' ')).toContain('FLUENT_ENABLED');
  });
});

describe('criterion 8 - the environment does not reach a store-defined instance', () => {
  it('WRITE_ENABLED=true in the server env leaves a read-only store instance read-only', () => {
    process.env.WRITE_ENABLED = 'true';
    store({ prod: instance({ environment: 'dev', preset: 'read-only' }) });
    instanceManager.reload();
    expect(instanceManager.getEntry('prod')?.effectiveFlags.WRITE_ENABLED).toBe('false');
  });
});

describe('listAll never returns credentials', () => {
  it('no password, client secret or username appears anywhere in the serialised listing', () => {
    store({
      pdi: instance({ auth: { method: 'basic', username: 'admin.user', password: 'sup3rs3cret' } }),
      oauth: instance({
        auth: {
          method: 'oauth_ropc', clientId: 'cid-1234', clientSecret: 'csecret-5678',
          username: 'oauth.user', password: 'oauthpass',
        },
      }),
    }, 'pdi');
    instanceManager.reload();

    const json = JSON.stringify(instanceManager.listAll());
    for (const secret of ['sup3rs3cret', 'csecret-5678', 'oauthpass', 'cid-1234', 'admin.user', 'oauth.user']) {
      expect(json).not.toContain(secret);
    }
    // And it is not empty — an assertion that passes because nothing was listed proves nothing.
    expect(instanceManager.listAll()).toHaveLength(2);
  });
});
