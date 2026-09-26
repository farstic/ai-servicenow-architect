import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AUTH_EXHAUSTED, EXIT_FAILED, EXIT_OK, EXIT_POLICY, MAX_ATTEMPTS, NEXT_LINE, NOTHING_SAVED,
  REACH_EXHAUSTED, URL_EXHAUSTED,
  addInstance, addHelp, authFailedRetry, EXIT_CODES, labelExists, maskEntry, maskUsername,
  ENV_CHOICES, STEPS, stepHeader, parseAddArgs, probeSummary, resolveOption, runAdd, savedLine, storeLine,
  type AddIo,
} from '../../src/cli/instance.js';
import { EXIT_USAGE } from '../../src/cli/tty.js';
import { runInstance } from '../../src/cli/instance-command.js';
import { ENVIRONMENTS } from '../../src/cli/url.js';
import { COLUMNS, resolveFlagAnswer } from '../../src/cli/preset-ui.js';
import { remedyFor } from '../../src/errors/codes.js';
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

      // AC 5, the "once per run" half (acceptance item B07-01). The format and the masking were
      // asserted in `reachability.test.ts`; the COUNT was documented at the call site and nowhere
      // else. One line, not zero — a run that printed none would satisfy "not twice".
      expect(out.match(/^network: /gm) ?? []).toHaveLength(1);
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
      // ...and the REASON inside them is the REGISTRY's sentence, not a second, narrower one
      // written here (ruled by the ARC-08-S10 review). Read from the registry rather than pinned as
      // a literal: the day the meaning is reworded this test follows it instead of holding the old
      // words. The negative is the half that matters — the string it used to be is gone.
      expect(authFailedRetry(2)).toContain(remedyFor('AUTHENTICATION_FAILED').meaning);
      expect(authFailedRetry(2)).not.toContain('wrong username or password');
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

/**
 * ARC-07-W2 — a URL typed at the prompt is re-asked, not exit 2.
 *
 * ARC-07-C10 fixed this class for the LABEL: re-ask up to `MAX_ATTEMPTS`, exit 1 on exhaustion, exit
 * 2 only for argv. The URL prompt was left on the exit-2 path, so a typo made B06 print *"a defect
 * in the bootstrap rather than in anything you typed … please report"* — the wizard blaming itself
 * for the user's typing, which is the same finding C10 recorded one prompt earlier.
 *
 * THE INPUTS ARE MEASURED, not taken from the brief: `foo` is a BARE-HOST PROPOSAL
 * (`https://foo.service-now.com`, `proposed: true`), not a rejection, so a case built on it would
 * have exercised the `Proposed URL` step and never the re-ask. `not a url` is `URL_INVALID`.
 */
describe('ARC-07-W2 — the URL prompt re-asks', () => {
  const INVALID = 'not a url';
  const INSECURE = 'http://x.service-now.com';
  const GOOD = 'https://x.service-now.com';

  it('ARC-07-W2 — a rejected URL is re-asked, and the run continues', async () => {
    const w = workspace();
    try {
      const interactive = { ...baseOptions, url: undefined };
      // Three answers: invalid, insecure, then good. The third is accepted AT the bound, which is
      // the boundary worth driving — the bound fires only on a rejected third answer.
      const terminal = io([INVALID, INSECURE, GOOD, '']);
      const result = await runAdd(interactive, terminal,
        { storePath: w.store, makeClient: client([200]).make, reachability: reachable, env: {} });
      const text = terminal.written();

      expect(result.exitCode).toBe(EXIT_OK);
      // BOTH normaliser messages reached the reader, each once — the scheme one is the whole reason
      // this prompt is worth re-asking rather than failing.
      expect(text).toContain('"not a url" is not a URL — enter https://<host>');
      expect(text).toContain('ServiceNow instances are served over https only');
      // ...and the accepted answer is what got saved.
      const loaded = loadStore(w.store);
      expect('store' in loaded).toBe(true);
      expect((loaded as { store: Store }).store.instances.pdi?.url).toBe(GOOD);
      // The prompt says what shape is wanted, so the first answer is likelier to be right.
      expect(terminal.asked().some((q) => q.includes('https://<host>, no path'))).toBe(true);
    } finally { w.cleanup(); }
  });

  it('...and three rejected answers exhaust with exit 1, not exit 2', async () => {
    const w = workspace();
    try {
      const interactive = { ...baseOptions, url: undefined };
      const terminal = io([INVALID, INVALID, INVALID]);
      const result = await runAdd(interactive, terminal,
        { storePath: w.store, makeClient: client([200]).make, reachability: reachable, env: {} });

      // EXIT_FAILED, not EXIT_USAGE: that is the half B06 reads. Exit 2 makes it print "a defect in
      // the bootstrap"; exit 1 makes it print "nothing here is broken, run it again".
      expect(result.exitCode).toBe(EXIT_FAILED);
      expect(terminal.written()).toContain(URL_EXHAUSTED);
      expect(existsSync(w.store)).toBe(false);
      // The message is shown for every refusal, including the last one.
      expect(terminal.written().match(/is not a URL/g) ?? []).toHaveLength(MAX_ATTEMPTS);
    } finally { w.cleanup(); }
  });

  it('...while --url on argv keeps exit 2 and the normaliser\'s own message', async () => {
    // THE ARGV PATH IS THE CONTROL THAT LIVES IN THE SUITE. A loop written one level too high would
    // re-ask a value that came from the command line, where there is nobody to ask and exit 2 is the
    // right answer — so the two paths are asserted apart rather than assumed to differ.
    const w = workspace();
    try {
      const terminal = io([]);
      const result = await runAdd({ ...baseOptions, url: INVALID, yes: true }, terminal,
        { storePath: w.store, makeClient: client([200]).make, reachability: reachable, env: {} });
      expect(result.exitCode).toBe(EXIT_USAGE);
      expect(terminal.written()).toContain('"not a url" is not a URL — enter https://<host>');
      expect(terminal.written()).not.toContain(URL_EXHAUSTED);
      expect(existsSync(w.store)).toBe(false);
    } finally { w.cleanup(); }
  });
});

