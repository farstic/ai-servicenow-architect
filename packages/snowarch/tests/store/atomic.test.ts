import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkFileModes, loadStore, saveStore } from '../../src/store/index.js';
import type { Store } from '../../src/store/schema.js';

const win32 = process.platform === 'win32';
let tmp: string;

const store = (): Store => JSON.parse(JSON.stringify({
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
      toolPackage: 'full', maxRecords: 100, prodWriteAck: false,
    },
  },
}));

beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'snowarch-atomic-')); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

describe('saveStore — criterion 5', () => {
  it('creates a missing directory and leaves no temp file behind', () => {
    const p = join(tmp, 'nested', 'deeper', '.local', 'instances.json');
    saveStore(p, store());
    expect(existsSync(p)).toBe(true);
    expect(readdirSync(join(tmp, 'nested', 'deeper', '.local')).filter((f) => f.includes('tmp-'))).toEqual([]);
    expect(JSON.parse(readFileSync(p, 'utf8')).version).toBe(1);
  });

  it.skipIf(win32)('POSIX: the directory is 0700 and the file 0600 (skipped on Windows: modes are ACL-inherited, 01 §13)', () => {
    const dir = join(tmp, 'modes');
    const p = join(dir, 'instances.json');
    saveStore(p, store());
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    expect(statSync(p).mode & 0o777).toBe(0o600);
  });

  it('renameSync replaces an EXISTING file — this is the assertion the windows-latest cell proves', () => {
    // Documented as true on Windows; asserted here so the matrix, not the documentation,
    // is the evidence. A rename that failed on an existing target would corrupt the store
    // on every save after the first.
    const p = join(tmp, 'instances.json');
    saveStore(p, store());
    const second = store();
    second.instances.pdi.maxRecords = 250;
    saveStore(p, second);
    expect(JSON.parse(readFileSync(p, 'utf8')).instances.pdi.maxRecords).toBe(250);
    expect(readdirSync(tmp).filter((f) => f.includes('tmp-'))).toEqual([]);
  });

  it('a concurrent reader never observes a partial file — 50 interleaved iterations', () => {
    const p = join(tmp, 'instances.json');
    saveStore(p, store());
    for (let i = 0; i < 50; i += 1) {
      const s = store();
      s.instances.pdi.maxRecords = (i % 1000) + 1;
      saveStore(p, s);
      // Read immediately after: with a truncate-then-write this is where a reader sees
      // an empty or half-written file. With rename it sees the old file or the new one.
      const raw = readFileSync(p, 'utf8');
      expect(() => JSON.parse(raw)).not.toThrow();
      expect(JSON.parse(raw).instances.pdi.maxRecords).toBe((i % 1000) + 1);
    }
    expect(readdirSync(tmp).filter((f) => f.includes('tmp-'))).toEqual([]);
  });
});

