// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C272 — `saveStore` makes the store private on Windows: what it locks, and when it does not touch what was there.
 *
 * The rule, from the row: the lock is applied when the folder and the store are CREATED, and when a credential is being stored
 * (`instance add`, `set-credentials`) into something that already existed; nothing changes an existing file's permissions silently,
 * so a routine write (a probe result, a default) never makes an open file private, and a change to something that existed is reported.
 *
 * ONE THING A ROUTINE WRITE MUST DO, and the measurement on a windows-latest runner is why: `saveStore` replaces the file with one
 * made in its folder, and a file made in a folder takes the folder's permissions. A file that was private in an open folder would come
 * out of an ordinary save readable by everyone — the privacy a person was told about, undone by the next probe result. So the file
 * is read before the replace, and one that was private is made private again after it.
 *
 * The lock tools are a seam here — a fake that records its calls — and the folder is a real one in the temp directory, so the
 * store is really written. `acl.platform` is what makes the same code run as Windows on any host.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AclTools, EnsureResult, Exposure } from '../../src/store/acl.js';
import { saveStore } from '../../src/store/index.js';
import type { Store } from '../../src/store/schema.js';
import { trackTempDir } from '../helpers/server-child.js';

const store = (maxRecords = 100): Store => JSON.parse(JSON.stringify({
  version: 1,
  defaultInstance: 'pdi',
  instances: {
    pdi: {
      url: 'https://dev12345.service-now.com',
      environment: 'pdi',
      auth: { method: 'basic', username: 'admin', password: 'secret' },
      preset: 'pdi-developer',
      flags: { WRITE_ENABLED: 'true', CMDB_WRITE_ENABLED: 'false', SCRIPTING_ENABLED: 'false',
               ATF_ENABLED: 'false', NOW_ASSIST_ENABLED: 'false', FLUENT_ENABLED: 'false' },
      toolPackage: 'full', maxRecords, prodWriteAck: false,
    },
  },
}));

const OPEN: Exposure = { who: ['NT AUTHORITY\\Authenticated Users', 'BUILTIN\\Users'], read: true };

/** Lock tools that record every call and answer as scripted. */
function fakeAcl(script: {
  platform?: NodeJS.Platform;
  read?: (path: string) => ReturnType<AclTools['read']>;
  lock?: (path: string, dir: boolean) => { ok: true } | { ok: false; reason: string };
  ensure?: (path: string, dir: boolean) => EnsureResult;
} = {}) {
  const calls: string[] = [];
  const acl: AclTools = {
    platform: script.platform ?? 'win32',
    userSid: () => 'S-1-5-21-1-2-3-1001',
    read: (path) => { calls.push(`read ${path}`); return (script.read ?? (() => ({ ok: true, exposure: { who: [], read: false } } as const)))(path); },
    lock: (path, { dir }) => { calls.push(`lock ${dir ? 'dir' : 'file'} ${path}`); return (script.lock ?? (() => ({ ok: true } as const)))(path, dir); },
    ensurePrivate: (path, { dir }) => {
      calls.push(`ensure ${dir ? 'dir' : 'file'} ${path}`);
      return (script.ensure ?? (() => ({ state: 'private' } as const)))(path, dir);
    },
  };
  return { acl, calls };
}

