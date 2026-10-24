// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
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
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { planContext, planForMove, planSteps, rerunAtTag } from '../../tools/snowarch/lib/commands/upgrade.mjs';
import { hashFor } from '../../tools/snowarch/lib/inputs.mjs';
import { checkoutKey } from '../../tools/snowarch/lib/state.mjs';
import { STEPS } from '../../tools/snowarch/lib/steps/index.mjs';
import { git } from './harness.mjs';
import { tempDir } from '../../tools/snowarch/tests/helpers/temp.mjs';
import { REAL_ROOT } from '../doctor/helpers/tree.mjs';

// ARC-09-C27b — the HARNESS's git, not a bare `execFileSync`. Every git call in this directory
// carries `core.longpaths` on Windows, and a raw call is the one that fails on the cell nobody
// runs by hand. `tests/upgrade` has its own guard for exactly this and it caught the first
// version of this file.

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

// ARC-11-C6 — a licence in force: these cases are about what the plan names, and with no licence B06 and B08 are not
// planned at all (ruling R1). In-process, a fixture licence is not trusted, so the run's licence is handed in.
const ctxFor = (root) => ({
  root,
  licence: { state: 'ok' },
  config: JSON.parse(readFileSync(join(root, 'engine.config.json'), 'utf8')),
  mode: 'design',
  instanceFile: null,
  node: { present: true, major: 22 },
  env: {},
  docs: 'sparse',
  state: { registration: 'project', hooksDisabledByBootstrap: false },
});

/**
 * A recorded state in which every step that will run is `ok` and current for THIS tree.
 *
 * Hashed through `planContext` — the PRODUCT's constructor — rather than through a ctx this file
 * assembles. The first version built its own and the two disagreed about `state.registration`, so
 * the test reported B07 stale on a tree where nothing had changed: a test constructing its own
 * version of the thing under test measures its own copy.
 */
