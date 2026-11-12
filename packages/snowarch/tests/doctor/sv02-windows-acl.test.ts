// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C272 — SV-02 on Windows reads who can read the store, and names them.
 *
 * It said "mode check skipped (Windows: permissions are ACL-inherited, not POSIX bits)" and went on to report ok, so a password
 * file that every account on the computer could read was a healthy store. It now reads the DACL of the file and of its folder
 * (through the seam `ctx.acl`, so no case here runs icacls) and judges them the way the POSIX branch judges a mode:
 *
 *   private (the account, SYSTEM, Administrators)  → ok
 *   anyone else holds an allow entry               → fail, in words that NAME them ("BUILTIN\Users can read it"), never the SDDL
 *   the permissions could not be read              → warn, never ok: an unreadable ACL is not a clean one
 *
 * The repair is the doctor's explicit fixer for the checkout's own store (`doctor --fix`, which shows its plan first) and a
 * paste-ready PowerShell line for a store the fixer may not touch (a per-user store under the home directory, or one an
 * environment variable points at).
 */
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { cliSpelling } from '../../src/cli/tty.js';
import { svStore } from '../../src/doctor/checks.js';
import { stubProbesFor } from '../../src/doctor/types.js';
import type { CheckContext } from '../../src/doctor/types.js';
import type { AclTools, Exposure } from '../../src/store/acl.js';
import { saveStore } from '../../src/store/index.js';
import type { Store } from '../../src/store/schema.js';
import { trackTempDir } from '../helpers/server-child.js';

const WIN_ENV = { USERPROFILE: 'C:\\Users\\someone' } as NodeJS.ProcessEnv;
const WIN_CLI = cliSpelling('win32', WIN_ENV);
const OPEN: Exposure = { who: ['BUILTIN\\Users'], read: true };
const SHUT: Exposure = { who: [], read: false };

const store = (): Store => JSON.parse(JSON.stringify({
  version: 1,
  defaultInstance: 'pdi',
  instances: { pdi: {
    url: 'https://dev12345.service-now.com', environment: 'pdi',
    auth: { method: 'basic', username: 'admin', password: 'secret' }, preset: 'pdi-developer',
    flags: { WRITE_ENABLED: 'true', CMDB_WRITE_ENABLED: 'false', SCRIPTING_ENABLED: 'false',
             ATF_ENABLED: 'false', NOW_ASSIST_ENABLED: 'false', FLUENT_ENABLED: 'false' },
    toolPackage: 'full', maxRecords: 100, prodWriteAck: false,
  } },
}));

/** Lock tools whose `read` answers per path: whatever `answers` says for it, else private. */
const tools = (answers: (path: string) => ReturnType<AclTools['read']>): AclTools => ({
  platform: 'win32',
  userSid: () => 'S-1-5-21-1-2-3-1001',
  read: answers,
  lock: () => ({ ok: true }),
  ensurePrivate: () => ({ state: 'private' }),
});

const KEYS = ['SNOW_STORE', 'CLAUDE_PROJECT_DIR'] as const;
let saved: Record<string, string | undefined>;
let tmp: string;
beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  tmp = trackTempDir(mkdtempSync(join(tmpdir(), 'sv02-acl-')));
});
afterEach(() => {
  for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  rmSync(tmp, { recursive: true, force: true });
});

const ctxFor = (acl: AclTools): CheckContext => ({
  noNetwork: true, cwd: tmp, platform: 'win32', env: WIN_ENV, probes: stubProbesFor({ platform: 'win32', env: WIN_ENV }),
  fluent: () => ({ installed: false }), acl,
});

/** A checkout whose own store exists, so SV-02 resolves it as the project store. */
function projectStore(): { dir: string; file: string } {
  const dir = join(tmp, '.local');
  const file = join(dir, 'instances.json');
  saveStore(file, store(), { acl: tools(() => ({ ok: true, exposure: SHUT })) });
  process.env.CLAUDE_PROJECT_DIR = tmp;
  return { dir, file };
}

