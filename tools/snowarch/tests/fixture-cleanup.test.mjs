/**
 * The fixtures are removed — proven by running a suite and counting what is left.
 *
 * Every other test in this repository asserts something about the program. This one asserts
 * something about the SUITE: that it does not litter. The evidence that it needed writing was
 * 14,261 `snowarch-bootstrap-*` directories and 1,244 `snowarch-if-*` in one developer's `TMPDIR`,
 * accumulated across the programme's runs, and a comparable pile in the reviewer's — every one of
 * them a fixture whose factory never removed anything.
 *
 * Counting inside THIS process would prove nothing: the exit handler that does half the work has
 * not run yet, and cannot until the process ends. So a child `node --test` runs a two-test file in
 * a private temp directory, and the count is taken after the child is gone.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { tempDir } from './helpers/temp.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const workspace = pathToFileURL(resolve(here, 'helpers/workspace.mjs')).href;

/**
 * Run one probe file in its own temp directory, as a test run that is nobody's child.
 *
 * TMPDIR, TMP and TEMP together: `os.tmpdir()` reads the first on POSIX and the other two on
 * Windows, and setting only one would silently measure the real temp directory.
 *
 * `NODE_TEST_CONTEXT` is DELETED, and that is the whole trick. This file is itself run by
 * `node --test`, which sets that variable; a child that inherits it reports its results up the
 * protocol to the parent runner instead of deciding its own exit code — so a probe whose test
 * threw came back `status: 0`, and the assertion "the probe was supposed to fail" is what caught
 * it. Without this line the failing-path case would have been vacuous in exactly the way it was
 * written to avoid.
 */
function runProbe(probe, sandbox) {
  const env = { ...process.env, TMPDIR: sandbox, TMP: sandbox, TEMP: sandbox };
  delete env.NODE_TEST_CONTEXT;
  return spawnSync(process.execPath, ['--test', probe], { encoding: 'utf8', env });
}

/**
 * What the child left behind, once it has had a chance to finish leaving.
 *
 * `spawnSync` returns when the process is gone, but the DIRECTORY ENTRY it was removing is the
 * kernel's business and a recursive removal of a tree on a loaded CI runner is not instantaneous.
 * This cell failed twice on ubuntu/node 24 and nowhere else, both times reporting `status 1,
 * signal null` — an ordinary exit, so both the after-hook and the exit handler had their turn.
 * A short bounded wait turns that race into the pass it is; a fixture that is genuinely still
 * there after half a second is still a failure, and the message now says whether the directory is
 * EMPTY (removal started, entry lingering) or populated (removal never ran), because those are
 * different bugs and the next occurrence should not need a third guess.
 */
function leftBehind(sandbox) {
  let names = [];
  for (let attempt = 0; attempt < 10; attempt += 1) {
    names = readdirSync(sandbox).filter((name) => name.startsWith('snowarch-'));
    if (names.length === 0) return { names, detail: '' };
    // 50 ms × 10: long enough for a teardown that is merely slow, short enough that a real leak
    // does not cost the suite half a second per case.
    const until = Date.now() + 50;
    while (Date.now() < until) { /* spin: the check is synchronous by necessity */ }
  }
  const detail = names.map((name) => {
    const contents = readdirSync(join(sandbox, name));
    return `${name} (${contents.length === 0 ? 'EMPTY — removal started, entry lingering'
      : `${contents.length} entries — removal never ran`})`;
  }).join(', ');
  return { names, detail };
}

test('a fixture made by makeCheckout is gone once the run that made it ends', (t) => {
  const sandbox = mkdtempSync(join(tmpdir(), 'fixture-cleanup-'));
  t.after(() => rmSync(sandbox, { recursive: true, force: true }));

  // Two cases in one child, because they are cleaned by different mechanisms: the first by the
  // test's own context, the second by the exit handler that covers the fifteen existing call
  // sites which have no context to pass.
  const probe = join(sandbox, 'probe.test.mjs');
  writeFileSync(probe, [
    "import { test } from 'node:test';",
    `import { makeCheckout } from ${JSON.stringify(workspace)};`,
    "test('with a context', (t) => { makeCheckout({}, t); });",
    "test('without one', () => { makeCheckout(); });",
    '',
  ].join('\n'));

  const child = runProbe(probe, sandbox);
  assert.equal(child.status, 0, `${child.stdout}${child.stderr}`);

  const left = leftBehind(sandbox);
  assert.deepEqual(left.names, [], `the child left ${left.names.length} fixture(s) behind: ${left.detail}`);
});

