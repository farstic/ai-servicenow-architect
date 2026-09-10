#!/usr/bin/env node
/**
 * ARC-06-S14 — what a design-only install must be true of, on every OS, every commit.
 *
 * This is the install promise as an executable. When it is red the install is broken, not the
 * test: every assertion below is something a user would hit within a minute of cloning.
 *
 * ONE implementation for the three operating systems, and — deliberately — for the `no-node`
 * cells too. Node is removed from PATH for the *bootstrap step*, which is the subject; the
 * assertions run afterwards in a step that has Node again. A bash-and-PowerShell twin of this
 * file would be two opinions about what a correct install looks like, and the one that is wrong
 * when they disagree is always the copy nobody reads.
 *
 *   node scripts/ci/assert-bootstrap.mjs --variant node-cli --writer node \
 *     [--second-log <file>] [--seconds <n>] [--summary]
 *
 * Exit 0 all clear · 1 one or more assertions failed (all of them are reported, not just the
 * first: a cell that has to be re-run once per problem wastes ten minutes per problem).
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { computeSettings } from '../../tools/snowarch/lib/settings-local.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const value = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};
const variant = value('variant', 'node-cli');
const writer = value('writer', 'node');
const secondLog = value('second-log');
const firstState = value('first-state');
const firstSettings = value('first-settings');
const seconds = Number(value('seconds', '0'));

const problems = [];
const notes = [];
const fail = (n, message) => problems.push(`assertion ${n}: ${message}`);
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const json = (rel) => JSON.parse(read(rel));

// ── 2. nothing tracked was modified ──────────────────────────────────────────────────────────
// The install writes to `.local/`, `.claude/settings.local.json` and `vendor/` — all ignored. A
// tracked file that changed means the install edited the repository, which is the one thing an
// installer must never do to a checkout somebody else will commit from.
// UNTRIMMED, because porcelain's first two characters are the status and ` M path` loses its
// leading space to `trim()` — which is how the submodule diagnostic below silently matched
// nothing on its first run.
const porcelainRaw = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' })
  .replace(/\n+$/, '');
const porcelain = porcelainRaw.trim();
if (porcelain !== '') {
  // A dirty SUBMODULE is one line — ` M vendor/ServiceNowDocs` — and that line does not say
  // whether it moved commits, changed content or gained untracked files. Without the detail the
  // reader of a Windows-only failure has nothing to go on and no Windows machine to ask, so the
  // assertion explains itself here rather than in the next person's afternoon.
  let detail = porcelainRaw;
  for (const line of porcelainRaw.split('\n')) {
    const sub = /^.{0,2}M\s+(vendor\/\S+)/.exec(line);
    if (!sub) continue;
    const at = join(root, sub[1]);
    const inner = execFileSync('git', ['-C', at, 'status', '--porcelain'], { encoding: 'utf8' })
      .split('\n').filter(Boolean);
    const pointer = execFileSync('git', ['diff', '--submodule=short', '--', sub[1]],
      { cwd: root, encoding: 'utf8' }).split('\n').filter((l) => /^[+-]Subproject/.test(l));
    detail += `\n    inside ${sub[1]}: ${inner.length} change(s)`
      + (inner.length > 0 ? `, first: ${inner.slice(0, 3).join(' | ')}` : '')
      + (pointer.length > 0 ? `\n    pointer: ${pointer.join(' ')}` : '\n    pointer: unchanged');
  }
  fail(2, `git status is not clean:\n${detail}`);
}

// ── 3. the state says what happened ──────────────────────────────────────────────────────────
const statePath = '.local/bootstrap-state.json';
let state = null;
if (!existsSync(join(root, statePath))) {
  fail(3, `${statePath} was not written`);
} else {
  try {
    state = JSON.parse(read(statePath).replace(/^﻿/, ''));
  } catch (e) { fail(3, `${statePath} does not parse: ${e.message}`); }
}
if (state) {
  if (state.mode !== 'design-only') fail(3, `mode is ${JSON.stringify(state.mode)}, not "design-only"`);
  if (state.steps?.B09?.status !== 'ok') fail(3, `B09 is ${state.steps?.B09?.status ?? 'absent'}, not ok`);
  // The writer is the whole point of the `no-node` cells: if the launcher quietly handed over to a
  // Node it was supposed to be without, every other assertion here would still pass.
  if (state.writer !== writer) fail(3, `writer is ${JSON.stringify(state.writer)}, expected ${writer}`);
  if (variant === 'node-cli' || variant === 'no-gitbash') {
    // 9 (first half). B05 is the contract check; B08 is live-only and never runs here, which is
    // why the handshake smoke exists as its own step.
    if (state.steps?.B05?.status !== 'ok') fail(9, `B05 is ${state.steps?.B05?.status ?? 'absent'}, not ok`);
  }
}

// ── 4. the toggles are exactly what S05 computes for this variant ────────────────────────────
// Compared against `computeSettings` rather than a literal: the target is S05's to define, and a
// second description of it here would be a second opinion the moment either moves.
const settingsPath = '.claude/settings.local.json';
if (!existsSync(join(root, settingsPath))) {
  fail(4, `${settingsPath} was not written`);
} else {
  const actual = JSON.parse(read(settingsPath));
  const config = json('engine.config.json');
  const expected = computeSettings({}, {
    mode: 'design-only',
    // S-05 variant B: the SessionStart hook is present iff Node is. The `no-node` cells must not
    // have one — a hook that runs `node` on a machine without Node prints an error every session.
    nodePresent: writer !== 'bash' && writer !== 'powershell',
    registration: 'project',
    serverKey: config.mcp.serverKey,
  });
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(4, `${settingsPath} is not S05's target for ${variant}:\n  got      ${JSON.stringify(actual)}\n  expected ${JSON.stringify(expected)}`);
  }
  // Stated separately because it is the story's own amendment: no bootstrap writes this key, in
  // either branch, so its presence would mean something wrote it that should not have.
  if ('disableAllHooks' in actual) fail(4, 'disableAllHooks was written by the bootstrap');
}

// ── 5. nothing secret-shaped was left behind ─────────────────────────────────────────────────
const SECRET_KEY = /PASSWORD|SECRET|TOKEN|_KEY"/;
for (const rel of ['.mcp.json', '.claude/settings.json', settingsPath, statePath, '.local/config.json']) {
  if (!existsSync(join(root, rel))) continue;
  const hits = read(rel).split('\n')
    .map((line, i) => [i + 1, line])
    .filter(([, line]) => SECRET_KEY.test(line));
  // The LINE NUMBER and the key, never the line: a secret-shaped value printed into a public CI
  // log to prove it should not be there would be the same mistake with extra steps.
  for (const [n] of hits) fail(5, `${rel}:${n} carries a credential-shaped key`);
}

// ── 6. the corpus is really there, at the pinned commit ──────────────────────────────────────
const config = json('engine.config.json');
const vendor = join(root, 'vendor', 'ServiceNowDocs');
if (!existsSync(vendor)) {
  fail(6, 'vendor/ServiceNowDocs is missing — the docs step did not complete');
} else {
  const areas = read(config.docs.areasFile).split('\n').map((l) => l.trim()).filter(Boolean);
  const missing = areas.filter((a) => !existsSync(join(vendor, a)));
  if (missing.length > 0) fail(6, `${missing.length} area(s) absent, first: ${missing[0]}`);
  const head = execFileSync('git', ['-C', vendor, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (head !== config.docs.pin) fail(6, `corpus HEAD ${head.slice(0, 12)} ≠ pin ${config.docs.pin.slice(0, 12)}`);
  notes.push(`corpus ${areas.length} areas at ${head.slice(0, 7)}`);
}

// ── 7. `.local` is private, where the platform has a say ─────────────────────────────────────
if (process.platform === 'win32') {
  notes.push('mode check skipped: Windows inherits the directory ACL (state.fileModes says so)');
  if (state && state.fileModes !== 'acl-inherited') {
    fail(7, `state.fileModes is ${JSON.stringify(state?.fileModes)}, expected "acl-inherited"`);
  }
} else {
  const mode = statSync(join(root, '.local')).mode & 0o777;
  if (mode !== 0o700) fail(7, `.local is ${mode.toString(8)}, not 700`);
}

// ── 8. the second run stands on the first ────────────────────────────────────────────────────
// AMENDED TWICE, and both amendments are things this job discovered on its first run.
//
// (a) The story asked for "no network access on the second run", enforced with an unreachable
//     proxy. B00 probes github.com on EVERY run by design (S04 — that check is never cached), so
//     that setup makes B00 FAIL and measures nothing about the cache.
//
// (b) The brief asked for B02's recorded `durationMs` under 1000 ms. A CACHED step is not
//     re-recorded — the runner prints its line and moves on — so `durationMs` still holds the
//     FIRST run's number and can never be small. What proves the step did not run is that its
//     entry did not change, which is asserted here instead.
//
// And the two variants mean different things by idempotence, because THE LAUNCHERS HAVE NO CACHE:
// `bootstrap.sh` and `bootstrap.ps1` record `"inputsHash": null` (bash cannot compute the repo's
// input hashes, and pretending it could would cache a step whose inputs had changed). So a
// Node-free second run RE-RUNS its steps by design; what must hold there is that nothing changed.
if (secondLog && existsSync(secondLog)) {
  const log = readFileSync(secondLog, 'utf8');
  const first = firstState && existsSync(firstState) ? JSON.parse(readFileSync(firstState, 'utf8')) : null;

  if (variant === 'no-node') {
    // The launchers TIME B02 and never cache it, so what the first run must show is a measured
    // duration and what the second must show is that nothing CHANGED. `finishedAt` moves here by
    // design — the step really did run again — which is why the comparison below is of outcomes
    // and of the toggle file, not of timestamps.
    const firstB02 = first?.steps?.B02?.durationMs;
    if (!(firstB02 > 0)) {
      fail(8, `the launcher recorded B02 as ${firstB02} ms — a step it timed and then did not report`);
    }
    if (!(state?.steps?.B02?.durationMs > 0)) {
      fail(8, 'the second run recorded no duration for B02 either');
    }
    if (!/ok B07: already set/.test(log)) {
      fail(8, 'the second run did not report B07 as already set — it rewrote the toggle');
    }
    if (firstSettings && existsSync(firstSettings)) {
      if (readFileSync(firstSettings, 'utf8') !== read(settingsPath)) {
        fail(8, 'the second run changed .claude/settings.local.json');
      }
    }
    if (first) {
      const before = Object.fromEntries(Object.entries(first.steps ?? {}).map(([k, v]) => [k, v.status]));
      const after = Object.fromEntries(Object.entries(state?.steps ?? {}).map(([k, v]) => [k, v.status]));
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        fail(8, `the second run changed a step's outcome:\n  before ${JSON.stringify(before)}\n  after  ${JSON.stringify(after)}`);
      }
    }
    notes.push(`second run: launcher re-ran its steps and changed nothing (B02 ${firstB02} ms `
      + `then ${state?.steps?.B02?.durationMs} ms — timed, never cached)`);
  } else {
    for (const id of ['B01', 'B02', 'B07']) {
      if (!new RegExp(`\\[${id}/09\\][^\\n]*ok \\(cached\\)`).test(log)) {
        fail(8, `${id} did not report "ok (cached)" on the second run`);
      }
      // The entry a cached step leaves alone. This is the assertion that survives a runner change:
      // a step that secretly re-ran would have a new `finishedAt` even if its line still said ok.
      if (first && first.steps?.[id]?.finishedAt !== state?.steps?.[id]?.finishedAt) {
        fail(8, `${id} was re-run on the second pass (finishedAt moved)`);
      }
    }
    if (/^\[docs\]/m.test(log)) fail(8, 'the second run entered the docs phase');
    notes.push('second run: B01/B02/B07 cached, entries unchanged');
  }
  if (seconds >= 30) fail(8, `the second run took ${seconds} s (budget: 30)`);
}

// ── the job summary row ──────────────────────────────────────────────────────────────────────
if (argv.includes('--summary') && process.env.GITHUB_STEP_SUMMARY) {
  // THE FIRST RUN's B02, which is the install — not the state's, which after two runs means two
  // different things by variant: a node-cli cell cached the step so its entry still holds the
  // install, while a no-node cell re-ran it and its entry now holds the ~2-second reconcile. A
  // column that meant "how long the corpus took" on three cells and "how long it took to notice
  // the corpus was already there" on three others would be worse than no column.
  const first = firstState && existsSync(firstState)
    ? JSON.parse(readFileSync(firstState, 'utf8')) : null;
  const ms = first?.steps?.B02?.durationMs ?? state?.steps?.B02?.durationMs;
  const b02Seconds = ms ? (ms / 1000).toFixed(1) : '—';
  let mb = '—';
  try {
    // The SUM OF FILE SIZES, and the column says so, because it is not the same quantity as the
    // `du -sm` figure `docs-real.yml` reports and `docs/INSTALL.md` quotes: `du` counts allocated
    // blocks, which on these runners is ~3% more (174 here against the page's 179 on POSIX). `du`
    // is also absent on Windows, so a walk is the only portable answer — a table whose column
    // silently meant two things on three platforms would be worse than one that says which.
    mb = String(Math.round(directorySize(vendor) / (1024 * 1024)));
  } catch { /* the corpus assertion has already reported its absence */ }
  // Header and row together: `$GITHUB_STEP_SUMMARY` is per-CELL, so a header written once
  // somewhere else would leave twelve tables with no columns. The run's summary page stacks them.
  // The column names are `docs-real.yml`'s, because `docs/INSTALL.md` quotes those numbers and a
  // reader comparing the two should not have to translate.
  const row = `| ${process.platform} | ${variant} | ${writer} | ${b02Seconds} | ${mb} |`;
  appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    ['| OS | variant | writer | B02 seconds | corpus MB (file bytes) |', '|---|---|---|---|---|',
      row, ''].join('\n'));
  // ...and to stdout, because the summary page is per RUN and a person reading ONE cell's log
  // should see that cell's numbers without leaving it.
  notes.push(`summary row ${row}`);
}

/** Bytes under a directory. Small and synchronous: it runs once per cell, over one tree. */
function directorySize(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) total += directorySize(p);
    else if (entry.isFile()) total += statSync(p).size;
  }
  return total;
}

for (const n of notes) process.stdout.write(`  · ${n}\n`);
if (problems.length > 0) {
  process.stderr.write(`\nassert-bootstrap: ${problems.length} failed assertion(s) in the `
    + `${variant} cell — the install is broken, not the test:\n`);
  for (const p of problems) process.stderr.write(`  ✗ ${p}\n`);
  process.exit(1);
}
process.stdout.write(`assert-bootstrap: ${variant} (writer ${writer}) — all assertions passed\n`);