describe('checkFileModes — criterion 3, as refined by the S02 review', () => {
  // The first version of this suite asserted that ANY group/world bit on the directory was
  // a refusal — and passed, because `mkdtemp` creates 0700 directories, so the case that
  // mattered was never exercised. It encoded a wrong assumption as a green test. The rule
  // now separates the two risks: the FILE holds the password, the DIRECTORY controls
  // whether the file can be replaced.

  it.skipIf(win32)('a 0644 FILE is refused — it is readable by others whatever the directory (skipped on Windows: ACL-inherited)', () => {
    const dir = join(tmp, 'openfile');
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const p = join(dir, 'instances.json');
    writeFileSync(p, JSON.stringify(store()));
    chmodSync(p, 0o644);
    const r = checkFileModes(p);
    expect(r.error?.code).toBe('STORE_PERMISSIONS_TOO_OPEN');
    expect(r.error?.message).toContain('file mode 0644 is group/world-readable');
    expect(r.error?.message).toContain('chmod 600');
  });

  it.skipIf(win32)('a 0600 file in a 0755 directory LOADS, with a warning (skipped on Windows: ACL-inherited)', () => {
    // The regression the review caught: an ordinary 0755 folder is the normal case, and a
    // 0600 file inside it is unreadable by anyone else. Refusing here rejected every store
    // a user points SNOW_STORE at.
    const dir = join(tmp, 'normal');
    mkdirSync(dir, { recursive: true, mode: 0o755 });
    const p = join(dir, 'instances.json');
    writeFileSync(p, JSON.stringify(store()), { mode: 0o600 });
    chmodSync(dir, 0o755); chmodSync(p, 0o600);
    const r = checkFileModes(p);
    expect(r.error).toBeUndefined();
    expect(r.warning).toContain('mode 0755');
    expect(r.warning).toContain('chmod 700');
    expect(loadStore(p)).toHaveProperty('store');
  });

  it.skipIf(win32)('a 0600 file in a 1777 STICKY directory loads with a warning — this is /tmp (skipped on Windows: ACL-inherited)', () => {
    // The story's own criterion 1 puts the store at /tmp/a.json. Sticky means only the
    // owner can unlink or rename their entry, which removes the replacement attack.
    const dir = join(tmp, 'sticky');
    mkdirSync(dir, { recursive: true });
    chmodSync(dir, 0o1777);
    const p = join(dir, 'instances.json');
    writeFileSync(p, JSON.stringify(store()), { mode: 0o600 });
    chmodSync(p, 0o600);
    const r = checkFileModes(p);
    expect(r.error).toBeUndefined();
    expect(r.warning).toContain('(sticky)');
    expect(loadStore(p)).toHaveProperty('store');
  });

  it.skipIf(win32)('a 0777 NON-sticky directory IS refused — the file can be replaced (skipped on Windows: ACL-inherited)', () => {
    const dir = join(tmp, 'worldwritable');
    mkdirSync(dir, { recursive: true });
    chmodSync(dir, 0o777);
    const p = join(dir, 'instances.json');
    writeFileSync(p, JSON.stringify(store()), { mode: 0o600 });
    chmodSync(p, 0o600);
    const r = checkFileModes(p);
    expect(r.error?.code).toBe('STORE_PERMISSIONS_TOO_OPEN');
    expect(r.error?.message).toContain('group/world-writable without the sticky bit');
    expect(r.error?.message).toContain('chmod 700');
  });

  it.skipIf(win32)('0600 in a 0700 directory is silent — no error and no warning (skipped on Windows: ACL-inherited)', () => {
    const p = join(tmp, 'ok', 'instances.json');
    saveStore(p, store());
    expect(checkFileModes(p)).toEqual({});
  });

  it.skipIf(!win32)('Windows: the mode check is skipped entirely, so any file loads', () => {
    const p = join(tmp, 'instances.json');
    saveStore(p, store());
    expect(checkFileModes(p)).toEqual({});
    expect(loadStore(p)).toHaveProperty('store');
  });
});

describe('loadStore', () => {
  it('a missing file is STORE_NOT_FOUND', () => {
    const r = loadStore(join(tmp, 'nope.json'));
    expect('error' in r && r.error.code).toBe('STORE_NOT_FOUND');
  });

  it('malformed JSON is STORE_UNREADABLE, not a schema error', () => {
    const p = join(tmp, 'bad.json');
    writeFileSync(p, '{ not json', { mode: 0o600 });
    const r = loadStore(p);
    expect('error' in r && r.error.code).toBe('STORE_UNREADABLE');
  });

  it('absent flags are completed to "false" on load, so no caller has to remember', () => {
    const p = join(tmp, 'partial.json');
    const s = store();
    (s.instances.pdi as { flags: unknown }).flags = { WRITE_ENABLED: 'true' };
    writeFileSync(p, JSON.stringify(s), { mode: 0o600 });
    const r = loadStore(p);
    if ('error' in r) throw new Error(r.error.message);
    expect(r.store.instances.pdi.flags).toEqual({
      WRITE_ENABLED: 'true', CMDB_WRITE_ENABLED: 'false', SCRIPTING_ENABLED: 'false',
      ATF_ENABLED: 'false', NOW_ASSIST_ENABLED: 'false', FLUENT_ENABLED: 'false',
    });
  });
});
