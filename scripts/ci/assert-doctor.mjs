#!/usr/bin/env node
/**
 * What a design-only install's doctor report must say, on every platform.
 *
 * ARC-08-S11, AC 1. Separate from the snapshot on purpose: the snapshot says "the same as last
 * time", and these are the things that must be true whether or not a snapshot exists — the first
 * run on a new platform included. A green snapshot of a broken install would otherwise be the
 * standard the next run is held to.
 *
 * TWO CALLERS, TWO SHAPES, ONE JUDGEMENT (ARC-09-C20). The bootstrap cells run the doctor BEFORE
 * `npm ci`, so every server check must be skip — there is nothing installed for them to ask. The
 * release workflow runs `npm ci` first, for its lint and test gates, so its server checks
 * legitimately RUN. This script encoded the first caller's shape as though it were the only one,
 * and refused a perfectly green report from the second: `a server check ran before npm ci: SV-00,
 * SV-01, SV-02, SV-05, SV-07, SV-08` (rehearsal run 8, release.yml run 34655763909). The
 * expectation is now explicit and the default is unchanged, so the cells that were right stay right.
 *
 * Usage: node scripts/ci/assert-doctor.mjs --in doctor.json [--expect-fail E-00,...]
 *                                          [--deps absent|installed]
 *
 * `--expect-fail` names the checks this ENVIRONMENT explains, and it is a two-way assertion: those
 * ids must fail and every other check must not. A one-way allowance ("ignore E-00") would keep
 * passing on the day a runner grows the thing it was allowing for, and nobody would ever remove
 * it.
 * Exit 0 fine · 1 the report says something a design-only install must not · 2 cannot run.
 *
 * Stdlib only: this runs in a bootstrap cell, before anything is installed.
 */
import { existsSync, readFileSync, writeSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const value = (n, d) => (argv.indexOf(n) === -1 ? d : argv[argv.indexOf(n) + 1]);
const inPath = resolve(value('--in', 'doctor.json'));
const expectFail = value('--expect-fail', '').split(',').map((x) => x.trim()).filter(Boolean);

// `absent` is the default because it is the stricter shape AND the older caller: a cell that does
// not say which world it is in gets the one that was already being asserted.
const deps = value('--deps', 'absent');
if (!['absent', 'installed'].includes(deps)) {
  writeSync(2, `assert-doctor: --deps must be absent or installed, not "${deps}"\n`);
  process.exit(2);
}

if (!existsSync(inPath)) {
  writeSync(2, `assert-doctor: ${inPath} is not there\n`);
  process.exit(2);
}

let report;
try { report = JSON.parse(readFileSync(inPath, 'utf8')); } catch (e) {
  writeSync(2, `assert-doctor: ${inPath} is not JSON: ${e.message}\n`);
  process.exit(2);
}

const problems = [];
const check = (id) => report.checks.find((c) => c.id === id);

// 1. The verdict, minus what this environment explains. A FAIL names itself: "1 fail" in a log is
// a person opening an artifact.
const failing = report.checks.filter((c) => c.status === 'fail').map((c) => c.id);
const unexpected = report.checks.filter((c) => c.status === 'fail' && !expectFail.includes(c.id));
if (unexpected.length) {
  problems.push(`${unexpected.length} unexpected FAIL — `
    + unexpected.map((c) => `${c.id}: ${c.detail}`).join(' | '));
}
// ...and the other direction. A hosted runner has no Claude Code, so E-00 fails there and the job
// says so by name — but the day one arrives with it installed, this goes red and somebody removes
// the allowance, instead of it sitting in the workflow covering nothing for a year.
for (const id of expectFail) {
  if (!failing.includes(id)) {
    problems.push(`${id} was expected to fail here and did not (${check(id)?.status ?? 'absent'}) — `
      + 'drop it from --expect-fail');
  }
}

// 2. The mode. The bootstrap ran `--mode design`, so anything else means the install did something
// other than what the job asked for, and every other assertion here is about a different machine.
if (report.mode !== 'design-only') problems.push(`mode is "${report.mode}", not design-only`);

// 3. The server checks, judged by which world this is.
//
//   `absent`    — the doctor ran BEFORE `npm ci`, so an SV- check that produced an answer means the
//                 dependencies were installed first and the report describes an install no user has.
//   `installed` — the caller installed first on purpose. The SV checks may run, and then each one
//                 must be ok, warn or skip: a FAIL there is a real defect, not an environment. And
//                 the server must have ANSWERED — an installed tree whose server block never
//                 reached `ready` is not a green install either, it is a silent one.
const svChecks = report.checks.filter((c) => c.id.startsWith('SV-'));
if (deps === 'absent') {
  const ran = svChecks.filter((c) => c.status !== 'skip');
  if (ran.length) problems.push(`a server check ran before npm ci: ${ran.map((c) => c.id).join(', ')}`);
} else {
  const failed = svChecks.filter((c) => c.status === 'fail');
  if (failed.length) problems.push(`a server check FAILED: ${failed.map((c) => c.id).join(', ')}`);
  const state = report.server?.state ?? null;
  if (state !== 'ready') {
    problems.push(`--deps installed, but the server block says state "${state ?? 'absent'}", not ready`);
  }
}

// 5. The corpus checks answered. This job fetches the real corpus, so E-12…E-16 are the one part of
// the report that proves the install did the expensive thing rather than skipping it.
const docs = ['E-12', 'E-13', 'E-14', 'E-15', 'E-16'].map(check).filter(Boolean);
if (docs.length !== 5) problems.push('the docs checks are not all in the report');
else if (docs.every((c) => c.status === 'skip')) problems.push('every docs check skipped — no corpus?');

// 6. The mode line is the one string four programs share; a report without it is a report the
// banner and the skill cannot quote.
if (!/^Mode: /.test(report.modeLine ?? '')) problems.push(`modeLine is ${JSON.stringify(report.modeLine)}`);

if (problems.length) {
  writeSync(2, 'assert-doctor: this is not a green design-only install\n');
  for (const p of problems) writeSync(2, `  ${p}\n`);
  process.exit(1);
}

const s = report.summary;
writeSync(1, `DOCTOR: ${s.ok} ok, ${s.warn} warn, ${s.fail} fail (${s.skip} skip)`
  + `${expectFail.length ? ` — expected here: ${expectFail.join(', ')}` : ''}\n`);
writeSync(1, `${report.modeLine}\n`);
