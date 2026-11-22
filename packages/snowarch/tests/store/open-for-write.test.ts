// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C307 — the store a WRITER starts from, and what the loader says when it cannot read one.
 *
 * `instance add`, `instance add --replace`, the 1.x import and the installer each read a store that existed and did not load as an empty
 * one, and saved over it: every saved instance and password, gone, with no backup. The rule they now share lives in one function,
 * `openStoreForWrite`: NOTHING at the path is a new store, and anything else is the store as the loader reads it, or the loader's own error.
 * Only a path that is not there (ENOENT) is "nothing": a link that points nowhere, a folder that cannot be searched and a path that runs
 * through a file are somebody's store that cannot be seen, and a writer does not replace what it cannot see.
 *
 * And the loader's STORE_UNREADABLE says no more than it must (the architect's ruling, 2026-11-22): V8's own parse message quotes the first
 * characters of the file, which in a credential store may be a password, and the errno text carries the unmasked absolute path. The message
 * is `<masked path> is not valid JSON`, or `<masked path> cannot be read (<errno code>)`, in the words `store migrate` already uses.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { errnoName, loadStore, maskPath, openStoreForWrite, saveStore } from '../../src/store/index.js';
import { NEWER_STORE_CODE, storeRefusalWords } from '../../src/store/refusal.js';
import type { Store } from '../../src/store/schema.js';
import { cliSpelling } from '../../src/cli/tty.js';
import { removeTempDir, trackTempDir } from '../helpers/server-child.js';
import {
  IS_ROOT, IS_WINDOWS, PLANTS, SECRET_LIKE, STORED_PASSWORD, canPlant, look, plant, release, validStore,
} from '../helpers/broken-stores.js';

/** The launcher as this platform spells it (read once, at module level, as every test that quotes one does). */
const CLI = cliSpelling();
/** What the installer's step tells a person to do, by the store's error: the words are the architect's (2026-11-22); the launcher is this platform's. */
const FILE = join('.local', 'instances.json');
const REMEDY = {
  backup: `restore a backup (${CLI} store backups lists them) and run ${CLI} mode live again, or ask for help; moving the file aside starts an empty store`,
  open: `run chmod 600 ${FILE} (from the checkout), then run ${CLI} mode live again`,
  newer: `run ${CLI} upgrade, then run ${CLI} mode live again`,
  older: `run ${CLI} store migrate, then run ${CLI} mode live again`,
};

let dir: string;
let path: string;

beforeEach(() => {
  dir = trackTempDir(mkdtempSync(join(tmpdir(), 'snowarch-open-for-write-')));
  path = join(dir, 'instances.json');
});
afterEach(() => { release(path); removeTempDir(dir); });

describe('a path with nothing at it is a new store, and only that is', () => {
  it('a file that is not there, in a folder that is: a new, empty store at this build\'s version', () => {
    expect(existsSync(path)).toBe(false);
    expect(openStoreForWrite(path)).toEqual({ state: 'new', store: { version: 1, instances: {} } });
    expect(existsSync(path)).toBe(false);                      // opening never writes
  });

  it('a folder that is not there either: the write makes it, so this is a new store too', () => {
    const deeper = join(dir, 'a', 'b', 'instances.json');
    expect(openStoreForWrite(deeper)).toEqual({ state: 'new', store: { version: 1, instances: {} } });
    expect(existsSync(join(dir, 'a'))).toBe(false);
  });

  it('a store this build reads: the store, as saved', () => {
    saveStore(path, validStore() as unknown as Store);
    const opened = openStoreForWrite(path);
    expect(opened.state).toBe('loaded');
    expect(opened).toMatchObject({ store: { version: 1, defaultInstance: 'keep' } });
    expect(Object.keys((opened as { store: Store }).store.instances)).toEqual(['keep']);
  });

  it.skipIf(IS_WINDOWS)('a link that points nowhere is something that cannot be read, not nothing (skipped on Windows: a link needs a privilege there)', () => {
    symlinkSync(join(dir, 'gone.json'), path);
    const opened = openStoreForWrite(path);
    expect(opened.state).toBe('refused');
    expect(opened).toMatchObject({ error: { code: 'STORE_UNREADABLE', message: `${maskPath(path)} cannot be read (ENOENT)` } });
  });

  it.skipIf(IS_WINDOWS || IS_ROOT)('a folder that cannot be searched hides whatever is in it: refused, not "no store" (skipped on Windows: modes are ACL-inherited; skipped as root: root searches it)', () => {
    const sealed = join(dir, 'sealed');
    mkdirSync(sealed, { mode: 0o700 });
    const inside = join(sealed, 'instances.json');
    writeFileSync(inside, JSON.stringify(validStore()), { mode: 0o600 });
    chmodSync(sealed, 0o000);
    try {
      const opened = openStoreForWrite(inside);
      expect(opened.state).toBe('refused');
      expect(opened).toMatchObject({ error: { code: 'STORE_UNREADABLE', message: `${maskPath(inside)} cannot be read (EACCES)` } });
    } finally { chmodSync(sealed, 0o700); }
  });

  it.skipIf(IS_WINDOWS)('a path that runs through a file is refused as well: ENOTDIR is not ENOENT (skipped on Windows: the system answers ENOENT for it there, and the write that follows fails on the folder it cannot make)', () => {
    writeFileSync(join(dir, 'file'), 'x');
    const opened = openStoreForWrite(join(dir, 'file', 'instances.json'));
    expect(opened.state).toBe('refused');
    expect(opened).toMatchObject({ error: { code: 'STORE_UNREADABLE' } });
  });
});

