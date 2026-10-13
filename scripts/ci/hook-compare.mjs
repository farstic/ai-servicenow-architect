#!/usr/bin/env node
// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-11-C7 — the SessionStart hook's time, one release against another, on one machine.
 *
 * The C7 row's regression proof reads this instrument: the rc's median on each path against 2.0.13's, with 2.0.12's on
 * record beside it. So the procedure is committed, and the sitting runs exactly what produced the figure it is
 * compared with. `banner-timing.mjs` answers another question: one checkout against a budget, in CI.
 *
 * EACH REF IS A FRESH INSTALL. It is resolved in this checkout, cloned from it with `git clone --local` so that nothing
 * is fetched, checked out detached, and bootstrapped design-only as INSTALL.md runs it; the docs step syncs its sparse
 * corpus from upstream. Nothing is copied from this checkout's `.local/`, so no install has a licence, and every
 * install starts from the same state.
 *
 * INTERLEAVED, because the machine is not constant. Each round takes one run of every install in turn, ten times per
 * path, so a drift lands on all of them alike and shows as a spread between rounds, never as a difference between
 * versions. Each run spawns the hook as Claude Code spawns it, a fresh `node tools/snowarch/hooks/session-start.mjs`,
 * and times it by the wall clock, on two paths:
 *
 *   cache   after one untimed run per install and round, so every timed run finds the doctor cache fresh;
 *   rerun   with `engine.config.json`'s mtime set to now before each run, so the cache no longer describes the
 *           checkout and the hook re-runs the quick doctor. An mtime and not a deleted cache: every version reads it
 *           as an input, and a deleted cache is a FIRST run, which renders other lines.
 *
 * Each run's path is read from the hook's own `SNOWARCH_BANNER_PHASES` line. A run that took the other path is
 * dropped and counted, never silently.
 *
 * It prints min, p50, p90 and max (nearest rank) per install and path, with each round's median, then every install's
 * p50 against the FIRST ref's. With `--margin-ms`, an install whose p50 on either path is more than that above the
 * first's makes the exit 1.
 *
 * Usage: node scripts/ci/hook-compare.mjs <ref> <ref> [<ref> …] [--rounds 5] [--runs 10] [--margin-ms 25] [--keep]
 * Exit 0 measured, and within the margin when one is given · 1 over the margin · 2 cannot run.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, utimesSync } from 'node:fs';
import { cpus, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { spawnFor } from '../../tools/snowarch/lib/spawn-batch.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PATHS = Object.freeze(['cache', 'rerun']);
const HOOK = Object.freeze(['tools', 'snowarch', 'hooks', 'session-start.mjs']);
const USAGE = 'usage: node scripts/ci/hook-compare.mjs <ref> <ref> [<ref> …] [--rounds 5] [--runs 10] '
  + '[--margin-ms 25] [--keep]';

/** `{ refs, rounds, runs, marginMs, keep }`, or `{ error }`. */
export function parseArgs(argv) {
  const out = { refs: [], rounds: 5, runs: 10, marginMs: null, keep: false };
  const numbers = { '--rounds': 'rounds', '--runs': 'runs', '--margin-ms': 'marginMs' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--keep') { out.keep = true; continue; }
    if (arg in numbers) {
      const n = Number(argv[++i]);
      const floor = arg === '--margin-ms' ? 0 : 1;
      if (!Number.isInteger(n) || n < floor) return { error: `${arg} takes a whole number of at least ${floor}` };
      out[numbers[arg]] = n;
      continue;
    }
    if (arg.startsWith('--')) return { error: `unknown option ${arg}` };
    out.refs.push(arg);
  }
  if (out.refs.length < 2) return { error: 'name two refs or more; the first is the one the others are compared with' };
  return out;
}

/** The nearest-rank `p` quantile of `values`, or null when there are none. */
export function quantile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(1, Math.ceil(p * sorted.length)) - 1];
}

/** The path the hook says it took, from its `SNOWARCH_BANNER_PHASES` line, or null when it printed none. */
export const pathOf = (stderr) => (String(stderr ?? '').match(/banner-phases: path=(\S+)/) ?? [])[1] ?? null;

/**
 * Each later install's p50 on each path, less the first install's, and whether any is over `marginMs`.
 * `installs` is `[{ ref, times: { cache: number[], rerun: number[] } }]`.
 */
export function compare(installs, marginMs = null) {
  const [first, ...rest] = installs;
  const rows = rest.map((it) => {
    const delta = Object.fromEntries(PATHS.map((p) => [p, quantile(it.times[p], 0.5) - quantile(first.times[p], 0.5)]));
    return { ref: it.ref, delta, over: marginMs !== null && PATHS.some((p) => delta[p] > marginMs) };
  });
  return { base: first.ref, rows, over: rows.some((r) => r.over) };
}

const git = (args, cwd = ROOT) => spawnSync('git', args, { cwd, encoding: 'utf8' });
const tail = (text) => String(text).trim().split('\n').slice(-3).join(' / ');

