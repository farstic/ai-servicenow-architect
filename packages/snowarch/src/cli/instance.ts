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
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { CANCELLED,EXIT_INTERRUPTED, EXIT_USAGE, readSecretFromStdin, type Io } from './tty.js';

// Re-exported so the exit-code table has ONE home: `instance-command.ts` and the tests read the
// same constants the behaviour uses, rather than importing 2 from one file and 0 from another.
export { EXIT_USAGE, EXIT_INTERRUPTED };
import { proposeEnvironment, ENVIRONMENTS, normalizeInstanceUrl, resolveEnvironment, type Environment } from './url.js';
import { remedyFor } from '../errors/codes.js';
import { wrapRow,
  applyingLine, dependencyViolation, ENTRY_DEFAULTS, labelOf, prodRefusal, resolveFlags,
  toggleFlag, type ReviewIo,
} from './preset-ui.js';
import {
  combinedListJson, listAllTable, listJson, listTable, otherStoreFooter, precedenceNote,
  probesJson, storeLabelFor, type StoreLabel,
} from './format.js';
import { appendAudit, type CliAuditEntry } from '../audit/writer.js';
import { CORE_TOOLS_UNCONFIGURED } from '../tools/status.js';
import {
  detectCloudSync, globalStorePath, maskPath, maskUsername, type StoreSource,
} from '../store/paths.js';
import { describeNetworkEnv, formatFailure, probeReachability, reachabilityMenu } from '../servicenow/reachability.js';
import { fillMeaning, fillRemedy } from '../servicenow/net-errors.js';
import { probeAll, PROBE_FIELDS, toLastProbe, type AuthProbe, type LastProbe,
  type ProbeClient } from '../servicenow/probes.js';
import { probeClientFor, probeOptionsFor } from '../servicenow/probe-client.js';
import { loadStore, projectStorePath, resolveStorePath, saveStore } from '../store/index.js';
import { STORE_VERSION, completeFlags, type Store, type StoreInstance } from '../store/schema.js';
import { FLAG_NAMES, matchPreset, type FlagName, type Flags } from '../utils/permissions.js';

export const EXIT_OK = 0;
export const EXIT_FAILED = 1;
export const EXIT_POLICY = 3;

/**
 * What each code means when THIS command produces it. One table, printed by `--help`, so the
 * help and the behaviour cannot describe different programs.
 */
export const EXIT_CODES: ReadonlyArray<{ code: number; meaning: string }> = Object.freeze([
  { code: EXIT_OK, meaning: 'done — saved, listed, or every probe answered ok' },
  { code: EXIT_FAILED, meaning: 'nothing saved — a refusal, an abort, three failed attempts, or a probe that failed' },
  { code: EXIT_USAGE, meaning: 'usage — a bad flag, LABEL_EXISTS, LABEL_NOT_FOUND, ENV_REQUIRED, URL_REQUIRED' },
  { code: EXIT_POLICY, meaning: 'policy — PROD_WRITE_NOT_ACKNOWLEDGED, a label that did not match, or live mode is not installed' },
  { code: EXIT_INTERRUPTED, meaning: 'interrupted — Ctrl-C at a prompt' },
]);

export const MAX_ATTEMPTS = 3;
export const LABEL_RULE = /^[a-z][a-z0-9_-]{0,31}$/;

export const NOTHING_SAVED = 'Nothing saved.';

/**
 * The duplicate-label refusal, rendered FROM the registry.
 *
 * `LABEL_EXISTS` shipped as a bare literal: a code with no registry entry, so `docs/TROUBLESHOOTING.md`
 * documented every other failure of this command and not this one, and the remedy lived only here.
 * The registry is the single source; only the label, which no registry entry can hold, is added.
 */
export const labelExists = (label: string): string => {
  const remedy = remedyFor('LABEL_EXISTS').remedy;
  return `LABEL_EXISTS — "${label}" already exists. ${remedy.charAt(0).toUpperCase()}${remedy.slice(1)}.`;
};

/**
 * The 401 re-entry question, with its REASON rendered from the registry.
 *
 * It used to say "wrong username or password" — narrower than the registry's "wrong, expired, or
 * the account is locked", and a second definition of one condition, which is the thing the registry
 * exists to prevent. A tester who read the wizard learned one set of causes and a tester who read
 * `docs/TROUBLESHOOTING.md` learned another, and the account-locked case — the one that matters
 * most, because retrying makes it worse — was only in the second. Ruled by the ARC-08-S10 review;
 * the pattern is `labelExists()`'s, three lines up.
 *
 * The question is the wizard's own: only the terminal is in a position to offer another attempt.
 */
export const authFailedRetry = (attempt: number): string =>
  `AUTHENTICATION_FAILED — ${authFailedReason()} Re-enter? (attempt ${attempt} of `
  + `${MAX_ATTEMPTS}) [Y/n] `;

/** The registry's sentence, used by the re-entry question and by the nothing-saved line. */
export const authFailedReason = (): string => remedyFor('AUTHENTICATION_FAILED').meaning;

/**
 * The label prompt's exhausted line (ARC-07-C10), shaped like `AUTH_EXHAUSTED` because it is the
 * same event: an interactive answer the wizard asked for, refused, re-asked, and did not get.
 */
export const LABEL_EXHAUSTED =
  `No valid label after ${MAX_ATTEMPTS} attempts — nothing saved. The rule is lower case, starting `
  + 'with a letter, up to 32 characters of a-z 0-9 _ -; run the command again when you have one.';

export const AUTH_EXHAUSTED =
  `AUTHENTICATION_FAILED after ${MAX_ATTEMPTS} attempts — nothing saved. Check the account in the `
  + 'instance (System Security › Users) and run the command again.';

/**
 * The URL prompt's exhausted line (ARC-07-W2) — the third of the family, shaped like the other two.
 *
 * The family matters more than the sentence: all three are "the wizard asked, refused, re-asked and
 * did not get an answer", all three end the run at `EXIT_FAILED`, and `EXIT_CODES` already documents
 * that as *"nothing saved — a refusal, an abort, three failed attempts"*. So no new exit code and no
 * new constant for the count; the loop the prompt beside it already had.
 */
/**
 * ARC-07-W4 — ONE NUMBERED QUESTION, for every question that has a list of answers.
 *
 * THE PERMISSIONS SCREEN'S SEMANTICS, DELIBERATELY NOT ITS CODE. `resolveFlagAnswer` and the plan
 * screen's `resolveChoice` already settle this grammar — a number, or the value's own name, and Enter
 * accepts what is marked — and the plan screen's copy lives in the ENGINE, which this package must not
 * import and which must not import this. So the rule is re-stated here and the shape is asserted to
 * match, which is the same trade this repository already makes for the review screen.
 *
 * The option list prints ONCE. A wrong answer prints WHY and returns to the `> ` prompt; it does not
 * reprint the question, which is what made the environment question look frozen (ARC-07-W5).
 */
export interface Option { readonly key: string; readonly text: string; readonly aliases?: readonly string[] }

/** `"production" is not one of [1] pdi  [2] dev  [3] test  [4] prod` */
export const notOneOf = (answer: string, options: readonly Option[]): string =>
  `"${answer}" is not one of ${options.map((o, i) => `[${i + 1}] ${o.key}`).join('  ')}`;

/**
 * A number, the option's own name, one of its aliases, or Enter when something is marked default.
 *
 * `undefined` means "not one of them" — the same three-way answer `resolveFlagAnswer` gives, so a
 * caller cannot confuse "they chose nothing" with "they chose wrongly". A question with NO default
 * treats Enter as a wrong answer on purpose: `askEnvironment` has carried that decision in a comment
 * since it was written, because the environment decides which preset a write is checked against.
 */
export function resolveOption<T extends Option>(input: string | null, options: readonly T[],
  defaultKey?: string): T | undefined {
  const answer = String(input ?? '').trim().toLowerCase();
  if (answer === '') return defaultKey ? options.find((o) => o.key === defaultKey) : undefined;
  // The digits are checked before the lookup: `Number('basic')` is NaN, and an index built from it
  // would be a silent miss rather than a name match.
  if (/^\d+$/.test(answer)) return options[Number(answer) - 1];
  return options.find((o) => o.key.toLowerCase() === answer
    || (o.aliases ?? []).some((a) => a.toLowerCase() === answer));
}

/**
 * Ask it, list the options once, re-ask until one of them is chosen, then say what was chosen.
 *
 * The default's marker is DERIVED from `defaultKey` and never written into an option's text — the
 * ARC-07-C14 rule, for the same reason: a marker spelled in the words drifts the day the default
 * moves. It is appended with ` · ` rather than folded into the text's own parenthesis, which would
 * nest one bracket inside another.
 */
