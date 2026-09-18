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
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { remove, tempDir } from './helpers/temp.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const workspace = pathToFileURL(resolve(here, 'helpers/workspace.mjs')).href;
const helper = pathToFileURL(resolve(here, 'helpers/temp.mjs')).href;

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
/** Whatever the exit sweep said, on whichever stream `node --test` put it. */
function sweepOutput(child) {
  return [child.stdout, child.stderr].filter(Boolean).join('\n')
    .split('\n').filter((l) => l.includes('temp.mjs:') || /: E[A-Z]+\b/.test(l)).join('\n');
}

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
/**
 * WHEN was the survivor created, relative to the run that should have removed it?
 *
 * ARC-09-C40 made a leftover arrive with its reason; C39 made a failed removal keep its record. The
 * occurrence after both reported all three of C39's settled facts at once — register silent, owner
 * record gone, nine entries on disk — and those are consistent with two DIFFERENT defects that need
 * different fixes:
 *
 *   (a) the removal genuinely succeeded and something recreated the path afterwards — a producer
 *       that outlived the teardown. Then "no owner record" is exactly right, and the sweep is not
 *       the thing to change.
 *   (b) a removal that returned without throwing while the directory persisted. Then the register
 *       logic is right and the removal CHECK is wrong.
 *
 * The message could not tell them apart, which is this week's shape once more: two causes, one
 * observation. A birth time bounded by the child's own lifetime separates them — created during the
 * run means the original was never removed; created after the child exited means something put it
 * back.
 *
 * `birthtime` is not universally available (ext4 exposes it through statx on modern kernels, some
 * filesystems report 0). When it is missing this says so rather than guessing, because a fabricated
 * timestamp would answer the question wrongly and confidently.
 */
function age(sandbox, name, window) {
  let born;
  try { born = statSync(join(sandbox, name)).birthtimeMs; } catch { return 'age unreadable'; }
  if (!born) return 'birthtime unavailable on this filesystem — cannot say when it was created';
  if (!window) return `born ${new Date(born).toISOString()}`;
  if (born > window.exitedAt) {
    return `born ${born - window.exitedAt} ms AFTER the child exited — something recreated it`;
  }
  if (born >= window.startedAt) {
    return `born during the child's run, ${window.exitedAt - born} ms before it exited `
      + '— the original, never removed';
  }
  return `born BEFORE the child started (${window.startedAt - born} ms) — not this run's fixture`;
}

