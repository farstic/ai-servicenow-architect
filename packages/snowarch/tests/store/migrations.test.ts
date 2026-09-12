/**
 * ARC-09-S06 — the store migration framework.
 *
 * The invariants are the point of this file. A migration framework whose tests only prove that
 * a field got renamed is a framework that will, one release from now, rename a password.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  CURRENT_SCHEMA_VERSION, MIGRATIONS, StoreMigrationError, authUnchanged, backupName,
  SHIPPED_CHAIN_STARTS_AT, checkRegistry, listBackups, migrateStore, restoreBackup,
  type Migration,
} from '../../src/store/migrations/index.js';
import { STORE_VERSION } from '../../src/store/schema.js';

const isWindows = process.platform === 'win32';

// Assembled, never spelled: a fixture that wrote a credential-shaped literal would be the one
// file in this repository a secret sweep is entitled to complain about.
const PASSWORD = `${'Fix'}-${'ture'}-${'8821'}`;
const SECRET = `${'cs'}-${'9f3a2b'}`;

const v1Store = () => ({
  version: 1,
  defaultInstance: 'pdi',
  instances: {
    pdi: {
      url: 'https://dev12345.service-now.com',
      environment: 'pdi',
      auth: { method: 'basic', username: 'fixture.user', password: PASSWORD },
      preset: 'pdi-developer',
      flags: { WRITE_ENABLED: 'true' },
      toolPackage: 'full',
      maxRecords: 100,
      prodWriteAck: false,
    },
    other: {
      url: 'https://dev67890.service-now.com',
      environment: 'dev',
      auth: { method: 'oauth_ropc', clientId: 'cid', clientSecret: SECRET,
        username: 'fixture.two', password: PASSWORD },
      preset: 'read-only',
      flags: {},
      toolPackage: 'full',
      maxRecords: 100,
      prodWriteAck: false,
    },
  },
});

/**
 * The test-only 1→2 migration.
 *
 * A PARAMETER, not a `registerMigrationForTest` hook (story amendment): a registry a test can
 * append to is a registry a production path can append to, and the hook would have to exist in
 * the shipped build to be callable from one. `migrateStore`'s `migrations` option gives the
 * fixture its chain while the shipped `MIGRATIONS` stays empty and frozen in place.
 */
const addField: Migration = {
  from: 1, to: 2, describe: 'add lastUpgradeCheck to every instance',
  up: (store) => ({
    ...store,
    instances: Object.fromEntries(Object.entries(
      store.instances as Record<string, Record<string, unknown>>)
      .map(([label, inst]) => [label, { ...inst, lastUpgradeCheck: null }])),
  }),
};

/** AC 7's deliberately bad one. It must never be possible to ship this. */
const touchesCredentials: Migration = {
  from: 1, to: 2, describe: 'a migration that rewrites a password',
  up: (store) => ({
    ...store,
    instances: Object.fromEntries(Object.entries(
      store.instances as Record<string, { auth: Record<string, unknown> }>)
      .map(([label, inst]) => [label, { ...inst, auth: { ...inst.auth, password: 'rewritten' } }])),
  }),
};

let dir: string;
let store: string;

const write = (body: unknown) => {
  writeFileSync(store, `${JSON.stringify(body, null, 2)}\n`, { mode: 0o600 });
  if (!isWindows) chmodSync(store, 0o600);
};
const read = () => JSON.parse(readFileSync(store, 'utf8'));
const mode = (p: string) => statSync(p).mode & 0o777;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'snowarch-migrate-'));
  store = join(dir, 'instances.json');
  write(v1Store());
});
afterEach(() => { rmSync(dir, { recursive: true, force: true, maxRetries: 10 }); });

