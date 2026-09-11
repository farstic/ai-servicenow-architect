#!/usr/bin/env node
/**
 * Where the quick doctor's time goes, per check — the first of ARC-09-C5's two tables.
 *
 * The Windows cells spend 690–920 ms of the product's own time on the banner's re-run path, which
 * is a quick doctor plus a little rendering, and the cap must not move until somebody knows on
 * WHAT. A per-check table is the cheapest way to find out: if one check owns the time, the fix is
 * a chore against that check; if it is spread evenly over thirty, the answer is different and the
 * table says so just as clearly.
 *
 * Reads a report the doctor already wrote (`--json`), so it costs nothing and cannot perturb the
 * thing it measures. Top five and the sum of the rest: a table of thirty-nine rows in a job
 * summary is a table nobody scrolls.
 *
 * Usage: node scripts/ci/check-timings.mjs --in doctor.json [--top 5] [--label "windows node 22"]
 *        [--summary]
 * Exit 0 always unless it cannot read the report (2) — this MEASURES, it does not judge.
 */
import { appendFileSync, readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const value = (n, d) => (argv.indexOf(n) === -1 ? d : argv[argv.indexOf(n) + 1]);
const IN = value('--in', null);
const TOP = Number(value('--top', '5'));
const LABEL = value('--label', `${process.platform} node ${process.versions.node.split('.')[0]}`);

if (!IN) {
  process.stderr.write('check-timings: --in <doctor.json> is required\n');
  process.exit(2);
}

let report;
try {
  report = JSON.parse(readFileSync(IN, 'utf8'));
} catch (e) {
  process.stderr.write(`check-timings: cannot read ${IN}: ${e.message}\n`);
  process.exit(2);
}

const checks = (report.checks ?? [])
  .map((c) => ({ id: c.id, title: c.title, status: c.status, ms: Number(c.durationMs ?? 0) }))
  .sort((a, b) => b.ms - a.ms);

const total = checks.reduce((a, c) => a + c.ms, 0);
const top = checks.slice(0, TOP);
const rest = checks.slice(TOP);
const restMs = rest.reduce((a, c) => a + c.ms, 0);

const rows = [
  `| Check | Status | ms | % of ${Math.round(total)} |`,
  '|---|---|---:|---:|',
  ...top.map((c) => `| \`${c.id}\` ${c.title} | ${c.status} | ${Math.round(c.ms)} | `
    + `${total > 0 ? Math.round((c.ms / total) * 100) : 0}% |`),
  `| _the other ${rest.length}_ | | ${Math.round(restMs)} | `
    + `${total > 0 ? Math.round((restMs / total) * 100) : 0}% |`,
];

const head = `### quick doctor, per check — ${LABEL} (${checks.length} checks, `
  + `${Math.round(total)} ms of check time)`;

process.stdout.write(`${head}\n${rows.join('\n')}\n`);
if (argv.includes('--summary') && process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${head}\n\n${rows.join('\n')}\n\n`);
}
