#!/usr/bin/env node
/**
 * Time the SessionStart banner the way a session pays for it: cold, five times, and report the
 * median.
 *
 * ARC-08-S11 / README criterion 5. The banner runs before the user's first word of every session,
 * so its cost is the one piece of doctor latency nobody chooses to pay — and the failure mode is
 * not an error but a checkout that feels slow to start, which nobody reports as a bug.
 *
 * FIVE spawns, MEDIAN, and the cache deleted before each: a mean would be dragged by one noisy
 * runner, and a warm cache measures the fast path that S08 wrote precisely so this number would be
 * small. What is timed is the cold path — the one a first session in a fresh checkout gets.
 *
 * The bound here is 1 second, not S08's 300 ms. 300 ms is the reference-machine target and holds
 * on hardware nobody shares; a hosted runner shares a disk with whoever else is on the box, and a
 * bound that fails on their noise would train everyone to re-run the job.
 *
 * Usage: node scripts/ci/banner-timing.mjs [--runs 5] [--budget-ms 1000] [--summary]
 * Exit 0 within budget · 1 over · 2 cannot run.
 */
import { appendFileSync, existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const value = (n, d) => (argv.indexOf(n) === -1 ? d : argv[argv.indexOf(n) + 1]);
const ROOT = resolve(value('--root', resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')));

const RUNS = Number(value('--runs', '5'));
const BUDGET = Number(value('--budget-ms', '1000'));
const HOOK = join(ROOT, 'tools', 'snowarch', 'hooks', 'session-start.mjs');
const CACHE = join(ROOT, '.local', 'doctor-last.json');

if (!existsSync(HOOK)) {
  process.stderr.write(`banner-timing: ${HOOK} is not there\n`);
  process.exit(2);
}

const times = [];
let lastLine = '';
for (let i = 0; i < RUNS; i += 1) {
  rmSync(CACHE, { force: true });              // cold, every time
  const started = process.hrtime.bigint();
  const r = spawnSync(process.execPath, [HOOK], { cwd: ROOT, encoding: 'utf8' });
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  // A hook that fails is not a slow hook — it is a session that starts with an error about the
  // tool meant to help, and S08's whole design is that every path exits 0.
  if (r.status !== 0) {
    process.stderr.write(`banner-timing: run ${i + 1} exited ${r.status}\n${r.stderr ?? ''}\n`);
    process.exit(1);
  }
  const out = (r.stdout ?? '').trim();
  if (!/Mode: /.test(out)) {
    process.stderr.write(`banner-timing: run ${i + 1} printed no Mode line:\n${out}\n`);
    process.exit(1);
  }
  lastLine = out.split('\n').find((l) => l.startsWith('Mode: ')) ?? out.split('\n')[0];
  times.push(ms);
}

const sorted = [...times].sort((a, b) => a - b);
const median = Math.round(sorted[Math.floor(sorted.length / 2)]);
const all = times.map((t) => Math.round(t)).join(', ');
process.stdout.write(`banner-timing: median ${median} ms over ${RUNS} cold runs (${all}) — budget ${BUDGET} ms\n`);
process.stdout.write(`banner-timing: ${lastLine}\n`);

if (argv.includes('--summary') && process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    [`**banner (${process.platform})** — median **${median} ms** over ${RUNS} cold runs `
      + `(${all}); budget ${BUDGET} ms`, '', '```', lastLine, '```', ''].join('\n'));
}

if (median > BUDGET) {
  process.stderr.write(`banner-timing: ${median} ms is over the ${BUDGET} ms budget\n`);
  process.exit(1);
}
