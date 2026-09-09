import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SERVER = resolve(here, '../../dist/server.js');
const win32 = process.platform === 'win32';

/**
 * F2 from the S02 review: no absolute home or checkout path may reach a log line or a
 * configError message.
 *
 * The bug this replaces is worth stating exactly, because the earlier version LOOKED
 * masked: `maskPath` was applied post-hoc to the whole sentence. `maskPath` only rewrites
 * a string that *starts* with the prefix, so a message reading
 * "Refusing to load /Users/x/...: ... Run: chmod 600 /Users/x/..." came through with BOTH
 * paths raw. Masking now happens where each message is built, one path at a time.
 *
 * It has to be a spawned process with a real HOME: `os.homedir()` reads the environment,
 * so an in-process test cannot substitute a fake home without lying about what it proved.
 *
 * THE CHECKOUT SITS OUTSIDE THE FAKE HOME, deliberately. The first version of this file put
 * it under the fake home, and that geometry hid F3: with the checkout inside HOME there is
 * always a `~` to substitute, so a remedy that could only produce `~` looked correct. A
 * checkout on a second volume, under /srv, in a sandbox or on a CI runner is not under HOME
 * — and that is where the absolute path was being echoed.
 */
function serverStderr(env: Record<string, string | undefined>, cwd: string): string {
  const r = spawnSync(process.execPath, ['-e', `
    import(${JSON.stringify(pathToFileURL(SERVER).href)}).catch((e) => { console.error(String(e)); process.exit(1); });
    setTimeout(() => process.exit(0), 1500);
  `], {
    cwd,
    env: { ...process.env, ...env, SNOW_LOG_LEVEL: 'info' } as NodeJS.ProcessEnv,
    encoding: 'utf8',
    timeout: 30_000,
  });
  return r.stderr ?? '';
}

const STORE = {
  version: 1,
  defaultInstance: 'pdi',
  instances: {
    pdi: {
      url: 'https://dev12345.service-now.com',
      environment: 'pdi',
      auth: { method: 'basic', username: 'admin', password: 'secret' },
      preset: 'pdi-developer',
      flags: { WRITE_ENABLED: 'true' },
      toolPackage: 'full', maxRecords: 100, prodWriteAck: false,
    },
  },
};

/** Any absolute user path shape: a real /Users/<name>, plus the two prefixes under test. */
function leakRegex(home: string, checkout: string): RegExp {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`/Users/[^\\s/]+|${esc(home)}|${esc(checkout)}`);
}