/**
 * ARC-09-C1. One directory that will not go must not take the others with it.
 *
 * The sweep was `for (const dir of pending) rmSync(dir, …)` and then `pending.clear()`. A single
 * throw aborted the loop AND skipped the line that records what was handled — so on a loaded runner
 * one transient EBUSY left every remaining fixture on disk. That is what
 * `fixture-cleanup` reported three times on ubuntu/node 24: a POPULATED directory after a normal
 * exit. It did not reproduce on macOS/node 24 in 48 attempts, so this case proves the SHAPE rather
 * than the platform — an undeletable entry stands in for the transient error.
 */
test('one fixture that will not go does not take the others with it', (t) => {
  const sandbox = tempDir('fixture-cleanup-partial-', t);
  const probe = join(sandbox, 'probe.test.mjs');
  // Three fixtures; the middle one is made unremovable by holding an open handle to a file inside
  // it on Windows, and on POSIX by clearing the write bit on its PARENT (unlink needs it).
  writeFileSync(probe, [
    "import { test } from 'node:test';",
    "import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';",
    "import { join } from 'node:path';",
    `import { makeCheckout } from ${JSON.stringify(workspace)};`,
    "test('three fixtures, one stuck', () => {",
    '  makeCheckout();',
    '  const stuck = makeCheckout();',
    '  makeCheckout();',
    "  const locked = join(stuck, 'locked');",
    '  mkdirSync(locked, { recursive: true });',
    "  writeFileSync(join(locked, 'f.txt'), 'x');",
    "  if (process.platform !== 'win32') chmodSync(locked, 0o500);",
    '});',
    '',
  ].join('\n'));

  const child = runProbe(probe, sandbox);
  assert.equal(child.status, 0, `${child.stdout}${child.stderr}`);

  const left = readdirSync(sandbox).filter((n) => n.startsWith('snowarch-'));
  // At most the stuck one. Before the fix this was two or three, because the loop stopped.
  assert.ok(left.length <= 1,
    `${left.length} fixtures survived — one stuck directory aborted the sweep: ${left.join(', ')}`);
  // ...and if one did survive, the sweep said so, with the errno and the Node major.
  if (left.length === 1) {
    // BOTH streams: the sweep writes to fd 2 from an exit handler, and `node --test` owns the
    // child's output — which stream a late write surfaces on is the runner's business, not this
    // assertion's. What matters is that the diagnosis arrived at all.
    assert.match(`${child.stdout}${child.stderr}`,
      /temp\.mjs: 1 fixture\(s\) survived on node \d+\.\d+\.\d+:/,
      'a fixture survived and nothing said why');
    assert.match(`${child.stdout}${child.stderr}`, /ENOTEMPTY|EACCES|EBUSY|EPERM/,
      'the message does not name the errno, which is the thing worth knowing');
  }

  // Leave nothing behind ourselves: the stuck directory needs its permission back first.
  for (const name of left) {
    const dir = join(sandbox, name);
    try { chmodSync(join(dir, 'locked'), 0o700); } catch { /* windows, or already gone */ }
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test('and a fixture whose test FAILS is removed too — the case a trailing rmSync misses', (t) => {
  const sandbox = mkdtempSync(join(tmpdir(), 'fixture-cleanup-fail-'));
  t.after(() => rmSync(sandbox, { recursive: true, force: true }));

  const probe = join(sandbox, 'probe.test.mjs');
  writeFileSync(probe, [
    "import { test } from 'node:test';",
    `import { makeCheckout } from ${JSON.stringify(workspace)};`,
    "test('fails after making a fixture', (t) => {",
    '  makeCheckout({}, t);',
    "  throw new Error('deliberate');",
    '});',
    '',
  ].join('\n'));

  const child = runProbe(probe, sandbox);
  // The child MUST fail — otherwise this is asserting cleanup on a path that was never taken.
  assert.notEqual(child.status, 0, 'the probe was supposed to fail');
  const left = leftBehind(sandbox);
  // HOW the child ended goes in the message: on the cells where this first failed, the answer
  // decided the fix — a runner that ends a failed child with a SIGNAL skips `exit` handlers, and
  // no in-process sweep runs unless the signal itself is handled. The second time it failed the
  // answer was `signal null`, which is what sent the diagnosis to the race above instead.
  assert.deepEqual(left.names, [],
    `a failing test left ${left.names.length} fixture(s) behind (status ${child.status}, `
    + `signal ${child.signal}): ${left.detail}`);
});
