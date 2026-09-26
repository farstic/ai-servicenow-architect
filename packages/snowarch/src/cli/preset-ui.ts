/**
 * ARC-07-S04 — propose, review, apply. Nothing is imposed and nothing is decided by a probe.
 *
 * D-05, and it is worth being exact about what it rules, because the temptation runs the other
 * way: THE PROPOSAL IS A FUNCTION OF THE ENVIRONMENT ALONE. A probe that came back `not licensed`
 * changes the RECOMMENDATION TEXT on that line and never the toggle — because a probe is a
 * reading of the instance at one moment, and a wizard that silently turned a flag off on the
 * strength of one would produce an installation the user did not choose and cannot explain.
 *
 * Production is capped at `read-only` here with no override at all. Raising it is a separate,
 * named step in a different command (`set-preset --ack-prod`, ARC-07-S06), which is the point:
 * the moment you can raise production inside a wizard, raising production becomes something that
 * happens while you are doing something else.
 */
import {
  FLAG_NAMES, PRESETS, applyDependencyRule, dependentsOf, expandPreset, matchPreset, requiresOf,
  type FlagName, type Flags, type PresetName,
} from '../utils/permissions.js';
import type { LastProbe, ProbeStatus } from '../servicenow/probes.js';
import { cliSpelling } from './tty.js';

/** Every line this screen prints fits here. A wrapped hint is indented under its annotation. */
export const COLUMNS = 100;

export type Environment = 'pdi' | 'dev' | 'test' | 'prod';

/** The short label a reader sees, derived from the flag key — never a second list to maintain. */
export const labelOf = (flag: FlagName): string => flag.replace(/_ENABLED$/, '');

/** The widest label, so the annotations line up without a hard-coded column. */
const LABEL_WIDTH = Math.max(...FLAG_NAMES.map((f) => labelOf(f).length));

/**
 * What `?` prints. Kept beside the screen that prints it, and asserted against
 * `docs/MODES-AND-PRESETS.md` §4 — one meaning per flag, in the page's own words.
 */
export const FLAG_MEANINGS: Readonly<Record<FlagName, string>> = Object.freeze({
  WRITE_ENABLED: 'create, update and delete records (incidents, catalog items, users, agile work, '
    + 'update sets). Without it everything is read-only.',
  CMDB_WRITE_ENABLED: 'additionally, CI and relationship reconciliation writes into the CMDB.',
  SCRIPTING_ENABLED: 'unlocks writing Script Includes, Business Rules, Client Scripts, ACLs, UI '
    + 'Actions and update-set changes. Reading them is always allowed.',
  ATF_ENABLED: 'execute ATF tests and suites; listing and reading tests, suites and results is always allowed. There is no ATF authoring tool: creating or editing a test record goes through the generic record tools and needs WRITE.',
  NOW_ASSIST_ENABLED: 'the Now Assist / generative-AI tools; needs a Now Assist licence on the '
    + 'instance.',
  FLUENT_ENABLED: 'the ServiceNow SDK (Fluent) build and deploy tools; needs @servicenow/sdk, and '
    + 'deploys also need WRITE.',
});

/** P-25: written on every entry, whatever the preset. One constant, consumed by S05's save. */
export const ENTRY_DEFAULTS = Object.freeze({ toolPackage: 'full', maxRecords: 100 });

/** The proposal. The environment, and nothing else — see the note at the top of this file. */
export function proposePreset(environment: Environment): PresetName {
  return environment === 'prod' ? 'read-only' : 'full';
}

// ARC-07-C1, closed by W7: the spelling comes from `cliSpelling`, so a Windows reader is not handed
// a POSIX command. `cli` is a parameter with a default rather than a read inside the string, so a
// test can state the platform instead of mocking `process`.
export const PROD_LOCKED = (label: string, flag: FlagName, cli = cliSpelling()): string =>
  `${labelOf(flag)} is locked on production — raise it later with: ${cli} instance set-preset `
  + `${label} <preset> --ack-prod`;

/** The refusal, in the story's words. Exit 3 — a policy answer, not a usage mistake. */
export const prodRefusal = (label: string, cli = cliSpelling()): string =>
  `PROD_WRITE_NOT_ACKNOWLEDGED — "${label}" is a production instance; the wizard caps production `
  + `at read-only (D-05). Save it read-only now and raise it later with: ${cli} instance `
  + `set-preset ${label} full --ack-prod`;