describe('a store that exists and does not load is refused with the loader\'s own code, and is left exactly as it was', () => {
  for (const p of PLANTS) {
    it.skipIf(!canPlant(p))(`${p.name}: ${p.code}${p.posixOnly ? ' (skipped on Windows: modes are ACL-inherited)' : ''}${p.notRoot ? ' (skipped as root)' : ''}`, () => {
      const was = plant(path, p);
      const opened = openStoreForWrite(path);
      expect(opened.state).toBe('refused');
      expect(opened).toMatchObject({ error: { code: p.code } });
      // The same error the loader gives: this function adds no judgement of its own about what loads.
      const loaded = loadStore(path);
      expect('error' in loaded && loaded.error).toEqual((opened as { error: unknown }).error);
      expect(look(path)).toEqual(was);
    });
  }
});

describe('the loader\'s STORE_UNREADABLE carries no content of the file and no raw path', () => {
  it('a file that is not JSON: `<path> is not valid JSON`, and nothing the file said', () => {
    plant(path, PLANTS[0]!);
    const loaded = loadStore(path);
    expect(loaded).toEqual({ error: { code: 'STORE_UNREADABLE', message: `${maskPath(path)} is not valid JSON` } });
    // The old message was `<path>: Unexpected token 's', "sk-live-q7Zr…" is not valid JSON`, or `… in JSON at position 83`.
    expect(JSON.stringify(loaded)).not.toContain(SECRET_LIKE.slice(0, 6));
    expect(JSON.stringify(loaded)).not.toMatch(/position|Unexpected|Expected|line \d+ column/);
  });

  it.skipIf(IS_WINDOWS || IS_ROOT)('a file that cannot be read: `<path> cannot be read (EACCES)`, the code and nothing else (skipped on Windows: modes are ACL-inherited; skipped as root)', () => {
    plant(path, PLANTS[1]!);
    const loaded = loadStore(path);
    expect(loaded).toEqual({ error: { code: 'STORE_UNREADABLE', message: `${maskPath(path)} cannot be read (EACCES)` } });
    // The old message ended in `open '<absolute path>'`: the path, unmasked, a second time.
    const message = (loaded as { error: { message: string } }).error.message;
    expect(message.split(path).length - 1).toBeLessThanOrEqual(1);
    expect(message).not.toMatch(/permission denied|open '/);
  });

  it('a path that is a folder: the errno code, EISDIR', () => {
    mkdirSync(path);
    if (!IS_WINDOWS) chmodSync(path, 0o700);
    const loaded = loadStore(path);
    expect(loaded).toMatchObject({ error: { code: 'STORE_UNREADABLE' } });
    expect((loaded as { error: { message: string } }).error.message).toMatch(/^.* cannot be read \((EISDIR|EPERM|EACCES)\)$/);
  });

  it('a file that is empty is not JSON either, and says the same', () => {
    writeFileSync(path, '', { mode: 0o600 });
    expect(loadStore(path)).toEqual({ error: { code: 'STORE_UNREADABLE', message: `${maskPath(path)} is not valid JSON` } });
  });

  it('the errno code is all that is said of a failed read: a code, never the system\'s sentence, never anything that is not a code', () => {
    expect(errnoName(Object.assign(new Error('EACCES: permission denied, open \'/Users/x/instances.json\''), { code: 'EACCES' }))).toBe('EACCES');
    expect(errnoName(Object.assign(new Error('x'), { code: 'ERR_INVALID_ARG_VALUE' }))).toBe('ERR_INVALID_ARG_VALUE');
    // not a code: an error with none, one whose "code" is a sentence or a path, and what is not an error at all
    expect(errnoName(new Error('Unexpected token \'s\', "sk-live-…" is not valid JSON'))).toBe('unknown error');
    expect(errnoName(Object.assign(new Error('x'), { code: 'denied: /Users/x/instances.json' }))).toBe('unknown error');
    expect(errnoName(Object.assign(new Error('x'), { code: 13 }))).toBe('unknown error');
    expect(errnoName(null)).toBe('unknown error');
    expect(errnoName('EACCES')).toBe('unknown error');
  });

  it('what a store that loads says is unchanged: the schema errors keep their own words and their commands', () => {
    plant(path, PLANTS.find((x) => x.code === 'STORE_SCHEMA_NEWER')!);
    expect(loadStore(path)).toMatchObject({ error: { code: 'STORE_SCHEMA_NEWER', message: expect.stringMatching(/newer than this server supports \(1\) — run .* upgrade, or restore a backup \(.* store backups\)$/) } });
    plant(path, PLANTS.find((x) => x.code === 'STORE_SCHEMA_OUTDATED')!);
    expect(loadStore(path)).toMatchObject({ error: { code: 'STORE_SCHEMA_OUTDATED', message: expect.stringMatching(/older than this server \(1\) — run .* store migrate$/) } });
  });

  it('a stored password is never in the loader\'s answer, whichever way the file fails', () => {
    for (const p of PLANTS) {
      if (!canPlant(p)) continue;
      plant(path, p);
      const answer = JSON.stringify(loadStore(path));
      expect(answer, p.name).not.toContain(STORED_PASSWORD);
      expect(answer, p.name).not.toContain(SECRET_LIKE);
      release(path);
    }
  });
});

describe('opening for a write is a read, and only a read', () => {
  it('leaves the file, its mode and its folder as it found them, whatever it found', () => {
    for (const p of PLANTS) {
      if (!canPlant(p)) continue;
      const was = plant(path, p);
      openStoreForWrite(path);
      openStoreForWrite(path);
      expect(look(path), p.name).toEqual(was);
      release(path);
      expect(readdirSync(dir).filter((f) => f.includes('.tmp-')), p.name).toEqual([]);
    }
  });
});

describe('the words B06 uses, which cannot import the store: the package\'s names and sentences, from a module that imports nothing', () => {
  it('its words: one for each of the store\'s errors, relative to the checkout, with the launcher it was given, and no full stop', () => {
    const words = (code: string) => storeRefusalWords(code, CLI, FILE);
    expect(words('STORE_UNREADABLE')).toEqual({ code: 'STORE_UNREADABLE', what: 'cannot be read as JSON', remedy: REMEDY.backup });
    expect(words('STORE_SCHEMA_INVALID')).toEqual({ code: 'STORE_SCHEMA_INVALID', what: 'is not a store this release understands', remedy: REMEDY.backup });
    expect(words('STORE_PERMISSIONS_TOO_OPEN').remedy).toBe(REMEDY.open);
    expect(words('STORE_SCHEMA_NEWER').remedy).toBe(REMEDY.newer);
    expect(words('STORE_SCHEMA_OUTDATED').remedy).toBe(REMEDY.older);
    expect(words('SOMETHING_ELSE').code).toBe('STORE_UNREADABLE');
    expect(NEWER_STORE_CODE).toBe('STORE_SCHEMA_NEWER');          // B06 reads the version out of the file itself, and takes the name of the error from here
    for (const code of ['STORE_UNREADABLE', 'STORE_SCHEMA_INVALID', 'STORE_PERMISSIONS_TOO_OPEN', 'STORE_SCHEMA_NEWER', 'STORE_SCHEMA_OUTDATED']) {
      expect(words(code).remedy.endsWith('.'), code).toBe(false);
      expect(JSON.stringify(words(code)), code).not.toMatch(/\/Users\/|[A-Z]:\\\\/);
    }
  });

  it('the module imports nothing at all: B06 answers where there is no node_modules (a design-only checkout that has a store)', () => {
    const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../src/store/refusal.ts'), 'utf8');
    const imports = [...source.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]);
    expect(imports).toEqual([]);
    expect(source).not.toMatch(/^\s*(import\b|require\()/m);
  });
});
