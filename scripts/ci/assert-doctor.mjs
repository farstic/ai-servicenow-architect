#!/usr/bin/env node
/**
 * What a design-only install's doctor report must say, on every platform.
 *
 * ARC-08-S11, AC 1. Separate from the snapshot on purpose: the snapshot says "the same as last
 * time", and these are the things that must be true whether or not a snapshot exists — the first
 * run on a new platform included. A green snapshot of a broken install would otherwise be the
 * standard the next run is held to.
 *
 * Usage: node scripts/ci/assert-doctor.mjs --in doctor.json [--expect-fail E-00,...]
 *
 * `--expect-fail` names the checks this ENVIRONMENT explains, and it is a two-way assertion: those
 * ids must fail and every other check must not. A one-way allowance ("ignore E-00") would keep
 * passing on the day a runner grows the thing it was allowing for, and nobody would ever remove
 * it.
 * Exit 0 fine · 1 the report says something a design-only install must not · 2 cannot run.
 *
 * Stdlib only: this runs in a bootstrap cell, before anything is installed.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const value = (n, d) => (argv.indexOf(n) === -1 ? d : argv[argv.indexOf(n) + 1]);
const inPath = resolve(value('--in', 'doctor.json'));
const expectFail = value('--expect-fail', '').split(',').map((x) => x.trim()).filter(Boolean);

if (!existsSync(inPath)) {
  process.stderr.write(`assert-doctor: ${inPath} is not there\n`);
  process.exit(2);
}

let report;
try { report = JSON.parse(readFileSync(inPath, 'utf8')); } catch (e) {
  process.stderr.write(`assert-doctor: ${inPath} is not JSON: ${e.message}\n`);
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

// 3. Every server check skipped. The doctor runs BEFORE `npm ci` in this job: if an SV- check
// produced an answer, the runtime dependencies were installed first and the report describes an
// install no user has.
const ran = report.checks.filter((c) => c.id.startsWith('SV-') && c.status !== 'skip');
if (ran.length) problems.push(`a server check ran before npm ci: ${ran.map((c) => c.id).join(', ')}`);

// 5. The corpus checks answered. This job fetches the real corpus, so E-12…E-16 are the one part of
// the report that proves the install did the expensive thing rather than skipping it.
const docs = ['E-12', 'E-13', 'E-14', 'E-15', 'E-16'].map(check).filter(Boolean);
if (docs.length !== 5) problems.push('the docs checks are not all in the report');
else if (docs.every((c) => c.status === 'skip')) problems.push('every docs check skipped — no corpus?');

// 6. The mode line is the one string four programs share; a report without it is a report the
// banner and the skill cannot quote.
if (!/^Mode: /.test(report.modeLine ?? '')) problems.push(`modeLine is ${JSON.stringify(report.modeLine)}`);

if (problems.length) {
  process.stderr.write('assert-doctor: this is not a green design-only install\n');
  for (const p of problems) process.stderr.write(`  ${p}\n`);
  process.exit(1);
}

const s = report.summary;
process.stdout.write(`DOCTOR: ${s.ok} ok, ${s.warn} warn, ${s.fail} fail (${s.skip} skip)`
  + `${expectFail.length ? ` — expected here: ${expectFail.join(', ')}` : ''}\n`);
process.stdout.write(`${report.modeLine}\n`);
