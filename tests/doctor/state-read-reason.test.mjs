/**
 * ARC-07-C37 — a state file the doctor cannot read is SAID, in every section that reads it.
 *
 * The row's finding, in one sentence: seven doctor sites wrote `try { loadState(…) } catch { null }`,
 * so an unreadable `.local/bootstrap-state.json` produced a report describing a checkout as healthier
 * than it is, with no line saying why the mode looked wrong.
 *
 * THE ROW NAMES `doctor --section engine-repo` AS THE CONTROL, AND THERE IS NO SUCH SECTION. Measured
 * on this head: the sections are `prereqs, repo, docs, roster, contract, host, legacy, server`
 * (`SECTIONS` in `doctor/registry.mjs`), `engine-repo` is the FILE that holds E-05…E-11 and E-29, and
 * E-11 — which owns the unreadable-file sentence — is in `repo` with E-10 and E-29. So the premise
 * "a section that does not include E-11" needed measuring rather than repeating, and what the
 * measurement found is worse than the row supposed:
 *
 *   - `--section repo` DID say something (E-11 failed correctly) while E-10, in the same section,
 *     reported `ok — design · disabled` on a mode nobody could read, and E-29 THREW, which the runner
 *     turns into `check crashed: …` — our code blamed for a legitimate checkout condition.
 *   - `--section host` said NOTHING: E-27 reported `ok — project entry present, disabled in design
 *     mode (expected)`, a sentence that compares the registration to a recorded mode it never read.
 *   - `--section prereqs` said NOTHING either: E-03 turns a missing npm into a `warn` in design-only
 *     and a `fail` in live, and a mode it could not read defaulted to the lenient side silently.
 *
 * So the silence was never about which section ran — it was the `catch` in each check. These cases
 * drive all three sections, and the LAST case is the one that makes the family hold: the rule now
 * lives in `loadStateOrReason`, and a programming error must still be loud at every site that calls
 * it, not only at the one ARC-07-C31 repaired by hand.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { engineChecks } from '../../tools/snowarch/lib/doctor/checks/index.mjs';
import { loadStateOrReason, StateError } from '../../tools/snowarch/lib/state.mjs';
import { spellings } from '../../tools/snowarch/lib/text.mjs';
import { contextFor, greenTree, runById } from './helpers/tree.mjs';

const SPELL = spellings({ platform: 'linux', env: {} });
// `fileURLToPath`, never `new URL(...).pathname` — the engine's own guard refused my first version,
// and it is right: on Windows `.pathname` yields `/C:/…`, a path nothing can open.
const LIB = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'tools', 'snowarch', 'lib');
const checks = engineChecks();

/** A green tree whose recorded state cannot be parsed. The tree is otherwise healthy on purpose. */
const treeWithUnreadableState = (t) => {
  const root = greenTree(t);
  writeFileSync(join(root, '.local', 'bootstrap-state.json'), '{ this is not json');
  return root;
};

/**
 * E-27 runs `claude`, so its registration answer is INJECTED rather than spawned — the machine running
 * the tests is not the machine being diagnosed. `exec` is E-27's seam; `claudePath` keeps it from
 * looking for a binary.
 */
const hostCtx = (root) => contextFor(root, {
  claudePath: '/nonexistent/claude',
  exec: () => ({ found: true, ok: true, stdout: 'servicenow: node … - ✘ Rejected', stderr: '' }),
});

test('ARC-07-C37 — E-10 stops certifying toggles against a mode it could not read', async (t) => {
  const root = treeWithUnreadableState(t);
  const r = await runById(checks, 'E-10', contextFor(root));
  // MEASURED BEFORE THE FIX: `ok · design · disabled`. A checkout certified healthy on a file the
  // doctor could not read, in the same section as the check that fails on that exact file.
  assert.notEqual(r.status, 'ok',
    `E-10 reported ${r.status} on an unreadable state file: ${r.detail}`);
  assert.equal(r.status, 'skip', r.detail);
  assert.match(r.detail, /recorded mode could not be read/);
  assert.match(r.detail, /E-11/, 'the reader is not pointed at the check that owns the file');
  assert.equal(r.data.stateUnreadable.includes('bootstrap-state.json'), true);
});

test('ARC-07-C37 — E-29 reports an unreadable state instead of crashing', async (t) => {
  const root = treeWithUnreadableState(t);
  // MEASURED BEFORE THE FIX: this read had no `catch` at all, so the StateError reached the runner and
  // became `check crashed: …` — a message that tells the operator the fault is in our code.
  const r = await runById(checks, 'E-29', contextFor(root));
  assert.equal(r.status, 'skip', r.detail);
  assert.doesNotMatch(r.detail, /check crashed/);
  assert.match(r.detail, /recorded state could not be read/);
});

