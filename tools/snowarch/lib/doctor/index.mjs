// ARC-08-S01 — the `doctor` command: decide whether it can run at all, then run it.
//
// THE THREE THINGS THAT STOP IT are checked before any check is registered, because each of them
// makes every check meaningless and a report full of failures caused by one of them is a report
// that hides its own cause:
//
//   not at the repository root  →  exit 3, and the remedy is `cd`
//   `engine.config.json` unparsable  →  exit 3, naming the file
//   Node below the floor  →  exit 3, with the per-OS install command
//
// Everything else is a check result. Exit 1 means at least one FAIL; exit 0 means none, warnings
// included; exit 2 is a usage error, which is a fact about the command line rather than the
// checkout.
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { loadState } from '../state.mjs';
import { dirname, join, resolve } from 'node:path';

import { loadContract } from '../../../../packages/contract/lib/contract.mjs';
import { EXIT_OK, EXIT_USAGE, EXIT_PREREQ } from '../exit.mjs';
import { meetsFloor } from '../versions.mjs';
import { childEnv } from '../spawn-env.mjs';

import { SECTIONS } from './registry.mjs';
import { askOnce } from '../ask.mjs';
import { versionInfo } from '../version-info.mjs';
import { engineBlock, engineRegistry, serverBlock, staleBlock,
  summariseMerged } from './checks/index.mjs';
import { deriveMode, modeLine, modeLineDetailed } from './mode.mjs';
import { applyPlan, buildPlan, fixesBlock, logFix, renderPlan } from './fix.mjs';
import { cacheStale, writeReportCache } from '../doctor-cache.mjs';
import { contractSha, version as engineVersion } from '../config.mjs';
import { collectPrereqs } from './prereqs.mjs';
import { buildReport } from './report-json.mjs';
import { renderText, useColour } from './report-text.mjs';
import { exitCodeFor, runChecks, selectSections } from './runner.mjs';
import { maskForJson } from './json-boundary.mjs';

export const USAGE = [
  'usage: ./snowarch doctor [--json] [--quick] [--no-network] [--fix] [--section <a,b>] [--no-cache]',
  '',
  `  --section <a,b>   only these sections: ${SECTIONS.join(', ')} (server = every SV- check)`,
  '  --quick           the fast subset; implies --no-network and skips anything that spawns',
  '  --no-network      skip every check that would contact the network',
  '  --fix             repair what is marked fixable (ARC-08-S06)',
  '  --json            the machine-readable report (schema 1). This is the form that travels:',
  '                    instance labels and hosts are masked; machine consumers use the report object.',
  '  --no-cache        do not write .local/doctor-last.json',
  '',
  'exit codes:',
  '  0  no FAIL (warnings allowed)',
  '  1  at least one FAIL',
  '  2  usage — an unknown flag or section',
  '  3  the doctor could not run at all',
].join('\n');

/** The message a run from a sub-directory gets. One sentence, and the command that fixes it. */
export const notAtRoot = (root) => `DOCTOR: not at the repository root — run: cd ${root}`;

/**
 * Walk up for `engine.config.json`, and stop at the git top level.
 *
 * `lib/config.mjs` resolves the root from the MODULE's own location, which is right for a launcher
 * that is always inside the checkout. The doctor answers a different question — "is the user's
 * current directory inside a checkout, and which one" — so it walks from the cwd, and the answer
 * `no` is exit 3 rather than a guess.
 */
/** `realpathSync.native` where it works, the path itself where it does not (a path not yet there). */
function realpathOrSelf(p) {
  try { return realpathSync.native(p); } catch { return p; }
}

/**
 * The engine's version, or `null`.
 *
 * A checkout with no `package.json` is not one anybody should be running from — E-05 says so — but
 * the doctor is the tool people run BECAUSE something is wrong, and dying while assembling a
 * report about a broken checkout is the one failure mode it cannot have.
 */
function readVersion(root) {
  try {
    return engineVersion(root);
  } catch {
    return null;
  }
}

/**
 * Is the server enabled for this checkout? The toggle file decides, and only the toggle file.
 *
 * `disabledMcpjsonServers` wins over `enabledMcpjsonServers` in Claude Code, so the question is
 * "is the key on the disabled list", not "is it on the enabled one". An absent file means nothing
 * has disabled it.
 */
export function serverEnabled(root, config) {
  try {
    const settings = JSON.parse(
      readFileSync(join(root, '.claude', 'settings.local.json'), 'utf8'));
    const disabled = Array.isArray(settings.disabledMcpjsonServers)
      ? settings.disabledMcpjsonServers : [];
    return !disabled.includes(config?.mcp?.serverKey);
  } catch {
    return true;
  }
}

