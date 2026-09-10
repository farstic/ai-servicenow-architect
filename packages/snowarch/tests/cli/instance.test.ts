import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AUTH_EXHAUSTED, EXIT_FAILED, EXIT_OK, EXIT_POLICY, MAX_ATTEMPTS, NEXT_LINE, NOTHING_SAVED,
  addInstance, addHelp, authFailedRetry, EXIT_CODES, labelExists, maskEntry, maskUsername,
  parseAddArgs, probeSummary, runAdd, savedLine, storeLine, type AddIo,
} from '../../src/cli/instance.js';
import { EXIT_USAGE } from '../../src/cli/tty.js';
import { expandPreset } from '../../src/utils/permissions.js';
import { loadStore, saveStore } from '../../src/store/index.js';
import type { Store } from '../../src/store/schema.js';
import { fakeRest } from '../helpers/fake-rest.js';
import { scriptedTty } from '../helpers/scripted-tty.js';

/**
 * ARC-07-S05 — `instance add`, and every way it ends without saving.
 *
 * The happy path is one test. The other twenty are exits: a wrong password three times, a role
 * that cannot read `sys_user`, an unreachable host, a production instance, a label that is taken.
 * Each asserts TWO things — the message the user sees, and that the store file is untouched —
 * because P-23's wizard is the one that offered "save anyway", and an instance saved that way
 * failed later inside a tool call with no memory of the moment somebody clicked past it.
 *
 * Every secret here is assembled, never spelled.
 */
const here = dirname(fileURLToPath(import.meta.url));
const URL_PDI = 'https://dev12345.service-now.com';
const USERNAME = 'svc.snowarch';
const PASSWORD = ['pw', '-', 'first'].join('');
const OTHER_PASSWORD = ['pw', '-', 'second'].join('');