function recordCurrent(root, ctx) {
  const state = { version: 1, product: 'snowarch', mode: ctx.mode, docs: { mode: ctx.docs },
    registration: 'project', hooksDisabledByBootstrap: false, steps: {} };
  const hashCtx = planContext({ root, config: ctx.config, ctx, state });
  // ARC-09-C198 — recorded HERE: the plan, like the runner, keeps nothing from a record of another folder.
  state.checkout = checkoutKey(root, hashCtx.platform);
  for (const step of STEPS) {
    if (step.runsWhen(hashCtx) === false || step.cacheable === false) continue;
    state.steps[step.id] = { status: 'ok', inputsHash: hashFor(step.id, hashCtx),
      finishedAt: '2026-09-20T09:00:00.000Z', durationMs: 0, engineVersion: '9.9.9' };
  }
  mkdirSync(join(root, '.local'), { recursive: true });
  writeFileSync(join(root, '.local', 'bootstrap-state.json'),
    `${JSON.stringify(state, null, 2)}\n`);
  return state.steps;
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

test('ARC-09-C140 — B01 is in the plan when its release manifest is not held, and not when U5 will write it', { timeout: 120_000 }, (t) => {
  // The target is a release, 9.9.9, whose config names the manifests (this repository's own revocations repository),
  // and this checkout's `.local/` holds no manifest: the runner would run B01 for it, whatever its inputs say.
  const root = clone(t, { change: (dir) => {
    const p = join(dir, 'package.json');
    writeFileSync(p, `${JSON.stringify({ ...JSON.parse(readFileSync(p, 'utf8')), version: '9.9.9' }, null, 2)}\n`);
  } });
  const ctx = ctxFor(root);
  checkoutTag(root, 'v9.9.9-target');
  recordCurrent(root, ctx);
  const state = JSON.parse(readFileSync(join(root, '.local', 'bootstrap-state.json'), 'utf8'));

  // A pull on a branch writes no manifest at U5, so B01 runs at U6 and the plan says so, with the reason.
  const pulled = planSteps(root, 'v9.9.9-target', { ctx, state, run: spawnSync, manifestWritten: false });
  assert.deepEqual(pulled.steps.map((s) => [s.step, s.why]), [['B01', 'the release manifest is not held']]);
  // A move by checkout writes the target's verified manifest at U5, so U6 finds B01's output there and caches it.
  const checkedOut = planSteps(root, 'v9.9.9-target', { ctx, state, run: spawnSync, manifestWritten: true });
  assert.deepEqual(checkedOut.steps.map((s) => s.step), [],
    `U5 writes the manifest, yet the plan promises to re-run ${checkedOut.steps.map((s) => s.step).join(', ')}`);
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

test('the plan leaves no temp directory behind', { timeout: 120_000 }, (t) => {
  // MEASURED IN REVIEW, on a PASSING run: five `snowarch-plan-*` directories left in TMPDIR after
  // this one file. `rerunAtTag` removed the worktree and not the `mkdtemp` that held it, so every
  // real upgrade plan left an empty directory in the OS temp — a passing test and a leak, which is
  // the combination nothing notices.
  //
  // Counted here rather than left to `fixture-cleanup`: that test watches what `npm test` leaves,
  // and `tests/upgrade/` is outside `npm test`.
  const root = clone(t);
  const ctx = ctxFor(root);
  checkoutTag(root, 'v9.9.9-target');
  recordCurrent(root, ctx);
  const state = JSON.parse(readFileSync(join(root, '.local', 'bootstrap-state.json'), 'utf8'));

  // ARC-07-C36 — A PRIVATE TEMP ROOT, because counting the SHARED one measured the neighbours.
  //
  // This read `readdirSync(tmpdir())` before and after and compared the counts. That is not a property
  // of the plan: it is a property of the plan AND everything else touching `os.tmpdir()` while the case
  // runs. The five `tests/upgrade` files run at `--test-concurrency=2`, so it was unreliable in BOTH
  // directions — a neighbour creating a plan directory between the readings failed a correct product,
  // and one removing a leaked directory could make the difference zero and mask a real leak. Observed
  // rather than argued: it went red inside `node --test tests/**/*.test.mjs` (whose glob picks up
  // `tests/upgrade/` at DEFAULT concurrency, so more neighbours than CI gives it) and passed 3 of 3
  // when this file ran alone.
  //
  // With TMPDIR pointed at a directory this case made, everything inside it IS what this case created,
  // so "count only mine" and "the root is empty" are the same assertion — and no neighbour can reach it.
  // TEMP and TMP as well as TMPDIR: `os.tmpdir()` reads TMPDIR on POSIX and TEMP/TMP on Windows, and the
  // Windows e2e cell runs this file too.
  const privateTmp = tempDir('c36-plan-root-', t);
  const saved = { TMPDIR: process.env.TMPDIR, TEMP: process.env.TEMP, TMP: process.env.TMP };
  t.after(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
  process.env.TMPDIR = privateTmp;
  process.env.TEMP = privateTmp;
  process.env.TMP = privateTmp;

  for (let i = 0; i < 3; i += 1) {
    planSteps(root, 'v9.9.9-target', { ctx, state, run: spawnSync });
  }
  // …and the failing path too, which returns early and must clean up on the way out.
  rerunAtTag(root, 'v0.0.0-no-such-tag', { ctx, state });

  const mine = readdirSync(privateTmp).filter((n) => n.startsWith('snowarch-plan-'));
  assert.deepEqual(mine, [],
    `${mine.length} snowarch-plan-* director(ies) left in this case's own temp root after four plans: `
    + `${mine.join(', ')}`);

  // ...AND THE ROOT IS REACHED AT ALL, which is the floor this needs. If `os.tmpdir()` ignored the
  // environment — a different Node line, or a platform reading something else — every plan would go to
  // the real TMPDIR, `mine` would be empty for the wrong reason, and the assertion above would pass
  // over a leak it never looked at.
  assert.equal(tmpdir(), privateTmp,
    'os.tmpdir() did not follow the environment, so the assertion above counted an empty directory');

  // The worktree register is clean too: a removed directory with a registered worktree still
  // shows in `git worktree list` and makes the next `add` at that path fail.
  const worktrees = git(root, ['worktree', 'list']).trim().split('\n').filter(Boolean);
  assert.equal(worktrees.length, 1, `worktrees left registered:\n${worktrees.join('\n')}`);
});

test('the plan survives the ctx the COMMAND hands it, which carries neither env nor node',
  { timeout: 120_000 }, (t) => {
    // THE CASE THAT ACTUALLY SHIPPED, and the one the test below does not reach.
    //
    // `upgradeCommand` builds `const ctx = { root, config };` — that literal, nothing else — and
    // hands it to `planSteps`. `rerunAtTag` spread it (`{ ...ctx, root: at, config }`) into the
    // object it gives `runsWhen`, `B04.runsWhen` read `ctx.env.SNOWARCH_TEST_FORCE_DEPS`, and
    // **every** `./snowarch upgrade` died at `[U4/7] plan`.
    //
    // The test below hands `planContext` a ctx from `ctxFor()`, which already has `env` — so it
    // holds `planContext`'s contract and says nothing about `rerunAtTag`'s use of it, and it stays
    // green with the original crash line restored. Measured, not assumed: the architect restored
    // line 288 and got 6/6. A test that cannot fail on the defect it was written for is the same
    // shape as a check that cannot tell failure from absence.
    //
    // So this one enters through the front door with the POOREST ctx the command could hand in.
    // A lower bound, deliberately: if the command is ever enriched, this still holds, because the
    // fix must be that the plan builds what the steps read rather than that its caller happened to
    // pass enough.
    const root = clone(t);
    const config = JSON.parse(readFileSync(join(root, 'engine.config.json'), 'utf8'));
    const state = { version: 1, product: 'snowarch', mode: 'design', docs: { mode: 'sparse' },
      registration: 'project', hooksDisabledByBootstrap: false, steps: {} };

    const commandCtx = { root, config };   // `upgrade.mjs`, U4 — verbatim
    assert.equal(commandCtx.env, undefined, 'the command ctx this drives must have no env');
    assert.equal(commandCtx.node, undefined, 'the command ctx this drives must have no node');

    let plan;
    assert.doesNotThrow(() => { plan = planSteps(root, 'v9.9.9-target', { ctx: commandCtx, state }); },
      'the plan threw on the ctx the upgrade command hands it');

    // …and it is a real plan, not a swallowed estimate: `estimate: true` is the worktree fallback,
    // and a crash that degraded into it would pass a no-throw assertion while the user read the
    // other computation under the same heading — which is this row's whole point.
    assert.equal(plan.estimate, false, 'the plan fell back to the file-diff estimate');
    assert.ok(Array.isArray(plan.steps), 'the plan has no steps array');
    // Nothing is recorded, so every cacheable step is `never recorded` — the runner's answer, and
    // proof the hash comparison ran rather than short-circuiting on the missing keys.
    assert.ok(plan.steps.length > 0, 'a state with no recorded steps re-runs nothing');
    for (const s of plan.steps) assert.equal(typeof s.why, 'string', `${s.step} has no reason`);
  });

test('the plan ctx is the shape every step reads', { timeout: 120_000 }, (t) => {
  // THE ASSERTION THAT WOULD HAVE CAUGHT THE CRASH, and it costs nothing.
  //
  // `rerunAtTag` handed `runsWhen` a ctx spread from the upgrade command's `{ root, config }` —
  // no `env` — and `B04.runsWhen` reads `ctx.env.SNOWARCH_TEST_FORCE_DEPS`. **Every real
  // `./snowarch upgrade` died at `[U4/7] plan`** with `Cannot read properties of undefined`, on
  // every machine. Four green tests above and a product that could not plan an upgrade, because
  // each of them BUILDS its own ctx and so none of them exercised the contract between
  // `rerunAtTag` and the steps.
  //
  // The e2e does drive the real command and it did catch this — on CI, after the push, because
  // `tests/upgrade/` is outside `npm test` and I had not run it. This assertion is the cheap half
  // that fails in a second: every step is asked its own question with the ctx the plan builds, and
  // `runsWhen` throwing is the failure.
  const root = clone(t);
  const ctx = ctxFor(root);
  const state = { mode: 'live', docs: { mode: 'sparse' }, registration: 'project',
    hooksDisabledByBootstrap: false, steps: {} };
  const planned = planContext({ root, config: ctx.config, ctx, state });

  for (const key of ['root', 'config', 'env', 'node', 'state', 'mode', 'docs']) {
    assert.notEqual(planned[key], undefined, `the plan ctx has no ${key}`);
  }

  for (const step of STEPS) {
    assert.doesNotThrow(() => step.runsWhen(planned),
      `${step.id}.runsWhen threw on the ctx the plan builds`);
  }

  // …and the hasher too, which reads the same ctx by a different path.
  for (const step of STEPS) {
    if (step.cacheable === false || step.runsWhen(planned) === false) continue;
    assert.doesNotThrow(() => hashFor(step.id, planned),
      `${step.id}'s inputs could not be resolved from the ctx the plan builds`);
  }
});

// ── ARC-09-C198 — the runner keeps nothing from a record that is not this checkout's, so neither does the plan ──

/** The recorded state, rewritten by `change`: what a carried or an older `.local/bootstrap-state.json` holds. */
function rewriteState(root, change) {
  const path = join(root, '.local', 'bootstrap-state.json');
  const state = JSON.parse(readFileSync(path, 'utf8'));
  change(state);
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`);
  return state;
}

test('ARC-09-C198 — a record carried from another folder puts every cacheable step in the plan, and says why',
  { timeout: 120_000 }, (t) => {
    const root = clone(t);
    const ctx = ctxFor(root);
    checkoutTag(root, 'v9.9.9-target');
    const recorded = recordCurrent(root, ctx);
    // What a copy of another folder's `.local/` carries: a binding, and not this folder's.
    const state = rewriteState(root, (s) => { s.checkout = 'a key written in another folder'; });

    const { steps, estimate } = planSteps(root, 'v9.9.9-target', { ctx, state, run: spawnSync });
    assert.equal(estimate, false, 'the worktree comparison did not run');
    assert.deepEqual(steps.map((s) => `${s.step} ${s.why}`),
      Object.keys(recorded).sort().map((id) => `${id} recorded in another folder`));
  });

test('ARC-09-C198 — a record written before the binding existed puts every cacheable step in the plan, and says why',
  { timeout: 120_000 }, (t) => {
    const root = clone(t);
    const ctx = ctxFor(root);
    checkoutTag(root, 'v9.9.9-target');
    const recorded = recordCurrent(root, ctx);
    const state = rewriteState(root, (s) => { delete s.checkout; });

    const { steps, estimate } = planSteps(root, 'v9.9.9-target', { ctx, state, run: spawnSync });
    assert.equal(estimate, false, 'the worktree comparison did not run');
    assert.deepEqual(steps.map((s) => `${s.step} ${s.why}`),
      Object.keys(recorded).sort().map((id) => `${id} recorded without a folder`));
  });

test('ARC-09-C241 — a worktree a failed target left dirty is cleaned before the fallback plans in it',
  { timeout: 120_000 }, (t) => {
    const root = clone(t);
    const ctx = ctxFor(root);
    checkoutTag(root, 'v9.9.9-target');
    recordCurrent(root, ctx);
    const state = JSON.parse(readFileSync(join(root, '.local', 'bootstrap-state.json'), 'utf8'));
    const fresh = planSteps(root, 'v9.9.9-target', { ctx, state, run: spawnSync });
    assert.deepEqual(fresh.steps.map((s) => s.step), [], 'the control: a state current for the tag plans nothing');

    // The helper runs the TARGET's code in the shared worktree. This one leaves it dirty, then fails: a stray file,
    // and the lock file B04 hashes, edited. Planned on as it was left, B04 would be "inputs changed".
    const adds = [];
    let stray = null;
    const run = (cmd, args, options) => {
      if (cmd === process.execPath) {
        stray = join(args[1], 'stray-from-the-target.txt');
        writeFileSync(stray, 'left behind\n');
        writeFileSync(join(args[1], 'package-lock.json'), '{}\n');
        return { status: 1, stdout: '', stderr: 'plan-at-target: the target failed after writing\n' };
      }
      if (cmd === 'git' && args[0] === 'worktree' && args[1] === 'add') adds.push(args.at(-2));
      return spawnSync(cmd, args, options);
    };
    const plan = planForMove(root, 'v9.9.9-target', { ctx, state, run, signed: true });
    assert.equal(adds.length, 1, `U4 made ${adds.length} worktrees of the tag`);
    assert.deepEqual(plan.steps, fresh.steps, 'the fallback planned on what the failed target left behind');
    assert.match(plan.installedBecause, /the target failed after writing/);
    assert.ok(stray, 'the stand-in target never ran');
    assert.equal(existsSync(stray), false, 'the stray file the target wrote is still there');
    const listed = git(root, ['worktree', 'list', '--porcelain']).split('\n').filter((l) => l.startsWith('worktree '));
    assert.equal(listed.length, 1, `a worktree is still registered: ${listed.join(', ')}`);
  });
