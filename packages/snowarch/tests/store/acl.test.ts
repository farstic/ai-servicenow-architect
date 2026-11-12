// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C272 — the Windows lock on the store: who may read it, said from the DACL; and how it is made private.
 *
 * WHY. The instance store holds the basic-auth password. On POSIX it is 0600 in a 0700 folder. On Windows it was whatever its folder
 * inherited, and a folder made directly under `C:\` inherits `BUILTIN\Users` read and `Authenticated Users` modify, so every other
 * account on the computer could read it (measured on a windows-latest runner, 2026-11-12: a child of `C:\` carries exactly those two).
 *
 * THE DATA IS REAL. The strings below are what that runner printed, copied verbatim: `whoami /user /fo csv /nh`, and the DACL of a
 * folder made under `C:\` as `icacls <path> /save <file>` wrote it (UTF-16LE, the path on one line and the SDDL on the next). The
 * parsers are written against them. Nothing here runs `icacls`: the runner is a seam, and a case that spawned the real one would
 * pass on one OS and skip on the rest.
 */
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  ADMINISTRATORS_SID, SYSTEM_SID, canRead, createAclTools, exposureOf, exposureSentence, lockArgs, parseSddl, parseWhoamiSid,
} from '../../src/store/acl.js';
import type { Run, RunResult } from '../../src/store/acl.js';
import { trackTempDir } from '../helpers/server-child.js';

const USER_SID = 'S-1-5-21-3289802278-1561746829-1498425070-500';
const WHOAMI = `"runnervmm7ud1\\runneradmin","${USER_SID}"\r\n`;
/** A folder under C:\ — what `icacls /save` wrote for it. The first line is the path, the second the DACL. */
const OPEN_DACL = 'D:AI(A;ID;0x1301bf;;;AU)(A;OICIIOID;SDGXGWGR;;;AU)(A;OICIID;FA;;;SY)(A;OICIID;FA;;;BA)(A;OICIID;0x1200a9;;;BU)';
/**
 * The same folder after the lock, as the runner wrote it (round 2 of the probe): protected, and only the two accounts. The account is `LA`
 * because it is the built-in Administrator (RID 500), which SDDL writes as an alias; any other account is written as its SID.
 */
const LOCKED_DACL = 'D:PAI(A;OICI;FA;;;SY)(A;OICI;FA;;;LA)';
const OTHER_USER_SID = 'S-1-5-21-3289802278-1561746829-1498425070-1001';
const LOCKED_DACL_OTHER_USER = `D:PAI(A;OICI;FA;;;SY)(A;OICI;FA;;;${OTHER_USER_SID})`;

const ok = (stdout = '', stderr = ''): RunResult => ({ status: 0, stdout, stderr });
const exe = (file: string): string => (file.split(/[\\/]/).pop() ?? file).toLowerCase().replace(/\.exe$/, '');

/** A runner that answers like Windows does, and remembers every call. `dacl` is what `icacls <path> /save` writes. */
function windows(dacl = OPEN_DACL, extra: Partial<Record<string, (args: string[]) => RunResult>> = {}) {
  const calls: Array<{ exe: string; args: string[] }> = [];
  const run: Run = (file, args) => {
    const name = exe(file);
    calls.push({ exe: name, args });
    if (extra[name]) return extra[name]!(args);
    if (name === 'whoami') return ok(WHOAMI);
    if (name === 'icacls' && args[1] === '/save') {
      writeFileSync(args[2]!, Buffer.from(`.local\r\n${dacl}\r\n\r\n`, 'utf16le'));
      return ok(`processed file: ${args[0]}\r\nSuccessfully processed 1 files; Failed processing 0 files\r\n`);
    }
    if (name === 'icacls') return ok(`processed file: ${args[0]}\r\nSuccessfully processed 1 files; Failed processing 0 files\r\n`);
    return { status: 1, stdout: '', stderr: `unexpected ${name}` };
  };
  return { run, calls };
}

let tmp: string;
beforeEach(() => { tmp = trackTempDir(mkdtempSync(join(tmpdir(), 'snowarch-acl-'))); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

describe('ARC-09-C272 — whoami: the account is a SID, never a name', () => {
  it('reads the SID from the csv line, whatever the name looks like', () => {
    expect(parseWhoamiSid(WHOAMI)).toBe(USER_SID);
    // An Entra-joined account: the name is `AzureAD\…` and the SID is the S-1-12-1 form. The name is localised and may hold digits and commas.
    expect(parseWhoamiSid('"AzureAD\\Last, First 1-2-3","S-1-12-1-1111-2222-3333-4444"\r\n')).toBe('S-1-12-1-1111-2222-3333-4444');
  });

  it('answers null for anything that holds no SID', () => {
    expect(parseWhoamiSid('')).toBeNull();
    expect(parseWhoamiSid('ERROR: Access is denied.')).toBeNull();
    expect(parseWhoamiSid('"someone","not-a-sid"')).toBeNull();
  });
});

describe('ARC-09-C272 — the command that makes a path private', () => {
  it('grants the account and SYSTEM by SID, drops inheritance, and gives a folder its children', () => {
    expect(lockArgs('C:\\work\\x\\.local', USER_SID, { dir: true })).toEqual([
      'C:\\work\\x\\.local', '/inheritance:r', '/grant:r', `*${USER_SID}:(OI)(CI)F`, `*${SYSTEM_SID}:(OI)(CI)F`]);
    // A file takes no inheritance flags.
    expect(lockArgs('C:\\work\\x\\.local\\instances.json', USER_SID, { dir: false })).toEqual([
      'C:\\work\\x\\.local\\instances.json', '/inheritance:r', '/grant:r', `*${USER_SID}:F`, `*${SYSTEM_SID}:F`]);
  });

  it('never names an account: every grant is a SID with the star icacls reads as one', () => {
    for (const dir of [true, false]) {
      const grants = lockArgs('C:\\p', USER_SID, { dir }).filter((a) => /^\*/.test(a));
      expect(grants).toHaveLength(2);
      for (const g of grants) expect(g).toMatch(/^\*S-1-[\d-]+:/);
    }
  });
});

describe('ARC-09-C272 — the DACL, read from the SDDL (locale-independent)', () => {
  it('parses the DACL of a folder under C:\\ into its entries, in order', () => {
    expect(parseSddl(OPEN_DACL)).toEqual([
      { type: 'A', flags: 'ID', rights: '0x1301bf', trustee: 'AU' },
      { type: 'A', flags: 'OICIIOID', rights: 'SDGXGWGR', trustee: 'AU' },
      { type: 'A', flags: 'OICIID', rights: 'FA', trustee: 'SY' },
      { type: 'A', flags: 'OICIID', rights: 'FA', trustee: 'BA' },
      { type: 'A', flags: 'OICIID', rights: '0x1200a9', trustee: 'BU' },
    ]);
    expect(parseSddl(LOCKED_DACL).map((a) => a.trustee)).toEqual(['SY', 'LA']);
    expect(parseSddl(LOCKED_DACL_OTHER_USER).map((a) => a.trustee)).toEqual(['SY', OTHER_USER_SID]);
  });

  it('keeps the DACL only: a full descriptor with an owner, a group and a SACL gives the DACL\'s entries', () => {
    const full = `O:BAG:S-1-5-21-3289802278-1561746829-1498425070-513${OPEN_DACL}S:AI(AU;FA;FA;;;WD)`;
    expect(parseSddl(full).map((a) => a.trustee)).toEqual(['AU', 'AU', 'SY', 'BA', 'BU']);
  });

  it('answers an empty list for text that is no SDDL', () => {
    expect(parseSddl('')).toEqual([]);
    expect(parseSddl('not an sddl')).toEqual([]);
  });

  it('tells a read right from one that is not, in a hex mask and in symbolic form', () => {
    expect(canRead('0x1200a9')).toBe(true);       // read and execute
    expect(canRead('0x1301bf')).toBe(true);       // modify
    expect(canRead('SDGXGWGR')).toBe(true);       // generic read among others
    expect(canRead('FA')).toBe(true);
    expect(canRead('FR')).toBe(true);
    expect(canRead('0x100116')).toBe(false);      // write only
    expect(canRead('FW')).toBe(false);
  });
});

describe('ARC-09-C272 — who can read it, in words', () => {
  it('names the accounts a folder under C:\\ opens the store to, once each, in the order the DACL lists them', () => {
    const e = exposureOf(parseSddl(OPEN_DACL), USER_SID);
    expect(e.who).toEqual(['NT AUTHORITY\\Authenticated Users', 'BUILTIN\\Users']);
    expect(e.read).toBe(true);
    expect(exposureSentence(e)).toBe('NT AUTHORITY\\Authenticated Users and BUILTIN\\Users can read it');
  });

  it('says one name the way the architect worded it', () => {
    const e = exposureOf(parseSddl('D:(A;;0x1200a9;;;BU)(A;;FA;;;SY)'), USER_SID);
    expect(exposureSentence(e)).toBe('BUILTIN\\Users can read it');
  });

  it('is empty for the locked folder, and for the user\'s own profile (the account, SYSTEM, Administrators)', () => {
    expect(exposureOf(parseSddl(LOCKED_DACL), USER_SID).who).toEqual([]);
    expect(exposureOf(parseSddl(LOCKED_DACL_OTHER_USER), OTHER_USER_SID).who).toEqual([]);
    expect(exposureOf(parseSddl(`D:PAI(A;OICIID;FA;;;SY)(A;OICIID;FA;;;BA)(A;OICIID;FA;;;${OTHER_USER_SID})`), OTHER_USER_SID).who).toEqual([]);
    // The runner\'s profile folder as it printed it: SYSTEM, Administrators, the account as `LA`.
    expect(exposureOf(parseSddl('D:(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;FA;;;LA)'), USER_SID).who).toEqual([]);
  });

  it('reads the alias LA as the account only when the account is the built-in Administrator (RID 500), and as another account otherwise', () => {
    // On a machine whose user is a normal account, an `LA` entry is somebody else: the machine\'s Administrator.
    const e = exposureOf(parseSddl(LOCKED_DACL), OTHER_USER_SID);
    expect(e.who).toEqual(['the local Administrator account']);
    expect(exposureSentence(e)).toBe('the local Administrator account can read it');
  });

  it('tolerates the account written as a SID or as an alias, and the three it always tolerates', () => {
    const dacl = `D:(A;;FA;;;${USER_SID})(A;;FA;;;${SYSTEM_SID})(A;;FA;;;${ADMINISTRATORS_SID})(A;;FA;;;S-1-3-0)(A;;FA;;;CO)(A;;FA;;;OW)`;
    expect(exposureOf(parseSddl(dacl), USER_SID).who).toEqual([]);
  });

  it('does not count a deny, and counts an allow for anyone else whatever its rights', () => {
    expect(exposureOf(parseSddl('D:(D;;FA;;;BU)(A;;FA;;;SY)'), USER_SID).who).toEqual([]);
    const writeOnly = exposureOf(parseSddl('D:(A;;0x100116;;;BU)'), USER_SID);
    expect(writeOnly.who).toEqual(['BUILTIN\\Users']);
    expect(writeOnly.read).toBe(false);
    expect(exposureSentence(writeOnly)).toBe('BUILTIN\\Users can change it');
  });

  it('flags Everyone, and another account named by its SID, with a name from the resolver or else the SID', () => {
    const other = 'S-1-5-21-3289802278-1561746829-1498425070-1012';
    const dacl = `D:(A;;FR;;;WD)(A;;FR;;;${other})`;
    expect(exposureOf(parseSddl(dacl), USER_SID, (t) => (t === other ? 'HOST\\colleague' : t)).who).toEqual(['Everyone', 'HOST\\colleague']);
    expect(exposureOf(parseSddl(dacl), USER_SID).who).toEqual(['Everyone', other]);
  });
});

describe('ARC-09-C272 — createAclTools', () => {
  it('on a platform that is not Windows asks nothing of the system and finds nothing to fix', () => {
    const { run, calls } = windows();
    const tools = createAclTools({ platform: 'linux', run, tmpdir: tmp });
    expect(tools.read(tmp)).toEqual({ ok: true, exposure: { who: [], read: false } });
    expect(tools.lock(tmp, { dir: true })).toEqual({ ok: true });
    expect(tools.ensurePrivate(tmp, { dir: true })).toEqual({ state: 'private' });
    expect(calls).toEqual([]);
  });

  it('asks whoami once for the account and caches it', () => {
    const { run, calls } = windows();
    const tools = createAclTools({ platform: 'win32', run, tmpdir: tmp });
    expect(tools.userSid()).toBe(USER_SID);
    expect(tools.userSid()).toBe(USER_SID);
    expect(calls.filter((c) => c.exe === 'whoami')).toHaveLength(1);
    expect(calls[0]!.args).toEqual(['/user', '/fo', 'csv', '/nh']);
  });

  it('reads who can read a folder from the DACL icacls saves, and leaves no file behind', () => {
    const { run, calls } = windows();
    const tools = createAclTools({ platform: 'win32', run, tmpdir: tmp });
    const r = tools.read('C:\\work\\x\\.local');
    expect(r).toEqual({ ok: true, exposure: { who: ['NT AUTHORITY\\Authenticated Users', 'BUILTIN\\Users'], read: true } });
    const save = calls.find((c) => c.exe === 'icacls');
    expect(save?.args.slice(0, 2)).toEqual(['C:\\work\\x\\.local', '/save']);
    expect(readdirSync(tmp)).toEqual([]);
  });

  it('says what it could not do instead of calling it fine: a failing icacls, a missing file, a garbled one', () => {
    const failing = windows(OPEN_DACL, { icacls: () => ({ status: 2, stdout: '', stderr: 'C:\\gone: The system cannot find the file specified.\r\n' }) });
    const f = createAclTools({ platform: 'win32', run: failing.run, tmpdir: tmp }).read('C:\\gone');
    expect(f.ok).toBe(false);
    expect((f as { reason: string }).reason).toContain('The system cannot find the file specified');

    const silent = windows(OPEN_DACL, { icacls: () => ok('done') });   // exit 0 and no file written
    const s = createAclTools({ platform: 'win32', run: silent.run, tmpdir: tmp }).read('C:\\p');
    expect(s.ok).toBe(false);

    const garbled = windows('this is not a dacl');
    const g = createAclTools({ platform: 'win32', run: garbled.run, tmpdir: tmp }).read('C:\\p');
    expect(g.ok).toBe(false);

    const nobody = windows(OPEN_DACL, { whoami: () => ok('ERROR: nothing') });
    const n = createAclTools({ platform: 'win32', run: nobody.run, tmpdir: tmp }).read('C:\\p');
    expect(n.ok).toBe(false);
    expect((n as { reason: string }).reason).toMatch(/which account/);
  });

  it('names an account it has no alias for through the system, and falls back to the SID when that fails', () => {
    const other = 'S-1-5-21-3289802278-1561746829-1498425070-1012';
    const named = windows(`D:(A;;FR;;;${other})`, { powershell: () => ok('HOST\\colleague\r\n') });
    expect(createAclTools({ platform: 'win32', run: named.run, tmpdir: tmp }).read('C:\\p'))
      .toEqual({ ok: true, exposure: { who: ['HOST\\colleague'], read: true } });
    const unnamed = windows(`D:(A;;FR;;;${other})`, { powershell: () => ({ status: 1, stdout: '', stderr: 'Exception' }) });
    expect(createAclTools({ platform: 'win32', run: unnamed.run, tmpdir: tmp }).read('C:\\p'))
      .toEqual({ ok: true, exposure: { who: [other], read: true } });
  });

  it('locks with the command above, and says why when icacls refuses', () => {
    const { run, calls } = windows();
    const tools = createAclTools({ platform: 'win32', run, tmpdir: tmp });
    expect(tools.lock('C:\\work\\x\\.local', { dir: true })).toEqual({ ok: true });
    const lock = calls.find((c) => c.exe === 'icacls');
    expect(lock?.args).toEqual(lockArgs('C:\\work\\x\\.local', USER_SID, { dir: true }));

    const refusing = windows(OPEN_DACL, { icacls: () => ({ status: 5, stdout: '', stderr: 'C:\\p: Access is denied.\r\n' }) });
    const r = createAclTools({ platform: 'win32', run: refusing.run, tmpdir: tmp }).lock('C:\\p', { dir: false });
    expect(r).toEqual({ ok: false, reason: 'icacls exited 5: C:\\p: Access is denied.' });
  });

  it('uses the system folder\'s icacls and whoami, not whatever PATH offers', () => {
    const seen: string[] = [];
    const run: Run = (file, args) => { seen.push(file); return windows().run(file, args); };
    const tools = createAclTools({ platform: 'win32', run, tmpdir: tmp, env: { SystemRoot: 'D:\\WIN' } });
    tools.lock('C:\\p', { dir: true });
    expect(seen).toEqual(['D:\\WIN\\System32\\whoami.exe', 'D:\\WIN\\System32\\icacls.exe']);
  });

  it('ensurePrivate leaves a folder that is already private alone, and locks one that is open, naming who it was open to', () => {
    const closed = windows(LOCKED_DACL);
    const a = createAclTools({ platform: 'win32', run: closed.run, tmpdir: tmp }).ensurePrivate('C:\\p', { dir: true });
    expect(a).toEqual({ state: 'private' });
    expect(closed.calls.filter((c) => c.exe === 'icacls' && c.args.includes('/inheritance:r'))).toEqual([]);

    const open = windows(OPEN_DACL);
    const b = createAclTools({ platform: 'win32', run: open.run, tmpdir: tmp }).ensurePrivate('C:\\p', { dir: true });
    expect(b).toEqual({ state: 'locked', was: { who: ['NT AUTHORITY\\Authenticated Users', 'BUILTIN\\Users'], read: true } });
    expect(open.calls.filter((c) => c.args.includes('/inheritance:r'))).toHaveLength(1);
  });

  it('ensurePrivate locks what it could not read, and fails loudly when the lock fails too', () => {
    const unreadable = windows(OPEN_DACL, { icacls: (args) => (args[1] === '/save'
      ? { status: 1, stdout: '', stderr: 'cannot read' } : ok('processed')) });
    expect(createAclTools({ platform: 'win32', run: unreadable.run, tmpdir: tmp }).ensurePrivate('C:\\p', { dir: false }))
      .toEqual({ state: 'locked', was: null });

    const nothing = windows(OPEN_DACL, { icacls: () => ({ status: 5, stdout: '', stderr: 'Access is denied.' }) });
    const r = createAclTools({ platform: 'win32', run: nothing.run, tmpdir: tmp }).ensurePrivate('C:\\p', { dir: false });
    expect(r.state).toBe('failed');
  });
});
