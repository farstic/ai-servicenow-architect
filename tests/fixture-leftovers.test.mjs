/**
 * ARC-09-C80 — `tests/doctor/win32-remedies.test.mjs` cleans up the directories it makes.
 *
 * THE DEFECT, MEASURED. A full `npm test` left four `w17-win32-*` directories in TMPDIR, one per
 * case that called `bareRoot()`: it made its root with a bare `mkdtempSync` and nothing removed
 * the result — no `rmSync`, no `t.after`, not the tracked `tempDir()` the other doctor fixtures use.
 *
 * This runs the file that leaked as a child whose TMPDIR is a private, empty directory, and lists
 * `w17-win32-*` before and after. It fails on the behaviour, whatever the fix looks like.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WIN32_FILE = join(root, 'tests/doctor/win32-remedies.test.mjs');

// ---------------------------------------------------------------------------------------------
// 1. THE FILE THAT LEAKED, RUN AND COUNTED
// ---------------------------------------------------------------------------------------------

/**
 * Run one test file as a child whose temp location is `sandbox`.
 *
 * TMPDIR, TMP and TEMP together: `os.tmpdir()` reads the first on POSIX and the other two on
 * Windows, and setting one alone would silently measure the real temp directory. `NODE_TEST_CONTEXT`
 * is deleted so the child decides its own exit code instead of reporting up to this runner (the
 * reason `tools/snowarch/tests/fixture-cleanup.test.mjs` gives at length). The reporter is named
 * because the default differs between Node lines and the assertions below read the TAP summary.
 *
 * The bound is the SPAWN's, not a comparison against a number (CONTRIBUTING, C24): `timeout` plus
 * `killSignal`, and the caller asserts the child was not killed.
 */
function runTestFile(file, sandbox) {
  const env = { ...process.env, TMPDIR: sandbox, TMP: sandbox, TEMP: sandbox };
  delete env.NODE_TEST_CONTEXT;
  return spawnSync(process.execPath, ['--test', '--test-reporter=tap', file],
    { encoding: 'utf8', env, timeout: 120_000, killSignal: 'SIGKILL' });
}

/** What is in `dir` whose name starts with `prefix` — the directories AND their `.owner` records. */
function listing(dir, prefix) {
  return readdirSync(dir).filter((name) => name.startsWith(prefix)).sort();
}

/**
 * The same listing, once the child has had a chance to finish leaving.
 *
 * `spawnSync` returns when the process is gone, but a recursive removal on a loaded Windows runner
 * can still be settling its directory entry (fixture-cleanup.test.mjs measured this on two cells).
 * The wait is on a CONDITION with a bound, never an assertion about time: it returns as soon as the
 * listing is empty, and a directory still there after the last look is a failure.
 */
function settledListing(dir, prefix) {
  let names = listing(dir, prefix);
  for (let look = 0; look < 10 && names.length > 0; look += 1) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    names = listing(dir, prefix);
  }
  return names;
}

test('ARC-09-C80 — win32-remedies.test.mjs leaves no w17-win32-* directory in TMPDIR', (t) => {
  const sandbox = tempDir('c80-sandbox-', t);

  const before = listing(sandbox, 'w17-win32-');
  assert.deepEqual(before, [], 'the sandbox is private and must start empty, or before/after compares '
    + 'two lists this case does not control');

  const child = runTestFile(WIN32_FILE, sandbox);
  assert.equal(child.signal, null, `the child was killed (${child.signal}) — the run did not finish`);
  assert.equal(child.status, 0, `the file itself failed:\n${child.stdout}${child.stderr}`);

  // THE FLOOR. Zero leftovers is also what a run that created nothing leaves, and absence read as
  // correctness is the defect this programme keeps finding. The four cases that call `bareRoot()`
  // are the ones that made the directories, so each must be named in the child's own report.
  for (const family of ['engine-repo', 'engine-docs', 'server', 'engine-contract']) {
    assert.ok(child.stdout.includes(`${family}'s remedies read the Windows spelling`),
      `the child never ran the ${family} case, so an empty listing proves nothing:\n${child.stdout}`);
  }
  assert.match(child.stdout, /^# fail 0$/m, 'the child reported failures');

  const after = settledListing(sandbox, 'w17-win32-');
  assert.deepEqual(after, before,
    `${after.length} w17-win32-* entr(ies) left in TMPDIR after the file ran: ${after.join(', ')}`);
});

test('control — the listing sees a directory a test file leaves behind', (t) => {
  // A probe that does what `bareRoot()` used to do. If this reads zero, the case above could not
  // have told a leak from a clean run and its pass would be worth nothing.
  const sandbox = tempDir('c80-control-sandbox-', t);
  const probeDir = tempDir('c80-control-probe-', t);
  const probe = join(probeDir, 'leaks.test.mjs');
  writeFileSync(probe, [
    "import test from 'node:test';",
    "import { mkdtempSync } from 'node:fs';",
    "import { tmpdir } from 'node:os';",
    "import { join } from 'node:path';",
    "test('leaks', () => { mkdtempSync(join(tmpdir(), 'w17-win32-')); });",
    '',
  ].join('\n'));

  const child = runTestFile(probe, sandbox);
  assert.equal(child.status, 0, `the probe itself failed:\n${child.stdout}${child.stderr}`);
  assert.equal(settledListing(sandbox, 'w17-win32-').length, 1,
    'a probe that leaks one directory must be listed as one');
});
