// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C272 — the wizard's store line says who can read the file, from what the lock did.
 *
 * Until now it said "permissions are inherited from the folder (Windows)", which is a statement about how Windows works and no answer
 * to the question a person who has just typed a password asks. The words now follow the outcome: private when the lock made it
 * private, and — when the file or its folder existed already and was changed — what it was open to, so that nothing about a
 * credential's permissions changes without saying so.
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { COLUMNS } from '../../src/cli/preset-ui.js';
import { cliSpelling } from '../../src/cli/tty.js';
import { runAdd, storeLine } from '../../src/cli/instance.js';
import type { AddIo } from '../../src/cli/instance.js';
import type { AclTools, Exposure } from '../../src/store/acl.js';
import { fakeRest } from '../helpers/fake-rest.js';
import { scriptedTty } from '../helpers/scripted-tty.js';
import { trackTempDir } from '../helpers/server-child.js';

const PROJECT = 'C:\\work\\AI-Arch\\.local\\instances.json';
const OPEN: Exposure = { who: ['NT AUTHORITY\\Authenticated Users', 'BUILTIN\\Users'], read: true };
const lines = (text: string) => text.split('\n');
/** The text with its line breaks folded, for a sentence the wrapper may have split. */
const flat = (text: string) => text.replace(/\s+/g, ' ');

describe('ARC-09-C272 — storeLine on Windows', () => {
  it('says "readable only by you" when the lock made it private, or found it so', () => {
    expect(storeLine(PROJECT, 'win32', PROJECT, { state: 'created' }))
      .toBe('Saved to .local\\instances.json in this folder — readable only by you.');
    expect(storeLine(PROJECT, 'win32', PROJECT, { state: 'private' }))
      .toBe('Saved to .local\\instances.json in this folder — readable only by you.');
    // Another store than this checkout's: the sentence takes a line and the path the next, whole. The permission phrase is in parentheses
    // because the line ends in a colon, and `you:` is what the wizard's width rule (ARC-07-C41) reads as a field name with no value.
    expect(storeLine('C:\\Users\\someone\\AppData\\Roaming\\snowarch\\instances.json', 'win32', PROJECT, { state: 'created' }))
      .toMatch(/^Saved to this file \(readable only by you\):\n/);
  });

  it('says what it changed when the file or its folder existed and was open, naming who could read it', () => {
    const out = storeLine(PROJECT, 'win32', PROJECT, { state: 'locked', was: OPEN });
    expect(lines(out)[0]).toBe('Saved to .local\\instances.json in this folder — readable only by you.');
    expect(flat(out)).toContain('It was open to NT AUTHORITY\\Authenticated Users and BUILTIN\\Users; its permissions were changed just now.');
    for (const l of lines(out)) expect(l.length, l).toBeLessThanOrEqual(COLUMNS);
  });

  it('says the change was made even when it could not say what it was before', () => {
    const out = storeLine(PROJECT, 'win32', PROJECT, { state: 'locked', was: null });
    expect(lines(out)[0]).toBe('Saved to .local\\instances.json in this folder — readable only by you.');
    expect(flat(out)).toContain('Its permissions were changed just now.');
  });

  it('does not claim a privacy it could not make, says the store is saved, and names the command that tries again', () => {
    // `env: {}` is load-bearing (ARC-07-C38): the spelling follows SHELL, and a Mac that sets it would render the POSIX launcher for win32.
    const out = storeLine(PROJECT, 'win32', PROJECT, { state: 'failed', reason: 'icacls exited 5: Access is denied.' }, {});
    expect(lines(out)[0]).toBe('Saved to .local\\instances.json in this folder.');
    expect(out).not.toContain('readable only by you');
    expect(flat(out)).toContain('could not be restricted (icacls exited 5: Access is denied.)');
    expect(flat(out)).toContain('other accounts on this computer may be able to read it');
    expect(out.includes(cliSpelling('win32', {}))).toBe(true);
    expect(flat(out)).toContain('The store is saved.');
    expect(flat(out)).toContain(' doctor --fix tries again, and ');
    expect(flat(out)).toContain(' doctor says who can read it.');
    for (const l of lines(out)) expect(l.length, l).toBeLessThanOrEqual(COLUMNS);
  });

  it('for a store the doctor\'s fixer may not touch, the failed note points to the line the doctor prints and not to --fix', () => {
    const out = storeLine('C:\\Users\\someone\\AppData\\Roaming\\snowarch\\instances.json', 'win32', PROJECT,
      { state: 'failed', reason: 'icacls exited 5: Access is denied.' }, {});
    // No permission phrase to put in parentheses, so the sentence is the plain one. The wizard's width rule would flag this ending, and no
    // wizard case produces it, so it is pinned here.
    expect(lines(out)[0]).toBe('Saved to this file:');
    expect(flat(out)).toContain('The store is saved.');
    expect(flat(out)).toContain(' doctor gives a line to run by hand.');
    expect(flat(out)).not.toContain('--fix');
  });

  it('keeps the words it had when it is not told what the lock did (no outcome, or not Windows)', () => {
    expect(storeLine(PROJECT, 'win32', PROJECT)).toContain('permissions are inherited from the folder (Windows)');
    expect(storeLine(PROJECT, 'win32', PROJECT, { state: 'not-windows' })).toContain('permissions are inherited from the folder (Windows)');
    expect(storeLine('/repo/.local/instances.json', 'darwin', '/repo/.local/instances.json', { state: 'locked', was: OPEN }))
      .toBe('Saved to .local/instances.json in this folder — readable only by you (0600).');
  });
});

