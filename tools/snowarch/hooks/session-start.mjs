#!/usr/bin/env node
// ARC-08-S08 — the SessionStart banner: one truthful `Mode:` line, and at most four nudges.
//
// THREE PROMISES, and they are the reason this file is shaped the way it is.
//
//   IT NEVER FAILS A SESSION. Every path exits 0, nothing reaches stderr, and any exception at all
//   becomes one honest line. A hook that exits non-zero or writes to stderr is a session that
//   starts with an error message about the tool that was supposed to help.
//
//   IT IS FAST. The fast path reads two small JSON files and prints — it imports no part of the
//   doctor, because importing the check registry to decide whether it needs the check registry
//   would spend the whole budget before the decision. The doctor arrives through a lazy `import()`
//   on the re-run branch only.
//
//   IT NEVER GUESSES. The line it prints was DERIVED by the doctor from the toggle file and the
//   store (ARC-08-S05) and cached; when the cache no longer describes this checkout it re-runs the
//   offline subset rather than printing something older than the facts.
//
// The root comes from this file's own location, never from `cwd` and never from
// `CLAUDE_PROJECT_DIR`: inside a session that variable is the SESSION's project, which is the same
// directory here and is not guaranteed to be, and a banner that described another checkout would
// be worse than no banner.
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** The re-run's budget. Half the hook's own 10 s timeout, so the watchdog is always the first to fire. */
export const WATCHDOG_MS = 5_000;

/** How old a cache may be before it is re-derived, whatever the mtimes say. */
export const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * How old an upgrade check may be before the banner stops repeating it (ARC-09-S07).
 *
 * Inlined rather than imported from `lib/upgrade-check.mjs`, and that is the one duplication this
 * file accepts on purpose: the hook's whole budget is 300 ms on a machine that may have no Node,
 * and its rule is to read two JSON files and import nothing. A dynamic import here would put a
 * module resolution on the critical path to save a constant. `tests/hook/session-start.test.mjs`
 * asserts the two numbers agree.
 */
export const UPGRADE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * A check from the future is not fresh either: a clock that went backwards must not pin a nudge.
 *
 * `nowMs` is a NUMBER, because that is what this file's `now` has always been (`Date.now()`), and
 * a second convention inside one module is how a `now()` gets called on a number.
 */
function freshUpgradeCheck(upgrade, nowMs) {
  const at = Date.parse(upgrade?.checkedAt ?? '');
  if (Number.isNaN(at)) return false;
  const age = nowMs - at;
  return age >= 0 && age < UPGRADE_MAX_AGE_MS;
}

/** Read a JSON file, or `null`. A malformed cache is a stale cache, never a crash. */
function readJson(path) {
  try {
    return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
  } catch {
    return null;
  }
}

/**
 * The four nudges, in the story's order, from the ONE definition of each.
 *
 * `first` is only a first run when THIS invocation created the cache: a design-only checkout that
 * has been running for a month does not need to be told again every session.
 */
function nudges({ report, cache, banner, firstRun, upgrade, now = Date.now() }) {
  const lines = [];
  const instances = report?.server?.instances ?? cache?.server?.instances ?? [];
  if (firstRun && report?.mode !== 'live' && instances.length === 0) lines.push(banner.firstRun);
  // FRESH, not merely present (ARC-09-S07). A `behind: true` from a fortnight ago is a claim
  // nobody has checked since; printing it every session teaches a reader to skip the line, and
  // then the one that matters is skipped too. Expired means SILENCE — never a hedged nudge.
  if (upgrade?.behind === true && upgrade.latestTag && freshUpgradeCheck(upgrade, now)) {
    lines.push(banner.upgrade(upgrade.latestTag));
  }
  const stale = report?.stale?.claudeJsonEntries ?? cache?.report?.stale?.claudeJsonEntries ?? [];
  if (stale.some((e) => e.scope === 'this-folder')) lines.push(banner.staleRegistration);
  const fail = report?.summary?.fail ?? cache?.summary?.fail ?? 0;
  if (fail > 0) lines.push(banner.doctorFail(fail));
  return lines;
}

