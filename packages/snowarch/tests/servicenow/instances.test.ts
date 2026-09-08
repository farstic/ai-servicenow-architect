import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { instanceManager } from '../../src/servicenow/instances.js';

/**
 * The precedence, end to end.
 *
 * What this replaces is worth recording: the previous version of this file opened with
 * "The wizard config takes precedence over env-only loading ... skip those cases if it
 * happens to exist on this machine" — a test that documented P-21 rather than failing on
 * it, and that skipped based on the developer's own home directory. There is one store
 * now, and nothing here depends on the machine it runs on.
 */
const KEYS = [
  'SNOW_STORE', 'CLAUDE_PROJECT_DIR', 'SERVICENOW_INSTANCE_URL', 'SERVICENOW_BASIC_USERNAME',
  'SERVICENOW_BASIC_PASSWORD', 'SN_INSTANCE_ALPHA_URL', 'WRITE_ENABLED', 'SNOW_ENV_FILE',
] as const;

let saved: Record<string, string | undefined>;
let tmp: string;

const STORE = {
  version: 1,
  defaultInstance: 'pdi',
  instances: {
    pdi: {
      url: 'https://dev12345.service-now.com',
      environment: 'pdi',
      auth: { method: 'basic', username: 'admin', password: 'secret' },
      preset: 'pdi-developer',
      flags: {
        WRITE_ENABLED: 'true', CMDB_WRITE_ENABLED: 'false', SCRIPTING_ENABLED: 'false',
        ATF_ENABLED: 'false', NOW_ASSIST_ENABLED: 'false', FLUENT_ENABLED: 'false',
      },
      toolPackage: 'full', maxRecords: 100, prodWriteAck: false,
    },
  },
};

function writeStore(path: string, body: unknown = STORE, mode = 0o600): string {
  mkdirSync(join(path, '..'), { recursive: true, mode: 0o700 });
  writeFileSync(path, JSON.stringify(body, null, 2), { mode });
  chmodSync(path, mode);
  return path;
}

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  tmp = mkdtempSync(join(tmpdir(), 'snowarch-inst-'));
  // Point the project store at an empty temp dir so the developer's real one is never read.
  process.env.CLAUDE_PROJECT_DIR = tmp;
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
  }
  rmSync(tmp, { recursive: true, force: true });
  instanceManager.reload();
});

describe('criterion 1 - precedence', () => {
  it('SNOW_STORE is loaded and the project store is not', () => {
    const explicit = writeStore(join(tmp, 'explicit.json'));
    const project = JSON.parse(JSON.stringify(STORE));
    project.instances = { other: { ...STORE.instances.pdi } };
    writeStore(join(tmp, '.local', 'instances.json'), project);

    process.env.SNOW_STORE = explicit;
    const r = instanceManager.reload();
    expect(r.source).toBe('env');
    expect(r.loaded).toEqual(['pdi']);
    expect(instanceManager.listNames()).not.toContain('other');
  });

  it('an empty SNOW_STORE falls through to the project store', () => {
    writeStore(join(tmp, '.local', 'instances.json'));
    process.env.SNOW_STORE = '';
    const r = instanceManager.reload();
    expect(r.source).toBe('project');
    expect(r.loaded).toEqual(['pdi']);
  });

  it('with no store at all the source is none and nothing is loaded', () => {
    const r = instanceManager.reload();
    expect(r.source).toBe('none');
    expect(r.loaded).toEqual([]);
    expect(r.notes.join(' ')).toContain('missing');
  });

  it('SNOW_STORE pointing at a missing file is STORE_NOT_FOUND, with NO fallback', () => {
    // The ruling: an explicit override that is wrong must fail loudly. Falling back would
    // load a different instance than the one named, and nothing would say so.
    writeStore(join(tmp, '.local', 'instances.json'));
    process.env.SNOW_STORE = join(tmp, 'absent.json');
    const r = instanceManager.reload();
    expect(r.source).toBe('env');
    expect(r.loaded).toEqual([]);
    expect(r.configErrors[0].code).toBe('STORE_NOT_FOUND');
  });
});