/**
 * The probe annotation for one flag.
 *
 * `ok` is one word; everything else says what was found AND what it would mean to leave the flag
 * on — a recommendation the user is free to ignore, which is the whole shape of this screen.
 */
/**
 * The statuses on which the review screen recommends turning a flag OFF — ARC-07-C4.
 *
 * ONE definition, two readers. `annotate` below renders "(recommend: off)" for exactly these, and
 * the non-interactive path applies exactly these; a test walks every `ProbeStatus` and asserts the
 * two agree, because a recommendation shown on one path and not applied on the other is how
 * `FLUENT=on` and `fluent not installed` came to print in the same Saved line.
 *
 * `skipped` and `undefined` are NOT here on purpose: a probe that did not run is not a probe that
 * failed, and turning a flag off because nobody looked would be the check-cannot-tell-absence-from-
 * failure defect wearing the other hat.
 */
export const probeRecommendsOff = (status: ProbeStatus | undefined): boolean =>
  status === 'role missing' || status === 'not licensed' || status === 'not installed';

/**
 * The same finding, phrased for a line nobody can answer — ARC-07-C4.
 *
 * `annotate` asks "keep on?", which is right on a screen and wrong on the one line a `--yes` run
 * prints: there is nobody to ask. This states the consequence instead, and returns `null` for
 * exactly the statuses `probeRecommendsOff` rejects, so the two cannot drift — a test walks every
 * status and requires them to agree.
 */
export function probeNote(status: ProbeStatus | undefined,
  recordedAt: string | null = null): string | null {
  if (!probeRecommendsOff(status)) return null;
  // THE SAME PROVENANCE AS THE SCREEN, and for a sharper reason: this is the `--yes` line, which is
  // what a transcript pastes into a sitting record. `set-preset --yes` passes the STORE's probes, so
  // without this the one line most likely to be quoted rendered a days-old measurement exactly like
  // a fresh one. Beside the status, as on the screen (ARC-07-C9).
  const when = recordedSuffix(recordedAt);
  switch (status) {
    case 'role missing':
      return `probe: role missing${when} — those tools will fail until the account has the role`;
    case 'not licensed':
      return `probe: no Now Assist licence detected${when} — those tools will fail until licensed`;
    default:
      return `probe: not installed${when} — tools will fail until @servicenow/sdk is on PATH`;
  }
}

/**
 * WHEN THE PROBE WAS TAKEN — `null` for one that has just run.
 *
 * The screen renders the same `probe: ok` whether the probe ran a second ago or was read out of the
 * store, and the two callers differ: `instance add`, `instance test` and `import --from-legacy`
 * probe live and pass what they measured, while **`set-preset` passes `entry.lastProbe`** — a value
 * that can be any age. The owner asked the question in the 2026-09-23 sitting: *either the probes
 * are fresh and should be written, or they are the recorded ones and the word should say so*. They
 * are the recorded ones, so the word says so.
 *
 * A DATE, not an age: "recorded 2026-09-19" stays true tomorrow, where "5 days ago" is a sentence
 * that has to be recomputed to stay honest and is wrong in a transcript the moment it is pasted.
 */
export const recordedSuffix = (at: string | null | undefined): string =>
  (at ? ` (recorded ${String(at).slice(0, 10)})` : '');

/**
 * The status phrase, split from what follows it so the provenance can sit beside the STATUS rather
 * than at the end of a sentence that is already asking a question — `probe: role missing (recorded
 * 2026-09-19) — …; keep on?` reads; the same qualifier after `(recommend: off)` does not.
 */
