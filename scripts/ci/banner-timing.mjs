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
 * ARC-09-C4 — the bound is applied to the BANNER, not to the machine. The same cell
 * (`bootstrap (no-gitbash, windows-latest)`) measured 728, 802, 944 and 1027 ms across four
 * consecutive runs whose product code was byte-identical, and the fourth failed a 1000 ms budget
 * the first three passed. So the floor is measured too — an empty Node process, INTERLEAVED with
 * the real runs so both see the same weather — and the budget is spent on the difference.
 *
 * WHAT THE FLOOR TURNED OUT TO BE, and it is not what I assumed when I wrote this: on that cell it
 * is **43 ms** of a 903 ms median. The banner's own work is 860 ms of it. The subtraction is still
 * the right thing to judge — a budget should not be spent on another process's startup — but it
 * buys almost nothing here, and the honest reading is that this cell's banner is genuinely close
 * to its cap. That is a fact about the RE-RUN path, which is all this harness measures: the cache
 * is deleted before every spawn, so what is timed is a cold first session running a quick doctor,
 * never the fast path a second session gets (29 ms on macOS). The margin is ~140 ms against an
 * observed spread of ±150, so this guard can still trip; the number to move, if it does, is this
 * cell's cap, with the measurement recorded — not the method.
 *
 * TWO PATHS, since ARC-09-S08, because they answer different questions and only one of them is a
 * regression when it moves:
 *
 *   FAST (warm cache) — what every session after the first pays. `01` §8's budget, 300 ms. A trip
 *   here is a PRODUCT regression: the path reads two JSON files and returns.
 *
 *   RE-RUN (cold, cache deleted) — a first session in a fresh checkout, which runs a quick doctor.
 *   1000 ms on the difference. A trip here is ARC-09-C5's territory: it means the doctor got
 *   slower, not that the banner did.
 *
 * Usage: node scripts/ci/banner-timing.mjs [--runs 5] [--budget-ms 1000] [--fast-budget-ms 300]
 *        [--summary]
 * Exit 0 within budget · 1 over · 2 cannot run.
 */
import { appendFileSync, existsSync, rmSync, writeSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const value = (n, d) => (argv.indexOf(n) === -1 ? d : argv[argv.indexOf(n) + 1]);
const ROOT = resolve(value('--root', resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')));

const RUNS = Number(value('--runs', '5'));
const BUDGET = Number(value('--budget-ms', '1000'));
const FAST_BUDGET = Number(value('--fast-budget-ms', '300'));
const HOOK = join(ROOT, 'tools', 'snowarch', 'hooks', 'session-start.mjs');
const CACHE = join(ROOT, '.local', 'doctor-last.json');

if (!existsSync(HOOK)) {
  writeSync(2, `banner-timing: ${HOOK} is not there\n`);
  process.exit(2);
}

/** One spawn, timed. */
function timed(args) {
  const started = process.hrtime.bigint();
  const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' });
  return { ms: Number(process.hrtime.bigint() - started) / 1e6, r };
}

const times = [];
const floors = [];
const fast = [];
let lastLine = '';
for (let i = 0; i < RUNS; i += 1) {
  // INTERLEAVED, not measured in a block of its own: a runner's load moves over seconds, and a
  // floor taken five times before the banner would be describing a different machine from the one
  // the banner ran on.
  floors.push(timed(['-e', '']).ms);

  rmSync(CACHE, { force: true });              // cold, every time
  const { ms, r } = timed([HOOK]);
  // A hook that fails is not a slow hook — it is a session that starts with an error about the
  // tool meant to help, and S08's whole design is that every path exits 0.
  if (r.status !== 0) {
    writeSync(2, `banner-timing: run ${i + 1} exited ${r.status}\n${r.stderr ?? ''}\n`);
    process.exit(1);
  }
  const out = (r.stdout ?? '').trim();
  if (!/Mode: /.test(out)) {
    writeSync(2, `banner-timing: run ${i + 1} printed no Mode line:\n${out}\n`);
    process.exit(1);
  }
  lastLine = out.split('\n').find((l) => l.startsWith('Mode: ')) ?? out.split('\n')[0];
  times.push(ms);

  // …and immediately again, WITHOUT deleting the cache: the run above just wrote one, so this is
  // the fast path, measured on the same machine in the same second as the cold run it follows.
  const warm = timed([HOOK]);
  if (warm.r.status !== 0) {
    writeSync(2, `banner-timing: warm run ${i + 1} exited ${warm.r.status}\n`);
    process.exit(1);
  }
  fast.push(warm.ms);
}

const medianOf = (xs) => {
  const sorted = [...xs].sort((a, b) => a - b);
  return Math.round(sorted[Math.floor(sorted.length / 2)]);
};
const median = medianOf(times);
const floor = medianOf(floors);
const fastMedian = medianOf(fast);
// The product's own cost, which is what the budget is about. Never below zero: on a very quiet
// machine an empty Node can measure slower than one of the banner runs, and a negative "cost"
// would be a number nobody could act on.
const cost = Math.max(0, median - floor);
const all = times.map((t) => Math.round(t)).join(', ');
const allFast = fast.map((t) => Math.round(t)).join(', ');
writeSync(1, `banner-timing: re-run path median ${median} ms over ${RUNS} cold runs `
  + `(${all}); node floor ${floor} ms → banner ${cost} ms — budget ${BUDGET} ms\n`);
writeSync(1, `banner-timing: fast path median ${fastMedian} ms over ${RUNS} warm runs `
  + `(${allFast}) — budget ${FAST_BUDGET} ms\n`);
writeSync(1, `banner-timing: ${lastLine}\n`);

if (argv.includes('--summary') && process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    [`**banner (${process.platform})**`, '',
      `- re-run path: **${cost} ms** — median ${median} ms over ${RUNS} cold runs (${all}) minus a `
      + `${floor} ms node floor; budget ${BUDGET} ms`,
      `- fast path: **${fastMedian} ms** over ${RUNS} warm runs (${allFast}); budget `
      + `${FAST_BUDGET} ms`,
      '', '```', lastLine, '```', ''].join('\n'));
}

// The FAST path first, because a trip there is the one that means the product regressed.
if (fastMedian > FAST_BUDGET) {
  writeSync(2, `banner-timing: the fast path cost ${fastMedian} ms, over the `
    + `${FAST_BUDGET} ms budget — that path reads two JSON files and returns, so this is a `
    + 'regression rather than a slow machine\n');
  process.exit(1);
}
if (cost > BUDGET) {
  writeSync(2, `banner-timing: the re-run path cost ${cost} ms (median ${median} ms minus `
    + `a ${floor} ms node floor), over the ${BUDGET} ms budget — see ARC-09-C5 before moving it\n`);
  process.exit(1);
}
