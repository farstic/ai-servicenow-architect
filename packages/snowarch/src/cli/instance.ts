/**
 * ARC-07-S05 — `instance add`, end to end.
 *
 * This file COMPOSES; it does not decide. The URL rules are S02's, the masked prompt is S01's, the
 * probes are S03's, the review screen is S04's, and the store write is ARC-04-S02's. What is new
 * here is the ORDER, the exit paths, and one rule that only exists where they meet:
 *
 *   NOTHING IS SAVED UNTIL THE `Applying:` LINE, AND THERE IS NO "SAVE ANYWAY".
 *
 * P-23's wizard offered exactly that, and an instance saved through it failed later inside a tool
 * call with no memory of the moment somebody clicked past a warning. Every refusal here ends with
 * `Nothing saved.` and an exit code, and the store file is untouched on every one of them.
 *
 * The second rule is the credential loop: THREE ATTEMPTS, ONE REQUEST EACH, shared between a wrong
 * password and a missing role. A fourth attempt is an account closer to a lockout on an instance
 * whose policy nobody here knows.
 */
import { existsSync } from 'node:fs';

import { EXIT_INTERRUPTED, EXIT_USAGE, readSecretFromStdin, type Io } from './tty.js';

// Re-exported so the exit-code table has ONE home: `instance-command.ts` and the tests read the
// same constants the behaviour uses, rather than importing 2 from one file and 0 from another.
export { EXIT_USAGE, EXIT_INTERRUPTED };
import { ENVIRONMENTS, normalizeInstanceUrl, resolveEnvironment, type Environment } from './url.js';
import { ENTRY_DEFAULTS, prodRefusal, resolveFlags, type ReviewIo } from './preset-ui.js';
import { describeNetworkEnv, formatFailure, probeReachability, reachabilityMenu } from '../servicenow/reachability.js';
import { probeAll, toLastProbe, type AuthProbe, type LastProbe, type ProbeClient } from '../servicenow/probes.js';
import { ServiceNowClient } from '../servicenow/client.js';
import { loadStore, projectStorePath, resolveStorePath, saveStore } from '../store/index.js';
import { completeFlags, type Store, type StoreInstance } from '../store/schema.js';
import { FLAG_NAMES, type Flags } from '../utils/permissions.js';

export const EXIT_OK = 0;
export const EXIT_FAILED = 1;
export const EXIT_POLICY = 3;

/**
 * What each code means when THIS command produces it. One table, printed by `--help`, so the
 * help and the behaviour cannot describe different programs.
 */
export const EXIT_CODES: ReadonlyArray<{ code: number; meaning: string }> = Object.freeze([
  { code: EXIT_OK, meaning: 'saved' },
  { code: EXIT_FAILED, meaning: 'nothing saved — a refusal, an abort, or three failed attempts' },
  { code: EXIT_USAGE, meaning: 'usage — a bad flag, LABEL_EXISTS, ENV_REQUIRED, URL_REQUIRED' },
  { code: EXIT_POLICY, meaning: 'policy — PROD_WRITE_NOT_ACKNOWLEDGED, or live mode is not installed' },
  { code: EXIT_INTERRUPTED, meaning: 'interrupted — Ctrl-C at a prompt' },
]);

export const MAX_ATTEMPTS = 3;
export const LABEL_RULE = /^[a-z][a-z0-9_-]{0,31}$/;

export const NOTHING_SAVED = 'Nothing saved.';

export const labelExists = (label: string): string =>
  `LABEL_EXISTS — "${label}" already exists. Use instance set-credentials / set-preset to change `
  + 'it, instance remove to delete it, or --replace.';

export const authFailedRetry = (attempt: number): string =>
  `AUTHENTICATION_FAILED — wrong username or password. Re-enter? (attempt ${attempt} of `
  + `${MAX_ATTEMPTS}) [Y/n] `;

export const AUTH_EXHAUSTED =
  `AUTHENTICATION_FAILED after ${MAX_ATTEMPTS} attempts — nothing saved. Check the account in the `
  + 'instance (System Security › Users) and run the command again.';

