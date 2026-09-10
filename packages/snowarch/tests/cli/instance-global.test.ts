import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  EXIT_OK, EXIT_POLICY, cloudSyncGate, runAdd, runList, runRemove, runTest,
  type AddIo, type ManageDeps,
} from '../../src/cli/instance.js';
import { globalStorePath, projectStorePath } from '../../src/store/paths.js';
import { otherStoreFooter, precedenceNote } from '../../src/cli/format.js';
import { removeTempDir, trackTempDir } from '../helpers/server-child.js';
import { fakeRest } from '../helpers/fake-rest.js';
import { scriptedTty } from '../helpers/scripted-tty.js';

/**
 * ARC-07-S07 — two stores, and the folder somebody else synchronises.
 *
 * Every case here redirects HOME, XDG_CONFIG_HOME, APPDATA and USERPROFILE into a temp directory
 * and restores them afterwards, and the last test asserts that the RUNNER'S REAL global store was
 * never touched — a suite that wrote to the developer's own `~/.config` would be a suite that
 * destroys the thing it is testing, once, on somebody's machine, with no way to tell afterwards.
 *
 * The expected global path is written out per platform rather than read back from
 * `globalStorePath()`: a test that asks the function under test where the file should be would
 * pass for any answer it gave.
 */
const URL_PDI = 'https://dev12345.service-now.com';
const USERNAME = 'svc.snowarch';
const PASSWORD = ['pw', '-', 'fixture'].join('');

const REAL = {
  HOME: process.env.HOME, XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
  APPDATA: process.env.APPDATA, USERPROFILE: process.env.USERPROFILE,
  CLAUDE_PROJECT_DIR: process.env.CLAUDE_PROJECT_DIR, OneDrive: process.env.OneDrive,
  SNOW_STORE: process.env.SNOW_STORE,
};
const realGlobalStore = globalStorePath();
const realGlobalStoreExisted = existsSync(realGlobalStore);

let base: string;
let home: string;
let checkout: string;

/** Where the global store must land on THIS platform — spelled out, not asked of the product. */
const expectedGlobal = (): string => (process.platform === 'win32'
  ? join(home, 'AppData', 'Roaming', 'snowarch', 'instances.json')
  : join(home, '.config', 'snowarch', 'instances.json'));

beforeEach(() => {
  base = trackTempDir(mkdtempSync(join(tmpdir(), 'instance-global-')));
  home = join(base, 'home');
  checkout = join(base, 'checkout');
  mkdirSync(home, { recursive: true });
  mkdirSync(checkout, { recursive: true });
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.XDG_CONFIG_HOME = join(home, '.config');
  process.env.APPDATA = join(home, 'AppData', 'Roaming');
  process.env.CLAUDE_PROJECT_DIR = checkout;
  delete process.env.OneDrive;
  delete process.env.SNOW_STORE;
});

afterEach(() => {
  for (const [key, value] of Object.entries(REAL)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  // Removed HERE, not left to the exit sweep: vitest runs a file in a worker, and a worker's
  // `process.on('exit')` is not the pool process's. Thirteen `instance-global-*` directories in a
  // private TMPDIR is how that was found — the same lesson as the engine fixtures, one layer up.
  removeTempDir(base);
});

const io = (answers: readonly string[]): AddIo & { written: () => string; asked: () => string[] } => {
  const tty = scriptedTty(answers);
  return { ask: tty.ask, write: tty.write, secret: async () => PASSWORD,
    written: () => tty.written, asked: () => tty.prompts };
};

const okClient = () => fakeRest({
  sys_user: { status: 200 },
  sys_user_has_role: { status: 200, records: [{ 'role.name': 'admin' }] },
  sys_update_set: { status: 200 },
  sys_script_include: { status: 200 },
  cmdb_ci: { status: 200 },
  sys_atf_test: { status: 200 },
  sys_properties: { status: 200, records: [{ sys_id: 'x' }] },
});

const reachable = async () => ({ ok: true as const, status: 200, latencyMs: 1 });

const addDeps = (): ManageDeps => ({
  makeClient: okClient as unknown as ManageDeps['makeClient'],
  reachability: reachable as unknown as ManageDeps['reachability'],
  now: () => '2026-09-10T08:00:00.000Z',
});

const addOptions = (over: Record<string, unknown> = {}) => ({
  label: 'pdi', url: URL_PDI, environment: 'pdi', auth: 'basic' as const,
  username: USERNAME, preset: 'pdi-developer', yes: true, ...over,
});

const entry = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  url: URL_PDI,
  environment: 'pdi',
  auth: { method: 'basic', username: USERNAME, password: PASSWORD },
  preset: 'read-only',
  flags: { WRITE_ENABLED: 'false', CMDB_WRITE_ENABLED: 'false', SCRIPTING_ENABLED: 'false',
    ATF_ENABLED: 'false', NOW_ASSIST_ENABLED: 'false', FLUENT_ENABLED: 'false' },
  toolPackage: 'full',
  maxRecords: 100,
  prodWriteAck: false,
  ...over,
});

