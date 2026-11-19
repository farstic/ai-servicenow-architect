// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C303 — THE ENGINE'S HALF OF "A PROCESS THAT RUNS AS ROOT WRITES NOTHING" (the architect's ruling, 2026-11-19).
 *
 * `sudo ./snowarch upgrade`, `sudo claude`, a container that runs everything as root: each leaves files in the checkout and in the
 * user's home folder that only root can change, and the next run of the user's own fails on them with a message that does not say why.
 * So a root process does not write. The package's half (the integrity check, the MCP server, the package CLI) is
 * packages/snowarch/src/licence/elevated.ts; this is the engine's: who is root, and the one sentence every refusal ends with.
 *
 * WHO IS ROOT. The effective user id is 0. Where the platform has no `geteuid` (Windows) nobody is root, and nothing here applies.
 */

/**
 * What a refusal tells the person to do: a FRAGMENT, as every sentence the launchers print is. bootstrap.sh prints these words (the
 * launcher text is generated from this constant, scripts/gen-launcher-text.mjs), and the package holds the same words in
 * ELEVATED_REMEDY (packages/snowarch/src/licence/elevated.ts); tools/snowarch/tests/integrity-elevated.test.mjs holds the first two equal, and the launcher parity test the third.
 *
 * It is not a row of remedies.json: those are the seven preflight CHECKS of B00, and two cases pin that
 * (tools/snowarch/tests/b00-checks.test.mjs), because a check without a remedy is a status, not help.
 */
export const ELEVATED_REMEDY =
  'run this as your own user, without sudo: as root it would leave files in this folder, or in your home folder, that only root can change';

/** `ELEVATED_REMEDY` as a sentence: a capital, and a full stop. */
export const elevatedSentence = () => `${ELEVATED_REMEDY[0].toUpperCase()}${ELEVATED_REMEDY.slice(1)}.`;

/** Is this process root? `proc` is the process by default; a case passes an object with its own `geteuid`. */
export const isElevated = (proc = process) => typeof proc.geteuid === 'function' && proc.geteuid() === 0;

// ── which forms a root process may run ─────────────────────────────────────────────────────────────────────────────────

/**
 * THE RULE, FAIL-CLOSED. A form runs as root only when it is NAMED below as one that reads and writes nothing. A command, a
 * sub-command or a flag that is not named is refused, so nothing is guarded by being on a list of writers, and a command added tomorrow
 * is refused until someone has measured it (tools/snowarch/tests/root-guard.test.mjs fails for a registered command with no entry here).
 * `CLI_ALLOWED` (the commands that run without a licence) cannot be reused: it holds `bootstrap`, `upgrade` and `mode design`, which write.
 *
 * Measured 2026-11-19 with a write tracer over every candidate (tests/root-allowed-forms.test.mjs holds the result as a byte-for-byte
 * comparison of the checkout and the home folder): `status` and a `doctor` with the cache on write `.local/doctor-last*.json`; a FULL
 * `doctor` starts Claude Code, which creates `~/.claude.json` and its backups in the HOME it is given, so as root only `doctor --quick`
 * runs; and the quick doctor's `git diff --quiet HEAD` refreshes git's index (see engine-repo.mjs). An allowed form that would write by
 * default is FORCED not to: `flags` are set on the parsed flags, `run` is handed to the command beside them.
 *
 * A rule receives `{ positional, flags, argv, cli }` (`argv` is every word after the command, for the commands that parse their own) and
 * answers `{ ok: true, flags?, run? }` or `{ ok: false, hint? }`.
 */
const READS = Object.freeze({ ok: true });
const REFUSE = Object.freeze({ ok: false });
const refuse = (hint) => (hint ? { ok: false, hint } : REFUSE);
const noPositional = (positional) => positional.length === 0;
const onlyFlags = (flags, allowed) => Object.keys(flags).every((k) => allowed.includes(k));
const COMMON = ['json', 'quiet', 'verbose'];

export const ELEVATED = Object.freeze({
  version: ({ positional, flags }) => (noPositional(positional) && onlyFlags(flags, COMMON) ? READS : REFUSE),
  status: ({ positional, flags }) => (noPositional(positional) && onlyFlags(flags, COMMON) ? { ok: true, run: { writeCache: false } } : REFUSE),
  doctor: ({ positional, flags, cli }) => {
    if (!noPositional(positional) || !onlyFlags(flags, [...COMMON, 'quick', 'no-network', 'no-cache', 'section'])) return REFUSE;
    // A full doctor starts Claude Code, and Claude Code writes into the home folder it is given.
    if (flags.quick !== true) return refuse(`As root only ${cli} doctor --quick runs: it starts nothing and writes nothing.`);
    return { ok: true, flags: { 'no-cache': true } };
  },
  docs: ({ argv }) => (argv.length === 0 || ['status', 'verify', 'lookup'].includes(argv[0]) ? READS : REFUSE),
  licence: ({ positional, flags }) => (['show', 'verify', 'check'].includes(positional[0]) && !('refresh' in flags) && onlyFlags(flags, COMMON)
    ? READS : REFUSE),
  mode: ({ positional, flags }) => (noPositional(positional) && onlyFlags(flags, COMMON) ? READS : REFUSE),
  instance: ({ argv }) => (argv[0] === 'list' && argv.slice(1).every((a) => ['--json', '--all', '--verbose'].includes(a)) ? READS : REFUSE),
  store: ({ argv }) => (argv.length === 1 && argv[0] === 'backups' ? READS : REFUSE),
  bootstrap: () => REFUSE,
  upgrade: () => REFUSE,
});

/**
 * May a root process run this form? `{ ok: true, flags?, run? }`, or `{ ok: false, hint? }`. A name that is not an own key of the table
 * (a command nobody classified, `constructor`, `__proto__`) is refused.
 */
export function elevatedVerdict(name, { positional = [], flags = {}, argv = [] } = {}, { cli = './snowarch' } = {}) {
  const rule = Object.hasOwn(ELEVATED, name) ? ELEVATED[name] : null;
  const v = rule ? rule({ positional, flags, argv, cli }) : null;
  return v?.ok === true ? v : { ok: false, ...(v?.hint ? { hint: v.hint } : {}) };
}

/** What a refused form prints, one line to a string: which command, what root may run, the root sentence, and a hint when there is one. */
export function elevatedRefusal(name, cli, hint) {
  return [`snowarch ${name}: refused: this process runs as root, and only the forms that read and write nothing run as root.`,
    elevatedSentence(), ...(hint ? [hint] : [])];
}
