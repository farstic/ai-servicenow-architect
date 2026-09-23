/**
 * ARC-08-C29 — the list the user approves is the list that runs.
 *
 * Owner's sitting, 2026-09-23, rc.6 → rc.9 on a live checkout. U4 printed:
 *
 *   steps that will re-run: B04 runtime dependencies; B05 the contract; B08 the doctor
 *
 * The user typed Y to that. U6 then listed eight steps and ran nine, and **B06 — which U4 never
 * mentioned — started the instance wizard** over an entry the same plan had promised was
 * untouched two lines earlier.
 *
 * Three computations answered one question and two of them were shown:
 *   U4   mapped CHANGED FILES between the two tags to steps;
 *   U6   printed `plannedSteps()`, the list for the mode;
 *   the runner compared each step's INPUT HASH against the recorded state.
 *
 * Only the third decides. This file asserts the first is the third.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { planSteps, rerunAtTag } from '../../tools/snowarch/lib/commands/upgrade.mjs';
import { hashFor } from '../../tools/snowarch/lib/inputs.mjs';
import { STEPS } from '../../tools/snowarch/lib/steps/index.mjs';
import { tempDir } from '../../tools/snowarch/tests/helpers/temp.mjs';
import { REAL_ROOT } from '../doctor/helpers/tree.mjs';

const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });

/**
 * Check out a tag AND assert it took.
 *
 * `tests/test-hygiene` asks for this and it is right to: `git checkout` on a tree already at that
 * commit succeeds and changes nothing, so a test that checked out the wrong thing — or nothing —
 * would go on asserting against a tree it never moved. The assertion is the difference between
 * "the command returned 0" and "the tree is where I said it is".
 */
function checkoutTag(root, tag) {
  git(root, ['checkout', '--quiet', tag]);
  assert.equal(git(root, ['rev-parse', 'HEAD']).trim(), git(root, ['rev-parse', `${tag}^{}`]).trim(),
    `the checkout did not move the tree to ${tag}`);
}

/**
 * A clone of this repository with a tag to upgrade TO — the shape the plan is asked about.
 *
 * A clone rather than a fixture: `rerunAtTag` makes a `git worktree` at the tag and hashes the
 * real INPUTS table over it, and a hand-built tree would not have the tag, the objects, or the
 * files the table names.
 */
function clone(t, { change = null } = {}) {
  const dir = tempDir('snowarch-plan-', t);
  git(REAL_ROOT, ['clone', '--quiet', '--no-hardlinks', REAL_ROOT, dir]);
  git(dir, ['config', 'user.email', 'fixture@example.com']);
  git(dir, ['config', 'user.name', 'fixture']);
  git(dir, ['checkout', '--quiet', '-B', 'base']);
  if (change) {
    change(dir);
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-qm', 'the change the upgrade carries']);
  }
  git(dir, ['tag', '-a', 'v9.9.9-target', '-m', 'target']);
  git(dir, ['checkout', '--quiet', 'HEAD~' + (change ? 1 : 0)]);
  return dir;
}

const ctxFor = (root) => ({
  root,
  config: JSON.parse(readFileSync(join(root, 'engine.config.json'), 'utf8')),
  mode: 'design',
  instanceFile: null,
  node: { present: true, major: 22 },
  env: {},
  docs: 'sparse',
  state: { registration: 'project', hooksDisabledByBootstrap: false },
});

/** A recorded state in which every step that will run is `ok` and current for THIS tree. */
function recordCurrent(root, ctx) {
  const steps = {};
  for (const step of STEPS) {
    if (step.runsWhen(ctx) === false || step.cacheable === false) continue;
    steps[step.id] = { status: 'ok', inputsHash: hashFor(step.id, ctx),
      finishedAt: '2026-09-20T09:00:00.000Z', durationMs: 0, engineVersion: '9.9.9' };
  }
  mkdirSync(join(root, '.local'), { recursive: true });
  writeFileSync(join(root, '.local', 'bootstrap-state.json'),
    `${JSON.stringify({ version: 1, product: 'snowarch', mode: ctx.mode, steps }, null, 2)}\n`);
  return steps;
}