function leftBehind(sandbox, window = null) {
  let names = [];
  for (let attempt = 0; attempt < 10; attempt += 1) {
    // `.owner` records are excluded from the COUNT — they are the instrument, and a survivor is
    // now meant to keep one — but read below, because the record is the thing that says WHO.
    names = readdirSync(sandbox)
      .filter((name) => name.startsWith('snowarch-') && !name.endsWith('.owner'));
    if (names.length === 0) return { names, detail: '' };
    // 50 ms × 10: long enough for a teardown that is merely slow, short enough that a real leak
    // does not cost the suite half a second per case.
    const until = Date.now() + 50;
    while (Date.now() < until) { /* spin: the check is synchronous by necessity */ }
  }
  const detail = names.map((name) => {
    const contents = readdirSync(join(sandbox, name));
    // NOT "removal never ran": a non-empty directory is also what a removal that RAN AND FAILED
    // leaves behind (EBUSY, ENOTEMPTY, a file held open on another platform), and this function
    // cannot tell the two apart. It says what it observed; the child's stderr, in the assertion
    // message above, is what says which.
    // The owner record is written BESIDE the fixture at creation, so it survives even a process
    // that dies before any cleanup — and it names the test that made this one. When it is missing,
    // say so: an absent record is itself a fact (either the fixture predates the instrument, or
    // something removed the record and left the directory, which is ARC-09-C39's defect).
    let owner = 'no owner record';
    try {
      owner = readFileSync(join(sandbox, `${name}.owner`), 'utf8').split('\n')[0];
    } catch { /* left as "no owner record" */ }
    return `${name} (${contents.length === 0 ? 'EMPTY — removal started, entry lingering'
      : `${contents.length} entries — not removed`}; made by: ${owner}; ${age(sandbox, name, window)})`;
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

  // The window the birth time is judged against. Taken around the spawn rather than inside it: the
  // child's own clock is not this process's, and what matters is whether the survivor appeared
  // while the child could still have been writing.
  const startedAt = Date.now();
  const child = runProbe(probe, sandbox);
  const exitedAt = Date.now();
  assert.equal(child.status, 0, `${child.stdout}${child.stderr}`);

  const left = leftBehind(sandbox, { startedAt, exitedAt });
  // The child's stderr goes in the MESSAGE, because the helper has usually already said why: a
  // failed `rmSync` is reported by the exit sweep as `temp.mjs: N fixture(s) survived on node X`
  // with the errno. Two occurrences (CI ubuntu/node24, and a local run) reported a directory and a
  // file count and nothing else — and in the CI one the child had exited 0, so nothing was killed
  // and the sweep DID run. The diagnosis existed, was captured here in `child.stderr`, and this
  // assertion threw it away. Carrying it across is the whole fix.
  //
  // BOTH streams, and that is not caution: the probe runs under `node --test`, whose runner
  // captures a test file's output into its TAP report, so the sweep's `writeSync(2, …)` arrives on
  // the child's STDOUT. A version of this fix that read only `child.stderr` was written first and
  // would have surfaced nothing at all — the same shape as the bug it repairs.
  assert.deepEqual(left.names, [], `the child left ${left.names.length} fixture(s) behind: ${left.detail}`
    + `\n--- child output ---\n${sweepOutput(child) || '(neither stream mentioned the sweep)'}`);
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

  const survivors = readdirSync(sandbox).filter((n) => n.startsWith('snowarch-'));
  // `.owner` records are INSTRUMENTATION, not fixtures, and a stuck fixture is now meant to keep
  // its own: the sweep deletes an owner record only when the directory it describes has actually
  // gone. Counting them here would fail this test for the instrument working.
  const left = survivors.filter((n) => !n.endsWith('.owner'));
  // At most the stuck one. Before the fix this was two or three, because the loop stopped.
  assert.ok(left.length <= 1,
    `${left.length} fixtures survived — one stuck directory aborted the sweep: ${left.join(', ')}`);
  // Both directions on that exemption: every surviving fixture keeps its record, and no record
  // outlives the fixture it names. An `.owner` with nothing beside it is an orphan, which is the
  // instrument lying in the other direction.
  assert.deepEqual(survivors.filter((n) => n.endsWith('.owner')).sort(),
    left.map((n) => `${n}.owner`).sort(),
    'the owner records do not match the fixtures still on disk');
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

/**
 * ARC-09-C13 — the real suites leave nothing behind either.
 *
 * The cases above prove the MECHANISM on synthetic probes. This one runs a real test file whose
 * fixtures build git repositories, because the mechanism being correct is not the same claim as
 * every caller using it: `tests/release-workflow.test.mjs` created its bare remote as a SIBLING of
 * the fixture's tempDir (`join(dirname(root), …)`), which nothing was ever going to remove, and it
 * left two directories per run until a review noticed the count. A helper cannot clean up after a
 * caller that put the directory somewhere else.
 *
 * One file rather than the whole suite: the point is to have a real caller under the assertion, and
 * running everything here would double the cost of the run this file is part of.
 */
test('a real fixture suite leaves nothing in TMPDIR (ARC-09-C13)', (t) => {
  const sandbox = mkdtempSync(join(tmpdir(), 'fixture-cleanup-real-'));
  t.after(() => rmSync(sandbox, { recursive: true, force: true }));

  const suite = resolve(dirname(fileURLToPath(import.meta.url)), '../../../tests/release-workflow.test.mjs');
  const child = runProbe(suite, sandbox);
  assert.equal(child.status, 0, `the suite itself failed:\n${child.stdout}${child.stderr}`);

  const left = leftBehind(sandbox);
  assert.deepEqual(left.names, [],
    `release-workflow left ${left.names.length} director(ies) in TMPDIR: ${left.detail}`);
});

/**
 * The failure that actually happened in CI, and the reason it told nobody anything.
 *
 * Two leftovers were reported in one day — CI ubuntu/node24 and a local run — each as a directory
 * name and a file count. The CI one had `child.status === 0`: nothing was killed, so the exit sweep
 * DID run. What it hit was an `rmSync` that failed, and the sweep says so, with the errno, on
 * stderr — which the leftover assertion then dropped on the floor.
 *
 * This drives that exact shape: a directory the sweep cannot remove (its parent is read+execute
 * only, so the child entry cannot be unlinked), in a child that exits cleanly. The point is not
 * that the fixture survives — it is that the survivor arrives WITH its errno.
 */
test('a removal that fails is reported with its errno, not just as a leftover', (t) => {
  if (process.platform === 'win32') return;   // the permission shape is POSIX; Windows uses ACLs
  const sandbox = mkdtempSync(join(tmpdir(), 'fixture-errno-'));
  t.after(() => {
    // Restore write on every directory first: this test deliberately makes one unremovable, and a
    // teardown that guesses its path leaves the mess the whole chore is about. (The first version
    // guessed `readdirSync(sandbox)[0]`, which is `probe.mjs` as often as not, and died ENOTEMPTY.)
    const openUp = (dir) => {
      try { chmodSync(dir, 0o700); } catch { /* nothing to open */ }
      let entries = [];
      try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) if (e.isDirectory()) openUp(join(dir, e.name));
    };
    openUp(sandbox);
    rmSync(sandbox, { recursive: true, force: true });
  });

  const probe = join(sandbox, 'probe.mjs');
  writeFileSync(probe, [
    `import { tempDir } from ${JSON.stringify(helper)};`,
    "import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';",
    "import { join } from 'node:path';",
    // No test context: this is the shape of the 118 `makeCheckout()` call sites that have only the
    // exit sweep between them and a permanent pile.
    "const d = tempDir('snowarch-bootstrap-');",
    "mkdirSync(join(d, 'sub'), { recursive: true });",
    "writeFileSync(join(d, 'sub', 'f'), 'x');",
    "chmodSync(join(d, 'sub'), 0o500);",
    '',
  ].join('\n'));

  const child = runProbe(probe, sandbox);

  // The child exits CLEANLY — this is not a kill, which is what made the CI case confusing.
  assert.equal(child.status, 0, `${child.stdout}${child.stderr}`);
  const said = `${child.stdout}\n${child.stderr}`;
  assert.match(said, /fixture\(s\) survived on node /,
    `the sweep said nothing about a fixture it could not remove:\n${said}`);
  assert.match(said, /: (ENOTEMPTY|EACCES|EPERM|EBUSY)\b/,
    `the report carries no errno, which is the one thing that names the cause:\n${said}`);
  // And the helper the assertion above uses must find it on whichever stream it landed on.
  assert.match(sweepOutput(child), /: (ENOTEMPTY|EACCES|EPERM|EBUSY)\b/);
});

/**
 * The case the errno test above could not reach: the fixture has a TEST CONTEXT.
 *
 * WHAT HAPPENED, and it was diagnosed by the instrument rather than guessed at. `test (ubuntu-latest,
 * node 24)` failed with `snowarch-bootstrap-GrwiZp (9 entries — not removed)` and, underneath it,
 * `(neither stream mentioned the sweep)` — the line this file added so a leftover would arrive with
 * its reason. The silence WAS the reason. Three facts settle it between them:
 *
 *   - the child exited 0, so nothing was killed and the exit handler had its turn;
 *   - the sweep printed nothing, so it did not try and fail — it had nothing in `pending` to try;
 *   - the `.owner` record was gone, and `leftBehind` would have listed it (it starts `snowarch-`
 *     too), so something removed it. Only the after-hook and a SUCCESSFUL sweep do that, and a
 *     successful sweep would have taken the directory with it.
 *
 * So the after-hook ran, its `remove(dir)` failed, it deleted the owner record anyway and then
 * `pending.delete(dir)` struck the directory off the register of things still owed. The comment
 * above that line said "the sweep's message is where a survivor gets reported" — and the line
 * itself is what guaranteed the sweep would never see this survivor. The reporting path was cut
 * off from the failure by the code that handled it.
 */
test('a teardown that FAILS to remove keeps the fixture on the register, and the sweep reports it', (t) => {
  if (process.platform === 'win32') return;   // the permission shape is POSIX; Windows uses ACLs
  const sandbox = mkdtempSync(join(tmpdir(), 'fixture-ctx-'));
  t.after(() => {
    const openUp = (dir) => {
      try { chmodSync(dir, 0o700); } catch { /* nothing to open */ }
      let entries = [];
      try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) if (e.isDirectory()) openUp(join(dir, e.name));
    };
    openUp(sandbox);
    rmSync(sandbox, { recursive: true, force: true });
  });

  // WITH a context — that is the whole difference from the test above, and it is the half of
  // `trackTempDir` the suite had never driven to failure.
  const probe = join(sandbox, 'probe.test.mjs');
  writeFileSync(probe, [
    "import { test } from 'node:test';",
    `import { tempDir } from ${JSON.stringify(helper)};`,
    "import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';",
    "import { join } from 'node:path';",
    "test('holds a fixture that cannot be removed', (t) => {",
    "  const d = tempDir('snowarch-bootstrap-', t);",
    "  mkdirSync(join(d, 'sub'), { recursive: true });",
    "  writeFileSync(join(d, 'sub', 'f'), 'x');",
    "  chmodSync(join(d, 'sub'), 0o500);",
    '});',
    '',
  ].join('\n'));

  const child = runProbe(probe, sandbox);
  assert.equal(child.status, 0, `${child.stdout}${child.stderr}`);

  // The report is the assertion. A teardown that swallowed the failure would leave this silent —
  // which is precisely how the CI occurrence looked, and why it took three sightings to explain.
  assert.match(sweepOutput(child), /fixture\(s\) survived on node /,
    'the after-hook failed to remove it and the sweep said nothing — the survivor was struck off '
    + `the register by the code that failed to remove it:\n${child.stdout}\n${child.stderr}`);
  assert.match(sweepOutput(child), /: (ENOTEMPTY|EACCES|EPERM|EBUSY)\b/,
    'the report carries no errno');

  // BOTH DIRECTIONS on the instrument: the owner record must SURVIVE a failed removal, because a
  // survivor whose creator is unknown is the state this whole chore exists to leave behind.
  const owners = readdirSync(sandbox).filter((n) => n.endsWith('.owner'));
  assert.equal(owners.length, 1, `the owner record was deleted for a fixture that is still there: ${owners}`);
  const owner = readFileSync(join(sandbox, owners[0]), 'utf8');
  assert.match(owner, /holds a fixture that cannot be removed/,
    `the owner record does not name the test that made it:\n${owner}`);
});

/**
 * The recurrence of 2026-09-18: the survivor that no instrument mentioned.
 *
 * `d5b3f0e` reported a populated `snowarch-bootstrap-*` with NO owner record, a clean exit, and
 * `(neither stream mentioned the sweep)` — on a tree that already carried the 2026-09-17 fix for
 * exactly that signature. So the explanation written into `temp.mjs` at the time was not the whole
 * one, and the four facts had to be taken back to the code.
 *
 * Two candidates were on the table: something recreated the directory after the teardown, or a
 * removal returned without removing. The first is dead on the evidence rather than on taste —
 * `recordOwner` writes the `.owner` file at CREATION, so anything that recreated a fixture would
 * have left a record beside it, and the survivor had none. The second is the only route left:
 * both places that delete an owner record, and both that would have reported the survivor, are
 * downstream of `remove` reporting success, so a single unverified `return null` disarms all four
 * instruments at once and produces precisely the state observed.
 *
 * NOT REPRODUCED ON DEMAND — 48 concurrent probes on macOS/node 24 (APFS), 192 on Ubuntu 22.04/
 * node 22 (ext4). These tests therefore drive the closed path directly through the injected `rm`
 * instead of waiting for a filesystem to do it, which is the only way a defect that appears three
 * times in a fortnight of CI gets a test at all.
 */
test('a removal that reports success without removing is a failure, not a success', (t) => {
  const dir = tempDir('snowarch-survivor-', t);
  writeFileSync(join(dir, 'f'), 'x');

  // The closed path, exactly: a removal that returns cleanly and does nothing.
  const error = remove(dir, () => {});
  assert.ok(error, 'a removal that left the tree on disk reported success');
  assert.equal(error.code, 'ESURVIVED');
  assert.match(error.message, /still exists after a removal that reported success/);

  // Shaped like the errno errors the callers print, or the survivor reaches no message.
  assert.match(`${dir}: ${error.code ?? error.message}`, /: E[A-Z]+$/);
});

test('control — the check is aimed at the closed path, and does not fire on a real removal', (t) => {
  // NON-VACUITY, both halves. A verification that answered "survived" for everything would pass the
  // test above while making every successful teardown report a failure, and a run in which nothing
  // is ever removed looks identical from the outside to one in which nothing ever fails.
  const real = tempDir('snowarch-survivor-', t);
  writeFileSync(join(real, 'f'), 'x');
  assert.equal(remove(real), null, 'a removal that actually removed the tree was reported as failed');
  assert.equal(existsSync(real), false);

  // And the OLD shape is provably blind to it, or this control proves nothing about what changed.
  // This is what `remove` did before: call, catch, return null — with no check that it worked.
  const old = (d, rm) => { try { rm(d, {}); return null; } catch (e) { return e; } };
  const survivor = tempDir('snowarch-survivor-', t);
  writeFileSync(join(survivor, 'f'), 'x');
  assert.equal(old(survivor, () => {}), null,
    'the premise of this control moved: the old shape no longer passes a survivor as removed');
  assert.equal(existsSync(survivor), true, 'the survivor is still on disk, and the old shape said null');
});
