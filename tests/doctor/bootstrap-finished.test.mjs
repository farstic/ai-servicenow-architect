/**
 * ARC-08-C30 — E-29: did the install finish?
 *
 * The owner Ctrl+C'd an upgrade at B06's `Label for this instance [pdi]` prompt (sitting,
 * 2026-09-23). The runner recorded it — `status: 'failed', reason: 'interrupted'` — and printed
 * `interrupted during B06 — re-run ./bootstrap.sh to resume at B06`. Then `./snowarch doctor`
 * reported `37 ok, 1 warn, 0 fail`, and E-11 said `.local/ state: mode live`.
 *
 * B07, B08 and B09 never ran. U7 never ran. **No surface said so**, because no check read
 * `state.steps` at all: `git grep 'state.steps' tools/snowarch/lib/doctor/` returned nothing.
 *
 * E-11 asks whether the state file is WELL-FORMED. This asks whether the install it describes
 * FINISHED. The same distinction this arc keeps finding, one file over — and the information was
 * already on disk, which is what makes it worth a check rather than a feature.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { engineRepoChecks } from '../../tools/snowarch/lib/doctor/checks/engine-repo.mjs';
import { version as engineVersionOf } from '../../tools/snowarch/lib/config.mjs';
import { greenTree, readJson, writeJson } from './helpers/tree.mjs';

const E29 = engineRepoChecks().find((c) => c.id === 'E-29');

const ctxFor = (root) => ({ root, platform: 'darwin', env: {},
  config: readJson(root, 'engine.config.json') });

/** A state whose steps are all ok under the current version — a finished live install. */
function finished(root, over = {}) {
  const current = engineVersionOf(root);
  const state = readJson(root, '.local/bootstrap-state.json');
  const steps = {};
  for (const id of ['B01', 'B02', 'B04', 'B05', 'B06', 'B07', 'B08', 'B09']) {
    steps[id] = { status: 'ok', inputsHash: 'x', finishedAt: '2026-09-20T09:00:00.000Z',
      durationMs: 0, engineVersion: current };
  }
  writeJson(root, '.local/bootstrap-state.json',
    { ...state, mode: 'live', steps, ...over });
  return root;
}

test('a finished install is ok, and says how many steps it checked', (t) => {
  const root = finished(greenTree(t, { mode: 'live' }));
  return E29.run(ctxFor(root)).then((r) => {
    assert.equal(r.status, 'ok');
    assert.match(r.detail, /steps recorded, all current/);
  });
});

test('an interrupted B06 is named, with everything after it', async (t) => {
  // THE OWNER'S STATE, reconstructed: B06 interrupted at the prompt, B07–B09 never reached.
  const root = greenTree(t, { mode: 'live' });
  finished(root);
  const state = readJson(root, '.local/bootstrap-state.json');
  state.steps.B06 = { ...state.steps.B06, status: 'failed', reason: 'interrupted' };
  delete state.steps.B07;
  delete state.steps.B08;
  delete state.steps.B09;
  writeJson(root, '.local/bootstrap-state.json', state);

  const r = await E29.run(ctxFor(root));
  assert.equal(r.status, 'fail', 'an interrupted install reported as ok');
  assert.match(r.detail, /^bootstrap incomplete since /);
  assert.match(r.detail, /B06 interrupted/);
  // The range, because three consecutive ids spelled out is a list a reader has to reassemble.
  assert.match(r.detail, /B07–B09 never ran/);
  assert.match(r.remedy, /bootstrap/);
  assert.deepEqual(r.data.problems.map((p) => p.id), ['B06', 'B07', 'B08', 'B09']);
});

test('a step recorded under the previous version is named', async (t) => {
  const root = finished(greenTree(t, { mode: 'live' }));
  const state = readJson(root, '.local/bootstrap-state.json');
  state.steps.B04 = { ...state.steps.B04, engineVersion: '2.0.0-rc.6' };
  writeJson(root, '.local/bootstrap-state.json', state);

  const r = await E29.run(ctxFor(root));
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /B04 recorded under 2\.0\.0-rc\.6/);
  assert.deepEqual(r.data.stale, [{ id: 'B04', was: '2.0.0-rc.6' }]);
});