/**
 * ARC-07-W3 — an empty username or password is re-asked, and the prompts say what is expected.
 *
 * `readCredentials` returned `null` for an empty answer to either prompt, and the caller turned that
 * into `Nothing saved.` — so a stray Enter threw away the label, the URL, the environment and the
 * auth method the user had already given. **And an empty answer was the ONLY way out of the prompt**,
 * which is the sharper half: the gesture that abandons the wizard and the gesture of pressing Enter
 * by mistake were the same gesture, so neither could be told from the other. `q` gives the prompt its
 * first real exit and the empty answer stops being one; both directions are asserted here so they
 * cannot be confused again.
 */
/**
 * ARC-07-W9 — THE ONE PLACE THE STEP NUMBERS ARE WRITTEN DOWN.
 *
 * Every other assertion in this suite derives its header through `stepHeader(id)`, which is what makes
 * inserting a step an edit to one list. But a derived assertion agrees with itself whatever position
 * the id holds: it cannot see ORDER, and it cannot see the TOTAL. `stepHeader('auth')` is correct at
 * `[3/6]` and equally correct at `[5/9]`.
 *
 * So the sequence is spelled out here, once, and this is the case the controls aim at: remove a step
 * from `STEPS`, or swap two, and nothing else in the suite notices.
 */
describe('ARC-07-W9 — the numbered sequence', () => {
  /**
   * THE ONE PLACE THE STEP NUMBERS ARE WRITTEN DOWN, and it has two readers.
   *
   * Every other assertion derives through `stepHeader(id)`, which is what makes inserting a step an
   * edit to one list. But a derived assertion agrees with itself whatever position an id holds: it
   * cannot see ORDER and it cannot see the TOTAL.
   *
   * SO BOTH READERS COMPARE AGAINST THIS LITERAL, never against each other. An earlier draft had the
   * live case assert `STEPS.slice(1).map(stepHeader)` — derived on both sides, so swapping two steps
   * moved the expectation with the product and the case was inert. That is the same failure this
   * programme has met four times now, and it nearly reached the one case built to prevent it.
   */
  const SEQUENCE = [
    '[1/7] Label',
    '[2/7] Instance URL',
    '[3/7] Environment',
    '[4/7] Authentication',
    '[5/7] Credentials',
    '[6/7] Checking the login and what this account may do (read-only, a few seconds) …',
    '[7/7] Permissions',
  ];

  it('ARC-07-W9 — the wizard introduces itself, and the label is step one', async () => {
    // THE CONTROL FOUND THIS MISSING. Removing the intro left 270 cases green: I had written the
    // renumber and forgotten the case for the thing the row is named after. `runInstance` takes an
    // `io`, so the live path IS drivable — three invalid labels exhaust ARC-07-C10's loop and it
    // returns before `runAdd` is reached, so nothing touches a store.
    const terminal = io(['Bad Label', '9lives', 'x'.repeat(33)]);
    // `isTty: true` is load-bearing: ARC-07-C10's re-ask loop is gated on a real terminal, because a
    // re-ask needs somebody to ask. Without it `runInstance` falls straight through to EXIT_USAGE and
    // the intro never prints — which is what my first version of this case measured.
    const code = await runInstance(['add'], { ...terminal, isTty: true });
    const text = terminal.written();

    expect(code).toBe(EXIT_FAILED);
    expect(text.startsWith('Instance wizard — seven steps (six questions and a login check).')).toBe(true);
    expect(text).toContain('Have ready: the instance URL and a');
    expect(text).toContain('Nothing is saved until the end.');
    // The label is step one, numbered from the list like every other step.
    expect(text).toContain(SEQUENCE[0]);
    expect(text).toContain('a short name you will type in commands, e.g. pdi, acme-dev');
    // ...and the prompt is the short one now: the step header carries what a label IS.
    expect(terminal.asked()).toContain(`Label [${'pdi'}]: `);
    // THE COMPLETE RULE ARRIVES ON REFUSAL, not on the header — the header offering a partial rule
    // is the ARC-07-C10 defect, and this is the assertion that keeps the two apart.
    expect(text).toContain('lower case, starting with a letter, up to 32 characters of a-z 0-9 _ -');
  });

  it('ARC-07-W9 — the list renders exactly this sequence', () => {
    expect(STEPS.map((step, i) => `[${i + 1}/${STEPS.length}] ${step.title}`)).toEqual(SEQUENCE);
  });

  it('...and a run prints them in that order, every one after the label', async () => {
    // `runAdd` starts at the URL: the label is asked by `runInstance` one level up, which has no
    // injection seam, so the live half covers steps two to seven and the list half covers all seven.
    const w = workspace();
    try {
      const terminal = io(['']);
      await runAdd({ ...baseOptions }, terminal,
        { storePath: w.store, makeClient: client([200]).make, reachability: reachable, env: {} });

      // The skipped-step suffix (ARC-08-C23) is trimmed: this case is about the NUMBERING, and the
      // suffix has its own cases and its own reasons to change.
      const headers = terminal.written().split('\n')
        .filter((line) => /^\[\d+\/\d+\]/.test(line))
        .map((line) => line.replace(/ … .*$/, ''));

      expect(headers).toEqual(SEQUENCE.slice(1));
      // ...and the total every line prints IS the list's length, so a header for a step not in the
      // list — or a step added with no header — cannot pass.
      expect(headers).toHaveLength(STEPS.length - 1);
    } finally { w.cleanup(); }
  });
});

