// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C272 — a private folder the engine makes: `.local/`, its logs, the licence state, the doctor's cache.
 *
 * On POSIX a private folder is `mkdir` with mode 0700. On Windows that mode is ignored, and a folder made directly under `C:\` inherits
 * `BUILTIN\Users` read and `Authenticated Users` modify (measured on a windows-latest runner, 2026-11-12), so every account on the
 * computer could read what the engine keeps there. `makePrivateDir` is the one way the engine makes such a folder: the same `mkdir` as
 * before, and on Windows, when it created the folder, the same lock the server puts on the store (the account and SYSTEM, by SID).
 *
 * It locks what it CREATED and nothing it found: a folder that was already there is the user's, and the lock on it is `instance add`'s
 * and the doctor's to propose, never a side effect of writing a cache.
 *
 * The lock tools are a seam; no case here runs icacls.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { createLocker, lockArgs, makePrivateDir, parseWhoamiSid, SYSTEM_SID } from '../lib/private-dir.mjs';
import { tempDir } from './helpers/temp.mjs';

const USER_SID = 'S-1-5-21-3289802278-1561746829-1498425070-500';
const WHOAMI = `"runnervmm7ud1\\runneradmin","${USER_SID}"\r\n`;
const isWindows = process.platform === 'win32';

/** A locker that records the locks it is asked for. */
const recording = (platform = 'win32', result = { ok: true }) => {
  const locks = [];
  return { locks, locker: { platform, lock: (path, opts) => { locks.push([path, opts]); return result; } } };
};

test('ARC-09-C272 — the account is a SID read from whoami, never a name', () => {
  assert.equal(parseWhoamiSid(WHOAMI), USER_SID);
  assert.equal(parseWhoamiSid('"AzureAD\\Last, First 1-2-3","S-1-12-1-1111-2222-3333-4444"\r\n'), 'S-1-12-1-1111-2222-3333-4444');
  assert.equal(parseWhoamiSid(''), null);
  assert.equal(parseWhoamiSid('ERROR: Access is denied.'), null);
});

test('ARC-09-C272 — the lock command grants the account and SYSTEM by SID, drops inheritance, and gives a folder its children', () => {
  assert.deepEqual(lockArgs('C:\\work\\x\\.local', USER_SID, { dir: true }),
    ['C:\\work\\x\\.local', '/inheritance:r', '/grant:r', `*${USER_SID}:(OI)(CI)F`, `*${SYSTEM_SID}:(OI)(CI)F`]);
  assert.deepEqual(lockArgs('C:\\work\\x\\.local\\f.json', USER_SID, { dir: false }),
    ['C:\\work\\x\\.local\\f.json', '/inheritance:r', '/grant:r', `*${USER_SID}:F`, `*${SYSTEM_SID}:F`]);
});

test('ARC-09-C272 — the locker asks whoami once, runs icacls from the system folder, and says why when it refuses', () => {
  const seen = [];
  const run = (file, args) => {
    seen.push([file, args]);
    return file.toLowerCase().endsWith('whoami.exe')
      ? { status: 0, stdout: WHOAMI, stderr: '' }
      : { status: 5, stdout: '', stderr: 'C:\\p: Access is denied.\r\n' };
  };
  const locker = createLocker({ platform: 'win32', run, env: { SystemRoot: 'D:\\WIN' } });
  assert.deepEqual(locker.lock('C:\\p', { dir: true }), { ok: false, reason: 'icacls exited 5: C:\\p: Access is denied.' });
  assert.deepEqual(locker.lock('C:\\q', { dir: false }), { ok: false, reason: 'icacls exited 5: C:\\p: Access is denied.' });
  assert.deepEqual(seen.map(([f]) => f), ['D:\\WIN\\System32\\whoami.exe', 'D:\\WIN\\System32\\icacls.exe', 'D:\\WIN\\System32\\icacls.exe']);
  assert.deepEqual(seen[1][1], lockArgs('C:\\p', USER_SID, { dir: true }));
});

test('ARC-09-C272 — a platform that is not Windows is asked nothing', () => {
  const run = () => { throw new Error('must not run'); };
  assert.deepEqual(createLocker({ platform: 'linux', run }).lock('/p', { dir: true }), { ok: true });
});

test('ARC-09-C272 — a folder it creates is made as before and, on Windows, locked once as a folder', (t) => {
  const base = tempDir('private-dir-', t);
  const dir = join(base, '.local');
  const { locks, locker } = recording();
  const made = makePrivateDir(dir, { locker });
  assert.deepEqual(locks, [[dir, { dir: true }]]);
  assert.equal(made.created, true);
  assert.deepEqual(made.lock, { ok: true });
  assert.equal(statSync(dir).isDirectory(), true);
  if (!isWindows) assert.equal(statSync(dir).mode & 0o777, 0o700, 'the POSIX mode is what it always was');
});

test('ARC-09-C272 — only the folder asked for is locked, not the folders made on the way to it', (t) => {
  const base = tempDir('private-dir-', t);
  const dir = join(base, 'a', 'b', '.local');
  const { locks, locker } = recording();
  makePrivateDir(dir, { locker });
  assert.deepEqual(locks, [[dir, { dir: true }]]);
});

test('ARC-09-C272 — a folder that was already there is left exactly as it was', (t) => {
  const base = tempDir('private-dir-', t);
  const dir = join(base, '.local');
  mkdirSync(dir);
  const { locks, locker } = recording();
  const made = makePrivateDir(dir, { locker });
  assert.deepEqual(locks, []);
  assert.deepEqual(made, { created: false, lock: null });
});

test('ARC-09-C272 — a lock that fails does not stop the engine: the folder exists and the failure is returned', (t) => {
  const base = tempDir('private-dir-', t);
  const dir = join(base, '.local');
  const { locker } = recording('win32', { ok: false, reason: 'icacls exited 5: Access is denied.' });
  const made = makePrivateDir(dir, { locker });
  assert.equal(statSync(dir).isDirectory(), true);
  assert.deepEqual(made, { created: true, lock: { ok: false, reason: 'icacls exited 5: Access is denied.' } });
});

test('ARC-09-C272 — on a platform that is not Windows nothing is locked, and the result says there was nothing to lock', (t) => {
  const base = tempDir('private-dir-', t);
  const { locks, locker } = recording('linux');
  const made = makePrivateDir(join(base, '.local'), { locker });
  assert.deepEqual(locks, []);
  assert.equal(made.created, true);
  assert.equal(made.lock, null);
});