test('a step with NO recorded version is not a mismatch', async (t) => {
  // States written before this row carry no per-step version. Reporting that as "recorded under
  // another version" would turn every older install into a finding — the defect this check exists
  // to catch, facing the other way. Absence is not a mismatch.
  const root = finished(greenTree(t, { mode: 'live' }));
  const state = readJson(root, '.local/bootstrap-state.json');
  for (const id of Object.keys(state.steps)) delete state.steps[id].engineVersion;
  writeJson(root, '.local/bootstrap-state.json', state);

  const r = await E29.run(ctxFor(root));
  assert.equal(r.status, 'ok', r.detail);
});

test('a recorded mode with no steps yet is nothing started, not something unfinished', async (t) => {
  // FOUND BY THE rc.10 TAG MEASUREMENT, and the gap was the control's, not the code's. Removing
  // this clause from `engine-repo.mjs` left THIS FILE — the one named for E-29 — passing 6 of 6.
  // `npm test` did go red, but in `status-fixture-capture.test.mjs`: a byte comparison against a
  // committed doctor report, which mentions E-29 nowhere and which a future author would make green
  // again by regenerating the fixture. A rule held only by a snapshot is a rule with no name.
  //
  // The state is real rather than contrived: the mode is written before any step runs, so a run
  // interrupted between those two points leaves exactly this on disk. E-29's first version reported
  // it as `B01–B09 never ran` and failed every fixture tree.
  const root = greenTree(t, { mode: 'live' });
  writeJson(root, '.local/bootstrap-state.json',
    { version: 1, product: 'snowarch', mode: 'live', steps: {} });

  const r = await E29.run(ctxFor(root));
  assert.equal(r.status, 'ok', `a tree that started nothing was reported ${r.status}: ${r.detail}`);
  assert.match(r.detail, /no steps recorded yet/);
});

test('no recorded install at all is E-11\'s finding, not this one', async (t) => {
  // Two failures on one cause would send a reader to two remedies. `.local/` absent is the
  // install that never ran, and E-11 already says so with the command that fixes it.
  const root = greenTree(t, { mode: 'design' });
  writeJson(root, '.local/bootstrap-state.json', { version: 1, product: 'snowarch', steps: {} });

  const r = await E29.run(ctxFor(root));
  assert.equal(r.status, 'ok');
  assert.match(r.detail, /no recorded install/);
});

test('a step the recorded mode never plans is not reported missing', async (t) => {
  // `plannedSteps` is the runner's own list. A design-only state has no B08 — asking for it would
  // report a step that was never going to run as one that failed to.
  const root = greenTree(t, { mode: 'design' });
  const current = engineVersionOf(root);
  const state = readJson(root, '.local/bootstrap-state.json');
  const steps = {};
  for (const id of ['B01', 'B02', 'B05', 'B07', 'B09']) {
    steps[id] = { status: 'ok', inputsHash: 'x', finishedAt: '2026-09-20T09:00:00.000Z',
      durationMs: 0, engineVersion: current };
  }
  writeJson(root, '.local/bootstrap-state.json', { ...state, mode: 'design', steps });

  const r = await E29.run(ctxFor(root));
  assert.equal(r.status, 'ok', r.detail);
  // `ok()` carries an empty `data`, so the assertion is on the CONTENT rather than its absence:
  // what must not be there is a problem or a stale entry, not the key.
  assert.equal(r.data?.problems ?? undefined, undefined, 'a clean result carried a problem list');
  assert.equal(r.data?.stale ?? undefined, undefined, 'a clean result carried a stale list');
});

// ─── The step running the check is not a step that never ran ───────────────────────────────────
//
// E-29's own false FAIL, and it was the FIRST failure a new user ever saw. B09's job includes
// spawning `doctor --quick --json` for the summary it prints, and the runner records a step only
// AFTER its `run()` returns — so E-29 ran from inside B09, found B09 absent from the state, and
// printed under the very step that was running it:
//
//     E-29 FAIL the bootstrap finished: bootstrap incomplete since 2.0.0: B09 never ran
//                                                                        remedy: ./bootstrap.sh
//
// The install was fine — `./snowarch doctor` a second later said `29 ok, 1 warn, 0 fail`. The
// sentence was false, and its remedy would have re-run an install that had just finished.
//
// NOT "a fresh clone". Observed on 2026-09-19 at `2.0.0-dev` on a lived-in checkout with a populated
// `.local/`, and again by the owner on v2.0.0 from a `--depth 1` clone. The state that produces it is
// ANY first design-only bootstrap, because it is about the ordering of one step against one check.

import { RUNNING_STEP_ENV } from '../../tools/snowarch/lib/spawn-env.mjs';