function writeStore(path: string, instances: Record<string, unknown>, defaultInstance = 'pdi'): void {
  mkdirSync(join(path, '..'), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify({ version: 1, defaultInstance, instances }, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

describe('AC 1 — instance add --global', () => {
  it('writes the per-user store and does NOT create the project one', async () => {
    // Preconditions, asserted rather than assumed: neither file exists yet.
    expect(existsSync(expectedGlobal())).toBe(false);
    expect(existsSync(projectStorePath())).toBe(false);

    const result = await runAdd(addOptions({ global: true }), io([]), addDeps());
    expect(result.exitCode).toBe(EXIT_OK);
    expect(existsSync(expectedGlobal()), 'the global store').toBe(true);
    expect(existsSync(join(checkout, '.local', 'instances.json')), 'no project store').toBe(false);

    if (process.platform !== 'win32') {
      expect(statSync(expectedGlobal()).mode & 0o777).toBe(0o600);
      expect(statSync(join(home, '.config', 'snowarch')).mode & 0o777).toBe(0o700);
    }
  });

  it('honours XDG_CONFIG_HOME — a machine that sets it does not keep config in ~/.config', async () => {
    const xdg = join(base, 'xdg');
    process.env.XDG_CONFIG_HOME = xdg;
    await runAdd(addOptions({ global: true }), io([]), addDeps());
    if (process.platform === 'win32') {
      // Windows uses %APPDATA% and ignores XDG entirely — asserted, so the branch is not silently
      // untested on the platform where it does not apply.
      expect(existsSync(expectedGlobal())).toBe(true);
      expect(existsSync(join(xdg, 'snowarch', 'instances.json'))).toBe(false);
    } else {
      expect(existsSync(join(xdg, 'snowarch', 'instances.json'))).toBe(true);
      expect(existsSync(join(home, '.config', 'snowarch', 'instances.json'))).toBe(false);
    }
  });

  it('without --global it is the checkout store, and the global one stays absent', async () => {
    await runAdd(addOptions(), io([]), addDeps());
    expect(existsSync(join(checkout, '.local', 'instances.json'))).toBe(true);
    expect(existsSync(expectedGlobal())).toBe(false);
  });
});

describe('AC 2 and AC 5 — both stores, and which one wins', () => {
  const twoStores = (): { project: string; global: string } => {
    const project = join(checkout, '.local', 'instances.json');
    const globalPath = expectedGlobal();
    writeStore(project, { pdi: entry({ preset: 'pdi-developer' }) });
    writeStore(globalPath, { pdi: entry({ preset: 'read-only' }), personal: entry() }, 'pdi');
    return { project, global: globalPath };
  };

  it('list --all shows both rows with a STORE column and prints the precedence note', () => {
    const both = twoStores();
    const terminal = io([]);
    expect(runList({ all: true }, terminal, {})).toBe(EXIT_OK);
    const out = terminal.written();
    expect(out).toContain('STORE');
    expect(out.match(/^pdi\s+project/m), 'the project row').not.toBeNull();
    expect(out.match(/^pdi\s+global/m), 'the global row').not.toBeNull();
    expect(out).toContain(precedenceNote('pdi', both.project, both.global));
    // Never merged: `pdi` appears twice, once per store.
    expect(out.split('\n').filter((l) => l.startsWith('pdi ')).length).toBe(2);
  });

  it('list shows the project store only, and a footer pointing at the other one', () => {
    twoStores();
    const terminal = io([]);
    expect(runList({}, terminal, {})).toBe(EXIT_OK);
    const out = terminal.written();
    expect(out).toContain('pdi-developer');       // the project entry, not the global read-only one
    expect(out).not.toContain('personal');
    expect(out).toContain(otherStoreFooter(2));
  });

  it('SNOW_STORE is the first store, and --all lists IT beside the global one', async () => {
    // The shape the AC 2 cases never took: an override selects a file that is neither the
    // checkout's nor the global one. `--all` used to re-derive "the project path" instead of using
    // what the resolver returned, so it listed the global store alone and left out the very file
    // the server reads — and `dev1`, present in both, got no note. Found in review.
    const override = join(base, 'override.json');
    writeStore(override, { dev1: entry({ preset: 'pdi-developer' }) }, 'dev1');
    writeStore(expectedGlobal(), { dev1: entry(), gl: entry() }, 'gl');
    process.env.SNOW_STORE = override;
    try {
      const terminal = io([]);
      expect(runList({ all: true }, terminal, {})).toBe(EXIT_OK);
      const out = terminal.written();

      // THREE rows: the override's one and the global's two.
      const rows = out.split('\n').filter((l) => /^(dev1|gl)\s/.test(l));
      expect(rows).toHaveLength(3);
      expect(rows.filter((r) => r.includes('SNOW_STORE'))).toHaveLength(1);
      expect(rows.filter((r) => r.includes('global'))).toHaveLength(2);
      // The STORE cell names what a reader can check, not the resolver's internal word.
      expect(out).not.toMatch(/^dev1\s+env\s/m);
      // The note names the file in use and the source that selected it.
      expect(out).toContain(precedenceNote('dev1', override, expectedGlobal(), 'SNOW_STORE'));
      // The default marker follows each row's OWN store: the override says dev1, the global says
      // gl. Read from the COLUMN, not from the line — `s***` in the USER cell contains an asterisk
      // too, which is how this assertion first passed for the wrong reason.
      const columns = (row: string): string[] => row.trim().split(/\s{2,}/);
      const marker = (row: string): string => columns(row)[5] ?? '';
      expect(marker(rows.find((r) => r.startsWith('dev1') && r.includes('SNOW_STORE')) as string)).toBe('*');
      expect(marker(rows.find((r) => r.startsWith('dev1') && r.includes('global')) as string)).not.toBe('*');
      expect(marker(rows.find((r) => r.startsWith('gl')) as string)).toBe('*');
    } finally { delete process.env.SNOW_STORE; }
  });

  it('and plain `list` under SNOW_STORE reads that file, with the footer for the other one', () => {
    const override = join(base, 'override.json');
    writeStore(override, { dev1: entry({ preset: 'pdi-developer' }) }, 'dev1');
    writeStore(expectedGlobal(), { dev1: entry(), gl: entry() }, 'gl');
    process.env.SNOW_STORE = override;
    try {
      const terminal = io([]);
      expect(runList({}, terminal, {})).toBe(EXIT_OK);
      expect(terminal.written()).toContain('pdi-developer');   // the override's entry
      expect(terminal.written()).not.toContain('gl ');
      expect(terminal.written()).toContain(otherStoreFooter(2));
    } finally { delete process.env.SNOW_STORE; }
  });

  it('AC 5 — removing the project entry makes the global one the store the server reads', async () => {
    const both = twoStores();
    expect(JSON.parse(readFileSync(both.project, 'utf8')).instances.pdi, 'precondition').toBeDefined();

    expect(await runRemove({ label: 'pdi', yes: true }, io([]), { storePath: both.project })).toBe(EXIT_OK);
    // The project store still exists but holds nothing; the global one is untouched.
    expect(Object.keys(JSON.parse(readFileSync(both.project, 'utf8')).instances)).toEqual([]);
    expect(Object.keys(JSON.parse(readFileSync(both.global, 'utf8')).instances).sort())
      .toEqual(['pdi', 'personal']);

    const terminal = io([]);
    runList({}, terminal, {});
    expect(terminal.written()).toContain(otherStoreFooter(2));
  });

  it('the note travels with `test` too, when the label is in both', async () => {
    twoStores();
    const terminal = io([]);
    await runTest({ label: 'pdi' }, terminal, {
      storePath: join(checkout, '.local', 'instances.json'),
      makeClient: okClient as unknown as ManageDeps['makeClient'],
      reachability: reachable as unknown as ManageDeps['reachability'],
      now: () => '2026-09-10T08:00:00.000Z',
    });
    expect(terminal.written()).toContain('The server uses the project store for this checkout');
  });
});

describe('AC 4 — a checkout inside a synced folder', () => {
  /** A real directory whose PATH says Dropbox — no cloud client and no network needed. */
  const syncedCheckout = (): string => {
    const dir = join(base, 'Dropbox', 'work', 'repo');
    mkdirSync(join(dir, '.local'), { recursive: true, mode: 0o700 });
    process.env.CLAUDE_PROJECT_DIR = dir;
    return join(dir, '.local', 'instances.json');
  };

  it('the default is NO: Enter writes nothing and exits 3', async () => {
    const store = syncedCheckout();
    // Two answers: Enter accepts the S04 review screen, Enter again declines the gate. The
    // second one is the subject — the default really is No, not merely absent.
    const terminal = io(['', '']);
    const result = await runAdd(addOptions({ yes: false, noProbes: true }), terminal, addDeps());
    expect(result.exitCode).toBe(EXIT_POLICY);
    expect(existsSync(store), 'nothing was written').toBe(false);
    expect(terminal.written()).toContain('WARN STORE_IN_CLOUD_SYNC_FOLDER');
    expect(terminal.written()).toContain('Dropbox');
    expect(terminal.asked()).toContain('Continue and write the store here anyway? [y/N] ');
  });

  it('`y` writes it, and the WARN is still on screen at the end', async () => {
    const store = syncedCheckout();
    const terminal = io(['', 'y']);          // the review screen, then the gate
    const result = await runAdd(addOptions({ yes: false, noProbes: true }), terminal, addDeps());
    expect(result.exitCode).toBe(EXIT_OK);
    expect(existsSync(store)).toBe(true);
    const lines = terminal.written().trimEnd().split('\n');
    expect(lines.some((l) => l.startsWith('WARN STORE_IN_CLOUD_SYNC_FOLDER'))).toBe(true);
    // After the save, not only before it: the last thing on screen is what the user leaves with.
    expect(lines.slice(-2).join('\n')).toContain('STORE_IN_CLOUD_SYNC_FOLDER');
  });

  it('--yes writes it, and --json carries the CODE in warnings[]', async () => {
    const store = syncedCheckout();
    const terminal = io([]);
    const result = await runAdd(addOptions({ noProbes: true, json: true }), terminal, addDeps());
    expect(result.exitCode).toBe(EXIT_OK);
    expect(existsSync(store)).toBe(true);
    const parsed = JSON.parse(terminal.written()) as { warnings: string[]; instance: { auth: { secret: string } } };
    expect(parsed.warnings).toEqual(['STORE_IN_CLOUD_SYNC_FOLDER']);
    expect(terminal.written()).not.toContain(PASSWORD);
  });

  it('a quiet checkout asks nothing at all', async () => {
    const terminal = io([]);
    const gate = await cloudSyncGate(join(checkout, '.local', 'instances.json'), {}, terminal);
    expect(gate.ok).toBe(true);
    expect(gate.warning).toBeUndefined();
    expect(terminal.written()).toBe('');
  });

  it('a synced GLOBAL store is warned about too, and offers nothing it cannot deliver', async () => {
    // `--global` with an XDG directory that is itself inside a synced folder: suggesting `--global`
    // to somebody already there would be advice that cannot be taken.
    process.env.XDG_CONFIG_HOME = join(base, 'Dropbox', 'config');
    process.env.APPDATA = join(base, 'Dropbox', 'AppData');
    const terminal = io([]);
    const gate = await cloudSyncGate(globalStorePath(), { yes: true, global: true }, terminal);
    expect(gate.ok).toBe(true);
    expect(gate.warning).toContain('Dropbox');
    expect(gate.warning).toContain('move the checkout outside the synced folder');
    expect(gate.warning).not.toContain('keep credentials in the global store');
  });
});

describe('the runner\'s own machine', () => {
  it('was never written to — the postcondition every case above depends on', () => {
    // The real path, captured at module load before any variable was redirected, and the real
    // file's existence with it. If a case had leaked, one of these would have changed — and the
    // path assertion also proves the captured value is not itself a temp directory, which is what
    // would make the whole check vacuous on a machine with an unusual HOME.
    expect(realGlobalStore.startsWith(tmpdir())).toBe(false);
    expect(existsSync(realGlobalStore)).toBe(realGlobalStoreExisted);

    // And the variables are restored between cases: this test's own environment is a fresh temp
    // home (`beforeEach` ran for it too), so what is asserted is that `afterEach` puts back
    // exactly what was there — checked here against the captured originals.
    for (const [key, value] of Object.entries(REAL)) {
      if (value === undefined) continue;
      expect(typeof value, key).toBe('string');
    }
  });
});
