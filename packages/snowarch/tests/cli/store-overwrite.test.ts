// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C307 — a store that exists and does not load is never read as an empty one, and is never saved over.
 *
 * The defect (found by the user-guide accuracy review, recorded by the owner for 2.2.8): `instance add`, `instance add --replace`, the
 * wizard the installer starts, and `instance import --from-legacy` each loaded the store, took ANY error for "no store yet", built a
 * store of one instance and saved it over the file. A store with a typo in it, a store a newer build wrote, a store at the wrong mode:
 * every saved instance and its password, gone, with no backup.
 *
 * What each path does now, for each store that exists and does not load (`tests/helpers/broken-stores.ts` plants them):
 *   - it REFUSES, before it asks a question, probes an instance or touches the file: exit 1, "nothing saved — a refusal";
 *   - it NAMES the store's own error (the loader's code) and says what to do, in the words the architect approved;
 *   - it leaves the file byte-identical, at the mode it had, in a folder that holds nothing new (no temporary file, no backup);
 *   - and a store that is NOT THERE is still a new store, and a store that loads is still added to.
 *
 * Windows: the mode-based plants are skipped there (modes are ACL-inherited and the loader does not judge them); the others run on every
 * OS. An ACL spy shows that a refused run makes no ACL call at all, so it cannot lock, unlock or read the permissions of a file it did not
 * load. And an open ACL is not a refusal on Windows today: the loader never judged it, `add` locks it and says so (ARC-09-C272).
 *
 * Every secret here is assembled, never spelled.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EXIT_FAILED, EXIT_OK, addInstance, runAdd, runList, type AddIo, type ManageDeps,
} from '../../src/cli/instance.js';
import { runImport, type ImportOptions } from '../../src/cli/import-legacy.js';
import { cliSpelling } from '../../src/cli/tty.js';
import { loadStore, maskPath } from '../../src/store/index.js';
import type { AclTools } from '../../src/store/acl.js';
import { fakeRest } from '../helpers/fake-rest.js';
import { scriptedTty } from '../helpers/scripted-tty.js';
import { serverStderr } from '../helpers/server-stderr.js';
import { removeTempDir, trackTempDir } from '../helpers/server-child.js';
import {
  IS_ROOT, IS_WINDOWS, PLANTS, SECRET_LIKE, STORED_PASSWORD, canPlant, look, plant, release, validStore, type Plant,
} from '../helpers/broken-stores.js';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(here, '../fixtures/legacy-instances.json');
const SERVER = resolve(here, '../../dist/server.js');
const SERVER_CLI = cliSpelling();
const URL_PDI = 'https://dev12345.service-now.com';
const USERNAME = 'svc.snowarch';
const PASSWORD = ['pw', 'new', '4417'].join('-');

const REAL = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE,
  CLAUDE_PROJECT_DIR: process.env.CLAUDE_PROJECT_DIR, SNOW_STORE: process.env.SNOW_STORE };

let base: string;
let home: string;
let checkout: string;
let store: string;
let legacy: string;

beforeEach(() => {
  base = trackTempDir(mkdtempSync(join(tmpdir(), 'store-overwrite-')));
  home = join(base, 'home');
  checkout = join(base, 'checkout');
  mkdirSync(join(home, '.config', 'servicenow-mcp'), { recursive: true });
  mkdirSync(join(checkout, '.local'), { recursive: true, mode: 0o700 });
  store = join(checkout, '.local', 'instances.json');
  legacy = join(home, '.config', 'servicenow-mcp', 'instances.json');
  copyFileSync(FIXTURE, legacy);
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.CLAUDE_PROJECT_DIR = checkout;
  delete process.env.SNOW_STORE;
});