describe('ARC-07-W3 — the credential prompts re-ask', () => {
  const noCredentials = { ...baseOptions, username: undefined };

  it('ARC-07-W3 — an empty username is re-asked, and the run continues', async () => {
    const w = workspace();
    try {
      const terminal = io(['', USERNAME, '']);
      const result = await runAdd(noCredentials, terminal,
        { storePath: w.store, makeClient: client([200]).make, reachability: reachable, env: {} });
      const text = terminal.written();

      expect(result.exitCode).toBe(EXIT_OK);
      expect(text).toContain('Username is required');
      expect(existsSync(w.store)).toBe(true);
      // The prompt says WHOSE account, because "Username" alone does not say whether it is the
      // instance's or this machine's.
      expect(terminal.asked().some((q) => q.includes('a ServiceNow user on this instance'))).toBe(true);
    } finally { w.cleanup(); }
  });

  it('...and an empty password is re-asked too', async () => {
    const w = workspace();
    try {
      // Two secrets: the first empty, then the real one. The queue hands them out in order.
      const terminal = io([''], ['', PASSWORD]);
      const result = await runAdd({ ...baseOptions }, terminal,
        { storePath: w.store, makeClient: client([200]).make, reachability: reachable, env: {} });

      expect(result.exitCode).toBe(EXIT_OK);
      expect(terminal.written()).toContain('Password is required');
      expect(existsSync(w.store)).toBe(true);
    } finally { w.cleanup(); }
  });

  it('...and `q` at the username abandons, which is the prompt\'s first real exit', async () => {
    const w = workspace();
    try {
      const terminal = io(['q']);
      const result = await runAdd(noCredentials, terminal,
        { storePath: w.store, makeClient: client([200]).make, reachability: reachable, env: {} });

      expect(result.exitCode).toBe(EXIT_FAILED);
      expect(terminal.written()).toContain(NOTHING_SAVED);
      expect(existsSync(w.store)).toBe(false);
      // ...and it did NOT complain that the answer was empty: `q` is an answer, not a non-answer.
      expect(terminal.written()).not.toContain('Username is required');
    } finally { w.cleanup(); }
  });

  it('...and a password of `q` is a password, not a request to quit', async () => {
    // THE REASON THE PASSWORD HAS NO `q` CASE. The prompt is invisible, so a user whose password is
    // `q` would be told nothing was saved with no way to see why. Ctrl-C is the password's exit and
    // `promptSecret` already ends the process on it.
    const w = workspace();
    try {
      const terminal = io([''], ['q']);
      const result = await runAdd({ ...baseOptions }, terminal,
        { storePath: w.store, makeClient: client([200]).make, reachability: reachable, env: {} });

      expect(result.exitCode).toBe(EXIT_OK);
      expect(existsSync(w.store)).toBe(true);
      expect(terminal.written()).not.toContain(NOTHING_SAVED);
    } finally { w.cleanup(); }
  });

  it('...and an input that can only answer empty ends, rather than spinning', async () => {
    // THE HANG GUARD, and it is about the input source rather than the user. `io.secret` has no
    // end-of-input value — `promptSecret` handles Ctrl-C and Ctrl-D by ending the process from inside
    // itself — so a stub or a closed pipe that answers `''` forever would spin in an unbounded loop.
    // Measured before the bound was written: this is the difference between a failing assertion and a
    // hung CI cell, which is why the secret loop is bounded and the echoed one is not.
    const w = workspace();
    try {
      const terminal = io([''], ['']);
      const result = await runAdd({ ...baseOptions }, terminal,
        { storePath: w.store, makeClient: client([200]).make, reachability: reachable, env: {} });

      expect(result.exitCode).toBe(EXIT_FAILED);
      expect(existsSync(w.store)).toBe(false);
      // It asked, and said why, up to the bound — rather than asking forever or giving up silently.
      expect(terminal.written().match(/Password is required/g) ?? []).toHaveLength(MAX_ATTEMPTS);
    } finally { w.cleanup(); }
  });

  it('...while --username and --password-stdin never reach the loop', async () => {
    // THE ARGV SPLIT, the same one W2 drew: a piped secret has no terminal to re-ask, so an empty one
    // must still abort rather than spin. Without this the password loop could hang a CI cell.
    const w = workspace();
    try {
      const terminal = io([], [''], '');
      const result = await runAdd({ ...baseOptions, passwordStdin: true }, terminal,
        { storePath: w.store, makeClient: client([200]).make, reachability: reachable, env: {} });

      expect(result.exitCode).toBe(EXIT_FAILED);
      expect(terminal.written()).toContain(NOTHING_SAVED);
      expect(terminal.written()).not.toContain('Password is required');
      expect(existsSync(w.store)).toBe(false);
    } finally { w.cleanup(); }
  });

  it('...and the login check says what it is doing and that it only reads', async () => {
    const w = workspace();
    try {
      const terminal = io(['']);
      await runAdd({ ...baseOptions }, terminal,
        { storePath: w.store, makeClient: client([200]).make, reachability: reachable, env: {} });
      // `[5/6] Probing` named the machine's activity, not the user's question. The user's question is
      // "is it doing anything to my instance?", and the answer is no.
      expect(terminal.written()).toContain(stepHeader('login'));
      expect(terminal.written()).toContain('read-only');
    } finally { w.cleanup(); }
  });
});