export const NEXT_LINE =
  'Next: in Claude Code run  /snowarch setup-instance --resume  (or restart claude).';

export const AUTH_QUESTION = 'Authentication?';
export const AUTH_CHOICES: ReadonlyArray<{ key: 'basic' | 'oauth_ropc'; text: string }> = Object.freeze([
  { key: 'basic', text: 'username + password (recommended for PDI; no instance-side setup)' },
  // "legacy" is not a tone, it is the label D-04 and P-38 require: the grant is deprecated and
  // instances disable it, and a user choosing it should know that before they type a secret.
  { key: 'oauth_ropc', text: 'OAuth password grant (legacy; needs client id + secret AND a user '
    + 'password; instances can disable it)' },
]);

export interface AddOptions {
  label?: string;
  url?: string;
  environment?: string;
  auth?: 'basic' | 'oauth_ropc';
  username?: string;
  preset?: string;
  flags?: string;
  makeDefault?: boolean;
  global?: boolean;
  passwordStdin?: boolean;
  noProbes?: boolean;
  yes?: boolean;
  replace?: boolean;
  fromBootstrap?: boolean;
}

export interface AddIo extends ReviewIo {
  /** S01's masked prompt, injected so a test never needs a terminal. */
  secret: (label: string) => Promise<string>;
  io?: Io;
}

export interface AddResult {
  saved: boolean;
  exitCode: number;
  entry?: MaskedEntry;
  lastProbe?: LastProbe | null;
  message?: string;
}

/** What a caller may see of a saved entry: never the password, never the client secret. */
export interface MaskedEntry {
  url: string;
  environment: Environment;
  preset: string;
  flags: Flags;
  auth: { method: 'basic' | 'oauth_ropc'; username: string };
  toolPackage: string;
  maxRecords: number;
  prodWriteAck: boolean;
}

/**
 * `u` → `u***`. Enough to recognise the account, never enough to use it.
 *
 * A username is not a secret — it may be typed on the command line — but a masked summary is what
 * gets pasted into a ticket, and the full account name there is one more thing an attacker does
 * not have to guess.
 */
export const maskUsername = (username: string): string =>
  (username.length === 0 ? '' : `${username.slice(0, 1)}***`);

export function maskEntry(entry: StoreInstance): MaskedEntry {
  return {
    url: entry.url,
    environment: entry.environment,
    preset: entry.preset,
    flags: completeFlags(entry.flags),
    auth: { method: entry.auth.method, username: maskUsername(entry.auth.username) },
    toolPackage: entry.toolPackage,
    maxRecords: entry.maxRecords,
    prodWriteAck: entry.prodWriteAck,
  };
}

/** The probe line of the summary: enabled flags report, disabled ones read `off`. */
export function probeSummary(probe: LastProbe | null, flags: Flags, noProbes: boolean): string {
  if (noProbes) return 'Probes: skipped (--no-probes)';
  if (!probe) return 'Probes: not run';
  const field = { WRITE_ENABLED: 'write', CMDB_WRITE_ENABLED: 'cmdb', SCRIPTING_ENABLED: 'scripting',
    ATF_ENABLED: 'atf', NOW_ASSIST_ENABLED: 'nowAssist', FLUENT_ENABLED: 'fluent' } as const;
  const parts = [`auth ${probe.auth}`];
  for (const flag of FLAG_NAMES) {
    const label = flag.replace(/_ENABLED$/, '').toLowerCase();
    parts.push(flags[flag] === 'true'
      ? `${label} ${probe[field[flag]]}`
      : `${flag.replace(/_ENABLED$/, '')} off`);
  }
  return `Probes: ${parts.join(' · ')}.`;
}

export const savedLine = (label: string, entry: MaskedEntry, isDefault: boolean): string =>
  `Saved instance "${label}" (${entry.environment} · ${entry.auth.method} · preset ${entry.preset}`
  + `${isDefault ? ' · default' : ''}).`;

