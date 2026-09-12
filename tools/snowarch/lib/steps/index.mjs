// ARC-06-S03 — the registry and the runner: what runs, in what order, and what may be skipped.
//
// The runner owns three decisions and nothing else: ORDER, whether a step's recorded result may
// stand in for running it, and what happens to the state when one fails or the operator interrupts.
// Everything a step knows about itself — when it applies, what invalidates it, what it does — lives
// in the step module, so ARC-06-S04…S09 each replace one `run()` and touch nothing here.
import { spawn as nodeSpawn } from 'node:child_process';
import * as B00 from './B00.mjs';
import * as B01 from './B01.mjs';
import * as B02 from './B02.mjs';
import * as B03 from './B03.mjs';
import * as B04 from './B04.mjs';
import * as B05 from './B05.mjs';
import * as B06 from './B06.mjs';
import * as B07 from './B07.mjs';
import * as B08 from './B08.mjs';
import * as B09 from './B09.mjs';
import { hashFor } from '../inputs.mjs';
import { failureBlock, stepLine } from './format.mjs';
import { saveState } from '../state.mjs';
import { EXIT_FAIL, EXIT_INTERRUPTED, EXIT_OK } from '../exit.mjs';

export const STEPS = Object.freeze([B00, B01, B02, B03, B04, B05, B06, B07, B08, B09]);
export const LAST = STEPS[STEPS.length - 1].id;
export const stepById = (id) => STEPS.find((s) => s.id === id) ?? null;

/** Steps that a `--yes` design-only run will actually execute, for the plan screen's Steps line. */
export function plannedSteps(ctx) {
  return STEPS.filter((s) => s.id !== 'B00' && s.id !== 'B03' && runs(s, ctx));
}

const runs = (step, ctx) => step.runsWhen(ctx) !== false;
const cacheableOf = (step) => step.cacheable !== false;

/**
 * End a child and everything it started.
 *
 * `child.kill()` on Windows is `TerminateProcess` on the direct child only, which for `npm ci`
 * means the npm shim dies and the node process doing the installing carries on — so the tree is
 * ended with `taskkill /T`. `spawn` is injected so the Windows argv can be asserted from a POSIX
 * machine; the branch is chosen by the `platform` argument, never by an ambient read, for the same
 * reason.
 */
export function killTree(child, { platform = process.platform, spawn = nodeSpawn } = {}) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return null;
  if (platform === 'win32') {
    const args = ['/PID', String(child.pid), '/T', '/F'];
    spawn('taskkill', args, { stdio: 'ignore' });
    return { how: 'taskkill', args };
  }
  child.kill('SIGINT');
  return { how: 'SIGINT', args: [] };
}

/**
 * The runner.
 *
 * `onLine` rather than a logger: the same function has to serve `--json` (human lines to stderr),
 * the tests (lines into an array) and the launchers' parity checks. A runner that reached for a
 * logger of its own would be a second place deciding what a step line says.
 */
