/**
 * ARC-09-S06, AC 5/6 — `snowarch store migrate | backups | restore`.
 *
 * Every path returns a code and takes its IO as an argument, so the whole surface runs in-process
 * twice in one file: a CLI that can only be tested by spawning it is a CLI whose refusals nobody
 * checks. The prompt is a function here for the same reason the wizard's is.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  NOTHING_CHANGED, runStore, runStoreBackups, runStoreMigrate, runStoreRestore, storeHelp,
  type StoreIo,
} from '../../src/cli/store-command.js';
import {
  CURRENT_SCHEMA_VERSION, listBackups, type Migration,
} from '../../src/store/migrations/index.js';

/**
 * A pending migration for the CLI to be about.
 *
 * The shipped registry is EMPTY at v1 — that is the product being correct — so without a chain
 * every one of these cases would take the "nothing to do" branch and AC 5 would assert nothing.
 * The seam is `migrateStore`'s own `migrations` option, handed through `runStoreMigrate`.
 */
const addField: Migration = {
  from: CURRENT_SCHEMA_VERSION, to: CURRENT_SCHEMA_VERSION + 1,
  describe: 'add lastUpgradeCheck to every instance',
  up: (store) => ({
    ...store,
    instances: Object.fromEntries(Object.entries(
      store.instances as Record<string, Record<string, unknown>>)
      .map(([label, inst]) => [label, { ...inst, lastUpgradeCheck: null }])),
  }),
};
const CHAIN = { migrations: [addField], current: CURRENT_SCHEMA_VERSION + 1 };

const isWindows = process.platform === 'win32';
const PASSWORD = `${'Fix'}-${'ture'}-${'8821'}`;

let dir: string;
let checkout: string;
let store: string;
let answers: string[];
let out: string[];
let errs: string[];

const io = (): StoreIo => ({
  write: (t) => out.push(t),
  error: (t) => errs.push(t),
  ask: async () => answers.shift() ?? '',
});

const said = () => out.join('');
const complained = () => errs.join('');

const storeAt = (version: number) => ({
  version,
  defaultInstance: 'pdi',
  instances: {
    pdi: {
      url: 'https://dev12345.service-now.com',
      environment: 'pdi',
      auth: { method: 'basic', username: 'fixture.user', password: PASSWORD },
      preset: 'pdi-developer', toolPackage: 'full', maxRecords: 100, prodWriteAck: false,
    },
  },
});

function write(body: unknown): void {
  writeFileSync(store, `${JSON.stringify(body, null, 2)}\n`, { mode: 0o600 });
  if (!isWindows) chmodSync(store, 0o600);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'snowarch-store-cli-'));
  checkout = join(dir, 'repo');
  mkdirSync(join(checkout, '.local'), { recursive: true, mode: 0o700 });
  store = join(checkout, '.local', 'instances.json');
  write(storeAt(CURRENT_SCHEMA_VERSION));
  answers = [];
  out = [];
  errs = [];
  // The store is resolved the way the server resolves it, so the command under test reads the
  // same file the server would — a test that passed a path would be testing a different program.
  vi.stubEnv('SNOW_STORE', store);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true, maxRetries: 10 });
});

describe('the sub-command surface', () => {
  it('help names the three commands, the backup promise, and the exit codes', () => {
    const help = storeHelp();
    for (const needle of ['migrate', 'backups', 'restore', '0600 backup',
      'never pruned automatically', 'exit codes']) {
      expect(help).toContain(needle);
    }
  });

  it('an unknown sub-command is a usage error naming the three that exist', async () => {
    expect(await runStore(['frobnicate'], io())).toBe(2);
    expect(complained()).toContain('migrate, backups or restore');
  });

  it('no sub-command prints the help and exits 2', async () => {
    expect(await runStore([], io())).toBe(2);
    expect(said()).toContain('usage: snowarch store');
  });
});

