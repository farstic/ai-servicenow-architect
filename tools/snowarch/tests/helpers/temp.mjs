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
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const pending = new Set();
let armed = false;

const sweep = () => {
  for (const dir of pending) rmSync(dir, { recursive: true, force: true });
  pending.clear();
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
    rmSync(dir, { recursive: true, force: true });
    pending.delete(dir);
  });
  return dir;
}

/** `mkdtempSync` under the system temp directory, tracked. */
export const tempDir = (prefix, t) => trackTempDir(mkdtempSync(join(tmpdir(), prefix)), t);
