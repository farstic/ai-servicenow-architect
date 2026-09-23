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