export const storeLine = (path: string, platform: NodeJS.Platform = process.platform): string =>
  (platform === 'win32'
    ? `Store: ${path} (file modes: ACL-inherited (Windows))`
    : `Store: ${path} (mode 0600, dir 0700)`);

/** Parse and validate; every refusal here is exit 2 and happens before anything is asked. */
export function parseAddArgs(argv: readonly string[]): { ok: true; options: AddOptions } | { ok: false; message: string } {
  const options: AddOptions = {};
  const rest = [...argv];
  const takeValue = (): string | null => {
    const value = rest.shift();
    return value === undefined || value.startsWith('--') ? null : value;
  };

  while (rest.length > 0) {
    const arg = rest.shift() as string;
    if (!arg.startsWith('--')) {
      if (options.label !== undefined) return { ok: false, message: `unexpected argument "${arg}"` };
      options.label = arg;
      continue;
    }
    const [name, inline] = arg.slice(2).split('=', 2);
    const value = () => (inline !== undefined ? inline : takeValue());
    switch (name) {
      case 'url': { const v = value(); if (!v) return { ok: false, message: '--url needs a value' }; options.url = v; break; }
      case 'env': { const v = value(); if (!v) return { ok: false, message: '--env needs a value' }; options.environment = v; break; }
      case 'auth': {
        const v = value();
        if (v !== 'basic' && v !== 'oauth_ropc') return { ok: false, message: '--auth must be basic or oauth_ropc' };
        options.auth = v; break;
      }
      case 'username': { const v = value(); if (!v) return { ok: false, message: '--username needs a value' }; options.username = v; break; }
      case 'preset': { const v = value(); if (!v) return { ok: false, message: '--preset needs a value' }; options.preset = v; break; }
      case 'flags': { const v = value(); if (!v) return { ok: false, message: '--flags needs a value' }; options.flags = v; break; }
      case 'default': options.makeDefault = true; break;
      case 'global': options.global = true; break;
      case 'password-stdin': options.passwordStdin = true; break;
      case 'no-probes': options.noProbes = true; break;
      case 'yes': options.yes = true; break;
      case 'replace': options.replace = true; break;
      case 'from-bootstrap': options.fromBootstrap = true; break;
      default: return { ok: false, message: `unknown option --${name}` };
    }
  }

  if (options.label === undefined) return { ok: false, message: 'instance add needs a label' };
  if (!LABEL_RULE.test(options.label)) {
    return { ok: false, message: `"${options.label}" is not a valid label — lower case, starting `
      + 'with a letter, up to 32 characters of a-z 0-9 _ -' };
  }
  if (options.preset !== undefined && options.flags !== undefined) {
    return { ok: false, message: '--preset and --flags say the same thing two ways; pass one' };
  }
  if (options.environment !== undefined
    && !(ENVIRONMENTS as readonly string[]).includes(options.environment)) {
    return { ok: false, message: `--env must be one of ${ENVIRONMENTS.join(', ')}` };
  }
  return { ok: true, options };
}

export interface AddDeps {
  storePath?: string;
  makeClient?: (entry: { url: string; auth: StoreInstance['auth'] }) => ProbeClient;
  probe?: typeof probeAll;
  reachability?: typeof probeReachability;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
}

const defaultClient = (entry: { url: string; auth: StoreInstance['auth'] }): ProbeClient =>
  new ServiceNowClient({
    instanceUrl: entry.url,
    authMethod: entry.auth.method === 'basic' ? 'basic' : 'oauth',
    // ONE request per probe, ever — S03's rule, restated at the construction site because this is
    // where a future edit would be tempted to "just add a retry".
    maxRetries: 0,
    requestTimeoutMs: 15_000,
    ...(entry.auth.method === 'basic'
      ? { basic: { username: entry.auth.username, password: entry.auth.password } }
      : { oauth: { username: entry.auth.username, password: entry.auth.password,
        clientId: entry.auth.clientId, clientSecret: entry.auth.clientSecret } }),
  }) as unknown as ProbeClient;

/**
 * The whole command. Seven steps, and every one of them can end it.
 */