describe('F2 - no absolute home or checkout path reaches a log line', () => {
  it.skipIf(win32)('a refused store: neither the description nor the Run: remedy carries an absolute path (skipped on Windows: the mode check that produces this message does not run there)', () => {
    const base = mkdtempSync(join(tmpdir(), 'snowarch-mask-'));
    const fakeHome = join(base, 'home');
    const checkout = join(base, 'volume', 'repo');   // NOT under fakeHome — see the note above
    mkdirSync(fakeHome, { recursive: true });
    try {
      mkdirSync(join(checkout, '.local'), { recursive: true, mode: 0o700 });
      const store = join(checkout, '.local', 'instances.json');
      writeFileSync(store, JSON.stringify(STORE), { mode: 0o600 });
      chmodSync(store, 0o644); // the refusal this test is about

      const stderr = serverStderr({ HOME: fakeHome, CLAUDE_PROJECT_DIR: checkout, SNOW_STORE: undefined,
        SERVICENOW_INSTANCE_URL: undefined }, checkout);

      expect(stderr).toContain('STORE_PERMISSIONS_TOO_OPEN');
      expect(stderr).toContain('chmod 600');
      expect(stderr).toContain('<checkout>');
      // Checkout-relative, and it says where to stand. `~` cannot help here: the checkout
      // is not under HOME, which is exactly the geometry F3 was hiding in.
      expect(stderr).toMatch(/Run, from the checkout: chmod 600 \.local\/instances\.json/);
      expect(stderr).not.toMatch(leakRegex(fakeHome, checkout));
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  }, 40_000);

  it('a loaded store: the startup line names the checkout, never the absolute path', () => {
    const base = mkdtempSync(join(tmpdir(), 'snowarch-mask-'));
    const fakeHome = join(base, 'home');
    const checkout = join(base, 'volume', 'repo');   // NOT under fakeHome — see the note above
    mkdirSync(fakeHome, { recursive: true });
    try {
      mkdirSync(join(checkout, '.local'), { recursive: true, mode: 0o700 });
      writeFileSync(join(checkout, '.local', 'instances.json'), JSON.stringify(STORE), { mode: 0o600 });

      const stderr = serverStderr({ HOME: fakeHome, CLAUDE_PROJECT_DIR: checkout, SNOW_STORE: undefined,
        SERVICENOW_INSTANCE_URL: undefined }, checkout);

      expect(stderr).toContain('store: project (<checkout>');
      expect(stderr).not.toMatch(leakRegex(fakeHome, checkout));
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  }, 40_000);

  it('a store that is not found: the message is masked too', () => {
    const base = mkdtempSync(join(tmpdir(), 'snowarch-mask-'));
    const fakeHome = join(base, 'home');
    const checkout = join(base, 'volume', 'repo');   // NOT under fakeHome — see the note above
    mkdirSync(fakeHome, { recursive: true });
    try {
      mkdirSync(checkout, { recursive: true });
      const stderr = serverStderr({ HOME: fakeHome, CLAUDE_PROJECT_DIR: checkout,
        SNOW_STORE: join(checkout, 'absent.json'), SERVICENOW_INSTANCE_URL: undefined }, checkout);

      expect(stderr).toContain('STORE_NOT_FOUND');
      expect(stderr).not.toMatch(leakRegex(fakeHome, checkout));
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  }, 40_000);

  it('the env-instances note and the "no store" note are masked as well', () => {
    const base = mkdtempSync(join(tmpdir(), 'snowarch-mask-'));
    const fakeHome = join(base, 'home');
    const checkout = join(base, 'volume', 'repo');   // NOT under fakeHome — see the note above
    mkdirSync(fakeHome, { recursive: true });
    try {
      mkdirSync(join(checkout, '.local'), { recursive: true, mode: 0o700 });
      writeFileSync(join(checkout, '.local', 'instances.json'), JSON.stringify(STORE), { mode: 0o600 });

      const withEnv = serverStderr({ HOME: fakeHome, CLAUDE_PROJECT_DIR: checkout, SNOW_STORE: undefined,
        SERVICENOW_INSTANCE_URL: 'https://envtest.service-now.com' }, checkout);
      expect(withEnv).toContain('store ignored: <checkout>');
      expect(withEnv).not.toMatch(leakRegex(fakeHome, checkout));

      const empty = join(base, 'empty');
      mkdirSync(empty, { recursive: true });
      const none = serverStderr({ HOME: fakeHome, CLAUDE_PROJECT_DIR: empty, SNOW_STORE: undefined,
        SERVICENOW_INSTANCE_URL: undefined }, empty);
      expect(none).toContain('mode: unconfigured');
      expect(none).not.toMatch(leakRegex(fakeHome, empty));
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  }, 60_000);

  it.skipIf(win32)('a SNOW_STORE under HOME uses ~; one outside both HOME and the checkout is left as given (skipped on Windows: both halves assert a chmod remedy, and the mode check that produces it does not run there)', () => {
    // The user named that path explicitly. Rewriting it would point the remedy somewhere
    // they did not choose, which is worse than printing a path they already typed.
    const base = mkdtempSync(join(tmpdir(), 'snowarch-mask-'));
    const fakeHome = join(base, 'home');
    const checkout = join(base, 'volume', 'repo');
    try {
      mkdirSync(join(fakeHome, 'secrets'), { recursive: true });
      mkdirSync(checkout, { recursive: true });
      const underHome = join(fakeHome, 'secrets', 's.json');
      writeFileSync(underHome, JSON.stringify(STORE), { mode: 0o600 });
      chmodSync(underHome, 0o644);

      const a = serverStderr({ HOME: fakeHome, CLAUDE_PROJECT_DIR: checkout, SNOW_STORE: underHome,
        SERVICENOW_INSTANCE_URL: undefined }, checkout);
      expect(a).toMatch(/Run: chmod 600 ~\/secrets\/s\.json/);
      expect(a).not.toMatch(leakRegex(fakeHome, checkout));

      const elsewhere = join(base, 'volume', 'chosen.json');
      writeFileSync(elsewhere, JSON.stringify(STORE), { mode: 0o600 });
      chmodSync(elsewhere, 0o644);
      const b = serverStderr({ HOME: fakeHome, CLAUDE_PROJECT_DIR: checkout, SNOW_STORE: elsewhere,
        SERVICENOW_INSTANCE_URL: undefined }, checkout);
      expect(b).toContain('STORE_PERMISSIONS_TOO_OPEN');
      expect(b).toContain(elsewhere);                 // as given, on purpose
      expect(b).not.toContain(fakeHome);              // but never the home directory
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  }, 60_000);
});