/**
 * ARC-07-W4 — the authentication question accepts what it lists, and re-asks otherwise.
 *
 * `method = answer === '2' ? 'oauth_ropc' : 'basic'` — so `oauth_ropc`, `oauth`, `02`, a typo and
 * Enter all became BASIC, silently. The question listed two options by name and then accepted exactly
 * one string; every other answer was read as agreement with the option the user had not chosen.
 * Nothing said Enter picked `[1]`, and nothing confirmed what had been chosen.
 */
describe('ARC-07-W4 — the authentication question', () => {
  const noAuth = { ...baseOptions, auth: undefined };

  it('ARC-07-W4 — the option can be answered by its own name', async () => {
    const w = workspace();
    try {
      // `oauth` is the name a reader types for `oauth_ropc`; before this row it meant `basic`.
      const terminal = io(['oauth', 'cid', '']);
      const result = await runAdd(noAuth, terminal,
        { storePath: w.store, makeClient: client([200]).make, reachability: reachable, env: {} });

      expect(result.exitCode).toBe(EXIT_OK);
      const loaded = loadStore(w.store);
      expect((loaded as { store: Store }).store.instances.pdi?.auth.method).toBe('oauth_ropc');
      expect(terminal.written()).toContain('Authentication → oauth_ropc');
    } finally { w.cleanup(); }
  });

  it('...an answer that is not an option says so, once, and re-asks', async () => {
    const w = workspace();
    try {
      const terminal = io(['x', '1', '']);
      const result = await runAdd(noAuth, terminal,
        { storePath: w.store, makeClient: client([200]).make, reachability: reachable, env: {} });
      const text = terminal.written();

      expect(result.exitCode).toBe(EXIT_OK);
      expect(text).toContain('"x" is not one of [1] basic  [2] oauth_ropc');
      // ONCE. The environment question's defect was reprinting with no message; the opposite mistake
      // is saying it twice for one wrong answer.
      expect(text.match(/is not one of/g) ?? []).toHaveLength(1);
      expect((loadStore(w.store) as { store: Store }).store.instances.pdi?.auth.method).toBe('basic');
    } finally { w.cleanup(); }
  });

  it('...and Enter picks the marked default, which the question says out loud', async () => {
    const w = workspace();
    try {
      const terminal = io(['', '']);
      const result = await runAdd(noAuth, terminal,
        { storePath: w.store, makeClient: client([200]).make, reachability: reachable, env: {} });
      const text = terminal.written();

      expect(result.exitCode).toBe(EXIT_OK);
      expect((loadStore(w.store) as { store: Store }).store.instances.pdi?.auth.method).toBe('basic');
      // The marker is DERIVED from the default, not spelled in the option's text — the ARC-07-C14
      // rule: a marker that is written into the words drifts the day the default moves.
      expect(text).toContain('Enter picks this');
      expect(text).toContain('Authentication → basic');
      // ...and choosing the default is not an error.
      expect(text).not.toContain('is not one of');
    } finally { w.cleanup(); }
  });

  it('...and every line of the question fits the terminal budget', async () => {
    // THE `oauth_ropc` ROW WAS 120 COLUMNS, and was 120 before this row too — the text is unchanged.
    // But `askOption` is now the one place option rows are rendered, and 100 columns is a hard
    // constraint rather than a preference, so it folds here and every later question inherits that.
    // `wrapRow` FOLDS rather than truncates, deliberately: the part a truncation removes is the part
    // that says what to do about it.
    const w = workspace();
    try {
      const terminal = io(['', '']);
      await runAdd({ ...baseOptions, auth: undefined }, terminal,
        { storePath: w.store, makeClient: client([200]).make, reachability: reachable, env: {} });
      // SCOPED TO THE QUESTION THIS ROW OWNS, and the scope is a measurement. Asserting the whole
      // transcript found three OTHER over-budget lines, all pre-existing and none this row's:
      // `Applying: …` at 101, `Saved instance … Probes: …` at 166, and the `Store: <path> …` line,
      // whose length depends on where the checkout is. ARC-07-W16 owns the Saved and Store wording,
      // so those are reported there rather than fixed here under a row about accepting an answer.
      const lines = terminal.written().split('\n');
      const from = lines.findIndex((l) => l.startsWith(stepHeader('auth')));
      const to = lines.findIndex((l) => l.startsWith('Authentication → '));
      expect(from, 'the question was not printed').toBeGreaterThan(-1);
      expect(to, 'the ack was not printed').toBeGreaterThan(from);
      const over = lines.slice(from, to + 1).filter((l) => l.length > COLUMNS);
      expect(over, `over ${COLUMNS}:\n${over.join('\n')}`).toEqual([]);
      // ...and the folded row is still ONE logical option: the continuation is indented to the
      // prefix's own width, DERIVED rather than spelled — my first version asserted 21 spaces where
      // the prefix is 19, which is the ARC-07-C13 lesson again: assert the logical row, not a
      // column somebody counted by hand.
      const at = lines.findIndex((l) => l.includes('[2] oauth_ropc — OAuth password grant'));
      expect(at, 'the oauth row was not printed').toBeGreaterThan(-1);
      const indent = lines[at].indexOf('[2] oauth_ropc — ') + '[2] oauth_ropc — '.length;
      expect(lines[at + 1]).toBe(`${' '.repeat(indent)}instances can disable it)`);
    } finally { w.cleanup(); }
  });

  it('...and the grammar IS the permissions screen\'s, asserted rather than assumed', () => {
    // The plan screen's `resolveChoice` lives in the ENGINE, which this package must not import, so
    // the rule is re-stated in `resolveOption` — and a re-statement with nothing holding it to the
    // original is how two surfaces come to answer the same keystroke differently. `resolveFlagAnswer`
    // is the copy inside THIS package, so the two are walked over the same answers.
    const options = [{ key: 'on', text: '' }, { key: 'off', text: '' }] as const;
    for (const [input, flag, key] of [
      ['1', 'true', 'on'], ['on', 'true', 'on'], ['ON', 'true', 'on'],
      ['2', 'false', 'off'], ['off', 'false', 'off'], ['OFF', 'false', 'off'],
      ['x', undefined, undefined], ['3', undefined, undefined], ['0', undefined, undefined],
    ] as const) {
      expect(resolveFlagAnswer(input), `flag: ${input}`).toBe(flag);
      expect(resolveOption(input, options)?.key, `option: ${input}`).toBe(key);
    }
    // ENTER IS THE ONE PLACE THEY DIFFER, and the difference is the point. The flag answer says
    // "nothing chosen" (null) because the screen's own default is the box as shown; an option list
    // with no default says "not one of them" (undefined), because there is nothing to accept. Give it
    // a default and Enter resolves to that — which is what marks `basic` on the auth question.
    expect(resolveFlagAnswer('')).toBeNull();
    expect(resolveOption('', options)).toBeUndefined();
    expect(resolveOption('', options, 'off')?.key).toBe('off');
  });

  it('...while --auth on argv asks nothing and still says what it used', async () => {
    const w = workspace();
    try {
      const terminal = io(['']);
      await runAdd({ ...baseOptions }, terminal,
        { storePath: w.store, makeClient: client([200]).make, reachability: reachable, env: {} });
      // ARC-08-C23's skipped-step line, unchanged by this row.
      expect(terminal.written()).toContain(stepHeader('auth', ' … basic'));
      expect(terminal.written()).not.toContain('is not one of');
    } finally { w.cleanup(); }
  });
});

