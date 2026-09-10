#!/usr/bin/env node
/**
 * Normalise a doctor report to the part that should never change, and compare it to a snapshot.
 *
 * ARC-08-S11. Eleven ARCs name a doctor check as their proof, so a check that quietly stops
 * running — renamed, dropped from a section, skipped because a prerequisite moved — takes the
 * evidence for somebody else's story with it. Nothing else in CI would notice: a doctor that
 * reports `28 ok` instead of `29 ok` still exits 0.
 *
 * What survives normalisation is what a design-only install must always look like:
 *   checks[]  { id, status, fixable }   — the answer, per check, in registry order
 *   summary   ok / warn / fail / skip / fixable
 *   mode      "design-only"
 * What is stripped is everything that legitimately differs between two correct runs — the clock
 * (`ranAt`, every `durationMs`), the machine (paths, the Node version, capability probes), the
 * moment in the release (`version`, `tag`, `contractSha`, the docs pin) and every count that moves
 * with the roster. A snapshot holding a count would fail the day a skill is added, which trains
 * everyone to update it without reading it — and then it is not a guard, it is a chore.
 *
 * Usage:
 *   node scripts/ci/doctor-snapshot.mjs --in doctor.json            compare (exit 1 on a difference)
 *   node scripts/ci/doctor-snapshot.mjs --in doctor.json --write    write this platform's snapshot
 *   node scripts/ci/doctor-snapshot.mjs --in doctor.json --summary  ...and append to the job summary
 *
 * Exit 0 same (or written) · 1 different · 2 cannot run.
 *
 * Stdlib only: it runs in a bootstrap cell, where nothing has been installed.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const value = (n) => (argv.indexOf(n) === -1 ? undefined : argv[argv.indexOf(n) + 1]);

const ROOT = resolve(value('--root') ?? resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'));
const die = (m) => { process.stderr.write(`doctor-snapshot: ${m}\n`); process.exit(2); };

/** `linux` · `darwin` · `win32` — the three the matrix runs, and the three snapshots. */
export const PLATFORMS = Object.freeze(['linux', 'darwin', 'win32']);
export const snapshotPath = (platform, root = ROOT) =>
  join(root, 'tests/fixtures/doctor', `snapshot-${platform}.json`);

/**
 * The report, reduced to its invariants.
 *
 * Exported and pure so `tests/doctor/snapshot.test.mjs` can prove the stripping on fixtures rather
 * than on whatever the machine running the tests happens to report.
 */
export function normalise(report) {
  if (!report || typeof report !== 'object') throw new Error('not a report');
  if (!Array.isArray(report.checks)) throw new Error('the report has no checks[]');
  return {
    schema: report.schema,
    mode: report.mode,
    // The counts, which are the one set of numbers worth pinning: they are the doctor's verdict.
    // `fixable` included — a check that quietly stops offering its fix is a repair nobody is told
    // about any more.
    summary: {
      ok: report.summary?.ok, warn: report.summary?.warn, fail: report.summary?.fail,
      skip: report.summary?.skip, fixable: report.summary?.fixable,
    },
    checks: report.checks.map((c) => ({ id: c.id, status: c.status, fixable: c.fixable === true })),
  };
}

/**
 * The checks a hosted runner is expected to FAIL, and therefore the only failures a snapshot taken
 * on one may record.
 *
 * E-00 asks whether Claude Code is installed. A GitHub runner has no Claude Code, so the honest
 * answer is `fail` — the doctor deliberately re-asks even when the install ran with
 * `--skip-claude-check`, because that flag is about the install and the doctor's subject is the
 * machine as it is now. Recording it as expected is not the same as excusing it: `assert-doctor.mjs`
 * asserts the named ids DO fail, so the day a runner arrives with Claude Code installed this list
 * goes red and someone removes the entry, instead of it covering nothing for a year.
 */
export const EXPECTED_FAIL_ON_RUNNERS = Object.freeze(['E-00']);

/**
 * The ids whose STATUS is allowed to differ between Windows and the POSIX platforms.
 *
 * EMPTY, and that is the finding. The story expected E-04, E-11 and SV-02 to differ; on a
 * design-only install none of them does, because what a snapshot records is the STATUS and those
 * three answer `ok`, `ok` and `skip` everywhere. Their DETAIL differs — E-04 finds a different set
 * of capability packs, E-11 says "file modes: ACL-inherited" where POSIX says nothing, SV-02 names
 * a different launcher — and detail is exactly what the normaliser drops, because it is the part
 * that legitimately varies between two correct machines.
 *
 * The one row that did differ was E-03, and it was a BUG rather than a platform: `npm` on Windows
 * is `npm.CMD`, and Node refuses to exec a batch file without a shell since CVE-2024-27980, so the
 * doctor had been reporting "npm found but did not answer --version" on every Windows machine since
 * the check was written. Fixed in `makeExec` rather than recorded here — an allowance would have
 * made the bug the standard, which is what a snapshot of a broken install always does.
 *
 * A row belongs here when Windows legitimately answers a different STATUS, with the reason beside
 * it. Nothing qualifies today.
 */