export async function runAdd(options: AddOptions, io: AddIo, deps: AddDeps = {}): Promise<AddResult> {
  const env = deps.env ?? process.env;
  const platform = deps.platform ?? process.platform;
  // `resolveStorePath()` answers "which store would the SERVER read" and can legitimately say
  // "none" — a checkout with no store yet. Writing the per-checkout path in that case is the
  // whole point of `instance add`; using a second resolver would be how the wizard writes one
  // file and the server reads another.
  const storePath = deps.storePath ?? resolveStorePath().path ?? projectStorePath();
  const label = options.label as string;

  // The store is read FIRST, so a duplicate label costs nobody a password.
  const existing = loadStore(storePath);
  const store: Store = 'store' in existing
    ? existing.store
    : { version: 1, instances: {} } as Store;
  if ('store' in existing && store.instances[label] && !options.replace) {
    io.write(`${labelExists(label)}\n`);
    return { saved: false, exitCode: EXIT_USAGE, message: labelExists(label) };
  }

  // A POLICY REFUSAL THAT THE ARGUMENTS ALREADY DECIDE HAPPENS FIRST.
  //
  // `--env prod --preset full --yes` cannot end any way but exit 3, so asking for a password and
  // spending a network round trip on the way there costs the user two things for nothing — and
  // sends one login attempt at a production instance that was never going to be saved. The
  // interactive path keeps the refusal at the flags step, where there is somebody to offer the
  // read-only save to. (Found by the spawned-CLI test, which exited 1 on a DNS failure before it
  // could reach the policy at all.)
  if (options.yes && options.environment === 'prod') {
    const raised = options.preset !== undefined
      ? options.preset !== 'read-only'
      : options.flags !== undefined
        ? /=\s*(on|true)/i.test(options.flags)
        : false;
    if (raised) {
      const message = prodRefusal(label);
      io.write(`${message}\n`);
      return { saved: false, exitCode: EXIT_POLICY, message };
    }
  }

  // ── [1/6] the URL ────────────────────────────────────────────────────────────────────────
  io.write('[1/6] Instance URL\n');
  let url = options.url;
  if (url === undefined) {
    if (options.yes) {
      const message = 'URL_REQUIRED — pass --url <origin> (a URL cannot be proposed).';
      io.write(`${message}\n`);
      return { saved: false, exitCode: EXIT_USAGE, message };
    }
    url = (await io.ask('Instance URL: ')) ?? '';
  }
  const normalised = normalizeInstanceUrl(String(url ?? ''));
  if (!normalised.ok) {
    io.write(`${normalised.message}\n`);
    return { saved: false, exitCode: EXIT_USAGE, message: normalised.message };
  }
  for (const note of normalised.notes) io.write(`  ${note}\n`);
  if (normalised.proposed && !options.yes) {
    io.write(`Proposed URL: ${normalised.url} — Enter to accept, or type the full URL\n`);
    const typed = (await io.ask('> ')) ?? '';
    if (typed.trim() !== '') {
      const again = normalizeInstanceUrl(typed);
      if (!again.ok) {
        io.write(`${again.message}\n`);
        return { saved: false, exitCode: EXIT_USAGE, message: again.message };
      }
      normalised.url = again.url;
    }
  }
  const instanceUrl = normalised.url;

  // ── [2/6] the environment, then the network ──────────────────────────────────────────────
  io.write('[2/6] Environment\n');
  const environment = await resolveEnvironment({
    url: instanceUrl,
    ...(options.environment ? { env: options.environment } : {}),
    ...(options.yes ? { yes: true } : {}),
    ...(options.yes ? {} : { ask: async () => askEnvironment(io) }),
  });
  if (!environment.ok) {
    io.write(`${environment.message}\n`);
    return { saved: false, exitCode: EXIT_USAGE, message: environment.message as string };
  }

  // ONCE PER RUN, whether the probe succeeds or not: "it worked" and "it worked through a proxy
  // with a corporate CA" are different facts, and only one explains a colleague's failure.
  io.write(`${describeNetworkEnv(env)}\n`);
  const reach = await (deps.reachability ?? probeReachability)(instanceUrl, { env });
  if (!reach.ok) {
    for (const line of formatFailure(reach)) io.write(`${line}\n`);
    const choice = options.yes ? 'abort' : await askMenu(io);
    if (choice !== 'retry') {
      io.write(`${NOTHING_SAVED}\n`);
      return { saved: false, exitCode: EXIT_FAILED, message: NOTHING_SAVED };
    }
    const again = await (deps.reachability ?? probeReachability)(instanceUrl, { env });
    if (!again.ok) {
      for (const line of formatFailure(again)) io.write(`${line}\n`);
      io.write(`${NOTHING_SAVED}\n`);
      return { saved: false, exitCode: EXIT_FAILED, message: NOTHING_SAVED };
    }
  }

  // ── [3/6] and [4/6]: how to authenticate, and with what ──────────────────────────────────
  let method: 'basic' | 'oauth_ropc' = options.auth ?? 'basic';
  if (options.auth === undefined && !options.yes) {
    io.write(`[3/6] Authentication\n${AUTH_QUESTION}\n`);
    for (const [i, choice] of AUTH_CHOICES.entries()) {
      io.write(`  [${i + 1}] ${choice.key} — ${choice.text}\n`);
    }
    const answer = ((await io.ask('> ')) ?? '').trim();
    method = answer === '2' ? 'oauth_ropc' : 'basic';
  }

  let attempt = 1;
  let auth: StoreInstance['auth'] | null = null;
  let probeResult: { auth: AuthProbe; last: LastProbe | null } | null = null;

  for (;;) {
    io.write(`[4/6] Credentials\n`);
    const credentials = await readCredentials(method, options, io, attempt);
    if (!credentials) {
      io.write(`${NOTHING_SAVED}\n`);
      return { saved: false, exitCode: EXIT_FAILED, message: NOTHING_SAVED };
    }
    auth = credentials;

    io.write('[5/6] Probing\n');
    if (options.noProbes) { probeResult = { auth: { status: 'ok' }, last: null }; break; }

    const client = (deps.makeClient ?? defaultClient)({ url: instanceUrl, auth });
    const all = await (deps.probe ?? probeAll)(client, { username: auth.username, authMethod: method, env });
    if (all.auth.status === 'ok') { probeResult = { auth: all.auth, last: toLastProbe(all) }; break; }

    if (all.auth.status === 'unreachable') {
      io.write(`${all.auth.detail ?? 'the instance could not be reached'}\n${NOTHING_SAVED}\n`);
      return { saved: false, exitCode: EXIT_FAILED, message: NOTHING_SAVED };
    }

    // OAuth's own two answers: the client is wrong, or the grant is switched off. Neither is a
    // wrong password, so neither costs an attempt — but both end the run unless basic is taken.
    if (all.auth.code === 'OAUTH_ROPC_DISABLED' || all.auth.code === 'OAUTH_CLIENT_INVALID') {
      io.write(`${all.auth.hint ?? all.auth.code}\n`);
      const switchToBasic = options.yes || options.passwordStdin
        ? false
        : !isNo(await io.ask('Switch to basic authentication? [Y/n] '));
      if (!switchToBasic) {
        io.write(`${NOTHING_SAVED}\n`);
        return { saved: false, exitCode: EXIT_FAILED, message: NOTHING_SAVED };
      }
      method = 'basic';
      continue;                                   // the URL is kept; the credentials are asked again
    }

    // A wrong password and a missing role share the counter: both mean "this account, as given,
    // cannot be used", and a fourth try of either is an account closer to a lockout.
    if (options.passwordStdin || options.yes) {
      // No re-entry without a terminal: the same wrong credential sent again is noise in the
      // instance's audit log and, on some configurations, a lockout.
      io.write(`${all.auth.status === 'role missing' ? all.auth.hint : 'AUTHENTICATION_FAILED — wrong username or password.'}\n${NOTHING_SAVED}\n`);
      return { saved: false, exitCode: EXIT_FAILED, message: NOTHING_SAVED };
    }
    if (attempt >= MAX_ATTEMPTS) {
      io.write(`${AUTH_EXHAUSTED}\n`);
      return { saved: false, exitCode: EXIT_FAILED, message: AUTH_EXHAUSTED };
    }
    const again = all.auth.status === 'role missing'
      ? await askRoleMissing(io, all.auth)
      : !isNo(await io.ask(authFailedRetry(attempt + 1)));
    if (!again) {
      io.write(`${NOTHING_SAVED}\n`);
      return { saved: false, exitCode: EXIT_FAILED, message: NOTHING_SAVED };
    }
    attempt += 1;
  }

  // ── [6/6] the flags ──────────────────────────────────────────────────────────────────────
  io.write('[6/6] Permissions\n');
  const decision = await resolveFlags({
    label,
    environment: environment.environment as Environment,
    ...(options.preset ? { preset: options.preset } : {}),
    ...(options.flags ? { flags: options.flags } : {}),
    ...(options.yes ? { yes: true } : {}),
    ...(probeResult?.last ? { probes: probeResult.last } : {}),
    ...(options.yes ? {} : { io }),
  });
  if (!decision.ok) {
    io.write(`${decision.message}\n`);
    return { saved: false, exitCode: decision.exitCode ?? EXIT_FAILED, message: decision.message as string };
  }
  io.write(`${decision.applying}\n`);

  // ── the save ─────────────────────────────────────────────────────────────────────────────
  const firstEver = Object.keys(store.instances).length === 0;
  let isDefault = options.makeDefault === true || firstEver;
  if (!options.makeDefault && !firstEver && !options.yes) {
    isDefault = !isNo(await io.ask(`Make "${label}" the default instance for this checkout? [Y/n] `));
  }

  const entry = {
    url: instanceUrl,
    environment: environment.environment as Environment,
    auth,
    preset: decision.preset as StoreInstance['preset'],
    flags: completeFlags(decision.flags as Flags),
    ...ENTRY_DEFAULTS,
    prodWriteAck: false,
  } as StoreInstance;

  const next: Store = {
    version: store.version ?? 1,
    ...(isDefault ? { defaultInstance: label } : store.defaultInstance ? { defaultInstance: store.defaultInstance } : {}),
    instances: { ...store.instances, [label]: entry },
  } as Store;
  saveStore(storePath, next);

  const masked = maskEntry(entry);
  io.write(`${savedLine(label, masked, isDefault)} `
    + `${probeSummary(probeResult?.last ?? null, masked.flags, options.noProbes === true)}\n`);
  io.write(`${storeLine(storePath, platform)}\n`);
  if (!options.fromBootstrap) io.write(`${NEXT_LINE}\n`);

  return { saved: true, exitCode: EXIT_OK, entry: masked, lastProbe: probeResult?.last ?? null };
}