describe('criterion 2 - env-defined instances win and say so', () => {
  it('the store is ignored and the note names it, masked', () => {
    writeStore(join(tmp, '.local', 'instances.json'));
    process.env.SERVICENOW_INSTANCE_URL = 'https://envtest.service-now.com';
    const r = instanceManager.reload();
    expect(r.source).toBe('env-instances');
    expect(r.loaded).toEqual(['default']);
    const note = r.notes.join(' ');
    expect(note).toContain('instance source: env');
    expect(note).toContain('store ignored:');
    expect(note).toContain('<checkout>');
    expect(instanceManager.getCurrentUrl()).toBe('https://envtest.service-now.com');
  });

  it('named SN_INSTANCE groups are loaded too', () => {
    process.env.SN_INSTANCE_ALPHA_URL = 'https://alpha.service-now.com';
    const r = instanceManager.reload();
    expect(r.source).toBe('env-instances');
    expect(r.loaded).toContain('alpha');
  });

  it('flags on the env path are byte-exact true', () => {
    process.env.SERVICENOW_INSTANCE_URL = 'https://envtest.service-now.com';
    process.env.WRITE_ENABLED = 'TRUE';
    instanceManager.reload();
    expect(instanceManager.getEntry('default')?.flags.WRITE_ENABLED).toBe('false');
    process.env.WRITE_ENABLED = 'true';
    instanceManager.reload();
    expect(instanceManager.getEntry('default')?.flags.WRITE_ENABLED).toBe('true');
  });
});

describe('criterion 3 - file mode', () => {
  it.skipIf(process.platform === 'win32')(
    'POSIX: a 0644 store is refused with STORE_PERMISSIONS_TOO_OPEN and a chmod 600 remedy (skipped on Windows: modes are ACL-inherited)',
    () => {
      writeStore(join(tmp, '.local', 'instances.json'), STORE, 0o644);
      const r = instanceManager.reload();
      expect(r.loaded).toEqual([]);
      expect(r.configErrors[0].code).toBe('STORE_PERMISSIONS_TOO_OPEN');
      expect(r.configErrors[0].message).toContain('chmod 600');
    },
  );

  it.skipIf(process.platform !== 'win32')(
    'Windows: the same file loads, because the mode check is skipped',
    () => {
      writeStore(join(tmp, '.local', 'instances.json'), STORE, 0o644);
      const r = instanceManager.reload();
      expect(r.loaded).toEqual(['pdi']);
      expect(r.configErrors).toEqual([]);
    },
  );
});

describe('criterion 4 - a refused store loads nothing', () => {
  it('a boolean flag refuses the whole store with the field named', () => {
    const bad = JSON.parse(JSON.stringify(STORE));
    bad.instances.pdi.flags.WRITE_ENABLED = true;
    writeStore(join(tmp, '.local', 'instances.json'), bad);
    const r = instanceManager.reload();
    expect(r.loaded).toEqual([]);
    expect(r.configErrors[0].code).toBe('STORE_SCHEMA_INVALID');
    expect(r.configErrors[0].message).toContain('instances.pdi.flags.WRITE_ENABLED');
  });
});

describe('the store carries the metadata the flag gate (S03) will need', () => {
  it('preset, environment, flags, maxRecords and prodWriteAck all arrive', () => {
    writeStore(join(tmp, '.local', 'instances.json'));
    instanceManager.reload();
    const e = instanceManager.getEntry('pdi');
    expect(e?.preset).toBe('pdi-developer');
    expect(e?.environment).toBe('pdi');
    expect(e?.maxRecords).toBe(100);
    expect(e?.prodWriteAck).toBe(false);
    expect(e?.flags.WRITE_ENABLED).toBe('true');
  });

  it('getClient names the remedy when nothing is configured', () => {
    instanceManager.reload();
    expect(() => instanceManager.getClient()).toThrow(/snowarch instance add/);
  });
});