export async function runSteps({ root, ctx, state, from = null, onLine = () => {},
  now = () => new Date(), save = saveState, steps = STEPS, last = null,
  live = { child: null, step: null },
  // The hasher, as a seam. In the product it is ARC-09-S05's TABLE, by step id — one declaration
  // of "what are my inputs", read the same way by the runner, by `staleSteps()` and by the
  // generated ARCHITECTURE table. A test driving FAKE steps has no table row for its invented ids
  // and passes its own; that is a test fixture, not a second source.
  hash: hashOf = (step) => hashFor(step.id, ctx) }) {
  const summary = { ok: 0, warn: 0, fail: 0, skipped: 0, cached: 0 };
  // B09 composes the closing block; the runner carries it out so `--json` prints the SAME string a
  // human saw rather than a second rendering of it.
  let next = null;
  const fromIndex = from ? steps.findIndex((s) => s.id === from) : -1;
  // `live` is the caller's handle on what is running RIGHT NOW, and it is passed IN rather than
  // created here: the SIGINT handler is registered outside this function and fires while the
  // `await` below is still pending, so a handle created in here would never be visible to it. That
  // was the first version, and it meant Ctrl-C left the child running.
  // The denominator comes from the list being run, not from the module constant: a test driving
  // three stub steps must not print `/09`, or every line it asserts is a line no user ever sees.
  const lastId = last ?? steps[steps.length - 1].id;

  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    const recorded = state.steps[step.id] ?? null;

    if (!runs(step, ctx)) {
      const detail = step.skipReason ?? 'not applicable';
      const note = step.skipNote ?? null;
      state.steps[step.id] = { status: 'skipped', inputsHash: null, detail,
        finishedAt: now().toISOString(), durationMs: 0 };
      summary.skipped += 1;
      onLine(stepLine({ id: step.id, title: step.title, status: 'skipped', detail, note,
        last: lastId }));
      continue;
    }

    // The hash is computed even when the step is about to run: it is what the NEXT run compares
    // against, so a step that ran without recording its inputs would re-run for ever.
    const hash = cacheableOf(step) ? hashOf(step, ctx) : null;
    const forced = fromIndex !== -1 && i >= fromIndex;
    const cached = cacheableOf(step) && !forced
      && recorded?.status === 'ok' && recorded.inputsHash === hash;

    if (cached) {
      summary.cached += 1;
      summary.ok += 1;
      onLine(stepLine({ id: step.id, title: step.title, status: 'cached', last: lastId }));
      continue;
    }

    const started = Date.now();
    live.step = step.id;
    let result;
    try {
      result = await step.run({
        ...ctx,
        state,
        /**
         * A step's own output. B00 prints seven check lines before its step line, and a step that
         * reached for `console.log` would bypass redaction and the log file both — so the runner
         * hands it the same sink every step line goes through.
         */
        line: onLine,
        /** Steps spawn through here so the interrupt handler can reach their children. */
        spawn: (cmd, args, opts) => {
          const child = nodeSpawn(cmd, args, opts);
          live.child = child;
          child.on('exit', () => { if (live.child === child) live.child = null; });
          return child;
        },
      });
    } catch (e) {
      result = { status: 'fail', detail: e.message, remedy: null };
    }
    const durationMs = Date.now() - started;
    live.step = null;

    // An interrupt already wrote this step's entry and its own exit code. Whatever the step went on
    // to return — an `ok` from a body that ignored the dead child, a `fail` from one that noticed —
    // must not overwrite that: the record of WHY the run stopped is the thing a resume reads. In
    // production `process.exit` usually wins this race; correctness should not depend on it.
    if (live.interrupted) {
      return { code: EXIT_INTERRUPTED, summary, state, stoppedAt: step.id, live };
    }

    const entry = { status: result.status === 'warn' ? 'warn' : result.status,
      inputsHash: hash, finishedAt: now().toISOString(), durationMs };
    if (result.detail) entry.detail = result.detail;
    if (result.data) entry.data = result.data;
    state.steps[step.id] = entry;

    if (result.status === 'fail') {
      summary.fail += 1;
      onLine(stepLine({ id: step.id, title: step.title, status: 'fail', last: lastId }));
      for (const l of failureBlock({ id: step.id, cause: result.detail, remedy: result.remedy })) {
        onLine(l);
      }
      save(root, state);
      // A step may name its own exit code — B00's failures are missing PREREQUISITES, which is a
      // different thing from "a step failed" and a different number to key on.
      return { code: result.code ?? EXIT_FAIL, summary, state, stoppedAt: step.id, live };
    }

    if (result.next) next = result.next;
    summary[result.status === 'warn' ? 'warn' : 'ok'] += 1;
    onLine(stepLine({ id: step.id, title: step.title, status: result.status, durationMs, last: lastId }));
    // Saved after EVERY step, not at the end: the whole point of the state file is that a run which
    // does not reach the end still knows where it got to.
    save(root, state);
  }

  return { code: EXIT_OK, summary, state, stoppedAt: null, live, next };
}

/**
 * What Ctrl-C does. A function, not just a handler, so it can be tested without delivering a signal
 * — Windows cannot receive one from `process.kill` the way POSIX can, and a test that could only
 * run on one platform would leave the other's path unproven.
 */
export function interrupt({ root, state, live, onLine = () => {}, now = () => new Date(),
  save = saveState, platform = process.platform, spawn = nodeSpawn }) {
  if (live) live.interrupted = true;
  const killed = killTree(live?.child, { platform, spawn });
  const at = live?.step ?? null;
  if (at) {
    state.steps[at] = { ...(state.steps[at] ?? {}), status: 'failed', reason: 'interrupted',
      finishedAt: now().toISOString() };
    onLine(`interrupted during ${at} — re-run ./bootstrap.sh to resume at ${at}`);
  } else {
    onLine('interrupted — nothing was in progress');
  }
  try { save(root, state); } catch { /* an interrupt must not fail over its own bookkeeping */ }
  return { code: EXIT_INTERRUPTED, killed, at };
}
