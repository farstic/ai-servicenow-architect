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
const porcelain = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim();
if (porcelain !== '') fail(2, `git status is not clean:\n${porcelain}`);

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
// AMENDED (ARC-06-S14): the story asked for no network access on the second run, enforced with an
// unreachable proxy. B00 probes github.com on EVERY run by design (S04, never cached), so that
// setup makes B00 FAIL and proves nothing about caching. What idempotence actually means here is
// asserted instead: the cached step lines, no docs phase, a B02 that did no work, and a fast exit.
if (secondLog) {
  const log = readFileSync(secondLog, 'utf8');
  for (const id of ['B01', 'B02', 'B07']) {
    if (!new RegExp(`\\[${id}/09\\][^\\n]*ok \\(cached\\)`).test(log)) {
      fail(8, `${id} did not report "ok (cached)" on the second run`);
    }
  }
  if (/^\[docs\]/m.test(log)) fail(8, 'the second run entered the docs phase');
  const b02 = state?.steps?.B02?.durationMs;
  if (!(b02 < 1000)) fail(8, `B02 took ${b02} ms on the second run — it did work it should have cached`);
  if (seconds >= 30) fail(8, `the second run took ${seconds} s (budget: 30)`);
  notes.push(`second run ${seconds} s, B02 ${b02} ms`);
}

// ── the job summary row ──────────────────────────────────────────────────────────────────────
if (argv.includes('--summary') && process.env.GITHUB_STEP_SUMMARY) {
  const b02Seconds = state?.steps?.B02?.durationMs ? (state.steps.B02.durationMs / 1000).toFixed(1) : '—';
  let mb = '—';
  try {
    // `du` is not on Windows; the directory walk is the portable answer and this is one directory.
    mb = String(Math.round(directorySize(vendor) / (1024 * 1024)));
  } catch { /* the corpus assertion has already reported its absence */ }
  // Header and row together: `$GITHUB_STEP_SUMMARY` is per-CELL, so a header written once
  // somewhere else would leave twelve tables with no columns. The run's summary page stacks them.
  // The column names are `docs-real.yml`'s, because `docs/INSTALL.md` quotes those numbers and a
  // reader comparing the two should not have to translate.
  appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    ['| OS | variant | writer | B02 seconds | corpus MB |', '|---|---|---|---|---|',
      `| ${process.platform} | ${variant} | ${writer} | ${b02Seconds} | ${mb} |`, ''].join('\n'));
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