/**
 * The programmatic entry ARC-06-S07's `--instance-file` path can call.
 *
 * Everything is supplied, nothing is asked: `yes: true` is implied, and the `io` is whatever the
 * caller wants the lines written to. The return carries a MASKED entry — a caller that wanted the
 * password already had it.
 */
export async function addInstance(opts: Omit<AddOptions, 'auth' | 'username'> & {
  auth: StoreInstance['auth'];
}, io: AddIo, deps: AddDeps = {}): Promise<AddResult> {
  const { auth, ...rest } = opts;
  return runAdd({ ...rest, yes: true, username: auth.username, auth: auth.method },
    // The caller already has both secrets; this hands them to the same prompt seam the
    // interactive path uses, so there is one credential path rather than two.
    { ...io,
      secret: async (prompt) => (prompt.toLowerCase().includes('client')
        ? ('clientSecret' in auth ? auth.clientSecret : '')
        : auth.password) },
    deps);
}

/** `--help`, from the same table the behaviour uses. */
export function addHelp(): string {
  const lines = [
    'usage: snowarch instance add <label> [options]',
    '',
    '  --url <origin>            the instance origin, https only',
    `  --env ${ENVIRONMENTS.join('|')}   which environment this is`,
    '  --auth basic|oauth_ropc   how to authenticate (basic is proposed)',
    '  --username <name>         the account (a username is not a secret)',
    '  --preset <name>           read-only | pdi-developer | full | custom',
    '  --flags <list>            all six, e.g. WRITE=on,CMDB_WRITE=on,…  (instead of --preset)',
    '  --default                 make this the default instance',
    '  --password-stdin          read the password (and client secret) from stdin',
    '  --no-probes               skip the capability probes (CI fixtures)',
    '  --yes                     accept every proposal; no questions',
    '  --replace                 overwrite an existing label',
    '',
    'secrets are never accepted as arguments — the prompt or --password-stdin',
    '',
    'exit codes:',
  ];
  for (const { code, meaning } of EXIT_CODES) lines.push(`  ${code}  ${meaning}`);
  return lines.join('\n');
}

