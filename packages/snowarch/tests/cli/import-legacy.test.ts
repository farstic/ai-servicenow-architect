import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FIELD_MAP, FLAG_MAP, deletionAdvice, legacyStoreDir, legacyStorePath, normaliseLabel, planEntry,
  readLegacyStore, renderPlan, runImport, type ImportOptions,
} from '../../src/cli/import-legacy.js';
import { EXIT_OK, EXIT_USAGE, type AddIo, type ManageDeps } from '../../src/cli/instance.js';
import { FLAG_NAMES } from '../../src/utils/permissions.js';
import { removeTempDir, trackTempDir } from '../helpers/server-child.js';
import { fakeRest } from '../helpers/fake-rest.js';
import { scriptedTty } from '../helpers/scripted-tty.js';

/**
 * ARC-07-S08 — the migration, and the three promises it makes.
 *
 * NOTHING IS DELETED: a grep over the command's own source asserts there is no removal call in it
 * at all, because "we advise, the user deletes" is the kind of rule that survives exactly as long
 * as somebody can point at the line proving it.
 *
 * NOTHING IS WRITTEN BEFORE THE PLAN IS SHOWN: the dry-run case asserts the store is absent before
 * AND after, which is the only assertion that distinguishes "did not write" from "wrote and the
 * test did not look".
 *
 * NO SECRET REACHES AN OUTPUT BYTE: the values are read from the fixture rather than spelled here,
 * so the sweep at the end checks the same bytes the import carries — `aiApiKey` included, which is
 * the one field 2.0.0 has nowhere to put.
 */
const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(here, '../fixtures/legacy-instances.json');
const SOURCE = resolve(here, '../../src/cli/import-legacy.ts');

interface LegacyFixture {
  defaultInstance: string;
  instances: Array<Record<string, unknown>>;
}
const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) as LegacyFixture;
/** Every credential-shaped value the fixture carries, read from it, never retyped. */
const SECRETS = fixture.instances.flatMap((e) =>
  ['password', 'clientSecret', 'aiApiKey'].map((k) => e[k]).filter((v): v is string => typeof v === 'string'));

const everything: string[] = [];

/** Separators normalised. A Windows path is a right answer, not a different plan. */
const posix = (text: string): string => text.split('\\').join('/');

const REAL = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE,
  CLAUDE_PROJECT_DIR: process.env.CLAUDE_PROJECT_DIR, SNOW_STORE: process.env.SNOW_STORE };

let base: string;
let home: string;
let checkout: string;
let store: string;
let legacy: string;

const io = (answers: readonly string[]): AddIo & { written: () => string; asked: () => string[] } => {
  const tty = scriptedTty(answers);
  return {
    ask: tty.ask,
    write: (text: string) => { everything.push(text); tty.write(text); },
    secret: async () => '',
    written: () => tty.written,
    asked: () => tty.prompts,
  };
};

/** A probe client whose `sys_user` answer is scripted per instance URL. */
const client = (statusByUrl: Record<string, number>) => {
  const calls: string[] = [];
  return {
    calls,
    make: (entry: { url: string }) => {
      calls.push(entry.url);
      return fakeRest({
        sys_user: { status: statusByUrl[entry.url] ?? 200 },
        sys_user_has_role: { status: 200, records: [{ 'role.name': 'admin' }] },
        sys_update_set: { status: 200 },
        sys_script_include: { status: 200 },
        cmdb_ci: { status: 200 },
        sys_atf_test: { status: 200 },
        sys_properties: { status: 200, records: [{ sys_id: 'x' }] },
      });
    },
  };
};

const deps = (statusByUrl: Record<string, number> = {}): ManageDeps & { calls: string[] } => {
  const c = client(statusByUrl);
  return {
    storePath: store,
    makeClient: c.make as unknown as ManageDeps['makeClient'],
    now: () => '2026-09-10T08:00:00.000Z',
    calls: c.calls,
  };
};

const readStore = (): { defaultInstance?: string; instances: Record<string, Record<string, never>> } =>
  JSON.parse(readFileSync(store, 'utf8'));