/**
 * How to take the recommendation, named on the line that makes it (ARC-07-C13).
 *
 * The owner met the FLUENT line on v2.0.5, read `keep on? (recommend: off)` over a footer saying
 * `Enter = accept as shown`, pressed Enter, and got `FLUENT=on`. Both sentences are true and together
 * they mislead: the line ASKS a question and recommends an answer, and the only way to give that
 * answer is to already know the footer's "type a flag name" applies to it.
 *
 * THE TOGGLE STAYS ON. ADR-0005 — owner-decided 2026-09-04 — pre-sets every flag ON and rules that
 * "a failing probe changes only the recommendation text on that line, never the toggle"; ARC-07-C4
 * asserts it on the `--yes` path, where applying silently would overrule a user on the path whose
 * whole promise is "no review screen". So the text is the only thing this may change, and it is
 * exactly what the ADR leaves open.
 *
 * The LABEL, not the flag constant: `labelOf` strips `_ENABLED`, the box shows that label, and the
 * loop matches it case-insensitively — so the word printed here was the word that works.
 *
 * ARC-07-C14 moved what this line PRINTS to the row number. The label still resolves at the prompt
 * as a deliberately undocumented alias (the dispatch below), so no existing habit broke — but the
 * footer and the recommendation now name one grammar, and it is the number.
 */
/**
 * The row number that opens this flag's question (ARC-07-C14), or nothing when there is no row.
 *
 * DERIVED from the row index and never spelled: the number is a property of where the flag sits in
 * `FLAG_NAMES`, so a flag inserted tomorrow renumbers every line below it and this text follows.
 * ARC-07-C13 named the label here (`type FLUENT to turn it off`) because the label was then the only
 * way to act on the line; the owner's ruling makes the number the documented way, so the text names
 * what the footer documents.
 */
const howToTakeIt = (row?: number): string => (row ? ` (type ${row})` : '');

function annotationParts(status: ProbeStatus | undefined, hint?: string,
  row?: number): { head: string; tail: string } {
  const recommendOff = `recommend: off${howToTakeIt(row)}`;
  switch (status) {
    case 'ok': return { head: 'ok', tail: '' };
    case 'role missing':
      return { head: 'role missing',
        tail: ` — ${hint ?? 'the account cannot read that table family'} — ${recommendOff}` };
    case 'not licensed':
      return { head: 'no Now Assist licence detected',
        tail: ` — tools will fail until licensed — ${recommendOff}` };
    case 'not installed':
      return { head: '@servicenow/sdk not on PATH', tail: ` — ${recommendOff}` };
    case 'skipped': return { head: 'skipped', tail: '' };
    case undefined: return { head: 'not run', tail: '' };
    default: return { head: String(status), tail: '' };
  }
}

export function annotate(status: ProbeStatus | undefined, hint?: string,
  recordedAt: string | null = null, row?: number): string {
  const { head, tail } = annotationParts(status, hint, row);
  // `not run` is never qualified: there is no probe, so there is no date to name — a provenance on
  // an absence would be describing a record that does not exist.
  const when = status === undefined ? '' : recordedSuffix(recordedAt);
  return `probe: ${head}${when}${tail}`;
}

/** The `LastProbe` field that carries a flag's result. One mapping, used by the screen and S05. */
export const PROBE_FIELD: Readonly<Record<FlagName, keyof Omit<LastProbe, 'at' | 'auth'>>> =
  Object.freeze({
    WRITE_ENABLED: 'write',
    CMDB_WRITE_ENABLED: 'cmdb',
    SCRIPTING_ENABLED: 'scripting',
    ATF_ENABLED: 'atf',
    NOW_ASSIST_ENABLED: 'nowAssist',
    FLUENT_ENABLED: 'fluent',
  });

export interface ScreenInput {
  label: string;
  environment: Environment;
  preset: PresetName;
  flags: Flags;
  probes?: LastProbe;
  /**
   * WHEN the probes in `probes` were taken, or `null`/absent when they have just been measured.
   *
   * `set-preset` reads `entry.lastProbe` out of the store, so its screen can be annotating a probe
   * from days ago; `instance add`, `instance test` and `import --from-legacy` pass what they just
   * measured. Rendering the two identically is what the owner's sitting flagged.
   */
  probesRecordedAt?: string | null;
  /** Per-flag hint text, for `role missing`. */
  hints?: Partial<Record<FlagName, string>>;
  /**
   * The production cap, lifted — and ONLY by ARC-07-S06's `set-preset --ack-prod` after the label
   * has been typed back (D-05).
   *
   * The cap is not a rendering detail: a screen whose boxes can be toggled on a `prod` instance is
   * the moment raising production becomes something that happens while you are doing something
   * else, which is exactly what S04 refuses. So the wizard never sets this, there is no flag that
   * reaches it from `instance add`, and the only caller is the branch that has already printed the
   * warning and read the label back.
   */
  prodAcknowledged?: boolean;
}