/** A design-only install whose steps are all recorded EXCEPT the one still running. */
function midStep(root, runningId) {
  const current = engineVersionOf(root);
  const state = readJson(root, '.local/bootstrap-state.json');
  const steps = {};
  for (const id of ['B01', 'B02', 'B03', 'B05', 'B07']) {
    steps[id] = { status: 'ok', inputsHash: 'x', finishedAt: '2026-09-24T09:00:00.000Z',
      durationMs: 0, engineVersion: current };
  }
  writeJson(root, '.local/bootstrap-state.json', { ...state, mode: 'design', steps });
  return { root, platform: 'darwin', env: { [RUNNING_STEP_ENV]: runningId },
    config: readJson(root, 'engine.config.json') };
}

test('C32: the step that spawned this check is not reported as never having run', async (t) => {
  const root = greenTree(t, { mode: 'design' });
  const r = await E29.run(midStep(root, 'B09'));
  assert.equal(r.status, 'ok', `the false FAIL is back: ${r.detail}`);
  assert.doesNotMatch(r.detail, /never ran/, 'the sentence still says a running step never ran');
  assert.doesNotMatch(r.detail, /incomplete/, 'a finished install is still called incomplete');
  // ...and it SAYS why the count is one short of the plan, rather than leaving a reader to wonder.
  assert.match(r.detail, /B09 is running this check/);
  assert.equal(r.command ?? null, null, 'a run in progress was handed ./bootstrap.sh as a remedy');
});

test('C32: it excludes the step that is running, not B09 by name', async (t) => {
  // The generalisation is the point: a future step that asks the doctor for a summary must not need
  // this check to learn its id. B07 is used here precisely because nothing spawns the doctor from
  // B07 today — the mechanism is "the step running me", not a list.
  const root = greenTree(t, { mode: 'design' });
  const state = readJson(root, '.local/bootstrap-state.json');
  const current = engineVersionOf(root);
  const steps = {};
  for (const id of ['B01', 'B02', 'B03', 'B05', 'B09']) {
    steps[id] = { status: 'ok', inputsHash: 'x', finishedAt: '2026-09-24T09:00:00.000Z',
      durationMs: 0, engineVersion: current };
  }
  writeJson(root, '.local/bootstrap-state.json', { ...state, mode: 'design', steps });
  const r = await E29.run({ root, platform: 'darwin', env: { [RUNNING_STEP_ENV]: 'B07' },
    config: readJson(root, 'engine.config.json') });
  assert.equal(r.status, 'ok', r.detail);
  assert.match(r.detail, /B07 is running this check/);
});

test('C32: with no running step named, an absent step is still a FAIL', async (t) => {
  // THE NEGATIVE, and it is the one that matters: the fix must not blind the check. A doctor run by
  // a person — no `RUNNING_STEP_ENV` in the environment — still reports the step that never ran.
  const root = greenTree(t, { mode: 'design' });
  const r = await E29.run(midStep(root, ''));
  assert.equal(r.status, 'fail', 'an unfinished install passed with nothing running');
  assert.match(r.detail, /B09 never ran/);
  assert.equal(r.command, './bootstrap.sh');
});

test('C32: a step recorded as interrupted is a FAIL even while another step is running', async (t) => {
  // The interrupted case is E-29's whole reason to exist, and the exclusion must not reach it: only
  // an ABSENT record is forgiven for the running step, never a recorded failure.
  const root = greenTree(t, { mode: 'design' });
  const current = engineVersionOf(root);
  const state = readJson(root, '.local/bootstrap-state.json');
  // Every planned design-only step recorded, so nothing is ABSENT and the only finding available is
  // the interrupted one — otherwise the case would pass on a "never ran" and prove nothing.
  const steps = {};
  for (const id of ['B01', 'B03', 'B05', 'B07', 'B09']) {
    steps[id] = { status: 'ok', inputsHash: 'x', finishedAt: '2026-09-24T09:00:00.000Z',
      durationMs: 0, engineVersion: current };
  }
  steps.B02 = { status: 'failed', reason: 'interrupted', inputsHash: null,
    finishedAt: '2026-09-24T09:01:00.000Z', durationMs: 0, engineVersion: current };
  writeJson(root, '.local/bootstrap-state.json', { ...state, mode: 'design', steps });
  const r = await E29.run({ root, platform: 'darwin', env: { [RUNNING_STEP_ENV]: 'B09' },
    config: readJson(root, 'engine.config.json') });
  assert.equal(r.status, 'fail', `an interrupted step was forgiven: ${r.detail}`);
  assert.match(r.detail, /B02 interrupted/);
});