afterEach(() => {
  release(store);
  for (const [key, value] of Object.entries(REAL)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  removeTempDir(base);
});

// ── the harness: a terminal that records, a login that counts, and a network that counts ─────────────────────────────────────────────────────
const everything: string[] = [];

const io = (answers: readonly string[] = []): AddIo & { written: () => string; asked: () => string[] } => {
  const tty = scriptedTty(answers);
  return {
    ask: tty.ask,
    write: (text: string) => { everything.push(text); tty.write(text); },
    secret: async () => PASSWORD,
    written: () => tty.written,
    asked: () => tty.prompts,
  };
};

const login = () => {
  const calls: string[] = [];
  return {
    calls,
    make: (entry: { url: string }) => {
      calls.push(entry.url);
      return fakeRest({
        sys_user: { status: 200 },
        sys_user_has_role: { status: 200, records: [{ 'role.name': 'admin' }] },
        sys_update_set: { status: 200 },
        sys_script_include: { status: 200 },
        cmdb_ci: { status: 200 },
        sys_atf_test: { status: 200 },
        sys_properties: { status: 200, records: [{ sys_id: 'x' }] },
      });
    },
  };
};

/** Lock tools that record every call: a refused run must make none. */
const spyAcl = (platform: NodeJS.Platform = 'win32') => {
  const calls: string[] = [];
  const acl: AclTools = {
    platform,
    userSid: () => { calls.push('sid'); return 'S-1-5-21-1-2-3-1001'; },
    read: (p) => { calls.push(`read ${p}`); return { ok: true, exposure: { who: [], read: false } }; },
    lock: (p, { dir }) => { calls.push(`lock ${dir ? 'dir' : 'file'} ${p}`); return { ok: true }; },
    ensurePrivate: (p, { dir }) => { calls.push(`ensure ${dir ? 'dir' : 'file'} ${p}`); return { state: 'private' }; },
  };
  return { calls, acl };
};

const addOptions = { label: 'pdi', url: URL_PDI, environment: 'pdi', auth: 'basic' as const,
  username: USERNAME, preset: 'pdi-developer', yes: true };

/** What a run of `instance add` is given: the store under test, a login that counts, a network that counts, an ACL that counts. */
function addDeps() {
  const c = login();
  const reached: string[] = [];
  const a = spyAcl();
  return {
    c, reached, a,
    deps: {
      storePath: store, makeClient: c.make as unknown as ManageDeps['makeClient'], env: {}, acl: a.acl,
      reachability: async (url: string) => { reached.push(url); return { ok: true as const, status: 200, latencyMs: 1 }; },
    } as ManageDeps,
  };
}

const importDeps = () => {
  const c = login();
  return { c, deps: { storePath: store, makeClient: c.make as unknown as ManageDeps['makeClient'],
    now: () => '2026-11-22T08:00:00.000Z', home } as ManageDeps & { home: string } };
};

/** The two lines a refusal says, in the words the architect approved (2026-11-22). Line 1 is the loader's error; line 2 is new. */
function expectedWords(p: Plant, nothing: 'Nothing saved' | 'Nothing imported', shown: string): { line1: RegExp; line2: string } {
  const backup = `Restore a backup (${SERVER_CLI} store backups lists them) and run this again, or ask for help. Moving the file aside starts an empty store.`;
  switch (p.code) {
    case 'STORE_UNREADABLE':
      return { line1: new RegExp(`^STORE_UNREADABLE — ${rx(shown)} (is not valid JSON|cannot be read \\(EACCES\\))$`, 'm'),
        line2: `${nothing}: ${shown} may hold saved passwords, so it was left as it is. ${backup}` };
    case 'STORE_SCHEMA_INVALID':
      return { line1: new RegExp(`^STORE_SCHEMA_INVALID — ${rx(shown)}: .+$`, 'm'),
        line2: `${nothing}: ${shown} may hold saved passwords, so it was left as it is. ${backup}` };
    case 'STORE_PERMISSIONS_TOO_OPEN':
      return { line1: new RegExp(`^STORE_PERMISSIONS_TOO_OPEN — Refusing to load ${rx(shown)}: file mode 0644 is group/world-readable\\. Run(, from the checkout)?: chmod 600 .+$`, 'm'),
        line2: `${nothing}: the store was left as it is. Run that command, then run this again.` };
    case 'STORE_SCHEMA_NEWER':
      return { line1: new RegExp(`^STORE_SCHEMA_NEWER — ${rx(shown)}: store schema 99 is newer than this server supports \\(1\\) — run ${rx(SERVER_CLI)} upgrade, or restore a backup \\(${rx(SERVER_CLI)} store backups\\)$`, 'm'),
        line2: `${nothing}: the store was left as it is.` };
    case 'STORE_SCHEMA_OUTDATED':
      return { line1: new RegExp(`^STORE_SCHEMA_OUTDATED — ${rx(shown)}: store schema 0 is older than this server \\(1\\) — run ${rx(SERVER_CLI)} store migrate$`, 'm'),
        line2: `${nothing}: the store was left as it is.` };
    default:
      throw new Error(`no words for ${p.code}`);
  }
}
const rx = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const label = (p: Plant): string => `${p.name}${p.posixOnly ? ' (skipped on Windows: modes are ACL-inherited)' : ''}${p.notRoot ? ' (skipped as root)' : ''}`;

/** The one place a refusal is judged, for the add paths and the import paths alike. */
function expectRefusal(p: Plant, out: string, nothing: 'Nothing saved' | 'Nothing imported', exitCode: number) {
  const words = expectedWords(p, nothing, maskPath(store));
  expect(exitCode).toBe(EXIT_FAILED);
  expect(out).toMatch(words.line1);
  expect(out.split('\n')).toContain(words.line2);
  // Nothing the file held is in what was said: not the stored password, not what the unparseable file began with, not the temp root.
  expect(out).not.toContain(STORED_PASSWORD);
  expect(out).not.toContain(SECRET_LIKE);
  expect(out).not.toContain(PASSWORD);
  expect(out).not.toContain(base);
}

// ── `instance add`, in every shape that reaches the save ────────────────────────────────────────────────────────────────────────────────────
describe('instance add refuses a store that exists and does not load, before it asks, probes or writes', () => {
  for (const p of PLANTS) {
    describe(label(p), () => {
      it.skipIf(!canPlant(p))('--yes: exit 1, the store\'s error, nothing asked, nothing probed, the file untouched', async () => {
        const was = plant(store, p);
        const t = io();
        const d = addDeps();
        const r = await runAdd({ ...addOptions }, t, d.deps);
        expect(r.saved).toBe(false);
        expectRefusal(p, t.written(), 'Nothing saved', r.exitCode);
        expect(r.message).toContain(p.code);
        expect(t.asked()).toEqual([]);
        expect(d.c.calls).toEqual([]);                        // no login attempt: the instance never heard of this
        expect(d.reached).toEqual([]);                        // not even a reachability probe
        expect(d.a.calls).toEqual([]);                        // and no ACL call: the permissions of what did not load are not ours to change
        expect(look(store)).toEqual(was);
      });

      it.skipIf(!canPlant(p))('--replace is the same: it replaces an ENTRY, never a store it could not read', async () => {
        const was = plant(store, p);
        const t = io();
        const d = addDeps();
        const r = await runAdd({ ...addOptions, replace: true }, t, d.deps);
        expect(r.saved).toBe(false);
        expectRefusal(p, t.written(), 'Nothing saved', r.exitCode);
        expect(d.c.calls).toEqual([]);
        expect(look(store)).toEqual(was);
      });

      it.skipIf(!canPlant(p))('the wizard the installer starts (--from-bootstrap, no --yes) refuses before its first question', async () => {
        const was = plant(store, p);
        const t = io();
        const d = addDeps();
        const r = await runAdd({ label: 'pdi', fromBootstrap: true }, t, d.deps);
        expect(r.saved).toBe(false);
        expectRefusal(p, t.written(), 'Nothing saved', r.exitCode);
        expect(t.asked()).toEqual([]);                        // the URL, the login, the permissions: none of it was asked
        expect(look(store)).toEqual(was);
      });

      it.skipIf(!canPlant(p))('the programmatic entry (addInstance) refuses too', async () => {
        const was = plant(store, p);
        const t = io();
        const d = addDeps();
        const r = await addInstance({ label: 'pdi', url: URL_PDI, environment: 'pdi', preset: 'pdi-developer',
          auth: { method: 'basic', username: USERNAME, password: PASSWORD } }, t, d.deps);
        expect(r.saved).toBe(false);
        expect(r.exitCode).toBe(EXIT_FAILED);
        expect(r.message).toContain(p.code);
        expect(look(store)).toEqual(was);
      });
    });
  }

  it('--json is the same refusal: exit 1, the error in the result, the file untouched', async () => {
    const p = PLANTS[0]!;
    const was = plant(store, p);
    const t = io();
    const d = addDeps();
    const r = await runAdd({ ...addOptions, json: true }, t, d.deps);
    expect(r).toMatchObject({ saved: false, exitCode: EXIT_FAILED });
    expect(r.message).toContain('STORE_UNREADABLE');
    expect(look(store)).toEqual(was);
  });
});

describe('the Windows permissions path: a refused run touches nothing, a run that saves still does what it did', () => {
  it('an ACL spy that says it is Windows is never called by a refusal, whatever the store is', async () => {
    for (const p of PLANTS.filter((x) => !x.posixOnly)) {
      const was = plant(store, p);
      const d = addDeps();
      const r = await runAdd({ ...addOptions }, io(), d.deps);
      expect(r.exitCode, p.name).toBe(EXIT_FAILED);
      expect(d.a.calls, p.name).toEqual([]);
      expect(look(store), p.name).toEqual(was);
    }
  });

  it('...and the same spy IS called by a run that saves, so a silent spy means something', async () => {
    const d = addDeps();
    const r = await runAdd({ ...addOptions }, io(), d.deps);
    expect(r.exitCode).toBe(EXIT_OK);
    expect(d.a.calls.length).toBeGreaterThan(0);
    expect(d.a.calls.join('\n')).toContain('lock file');
  });

  it('a store that loads is added to on Windows as everywhere: the instance already there is kept', async () => {
    writeFileSync(store, `${JSON.stringify(validStore(), null, 2)}\n`, { mode: 0o600 });
    const d = addDeps();
    const r = await runAdd({ ...addOptions }, io(), d.deps);
    expect(r.exitCode).toBe(EXIT_OK);
    const loaded = loadStore(store);
    expect(Object.keys('store' in loaded ? loaded.store.instances : {}).sort()).toEqual(['keep', 'pdi']);
  });
});

// ── what did not change: a store that is not there is a new store, and a store that loads is added to ─────────────────────────────────────────
describe('controls — what `instance add` still does', () => {
  it('a store that is not there is created: the first instance, as the default', async () => {
    expect(existsSync(store)).toBe(false);
    const d = addDeps();
    const r = await runAdd({ ...addOptions }, io(), d.deps);
    expect(r).toMatchObject({ saved: true, exitCode: EXIT_OK });
    const loaded = loadStore(store);
    expect('store' in loaded && Object.keys(loaded.store.instances)).toEqual(['pdi']);
    expect('store' in loaded && loaded.store.defaultInstance).toBe('pdi');
  });

  it('...and its folder too: the write makes the folder the store lives in', async () => {
    const deeper = join(base, 'new', 'folder', 'instances.json');
    const d = addDeps();
    const r = await runAdd({ ...addOptions }, io(), { ...d.deps, storePath: deeper });
    expect(r.exitCode).toBe(EXIT_OK);
    expect(existsSync(deeper)).toBe(true);
  });

  it('--replace on a store that is not there creates it as well', async () => {
    const d = addDeps();
    const r = await runAdd({ ...addOptions, replace: true }, io(), d.deps);
    expect(r.exitCode).toBe(EXIT_OK);
    expect(existsSync(store)).toBe(true);
  });

  it('--replace on a store that loads replaces that entry and keeps the others', async () => {
    const seeded = validStore() as { instances: Record<string, unknown> };
    seeded.instances.pdi = { ...(seeded.instances.keep as object), auth: { method: 'basic', username: 'old.user', password: ['pw', 'old', '1'].join('-') } };
    writeFileSync(store, `${JSON.stringify(seeded, null, 2)}\n`, { mode: 0o600 });
    const d = addDeps();
    const r = await runAdd({ ...addOptions, replace: true }, io(), d.deps);
    expect(r.exitCode).toBe(EXIT_OK);
    const bytes = readFileSync(store, 'utf8');
    expect(bytes).toContain(STORED_PASSWORD);                 // the other instance is still there
    expect(bytes).not.toContain(['pw', 'old', '1'].join('-')); // the replaced entry's old password is gone
    expect(bytes).toContain(PASSWORD);
  });

  it('a duplicate label is still exit 2, LABEL_EXISTS, on a store that loads', async () => {
    const seeded = validStore() as { instances: Record<string, unknown> };
    seeded.instances.pdi = seeded.instances.keep;
    writeFileSync(store, `${JSON.stringify(seeded, null, 2)}\n`, { mode: 0o600 });
    const before = readFileSync(store);
    const t = io();
    const r = await runAdd({ ...addOptions }, t, addDeps().deps);
    expect(r.exitCode).toBe(2);
    expect(t.written()).toContain('LABEL_EXISTS');
    expect(readFileSync(store)).toEqual(before);
  });
});

// ── the manage commands and the migration already refused: pinned, so the rule is the same on every path ──────────────────────────────────────
describe('controls — the commands that already refused still do', () => {
  for (const p of PLANTS) {
    it.skipIf(!canPlant(p))(`list over ${p.name} names the store's own error and writes nothing`, () => {
      const was = plant(store, p);
      const t = io();
      const code = runList({}, t, { storePath: store });
      expect(code).not.toBe(EXIT_OK);
      expect(t.written()).toContain(`${p.code} — `);
      expect(look(store)).toEqual(was);
    });
  }
});

// ── `instance import --from-legacy` ─────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('instance import --from-legacy refuses a store that exists and does not load, even to plan', () => {
  const run = (options: ImportOptions) => {
    const t = io();
    const d = importDeps();
    return { t, d, result: runImport({ ...options }, t, d.deps) };
  };

  for (const p of PLANTS) {
    describe(label(p), () => {
      it.skipIf(!canPlant(p))('--yes: exit 1, the store\'s error, "Nothing imported", nothing probed, the file untouched', async () => {
        const was = plant(store, p);
        const { t, d, result } = run({ path: legacy, yes: true });
        const r = await result;
        expect(r.imported).toBe(0);
        expectRefusal(p, t.written(), 'Nothing imported', r.exitCode);
        expect(t.asked()).toEqual([]);
        expect(d.c.calls).toEqual([]);
        expect(look(store)).toEqual(was);
      });

      it.skipIf(!canPlant(p))('--dry-run refuses too: a plan made against a store that was not read would say every label is free', async () => {
        const was = plant(store, p);
        const { t, d, result } = run({ path: legacy, dryRun: true });
        const r = await result;
        expectRefusal(p, t.written(), 'Nothing imported', r.exitCode);
        expect(t.written()).not.toContain('Legacy store:');   // no plan was printed
        expect(d.c.calls).toEqual([]);
        expect(look(store)).toEqual(was);
      });
    });
  }

  it('control: a store that is not there is created by the import, both entries', async () => {
    expect(existsSync(store)).toBe(false);
    const { result } = run({ path: legacy, yes: true });
    const r = await result;
    expect(r.exitCode).toBe(EXIT_OK);
    expect(r.imported).toBe(2);
    const loaded = loadStore(store);
    expect('store' in loaded && Object.keys(loaded.store.instances).sort()).toEqual(['pdi', 'prod']);
  });

  it('control: a store that loads is merged into, and what it held is kept', async () => {
    writeFileSync(store, `${JSON.stringify(validStore(), null, 2)}\n`, { mode: 0o600 });
    const { result } = run({ path: legacy, yes: true });
    const r = await result;
    expect(r.exitCode).toBe(EXIT_OK);
    const loaded = loadStore(store);
    expect('store' in loaded && Object.keys(loaded.store.instances).sort()).toEqual(['keep', 'pdi', 'prod']);
    expect(readFileSync(store, 'utf8')).toContain(STORED_PASSWORD);
  });
});

