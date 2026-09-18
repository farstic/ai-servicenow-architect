/**
 * Temp fixtures that are actually removed — including when the test that made them fails.
 *
 * The engine suite had left **14,261** `snowarch-bootstrap-*` directories and **1,244**
 * `snowarch-if-*` in this machine's `TMPDIR`, and a comparable pile in the reviewer's. None of it
 * was one bad test: `makeCheckout()` never removed anything at all, and a helper shared by fifteen
 * files cannot clean up in a `finally` that only one of them writes.
 *
 * Two mechanisms, because there are two failure modes:
 *
 *   `t.after` — the test's own context. Runs when the test ENDS, passing or failing, which is what
 *   an unconditional `rmSync` at the bottom of a test body does not do: a failed assertion throws
 *   past it. This is the one to prefer, and every new fixture should pass its `t`.
 *
 *   `process.on('exit')` — the backstop for the fifteen existing call sites that have no context to
 *   give, and for a run that ends between tests. Synchronous by necessity: an exit handler cannot
 *   await, which is why `rmSync` and not `rm`.
 *
 * A directory removed by the first is dropped from the second, so the backstop never touches a
 * path that has been reused since.
 */
import { existsSync, mkdtempSync, rmSync, writeFileSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const pending = new Set();
let armed = false;

/**
 * Remove a tree, and keep trying briefly.
 *
 * `rmSync` defaults to **zero** retries, and a recursive removal is not atomic: on a loaded Linux
 * runner it can come back EBUSY or ENOTEMPTY while something else still holds a handle inside the
 * tree. Node documents `maxRetries`/`retryDelay` for exactly those errors; without them one
 * transient failure is a fixture left on disk for good.
 *
 * Returns the error rather than throwing, because BOTH callers must carry on: an `exit` handler
 * that throws loses the rest of the sweep, and a `t.after` that throws turns a passing test red for
 * a reason that has nothing to do with what it was testing.
 *
 * AND IT CHECKS. `rmSync` returning is a report, not a fact, and the difference between the two is
 * the only path left in this file that produces all four things the 2026-09-18 recurrence showed at
 * once: a populated directory, NO owner record beside it, a clean exit, and a sweep that said
 * nothing. Both places that delete an owner record do it only when this function reported success,
 * and both places that would have reported the survivor skip it for the same reason — so one
 * unverified `return null` silently disarms every instrument downstream of it. A removal that
 * cannot tell "gone" from "I called the syscall" is the same defect as a check that cannot tell
 * failure from absence, which is the one this programme keeps finding.
 *
 * `rm` is a parameter so the closed path can be driven directly: no filesystem reliably produces a
 * successful-but-ineffective removal on demand, and a defect that can only be waited for is a
 * defect with no test.
 */
export function remove(dir, rm = rmSync) {
  try {
    rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  } catch (e) {
    return e;
  }
  if (!existsSync(dir)) return null;
  // Shaped like the errno errors the callers already know how to print, so the survivor reaches the
  // stderr message and the `.owner` record stays put — the handling was always right, it was just
  // never reached.
  return Object.assign(new Error(`${dir} still exists after a removal that reported success`),
    { code: 'ESURVIVED' });
}

/**
 * Every tracked directory, each attempted independently of the others.
 *
 * It used to be `for (const dir of pending) rmSync(dir, …)` followed by `pending.clear()`, and that
 * shape has two faults that only show under load: ONE directory that will not go takes every
 * directory after it with it, and `pending.clear()` — the line that records what was dealt with —
 * is never reached at all. `fixture-cleanup.test.mjs` beside this file failed three times on ubuntu/node 24
 * with a POPULATED directory and a normal exit, which is what this looks like from the outside.
 *
 * Still not reproduced on demand: 48 concurrent probes on macOS/node 24 (APFS) and 192 on
 * Ubuntu 22.04/node 22 (ext4), 240 in all, none of which fired. So this remains the cause the code
 * makes possible rather than the cause observed, and the message below is what the next occurrence
 * will say.
 */
const sweep = () => {
  const failed = [];
  for (const dir of pending) {
    const error = remove(dir);
    // The owner record outlives a FAILED removal, and that is the point of writing it: a fixture
    // still on disk with no record of who made it is the state this instrument exists to prevent.
    // It goes only when the directory it describes has actually gone.
    if (error) failed.push(`${dir}: ${error.code ?? error.message}`);
    else remove(`${dir}.owner`);
  }
  pending.clear();
  if (failed.length) {
    // An exit handler cannot fail a run, so it says so where a person will see it: stderr, with the
    // errno and the Node version, which is what the three CI occurrences never told anyone.
    //
    // `writeSync(2, …)` and not `process.stderr.write`: from an EXIT handler, a write to a pipe is
    // asynchronous and the process is gone before it drains — the message vanished exactly that way
    // the first time this was tried, and it is the same thing `scripts/docs.mjs` was doing to its
    // `--json` output (ARC-09-S02). A diagnosis that does not arrive is not a diagnosis.
    writeSync(2, `temp.mjs: ${failed.length} fixture(s) survived on node ${process.versions.node}:\n`
      + failed.map((f) => `  ${f}\n`).join(''));
  }
};

function arm() {
  if (armed) return;
  armed = true;
  process.on('exit', sweep);

  // AND on the signals a TEST RUNNER sends. `exit` alone was not enough: on ubuntu/node 24 and on
  // every Windows cell, a fixture from a FAILING test survived while the same case passed on
  // macOS — the runner ends a child that failed with a signal, and a signal's default action
  // terminates without running `exit` handlers. Handling one means owning it, so each handler
  // sweeps, removes itself and re-raises, leaving the exit code and the runner's own reporting
  // exactly as they would have been.
  //
  // `SIGINT` is deliberately NOT here: a Ctrl-C during a test run is the one case where leaving
  // the evidence on disk is defensible, and it is the user's interrupt rather than a runner's.
  for (const signal of ['SIGTERM', 'SIGHUP']) {
    process.on(signal, () => {
      sweep();
      process.removeAllListeners(signal);
      process.kill(process.pid, signal);
    });
  }
}

/**
 * Who made a fixture, written BESIDE it rather than inside it.
 *
 * Two leftovers turned up in one day — CI ubuntu/node24 and a local run — each reported as a
 * directory name with nine entries and nothing about where it came from. An instrument that cannot
 * say who lost the thing is how a day disappears chasing a race.
 *
 * Beside, not inside: `makeCheckout` builds a checkout that tests walk, count and run `git` in, so a
 * marker file within it would change the subject of the tests it is meant to help debug.
 *
 * It is written at CREATION, not at cleanup, because the case worth explaining is the one where the
 * process dies before any cleanup runs — a killed test file never reaches `t.after` OR the exit
 * sweep, and 118 of the `makeCheckout()` call sites pass no test context at all, so the exit sweep
 * is the only thing standing between them and a permanent pile.
 */
function recordOwner(dir, t) {
  try {
    const where = (new Error().stack ?? '').split('\n')
      .map((l) => l.trim())
      .find((l) => l.includes('/tests/') && !l.includes('helpers/temp.mjs')) ?? 'unknown caller';
    writeFileSync(`${dir}.owner`, `${t?.name ?? '(no test context)'}\n${where}\npid ${process.pid}\n`);
  } catch { /* an instrument must never fail the run it is instrumenting */ }
}

/** Track a directory somebody else created. Returns it, so it can wrap an existing expression. */
export function trackTempDir(dir, t) {
  pending.add(dir);
  recordOwner(dir, t);
  arm();
  // `t?.after?.()` — the context is optional, and a vitest or plain call has none.
  t?.after?.(() => {
    // A hook that THREW here would fail the test it belongs to for a reason that has nothing to do
    // with what the test was about — so `remove` returns its error and this decides what to do
    // with it. What it must NOT do is forget it.
    //
    // It used to `remove(dir)`, remove the owner record and `pending.delete(dir)` unconditionally,
    // reasoning that "the sweep's message is where a survivor gets reported". The delete is what
    // guaranteed the sweep would never see it: a directory whose removal FAILED was struck from
    // the register of things still owed, its owner record — the one thing that would have named
    // its creator — was deleted, and the exit handler then found nothing to report and said
    // nothing. That is the exact signature ubuntu/node 24 produced: a populated directory, a clean
    // exit, an owner record gone, and `(neither stream mentioned the sweep)` in the assertion.
    //
    // So: on failure keep BOTH the directory in `pending` and its `.owner` beside it. The exit
    // sweep retries it — up to 500 ms once, at exit, and only for a fixture something already
    // failed to remove, which is a fair price for the difference between a diagnosis and a
    // directory name — and reports it with its errno if it fails again.
    //
    // THAT FIX WAS IN PLACE AND THE SIGNATURE CAME BACK. It shipped on 2026-09-17; ubuntu/node 24
    // produced the same four facts again on 2026-09-18, which retires the explanation above as the
    // whole story. Reading the code for what can still do it: every route to a missing `.owner`
    // runs through `remove` reporting success, and a fixture created after this hook would have
    // written an owner record of its own at creation — so a survivor with no record was not
    // recreated by anything, it was never removed by a call that said it had been. That is the one
    // candidate the four facts leave standing, and it is what `remove` now verifies rather than
    // assumes.
    if (remove(dir)) return;
    remove(`${dir}.owner`);
    pending.delete(dir);
  });
  return dir;
}

/** `mkdtempSync` under the system temp directory, tracked. */
export const tempDir = (prefix, t) => trackTempDir(mkdtempSync(join(tmpdir(), prefix)), t);