/** The recorded mode, or `null`. An unreadable state file is E-11's finding, not this one's. */
export function readMode(root) {
  try {
    return JSON.parse(readFileSync(join(root, '.local', 'bootstrap-state.json'), 'utf8'))?.mode ?? null;
  } catch {
    return null;
  }
}

export function findRoot(from) {
  let current = resolve(from);
  for (;;) {
    if (existsSync(join(current, 'engine.config.json'))) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * The whole command.
 *
 * `registry` is injected so a test can register exactly the checks its case needs — the default is
 * the engine's twenty-three (ARC-08-S02), and a test that wants one check does not get the other
 * twenty-two's answers in its assertions.
 */
/**
 * THE RUN, without a terminal: every caller that wants the REPORT rather than an exit code.
 *
 * ARC-06's B08 is the second caller (it verifies the server after an install), and before this it
 * had its own handshake, its own comparisons and its own cache write — three implementations of
 * what the doctor already does, kept in step by nothing. A step that wants "is the server right?"
 * asks the thing whose job that is.
 *
 * `writeCache: true` overrides the section rule for exactly that caller: B08 runs `--section
 * server` and its answer IS what the banner should hold after an install.
 */
export async function runDoctor({ root, config, registry = engineRegistry(), sections = null,
  quick = false, noNetwork = false, fix = false, section = null, writeCache = 'auto',
  env = process.env, home = '', now = () => Date.now(), started = null } = {}) {
  const startedAt = started ?? now();
  const options = { quick, noNetwork: noNetwork || quick, fix, section, sections };

  let contract = null;
  try {
    contract = loadContract({ root, verifyPin: false });
  } catch { contract = null; }

  const ctx = {
    root,
    config,
    contract,
    // The recorded mode, read once: an absent server dependency is the DESIGN in design-only and a
    // broken install in live, and the checks that say so must not each re-read the state file.
    mode: readMode(root),
    flags: options,
    platform: process.platform,
    env: childEnv(root),
    // Supplied by the entry point. Nothing under `lib/` reads the home directory itself — the
    // repo-wide rule — and the doctor needs it only to shorten a path to `~` in a report.
    home,
    now,
  };

  const checks = registry.all();
  const { results } = await runChecks(checks, ctx, { ...options, home });
  // The merged summary, not the runner's: one condition that two checks report from different
  // angles (E-25's checkout and SV-02's store, both cloud-synced) is one thing to fix.
  const summary = summariseMerged(results, checks);

  // `null` when no server check ran, which since ARC-09-C8 includes every `--quick` run: the
  // section left that subset because entering it costs one in-process run of the server's own
  // doctor. Schema v1 already says what null means here — "no check filled it" — and every
  // consumer reads it that way, so this needs no third state and gets none.
  const server = ctx._server === undefined ? null : serverBlock(ctx._server);
  const instances = server?.instances ?? [];
  // The mode: derived here, from the toggle file and the store, and from nothing else. Not from
  // `~/.claude.json`, which belongs to Claude Code and describes a registration rather than a
  // configuration (`00` P-05/P-21).
  const derived = deriveMode({
    toggles: { enabled: serverEnabled(root, config) },
    instances,
    bootstrapped: existsSync(join(root, '.local', 'bootstrap-state.json')),
  });
  const data = (id) => results.find((r) => r.id === id)?.data ?? null;
  const toolCount = data('SV-05')?.toolCount ?? null;

  const report = buildReport({
    results,
    checks,
    summary,
    options,
    root,
    durationMs: now() - startedAt,
    mode: derived.mode,
    modeLine: modeLine(derived, { summary, at: new Date(now()) }),
    modeLineDetailed: modeLineDetailed(derived, {
      contract,
      instances,
      flags: instances.find((i) => i.label === derived.instance?.label)?.effectiveFlags ?? null,
      toolCount: toolCount === null
        ? (contract ? { count: contract.tools.length, source: 'contract' } : null)
        : { count: toolCount, source: 'server' },
    }),
    // ONE source for the header (ARC-09-S04). It read the version and the sha for itself until
    // then, which is two programs answering "what is this checkout" from two readers — and the day
    // they disagreed, `/snowarch status` would quote one while the tag said the other.
    // `full: false` — the header takes `version`, `tag.name` and `contractSha`. The tag's message,
    // the shallow hint and the commit state are for the human lines and cost three more `git`
    // spawns, on the path the SessionStart banner runs before a session's first word.
    engine: engineBlock(results, versionInfo(root, { full: false })),
    prereqs: {
      ...collectPrereqs({ root, config, env }),
      // E-04 resolved these; the renderer's `Capabilities:` line reads them from here rather than
      // resolving them again.
      capabilities: data('E-04')?.packs ?? null,
    },
    // Filled by ARC-08-S03's detectors, from their own results — `null` until one of them ran, so
    // a `--section contract` run does not claim there are no leftovers.
    stale: results.some((r) => ['E-23', 'E-24'].includes(r.id) && r.status !== 'skip')
      ? staleBlock(results)
      : null,
    // Filled by ARC-08-S04 from the server module's own report — `null` when no SV check ran, so a
    // `--section docs` run does not claim to know anything about the server.
    server,
  });

  // The cache is what the banner reads when it has 300 ms and no Node. A PARTIAL report must never
  // land there: `--section docs` would tell the banner that thirty checks it never ran had passed.
  // `--no-cache` is the same decision, made by the user.
  const auto = writeCache === 'auto' ? sections === null : writeCache === true;
  let cacheError = null;
  if (auto) {
    try {
      writeReportCache(root, report, { now: new Date(now()) });
    } catch (e) {
      cacheError = e.message;
    }
  }
  return { report, checks, summary, derived, cacheError, ctx };
}

/**
 * `--fix`: run, propose, apply, run again.
 *
 * The second run is not a formality — it is the answer. A repair that reported `applied` and left
 * a check failing is exactly the outcome a user cannot see from a plan, so the exit code and the
 * report they read are the RE-RUN's, and the fixes are listed above it.
 */
export async function fixCommand({ root, config, registry, options, env, home, now, write, ask,
  yes = false, deps = {} }) {
  // `write` here is the NARRATION channel, not stdout. Under `--json` the caller hands us stderr:
  // a plan printed above the object made `JSON.parse(stdout)` fail on the first character, which
  // is the whole contract `--json` has with a script.
  const first = await runDoctor({ root, config, registry, ...options, env, home, now,
    // The first pass never writes the cache: it describes a checkout that is about to change.
    writeCache: false });

  const state = (() => { try { return loadState(root); } catch { return null; } })();
  const plan = buildPlan(first.report, {
    stale: options.sections === null ? cacheStale(root) : null,
  });
  write(renderPlan(plan));

  if (plan.actions.length === 0) {
    return { applied: [], report: first.report, checks: first.checks, skipped: true };
  }
  if (!yes) {
    const answer = ask ? await ask() : null;
    // Enter applies (principle 10: propose → review → apply); anything else, including a closed
    // stdin, is a no. A non-interactive caller that means yes says `--yes`.
    const said = String(answer ?? '').trim().toLowerCase();
    if (answer === null || !(said === '' || said === 'y' || said === 'yes')) {
      write('nothing applied.');
      return { applied: [], report: first.report, checks: first.checks, declined: true };
    }
  }

  const fixCtx = {
    root,
    config,
    env,
    platform: process.platform,
    mode: state?.mode ?? null,
    docsMode: state?.docs?.mode ?? 'sparse',
    registration: state?.registration ?? 'project',
    storePath: join(root, '.local', 'instances.json'),
  };
  const applied = await applyPlan(plan, fixCtx, deps);
  for (const entry of applied) {
    write(`  ${entry.id}  ${entry.result}${entry.detail ? ` — ${entry.detail}` : ''}`);
  }
  logFix(root, applied);

  // The same options, so the second report is comparable with the first — and this one caches.
  const second = await runDoctor({ root, config, registry: registry ?? engineRegistry(), ...options,
    env, home, now });
  return { applied, report: second.report, checks: second.checks, cacheError: second.cacheError };
}

/**
 * One line from stdin, or `null` at end of input.
 *
 * The comment here used to say "the same reader the plan screen uses", which was a claim about two
 * copies rather than a shared one. ARC-09-S01 made it true: `lib/ask.mjs`.
 */
const defaultAsk = (input) => askOnce(input);

export async function doctorCommand({ flags = {}, log, out = process.stdout, env = process.env,
  err = process.stderr, cwd = process.cwd(), registry = engineRegistry(), now = () => Date.now(),
  home = '', input = process.stdin, ask = null, fixDeps = {} } = {}) {
  const started = now();
  const write = (text) => out.write(`${text}\n`);

  const root = findRoot(cwd);
  if (!root) {
    // Nothing above this directory is a checkout. The sentence still names what to do, and says
    // what it does not know rather than inventing a path.
    write(notAtRoot('<the checkout>'));
    return EXIT_PREREQ;
  }
  // INSIDE the checkout is not AT it. Every path in this report — the store, the corpus, the
  // settings — is resolved relative to the root, and a run from `clients/acme/` that quietly used
  // the root anyway would print a report about a directory the reader is not in. Compared through
  // `realpath`, because `/var` is a symlink to `/private/var` on macOS and a temp checkout is
  // reached through both names.
  if (realpathOrSelf(cwd) !== realpathOrSelf(root)) {
    write(notAtRoot(root));
    return EXIT_PREREQ;
  }

  let config;
  try {
    config = JSON.parse(readFileSync(join(root, 'engine.config.json'), 'utf8'));
  } catch (e) {
    write(`DOCTOR: engine.config.json is unreadable — ${e.message}`);
    return EXIT_PREREQ;
  }

  const floor = config?.floors?.node;
  if (floor && !meetsFloor(process.versions.node, floor).ok) {
    write(`DOCTOR: Node ${process.versions.node} is below the floor ${floor} — `
      + 'install it (macOS: brew install node@22 · Windows: winget install OpenJS.NodeJS.LTS · '
      + "Linux: your distribution's package or nvm)");
    return EXIT_PREREQ;
  }

  const sections = selectSections(flags.section);
  if (sections && sections.unknown.length > 0) {
    write(`unknown section "${sections.unknown[0]}"; valid: ${SECTIONS.join(', ')}`);
    return EXIT_USAGE;
  }

  const options = {
    quick: flags.quick === true,
    // `--quick` implies `--no-network`: the subset exists to be fast, and a network round trip is
    // the slowest thing the doctor does.
    noNetwork: flags['no-network'] === true || flags.quick === true,
    fix: flags.fix === true,
    section: flags.section ?? null,
    sections: sections ? sections.names : null,
  };

  const runOptions = {
    sections: options.sections,
    quick: options.quick,
    noNetwork: options.noNetwork,
    fix: options.fix,
    section: options.section,
    writeCache: flags['no-cache'] === true ? false : 'auto',
    started,
  };

  let report;
  let checks;
  let cacheError;
  let fixes = [];
  if (options.fix) {
    // Under `--json`, stdout carries ONE thing: the object. The plan, the prompt and the per-fix
    // lines are prose, so they follow every other human line to stderr — a caller piping this into
    // `jq` must not have to strip them, and `JSON.parse(stdout)` is the assertion that proves it.
    const narrate = flags.json ? (text) => err.write(`${text}\n`) : write;
    // A plan a nobody can answer is a plan nobody asked for: without a TTY and without `--yes`,
    // `--fix` prints what it would do and stops, which is the safe half of the interaction.
    const interactive = Boolean(input?.isTTY) || Boolean(ask);
    const outcome = await fixCommand({
      root, config, registry, options: runOptions, env, home, now, write: narrate,
      yes: flags.yes === true,
      ask: ask ?? (interactive ? defaultAsk(input) : null),
      deps: fixDeps,
    });
    report = outcome.report;
    checks = outcome.checks;
    cacheError = outcome.cacheError;
    fixes = fixesBlock(outcome.applied ?? []);
    if (fixes.length > 0) report.fixes = fixes;
    // A plan the user declined is a successful run of `--fix`: they asked what it would do, and
    // it told them. The findings are still on the screen and the next run still reports them.
    if (outcome.declined) {
      if (flags.json) write(JSON.stringify(maskForJson(report, { home }), null, 2));
      if (log?.commit) log.commit();
      return EXIT_OK;
    }
  } else {
    ({ report, checks, cacheError } = await runDoctor({
      root, config, registry, ...runOptions, env, home, now,
    }));
  }

  // A cache that could not be written is not a failed run: the report is on the screen, and the
  // banner's fallback is to re-run. Said out loud so a read-only checkout is explicable — and now
  // on STDERR in BOTH modes (ARC-09-C9), because stdout carries the report and nothing else.
  // S11 had already moved it off stdout under `--json`, where `note: …` before the object made
  // every consumer's `JSON.parse` throw on the `n`; C9 finishes the job for the text path, where
  // a diagnostic was interleaved with the report a human was reading.
  if (cacheError) {
    err.write(`doctor: cache not written — ${cacheError}\n`);
  }

  if (flags.json) {
    // ARC-09-C9: and in the object too. A script that reads `--json` never sees stderr, so without
    // this the only signal that the banner will re-run every session was a line it cannot read.
    // Present only when it happened — a `cacheError: null` on every healthy run would be noise in
    // the shape every consumer already parses.
    // ARC-08-C1: masked at the boundary, not at each site that writes a string. `--json` is the
    // form that travels — an issue template asks a stranger to paste it — so instance labels and
    // hosts leave as `<label>` / `<host>`. The text path below, the banner and the cache keep the
    // user's own words; a machine consumer uses the report object, not this string.
    write(JSON.stringify(maskForJson(cacheError ? { ...report, cacheError } : report, { home }), null, 2));
  } else {
    write(renderText({ report, checks, colour: useColour({ stream: out, env }) }));
  }
  if (log?.commit) log.commit();
  return report.summary.fail > 0 ? exitCodeFor(report.summary) : EXIT_OK;
}