describe('ARC-09-C272 — SV-02 on Windows', () => {
  it('is ok when the store and its folder are readable by no one else, and says so', async () => {
    projectStore();
    const r = await svStore.run(ctxFor(tools(() => ({ ok: true, exposure: SHUT }))));
    expect(r.status).toBe('ok');
    expect(r.detail).toContain('readable only by you');
    expect(r.detail).not.toContain('mode check skipped');
    expect(r.fixable).toBe(false);
    expect(r.data).toBeUndefined();
  });

  it('fails when the file is open to others, names them, and offers the fixer', async () => {
    const { file } = projectStore();
    const r = await svStore.run(ctxFor(tools((p) => ({ ok: true, exposure: p === file ? OPEN : SHUT }))));
    expect(r.status).toBe('fail');
    expect(r.detail).toContain('BUILTIN\\Users can read it');
    expect(r.detail).toContain('the file');
    expect(r.remedy).toBe(`${WIN_CLI} doctor --fix`);
    expect(r.fixable).toBe(true);
    expect(r.data).toEqual({ fix: { kind: 'store-acl', path: '.local' } });
  });

  it('fails when only its folder is open, and says it is the folder', async () => {
    const { dir } = projectStore();
    const r = await svStore.run(ctxFor(tools((p) => ({ ok: true, exposure: p === dir ? { who: ['NT AUTHORITY\\Authenticated Users'], read: true } : SHUT }))));
    expect(r.status).toBe('fail');
    expect(r.detail).toContain('its folder');
    expect(r.detail).toContain('NT AUTHORITY\\Authenticated Users can read it');
    expect(r.fixable).toBe(true);
  });

  it('for a store in a folder that is not the product\'s, only the file is judged and locked: one PowerShell line that works out the account itself, with no name or SID in it', async () => {
    const dir = join(tmp, 'elsewhere');
    mkdirSync(dir);
    const file = join(dir, 'instances.json');
    saveStore(file, store(), { acl: tools(() => ({ ok: true, exposure: SHUT })) });
    process.env.SNOW_STORE = file;
    // The folder is open and the file is not: the folder is the user's, so it is not a finding.
    const fine = await svStore.run(ctxFor(tools((p) => ({ ok: true, exposure: p === file ? SHUT : OPEN }))));
    expect(fine.status).toBe('ok');
    // The file is open: the line locks the file, with the file form of the grants.
    const r = await svStore.run(ctxFor(tools(() => ({ ok: true, exposure: OPEN }))));
    expect(r.status).toBe('fail');
    expect(r.fixable).toBe(false);
    expect(r.data).toBeUndefined();
    expect(r.remedy).toContain(`icacls "${file}"`);
    expect(r.remedy).toContain('/inheritance:r /grant:r');
    expect(r.remedy).toContain(':F" "*S-1-5-18:F"');
    expect(r.remedy).not.toContain('(OI)(CI)');
    expect(r.remedy).toContain('whoami /user /fo csv /nh');
    expect(r.remedy).not.toMatch(/S-1-5-21/);
  });

  it('the per-user store\'s folder is the product\'s: the line locks the folder, and writes a path under the home directory as $env:USERPROFILE so it pastes and carries no account name', async () => {
    const home = join(tmp, 'home');
    const dir = join(home, 'AppData', 'Roaming', 'snowarch');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'instances.json');
    saveStore(file, store(), { acl: tools(() => ({ ok: true, exposure: SHUT })) });
    process.env.SNOW_STORE = file;
    const ctx = { ...ctxFor(tools(() => ({ ok: true, exposure: OPEN }))), env: { ...WIN_ENV, USERPROFILE: home } };
    const r = await svStore.run(ctx);
    expect(r.remedy).toContain('icacls "$env:USERPROFILE\\AppData\\Roaming\\snowarch"');
    expect(r.remedy).toContain('(OI)(CI)F" "*S-1-5-18:(OI)(CI)F"');
    expect(r.remedy).not.toContain(home);
  });

  it('warns, and does not say ok, when the permissions could not be read', async () => {
    projectStore();
    const r = await svStore.run(ctxFor(tools(() => ({ ok: false, reason: 'icacls exited 5: Access is denied.' }))));
    expect(r.status).toBe('warn');
    expect(r.detail).toContain('could not read the permissions');
    expect(r.detail).toContain('icacls exited 5: Access is denied.');
    expect(r.fixable).toBe(false);
  });

  it('is unchanged where there is no store: a warning that the server starts unconfigured', async () => {
    process.env.CLAUDE_PROJECT_DIR = tmp;
    const r = await svStore.run(ctxFor(tools(() => { throw new Error('no store, so nothing to read'); })));
    expect(r.status).toBe('warn');
    expect(r.detail).toContain('no store found');
  });
});