const isNo = (answer: string | null): boolean =>
  ['n', 'no'].includes(String(answer ?? '').trim().toLowerCase());

async function askEnvironment(io: AddIo): Promise<string> {
  for (;;) {
    io.write(`What is this instance?  ${ENVIRONMENTS.map((e, i) => `[${i + 1}] ${e}`).join('  ')}\n`);
    const answer = ((await io.ask('> ')) ?? '').trim().toLowerCase();
    const byNumber = ENVIRONMENTS[Number(answer) - 1];
    if (byNumber) return byNumber;
    if ((ENVIRONMENTS as readonly string[]).includes(answer)) return answer;
    // No default: `pdi` is right often enough to be tempting and wrong in exactly the case that
    // matters, because the environment decides which preset a write is checked against.
  }
}

async function askMenu(io: AddIo): Promise<string> {
  const menu = reachabilityMenu();
  for (const [i, option] of menu.entries()) io.write(`  [${i + 1}] ${option.text}\n`);
  const answer = ((await io.ask('> ')) ?? '').trim();
  return menu[Number(answer) - 1]?.key ?? 'abort';
}

async function askRoleMissing(io: AddIo, auth: AuthProbe): Promise<boolean> {
  io.write(`${auth.hint ?? 'the account cannot read sys_user over REST'}\n`);
  // Default N: the account may be exactly the one the user meant, and the answer is a role change
  // in the instance rather than a different password.
  const answer = ((await io.ask('Try a different account? [y/N] ')) ?? '').trim().toLowerCase();
  return answer === 'y' || answer === 'yes';
}