beforeEach(() => {
  base = trackTempDir(mkdtempSync(join(tmpdir(), 'import-legacy-')));
  home = join(base, 'home');
  checkout = join(base, 'checkout');
  mkdirSync(join(home, '.config', 'servicenow-mcp'), { recursive: true });
  mkdirSync(join(checkout, '.local'), { recursive: true, mode: 0o700 });
  store = join(checkout, '.local', 'instances.json');
  legacy = join(home, '.config', 'servicenow-mcp', 'instances.json');
  copyFileSync(FIXTURE, legacy);
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.CLAUDE_PROJECT_DIR = checkout;
  delete process.env.SNOW_STORE;
});

afterEach(() => {
  for (const [key, value] of Object.entries(REAL)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  removeTempDir(base);
});

const run = (options: ImportOptions, answers: readonly string[] = [], statuses: Record<string, number> = {}) => {
  const terminal = io(answers);
  const d = deps(statuses);
  return { terminal, deps: d, result: runImport({ ...options }, terminal, { ...d, home }) };
};

describe('AC 1 — the dry run', () => {
  it('prints the plan and writes NOTHING', async () => {
    expect(existsSync(store), 'precondition: no target store yet').toBe(false);
    const { terminal, result } = run({ path: legacy, dryRun: true });
    const r = await result;
    expect(r.exitCode).toBe(EXIT_OK);
    expect(existsSync(store), 'a dry run writes nothing').toBe(false);

    // Separators normalised: on Windows the plan prints `~\.config\servicenow-mcp\…`, which is
    // the RIGHT answer there — the legacy store really is at `%USERPROFILE%\.config` — so the
    // assertion is about the path, not about which slash the platform draws it with.
    const out = posix(terminal.written());
    expect(out).toContain('Legacy store: ~/.config/servicenow-mcp/instances.json (2 instances)');
    expect(out).toContain('Target store: <checkout>/.local/instances.json (project)');
    expect(out).toContain('Each imported instance is probed before it is saved');
    // The plan is the WHOLE output of a dry run: no probe ran, nothing was asked.
    expect(terminal.asked()).toEqual([]);
  });

  it('is byte-identical to the migration snippet ARC-08 and ARC-10 print', async () => {
    const snippet = readFileSync(resolve(here, '../../../../docs/snippets/import-from-legacy.md'), 'utf8');
    const { terminal, result } = run({ path: legacy, dryRun: true });
    await result;
    const plan = posix(terminal.written().trimEnd());
    // The snippet quotes the plan inside its fenced block. One source: if the renderer changes,
    // this fails here rather than in a document nobody re-reads.
    expect(snippet, 'docs/snippets/import-from-legacy.md is stale — regenerate it from the dry run')
      .toContain(plan);
    // The snippet is documentation for both platforms and is written in the POSIX form; the
    // Windows command has its own block inside it, and the deletion advice renders per platform.
    expect(snippet).toContain('Remove-Item -Recurse $HOME\\.config\\servicenow-mcp');
  });
});

describe('AC 2 — the import itself', () => {
  it('writes both entries with the mapped fields, the explicit FLUENT and the prod cap', async () => {
    const { terminal, result } = run({ path: legacy, yes: true });
    const r = await result;
    expect(r.exitCode).toBe(EXIT_OK);
    expect(r.imported).toBe(2);

    const saved = readStore();
    const pdi = saved.instances.pdi as unknown as Record<string, unknown>;
    const prod = saved.instances.prod as unknown as Record<string, unknown>;
    expect(pdi.preset).toBe('pdi-developer');
    expect(pdi.url).toBe('https://dev12345.service-now.com');       // the `/api` suffix is gone
    expect(pdi.toolPackage).toBe('full');
    expect(pdi.maxRecords).toBe(100);
    expect((pdi.flags as Record<string, string>).FLUENT_ENABLED).toBe('false');
    expect(Object.keys(pdi.flags as object).sort()).toEqual([...FLAG_NAMES].sort());

    expect(prod.preset).toBe('read-only');
    expect(Object.values(prod.flags as Record<string, string>).every((v) => v === 'false')).toBe(true);
    expect(prod.prodWriteAck).toBe(false);
    expect(saved.defaultInstance).toBe('pdi');

    // Not one legacy key survives into the new store.
    const bytes = readFileSync(store, 'utf8');
    for (const key of ['aiApiKey', 'group', 'authMode', 'integrationMode', 'addedAt']) {
      expect(bytes, `${key} must not reach the new store`).not.toContain(key);
    }
    for (const secret of SECRETS) expect(terminal.written()).not.toContain(secret);
  });

  it('probes each entry exactly once — S03\'s rule, across a migration too', async () => {
    const { deps: d, result } = run({ path: legacy, yes: true });
    await result;
    expect(d.calls).toHaveLength(2);
    expect(new Set(d.calls).size).toBe(2);
  });
});

describe('AC 3 — an entry whose credentials no longer work', () => {
  it('imports the other one, says 1 of 2, and suggests the command that adds it by hand', async () => {
    const { terminal, deps: d, result } = run({ path: legacy, yes: true },
      [], { 'https://acme.service-now.com': 401 });
    const r = await result;
    expect(r.imported).toBe(1);
    const out = terminal.written();
    expect(out).toContain('Imported 1 of 2');
    expect(out).toContain('auth failed');
    expect(out).toContain('./snowarch instance add prod --url https://acme.service-now.com --env prod');
    expect(Object.keys(readStore().instances)).toEqual(['pdi']);
    // One request per entry, even the one that failed: a migration never retries a login.
    expect(d.calls).toHaveLength(2);
  });
});

describe('AC 4 — the mapping notes', () => {
  it('strips /api, maps staging to test, and caps production', async () => {
    // `staging` needs a legacy file of its own: the committed fixture has two entries because
    // AC 2 and AC 3 count them.
    const staged = join(base, 'staging.json');
    writeFileSync(staged, JSON.stringify({
      version: 1,
      instances: [{
        name: 'uat', instanceUrl: 'https://dev99999.service-now.com/api/', authMethod: 'basic',
        username: 'u', password: fixture.instances[0]?.password, environment: 'staging',
        writeEnabled: true, cmdbWriteEnabled: true,
      }],
    }, null, 2));

    const { terminal, result } = run({ path: staged, dryRun: true });
    await result;
    const out = terminal.written();
    expect(out).toContain('"/api" removed from URL');
    expect(out).toContain('staging mapped to test');
    expect(out).toMatch(/uat\s+https:\/\/dev99999\.service-now\.com\s+test/);

    // And the cap, from the committed fixture's production entry.
    const prod = run({ path: legacy, dryRun: true });
    await prod.result;
    expect(prod.terminal.written()).toContain('production capped at read-only (D-05)');
    expect(prod.terminal.written()).toContain('tool package "minimal" not carried');
  });

  it('a name that cannot be a label is normalised, and the note says so', () => {
    expect(normaliseLabel('My PDI!')).toEqual({ label: 'my-pdi', note: 'label "My PDI!" normalised to "my-pdi"' });
    expect(normaliseLabel('2025-dev').label).toBe('i-2025-dev');
    expect(normaliseLabel('pdi')).toEqual({ label: 'pdi' });
  });
});

describe('AC 5 — running it twice', () => {
  it('reports both labels as existing and changes not one byte', async () => {
    await run({ path: legacy, yes: true }).result;
    const before = readFileSync(store, 'utf8');
    expect(Object.keys(readStore().instances)).toHaveLength(2);

    const { terminal, result } = run({ path: legacy, yes: true });
    const r = await result;
    expect(r.imported).toBe(0);
    expect(terminal.written().match(/skipped: label exists/g)).toHaveLength(2);
    expect(readFileSync(store, 'utf8')).toBe(before);
  });
});

describe('AC 6 — the advice, and the deletion this command never performs', () => {
  it('names the directory and tokens.json, per platform', () => {
    // Rendered for a named platform, on whichever platform the runner happens to be: the advice is
    // a line the reader pastes, so its separators follow the system it describes.
    const unix = deletionAdvice(1, 2, '/home/me', 'linux');
    expect(unix).toContain('rm -r /home/me/.config/servicenow-mcp');
    expect(unix).toContain('tokens.json');
    expect(unix).toContain('Imported 1 of 2');
    const windows = deletionAdvice(2, 2, 'C:\\Users\\me', 'win32');
    expect(windows).toContain('Remove-Item -Recurse');
    expect(windows).toContain('\\.config\\servicenow-mcp');
  });

  it('has no removal call anywhere in its source — the promise, greppable', () => {
    const source = readFileSync(SOURCE, 'utf8');
    // Assembled, so this file is not itself a hit in the sweep it performs.
    for (const call of [['rm', 'Sync'].join(''), ['unlink', 'Sync'].join(''), ['rmdir', 'Sync'].join('')]) {
      expect(source, `the import must never call ${call}`).not.toContain(call);
    }
    // `join()` draws the HOST's separator — these two functions open a file, so that is right —
    // and the assertion is about WHERE, not about which slash. The legacy path is the same
    // `.config` shape on every OS: the old tool used `homedir()/.config` on Windows too, so a
    // `%APPDATA%` guess here would look in a directory that never existed.
    expect(posix(legacyStoreDir('/home/me'))).toBe('/home/me/.config/servicenow-mcp');
    expect(posix(legacyStorePath('/home/me'))).toBe('/home/me/.config/servicenow-mcp/instances.json');
  });
});

describe('the reader and the tables', () => {
  it('every key the fixture carries is mapped, dropped or named a secret — nothing silent', () => {
    const keys = new Set(fixture.instances.flatMap((e) => Object.keys(e)));
    expect(keys.size).toBeGreaterThan(15);
    for (const key of keys) expect(FIELD_MAP[key], `${key} is not in the field map`).toBeDefined();
    // And the flag map covers the five legacy flags, with FLUENT deliberately absent from it.
    expect(FLAG_MAP.map((m) => m.flag)).toEqual(FLAG_NAMES.filter((f) => f !== 'FLUENT_ENABLED'));
  });

  it('an unknown key is reported, not fatal', () => {
    const odd = join(base, 'odd.json');
    writeFileSync(odd, JSON.stringify({ version: 9, instances: [
      { name: 'x', instanceUrl: 'https://dev12345.service-now.com', authMethod: 'basic',
        username: 'u', password: 'example-x', environment: 'pdi', somethingNew: 1 },
    ] }));
    const read = readLegacyStore(odd);
    expect(read.ok).toBe(true);
    expect(read.ok && read.store.unknown).toEqual(['somethingNew']);
    expect(renderPlan({ legacyPath: odd, targetPath: store, targetSource: 'project',
      entries: [], unknownKeys: ['somethingNew'] })).toContain('Unrecognised legacy keys, ignored: somethingNew');
  });

  it('a missing legacy store is a sentence with a remedy, not a crash', async () => {
    const { terminal, result } = run({ path: join(base, 'nope.json'), dryRun: true });
    expect((await result).exitCode).toBe(EXIT_USAGE);
    expect(terminal.written()).toContain('LEGACY_STORE_NOT_FOUND');
  });

  it('an incomplete oauth entry is skipped with the reason, never half-imported', () => {
    const planned = planEntry({ name: 'half', instanceUrl: 'https://dev12345.service-now.com',
      authMethod: 'oauth', username: 'u', password: 'example-half' }, new Set());
    expect(planned.skip).toBe('skipped: oauth entry incomplete');
  });
});

describe('the sweep', () => {
  it('no byte this command wrote is one of the fixture\'s secrets', () => {
    expect(everything.join('').length).toBeGreaterThan(500);
    expect(SECRETS.length).toBeGreaterThan(2);
    const all = everything.join('');
    for (const secret of SECRETS) {
      expect(all.includes(secret), 'a fixture secret reached an output byte').toBe(false);
    }
  });
});