/** Install `ref` into `dir` as a user would, or say why not. */
function install(ref, dir) {
  const sha = git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).stdout.trim();
  if (!sha) return `no commit named ${ref} in this checkout`;
  let r = git(['clone', '-q', '--local', '--no-checkout', ROOT, dir]);
  if (r.status !== 0) return `git clone failed: ${tail(r.stderr)}`;
  r = git(['-c', 'advice.detachedHead=false', 'checkout', '-q', '--detach', sha], dir);
  if (r.status !== 0) return `git checkout failed: ${tail(r.stderr)}`;
  const flags = ['--mode', 'design', '--yes', '--skip-claude-check'];
  const cmd = process.platform === 'win32'
    ? spawnFor(join(dir, 'bootstrap.cmd'), flags)
    : { file: join(dir, 'bootstrap.sh'), args: flags, options: {} };
  r = spawnSync(cmd.file, cmd.args, { ...cmd.options, cwd: dir, encoding: 'utf8' });
  if (r.status !== 0) return `the bootstrap exited ${r.status}: ${tail(`${r.stdout}${r.stderr}`)}`;
  return null;
}

/** One hook process, as Claude Code starts it: its wall-clock time and the path it says it took. */
function hook(dir) {
  const t0 = process.hrtime.bigint();
  const r = spawnSync(process.execPath, [join(dir, ...HOOK)], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir, SNOWARCH_BANNER_PHASES: '1' },
  });
  return { ms: Number(process.hrtime.bigint() - t0) / 1e6, took: pathOf(r.stderr) };
}

const ms = (v) => (v === null ? '-' : `${Math.round(v)}`);
const signed = (v) => `${v >= 0 ? '+' : ''}${Math.round(v)}`;

export async function main(argv = process.argv.slice(2), write = (line) => process.stdout.write(`${line}\n`)) {
  const args = parseArgs(argv);
  if (args.error) {
    process.stderr.write(`hook-compare: ${args.error}\n${USAGE}\n`);
    return 2;
  }
  const scratch = mkdtempSync(join(tmpdir(), 'snowarch-hook-compare-'));
  try {
    const installs = [];
    for (const ref of args.refs) {
      const dir = join(scratch, ref.replace(/[^A-Za-z0-9._-]/g, '-'));
      const why = install(ref, dir);
      if (why) { write(`hook-compare: ${ref}: ${why}`); return 2; }
      installs.push({ ref, dir, times: { cache: [], rerun: [] }, rounds: { cache: [], rerun: [] }, dropped: 0 });
    }
    // Interleaved RUN BY RUN, not block by block: on a machine somebody is using, a block of ten runs meets other
    // weather than the next install's block does (measured on 2026-10-13: round medians of 162 to 275 ms on one
    // install), and the runs of one round, taken in turn, meet the same.
    for (let round = 0; round < args.rounds; round++) {
      for (const it of installs) hook(it.dir);
      for (const path of PATHS) {
        const times = installs.map(() => []);
        for (let n = 0; n < args.runs; n++) {
          for (const [i, it] of installs.entries()) {
            if (path === 'rerun') { const now = new Date(); utimesSync(join(it.dir, 'engine.config.json'), now, now); }
            const run = hook(it.dir);
            if (run.took === null) {
              write(`hook-compare: ${it.ref}: the hook printed no SNOWARCH_BANNER_PHASES line`);
              return 2;
            }
            if (run.took !== path) { it.dropped++; continue; }
            times[i].push(run.ms);
          }
        }
        for (const [i, it] of installs.entries()) {
          it.times[path].push(...times[i]);
          it.rounds[path].push(quantile(times[i], 0.5));
        }
      }
    }

    // A path with no timed run has no median, and a difference against nothing is not a measurement.
    for (const it of installs) {
      const empty = PATHS.filter((p) => it.times[p].length === 0);
      if (empty.length > 0) {
        write(`hook-compare: ${it.ref}: no run took the ${empty.join(' or ')} path (${it.dropped} dropped)`);
        return 2;
      }
    }

    const cpu = cpus();
    write(`hook-compare: ${installs.length} installs · ${args.rounds} rounds × ${args.runs} runs per path · `
      + `${cpu[0]?.model ?? 'unknown CPU'} ×${cpu.length} · node ${process.version} · `
      + `${process.platform} ${process.arch}`);
    const width = Math.max(...installs.map((it) => it.ref.length));
    for (const it of installs) {
      for (const path of PATHS) {
        const t = it.times[path];
        write(`  ${it.ref.padEnd(width)}  ${path.padEnd(5)}  n ${String(t.length).padStart(3)}`
          + ` · min ${ms(quantile(t, 0))}`
          + ` · p50 ${ms(quantile(t, 0.5))} · p90 ${ms(quantile(t, 0.9))} · max ${ms(quantile(t, 1))} ms`
          + ` · round medians ${it.rounds[path].map(ms).join(' ')}`);
      }
      if (it.dropped > 0) write(`  ${it.ref.padEnd(width)}  ${it.dropped} runs took the other path and were dropped`);
    }
    const verdict = compare(installs, args.marginMs);
    for (const row of verdict.rows) {
      const margin = args.marginMs === null ? '' : ` — ${row.over ? 'OVER' : 'within'} +${args.marginMs} ms`;
      write(`p50 against ${verdict.base}: ${row.ref} cache ${signed(row.delta.cache)} ms · rerun `
        + `${signed(row.delta.rerun)} ms${margin}`);
    }
    return verdict.over ? 1 : 0;
  } finally {
    if (args.keep) write(`hook-compare: the installs are kept under ${scratch}`);
    else rmSync(scratch, { recursive: true, force: true, maxRetries: 3 });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await main();
}