test('ARC-07-C37 — E-11 still owns the sentence, and it is the only failure', async (t) => {
  const root = treeWithUnreadableState(t);
  const r = await runById(checks, 'E-11', contextFor(root));
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /bootstrap-state\.json is not valid JSON/);
  assert.match(r.remedy, /bootstrap --reset/);
  // The point of the skips above: one cause, one failure, one remedy. If E-10 and E-29 had failed too,
  // an operator would read three lines and be offered the same fix twice.
  for (const id of ['E-10', 'E-29']) {
    const other = await runById(checks, id, contextFor(root));
    assert.notEqual(other.status, 'fail', `${id} repeated E-11's failure: ${other.detail}`);
    assert.equal(other.remedy ?? null, null, `${id} offered a second remedy for one cause`);
  }
});

test('ARC-07-C37 — --section host says so, where nothing did before', async (t) => {
  const root = treeWithUnreadableState(t);
  const r = await runById(checks, 'E-27', hostCtx(root));
  // MEASURED BEFORE THE FIX: `ok — project entry present, disabled in design mode (expected)`. Every
  // sentence E-27 can print compares the registration to the recorded mode, so a mode it never read
  // makes all of them guesses — and `host` is a section E-11 is not in, so nothing else would say it.
  assert.equal(r.status, 'warn', r.detail);
  assert.match(r.detail, /recorded mode could not be read/);
  assert.doesNotMatch(r.detail, /\(expected\)/,
    'the check still claimed the registration was expected for a mode it could not read');
  assert.equal(r.data.stateUnreadable.includes('bootstrap-state.json'), true,
    '--json lost the reason, so a script reading the report cannot see it either');
});

test('ARC-07-C37 — --section prereqs says so when the mode decides the severity', async (t) => {
  const root = treeWithUnreadableState(t);
  // npm ABSENT is the branch where the mode matters: `warn` in design-only, `fail` in live. With the
  // state unreadable the old code took the lenient branch silently, which is the row's original
  // symptom — E-03 reporting `warn` where the recorded mode said `fail`.
  const absent = () => ({ found: false, ok: false, stdout: '', stderr: '' });
  const r = await runById(checks, 'E-03', contextFor(root, { exec: absent }));
  assert.equal(r.status, 'warn', r.detail);
  assert.match(r.detail, /recorded mode could not be read/);
  assert.match(r.detail, /may be a failure rather than a warning/);
  assert.equal(r.data.stateUnreadable.includes('bootstrap-state.json'), true);

  // ...and the other direction, so the sentence cannot be printed unconditionally: a READABLE state
  // in design-only keeps the old wording exactly, with nothing about an unreadable file.
  const healthy = greenTree(t);
  const ok = await runById(checks, 'E-03', contextFor(healthy, { exec: absent }));
  assert.equal(ok.status, 'warn');
  assert.match(ok.detail, /needed only for live mode/);
  assert.doesNotMatch(ok.detail, /could not be read/);
});

