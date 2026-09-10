import { rmSync } from 'node:fs';
import type { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

/**
 * Making sure a spawned server child is GONE before its temp directory is removed.
 *
 * `client.close()` is a graceful shutdown, not a join. The SDK transport ends stdin, races the
 * child's `close` event against a 2 s timer, signals if the race expires, and races again — so
 * it can return while the child is still alive and still writing. On a quiet machine that
 * window is empty; on a loaded one it is not, and an `afterEach` that removes the temp
 * directory then fails with `ENOTEMPTY` on a directory the child repopulated mid-walk. That is
 * a failure of the teardown, reported against whichever test happened to be last — the test
 * itself passed. (Seen on `macos-latest` / node 24 when two 25-job runs shared the pool.)
 *
 * The reap therefore belongs in the teardown, next to the removal it protects, rather than in
 * each test's `finally`: it then covers every test in the file including ones not yet written,
 * and the ordering it depends on cannot be got wrong at a call site.
 *
 * The pid is captured at spawn time on purpose. `transport.pid` reads `null` once `close()` has
 * started, because the transport drops its handle to the child before shutting it down.
 */
const spawned = new Set<number>();

/** The public `pid` getter, so an SDK that stopped exposing it fails to compile rather than silently. */
export function trackServerChild(transport: StdioClientTransport): number {
  const { pid } = transport;
  // A transport that reports no pid would make `reapServerChildren` a no-op that still passes.
  if (pid === null) throw new Error('the transport reports no pid — nothing can be reaped');
  spawned.add(pid);
  return pid;
}

const alive = (pid: number): boolean => {
  // Signal 0 tests for existence without delivering anything.
  try { process.kill(pid, 0); return true; } catch { return false; }
};

const GRACE_MS = 2_000;
const SIGKILL_AFTER_MS = 500;

/**
 * Wait for every tracked child to be gone, killing the ones that outstay `SIGKILL_AFTER_MS`.
 *
 * `SIGKILL` cannot be caught, so a child that ignores the transport's `SIGTERM` still dies; a
 * pid that has already been reaped is simply absent and costs one failed `kill`. Signalling is
 * deferred by half a second rather than sent immediately so that an ordinary graceful exit —
 * the normal case — is never turned into a kill.
 *
 * KNOWN LIMITATION, accepted: this signals a pid, not a handle. If the child exited and the OS
 * recycled its pid between the reap starting and the `SIGKILL` — 500 ms to 2 s later — the
 * signal would land on an unrelated process. There is no handle to signal instead: the SDK
 * transport clears its own reference to the child at the start of `close()`, so by the time a
 * teardown runs, the pid captured at spawn is the only identifier that survives. On a runner
 * allocating pids sequentially through a 32-bit space the window is remote, and the alternative
 * — not reaping — is the failure this file exists to stop.
 */
export async function reapServerChildren(): Promise<void> {
  const pids = [...spawned];
  spawned.clear();
  const started = Date.now();
  const signalled = new Set<number>();
  let left = pids.filter(alive);
  while (left.length > 0 && Date.now() - started < GRACE_MS) {
    if (Date.now() - started >= SIGKILL_AFTER_MS) {
      for (const pid of left) {
        if (signalled.has(pid)) continue;
        signalled.add(pid);
        try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
      }
    }
    await new Promise((resolve) => { setTimeout(resolve, 20); });
    left = left.filter(alive);
  }
  if (left.length > 0) {
    throw new Error(`server child ${left.join(', ')} still running after ${GRACE_MS} ms — its temp directory is not safe to remove`);
  }
}

/**
 * Remove a test's temp directory, tolerating a straggling write.
 *
 * `maxRetries` is the belt to the reap's braces: the reap removes the writer, and the retries
 * absorb a write that was already in flight when it died. Without them a single unlucky
 * `ENOTEMPTY` is an unreproducible red build.
 */
export function removeTempDir(path: string): void {
  rmSync(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  pending.delete(path);
}

/**
 * The backstop for a run that never reaches its `afterEach`.
 *
 * `removeTempDir` is correct and was being called — after `await reapServerChildren()`, so a reap
 * that threw took the removal with it, and a run interrupted between tests never got there at all.
 * Five `snowarch-nosecrets-*` trees survived that way here and more on the reviewer's machine. An
 * exit handler cannot await, so this is `rmSync`; a directory already removed by the normal path
 * has been dropped from the set and is not touched again.
 */
const pending = new Set<string>();
let armed = false;

export function trackTempDir(path: string): string {
  pending.add(path);
  if (!armed) {
    armed = true;
    process.on('exit', () => {
      for (const dir of pending) rmSync(dir, { recursive: true, force: true });
    });
  }
  return path;
}