/**
 * Wrap `text` to `width`, on word boundaries.
 *
 * Truncation is not an option: the part of a hint that gets cut is the part that says what to do
 * about it, and a reader cannot tell anything is missing. A word longer than the width is left
 * whole and allowed to overflow — breaking a URL or a table name in half helps nobody.
 */
export function wrapText(text: string, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current === '' ? word : `${current} ${word}`;
    if (candidate.length > width && current !== '') {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current !== '') lines.push(current);
  return lines.length > 0 ? lines : [''];
}

/**
 * One flag row: a FIXED prefix and a wrapped annotation under it.
 *
 * Wrapping the whole row as one string was the first attempt, and it collapsed the column
 * padding — `NOW_ASSIST` sat one space from its annotation while every other row lined up,
 * because the padding is consecutive spaces and a word-wrapper eats those. The prefix is
 * therefore never wrapped; only the text after it is.
 */
export function wrapRow(prefix: string, note: string, columns = COLUMNS): string[] {
  const width = Math.max(20, columns - prefix.length);
  const [first, ...rest] = wrapText(note, width);
  return [prefix + first, ...rest.map((line) => ' '.repeat(prefix.length) + line)];
}

/** The screen, byte for byte. The snapshot files in `docs/snippets/` are this function's output. */
/**
 * What the proposal actually IS, read off the flags.
 *
 * ARC-08-C23 — this said `non-production: everything on` for every non-production environment,
 * whatever the preset. So `set-preset pdi read-only` printed
 * `read-only  — non-production: everything on`: a header contradicting the word beside it, on the
 * screen whose entire job is to show what is about to be turned on. The phrase was describing the
 * ENVIRONMENT — "this is not production, so we are allowed to offer everything" — and reading as a
 * description of the PRESET.
 *
 * It is read from the flags rather than from the preset NAME, so `custom` gets an honest sentence
 * too and a preset whose expansion changes cannot leave this line behind.
 */
export function presetNote(flags: Flags): string {
  const on = FLAG_NAMES.filter((f) => flags[f] === 'true');
  if (on.length === 0) return 'nothing on';
  if (on.length === FLAG_NAMES.length) return 'everything on';
  return `${on.length} of ${FLAG_NAMES.length} on`;
}

export function renderReviewScreen(input: ScreenInput): string {
  const { label, environment, preset, flags, probes, hints, probesRecordedAt } = input;
  // LOCKED, not "is production": an acknowledged raise is still production — the banner says so —
  // and what the acknowledgement changes is whether the boxes may be touched.
  const locked = environment === 'prod' && input.prodAcknowledged !== true;
  const lines: string[] = [];

  lines.push(locked
    ? `Proposed preset for "${label}" (${environment}): ${preset}  — production is capped at `
      + 'read-only (D-05)'
    : environment === 'prod'
      ? `Preset for "${label}" (${environment}): ${preset}  — PRODUCTION, raise acknowledged`
      // `non-production:` is the ENVIRONMENT half and stays — it is why everything MAY be on.
      // What follows it is now the proposal's own description instead of a repetition of that
      // permission, so `full` renders exactly as it always did and `read-only` stops claiming the
      // opposite of the word beside it.
      : `Proposed preset for "${label}" (${environment}): ${preset}  `
        + `— non-production: ${presetNote(flags)}`);

  // ARC-07-C14 — A NUMBER PER ROW, in the existing flag order, because that is what the user types.
  // The plan screen numbers its lines and the owner read those correctly; this screen is the same
  // grammar one step later, and the number is the only thing the footer documents.
  FLAG_NAMES.forEach((flag, i) => {
    const row = i + 1;
    const box = !locked && flags[flag] === 'true' ? '[x]' : '[ ]';
    const name = labelOf(flag).padEnd(LABEL_WIDTH + 2);
    const note = locked
      ? 'locked on production'
      : annotate(probes?.[PROBE_FIELD[flag]], hints?.[flag], probesRecordedAt ?? null, row);
    lines.push(...wrapRow(`  ${row}  ${box} ${name} `, note));
  });

  // The story's footer is 111 characters and the budget is 100, so it WRAPS — the same rule as a
  // long hint, and for the same reason: a terminal that folds it in the middle of a word is
  // harder to read than one continuation line.
  const footer = locked
    ? `Enter = accept · to raise this instance later: ${cliSpelling()} instance set-preset ${label} `
      + '<preset> --ack-prod'
    : 'Enter = apply as shown · a number opens that flag · "preset <name>" switches · "?" explains';
  lines.push(...wrapRow('', footer));
  return lines.join('\n');
}