const workspace = () => {
  const dir = mkdtempSync(join(tmpdir(), 'instance-add-'));
  return { dir, store: join(dir, 'instances.json'), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
};

/**
 * An `AddIo` over the scripted terminal, with the masked prompt answering from a queue.
 *
 * `stdin` is optional and only supplied for `--password-stdin`: the module reads the stream the
 * CALLER gives it, and a test that let it fall back to `process.stdin` would hang on a pipe
 * nobody closes — which is how that seam got found.
 */
const io = (answers: readonly string[], secrets: readonly string[] = [PASSWORD],
  stdin?: string): AddIo & { written: () => string; asked: () => string[] } => {
  const tty = scriptedTty(answers);
  const queue = [...secrets];
  async function* lines(): AsyncGenerator<Buffer> { yield Buffer.from(stdin ?? '', 'utf8'); }
  return {
    ask: tty.ask,
    write: tty.write,
    secret: async () => (queue.length > 1 ? (queue.shift() as string) : (queue[0] ?? '')),
    ...(stdin === undefined ? {} : {
      io: { stdin: lines() as unknown as NodeJS.ReadStream,
        stdout: { write: () => true } as unknown as NodeJS.WriteStream },
    }),
    written: () => tty.written,
    asked: () => tty.prompts,
  };
};

/** A client whose auth answer is scripted; every other table answers 200. */
const client = (authStatuses: readonly number[]) => {
  const queue = [...authStatuses];
  const calls: number[] = [];
  return {
    calls,
    make: () => {
      const status = queue.length > 1 ? (queue.shift() as number) : (queue[0] ?? 200);
      calls.push(status);
      return fakeRest({
        sys_user: { status },
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

const reachable = async () => ({ ok: true as const, status: 200, latencyMs: 1 });
const unreachable = async () => ({
  ok: false as const, code: 'DNS_FAILURE' as const, cause: 'ENOTFOUND',
  remedy: 'the name does not resolve', latencyMs: 1,
});

const baseOptions = {
  label: 'pdi', url: URL_PDI, environment: 'pdi', auth: 'basic' as const,
  username: USERNAME, preset: 'pdi-developer',
};

describe('parseAddArgs', () => {
  it('takes the label and the flags the story lists', () => {
    const parsed = parseAddArgs(['pdi', '--url', URL_PDI, '--env', 'pdi', '--auth', 'basic',
      '--preset', 'pdi-developer', '--default', '--yes']);
    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.options).toMatchObject({
      label: 'pdi', url: URL_PDI, environment: 'pdi', auth: 'basic',
      preset: 'pdi-developer', makeDefault: true, yes: true,
    });
  });

  it('refuses a label that is not one, naming the rule', () => {
    for (const label of ['Bad Label', '9lives', 'x'.repeat(33), '-leading']) {
      const parsed = parseAddArgs([label]);
      expect(parsed.ok, label).toBe(false);
      expect(!parsed.ok && parsed.message).toContain('not a valid label');
    }
  });

  it('refuses --preset and --flags together — they say the same thing twice', () => {
    const parsed = parseAddArgs(['pdi', '--preset', 'full', '--flags', 'WRITE=on']);
    expect(!parsed.ok && parsed.message).toContain('pass one');
  });

  it('has no --password anything: a secret is not an argument', () => {
    // The argv gate in `cli/index.ts` refuses it before commander, and this parser has no such
    // option to accept — two independent refusals, because argv is forever (P-34).
    expect(addHelp()).not.toContain('--password ');
    expect(addHelp()).toContain('--password-stdin');
    expect(addHelp()).toContain('secrets are never accepted as arguments');
    const parsed = parseAddArgs(['pdi', '--password', 'x']);
    expect(!parsed.ok && parsed.message).toContain('unknown option --password');
  });

  it('--help prints the exit-code table, from the table the behaviour uses', () => {
    for (const { code, meaning } of EXIT_CODES) {
      expect(addHelp()).toContain(`${code}  ${meaning}`);
    }
  });
});

describe('the happy path', () => {
  it('saves one entry, with six flags, the defaults, and a secret-free summary', async () => {
    const w = workspace();
    try {
      expect(existsSync(w.store)).toBe(false);                 // the precondition
      const terminal = io([]);
      const result = await runAdd({ ...baseOptions, makeDefault: true, yes: true }, terminal, {
        storePath: w.store, makeClient: client([200]).make, reachability: reachable, env: {},
      });

      expect(result.exitCode).toBe(EXIT_OK);
      expect(result.saved).toBe(true);
      const loaded = loadStore(w.store);
      expect('store' in loaded).toBe(true);
      const store = (loaded as { store: Store }).store;
      expect(store.defaultInstance).toBe('pdi');
      const entry = store.instances.pdi;
      expect(Object.keys(entry.flags)).toHaveLength(6);
      expect(entry.flags).toEqual(expandPreset('pdi-developer'));
      expect(entry.toolPackage).toBe('full');
      expect(entry.maxRecords).toBe(100);
      expect(entry.prodWriteAck).toBe(false);

      // The summary is what gets pasted into a ticket.
      const out = terminal.written();
      expect(out).toContain('Saved instance "pdi" (pdi · basic · preset pdi-developer · default).');
      expect(out).toContain('Probes: auth ok');
      expect(out).toContain(NEXT_LINE);
      expect(out).not.toContain(PASSWORD);
      expect(out).not.toContain(USERNAME);
      // ...and the masked entry a caller receives carries neither secret nor full account name.
      expect(result.entry?.auth.username).toBe('s***');
      expect(JSON.stringify(result.entry)).not.toContain(PASSWORD);
      expect(Object.keys(result.entry ?? {})).not.toContain('password');
    } finally { w.cleanup(); }
  });

  it('--from-bootstrap suppresses the Next line — the bootstrap prints its own', async () => {
    const w = workspace();
    try {
      const terminal = io([]);
      await runAdd({ ...baseOptions, yes: true, fromBootstrap: true }, terminal,
        { storePath: w.store, makeClient: client([200]).make, reachability: reachable, env: {} });
      expect(terminal.written()).toContain('Saved instance');
      expect(terminal.written()).not.toContain(NEXT_LINE);
    } finally { w.cleanup(); }
  });

  it('--no-probes writes lastProbe null and says so, and is never the default', async () => {
    const w = workspace();
    try {
      const terminal = io([]);
      const result = await runAdd({ ...baseOptions, yes: true, noProbes: true }, terminal,
        { storePath: w.store, makeClient: client([200]).make, reachability: reachable, env: {} });
      expect(result.exitCode).toBe(EXIT_OK);
      expect(result.lastProbe).toBeNull();
      expect(terminal.written()).toContain('Probes: skipped (--no-probes)');
      expect(probeSummary(null, expandPreset('full'), false)).not.toContain('skipped (--no-probes)');
    } finally { w.cleanup(); }
  });
});

describe('criterion 3 — three attempts, then nothing', () => {
  it('asks twice, exhausts, exits 1, and leaves no store behind', async () => {
    const w = workspace();
    try {
      const c = client([401, 401, 401]);
      const terminal = io(['y', 'y'], [PASSWORD, OTHER_PASSWORD, PASSWORD]);
      const result = await runAdd({ ...baseOptions }, terminal,
        { storePath: w.store, makeClient: c.make, reachability: reachable, env: {} });

      expect(result.exitCode).toBe(EXIT_FAILED);
      // The exact strings the story fixes, in order.
      expect(terminal.asked()).toContain(authFailedRetry(2));
      expect(terminal.asked()).toContain(authFailedRetry(3));
      expect(terminal.written()).toContain(AUTH_EXHAUSTED);
      // Three login attempts, and not one more: a fourth is an account closer to a lockout.
      expect(c.calls).toHaveLength(MAX_ATTEMPTS);
      expect(existsSync(w.store)).toBe(false);
    } finally { w.cleanup(); }
  });

  it('answering `n` at the first prompt stops immediately, with nothing saved', async () => {
    const w = workspace();
    try {
      const c = client([401]);
      const terminal = io(['n']);
      const result = await runAdd({ ...baseOptions }, terminal,
        { storePath: w.store, makeClient: c.make, reachability: reachable, env: {} });
      expect(result.exitCode).toBe(EXIT_FAILED);
      expect(terminal.written()).toContain(NOTHING_SAVED);
      expect(c.calls).toHaveLength(1);
      expect(existsSync(w.store)).toBe(false);
    } finally { w.cleanup(); }
  });

  it('a corrected password on the second attempt saves — the loop is a loop', async () => {
    const w = workspace();
    try {
      const c = client([401, 200]);
      // `y` to re-enter, then Enter at the review screen — the run does not end at the password.
      const terminal = io(['y', ''], [OTHER_PASSWORD, PASSWORD]);
      const result = await runAdd({ ...baseOptions, makeDefault: true }, terminal,
        { storePath: w.store, makeClient: c.make, reachability: reachable, env: {} });
      expect(result.exitCode).toBe(EXIT_OK);
      expect(c.calls).toHaveLength(2);
      expect(existsSync(w.store)).toBe(true);
    } finally { w.cleanup(); }
  });
});

describe('criterion 4 — --password-stdin never re-asks', () => {
  it('one request, no prompt, exit 1', async () => {
    const w = workspace();
    try {
      const c = client([401]);
      const terminal = io([], [PASSWORD], `${PASSWORD}\n`);
      const result = await runAdd({ ...baseOptions, passwordStdin: true, yes: true }, terminal, {
        storePath: w.store, makeClient: c.make, reachability: reachable, env: {},
      });
      expect(result.exitCode).toBe(EXIT_FAILED);
      expect(c.calls).toHaveLength(1);
      // There is nobody to ask: the same wrong credential sent again is noise in the instance's
      // audit log and, on some configurations, a lockout.
      expect(terminal.asked().some((p) => p.includes('Re-enter'))).toBe(false);
      expect(existsSync(w.store)).toBe(false);
    } finally { w.cleanup(); }
  });
});

describe('criterion 5 — production', () => {
  it('--env prod --preset full --yes is exit 3, and writes nothing', async () => {
    const w = workspace();
    try {
      const terminal = io([]);
      const result = await runAdd(
        { ...baseOptions, label: 'prod-acme', environment: 'prod', preset: 'full', yes: true },
        terminal, { storePath: w.store, makeClient: client([200]).make, reachability: reachable, env: {} });
      expect(result.exitCode).toBe(EXIT_POLICY);
      expect(terminal.written()).toContain('PROD_WRITE_NOT_ACKNOWLEDGED');
      expect(existsSync(w.store)).toBe(false);
    } finally { w.cleanup(); }
  });

  it('...and interactively it offers read-only, which Enter accepts', async () => {
    const w = workspace();
    try {
      const terminal = io(['', '']);
      const result = await runAdd(
        { ...baseOptions, label: 'prod-acme', environment: 'prod', preset: 'full' },
        terminal, { storePath: w.store, makeClient: client([200]).make, reachability: reachable, env: {} });
      expect(result.exitCode).toBe(EXIT_OK);
      expect(result.entry?.preset).toBe('read-only');
      expect(Object.values(result.entry?.flags ?? {}).every((v) => v === 'false')).toBe(true);
    } finally { w.cleanup(); }
  });
});

describe('criterion 6 — unreachable, and a role that cannot read', () => {
  it('an unreachable host with the menu answered `abort` exits 1, nothing saved', async () => {
    const w = workspace();
    try {
      const terminal = io(['3']);                              // [3] abort
      const result = await runAdd({ ...baseOptions }, terminal,
        { storePath: w.store, makeClient: client([200]).make, reachability: unreachable, env: {} });
      expect(result.exitCode).toBe(EXIT_FAILED);
      expect(terminal.written()).toContain('reachability: FAIL DNS_FAILURE');
      expect(terminal.written()).toContain(NOTHING_SAVED);
      expect(existsSync(w.store)).toBe(false);
    } finally { w.cleanup(); }
  });

  it('a 403 on sys_user prints the hint and, on the default N, exits 1', async () => {
    const w = workspace();
    try {
      const c = client([403]);
      const terminal = io(['']);                               // Enter = N
      const result = await runAdd({ ...baseOptions }, terminal,
        { storePath: w.store, makeClient: c.make, reachability: reachable, env: {} });
      expect(result.exitCode).toBe(EXIT_FAILED);
      expect(terminal.written()).toContain('credentials are valid');
      expect(terminal.asked().some((p) => p.includes('Try a different account? [y/N]'))).toBe(true);
      expect(c.calls).toHaveLength(1);
      expect(existsSync(w.store)).toBe(false);
    } finally { w.cleanup(); }
  });

  it('...and a 403 counts toward the SAME limit as a wrong password', async () => {
    const w = workspace();
    try {
      const c = client([403, 401, 403]);
      const terminal = io(['y', 'y', 'y'], [PASSWORD, OTHER_PASSWORD, PASSWORD]);
      const result = await runAdd({ ...baseOptions }, terminal,
        { storePath: w.store, makeClient: c.make, reachability: reachable, env: {} });
      expect(result.exitCode).toBe(EXIT_FAILED);
      // Both mean "this account, as given, cannot be used" — three of either is three.
      expect(c.calls).toHaveLength(MAX_ATTEMPTS);
    } finally { w.cleanup(); }
  });
});

describe('criterion 7 — LABEL_EXISTS and --replace', () => {
  const seed = (path: string) => saveStore(path, {
    version: 1,
    defaultInstance: 'pdi',
    instances: {
      pdi: {
        url: URL_PDI, environment: 'pdi', preset: 'read-only',
        auth: { method: 'basic', username: USERNAME, password: OTHER_PASSWORD },
        flags: expandPreset('read-only'), toolPackage: 'full', maxRecords: 100, prodWriteAck: false,
      },
    },
  } as Store);

  it('a duplicate label is exit 2, and the existing entry is untouched', async () => {
    const w = workspace();
    try {
      seed(w.store);
      const before = readFileSync(w.store, 'utf8');
      const terminal = io([]);
      const result = await runAdd({ ...baseOptions, yes: true }, terminal,
        { storePath: w.store, makeClient: client([200]).make, reachability: reachable, env: {} });
      expect(result.exitCode).toBe(EXIT_USAGE);
      expect(terminal.written()).toContain(labelExists('pdi'));
      expect(readFileSync(w.store, 'utf8')).toBe(before);
    } finally { w.cleanup(); }
  });

  it('--replace overwrites, and the OLD credentials are gone from the bytes', async () => {
    const w = workspace();
    try {
      seed(w.store);
      expect(readFileSync(w.store, 'utf8')).toContain(OTHER_PASSWORD);   // the precondition
      const terminal = io([]);
      const result = await runAdd({ ...baseOptions, yes: true, replace: true }, terminal,
        { storePath: w.store, makeClient: client([200]).make, reachability: reachable, env: {} });
      expect(result.exitCode).toBe(EXIT_OK);
      const after = readFileSync(w.store, 'utf8');
      // Overwritten, not merged: an old password left in the file is a credential nobody knows is
      // still there.
      expect(after).not.toContain(OTHER_PASSWORD);
      expect(after).toContain(PASSWORD);
    } finally { w.cleanup(); }
  });
});

describe('criterion 9 — addInstance(), the programmatic entry', () => {
  it('saves without asking anything, and returns a masked entry', async () => {
    const w = workspace();
    try {
      const terminal = io([]);
      const result = await addInstance({
        label: 'pdi', url: URL_PDI, environment: 'pdi', preset: 'pdi-developer', makeDefault: true,
        auth: { method: 'basic', username: 'u', password: PASSWORD },
      }, terminal, { storePath: w.store, makeClient: client([200]).make, reachability: reachable, env: {} });

      expect(result).toMatchObject({ saved: true, exitCode: EXIT_OK });
      expect(result.entry?.auth.username).toBe('u***');
      expect(Object.keys(result.entry ?? {})).not.toContain('password');
      expect(terminal.asked()).toEqual([]);                    // nothing was asked
      expect(terminal.written()).not.toContain(PASSWORD);
      // The store has the real one, because that is the point of the store.
      expect(readFileSync(w.store, 'utf8')).toContain(PASSWORD);
    } finally { w.cleanup(); }
  });
});

describe('the summary lines', () => {
  it('mask the username and never carry a secret', () => {
    expect(maskUsername('admin')).toBe('a***');
    expect(maskUsername('')).toBe('');
    const masked = maskEntry({
      url: URL_PDI, environment: 'pdi', preset: 'full', auth: { method: 'basic', username: USERNAME, password: PASSWORD },
      flags: expandPreset('full'), toolPackage: 'full', maxRecords: 100, prodWriteAck: false,
    } as never);
    expect(JSON.stringify(masked)).not.toContain(PASSWORD);
    expect(savedLine('pdi', masked, true)).toBe(
      'Saved instance "pdi" (pdi · basic · preset full · default).');
  });

  it('name the platform\'s own file-mode truth', () => {
    expect(storeLine('/tmp/x/instances.json', 'darwin')).toContain('mode 0600, dir 0700');
    // Windows has no chmod worth the name, and claiming one would be a lie in a line a support
    // reader trusts.
    expect(storeLine('C:\\x\\instances.json', 'win32')).toContain('file modes: ACL-inherited (Windows)');
  });

  it('report each enabled flag and print `off` for the rest', () => {
    const probe = { at: 'now', auth: 'ok', write: 'ok', scripting: 'role missing', cmdb: 'ok',
      atf: 'ok', nowAssist: 'not licensed', fluent: 'not installed' } as never;
    const line = probeSummary(probe, expandPreset('pdi-developer'), false);
    expect(line).toContain('auth ok');
    expect(line).toContain('scripting role missing');
    expect(line).toContain('NOW_ASSIST off');
    expect(line).toContain('FLUENT off');
  });
});

describe('the sentences are not retyped here', () => {
  it('instance.ts quotes S01–S04 rather than re-spelling their text', () => {
    // A sentence copied into this file is a sentence that drifts from the module that owns it —
    // and the wizard is where a user meets all four at once.
    const source = readFileSync(resolve(here, '../../src/cli/instance.ts'), 'utf8');
    const owned = [
      'NO_TTY: stdin is not a terminal',                        // S01
      'ServiceNow instances are served over https only',        // S02
      'no Now Assist licence detected',                          // S04's annotation
      'the wizard caps production at read-only',                  // S04's refusal
      'Probes confirm the account can reach each table family',   // S03's honesty note
    ];
    for (const sentence of owned) {
      expect(source, sentence).not.toContain(sentence);
    }
    // ...and it does import the modules that own them.
    for (const module of ['./tty.js', './url.js', './preset-ui.js', '../servicenow/probes.js']) {
      expect(source).toContain(module);
    }
  });
});