/**
 * ARC-07-W5 — the environment question explains its options and never reprints silently.
 *
 * `askEnvironment` looped, reprinting the identical `What is this instance?  [1] pdi  [2] dev …` line
 * with **no message**, so Enter, `production` or `5` made the screen look frozen: the same words
 * appeared again and nothing said why. The four values were bare — `pdi` is undefined to a first-time
 * reader — and why the answer matters (prod is capped read-only) surfaced only at `[6/6]`.
 *
 * MEASURED: for a `devNNNNNN` host the environment is decided SILENTLY — `resolveEnvironment` returns
 * `pdi` without calling `ask` and without printing anything, so `[2/6] Environment` was followed by
 * nothing at all. For that path this row is "say it at all", not "say more".
 */
describe('ARC-07-W5 — the environment question', () => {
  const SHARED = 'https://acme-dev.service-now.com';       // not devNNNNNN, so it is asked
  const asked = { ...baseOptions, url: SHARED, environment: undefined };

  it('ARC-07-W5 — each option carries its meaning, one per line', async () => {
    const w = workspace();
    try {
      const terminal = io(['dev', '']);
      const result = await runAdd(asked, terminal,
        { storePath: w.store, makeClient: client([200]).make, reachability: reachable, env: {} });
      const text = terminal.written();

      expect(result.exitCode).toBe(EXIT_OK);
      expect(text).toContain('[1] pdi — your personal developer instance');
      expect(text).toContain('[2] dev — a shared development instance');
      expect(text).toContain('[3] test — a test / UAT instance');
      // WHY THE ANSWER MATTERS, at the moment it is asked rather than four steps later at [6/6].
      expect(text).toContain('[4] prod — real users; the wizard saves it read-only');
      expect(text).toContain('Environment → dev');
    } finally { w.cleanup(); }
  });

  it('...an unknown answer says so and re-asks, instead of reprinting in silence', async () => {
    const w = workspace();
    try {
      // `2` rather than `4`: choosing prod pulls in the read-only cap and its own [Y/n], which is
      // covered by criterion 5 and would make this case about two things. My first version answered
      // `4` and asserted EXIT_POLICY — wrong, because the cap OFFERS read-only and the trailing
      // Enter accepted it, so the run saved and exited 0. The case is about the message, so it uses
      // an answer with no policy attached.
      const terminal = io(['production', '2', '']);
      const result = await runAdd(asked, terminal,
        { storePath: w.store, makeClient: client([200]).make, reachability: reachable, env: {} });
      const text = terminal.written();

      expect(text).toContain('"production" is not one of [1] pdi  [2] dev  [3] test  [4] prod');
      // The QUESTION is not printed twice: the old loop reprinted it with no message, which is what
      // made the screen look frozen. One question, one message per wrong answer.
      expect(text.match(/What is this instance\?/g) ?? []).toHaveLength(1);
      expect(text.match(/is not one of/g) ?? []).toHaveLength(1);
      expect(result.exitCode).toBe(EXIT_OK);
      expect((loadStore(w.store) as { store: Store }).store.instances.pdi?.environment).toBe('dev');
    } finally { w.cleanup(); }
  });

  it('...Enter is not a default here, and the reason is older than this row', async () => {
    // `askEnvironment` has carried the decision in a comment since it was written: "No default: `pdi`
    // is right often enough to be tempting and wrong in exactly the case that matters, because the
    // environment decides which preset a write is checked against." So Enter is an unknown answer.
    const w = workspace();
    try {
      const terminal = io(['', 'dev', '']);
      const result = await runAdd(asked, terminal,
        { storePath: w.store, makeClient: client([200]).make, reachability: reachable, env: {} });

      expect(result.exitCode).toBe(EXIT_OK);
      expect(terminal.written()).toContain('"" is not one of');
      expect(terminal.written()).not.toContain('Enter picks this');
      expect((loadStore(w.store) as { store: Store }).store.instances.pdi?.environment).toBe('dev');
    } finally { w.cleanup(); }
  });

  it('...and a devNNNNNN host ASKS, with pdi marked, and Enter accepts it', async () => {
    // THE ARCHITECT'S RULING, on the measurement that this path decided in total silence: the one
    // wizard choice with no later edit (there is no `set-env`) must be a question at the moment it is
    // made. Enter accepts the proposal, so the happy path costs one keystroke and shows what it did.
    const w = workspace();
    try {
      const terminal = io(['', '']);                        // Enter at the question, Enter at [6/6]
      const result = await runAdd({ ...baseOptions, environment: undefined }, terminal,
        { storePath: w.store, makeClient: client([200]).make, reachability: reachable, env: {} });
      const text = terminal.written();

      expect(result.exitCode).toBe(EXIT_OK);
      expect(text).toContain('What is this instance?');
      expect(text).toContain('[1] pdi — your personal developer instance');
      // MARKED, and derived from the proposal rather than spelled — so the marker follows the URL.
      expect(text).toMatch(/\[1\] pdi — .* · Enter picks this/);
      expect(text).toContain('Environment → pdi');
      expect((loadStore(w.store) as { store: Store }).store.instances.pdi?.environment).toBe('pdi');
    } finally { w.cleanup(); }
  });

  it('...and a number at that prompt overrides the proposal', async () => {
    // The whole reason for asking: a PDI used as a team's shared dev is a real case, and before this
    // it was unchangeable without removing the instance.
    const w = workspace();
    try {
      const terminal = io(['2', '']);
      const result = await runAdd({ ...baseOptions, environment: undefined }, terminal,
        { storePath: w.store, makeClient: client([200]).make, reachability: reachable, env: {} });

      expect(result.exitCode).toBe(EXIT_OK);
      expect(terminal.written()).toContain('Environment → dev');
      expect((loadStore(w.store) as { store: Store }).store.instances.pdi?.environment).toBe('dev');
    } finally { w.cleanup(); }
  });

  it('...while --yes still decides silently, and says what it decided', async () => {
    // There is nobody to ask, so the behaviour is unchanged — and the decision is stated, which is
    // the half that was missing before this row. The `(from the URL)` suffix is what distinguishes a
    // decision from an answer, and it appears on THIS path only.
    const w = workspace();
    try {
      const terminal = io([]);
      const result = await runAdd({ ...baseOptions, environment: undefined, yes: true }, terminal,
        { storePath: w.store, makeClient: client([200]).make, reachability: reachable, env: {} });
      const text = terminal.written();

      expect(result.exitCode).toBe(EXIT_OK);
      expect(text).toContain('Environment → pdi (from the URL)');
      expect(text).not.toContain('What is this instance?');
      expect((loadStore(w.store) as { store: Store }).store.instances.pdi?.environment).toBe('pdi');
    } finally { w.cleanup(); }
  });

  it('...and every environment has a meaning, so a new one cannot arrive without words', () => {
    // ONE DEFINITION. `ENVIRONMENTS` decides what exists; `ENV_CHOICES` decides what each one means.
    // Two lists, so this asserts they are the same list in the same order — otherwise adding a fifth
    // environment would print a row with no meaning, or drop one silently.
    expect(ENV_CHOICES.map((c) => c.key)).toEqual([...ENVIRONMENTS]);
    for (const choice of ENV_CHOICES) expect(choice.text.length, choice.key).toBeGreaterThan(0);
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
      // AND STILL THE BARE LINE on an explicit abort — ARC-07-W2's exhaustion sentence is for running
      // out of rounds, not for a user who chose to stop. The two are asserted apart.
      expect(terminal.written()).toContain(NOTHING_SAVED);
      expect(terminal.written()).not.toContain(REACH_EXHAUSTED);
      expect(existsSync(w.store)).toBe(false);
      // Still exactly one: the line is printed before the probe, so a FAILING probe prints it too —
      // "it worked" and "it failed behind a proxy" are the two facts it exists to tell apart.
      expect(terminal.written().match(/^network: /gm) ?? []).toHaveLength(1);
    } finally { w.cleanup(); }
  });

  it('...and the RETRY path probes again without printing the network line twice', async () => {
    // The one path that could break "once per run", and the reason the count is asserted at all:
    // the menu re-probes, and a second `describeNetworkEnv` beside the second probe would look
    // entirely reasonable to whoever adds it. Two probes, one line.
    const w = workspace();
    try {
      let probes = 0;
      const failing = async (...args: Parameters<typeof unreachable>) => {
        probes += 1;
        return unreachable(...args);
      };
      // [2] is retry — [1] is "re-enter the URL", which the first version of this test chose and
      // the precondition below caught: one probe, not two, so the assertion would have been true
      // of a run that never retried.
      const terminal = io(['2']);
      const result = await runAdd({ ...baseOptions }, terminal,
        { storePath: w.store, makeClient: client([200]).make, reachability: failing, env: {} });

      expect(result.exitCode).toBe(EXIT_FAILED);
      expect(probes, 'the retry did not re-probe — this asserts nothing').toBeGreaterThan(1);
      expect(terminal.written().match(/^network: /gm) ?? []).toHaveLength(1);
      expect(existsSync(w.store)).toBe(false);
    } finally { w.cleanup(); }
  });

  /**
   * ARC-07-W1 — the menu's first choice does what it says.
   *
   * `reachabilityMenu()` has offered `[1] re-enter the URL` since it was written, and `runAdd` tested
   * `if (choice !== 'retry')` — so the ONE advertised way back from a mistyped host printed
   * `Nothing saved.` and exited. The retry case above records the encounter: its comment says the
   * first version of that test chose `[1]`, measured one probe instead of two, and switched to `[2]`.
   * The workaround was right for that test and the defect stayed.
   *
   * THE PROBE LOG IS THE WITNESS, not the transcript alone: a case that only read the ack would pass
   * against a handler that printed it and re-probed the OLD url, which is the mistake available here.
   */
  const probeLog = (failing: string) => {
    const urls: string[] = [];
    const probe = async (url: string) => {
      urls.push(String(url));
      return String(url).includes(failing)
        ? { ok: false as const, code: 'DNS_FAILURE' as const, cause: 'ENOTFOUND',
          remedy: 'the name does not resolve', latencyMs: 1 }
        : { ok: true as const, status: 200, latencyMs: 1 };
    };
    return { probe, urls };
  };
  const TYPO = 'https://dev12345.servicenow.com';        // a real typo: `servicenow`, not `service-now`

  it('ARC-07-W1 — re-enter the URL re-asks the URL and probes again', async () => {
    const w = workspace();
    try {
      // `url: undefined` is what reaches the prompt — `runAdd` asks when `options.url` is absent,
      // and spelling it is clearer than destructuring a value only to discard it.
      const interactive = { ...baseOptions, url: undefined };
      const { probe, urls } = probeLog('servicenow.com');
      // The last '' is Enter on the permissions screen: this run is interactive, so it gets one.
      const terminal = io([TYPO, '1', URL_PDI, '']);
      const result = await runAdd(interactive, terminal,
        { storePath: w.store, makeClient: client([200]).make, reachability: probe, env: {} });
      const text = terminal.written();

      expect(text).toContain(`URL → ${URL_PDI} · probing again`);
      // THE SECOND PROBE USED THE NEW URL. Without this the ack could be printed over a re-probe of
      // the typo, which would look correct in a transcript and fail forever.
      expect(urls).toEqual([TYPO, URL_PDI]);
      expect(text).toContain(stepHeader('auth'));
      expect(result.exitCode).toBe(EXIT_OK);
      // AND THE ENTRY CARRIES THE URL THAT ANSWERED, not the typo. `instanceUrl` feeds the client,
      // the probes and the saved record; had it stayed `const`, the run would have reached this line
      // having saved an instance nobody can reach — the exact outcome P-23 exists to prevent.
      const loaded = loadStore(w.store);
      expect('store' in loaded).toBe(true);
      expect((loaded as { store: Store }).store.instances.pdi?.url).toBe(URL_PDI);
      // Still once per run, the invariant the retry case guards: one network line, two probes.
      expect(text.match(/^network: /gm) ?? []).toHaveLength(1);
    } finally { w.cleanup(); }
  });

  it('...and a re-entered URL that is also unreachable offers the menu again, bounded', async () => {
    const w = workspace();
    try {
      // `url: undefined` is what reaches the prompt — `runAdd` asks when `options.url` is absent,
      // and spelling it is clearer than destructuring a value only to discard it.
      const interactive = { ...baseOptions, url: undefined };
      // Every host fails, so the only way out is the bound.
      const { probe, urls } = probeLog('.');
      const terminal = io([TYPO, '1', TYPO, '1', TYPO]);
      const result = await runAdd(interactive, terminal,
        { storePath: w.store, makeClient: client([200]).make, reachability: probe, env: {} });

      expect(result.exitCode).toBe(EXIT_FAILED);
      // ARC-07-W2 gave the bound its own sentence: reaching it is an exhaustion, and it now reads
      // like the label's and the login's rather than ending on a bare `Nothing saved.`
      expect(terminal.written()).toContain(REACH_EXHAUSTED);
      expect(existsSync(w.store)).toBe(false);
      // THREE ROUNDS, then it stops. Unbounded would mean a stdin that always answers `1` never ends,
      // which in a test is a hang and in CI is a timeout nobody can read.
      expect(urls).toHaveLength(3);
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

/**
 * ARC-07-C5 — `add` probed, printed the results, and threw them away.
 *
 * Sitting C, A6, rc.5. `instance add pdi2 … --yes` ran seven probes at `[5/6]` and printed
 * `Probes: auth ok · write ok · cmdb_write ok · scripting ok · atf ok · now_assist ok · fluent not
 * installed.` — and then `instance list` showed:
 *
 *   pdi2  pdi  basic  full  <blank default>  t***@<domain>  —
 *
 * `LAST PROBE —` for an instance probed seconds earlier. The entry `add` builds carried no
 * `lastProbe` key at all, on any path: it reported the results to stdout and to `--json` and
 * dropped them from the thing it saved.
 *
 * WHY IT LOOKED FINE INTERACTIVELY, and this is what made it invisible: `pdi`'s `lastProbe` in the
 * owner's store did not come from the wizard either. The next `./snowarch doctor` runs SV-04,
 * which calls `instance test`, which DOES write `lastProbe` — so the value was always backfilled
 * by something else, and only an instance listed before any doctor ran showed the gap. pdi2 was
 * added and listed with nothing in between.
 *
 * Same shape as ARC-09-C46's tally: the data was in hand and thrown away.
 */
describe('ARC-07-C5 — add keeps the probes it took', () => {
  it('writes lastProbe from the run that probed, not from a later doctor', async () => {
    const w = workspace();
    try {
      const result = await runAdd({ ...baseOptions, makeDefault: true, yes: true }, io([]), {
        storePath: w.store, makeClient: client([200]).make, reachability: reachable, env: {},
      });
      expect(result.exitCode).toBe(EXIT_OK);

      const store = (loadStore(w.store) as { store: Store }).store;
      const stored = store.instances.pdi.lastProbe as { at?: string; auth?: string } | undefined;

      expect(stored, 'the entry carries no lastProbe — this is the C5 defect').toBeTruthy();
      expect(stored!.auth).toBe('ok');
      expect(typeof stored!.at).toBe('string');

      // It is the SAME result the run reported, not a second measurement.
      expect(stored).toEqual(result.lastProbe);

      // And it carries no credential: this lands in a 0600 file a person may `cat`.
      const serialised = JSON.stringify(stored);
      expect(serialised).not.toContain(PASSWORD);
      expect(serialised).not.toContain(USERNAME);
    } finally {
      w.cleanup();
    }
  });

  it('still writes nothing when there were no probes to keep', async () => {
    // Both directions, and it is the existing `--no-probes` contract: an entry that was never
    // probed must not grow a `lastProbe`, because a record of a probe that did not happen is
    // worse than no record. `expect(result.lastProbe).toBeNull()` is already asserted above for
    // the reported value; this asserts the STORED one.
    const w = workspace();
    try {
      await runAdd({ ...baseOptions, makeDefault: true, yes: true, noProbes: true }, io([]), {
        storePath: w.store, makeClient: client([200]).make, reachability: reachable, env: {},
      });
      const store = (loadStore(w.store) as { store: Store }).store;
      expect(store.instances.pdi.lastProbe ?? null).toBeNull();
    } finally {
      w.cleanup();
    }
  });
});

/**
 * ARC-08-C23 — `[3/6]` printed nothing when the question was already answered.
 *
 * With `--auth` or `--yes` the wizard went `[2/6] … [4/6]`, and a reader was left to decide
 * whether a step had failed, been dropped, or scrolled past. Six numbered steps is a promise that
 * all six are accounted for, and a silent gap breaks it in the direction that worries people.
 *
 * Here rather than in `tests/cosmetics.test.mjs` because this is the WRITER: that file asserts
 * `skipReason` returns the right words, which proves nothing about whether the line is ever
 * printed — and a line that is never printed was the whole defect.
 */
describe('ARC-08-C23 — the numbering has no silent gaps', () => {
  it('names the method it used and why, on the path that asked nothing', async () => {
    const w = workspace();
    try {
      const terminal = io([]);
      // `auth` DELETED from the options: `baseOptions` carries `auth: 'basic'`, so leaving it in
      // takes the `--auth` branch and this case would never have been exercised. The path under
      // test is the one where nobody chose — `--yes` did.
      const noAuth = { ...baseOptions, auth: undefined };
      await runAdd({ ...noAuth, makeDefault: true, yes: true }, terminal, {
        storePath: w.store, makeClient: client([200]).make, reachability: reachable, env: {},
      });

      const out = terminal.written();
      expect(out).toContain(stepHeader('auth', ' … basic (default; --yes asked nothing)'));
      // ARC-07-W9 DERIVED BOTH HALVES, and the second assertion is new. This read
      // `/\[(\d)\/6\]/g` and expected `[1, 2, 3, 4, 5, 6]` — the total hardcoded in the PATTERN, so
      // it could only ever match lines that already agreed with it: a header printed with a stale
      // total was unfindable by the case whose job is the numbering. The total is captured now and
      // asserted against the list, which is what makes a stale one fail.
      //
      // From 2: `runAdd` starts at the URL, and the label is asked one level up.
      const printed = [...out.matchAll(/\[(\d+)\/(\d+)\]/g)];
      expect([...new Set(printed.map((m) => Number(m[1])))])
        .toEqual(STEPS.slice(1).map((_, i) => i + 2));
      expect([...new Set(printed.map((m) => Number(m[2])))]).toEqual([STEPS.length]);
    } finally { w.cleanup(); }
  });

  it('says `from --auth` when the user chose it, not when a flag did', async () => {
    // Two different reasons a question goes unasked, and a reader deciding whether the answer is
    // theirs needs to know which.
    const w = workspace();
    try {
      const terminal = io([]);
      await runAdd({ ...baseOptions, makeDefault: true, yes: true, auth: 'basic' }, terminal, {
        storePath: w.store, makeClient: client([200]).make, reachability: reachable, env: {},
      });
      expect(terminal.written()).toContain(stepHeader('auth', ' … basic (from --auth)'));
    } finally { w.cleanup(); }
  });
});