test('a state current for the target re-runs nothing', { timeout: 120_000 }, (t) => {
  const root = clone(t);
  const ctx = ctxFor(root);
  // The tag IS this tree, so hashing it produces the hashes just recorded.
  checkoutTag(root, 'v9.9.9-target');
  recordCurrent(root, ctx);

  const state = JSON.parse(readFileSync(join(root, '.local', 'bootstrap-state.json'), 'utf8'));
  const { steps, estimate } = planSteps(root, 'v9.9.9-target', { ctx, state, run: spawnSync });

  assert.equal(estimate, false, 'the worktree comparison did not run');
  assert.deepEqual(steps.map((s) => s.step), [],
    `nothing changed, yet the plan promises to re-run ${steps.map((s) => s.step).join(', ')}`);
});

test('a step the FILE DIFF cannot see is still in the plan', { timeout: 120_000 }, (t) => {
  // THE OWNER'S CASE, in the shape that made it invisible. B06's inputs are the store's schema,
  // the mode, and the contract's `storeSchemaVersion` — a step can go stale without any file the
  // old computation watched having changed, and then it ran without ever being announced.
  const root = clone(t);
  // A STORE, because that is what makes B06 run at all: `runsWhen` is
  // `mode === 'live' || storeExists(root)`, and without one the step is not in anybody's list —
  // which is also why the first version of this test asserted against an empty plan and was
  // asserting nothing. The owner's checkout has a store; so does this one.
  mkdirSync(join(root, '.local'), { recursive: true });
  writeFileSync(join(root, '.local', 'instances.json'),
    `${JSON.stringify({ version: 1, defaultInstance: 'pdi', instances: { pdi: {} } }, null, 2)}\n`);
  const ctx = ctxFor(root);
  checkoutTag(root, 'v9.9.9-target');
  recordCurrent(root, ctx);

  // Make B06 stale the way a real upgrade does: its recorded hash no longer matches.
  const path = join(root, '.local', 'bootstrap-state.json');
  const state = JSON.parse(readFileSync(path, 'utf8'));
  state.steps.B06 = { ...state.steps.B06, inputsHash: 'sha256:something-else' };
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`);

  const { steps } = planSteps(root, 'v9.9.9-target', { ctx, state, run: spawnSync });
  assert.ok(steps.some((s) => s.step === 'B06'),
    `B06 is stale and the plan does not say so: ${steps.map((s) => s.step).join(', ') || '(none)'}`);
  // …and it carries a reason, because a step named with no explanation is a step a reader cannot
  // weigh before typing Y.
  assert.equal(steps.find((s) => s.step === 'B06').why, 'inputs changed');
});

test('a step whose last run did not finish is in the plan', { timeout: 120_000 }, (t) => {
  // The owner's checkout after the Ctrl+C: B06 recorded `failed/interrupted`. The runner will
  // re-run it — `recorded.status === 'ok'` is one of its three clauses — and the plan must say so
  // before the user commits to another upgrade.
  const root = clone(t);
  const ctx = ctxFor(root);
  checkoutTag(root, 'v9.9.9-target');
  recordCurrent(root, ctx);

  const path = join(root, '.local', 'bootstrap-state.json');
  const state = JSON.parse(readFileSync(path, 'utf8'));
  state.steps.B05 = { ...state.steps.B05, status: 'failed', reason: 'interrupted' };
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`);

  const { steps } = planSteps(root, 'v9.9.9-target', { ctx, state, run: spawnSync });
  const b05 = steps.find((s) => s.step === 'B05');
  assert.ok(b05, 'an interrupted step is missing from the plan');
  assert.equal(b05.why, 'last run interrupted');
});

test('the plan says so when it could not make the runner\'s comparison', { timeout: 120_000 }, (t) => {
  // A tag that cannot be checked out means no worktree and no hash. The answer is the file diff,
  // and the plan must SAY it is an estimate rather than print a different computation under the
  // same heading — which is the whole shape of this row.
  const root = clone(t);
  const ctx = ctxFor(root);
  const { estimate } = planSteps(root, 'v0.0.0-no-such-tag', { ctx, state: { steps: {} },
    run: spawnSync });
  assert.equal(estimate, true);
  assert.equal(rerunAtTag(root, 'v0.0.0-no-such-tag', { ctx, state: { steps: {} } }), null);
});