// ── nothing the broken file said, on any path ───────────────────────────────────────────────────────────────────────────────────────────────
describe('a broken store that begins with a secret-like string: that string is in no output, on any path', () => {
  const SECRETISH = PLANTS[0]!;

  it('list, add, add --replace, the wizard, import and import --dry-run print none of it, and not the temp root either', async () => {
    const outputs: string[] = [];
    const take = (t: { written: () => string }) => outputs.push(t.written());

    plant(store, SECRETISH);
    const l = io(); runList({}, l, { storePath: store }); take(l);
    const a = io(); await runAdd({ ...addOptions }, a, addDeps().deps); take(a);
    const r = io(); await runAdd({ ...addOptions, replace: true }, r, addDeps().deps); take(r);
    const w = io(); await runAdd({ label: 'pdi', fromBootstrap: true }, w, addDeps().deps); take(w);
    const i = io(); await runImport({ path: legacy, yes: true }, i, importDeps().deps); take(i);
    const n = io(); await runImport({ path: legacy, dryRun: true }, n, importDeps().deps); take(n);

    expect(outputs).toHaveLength(6);
    for (const out of outputs) {
      expect(out).toContain('STORE_UNREADABLE — ');
      for (const piece of [SECRET_LIKE, SECRET_LIKE.slice(0, 6), 'q7Zr', 'Unexpected', 'position ']) expect(out).not.toContain(piece);
      expect(out).not.toContain(base);
    }
    // and the whole of what any of them wrote to this terminal, in one place
    const all = everything.join('');
    expect(all).not.toContain(SECRET_LIKE);
    expect(readdirSync(join(checkout, '.local')).filter((f) => f !== 'instances.json')).toEqual([]);     // no log, no backup, no temporary file
  });

  it.skipIf(IS_WINDOWS || IS_ROOT)('an unreadable one (mode 000) prints the errno code and neither the raw path nor the system\'s sentence (skipped on Windows: modes are ACL-inherited; skipped as root)', async () => {
    const p = PLANTS.find((x) => x.name.startsWith('unreadable'))!;
    plant(store, p);
    const t = io();
    await runAdd({ ...addOptions }, t, addDeps().deps);
    const out = t.written();
    expect(out).toContain(`STORE_UNREADABLE — ${maskPath(store)} cannot be read (EACCES)`);
    expect(out).not.toMatch(/permission denied|open '/);
    expect(out.split(store).length - 1).toBe(0);               // the raw path: nowhere (the masked one is `<checkout>/…`)
  });
});

describe('the server prints the same content-free line, on its stderr', () => {
  it('a broken store that begins with a secret-like string: the code and "is not valid JSON", and none of the file, none of the temp root', async () => {
    plant(store, PLANTS[0]!);
    const stderr = await serverStderr(SERVER, { HOME: home, CLAUDE_PROJECT_DIR: checkout, SNOW_STORE: undefined, SERVICENOW_INSTANCE_URL: undefined }, checkout);
    expect(stderr).toContain('STORE_UNREADABLE');
    expect(stderr).toContain('is not valid JSON');
    for (const piece of [SECRET_LIKE, SECRET_LIKE.slice(0, 6), 'q7Zr', 'Unexpected', 'position ']) expect(stderr).not.toContain(piece);
    expect(stderr).not.toContain(base);
    expect(readdirSync(join(checkout, '.local')).filter((f) => f !== 'instances.json')).toEqual([]);
  }, 60_000);
});