let tmp: string;
beforeEach(() => { tmp = trackTempDir(mkdtempSync(join(tmpdir(), 'snowarch-store-acl-'))); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

describe('ARC-09-C272 — saveStore on Windows locks what it creates', () => {
  it('a folder it creates is locked, once, as a folder; the file inside inherits it and is not locked on its own', () => {
    const dir = join(tmp, 'checkout', '.local');
    const p = join(dir, 'instances.json');
    const { acl, calls } = fakeAcl();
    const written = saveStore(p, store(), { acl });
    expect(calls).toEqual([`lock dir ${dir}`]);
    expect(written.acl).toEqual({ state: 'created' });
    expect(JSON.parse(readFileSync(p, 'utf8')).version).toBe(1);
  });

  it('only the store\'s own folder is locked, not the folders made on the way to it: a path several levels deep is one lock', () => {
    const dir = join(tmp, 'a', 'b', 'c');
    const { acl, calls } = fakeAcl();
    saveStore(join(dir, 'instances.json'), store(), { acl });
    expect(calls).toEqual([`lock dir ${dir}`]);
  });

  it('a new file in a folder that was already there is locked as a file, and the folder is not touched', () => {
    const dir = join(tmp, 'existing');
    mkdirSync(dir);
    const p = join(dir, 'instances.json');
    const { acl, calls } = fakeAcl();
    const written = saveStore(p, store(), { acl });
    expect(calls).toEqual([`lock file ${p}`]);
    expect(written.acl).toEqual({ state: 'created' });
  });

  it('a routine write keeps a private file private: it is read before the replace, and the replacement is locked again', () => {
    const p = join(tmp, '.local', 'instances.json');
    saveStore(p, store(), { acl: fakeAcl({ platform: 'linux' }).acl });
    const { acl, calls } = fakeAcl();   // the file reads as private
    const written = saveStore(p, store(250), { acl });
    expect(calls).toEqual([`read ${p}`, `lock file ${p}`]);
    expect(written.acl).toEqual({ state: 'private' });
    expect(JSON.parse(readFileSync(p, 'utf8')).instances.pdi.maxRecords).toBe(250);
  });

  it('a routine write leaves an open file open: making it private is not what the write was asked to do', () => {
    const p = join(tmp, '.local', 'instances.json');
    saveStore(p, store(), { acl: fakeAcl({ platform: 'linux' }).acl });
    const { acl, calls } = fakeAcl({ read: () => ({ ok: true, exposure: OPEN }) });
    const written = saveStore(p, store(250), { acl });
    expect(calls).toEqual([`read ${p}`]);
    expect(written.acl).toEqual({ state: 'untouched' });
  });

  it('a file whose permissions could not be read is left as it was', () => {
    const p = join(tmp, '.local', 'instances.json');
    saveStore(p, store(), { acl: fakeAcl({ platform: 'linux' }).acl });
    const { acl, calls } = fakeAcl({ read: () => ({ ok: false, reason: 'icacls exited 5: Access is denied.' }) });
    expect(saveStore(p, store(250), { acl }).acl).toEqual({ state: 'untouched' });
    expect(calls).toEqual([`read ${p}`]);
  });

  it('a platform that is not Windows is not asked anything, whatever it creates', () => {
    const { acl, calls } = fakeAcl({ platform: 'linux' });
    const written = saveStore(join(tmp, 'x', '.local', 'instances.json'), store(), { acl });
    expect(calls).toEqual([]);
    expect(written.acl).toEqual({ state: 'not-windows' });
  });

  it('a lock that fails does not lose the store: the file is written, and the failure is reported with its reason', () => {
    const { acl } = fakeAcl({ lock: () => ({ ok: false, reason: 'icacls exited 5: Access is denied.' }) });
    const p = join(tmp, '.local', 'instances.json');
    const written = saveStore(p, store(), { acl });
    expect(existsSync(p)).toBe(true);
    expect(written.acl).toEqual({ state: 'failed', reason: 'icacls exited 5: Access is denied.' });
  });
});

describe('ARC-09-C272 — saveStore when a credential is being stored into what already existed', () => {
  const existing = () => {
    const dir = join(tmp, 'checkout', '.local');
    const p = join(dir, 'instances.json');
    saveStore(p, store(), { acl: fakeAcl({ platform: 'linux' }).acl });
    return { dir, p };
  };

  it('makes the file and the product\'s own folder private, whatever they were, and says what it changed', () => {
    const { dir, p } = existing();
    const { acl, calls } = fakeAcl({ ensure: () => ({ state: 'locked', was: OPEN }) });
    const written = saveStore(p, store(), { acl, lock: 'always' });
    expect(calls).toEqual([`ensure file ${p}`, `ensure dir ${dir}`]);
    expect(written.acl).toEqual({ state: 'locked', was: OPEN });
  });

  it('changes nothing that is already private, and says nothing was changed', () => {
    const { p } = existing();
    const { acl } = fakeAcl({ ensure: () => ({ state: 'private' }) });
    expect(saveStore(p, store(), { acl, lock: 'always' }).acl).toEqual({ state: 'private' });
  });

  it('never locks a folder it does not own: a store the user pointed at inside a folder of their own gets its file locked and nothing more', () => {
    const dir = join(tmp, 'Documents');
    mkdirSync(dir);
    const p = join(dir, 'instances.json');
    writeFileSync(p, '{}');
    const { acl, calls } = fakeAcl({ ensure: () => ({ state: 'locked', was: OPEN }) });
    saveStore(p, store(), { acl, lock: 'always' });
    expect(calls).toEqual([`ensure file ${p}`]);
  });

  it('owns a folder called snowarch as well (the per-user store under %APPDATA%)', () => {
    const dir = join(tmp, 'AppData', 'Roaming', 'snowarch');
    const p = join(dir, 'instances.json');
    saveStore(p, store(), { acl: fakeAcl({ platform: 'linux' }).acl });
    const { acl, calls } = fakeAcl();
    saveStore(p, store(), { acl, lock: 'always' });
    expect(calls).toEqual([`ensure file ${p}`, `ensure dir ${dir}`]);
  });

  it('reports a failure to lock once, from whichever of the two failed, and the store is still written', () => {
    const { p } = existing();
    const { acl } = fakeAcl({ ensure: (path) => (path.endsWith('.local') ? { state: 'failed', reason: 'icacls exited 5: Access is denied.' } : { state: 'private' }) });
    const written = saveStore(p, store(300), { acl, lock: 'always' });
    expect(written.acl).toEqual({ state: 'failed', reason: 'icacls exited 5: Access is denied.' });
    expect(JSON.parse(readFileSync(p, 'utf8')).instances.pdi.maxRecords).toBe(300);
  });
});