export const WINDOWS_DIFFERS = Object.freeze([]);

const idsOf = (snapshot) => snapshot.checks.map((c) => c.id);

/** A per-id diff, in the words a reader needs: which check, what changed. */
export function diff(expected, actual) {
  const lines = [];
  const before = new Map(expected.checks.map((c) => [c.id, c]));
  const after = new Map(actual.checks.map((c) => [c.id, c]));
  for (const id of idsOf(expected)) {
    if (!after.has(id)) { lines.push(`${id}: in the snapshot, MISSING from this run`); continue; }
    const [b, a] = [before.get(id), after.get(id)];
    if (b.status !== a.status) lines.push(`${id}: status ${b.status} → ${a.status}`);
    if (b.fixable !== a.fixable) lines.push(`${id}: fixable ${b.fixable} → ${a.fixable}`);
  }
  for (const id of idsOf(actual)) {
    if (!before.has(id)) {
      lines.push(`${id}: NEW check, not in any snapshot — add it to all three `
        + `(${PLATFORMS.map((p) => `tests/fixtures/doctor/snapshot-${p}.json`).join(', ')})`);
    }
  }
  if (expected.mode !== actual.mode) lines.push(`mode: ${expected.mode} → ${actual.mode}`);
  for (const k of ['ok', 'warn', 'fail', 'skip', 'fixable']) {
    if (expected.summary[k] !== actual.summary[k]) {
      lines.push(`summary.${k}: ${expected.summary[k]} → ${actual.summary[k]}`);
    }
  }
  return lines;
}

// ── the CLI ──────────────────────────────────────────────────────────────────────────────────
// Guarded so the test can import `normalise` and `diff` without running any of this. `realpath` on
// both sides: on macOS the temp directory is a symlink, and a raw compare says "not main" from a
// fixture checkout — S08's bug, which made a hook print nothing at all.
const real = (p) => { try { return realpathSync(p); } catch { return p; } };
const isMain = process.argv[1] !== undefined
  && real(process.argv[1]) === real(fileURLToPath(import.meta.url));

if (isMain) {
  const inPath = resolve(value('--in') ?? 'doctor.json');
  if (!existsSync(inPath)) die(`${inPath} is not there — run ./snowarch doctor --json --no-cache first`);

  let report;
  try { report = JSON.parse(readFileSync(inPath, 'utf8')); } catch (e) { die(`${inPath} is not JSON: ${e.message}`); }

  let actual;
  try { actual = normalise(report); } catch (e) { die(e.message); }

  const platform = value('--platform') ?? process.platform;
  const expectedPath = snapshotPath(platform);
  const body = `${JSON.stringify(actual, null, 2)}\n`;

  if (flag('--write')) {
    mkdirSync(dirname(expectedPath), { recursive: true });
    writeFileSync(expectedPath, body);
    process.stdout.write(`doctor-snapshot: wrote ${expectedPath} (${actual.checks.length} checks)\n`);
  }

  // The out-of-tree copy is written EVERY run and uploaded, so a difference can be inspected rather
  // than guessed at from a diff in a log — and so a platform with no snapshot yet has one to commit.
  const out = value('--out');
  if (out) writeFileSync(resolve(out), body);

  let status = 0;
  if (!flag('--write')) {
    if (!existsSync(expectedPath)) {
      // NOT a failure: this is how a new platform gets its first snapshot. The strictness lives in
      // `tests/doctor/snapshot.test.mjs`, which fails everywhere when one of the three is missing —
      // so a snapshot cannot be quietly dropped, only deliberately bootstrapped.
      process.stdout.write(`doctor-snapshot: no snapshot for ${platform} yet — `
        + `the normalised report is in the artifact; commit it as ${expectedPath}\n`);
    } else {
      const expected = JSON.parse(readFileSync(expectedPath, 'utf8'));
      const lines = diff(expected, actual);
      if (lines.length) {
        process.stderr.write(`doctor-snapshot: ${platform} differs from ${expectedPath}\n`);
        for (const l of lines) process.stderr.write(`  ${l}\n`);
        status = 1;
      } else {
        process.stdout.write(`doctor-snapshot: ${platform} matches (${actual.checks.length} checks, `
          + `${actual.summary.ok} ok, ${actual.summary.warn} warn, ${actual.summary.fail} fail)\n`);
      }
    }
  }

  if (flag('--summary') && process.env.GITHUB_STEP_SUMMARY) {
    const s = actual.summary;
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
      `**doctor (${platform})** — \`DOCTOR: ${s.ok} ok, ${s.warn} warn, ${s.fail} fail\``,
      '',
      '```',
      report.modeLine ?? '(no mode line)',
      '```',
      '',
    ].join('\n'));
  }

  process.exit(status);
}