/** `Applying: preset custom — WRITE=on CMDB_WRITE=on …` — printed before anything is saved. */
export function applyingLine(preset: PresetName, flags: Flags,
  because: Partial<Record<FlagName, string>> = {}): string {
  // ARC-07-C4 — a flag the PROBE turned off says so, inline. The non-interactive path has no
  // review screen to explain itself on, so the one line it does print has to carry the reason or
  // the user is silently overruled.
  const pairs = FLAG_NAMES.map((f) => {
    const state = flags[f] === 'true' ? 'on' : 'off';
    const why = because[f];
    return why ? `${labelOf(f)}=${state} (${why})` : `${labelOf(f)}=${state}`;
  });
  return `Applying: preset ${preset} — ${pairs.join(' ')}`;
}

export interface FlagsParse {
  ok: boolean;
  flags?: Flags;
  message?: string;
}

/**
 * `--flags WRITE=on,CMDB_WRITE=on,…` — all six, or it is not a description of an installation.
 *
 * Five entries is a usage error naming the missing flag rather than a default for it: the whole
 * point of the flag form is that a machine said exactly what it wanted, and filling in the sixth
 * would be the wizard choosing while claiming the caller did.
 */
export function parseFlagsArg(raw: string): FlagsParse {
  const given = new Map<string, string>();
  for (const part of String(raw).split(',').map((s) => s.trim()).filter(Boolean)) {
    const [key, value] = part.split('=').map((s) => s.trim());
    const flag = FLAG_NAMES.find((f) => labelOf(f).toLowerCase() === String(key).toLowerCase()
      || f.toLowerCase() === String(key).toLowerCase());
    if (!flag) return { ok: false, message: `--flags: "${key}" is not a flag (expected ${FLAG_NAMES.map(labelOf).join(', ')})` };
    const on = ['on', 'true'].includes(String(value).toLowerCase());
    const off = ['off', 'false'].includes(String(value).toLowerCase());
    if (!on && !off) return { ok: false, message: `--flags: ${labelOf(flag)}=${value} — expected on or off` };
    given.set(flag, on ? 'true' : 'false');
  }

  const missing = FLAG_NAMES.filter((f) => !given.has(f));
  if (missing.length > 0) {
    return { ok: false,
      message: `--flags needs all six flags; missing: ${missing.map(labelOf).join(', ')}` };
  }

  const flags = Object.fromEntries(FLAG_NAMES.map((f) => [f, given.get(f)])) as Flags;
  const violation = dependencyViolation(flags);
  return violation ? { ok: false, message: violation } : { ok: true, flags };
}

/** The dependency rule as a sentence, or null. The UI's copy of the server's own rule. */
export function dependencyViolation(flags: Flags): string | null {
  // The graph is `permissions.ts`'s (ARC-07-S05 carry-over): this file used to re-encode "WRITE ←
  // CMDB_WRITE, SCRIPTING" as literals, which is a second definition of a rule the server already
  // owns — and the copy nobody would think to update when a third dependency appears.
  for (const flag of FLAG_NAMES) {
    if (flags[flag] !== 'true') continue;
    const unmet = requiresOf(flag).filter((needed) => flags[needed] !== 'true');
    if (unmet.length > 0) {
      return `${labelOf(flag)} requires ${unmet.map(labelOf).join(' and ')} — scripting and CMDB `
        + 'writes are writes, so declaring one without WRITE is a contradiction';
    }
  }
  return null;
}

export interface ReviewIo {
  /** One line from the operator, or null when input has ended. */
  ask: (prompt: string) => Promise<string | null>;
  write: (text: string) => void;
}

export interface ReviewResult {
  preset: PresetName;
  flags: Flags;
  cancelled?: boolean;
}

/**
 * The screen, until Enter.
 *
 * Case-insensitive because the labels are shouted in the screen and typed in lower case by
 * everyone. `q` and end-of-input both cancel, and cancelling saves nothing — which is why the
 * result says so rather than returning a preset the caller might write.
 */