async function askOption<T extends Option>(io: AddIo, question: string, options: readonly T[],
  opts: { defaultKey?: string; ack: (chosen: T) => string }): Promise<T | null> {
  io.write(`${question}\n`);
  for (const [i, option] of options.entries()) {
    const marked = option.key === opts.defaultKey ? ' · Enter picks this' : '';
    // WRAPPED AT THE BUDGET, in the one place option rows are rendered. The `oauth_ropc` row is 120
    // columns and WAS 120 before this row — the text is unchanged — but this is now the code that
    // prints it, and 100 columns is a hard constraint rather than a preference. `wrapRow` is the
    // repository's own definition of folding (it folds rather than truncates, deliberately: the part
    // a truncation removes is the part that says what to do), so W5's environment meanings and any
    // later wording row inherit this instead of each retrofitting it.
    for (const line of wrapRow(`  [${i + 1}] ${option.key} — `, `${option.text}${marked}`)) {
      io.write(`${line}\n`);
    }
  }
  for (;;) {
    const typed = await io.ask('> ');
    if (typed === null) return null;                     // EOF, as everywhere else in this file
    const chosen = resolveOption(typed, options, opts.defaultKey);
    if (chosen) {
      io.write(`${opts.ack(chosen)}\n`);
      return chosen;
    }
    io.write(`${notOneOf(String(typed).trim(), options)}\n`);
  }
}

/**
 * ARC-07-W3 — the credential prompts, and what a non-answer is told.
 *
 * `Username: ` did not say WHOSE account — the instance's, or this machine's — and an empty answer
 * ended the run. Worse, an empty answer was the prompt's ONLY exit, so abandoning the wizard and
 * pressing Enter by mistake were the same gesture and neither could be told from the other.
 *
 * `q` IS THE USERNAME'S EXIT AND NOT THE PASSWORD'S. A password may legitimately BE `q`, and the
 * prompt is invisible: a user whose password is `q` would be told nothing was saved with no way to
 * see why. So the password names Ctrl-C, which `promptSecret` already handles by ending the process.
 */
export const USERNAME_PROMPT = 'Username (a ServiceNow user on this instance — admin on a PDI): ';
export const USERNAME_REQUIRED =
  'Username is required — type the account name, or q to abandon the wizard (nothing is saved)';
export const CLIENT_ID_PROMPT = 'Client ID: ';
export const CLIENT_ID_REQUIRED =
  'Client ID is required for OAuth — type it, or q to abandon the wizard (nothing is saved)';
export const PASSWORD_PROMPT = 'Password (nothing is shown while you type):';
export const PASSWORD_REQUIRED =
  'Password is required — type it, or press Ctrl-C to abandon the wizard (nothing is saved)';

/**
 * ARC-07-W2 — the prompt SAYS THE SHAPE, so the first answer is likelier to be right.
 *
 * `Instance URL: ` named the thing and not the form of it, and the two commonest wrong answers are
 * a browser URL with a path and an `http://` one. Both are refused with a good message; neither
 * needed to happen.
 */
export const URL_PROMPT = 'Instance URL (https://<host>, no path): ';

export const URL_EXHAUSTED =
  `No valid URL after ${MAX_ATTEMPTS} attempts — nothing saved. Enter the instance origin, `
  + 'e.g. https://dev123456.service-now.com, and run the command again.';

/**
 * The reachability bound's exhausted line (ARC-07-W2, at the architect's request on W1).
 *
 * ARC-07-W1 bounded the probe loop at three rounds and ended it with the bare `Nothing saved.`, which
 * says what happened and not why it stopped. It REPLACES `NOTHING_SAVED` rather than preceding it,
 * because that is what the two siblings above do — the goal was that the exhaustion paths read alike,
 * and two consecutive lines both saying "nothing saved" would not. An explicit `[3] abort` still
 * prints `NOTHING_SAVED`: that is a decision, not an exhaustion.
 */
export const REACH_EXHAUSTED =
  `No reachable host after ${MAX_ATTEMPTS} attempts — nothing saved. Check the host name, and the `
  + 'network or proxy if the name is right, then run the command again.';

export const NEXT_LINE =
  'Next: in Claude Code run  /snowarch setup-instance --resume  (or restart claude).';

export const AUTH_QUESTION = 'Authentication?';
/**
 * ARC-07-W5 — what each environment MEANS, in the words a first-time reader needs.
 *
 * `pdi` is undefined to somebody who has not met ServiceNow's developer programme, and the reason the
 * answer matters — production is saved read-only — surfaced four steps later at `[6/6]`, where it
 * reads as a surprise rather than as the consequence of a choice already made.
 *
 * TWO LISTS, HELD TOGETHER BY A TEST. `ENVIRONMENTS` decides what exists and this decides what each
 * one means; a test asserts they are the same keys in the same order, so a fifth environment cannot
 * arrive with no words or leave one behind.
 */
export const ENV_CHOICES: ReadonlyArray<Option> = Object.freeze([
  { key: 'pdi', text: 'your personal developer instance (devNNNNNN.service-now.com)' },
  { key: 'dev', text: 'a shared development instance' },
  { key: 'test', text: 'a test / UAT instance' },
  { key: 'prod', text: 'real users; the wizard saves it read-only' },
]);

export const ENV_QUESTION = 'What is this instance?';

