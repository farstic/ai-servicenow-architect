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
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

  const left = readdirSync(sandbox).filter((name) => name.startsWith('snowarch-'));
  assert.deepEqual(left, [], `the child left ${left.length} fixture(s) behind: ${left.join(', ')}`);
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
  const left = readdirSync(sandbox).filter((name) => name.startsWith('snowarch-'));
  // HOW the child ended goes in the message: on the cells where this first failed, the answer
  // decided the fix — a runner that ends a failed child with a SIGNAL skips `exit` handlers, and
  // no in-process sweep runs unless the signal itself is handled.
  assert.deepEqual(left, [],
    `a failing test left ${left.length} fixture(s) behind (status ${child.status}, signal ${child.signal})`);
});