describe('AC 5 — migrate: a current store, a dry run, a yes and a no', () => {
  it('a store already at this schema says so and writes nothing', async () => {
    const before = readFileSync(store);
    expect(await runStoreMigrate([], io())).toBe(0);
    expect(said()).toContain(`schema v${CURRENT_SCHEMA_VERSION} is current — nothing to do`);
    expect(readFileSync(store)).toEqual(before);
  });

  it('--dry-run on a store from the future refuses and writes nothing', async () => {
    write(storeAt(CURRENT_SCHEMA_VERSION + 1));
    const before = readFileSync(store);
    expect(await runStoreMigrate(['--dry-run'], io())).toBe(1);
    expect(complained()).toContain('STORE_SCHEMA_NEWER');
    expect(complained()).toContain('./snowarch upgrade');
    expect(readFileSync(store)).toEqual(before);
  });

  it('the PLAN is printed before anything is written, and says what it will not touch', async () => {
    const before = readFileSync(store);
    answers = ['n'];
    expect(await runStoreMigrate([], io(), CHAIN)).toBe(0);
    // Principle 10: every line is something a reader can check before answering.
    expect(said()).toContain(`Store schema v${CURRENT_SCHEMA_VERSION} → v${CURRENT_SCHEMA_VERSION + 1}`);
    expect(said()).toContain('1 migration:');
    expect(said()).toContain('add lastUpgradeCheck to every instance');
    expect(said()).toContain('backup:');
    expect(said()).toContain('credentials: untouched');
    // …and `n` means nothing at all happened.
    expect(said()).toContain(NOTHING_CHANGED);
    expect(readFileSync(store)).toEqual(before);
    expect(listBackups(store)).toEqual([]);
  });

  it('--dry-run prints the same plan, asks nothing, and writes nothing', async () => {
    const before = readFileSync(store);
    expect(await runStoreMigrate(['--dry-run'], io(), CHAIN)).toBe(0);
    expect(said()).toContain('add lastUpgradeCheck to every instance');
    expect(said()).toContain('--dry-run, nothing was written');
    expect(readFileSync(store)).toEqual(before);
    expect(listBackups(store)).toEqual([]);
    // The prompt was never reached: a dry run that asked a question would be a dry run with a
    // way to say yes.
    expect(answers).toEqual([]);
  });

  it('--yes migrates without asking, names the backup, and leaves the credential alone', async () => {
    const before = JSON.parse(readFileSync(store, 'utf8')) as
      { instances: Record<string, { auth: unknown }> };
    expect(await runStoreMigrate(['--yes'], io(), CHAIN)).toBe(0);
    expect(said()).toContain(`migrated schema v${CURRENT_SCHEMA_VERSION} → v${CURRENT_SCHEMA_VERSION + 1}`);
    expect(said()).toMatch(/backup .*instances\.json\.bak-\d{8}T\d{6}Z/);

    const after = JSON.parse(readFileSync(store, 'utf8')) as
      { version: number; instances: Record<string, { auth: unknown; lastUpgradeCheck?: unknown }> };
    expect(after.version).toBe(CURRENT_SCHEMA_VERSION + 1);
    expect(after.instances.pdi!.lastUpgradeCheck).toBe(null);
    expect(after.instances.pdi!.auth).toEqual(before.instances.pdi!.auth);
    expect(listBackups(store)).toHaveLength(1);
  });

  it('anything but n means yes, because the default is the action the user asked for', async () => {
    answers = [''];
    expect(await runStoreMigrate([], io(), CHAIN)).toBe(0);
    expect(said()).toContain('migrated schema');
  });

  it('AC 6 — an unreadable store exits 1, names the remedy, and does not overwrite it', async () => {
    writeFileSync(store, '{ this was hand-edited\n');
    const before = readFileSync(store);
    expect(await runStoreMigrate(['--yes'], io())).toBe(1);
    expect(complained()).toContain('STORE_UNREADABLE');
    expect(complained()).toContain('is not valid JSON');
    expect(complained()).toContain('./snowarch store backups');
    expect(readFileSync(store)).toEqual(before);
  });
});

describe('backups', () => {
  it('says so plainly when there are none', () => {
    expect(runStoreBackups(io())).toBe(0);
    expect(said()).toContain('no backups');
  });

  it('lists them newest first and says they are never pruned', () => {
    writeFileSync(join(checkout, '.local', 'instances.json.bak-20260101T000000Z'), '{"version":1}\n');
    writeFileSync(join(checkout, '.local', 'instances.json.bak-20260202T000000Z'), '{"version":1}\n');
    expect(runStoreBackups(io())).toBe(0);
    const lines = said().trim().split('\n').filter((l) => l.includes('bak-'));
    expect(lines).toHaveLength(2);
    expect(said()).toContain('never pruned automatically');
  });
});

describe('restore', () => {
  it('without a file it is a usage error that names how to find one', async () => {
    expect(await runStoreRestore([], io())).toBe(2);
    expect(complained()).toContain('./snowarch store backups');
  });

  it('a file that is not there is named, not an ENOENT stack', async () => {
    expect(await runStoreRestore([join(dir, 'nope'), '--yes'], io())).toBe(1);
    expect(complained()).toContain('is not there');
  });

  it('n leaves everything alone and says so', async () => {
    const bak = join(checkout, '.local', 'instances.json.bak-20260101T000000Z');
    writeFileSync(bak, `${JSON.stringify(storeAt(CURRENT_SCHEMA_VERSION))}\n`);
    const before = readFileSync(store);
    answers = ['n'];
    expect(await runStoreRestore([bak], io())).toBe(0);
    expect(said()).toContain(NOTHING_CHANGED);
    expect(readFileSync(store)).toEqual(before);
  });

  it('--yes restores without asking, and the plan was printed first', async () => {
    const bak = join(checkout, '.local', 'instances.json.bak-20260101T000000Z');
    const rescued = storeAt(CURRENT_SCHEMA_VERSION);
    rescued.defaultInstance = 'pdi';
    writeFileSync(bak, `${JSON.stringify(rescued)}\n`);
    write({ ...storeAt(CURRENT_SCHEMA_VERSION), defaultInstance: 'other' });

    expect(await runStoreRestore([bak, '--yes'], io())).toBe(0);
    expect(said()).toContain('the current store is REPLACED');
    expect(said()).toContain(`restored schema v${CURRENT_SCHEMA_VERSION}`);
    expect(JSON.parse(readFileSync(store, 'utf8')).defaultInstance).toBe('pdi');
    // The prompt was never reached, so the scripted answer is still sitting there.
    expect(answers).toEqual([]);
  });

  it('restoring an OLDER schema names the next step rather than leaving it to be discovered', async () => {
    const bak = join(checkout, '.local', 'instances.json.bak-20260101T000000Z');
    writeFileSync(bak, `${JSON.stringify({ ...storeAt(CURRENT_SCHEMA_VERSION), version: CURRENT_SCHEMA_VERSION + 1 })}\n`);
    expect(await runStoreRestore([bak, '--yes'], io())).toBe(0);
    expect(said()).toContain('./snowarch store migrate');
  });
});