/**
 * `FLUENT:  [1] on (current)  [2] off — recommended: @servicenow/sdk not on PATH` (ARC-07-C14).
 *
 * The reason appears only when the probe recommends off, and it is `annotationParts`' own head — one
 * definition, so the question and the row cannot describe the same probe differently.
 */
export function flagQuestion(flag: FlagName, flags: Flags, status?: ProbeStatus, hint?: string): string {
  const on = flags[flag] === 'true';
  const why = probeRecommendsOff(status) ? ` — recommended: ${annotationParts(status, hint).head}` : '';
  return `${labelOf(flag)}:  [1] on${on ? ' (current)' : ''}  [2] off${on ? '' : ' (current)'}${why}`;
}

/**
 * One answer to a flag's question: `1`/`2`, `on`/`off`, or nothing.
 *
 * `null` means leave it and go back to the screen — Enter APPLIES at the screen's own prompt, and a
 * row opened by mistake must not change a permission. `undefined` is an answer that is not an option.
 *
 * THE PLAN SCREEN'S SEMANTICS, DELIBERATELY NOT ITS CODE: `resolveChoice` lives in
 * `tools/snowarch/lib/plan.mjs`, and the engine and the server are separate packages — `plan.mjs`'s
 * own comment records that the engine must not depend on the server, and nothing depends the other
 * way either. Importing across that line to share four lines would buy consistency with a coupling
 * neither package has today, so the grammar is shared and the function is not.
 */
export function resolveFlagAnswer(input: string | null): 'true' | 'false' | null | undefined {
  const answer = String(input ?? '').trim().toLowerCase();
  if (answer === '') return null;
  if (answer === '1' || answer === 'on') return 'true';
  if (answer === '2' || answer === 'off') return 'false';
  return undefined;
}

export async function runReviewScreen(input: ScreenInput, io: ReviewIo): Promise<ReviewResult> {
  const prod = input.environment === 'prod' && input.prodAcknowledged !== true;
  let flags: Flags = { ...input.flags };
  let preset = input.preset;

  for (;;) {
    io.write(`${renderReviewScreen({ ...input, preset, flags })}\n`);
    const answer = await io.ask('> ');
    if (answer === null) return { preset, flags, cancelled: true };
    const line = answer.trim();
    const lower = line.toLowerCase();

    if (line === '') {
      const effective = prod ? expandPreset('read-only') : flags;
      return { preset: prod ? 'read-only' : matchPreset(effective), flags: effective };
    }
    if (lower === 'q') return { preset, flags, cancelled: true };
    if (lower === '?' || lower === 'help') {
      // ARC-07-C14 — the KEYS first, then the flags. The plan screen's `?` explains both for the same
      // reason: a footer long enough to say what a number, Enter and q each do is a footer nobody
      // finishes, and the number is the one thing a reader has to be told about.
      io.write(`${wrapRow('  a number — ', 'opens that flag and asks whether it should be on or off; '
        + 'nothing is applied until you press Enter.').join('\n')}\n`);
      for (const flag of FLAG_NAMES) {
        io.write(`${wrapRow(`  ${labelOf(flag)} — `, FLAG_MEANINGS[flag]).join('\n')}\n`);
      }
      continue;
    }
    if (lower.startsWith('preset ')) {
      const name = lower.slice('preset '.length).trim();
      if (!(name in PRESETS) && name !== 'custom') {
        io.write(`unknown preset "${name}" — one of: ${[...Object.keys(PRESETS), 'custom'].join(', ')}\n`);
        continue;
      }
      if (prod && name !== 'read-only') {
        // Whichever flag the user reached for; the first is as good a stand-in as any when they
        // asked for a preset rather than a flag.
        io.write(`${PROD_LOCKED(input.label, FLAG_NAMES[0])}\n`);
        continue;
      }
      preset = name as PresetName;
      flags = expandPreset(preset);
      continue;
    }

    // ARC-07-C14 — A NUMBER OPENS THAT FLAG'S QUESTION. A flag NAME still works and is deliberately
    // undocumented: the footer names one way so the screen teaches one grammar, and nobody's habit
    // breaks. `byRow` is the documented path; `byName` is the alias.
    const byRow = /^\d+$/.test(lower) ? FLAG_NAMES[Number(lower) - 1] : undefined;
    const byName = FLAG_NAMES.find((f) => labelOf(f).toLowerCase() === lower || f.toLowerCase() === lower);
    const flag = byRow ?? byName;
    if (!flag) {
      io.write(`"${line}" is not a row number or a command — Enter to apply, a number to open a `
        + 'flag, "preset <name>" to switch, "?" for help\n');
      continue;
    }
    if (prod) {
      io.write(`${PROD_LOCKED(input.label, flag)}\n`);
      continue;
    }

    if (byRow) {
      const row = Number(lower);
      io.write(`${flagQuestion(flag, flags, input.probes?.[PROBE_FIELD[flag]], input.hints?.[flag])}\n`);
      const picked = await io.ask('> ');
      if (picked === null) return { preset, flags, cancelled: true };   // stdin closed: not an apply
      const want = resolveFlagAnswer(picked);
      if (want === undefined) {
        io.write(`"${String(picked).trim()}" is not one of [1] on  [2] off\n`);
        continue;
      }
      if (want === null) continue;                        // leave it, back to the screen
      // THE SAME FUNCTION AS THE NAME PATH, so the dependency conversation is not a second copy:
      // the flags are binary, so asking `toggleFlag` for a value it already holds is a no-op and
      // asking for the other one is exactly the toggle the name path performs.
      if (flags[flag] !== want) {
        const before = flags;
        flags = await toggleFlag(flags, flag, io);
        preset = matchPreset(flags);
        if (flags[flag] !== before[flag]) {
          io.write(`${labelOf(flag)} → ${flags[flag] === 'true' ? 'on' : 'off'} · Enter applies · `
            + `${row} changes it again · q quits\n`);
        }
      }
      continue;
    }

    flags = await toggleFlag(flags, flag, io);
    preset = matchPreset(flags);
  }
}