describe('the shipped registry', () => {
  it('is EMPTY at v1, and the version it targets is the schema constant', () => {
    // 2.0.0 ships the framework and no migration. The contiguity rule below is what makes that
    // safe: whoever bumps the constant cannot get away without writing the migration.
    expect(MIGRATIONS).toEqual([]);
    expect(SHIPPED_CHAIN_STARTS_AT).toBe(1);
    expect(CURRENT_SCHEMA_VERSION).toBe(1);
    expect(CURRENT_SCHEMA_VERSION).toBe(STORE_VERSION);
    expect(checkRegistry()).toEqual([]);
  });

  it('a bumped constant with no migration is a failing registry, not a silent no-op', () => {
    expect(checkRegistry([], 2)).toEqual(['no migrations, but CURRENT_SCHEMA_VERSION is 2']);
  });

  it('AC 7a — a gap in the chain is refused', () => {
    const gapped: Migration[] = [addField, { ...addField, from: 3, to: 4 }];
    expect(checkRegistry(gapped, 4)).toContain('migration 1 starts at 3, but 0 ended at 2');
  });

  it('a migration that skips a version is refused', () => {
    expect(checkRegistry([{ ...addField, from: 1, to: 3 }], 3))
      .toContain('migration 0 is 1→3, not a single step');
  });

  it('a chain that stops short of the constant is refused', () => {
    expect(checkRegistry([addField], 3)).toContain('the chain ends at 2, but CURRENT_SCHEMA_VERSION is 3');
  });

  it('a migration with no description is refused — a user approves what they can read', () => {
    expect(checkRegistry([{ ...addField, describe: '  ' }], 2))
      .toContain('migration 0 (1→2) has no description');
  });
});

describe('AC 1 — a v1 store migrates, with a byte-identical 0600 backup', () => {
  it('migrates two instances, backs the file up, and leaves every credential alone', () => {
    const before = readFileSync(store);
    const result = migrateStore(store, { migrations: [addField], current: 2 });

    expect(result.migrated).toBe(true);
    expect(result.from).toBe(1);
    expect(result.to).toBe(2);
    expect(result.steps).toEqual(['1→2 add lastUpgradeCheck to every instance']);

    // The BACKUP: byte-identical to the input, not a re-serialisation of the parsed object —
    // a rescue copy that quietly reformatted the file is not the file that was there.
    expect(result.backup).toBeDefined();
    expect(readFileSync(result.backup!)).toEqual(before);
    if (!isWindows) expect(mode(result.backup!)).toBe(0o600);

    const after = read();
    expect(after.version).toBe(2);
    expect(after.instances.pdi.lastUpgradeCheck).toBe(null);
    expect(after.instances.other.lastUpgradeCheck).toBe(null);
    if (!isWindows) expect(mode(store)).toBe(0o600);

    // THE INVARIANT, asserted on the real before/after rather than trusted: every instance's
    // whole auth subtree, byte for byte.
    const original = JSON.parse(before.toString());
    for (const label of ['pdi', 'other']) {
      expect(after.instances[label].auth).toEqual(original.instances[label].auth);
    }
    expect(authUnchanged(original, after)).toEqual([]);
  });

  it('the backup name sorts chronologically and says what it is', () => {
    expect(backupName(new Date('2026-10-01T10:15:00.123Z'))).toBe('instances.json.bak-20261001T101500Z');
  });

  it('a store already at the current version is not migrated and nothing is written', () => {
    const before = readFileSync(store);
    const result = migrateStore(store, { migrations: [], current: 1 });
    expect(result).toEqual({ migrated: false, from: 1, to: 1, steps: [] });
    expect(readFileSync(store)).toEqual(before);
    expect(listBackups(store)).toEqual([]);
  });
});

describe('AC 7 — a migration that touches a credential cannot ship', () => {
  it('is refused, the store is not written, and the message names no value', () => {
    const before = readFileSync(store);
    try {
      migrateStore(store, { migrations: [touchesCredentials], current: 2 });
      throw new Error('the bad migration was applied');
    } catch (e) {
      const err = e as StoreMigrationError;
      expect(err.code).toBe('STORE_SCHEMA_INVALID');
      expect(err.message).toContain('changed credential data and was refused');
      expect(err.message).toContain('instance "pdi"');
      // The PASSWORD is not in the message. A refusal that printed the value it was protecting
      // would put it in a log, a CI transcript and a bug report.
      expect(err.message).not.toContain(PASSWORD);
      expect(err.message).not.toContain('rewritten');
    }
    expect(readFileSync(store)).toEqual(before);
  });

  it('a migration that mutates its input throws instead of succeeding quietly', () => {
    const mutates: Migration = {
      from: 1, to: 2, describe: 'mutates in place',
      up: (s) => { (s as { version: number }).version = 2; return s; },
    };
    expect(() => migrateStore(store, { migrations: [mutates], current: 2 })).toThrow();
  });

  it('a migration that drops an instance is caught by the same invariant', () => {
    const drops: Migration = {
      from: 1, to: 2, describe: 'drops one',
      up: (s) => ({ ...s, instances: { pdi: (s.instances as Record<string, unknown>).pdi } }),
    };
    expect(() => migrateStore(store, { migrations: [drops], current: 2 }))
      .toThrow(/instance "other" was removed/);
  });
});