test('ARC-07-C37 — an unreadable file gets its own sentence, not "not valid JSON"', async (t) => {
  // FOUND BY THE OLD C37 CASE'S FIXTURE BEING UNFAITHFUL. It planted a bare `Error('EACCES: …')`,
  // which `loadState` never throws — every file-level failure went through one `try` that also wrapped
  // `JSON.parse`, so a valid file the process could not read was reported as corrupt, with
  // `bootstrap --reset` as the remedy. Reset rewrites a corrupt file; it does nothing about a
  // permission. Driven here through the real `loadState`, on a real chmod.
  const root = greenTree(t);
  const state = join(root, '.local', 'bootstrap-state.json');
  writeFileSync(state, JSON.stringify({ version: 1, mode: 'live', steps: {} }));
  chmodSync(state, 0o000);
  // NO `t.after` chmod here: `greenTree` registers the tree's removal first, node runs after-hooks in
  // registration order, and a chmod on a deleted path is ENOENT — measured. The mode is restored inline
  // below, and `rmSync` can unlink a 0000 file anyway (the directory's permissions are what matter).

  const { state: read, reason } = loadStateOrReason(root, SPELL);
  assert.equal(read, null);
  assert.match(reason, /could not be read \(EACCES/,
    'an unreadable file is still described as invalid JSON');
  assert.doesNotMatch(reason, /not valid JSON/);
  assert.match(reason, /permissions/, 'the sentence does not say what to look at');
  assert.doesNotMatch(reason, /bootstrap --reset/,
    'a reset was offered for a permission it cannot fix');

  // ...and a genuinely corrupt file keeps the sentence it had, so this is a split and not a rename.
  // The chmod comes FIRST: writing to a 000 file is itself EACCES, which cost a red run here.
  chmodSync(state, 0o600);
  writeFileSync(state, '{ not json');
  const corrupt = loadStateOrReason(root, SPELL);
  assert.match(corrupt.reason, /is not valid JSON/);
  assert.match(corrupt.reason, /bootstrap --reset/);
});

test('ARC-07-C37 — the rethrow holds at EVERY site, not just the one C31 repaired', () => {
  // THE ROW'S SECOND CONTROL. A `TypeError` is a finding about this code; a `StateError` is a finding
  // about the checkout. Six sites tolerated both, and C31 fixed one of them by hand — which is a habit,
  // not a rule. The rule is `loadStateOrReason`: everything that is not a `StateError` propagates, so
  // the assertion is made once against the function every site now calls.
  const programmingError = () => { throw new TypeError('loadState needs a spellings object'); };
  assert.throws(() => loadStateOrReason('/nonexistent', SPELL, { load: programmingError }),
    { name: 'TypeError' }, 'a TypeError was swallowed into a reason — the defect gets a hiding place');

  // Not only a TypeError: any error the product did not raise deliberately. A `catch` that tolerates
  // everything is what turned a bug into a report about someone's checkout.
  assert.throws(() => loadStateOrReason('/nonexistent', SPELL,
    { load: () => { throw new RangeError('something else entirely'); } }), { name: 'RangeError' });

  // ...and the tolerated one is tolerated, with its message kept rather than discarded.
  const r = loadStateOrReason('/nonexistent', SPELL,
    { load: () => { throw new StateError('.local/bootstrap-state.json could not be read (EACCES)'); } });
  assert.deepEqual(r, { state: null, reason: '.local/bootstrap-state.json could not be read (EACCES)' });

  // AND EVERY SITE GOES THROUGH IT — asserted on the source, because a case cannot drive a `catch`
  // that is no longer there. The assertion is that no doctor module CALLS `loadState` any more: each
  // one calls `loadStateOrReason`, which is where the decision lives.
  //
  // MY FIRST VERSION OF THIS ASSERTION WAS A BAD INSTRUMENT, and it failed immediately, which is the
  // only reason I did not keep it: it matched `catch { return null }` ANYWHERE in the file, so
  // `doctor/index.mjs` failed on a `realpathSync` fallback that has nothing to do with state. A check
  // that fires on unrelated code would have been reverted by the next person to touch these files,
  // and rightly. `loadState(` is the precise thing: a call, not a pattern that resembles one.
  const sites = ['doctor/index.mjs', 'doctor/fix.mjs', 'doctor/checks/host.mjs',
    'doctor/checks/engine-repo.mjs'];
  for (const rel of sites) {
    const text = readFileSync(join(LIB, rel), 'utf8');
    assert.doesNotMatch(text, /loadState\(/,
      `${rel} calls loadState directly — ARC-07-C37 routes every doctor state read through `
      + 'loadStateOrReason, so the tolerated failure is decided in one place');
    assert.match(text, /loadStateOrReason\(/, `${rel} reads no state at all any more — if that is `
      + 'deliberate, drop it from this list rather than leaving a name here that proves nothing');
  }

  // `engine-prereqs.mjs` is the exception and stays one: `loadState` is its INJECTED DEFAULT
  // (`{ load = loadState }`), which is what lets a case plant a failure. What matters is that it does
  // not wrap the call in a `catch` of its own — it calls `loadStateOrReason` with that `load`.
  const prereqs = readFileSync(join(LIB, 'doctor/checks/engine-prereqs.mjs'), 'utf8');
  assert.match(prereqs, /\{ load = loadState \}/);
  assert.match(prereqs, /loadStateOrReason\(root, spell, \{ load \}\)/);
  // COMMENTS BLANKED FIRST, and this one caught itself: the assertion below matched the word `catch`
  // inside the comment that EXPLAINS the removed catch, so the instrument failed on its own
  // documentation. The same species as the over-broad regex above, found the same way — by running it.
  const codeOf = (text) => text
    .replace(/\/\*[\s\S]*?\*\//g, (block) => '\n'.repeat((block.match(/\n/g) ?? []).length))
    .split('\n').map((line) => line.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n');
  assert.doesNotMatch(codeOf(prereqs), /catch/,
    'engine-prereqs has a catch again — the rule it used to carry by hand now lives in state.mjs');
});