/** The credentials for one attempt, or null when the user gave up. */
async function readCredentials(
  method: 'basic' | 'oauth_ropc',
  options: AddOptions,
  io: AddIo,
  attempt: number,
): Promise<StoreInstance['auth'] | null> {
  // The caller's streams, never `process.stdin` implicitly: a test that did not own the stream
  // would hang on a pipe nobody closes, which is exactly what happened the first time.
  const fromStdin = options.passwordStdin && attempt === 1
    ? await readSecretFromStdin(io.io ? { io: io.io } : {})
    : null;

  const username = options.username ?? (await io.ask('Username: ')) ?? '';
  if (username.trim() === '') return null;

  const password = fromStdin ? (fromStdin[0] ?? '') : await io.secret('Password:');
  if (!password) return null;

  if (method === 'basic') return { method, username, password };

  // The client id is an IDENTIFIER and is echoed; the secret is not.
  const clientId = ((await io.ask('Client ID: ')) ?? '').trim();
  const clientSecret = fromStdin ? (fromStdin[1] ?? '') : await io.secret('Client secret:');
  return { method, username, password, clientId, clientSecret };
}

/** Exported for the forwarder's precondition test — the CLI path the engine spawns. */
export const CLI_RELATIVE = 'packages/snowarch/dist/cli/index.js';

/** True when the server's runtime dependencies are installed beside the built CLI. */
export const serverDepsInstalled = (packageDir: string): boolean =>
  existsSync(`${packageDir}/node_modules/@modelcontextprotocol/sdk/package.json`);