/**
 * One toggle, and the conversation the dependency rule needs.
 *
 * `n` keeps the state the story asks for in each direction: turning WRITE off with dependents on
 * leaves WRITE ON (the alternative is a contradiction the server would resolve by force), and
 * turning a dependent on with WRITE off leaves BOTH OFF.
 */
export async function toggleFlag(current: Flags, flag: FlagName, io: ReviewIo): Promise<Flags> {
  const next: Flags = { ...current, [flag]: current[flag] === 'true' ? 'false' : 'true' };

  // Turning something OFF that others need.
  if (next[flag] === 'false') {
    const stranded = dependentsOf(flag).filter((f) => next[f] === 'true');
    if (stranded.length > 0) {
      const answer = await io.ask(
        `${stranded.map(labelOf).join(' and ')} require ${labelOf(flag)} — turn them off as well? [Y/n] `);
      if (isNo(answer)) return current;                       // the needed flag stays on
      for (const f of stranded) next[f] = 'false';
    }
  }

  // Turning something ON that needs others.
  if (next[flag] === 'true') {
    const unmet = requiresOf(flag).filter((needed) => next[needed] !== 'true');
    if (unmet.length > 0) {
      const answer = await io.ask(
        `${labelOf(flag)} requires ${unmet.map(labelOf).join(' and ')} — turn `
        + `${unmet.length === 1 ? 'it' : 'them'} on too? [Y/n] `);
      if (isNo(answer)) return current;                       // both stay off
      for (const f of unmet) next[f] = 'true';
    }
  }

  // The server's rule, applied again here: the screen must never show a state the server would
  // refuse to honour.
  return applyDependencyRule(next).effective;
}

const isNo = (answer: string | null): boolean =>
  ['n', 'no'].includes(String(answer ?? '').trim().toLowerCase());

export interface ResolveInput {
  label: string;
  environment: Environment;
  preset?: string;
  flags?: string;
  yes?: boolean;
  probes?: LastProbe;
  /**
   * WHEN the probes in `probes` were taken, or `null`/absent when they have just been measured.
   *
   * `set-preset` reads `entry.lastProbe` out of the store, so its screen can be annotating a probe
   * from days ago; `instance add`, `instance test` and `import --from-legacy` pass what they just
   * measured. Rendering the two identically is what the owner's sitting flagged.
   */
  probesRecordedAt?: string | null;
  hints?: Partial<Record<FlagName, string>>;
  io?: ReviewIo;
  /** See `ScreenInput.prodAcknowledged` — S06's `--ack-prod`, after the label was typed back. */
  prodAcknowledged?: boolean;
}