/** The wizard end to end, with the lock tools a fake: what a person sees after typing a password. */
describe('ARC-09-C272 — instance add on Windows', () => {
  const terminal = (): AddIo & { written: () => string } => {
    const tty = scriptedTty([]);
    return { ask: tty.ask, write: tty.write, secret: async () => ['pw', 'x'].join('-'), written: () => tty.written };
  };
  const rest = () => fakeRest({
    sys_user: { status: 200 }, sys_user_has_role: { status: 200, records: [{ 'role.name': 'admin' }] },
    sys_update_set: { status: 200 }, sys_script_include: { status: 200 }, cmdb_ci: { status: 200 },
    sys_atf_test: { status: 200 }, sys_properties: { status: 200, records: [{ sys_id: 'x' }] },
  });
  const reachable = async () => ({ ok: true as const, status: 200, latencyMs: 1 });
  const fake = (ensure: AclTools['ensurePrivate'], calls: string[]): AclTools => ({
    platform: 'win32',
    userSid: () => 'S-1-5-21-1-2-3-1001',
    read: () => ({ ok: true, exposure: { who: [], read: false } }),
    lock: (_path, { dir }) => { calls.push(`lock ${dir ? 'dir' : 'file'}`); return { ok: true }; },
    ensurePrivate: (path, opts) => { calls.push(`ensure ${opts.dir ? 'dir' : 'file'}`); return ensure(path, opts); },
  });
  const base = { label: 'pdi', url: 'https://dev12345.service-now.com', environment: 'pdi', auth: 'basic' as const,
    username: 'svc.snowarch', preset: 'pdi-developer', yes: true };

  it('a new store is locked as it is created, and the line says it is private', async () => {
    const dir = trackTempDir(mkdtempSync(join(tmpdir(), 'add-acl-')));
    try {
      const calls: string[] = [];
      const t = terminal();
      await runAdd(base, t, { storePath: join(dir, 'instances.json'), makeClient: rest, reachability: reachable, env: {}, platform: 'win32',
        acl: fake(() => ({ state: 'private' }), calls) });
      expect(calls).toEqual(['lock file']);
      expect(t.written()).toContain('readable only by you');
      expect(t.written()).not.toContain('inherited from the folder');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('a lock that FAILS never stops the save: the credential is stored, the exit is ok, and the person is told in words what to do', async () => {
    const dir = trackTempDir(mkdtempSync(join(tmpdir(), 'add-acl-')));
    try {
      const store = join(dir, 'instances.json');
      const t = terminal();
      const failing: AclTools = { ...fake(() => ({ state: 'private' }), []), lock: () => ({ ok: false, reason: 'icacls exited 5: Access is denied.' }) };
      const result = await runAdd(base, t, { storePath: store, makeClient: rest, reachability: reachable, env: {}, platform: 'win32', acl: failing });
      expect(result.saved).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(existsSync(store)).toBe(true);
      expect(flat(t.written())).toContain('Saved instance "pdi"');
      expect(flat(t.written())).not.toContain('readable only by you');
      expect(flat(t.written())).toContain('could not be restricted (icacls exited 5: Access is denied.)');
      expect(flat(t.written())).toContain('The store is saved.');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('a store in a folder that was open is made private and the person is told what it was open to', async () => {
    const dir = trackTempDir(mkdtempSync(join(tmpdir(), 'add-acl-')));
    try {
      const store = join(dir, 'instances.json');
      const calls: string[] = [];
      // First add creates the file under a fake that finds nothing to do; the second runs into an existing file that is open.
      await runAdd(base, terminal(), { storePath: store, makeClient: rest, reachability: reachable, env: {}, platform: 'win32',
        acl: fake(() => ({ state: 'private' }), calls) });
      calls.length = 0;
      const t = terminal();
      await runAdd({ ...base, label: 'second' }, t, { storePath: store, makeClient: rest, reachability: reachable, env: {}, platform: 'win32',
        acl: fake(() => ({ state: 'locked', was: OPEN }), calls) });
      expect(calls).toEqual(['ensure file']);
      expect(flat(t.written())).toContain('It was open to NT AUTHORITY\\Authenticated Users and BUILTIN\\Users');
      expect(flat(t.written())).toContain('its permissions were changed just now');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