describe('AC 3 — a store from the future is refused, not downgraded', () => {
  it('throws STORE_SCHEMA_NEWER and writes nothing', () => {
    write({ ...v1Store(), version: 3 });
    const before = readFileSync(store);
    try {
      migrateStore(store, { migrations: [addField], current: 2 });
      throw new Error('a v3 store was migrated by a v2 build');
    } catch (e) {
      const err = e as StoreMigrationError;
      expect(err.code).toBe('STORE_SCHEMA_NEWER');
      expect(err.message).toContain('newer than this server supports (2)');
      expect(err.message).toContain('./snowarch upgrade');
    }
    expect(readFileSync(store)).toEqual(before);
    expect(listBackups(store)).toEqual([]);
  });
});

describe('AC 6 — an unreadable store is a hard error, never "return empty"', () => {
  it('throws STORE_UNREADABLE, names the remedy, and does not overwrite the file', () => {
    writeFileSync(store, '{ this was hand-edited\n');
    const before = readFileSync(store);
    try {
      migrateStore(store, { migrations: [addField], current: 2 });
      throw new Error('an invalid store was accepted');
    } catch (e) {
      const err = e as StoreMigrationError;
      expect(err.code).toBe('STORE_UNREADABLE');
      expect(err.message).toContain('is not valid JSON');
      expect(err.message).toContain('./snowarch store backups');
    }
    expect(readFileSync(store)).toEqual(before);
  });

  it('a version that is not a positive integer is a schema error, not a crash', () => {
    write({ ...v1Store(), version: 'one' });
    expect(() => migrateStore(store, { migrations: [addField], current: 2 }))
      .toThrow(/version must be a positive integer/);
  });

  it('a store this build has no path from is named, not guessed at', () => {
    write({ ...v1Store(), version: 1 });
    // A chain that starts at 2 cannot take a v1 store anywhere — and the refusal says so against
    // the FILE, with its version in it, rather than as an abstract complaint about the registry.
    expect(() => migrateStore(store, { migrations: [{ from: 2, to: 3, describe: 'x', up: (x) => x }], current: 3 }))
      .toThrow(/is schema 1, and this build has no migration from it to 3/);
  });
});

describe('AC 5 — dry run', () => {
  it('describes what would happen and writes nothing at all', () => {
    const before = readFileSync(store);
    const plan = migrateStore(store, { migrations: [addField], current: 2, dryRun: true });
    expect(plan.migrated).toBe(false);
    expect(plan.dryRun).toBe(true);
    expect(plan.steps).toEqual(['1→2 add lastUpgradeCheck to every instance']);
    expect(readFileSync(store)).toEqual(before);
    expect(listBackups(store)).toEqual([]);
  });
});

describe('backups and restore', () => {
  it('lists backups newest first and restores one, 0600 and parsed before it is written', () => {
    migrateStore(store, { migrations: [addField], current: 2 });
    const backups = listBackups(store);
    expect(backups).toHaveLength(1);
    expect(backups[0]!.path).toMatch(/instances\.json\.bak-\d{8}T\d{6}Z$/);

    expect(read().version).toBe(2);
    const { version } = restoreBackup(store, backups[0]!.path);
    expect(version).toBe(1);
    expect(read().version).toBe(1);
    expect(read().instances.pdi.auth.password).toBe(PASSWORD);
    if (!isWindows) expect(mode(store)).toBe(0o600);
  });

  it('a backup that is not valid JSON is refused BEFORE the current store is replaced', () => {
    const bad = join(dir, 'instances.json.bak-20260101T000000Z');
    writeFileSync(bad, 'not json');
    const before = readFileSync(store);
    expect(() => restoreBackup(store, bad)).toThrow(/is not valid JSON/);
    expect(readFileSync(store)).toEqual(before);
  });

  it('a backup that is not there is a named error, not an ENOENT stack', () => {
    expect(() => restoreBackup(store, join(dir, 'nope'))).toThrow(/backup not found/);
  });
});