export interface ResolveResult {
  ok: boolean;
  preset?: PresetName;
  flags?: Flags;
  applying?: string;
  /** Set when the answer is a refusal: the caller exits with it and writes nothing. */
  exitCode?: number;
  message?: string;
}

/**
 * The whole decision, with nothing written.
 *
 * S05 owns the save; this owns what would be saved, and returns BEFORE any store call on every
 * refusal path — which is what makes "writes nothing" testable here rather than only end to end.
 */
export async function resolveFlags(input: ResolveInput): Promise<ResolveResult> {
  const { label, environment, yes, io } = input;
  const prod = environment === 'prod' && input.prodAcknowledged !== true;

  let flags: Flags;
  let preset: PresetName;

  if (input.flags !== undefined) {
    const parsed = parseFlagsArg(input.flags);
    if (!parsed.ok) return { ok: false, exitCode: 2, message: parsed.message as string };
    flags = parsed.flags as Flags;
    preset = matchPreset(flags);
  } else if (input.preset !== undefined) {
    const name = String(input.preset).toLowerCase();
    if (!(name in PRESETS) && name !== 'custom') {
      return { ok: false, exitCode: 2,
        message: `--preset must be one of ${[...Object.keys(PRESETS), 'custom'].join(', ')}, not "${input.preset}"` };
    }
    preset = name as PresetName;
    flags = expandPreset(preset);
  } else {
    preset = proposePreset(environment);
    flags = expandPreset(preset);
  }

  // The production cap, before anything else looks at the flags: a `prod` instance with any flag
  // on is a policy answer, not a preference to review.
  if (prod && FLAG_NAMES.some((f) => flags[f] === 'true')) {
    const message = prodRefusal(label);
    if (yes) return { ok: false, exitCode: 3, message };
    if (!io) return { ok: false, exitCode: 3, message };
    io.write(`${message}\n`);
    const answer = await io.ask(`Save "${label}" as read-only instead? [Y/n] `);
    if (isNo(answer)) return { ok: false, exitCode: 3, message };
    const readOnly = expandPreset('read-only');
    return { ok: true, preset: 'read-only', flags: readOnly,
      applying: applyingLine('read-only', readOnly) };
  }

  if (prod) { preset = 'read-only'; flags = expandPreset('read-only'); }

  if (yes || !io) {
    // ARC-07-C4 — D-05 APPLIED TO THE PATH THAT WAS NOT APPLYING IT.
    //
    // `instance add … --yes` printed `Applying: … FLUENT=on` in the same run whose probe said
    // `fluent not installed`, and the Saved line then carried both. The probes were computed and
    // handed ONLY to the review screen, so the path with nobody to ask showed nothing at all.
    //
    // The toggle is NOT touched, and that is the owner's ruling rather than a preference:
    // ADR-0005 says "a failing probe changes only the recommendation text on that line, never the
    // toggle". What was missing here is the recommendation text — every flag is supposed to be
    // "annotated with its live probe result", and this path annotated none of them. So the line
    // now explains itself and still saves exactly what was asked for.
    const because: Partial<Record<FlagName, string>> = {};
    for (const flag of FLAG_NAMES) {
      if (flags[flag] !== 'true') continue;
      const note = probeNote(input.probes?.[PROBE_FIELD[flag]], input.probesRecordedAt ?? null);
      if (note) because[flag] = note;
    }
    return { ok: true, preset, flags, applying: applyingLine(preset, flags, because) };
  }

  const reviewed = await runReviewScreen({
    label, environment, preset, flags,
    ...(input.probes ? { probes: input.probes } : {}),
    ...(input.probesRecordedAt ? { probesRecordedAt: input.probesRecordedAt } : {}),
    ...(input.hints ? { hints: input.hints } : {}),
    ...(input.prodAcknowledged ? { prodAcknowledged: true } : {}),
  }, io);
  if (reviewed.cancelled) {
    return { ok: false, exitCode: 130, message: 'Cancelled — nothing saved.' };
  }
  return { ok: true, preset: reviewed.preset, flags: reviewed.flags,
    applying: applyingLine(reviewed.preset, reviewed.flags) };
}