/**
 * The doctor, in process, under a watchdog.
 *
 * `Promise.race` rather than an `AbortController` threaded through every check: the runner has no
 * abort seam, and adding one so a banner could interrupt it would put the banner's deadline inside
 * twenty-eight checks. The run is abandoned instead — it writes its own cache when it finishes, so
 * the next session gets the answer this one waited too long for.
 */
async function reRun({ config, watchdogMs, run }) {
  const doctor = run ?? (await import('../lib/doctor/index.mjs')).runDoctor;
  let timer;
  try {
    return await Promise.race([
      doctor({ root: ROOT, config, quick: true, noNetwork: true, writeCache: true }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('watchdog')), watchdogMs);
        if (typeof timer?.unref === 'function') timer.unref();
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function banner({ root = ROOT, now = Date.now(), watchdogMs = WATCHDOG_MS,
  run = null } = {}) {
  // The lines belong to THIS call. They were module state once, which is harmless in production —
  // the hook runs once per process — and wrong the moment anything calls it twice, which the tests
  // do: a case's assertion picked up the previous case's line.
  const out = [];
  const say = (line) => { if (line) out.push(line); };
  const { BANNER } = await import('../lib/text.mjs');
  const { cachePath, inputsPath, cacheStale } = await import('../lib/doctor-cache.mjs');

  const cache = readJson(cachePath(root));
  const inputs = readJson(inputsPath(root));
  const upgrade = readJson(join(root, '.local', 'upgrade-check.json'));

  // 1. The fast path. Nothing beyond these two files has been read, and nothing else will be.
  const staleness = cacheStale(root, { now, maxAgeMs: MAX_AGE_MS });
  if (cache && inputs && !staleness.stale && cache.modeLine) {
    say(cache.modeLine);
    for (const line of nudges({ cache, banner: BANNER, firstRun: false, upgrade, now })) say(line);
    return { path: 'cache', lines: out };
  }

  // 3. Never bootstrapped — checked BEFORE the re-run, because a doctor on a checkout with no
  // state answers a question nobody asked and costs a second doing it.
  if (!existsSync(join(root, '.local', 'bootstrap-state.json'))) {
    const { MODE_VARIANTS, modeLine } = await import('../lib/text.mjs');
    say(modeLine({ mode: 'unknown', qualifier: MODE_VARIANTS.notBootstrapped }));
    return { path: 'unbootstrapped', lines: out };
  }

  // 2. The re-run.
  const { loadConfig } = await import('../lib/config.mjs');
  let report = null;
  try {
    ({ report } = await reRun({ config: loadConfig(root), watchdogMs, run }));
  } catch (e) {
    if (e?.message !== 'watchdog') throw e;
    // The watchdog. An old line marked old beats no line: the mode rarely changes, and the
    // suffix says how much to trust it.
    say(cache?.modeLine ? `${cache.modeLine}${BANNER.staleSuffix}` : BANNER.timedOut);
    return { path: 'timeout', lines: out };
  }

  say(report.modeLine);
  for (const line of nudges({ report, banner: BANNER, firstRun: cache === null, upgrade, now })) say(line);
  return { path: 'rerun', lines: out };
}

/**
 * `isMain` rather than a bare call: the tests import `banner()` and must not print on import.
 *
 * Compared through `realpath`. On macOS `/var` is a symlink to `/private/var`, so a hook run from
 * a temp checkout has `argv[1]` under one name and `import.meta.url` under the other — the same
 * trap the doctor's root check hit — and the file would decide it was not the main module and
 * print nothing at all. Silence is the one failure mode a banner must not have.
 */
const samePath = (a, b) => {
  const real = (p) => { try { return realpathSync.native(p); } catch { return resolve(p); } };
  return real(a) === real(b);
};
const isMain = process.argv[1] && samePath(process.argv[1], fileURLToPath(import.meta.url));
if (isMain) {
  let lines;
  try {
    ({ lines } = await banner());
  } catch (e) {
    // The CLASS, never the message: a message can carry a path, a URL or a value, and this line
    // goes into a session transcript.
    const { BANNER } = await import('../lib/text.mjs');
    lines = [BANNER.failed(e?.constructor?.name ?? 'Error')];
  }
  process.stdout.write(`${lines.join('\n')}\n`);
  // Always. Whatever Claude Code does with a hook's exit code, it can never be provoked from here.
  process.exitCode = 0;
}