export const AUTH_CHOICES: ReadonlyArray<
{ key: 'basic' | 'oauth_ropc'; text: string; aliases?: readonly string[] }> = Object.freeze([
  { key: 'basic', text: 'username + password (recommended for PDI; no instance-side setup)' },
  // "legacy" is not a tone, it is the label D-04 and P-38 require: the grant is deprecated and
  // instances disable it, and a user choosing it should know that before they type a secret.
  // `oauth` is the word a reader types for it (ARC-07-W4). An alias rather than a second option:
  // the list shows one name per row, and the grammar accepts the short form people reach for.
  { key: 'oauth_ropc', aliases: ['oauth'], text: 'OAuth password grant (legacy; needs client id + '
    + 'secret AND a user password; instances can disable it)' },
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
  json?: boolean;
  yes?: boolean;
  replace?: boolean;
  fromBootstrap?: boolean;
}

export interface AddIo extends ReviewIo {
  /** S01's masked prompt, injected so a test never needs a terminal. */
  secret: (label: string) => Promise<string>;
  io?: Io;
  /**
   * Is there a terminal to ask a question on? (ARC-07-C2)
   *
   * Injected rather than read from `process.stdin` at the point of use, for the reason every other
   * terminal fact in this file is injected: a test that had to own a TTY to exercise the prompt
   * path would not be run, and the path would go unexercised — which is exactly how the missing
   * label reached an owner's machine.
   */
  isTty?: boolean;
}

export interface AddResult {
  saved: boolean;
  exitCode: number;
  entry?: MaskedEntry;
  lastProbe?: LastProbe | null;
  message?: string;
  /** The cloud-sync WARN, when there was one — kept whether the run saved or declined. */
  warnings?: string[];
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
 * ARC-04-S02's masker, re-exported rather than reimplemented.
 *
 * S05 wrote a second one here that dropped the domain — `c***` where the store's own says
 * `c***@corp.com` — so `list` and the wizard's summary would have masked the same account two
 * ways. A username is not a secret, but the full account name in a pasted summary is one more
 * thing an attacker does not have to guess, and one masker is what makes that claim checkable.
 */
export { maskUsername };

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

/**
 * The probe line of the summary: enabled flags report, disabled ones read `off`.
 *
 * ARC-07-C6 — the order and the names come from `PROBE_FIELDS` now, which `instance list`'s table
 * also reads. This function kept its own copy of the flag-to-field map, and the table kept a third
 * spelling; one definition is what stops a seventh capability from reaching one surface and not
 * the other.
 *
 * What stays here is the only thing that is this line's own: a DISABLED flag reads `off` instead of
 * its probe result, because the wizard is reporting the choice just made rather than the instance.
 */
export function probeSummary(probe: LastProbe | null, flags: Flags, noProbes: boolean): string {
  if (noProbes) return 'Probes: skipped (--no-probes)';
  if (!probe) return 'Probes: not run';
  const parts = PROBE_FIELDS.map(({ label, key, flag }) => {
    if (flag === null) return `${label} ${probe[key]}`;
    return flags[flag] === 'true' ? `${label} ${probe[key]}` : `${label.toUpperCase()} off`;
  });
  return `Probes: ${parts.join(' · ')}.`;
}

export const savedLine = (label: string, entry: MaskedEntry, isDefault: boolean): string =>
  `Saved instance "${label}" (${entry.environment} · ${entry.auth.method} · preset ${entry.preset}`
  + `${isDefault ? ' · default' : ''}).`;

/**
 * `Store: ~/checkout/.local/instances.json (mode 0600, dir 0700)`
 *
 * ARC-08-C23 — MASKED, like every other path this CLI prints. It was the one that was not:
 * `precedenceNote` in `format.ts` sends its two store paths through `maskPath`, `listJson` masks
 * the store it reports, the audit writer masks the file it could not open — and this line, the one
 * in the block a user pastes when an install goes wrong, printed the absolute path with the
 * account name in it. One surface, two redaction levels, and the leakier one was on the line most
 * likely to be quoted.
 */
export const storeLine = (path: string, platform: NodeJS.Platform = process.platform): string => {
  // ARC-08-C23 — the mask follows the PLATFORM ARGUMENT, not the running process. The line already
  // renders the Windows mode sentence when told `win32`; masking with POSIX rules at the same time
  // meant a function that had been given a platform honoured it in one half and ignored it in the
  // other — and it is the half that decides whether an account name reaches the screen.
  const masked = maskPath(path, { sepChar: platform === 'win32' ? '\\' : '/' });
  return platform === 'win32'
    ? `Store: ${masked} (file modes: ACL-inherited (Windows))`
    : `Store: ${masked} (mode 0600, dir 0700)`;
};

/**
 * Why `[3/6]` did not ask. Named from what was actually observed, never a default sentence.
 *
 * `--auth` and `--yes` are two different reasons a question goes unasked, and a reader deciding
 * whether the answer is theirs needs to know which: one is what they typed, the other is what the
 * flag chose for them.
 */
export const skipReason = (options: { auth?: string; yes?: boolean }): string =>
  (options.auth !== undefined ? 'from --auth' : 'default; --yes asked nothing');

/** Parse and validate; every refusal here is exit 2 and happens before anything is asked. */
export function parseAddArgs(argv: readonly string[]):
{ ok: true; options: AddOptions } | { ok: false; message: string; needsLabel?: true } {
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
      case 'json': options.json = true; break;
      case 'yes': options.yes = true; break;
      case 'replace': options.replace = true; break;
      case 'from-bootstrap': options.fromBootstrap = true; break;
      default: return { ok: false, message: `unknown option --${name}` };
    }
  }

  // ARC-07-C2 — the ONE refusal a caller may recover from, and it is marked rather than matched
  // on its sentence. Everything else here stays exit 2 before anything is asked, which is this
  // function's contract; a missing label is the only one a terminal can supply, and the caller
  // that has the terminal decides. A caller without one gets the usage error unchanged.
  if (options.label === undefined) {
    return { ok: false, message: 'instance add needs a label', needsLabel: true };
  }
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


/**
 * The probe client and its options live in `servicenow/probe-client.ts` (ARC-08-S04): the doctor
 * needs both, and it must not import a CLI to ask a question about credentials. Re-exported here
 * because `import --from-legacy` already names this module for them.
 */
export { probeOptionsFor } from '../servicenow/probe-client.js';

/**
 * The cloud-sync warning, and the question that follows it (D-04, ARC-07-S07).
 *
 * 0600 is a LOCAL permission: the sync client runs as the same user, so the mode does not stop the
 * file leaving the machine. This is a WARNING and a question rather than a refusal — where somebody
 * keeps their code is theirs to decide — but the default is NO, because the cost of being wrong is
 * a credential store on somebody else's servers and the cost of asking again is one command.
 *
 * The text is the REGISTRY's, filled with the provider and the folder; there is no second copy of
 * this sentence anywhere. When the global store is itself synced, the alternative is dropped: the
 * remedy's parenthetical would otherwise offer a place that has the same problem.
 */
export async function cloudSyncGate(storePath: string, options: { yes?: boolean; global?: boolean },
  io: AddIo, env: NodeJS.ProcessEnv = process.env):
  Promise<{ ok: boolean; warning?: string }> {
  const hit = detectCloudSync(dirname(storePath), { env });
  if (!hit) return { ok: true };

  const globalPath = globalStorePath();
  const globalSynced = detectCloudSync(dirname(globalPath), { env }) !== null;
  const values = { provider: hit.provider, root: hit.root, global: maskPath(dirname(globalPath)) };
  const meaning = fillMeaning('STORE_IN_CLOUD_SYNC_FOLDER', values);
  const remedy = globalSynced || options.global
    // Offering `--global` to somebody already using it, or pointing at a synced global store,
    // would be advice that cannot be taken.
    ? 'move the checkout outside the synced folder'
    : fillRemedy('STORE_IN_CLOUD_SYNC_FOLDER', values);
  const warning = `WARN STORE_IN_CLOUD_SYNC_FOLDER: ${meaning} Options: ${remedy}.`;
  io.write(`${warning}\n`);

  if (options.yes) return { ok: true, warning };
  // Default NO: Enter, end-of-input and anything but `y` all decline.
  const answer = ((await io.ask('Continue and write the store here anyway? [y/N] ')) ?? '').trim().toLowerCase();
  return answer === 'y' || answer === 'yes' ? { ok: true, warning } : { ok: false, warning };
}

/**
 * The whole command. Seven steps, and every one of them can end it.
 */
export async function runAdd(options: AddOptions, terminal: AddIo, deps: AddDeps = {}): Promise<AddResult> {
  // `--json` means the OBJECT is the output. The step lines, the probe summary and the warning all
  // still happen — they are just not printed, because a caller parsing stdout gets one object or
  // it gets a parse error, and `test --json` already made that promise for this CLI.
  const io: AddIo = options.json
    ? { ...terminal, write: () => {} }
    : terminal;
  const env = deps.env ?? process.env;
  const platform = deps.platform ?? process.platform;
  // `resolveStorePath()` answers "which store would the SERVER read" and can legitimately say
  // "none" — a checkout with no store yet. Writing the per-checkout path in that case is the
  // whole point of `instance add`; using a second resolver would be how the wizard writes one
  // file and the server reads another.
  // `--global` selects a candidate THROUGH the resolver the server uses; it never computes a path
  // of its own. Without it the rule is unchanged: the store the server would read, or this
  // checkout's, which is what `instance add` exists to create.
  const storePath = deps.storePath
    ?? (options.global
      ? resolveStorePath({ global: true }).path as string
      : resolveStorePath().path ?? projectStorePath());
  const label = options.label as string;

  // The store is read FIRST, so a duplicate label costs nobody a password.
  const existing = loadStore(storePath);
  const store: Store = 'store' in existing
    ? existing.store
    : { version: STORE_VERSION, instances: {} } as Store;
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
  const url = options.url;
  if (url === undefined && options.yes) {
    // The registry's sentence, not a second one written here: one condition, one text.
    const message = `URL_REQUIRED — ${fillRemedy('URL_REQUIRED')}.`;
    io.write(`${message}\n`);
    return { saved: false, exitCode: EXIT_USAGE, message };
  }
  /**
   * One raw answer → a usable URL, or the normaliser's own message.
   *
   * A FUNCTION BECAUSE ARC-07-W1 NEEDS IT TWICE: here at `[1/6]`, and again when the reachability
   * menu's `[1] re-enter the URL` is taken. Two copies would let the notes, the `Proposed URL` step
   * and the `!options.yes` condition drift between the first URL a user types and the second.
   *
   * Behaviour is today's, exactly: the notes print, the proposal is offered only interactively, and a
   * rejected answer yields the message its caller returns as `EXIT_USAGE`. ARC-07-W2 turns that last
   * part into a bounded re-ask — in this one function, so both callers gain it together.
   */
  const resolveUrl = async (raw: string): Promise<
  { ok: true; url: string } | { ok: false; message: string }> => {
    const first = normalizeInstanceUrl(String(raw ?? ''));
    if (!first.ok) return { ok: false, message: first.message };
    for (const note of first.notes) io.write(`  ${note}\n`);
    let resolved = first.url;
    if (first.proposed && !options.yes) {
      io.write(`Proposed URL: ${resolved} — Enter to accept, or type the full URL\n`);
      const typed = (await io.ask('> ')) ?? '';
      if (typed.trim() !== '') {
        const again = normalizeInstanceUrl(typed);
        if (!again.ok) return { ok: false, message: again.message };
        resolved = again.url;
      }
    }
    return { ok: true, url: resolved };
  };

  /**
   * ARC-07-W2 — ASK UNTIL IT IS A URL, the loop the label prompt beside it already had.
   *
   * ARC-07-C10 fixed this class for the label — re-ask up to `MAX_ATTEMPTS`, `EXIT_FAILED` on
   * exhaustion, `EXIT_USAGE` only for argv — and the URL prompt was left on the exit-2 path. Exit 2
   * is what makes B06 print *"a defect in the bootstrap rather than in anything you typed … please
   * report"*, so a typo here had the wizard blaming itself for the user's typing.
   *
   * INTERACTIVE ONLY, and that is the whole care this function needs: a value from `--url` has nobody
   * to re-ask, so it stays on `resolveUrl` below and keeps exit 2. The two are asserted apart.
   */
  const askUrl = async (prompt: string): Promise<
  { ok: true; url: string } | { ok: false; exitCode: number; message: string }> => {
    for (let attempt = 1; ; attempt += 1) {
      const typed = await io.ask(prompt);
      // EOF is not a wrong answer, it is the end of the conversation — the label loop's own rule.
      // `io.ask` resolves to `string | null`, so EOF is NULL here. The label loop reads
      // `(await io.ask(...))?.trim()` and compares against `undefined`, which is right for THAT
      // shape and wrong for this one — the compiler caught a check that could never have fired.
      if (typed === null) return { ok: false, exitCode: EXIT_USAGE, message: CANCELLED };
      const resolved = await resolveUrl(typed);
      if (resolved.ok) return resolved;
      // The refusal is shown for EVERY attempt, the last one included: the reader has to see why the
      // third answer was refused as well, or the exhaustion line arrives unexplained.
      io.write(`${resolved.message}\n`);
      // The LAST message is returned, not written, because the one caller writes whatever comes back
      // — the argv path needs that write, and two write sites would double-print this line.
      if (attempt >= MAX_ATTEMPTS) {
        return { ok: false, exitCode: EXIT_FAILED, message: URL_EXHAUSTED };
      }
    }
  };

  // A value from `--url` keeps exit 2: there is nobody to re-ask. One shape for both paths, so the
  // caller has exactly one write and one exit code rather than a branch at the point of failure.
  const fromArgv = async (raw: string) => {
    const one = await resolveUrl(raw);
    return one.ok ? one : { ok: false as const, exitCode: EXIT_USAGE, message: one.message };
  };
  const normalised = url === undefined ? await askUrl(URL_PROMPT) : await fromArgv(String(url));
  if (!normalised.ok) {
    io.write(`${normalised.message}\n`);
    return { saved: false, exitCode: normalised.exitCode, message: normalised.message };
  }
  // ARC-07-W1 — MUTABLE, because `[1] re-enter the URL` replaces it and everything downstream (the
  // client, the probes, the saved entry) must use the URL that actually answered.
  let instanceUrl = normalised.url;

  // ── [2/6] the environment, then the network ──────────────────────────────────────────────
  io.write('[2/6] Environment\n');
  // ARC-07-W5 — WAS THE ANSWER ASKED, OR DECIDED? Measured: for a `devNNNNNN` host
  // `resolveEnvironment` returns `pdi` without calling `ask` and without printing, so this step
  // printed its header and nothing else and the value was never stated. The behaviour is kept — the
  // question is still not asked for a PDI host — and the decision is now said out loud.
  const proposedFromUrl = options.environment === undefined && proposeEnvironment(instanceUrl);
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
  if (proposedFromUrl) io.write(`Environment → ${environment.environment} (from the URL)\n`);

  // ONCE PER RUN, whether the probe succeeds or not: "it worked" and "it worked through a proxy
  // with a corporate CA" are different facts, and only one explains a colleague's failure.
  io.write(`${describeNetworkEnv(env)}\n`);
  /**
   * ARC-07-W1 — the menu's THREE choices, not one of them.
   *
   * `reachabilityMenu()` has offered `[1] re-enter the URL` since it was written, and this branch
   * tested `if (choice !== 'retry')` — so the one advertised way back from a mistyped host printed
   * `Nothing saved.` and exited 1. The most likely thing a user does with a typo was the one answer
   * that threw the run away. The retry test in `instance.test.ts` records the encounter: its comment
   * says an earlier version chose `[1]`, measured one probe instead of two, and switched to `[2]`.
   *
   * BOUNDED AT THREE PROBES. Both `[1]` and `[2]` loop now, so a stdin that keeps answering has to
   * stop somewhere — unbounded is a hang in a test and an unreadable timeout in CI. `--yes` aborts on
   * the first failure exactly as before: there is nobody to ask.
   *
   * Nothing is saved from here except by succeeding, which is P-23 and unchanged: the wizard this
   * replaced let a user keep an instance that had never answered.
   */
  const MAX_REACH_ROUNDS = 3;
  let reach = await (deps.reachability ?? probeReachability)(instanceUrl, { env });
  for (let round = 1; !reach.ok; round += 1) {
    for (const line of formatFailure(reach)) io.write(`${line}\n`);
    const choice = options.yes || round >= MAX_REACH_ROUNDS ? 'abort' : await askMenu(io);
    if (choice === 'reenter') {
      // ARC-07-W2 — the SAME loop as `[1/6]`, which is why W1 extracted the seam: a URL re-entered
      // here is re-asked on a typo exactly as the first one is, rather than ending the run.
      const again = await askUrl(URL_PROMPT);
      if (!again.ok) {
        io.write(`${again.message}\n`);
        return { saved: false, exitCode: again.exitCode, message: again.message };
      }
      instanceUrl = again.url;
      io.write(`URL → ${instanceUrl} · probing again\n`);
    } else if (choice !== 'retry') {
      // ARC-07-W2 — WHY it stopped, when it stopped because it ran out of rounds. An explicit
      // `[3] abort` still prints the bare `Nothing saved.`: that is a decision, not an exhaustion.
      const ended = round >= MAX_REACH_ROUNDS ? REACH_EXHAUSTED : NOTHING_SAVED;
      io.write(`${ended}\n`);
      return { saved: false, exitCode: EXIT_FAILED, message: ended };
    }
    reach = await (deps.reachability ?? probeReachability)(instanceUrl, { env });
  }

  // ── [3/6] and [4/6]: how to authenticate, and with what ──────────────────────────────────
  let method: 'basic' | 'oauth_ropc' = options.auth ?? 'basic';
  if (options.auth === undefined && !options.yes) {
    io.write('[3/6] Authentication\n');
    // ARC-07-W4 — `answer === '2' ? 'oauth_ropc' : 'basic'` read every other answer as agreement with
    // the option the user had not chosen: `oauth_ropc`, `oauth`, `02` and a typo all became basic.
    const chosen = await askOption(io, AUTH_QUESTION, AUTH_CHOICES,
      { defaultKey: 'basic', ack: (c) => `Authentication → ${c.key}` });
    if (chosen === null) {
      io.write(`${NOTHING_SAVED}\n`);
      return { saved: false, exitCode: EXIT_FAILED, message: NOTHING_SAVED };
    }
    method = chosen.key;
  } else {
    // ARC-08-C23 — A SKIPPED STEP SAYS SO. `[3/6]` printed nothing when the question was already
    // answered, so a run went `[2/6] … [4/6]` and the reader was left to work out whether a step
    // had failed, been dropped, or scrolled past. It is six numbered steps: the numbering is a
    // promise that all six are accounted for, and a silent gap breaks it in the direction that
    // worries people. The line names the ANSWER and where it came from, because "skipped" alone
    // would tell a reader that something did not happen without telling them what was used.
    io.write(`[3/6] Authentication … ${method} (${skipReason(options)})\n`);
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

    // ARC-07-W3 — `Probing` named the machine's activity; the user's question is "is it doing
    // anything to my instance?", and the answer is no.
    io.write('[5/6] Checking the login and what this account may do (read-only, a few seconds) …\n');
    if (options.noProbes) { probeResult = { auth: { status: 'ok' }, last: null }; break; }

    const client = (deps.makeClient ?? probeClientFor)({ url: instanceUrl, auth });
    const all = await (deps.probe ?? probeAll)(client, probeOptionsFor(auth, env));
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
      io.write(`${all.auth.status === 'role missing' ? all.auth.hint : `AUTHENTICATION_FAILED — ${authFailedReason()}`}\n${NOTHING_SAVED}\n`);
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
  //
  // THE CLOUD-SYNC GATE COMES LAST AMONG THE QUESTIONS AND FIRST AMONG THE WRITES: everything above
  // is questions and probes, and this is the point where a file appears on disk. Declining here
  // costs the user the password they typed, which is why the warning is worded to be decided in
  // one reading — and why exit 3 says POLICY rather than failure.
  const gate = await cloudSyncGate(storePath, options, io, env);
  if (!gate.ok) {
    io.write(`${NOTHING_SAVED}\n`);
    return { saved: false, exitCode: EXIT_POLICY, message: NOTHING_SAVED,
      ...(gate.warning ? { warnings: [gate.warning] } : {}) };
  }

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
    // ARC-07-C5 — KEEP THE PROBES THIS RUN JUST TOOK. `add` probed at [5/6], printed the results
    // in the Saved line and reported them in `--json`, and then built an entry without them — so
    // `instance list` showed `LAST PROBE —` for an instance probed seconds earlier. The gap was
    // invisible on the interactive path because the next `./snowarch doctor` runs SV-04, which
    // calls `instance test`, which writes `lastProbe`; the value was always backfilled by
    // something else. Same shape as ARC-09-C46's tally: the data was in hand and thrown away.
    ...(probeResult?.last ? { lastProbe: storedProbe(probeResult.last) } : {}),
  } as StoreInstance;

  const next: Store = {
    version: store.version ?? 1,
    ...(isDefault ? { defaultInstance: label } : store.defaultInstance ? { defaultInstance: store.defaultInstance } : {}),
    instances: { ...store.instances, [label]: entry },
  } as Store;
  saveStore(storePath, next);

  const masked = maskEntry(entry);
  const warnings = gate.warning ? [gate.warning] : [];
  if (options.json) {
    // The machine-readable summary. Never the entry as stored: `maskEntry` is what a caller may
    // see, and `warnings` carries the CODE rather than the sentence, because a caller matching on
    // prose is a caller that breaks when the prose improves.
    terminal.write(`${JSON.stringify({
      saved: true,
      label,
      store: maskPath(storePath),
      default: isDefault,
      instance: masked,
      lastProbe: probeResult?.last ?? null,
      warnings: warnings.map(() => 'STORE_IN_CLOUD_SYNC_FOLDER'),
    }, null, 2)}\n`);
    return { saved: true, exitCode: EXIT_OK, entry: masked, lastProbe: probeResult?.last ?? null, warnings };
  }
  io.write(`${savedLine(label, masked, isDefault)} `
    + `${probeSummary(probeResult?.last ?? null, masked.flags, options.noProbes === true)}\n`);
  io.write(`${storeLine(storePath, platform)}\n`);
  // The warning is REPEATED after the save, not only before it: the line that matters is the one
  // still on screen when the command ends.
  for (const w of warnings) io.write(`${w}\n`);
  if (!options.fromBootstrap) io.write(`${NEXT_LINE}\n`);

  return { saved: true, exitCode: EXIT_OK, entry: masked, lastProbe: probeResult?.last ?? null, warnings };
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
    '  --global                  write to the per-user store, not this checkout\'s',
    '  --json                    print the summary as an object (with any warnings)',
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

/**
 * ARC-07-W5 — the same numbered question as every other one, and no silent reprint.
 *
 * The old loop reprinted the identical line with NO message, so a wrong answer looked like a screen
 * that had frozen. `askOption` prints the question once and answers a wrong answer with a reason.
 *
 * NO DEFAULT, and the reason is older than this row: `pdi` is right often enough to be tempting and
 * wrong in exactly the case that matters, because the environment decides which preset a write is
 * checked against. So Enter is an unknown answer here, which is what `resolveOption` does when no
 * `defaultKey` is given — the one place its grammar differs from the permissions screen's.
 */
async function askEnvironment(io: AddIo): Promise<string> {
  const chosen = await askOption(io, ENV_QUESTION, ENV_CHOICES,
    { ack: (c) => `Environment → ${c.key}` });
  // EOF leaves the caller to decide, as it did before: this returned a string and never threw, and
  // `resolveEnvironment` treats the answer as the environment. An empty string fails its validation.
  return chosen?.key ?? '';
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

/**
 * A required, ECHOED answer, re-asked while it is empty (ARC-07-W3).
 *
 * UNBOUNDED, and safely so: a non-answer costs nothing — no network call, no failed login, no step
 * closer to a lockout — so there is nothing for a bound to protect. The exits are `q` and EOF, and
 * `io.ask` resolves to `string | null`, so EOF is NULL here. That is the ARC-07-W2 lesson: the label
 * loop compares against `undefined` because it reads `(await io.ask(...))?.trim()`, and copying that
 * idiom to a prompt read without `?.trim()` writes a guard that can never fire.
 */
async function askRequired(io: AddIo, prompt: string, missing: string): Promise<string | null> {
  for (;;) {
    const typed = await io.ask(prompt);
    if (typed === null) return null;
    const value = typed.trim();
    if (value.toLowerCase() === 'q') return null;
    if (value !== '') return value;
    io.write(`${missing}\n`);
  }
}

/**
 * The same for a MASKED answer — and this one is bounded, for a reason that is not the user's.
 *
 * `io.secret` has no end-of-input value: it resolves to a string, and `promptSecret` handles Ctrl-C
 * and Ctrl-D by ENDING THE PROCESS from inside itself (`exit(EXIT_INTERRUPTED)`). So a real user
 * always has a way out and the bound is not it. What the bound terminates is an input source that
 * can only ever answer empty — a closed pipe, or a test stub — where an unbounded loop would spin
 * instead of asking. Measured: the stub returns `''` forever, so this guard is the difference
 * between a failing assertion and a hung CI cell.
 */
async function askRequiredSecret(io: AddIo, prompt: string, missing: string): Promise<string> {
  for (let attempt = 1; ; attempt += 1) {
    const value = await io.secret(prompt);
    if (value) return value;
    io.write(`${missing}\n`);
    if (attempt >= MAX_ATTEMPTS) return '';
  }
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

  // ARC-07-W3 — INTERACTIVE ONLY. A `--username` from argv keeps today's behaviour exactly, and a
  // piped empty secret still aborts: neither has a terminal to re-ask, which is the same split W2
  // drew between the URL prompt and `--url`.
  const username = options.username ?? await askRequired(io, USERNAME_PROMPT, USERNAME_REQUIRED);
  if (username === null || username.trim() === '') return null;

  const password = fromStdin
    ? (fromStdin[0] ?? '')
    : await askRequiredSecret(io, PASSWORD_PROMPT, PASSWORD_REQUIRED);
  if (!password) return null;

  if (method === 'basic') return { method, username, password };

  // The client id is an IDENTIFIER and is echoed; the secret is not.
  // Required, like the username: an empty client id cannot authenticate, and accepting one only
  // moved the failure to the probe, where the reason is harder to read.
  const clientId = await askRequired(io, CLIENT_ID_PROMPT, CLIENT_ID_REQUIRED);
  if (clientId === null) return null;
  const clientSecret = fromStdin ? (fromStdin[1] ?? '') : await io.secret('Client secret:');
  return { method, username, password, clientId, clientSecret };
}

/** Exported for the forwarder's precondition test — the CLI path the engine spawns. */
export const CLI_RELATIVE = 'packages/snowarch/dist/cli/index.js';

/** True when the server's runtime dependencies are installed beside the built CLI. */
export const serverDepsInstalled = (packageDir: string): boolean =>
  existsSync(`${packageDir}/node_modules/@modelcontextprotocol/sdk/package.json`);

// ═══ ARC-07-S06 — the maintenance commands ═════════════════════════════════════════════════
//
// Seven sub-commands that all begin the same way: resolve the store THE WAY THE SERVER DOES, load
// it, find the label. That preamble is `openStore` + `findInstance` below and exists once, because
// a second resolver is how the wizard writes one file and the server reads another.
//
// What each of them may touch is deliberately narrow, and the narrowness is the feature:
//   `test`             writes `lastProbe` and NOTHING else — never a credential.
//   `set-credentials`  writes `auth` only, and only after the instance said `ok`.
//   `set-preset` /
//   `set-flags`        write `preset` + `flags` (+ `prodWriteAck`), never a credential.
//   `set-default`      writes `defaultInstance`, and mirrors the LABEL into `.local/config.json`.
//   `remove`           deletes one entry.
// Every one of the last five appends an audit line through ARC-04-S10's writer, so a change made
// from a terminal is as traceable as one made through a tool call.

/** `LABEL_NOT_FOUND` — registered, so `docs/TROUBLESHOOTING.md` carries its remedy. */
export const labelNotFound = (label: string, known: readonly string[]): string => {
  const remedy = remedyFor('LABEL_NOT_FOUND').remedy;
  const list = known.length > 0 ? ` Known: ${known.join(', ')}.` : '';
  return `LABEL_NOT_FOUND — "${label}" is not in the store.${list} `
    + `${remedy.charAt(0).toUpperCase()}${remedy.slice(1)}.`;
};

export const MISMATCH = 'Label mismatch — nothing changed.';

export const prodRaiseWarning = (): string =>
  `You are enabling ${FLAG_NAMES.map(labelOf).slice(0, 1).join('')} (and `
  + `${FLAG_NAMES.map(labelOf).slice(1).join(', ')}) on a PRODUCTION instance. Every write still `
  + 'needs an explicit "write approved" in Claude and is recorded in .local/audit.jsonl.';

export const CONFIRM_PROMPT = 'Type the instance label to confirm: ';

export const credentialsUpdated = (label: string): string => `Credentials updated for "${label}".`;

export const removeQuestion = (label: string, storePath: string): string =>
  `Remove instance "${label}"? This deletes its stored credentials from `
  + `${maskPath(storePath)}. [y/N] `;

export const WAS_DEFAULT = (label: string): string =>
  `"${label}" was the default instance; the server will start unconfigured until you run set-default.`;

/**
 * The `set-default` sentence, with the reload tool named from the CONTRACT's own list.
 *
 * A retyped tool token is what L01 exists to catch: the name appears in the contract, in
 * `governance/`, in the rule file and here, and four spellings of it is three chances to be
 * wrong on the day a name changes.
 */
export const defaultChanged = (label: string): string =>
  `Default instance is now "${label}". The running server picks it up after `
  + `${CORE_TOOLS_UNCONFIGURED[1]} (or /snowarch setup-instance --resume).`;

export interface ManageOptions {
  label?: string;
  json?: boolean;
  all?: boolean;
  global?: boolean;
  verbose?: boolean;
  yes?: boolean;
  ackProd?: boolean;
  confirmLabel?: string;
  auth?: 'basic' | 'oauth_ropc';
  username?: string;
  passwordStdin?: boolean;
  preset?: string;
  pairs?: readonly string[];
  /** ARC-07-S08's `import --from-legacy`. */
  fromLegacy?: boolean;
  dryRun?: boolean;
  path?: string;
  only?: string[];
}

export interface ManageDeps extends AddDeps {
  /** The clock, injected so an audit line and a `lastProbe` are assertable to the character. */
  now?: () => string;
  /** `.local/config.json`, so the mirror can be pointed somewhere else in a test. */
  configPath?: string;
}

interface OpenStore { path: string; store: Store; source: StoreLabel; }

/**
 * The store schema types `lastProbe` as `{ at: string }` PLUS anything (ARC-07-S03 chose
 * passthrough so probe keys could be added without a schema version bump). `LastProbe` is the
 * shape the probes actually write. These two functions are the only place the two meet, so the
 * assertion is made once, next to the reason for it, rather than at nine call sites.
 */
const storedProbe = (last: LastProbe): StoreInstance['lastProbe'] =>
  last as unknown as StoreInstance['lastProbe'];

const readProbe = (stored: StoreInstance['lastProbe']): LastProbe | null =>
  (stored ? (stored as unknown as LastProbe) : null);

/**
 * The store as the SERVER would resolve it, or the sentence saying why not.
 *
 * `resolveStorePath()` answering "none" is not an error here the way it is for the server: it
 * means this checkout has no instances yet, and `list` on such a checkout prints a line and exits
 * 0. What is NOT allowed is inventing a path: a maintenance command that created a store would
 * make `set-default` on a typo produce a second, empty configuration.
 */
/**
 * WHICH FILE this command acts on, and what selected it. One resolution, shared.
 *
 * The path AND the source: `list --all` needs the second half to say which store the server reads,
 * and computing the two separately is how they came apart — a run under `SNOW_STORE` once listed
 * the global store and left out the file in use. `import` (ARC-07-S08) asks the same question, so
 * it asks this function rather than repeating the precedence.
 *
 * An injected path is named by WHERE IT POINTS, not by the fact that it was injected: the same
 * file is the project store whether the resolver found it or a caller handed it over, and calling
 * it an override would put the wrong word in the STORE column.
 */
export function targetStore(deps: { storePath?: string }, options: { global?: boolean } = {}):
{ path: string; source: StoreLabel } {
  const injected = deps.storePath;
  const resolution = injected !== undefined
    ? { path: injected,
      source: (injected === projectStorePath() ? 'project'
        : injected === globalStorePath() ? 'global' : 'env') as StoreSource }
    : options.global
      ? resolveStorePath({ global: true })
      : resolveStorePath();
  return {
    path: resolution.path ?? projectStorePath(),
    source: storeLabelFor(resolution.path === null ? 'project' : resolution.source),
  };
}

function openStore(deps: ManageDeps, options: ManageOptions = {}): { ok: true; opened: OpenStore }
| { ok: false; message: string; exitCode: number } {
  const { path, source } = targetStore(deps, options);
  if (!existsSync(path)) {
    return { ok: true, opened: { path, source, store: { version: STORE_VERSION, instances: {} } as Store } };
  }
  const loaded = loadStore(path);
  if ('error' in loaded) {
    return { ok: false, message: `${loaded.error.code} — ${loaded.error.message}`, exitCode: EXIT_USAGE };
  }
  return { ok: true, opened: { path, source, store: loaded.store } };
}

const verboseStoreLine = (path: string): string => `store: ${maskPath(path)}`;

/** One instance, or the refusal naming the labels that do exist. */
function findInstance(opened: OpenStore, label: string):
{ ok: true; entry: StoreInstance } | { ok: false; message: string } {
  const entry = opened.store.instances[label];
  if (!entry) return { ok: false, message: labelNotFound(label, Object.keys(opened.store.instances)) };
  return { ok: true, entry };
}

/** Save one changed entry, leaving every other byte of the store as it was. */
function writeEntry(opened: OpenStore, label: string, entry: StoreInstance): void {
  saveStore(opened.path, {
    ...opened.store,
    instances: { ...opened.store.instances, [label]: entry },
  } as Store);
}

function audit(entry: CliAuditEntry): void {
  appendAudit(entry);
}

// ── list ──────────────────────────────────────────────────────────────────────────────────

export function runList(options: ManageOptions, io: AddIo, deps: ManageDeps = {}): number {
  const opened = openStore(deps, options);
  if (!opened.ok) { io.write(`${opened.message}\n`); return opened.exitCode; }
  if (options.verbose) io.write(`${verboseStoreLine(opened.opened.path)}\n`);

  // `--all` reads BOTH stores and says which row came from which. They are never merged (`01` §7):
  // a label in both appears TWICE, and the note says which one the server reads. A merge would
  // make "which file set this value" unanswerable, which is the whole reason for the rule.
  if (options.all) {
    const sides = bothStores(opened.opened);
    const combined = combinedListJson(sides.first, sides.global);
    io.write(options.json
      ? `${JSON.stringify(combined, null, 2)}\n`
      : `${listAllTable(combined)}\n`);
    return EXIT_OK;
  }

  const json = listJson(opened.opened.path, opened.opened.store);
  io.write(options.json ? `${JSON.stringify(json, null, 2)}\n` : `${listTable(json)}\n`);

  // The footer exists so nobody concludes an instance is gone when it is merely in the other
  // store. Not printed in `--json`: a footer is prose, and the object already carries the truth.
  if (!options.json) {
    const sides = bothStores(opened.opened);
    const count = Object.keys(sides.global.store?.instances ?? {}).length;
    if (count > 0 && sides.global.path !== opened.opened.path) io.write(`${otherStoreFooter(count)}\n`);
  }
  return EXIT_OK;
}

/**
 * The two stores as they are on disk right now — the project one and the global one.
 *
 * Read through the same loader the server uses, and a store that is absent or unreadable is
 * `null` rather than an empty one: "there is no global store" and "the global store is empty" are
 * different answers to `list`, and only one of them is worth a footer.
 */
function bothStores(opened: OpenStore): {
  first: { path: string; store: Store | null; source: StoreLabel };
  global: { path: string; store: Store | null };
} {
  const globalPath = globalStorePath();
  const load = (path: string): Store | null => {
    if (!existsSync(path)) return null;
    const loaded = loadStore(path);
    return 'store' in loaded ? loaded.store : null;
  };
  return {
    // THE FIRST STORE IS THE ONE THE RESOLVER RETURNED — the per-checkout file, the one
    // `SNOW_STORE` names, or the global one when there is nothing else. Never re-derived here.
    first: { path: opened.path, source: opened.source,
      store: existsSync(opened.path) ? opened.store : null },
    global: { path: globalPath, store: globalPath === opened.path ? opened.store : load(globalPath) },
  };
}

// ── test ──────────────────────────────────────────────────────────────────────────────────

/**
 * Re-probe one instance or all of them. `lastProbe` is the only field this writes, ever.
 *
 * In `--json` the human lines are suppressed rather than interleaved: ARC-06-S08 parses this
 * command's stdout, and a network note printed above the object turns a probe result into
 * `unparsable`.
 */
export async function runTest(options: ManageOptions, io: AddIo, deps: ManageDeps = {}): Promise<number> {
  const env = deps.env ?? process.env;
  const opened = openStore(deps, options);
  if (!opened.ok) { io.write(`${opened.message}\n`); return opened.exitCode; }
  if (options.all && !options.json) {
    io.write('instance test --all prints JSON only — add --json\n');
    return EXIT_USAGE;
  }
  const quiet = options.json === true;
  if (options.verbose && !quiet) io.write(`${verboseStoreLine(opened.opened.path)}\n`);

  const labels = options.all
    ? Object.keys(opened.opened.store.instances)
    : [options.label as string];
  for (const label of labels) {
    const found = findInstance(opened.opened, label);
    if (!found.ok) { io.write(`${found.message}\n`); return EXIT_USAGE; }
  }

  // The note, when the label being probed exists in both stores: the user is about to read a
  // result and needs to know which entry produced it.
  if (!quiet) {
    const sides = bothStores(opened.opened);
    for (const label of labels) {
      if (sides.first.store?.instances?.[label] && sides.global.store?.instances?.[label]
        && sides.first.path !== sides.global.path) {
        io.write(`${precedenceNote(label, sides.first.path, sides.global.path, sides.first.source)}\n`);
      }
    }
  }

  const probes: Record<string, LastProbe> = {};
  let failed = false;
  for (const label of labels) {
    const entry = opened.opened.store.instances[label] as StoreInstance;
    if (!quiet) io.write(`${describeNetworkEnv(env)}\n`);
    const reach = await (deps.reachability ?? probeReachability)(entry.url, { env });
    if (!reach.ok && !quiet) for (const line of formatFailure(reach)) io.write(`${line}\n`);

    const client = (deps.makeClient ?? probeClientFor)({ url: entry.url, auth: entry.auth });
    const all = await (deps.probe ?? probeAll)(client, probeOptionsFor(entry.auth, env));
    const last = toLastProbe({ ...all, at: (deps.now ?? (() => new Date().toISOString()))() });
    probes[label] = last;
    if (all.auth.status !== 'ok') failed = true;

    // The probe result is recorded WHETHER OR NOT it passed — a failed probe is the fact the
    // doctor needs, and a store that only remembers good news would report an instance as
    // healthy for as long as it stays broken. Nothing else in the entry is touched: the
    // credentials are the user's, and this command has no business rewriting them.
    writeEntry(opened.opened, label, { ...entry, lastProbe: storedProbe(last) });
    if (!quiet) {
      io.write(`${probeSummary(last, completeFlags(entry.flags), false)}\n`);
    }
  }

  if (quiet) io.write(`${JSON.stringify(probesJson(opened.opened.path, probes), null, 2)}\n`);
  return failed ? EXIT_FAILED : EXIT_OK;
}

// ── set-credentials ───────────────────────────────────────────────────────────────────────

/**
 * New credentials for an existing instance — saved only when the instance says `ok`.
 *
 * The re-entry loop is S05's, called through the same helper, so "three attempts, one request
 * each" is one rule in one place. A run that ends any other way leaves the OLD credentials
 * exactly where they were: an entry whose password has been replaced by a wrong one is worse
 * than an entry nobody touched, because the failure arrives later and somewhere else.
 */
export async function runSetCredentials(options: ManageOptions, io: AddIo, deps: ManageDeps = {}): Promise<number> {
  const env = deps.env ?? process.env;
  const opened = openStore(deps, options);
  if (!opened.ok) { io.write(`${opened.message}\n`); return opened.exitCode; }
  const label = options.label as string;
  const found = findInstance(opened.opened, label);
  if (!found.ok) { io.write(`${found.message}\n`); return EXIT_USAGE; }
  if (options.verbose) io.write(`${verboseStoreLine(opened.opened.path)}\n`);

  const entry = found.entry;
  const method = options.auth ?? entry.auth.method;

  let attempt = 1;
  for (;;) {
    // `Username [a***]:` — Enter keeps the current account. The mask is the store's, so what is
    // shown here and what `list` shows cannot disagree.
    const username = options.username
      ?? (((await io.ask(`Username [${maskUsername(entry.auth.username)}]: `)) ?? '').trim()
        || entry.auth.username);

    const fromStdin = options.passwordStdin && attempt === 1
      ? await readSecretFromStdin(io.io ? { io: io.io } : {})
      : null;
    const password = fromStdin ? (fromStdin[0] ?? '') : await io.secret('Password:');
    if (!password) { io.write(`${NOTHING_SAVED}\n`); return EXIT_FAILED; }

    let auth: StoreInstance['auth'];
    if (method === 'basic') {
      auth = { method, username, password };
    } else {
      const clientId = ((await io.ask('Client ID: ')) ?? '').trim();
      const clientSecret = fromStdin ? (fromStdin[1] ?? '') : await io.secret('Client secret:');
      auth = { method, username, password, clientId, clientSecret };
    }

    const client = (deps.makeClient ?? probeClientFor)({ url: entry.url, auth });
    const all = await (deps.probe ?? probeAll)(client, probeOptionsFor(auth, env));
    if (all.auth.status === 'ok') {
      // The same gate as `add`, in the same place — the last question before a file changes.
      const gate = await cloudSyncGate(opened.opened.path, options, io, env);
      if (!gate.ok) {
        io.write(`${NOTHING_SAVED}\n`);
        return EXIT_POLICY;
      }
      const at = (deps.now ?? (() => new Date().toISOString()))();
      const last = toLastProbe({ ...all, at });
      // Changing the METHOD drops the other method's fields rather than leaving them beside the
      // new ones: a `basic` entry carrying a stale `clientSecret` is a secret nobody will think
      // to rotate.
      writeEntry(opened.opened, label, { ...entry, auth, lastProbe: storedProbe(last) });
      audit({ ts: at, instance: label, environment: entry.environment, tool: null, actor: 'cli',
        action: 'set-credentials', result: 'ok' });
      io.write(`${credentialsUpdated(label)} ${probeSummary(last, completeFlags(entry.flags), false)}\n`);
      return EXIT_OK;
    }

    if (all.auth.status === 'unreachable') {
      io.write(`${all.auth.detail ?? 'the instance could not be reached'}\n${NOTHING_SAVED}\n`);
      return EXIT_FAILED;
    }
    if (options.passwordStdin || options.yes) {
      io.write(`${all.auth.status === 'role missing' ? all.auth.hint : `AUTHENTICATION_FAILED — ${authFailedReason()}`}\n${NOTHING_SAVED}\n`);
      return EXIT_FAILED;
    }
    if (attempt >= MAX_ATTEMPTS) { io.write(`${AUTH_EXHAUSTED}\n`); return EXIT_FAILED; }
    if (isNo(await io.ask(authFailedRetry(attempt + 1)))) {
      io.write(`${NOTHING_SAVED}\n`);
      return EXIT_FAILED;
    }
    attempt += 1;
  }
}

// ── the production gate, shared by set-preset and set-flags ───────────────────────────────

type ProdGate =
  | { ok: true; confirmedVia?: 'prompt' | 'flag' }
  | { ok: false; message: string; exitCode: number };

/**
 * May this change raise a production instance? D-05, in one place.
 *
 * The label is TYPED BACK, and that is the whole mechanism: `--ack-prod` alone would be a flag
 * somebody adds to a command line they are already running. `--confirm-label` is the CI form —
 * the label is still typed, on the command line — and the audit line records which of the two it
 * was, so "a person did this" and "a pipeline did this" stay distinguishable afterwards.
 */
async function prodGate(label: string, entry: StoreInstance, raising: boolean,
  options: ManageOptions, io: AddIo): Promise<ProdGate> {
  if (entry.environment !== 'prod' || !raising) return { ok: true };
  if (!options.ackProd) {
    return { ok: false, message: prodRefusal(label), exitCode: EXIT_POLICY };
  }
  io.write(`${prodRaiseWarning()}\n`);
  if (options.confirmLabel !== undefined) {
    return options.confirmLabel === label
      ? { ok: true, confirmedVia: 'flag' }
      : { ok: false, message: MISMATCH, exitCode: EXIT_POLICY };
  }
  const typed = ((await io.ask(CONFIRM_PROMPT)) ?? '').trim();
  return typed === label
    ? { ok: true, confirmedVia: 'prompt' }
    : { ok: false, message: MISMATCH, exitCode: EXIT_POLICY };
}

// ── set-preset ────────────────────────────────────────────────────────────────────────────

export async function runSetPreset(options: ManageOptions, io: AddIo, deps: ManageDeps = {}): Promise<number> {
  const opened = openStore(deps, options);
  if (!opened.ok) { io.write(`${opened.message}\n`); return opened.exitCode; }
  const label = options.label as string;
  const found = findInstance(opened.opened, label);
  if (!found.ok) { io.write(`${found.message}\n`); return EXIT_USAGE; }
  if (options.verbose) io.write(`${verboseStoreLine(opened.opened.path)}\n`);

  const entry = found.entry;
  const preset = String(options.preset);
  const raising = preset !== 'read-only';
  const gate = await prodGate(label, entry, raising, options, io);
  if (!gate.ok) { io.write(`${gate.message}\n`); return gate.exitCode; }

  const decision = await resolveFlags({
    label,
    environment: entry.environment,
    preset,
    ...(options.yes ? { yes: true } : { io }),
    // THE PROBES HERE ARE THE STORE'S, not this command's: `set-preset` never probes. So the
    // screen is told WHEN they were taken and says so beside each flag, rather than rendering a
    // value from days ago exactly like one measured a second ago (owner's sitting, 2026-09-23).
    ...(readProbe(entry.lastProbe) ? { probes: readProbe(entry.lastProbe) as LastProbe } : {}),
    ...(readProbe(entry.lastProbe)?.at ? { probesRecordedAt: readProbe(entry.lastProbe)?.at } : {}),
    ...(gate.confirmedVia ? { prodAcknowledged: true } : {}),
  });
  if (!decision.ok) {
    io.write(`${decision.message}\n`);
    return decision.exitCode ?? EXIT_FAILED;
  }
  io.write(`${decision.applying}\n`);
  return applyPermissions(opened.opened, label, entry, decision.preset as StoreInstance['preset'],
    decision.flags as Flags, 'set-preset', gate.confirmedVia, io, deps);
}

// ── set-flags ─────────────────────────────────────────────────────────────────────────────

/**
 * `WRITE=on` → the flag's own name mapped to the string `true`, or the sentence naming what was
 * not understood. (Spelled that way round because writing the flag constant out here would make
 * this comment a hit in the sweep that forbids flag literals in `src/cli/` — the thirteenth time
 * that lesson has been learnt in this repository.)
 */
export function parseFlagPairs(pairs: readonly string[]):
{ ok: true; changes: Map<FlagName, 'true' | 'false'> } | { ok: false; message: string } {
  const changes = new Map<FlagName, 'true' | 'false'>();
  for (const pair of pairs) {
    const [key, value] = pair.split('=').map((s) => s.trim());
    const flag = FLAG_NAMES.find((f) => labelOf(f).toLowerCase() === String(key).toLowerCase()
      || f.toLowerCase() === String(key).toLowerCase());
    if (!flag) {
      return { ok: false,
        message: `"${key}" is not a flag (expected ${FLAG_NAMES.map(labelOf).join(', ')})` };
    }
    const on = ['on', 'true'].includes(String(value).toLowerCase());
    const off = ['off', 'false'].includes(String(value).toLowerCase());
    if (!on && !off) return { ok: false, message: `${labelOf(flag)}=${value} — expected on or off` };
    changes.set(flag, on ? 'true' : 'false');
  }
  if (changes.size === 0) return { ok: false, message: 'instance set-flags needs at least one FLAG=on|off' };
  return { ok: true, changes };
}

/**
 * A PARTIAL change to the six flags — the difference from `set-preset`, which replaces all of them.
 *
 * Each requested change goes through S04's own toggle, so the dependency conversation is the one
 * the review screen has rather than a second implementation of the same rule. A change that is
 * already the current value is skipped: toggling to the state something is already in would flip
 * it the wrong way and ask a question about a change nobody requested.
 */
export async function runSetFlags(options: ManageOptions, io: AddIo, deps: ManageDeps = {}): Promise<number> {
  const opened = openStore(deps, options);
  if (!opened.ok) { io.write(`${opened.message}\n`); return opened.exitCode; }
  const label = options.label as string;
  const found = findInstance(opened.opened, label);
  if (!found.ok) { io.write(`${found.message}\n`); return EXIT_USAGE; }
  if (options.verbose) io.write(`${verboseStoreLine(opened.opened.path)}\n`);

  const parsed = parseFlagPairs(options.pairs ?? []);
  if (!parsed.ok) { io.write(`${parsed.message}\n`); return EXIT_USAGE; }

  const entry = found.entry;
  const raising = [...parsed.changes.values()].includes('true');
  const gate = await prodGate(label, entry, raising, options, io);
  if (!gate.ok) { io.write(`${gate.message}\n`); return gate.exitCode; }

  let flags = completeFlags(entry.flags);
  for (const [flag, value] of parsed.changes) {
    if (flags[flag] === value) continue;
    flags = options.yes
      ? { ...flags, [flag]: value }
      : await toggleFlag(flags, flag, io);
  }

  const violation = dependencyViolation(flags);
  if (violation) { io.write(`${violation}\n`); return EXIT_USAGE; }

  // Production without an acknowledgement cannot arrive here with a flag on — `prodGate` refused —
  // but a `--yes` run that turned everything OFF is legitimate and lands as `read-only`.
  const preset = matchPreset(flags);
  io.write(`${applyingLine(preset, flags)}\n`);
  return applyPermissions(opened.opened, label, entry, preset, flags, 'set-flags',
    gate.confirmedVia, io, deps);
}

/** The save both permission commands end with: entry, ack, audit line, one sentence. */
function applyPermissions(opened: OpenStore, label: string, entry: StoreInstance,
  preset: StoreInstance['preset'], flags: Flags, action: 'set-preset' | 'set-flags',
  confirmedVia: 'prompt' | 'flag' | undefined, io: AddIo, deps: ManageDeps): number {
  const anyOn = FLAG_NAMES.some((f) => flags[f] === 'true');
  // The acknowledgement follows the FLAGS, not the command: dropping a production instance back to
  // read-only clears it, so the next raise has to be acknowledged again rather than inheriting a
  // "yes" from a decision taken weeks ago.
  const prodWriteAck = entry.environment === 'prod' && anyOn;
  const at = (deps.now ?? (() => new Date().toISOString()))();
  writeEntry(opened, label, { ...entry, preset, flags, prodWriteAck });
  audit({ ts: at, instance: label, environment: entry.environment, tool: null, actor: 'cli',
    action, result: 'ok', preset, prodWriteAck,
    ...(confirmedVia ? { confirmedVia } : {}) });
  io.write(`Saved "${label}" (preset ${preset}${prodWriteAck ? ' · prodWriteAck true' : ''}).\n`);
  return EXIT_OK;
}

// ── set-default ───────────────────────────────────────────────────────────────────────────

/**
 * `.local/config.json`'s `defaultInstance`, refreshed — a MIRROR, never a second source.
 *
 * Only when the file already exists (ARC-06-S05's ruling: the bootstrap owns creating it), only
 * that one key, and every other key is left byte-for-byte as it was — including `updatedAt`, which
 * belongs to the bootstrap step that writes the rest. The server package does not import the
 * engine's `.mjs`, so this is the minimal JSON update rather than a call into B07's writer.
 */
export function mirrorDefault(configPath: string, label: string | null): boolean {
  if (!existsSync(configPath)) return false;
  try {
    const raw = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>;
    raw.defaultInstance = label;
    writeFileSync(configPath, `${JSON.stringify(raw, null, 2)}\n`);
    return true;
  } catch {
    // A config nobody can parse is not this command's failure: the store is authoritative and the
    // mirror is a convenience. The bootstrap rewrites the file wholesale.
    return false;
  }
}

const configFor = (storePath: string, deps: ManageDeps): string =>
  deps.configPath ?? join(dirname(storePath), 'config.json');

export function runSetDefault(options: ManageOptions, io: AddIo, deps: ManageDeps = {}): number {
  const opened = openStore(deps, options);
  if (!opened.ok) { io.write(`${opened.message}\n`); return opened.exitCode; }
  const label = options.label as string;
  const found = findInstance(opened.opened, label);
  if (!found.ok) { io.write(`${found.message}\n`); return EXIT_USAGE; }
  if (options.verbose) io.write(`${verboseStoreLine(opened.opened.path)}\n`);

  saveStore(opened.opened.path, { ...opened.opened.store, defaultInstance: label } as Store);
  mirrorDefault(configFor(opened.opened.path, deps), label);
  audit({ ts: (deps.now ?? (() => new Date().toISOString()))(), instance: label,
    environment: found.entry.environment, tool: null, actor: 'cli', action: 'set-default',
    result: 'ok' });
  io.write(`${defaultChanged(label)}\n`);
  return EXIT_OK;
}

// ── remove ────────────────────────────────────────────────────────────────────────────────

export async function runRemove(options: ManageOptions, io: AddIo, deps: ManageDeps = {}): Promise<number> {
  const opened = openStore(deps, options);
  if (!opened.ok) { io.write(`${opened.message}\n`); return opened.exitCode; }
  const label = options.label as string;
  const found = findInstance(opened.opened, label);
  if (!found.ok) { io.write(`${found.message}\n`); return EXIT_USAGE; }
  if (options.verbose) io.write(`${verboseStoreLine(opened.opened.path)}\n`);

  // Default N. Everything else in this file can be done again; this one deletes a credential
  // somebody typed, and the wrong answer to a fast question is unrecoverable.
  if (!options.yes) {
    const answer = ((await io.ask(removeQuestion(label, opened.opened.path))) ?? '').trim().toLowerCase();
    if (answer !== 'y' && answer !== 'yes') { io.write(`${NOTHING_SAVED}\n`); return EXIT_FAILED; }
  }

  const wasDefault = opened.opened.store.defaultInstance === label;
  const instances = { ...opened.opened.store.instances };
  delete instances[label];
  const next = { ...opened.opened.store, instances } as Store;
  if (wasDefault) delete (next as { defaultInstance?: string }).defaultInstance;
  saveStore(opened.opened.path, next);
  if (wasDefault) mirrorDefault(configFor(opened.opened.path, deps), null);

  audit({ ts: (deps.now ?? (() => new Date().toISOString()))(), instance: label,
    environment: found.entry.environment, tool: null, actor: 'cli', action: 'remove', result: 'ok' });
  io.write(`Removed instance "${label}".\n`);
  if (wasDefault) io.write(`${WAS_DEFAULT(label)}\n`);
  return EXIT_OK;
}
