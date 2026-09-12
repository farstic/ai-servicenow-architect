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
import { mkdtempSync, rmSync, writeSync } from 'node:fs';
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
 */
function remove(dir) {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    return null;
  } catch (e) {
    return e;
  }
}

/**
 * Every tracked directory, each attempted independently of the others.
 *
 * It used to be `for (const dir of pending) rmSync(dir, …)` followed by `pending.clear()`, and that
 * shape has two faults that only show under load: ONE directory that will not go takes every
 * directory after it with it, and `pending.clear()` — the line that records what was dealt with —
 * is never reached at all. `fixture-cleanup.test.mjs` beside this file failed three times on ubuntu/node 24
 * with a POPULATED directory and a normal exit, which is what this looks like from the outside.
 * Not reproduced on macOS/node 24 in 48 attempts, so this is the cause the code makes possible
 * rather than the cause observed — and the message below is what the next occurrence will say.
 */
const sweep = () => {
  const failed = [];
  for (const dir of pending) {
    const error = remove(dir);
    if (error) failed.push(`${dir}: ${error.code ?? error.message}`);
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

/** Track a directory somebody else created. Returns it, so it can wrap an existing expression. */
export function trackTempDir(dir, t) {
  pending.add(dir);
  arm();
  // `t?.after?.()` — the context is optional, and a vitest or plain call has none.
  t?.after?.(() => {
    // `pending.delete` happens whatever `remove` returned: if the directory is genuinely stuck, the
    // backstop retrying it at exit would only stall the run, and the sweep's message is where a
    // survivor gets reported. A hook that THREW here would fail the test it belongs to for a reason
    // that has nothing to do with what the test was about.
    remove(dir);
    pending.delete(dir);
  });
  return dir;
}

/** `mkdtempSync` under the system temp directory, tracked. */
export const tempDir = (prefix, t) => trackTempDir(mkdtempSync(join(tmpdir(), prefix)), t);
