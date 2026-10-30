// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C195 — U4's plan is asked of the TARGET's own runner.
//
// An upgrade runs in the process that started it, so the plan U4 printed came from the installed release's STEPS,
// INPUTS and hashFor while U6 runs the target's bootstrap: ARC-08-C29's defect, across versions. U4 now asks the
// target once its files have passed the signed-manifest check: a child runs the installed release's helper, which
// imports the target's own planSteps from a worktree of the tag and prints its answer on stdout. A target from before
// signed manifests, a timeout, a failure or an answer of the wrong shape leave this release's computation in place,
// and the plan says so. These are the halves a unit can hold, and the helper's one real run; the e2e case in
// `tests/upgrade/` drives a tag whose step inputs differ. This file lives outside tests/upgrade/, as C197's pure
// halves do, so it runs in every `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PLAN_HELPER, PLAN_TIMEOUT_MS, planForMove, planSteps, renderPlan, targetPlan }
  from '../tools/snowarch/lib/commands/upgrade.mjs';
import { loadConfig } from '../tools/snowarch/lib/config.mjs';
import { MANIFESTS_FROM } from '../tools/snowarch/lib/licence/manifest.mjs';
import { initFixtureRepo } from '../tools/snowarch/tests/helpers/fixture-git.mjs';
import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** A commit identity for the fixture's git, by environment rather than by a config write. */
const IDENTITY = { ...process.env, GIT_AUTHOR_NAME: 'fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
  GIT_COMMITTER_NAME: 'fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' };

/** What the target's runner answers, and what this release's tables would have said instead. */
const TARGETS = { steps: [{ step: 'B07', title: 'the local toggles', files: [], why: 'inputs changed' }],
  estimate: false };
const OWN = { steps: [], estimate: false };

test('ARC-09-C195 — a signed target\'s own answer is the plan, and this release\'s tables are not asked', () => {
  let own = 0;
  const plan = planForMove('/checkout', 'v9.2.0', { signed: true, askTarget: () => ({ plan: TARGETS }),
    ownPlan: () => { own += 1; return OWN; } });
  assert.deepEqual(plan, { ...TARGETS, installedBecause: null });
  assert.equal(own, 0, 'this release\'s tables planned although the target answered');
});

test('ARC-09-C195 — a target that cannot answer leaves this release\'s plan, and the plan says why', () => {
  const reason = 'the target\'s own plan could not be read: it did not answer within 30 s';
  const plan = planForMove('/checkout', 'v9.2.0', { signed: true, askTarget: () => ({ reason }),
    ownPlan: () => OWN });
  assert.deepEqual(plan, { ...OWN, installedBecause: reason });
  const text = renderPlan({ from: 'v9.1.0', to: 'v9.2.0', commits: 1, date: null,
    tagInfo: { contract: 'a'.repeat(40), docsPin: 'b'.repeat(40) }, floor: { line: null },
    store: { line: 'store: none' }, ...plan });
  assert.ok(text.split('\n').includes(`  (computed by the installed release — ${reason})`), text);
  // The target's own answer carries no such line.
  const theirs = renderPlan({ from: 'v9.1.0', to: 'v9.2.0', commits: 1, date: null,
    tagInfo: { contract: 'a'.repeat(40), docsPin: 'b'.repeat(40) }, floor: { line: null },
    store: { line: 'store: none' }, ...planForMove('/checkout', 'v9.2.0', { signed: true,
      askTarget: () => ({ plan: TARGETS }), ownPlan: () => OWN }) });
  assert.doesNotMatch(theirs, /computed by the installed release/);
});

test('ARC-09-C195 — a target from before signed manifests is not asked', () => {
  let asked = 0;
  const plan = planForMove('/checkout', 'v9.0.1', { signed: false,
    askTarget: () => { asked += 1; return { plan: TARGETS }; }, ownPlan: () => OWN });
  assert.equal(asked, 0, 'the code of a target whose files were not checked ran before the user said Y');
  assert.match(plan.installedBecause, new RegExp(`before ${MANIFESTS_FROM.replace(/\./g, '\\.')}`));
});

/** A runner that answers git as a repository would, and the helper as given; it records every call. */
function fakeRun({ helper = null, addStatus = 0, leftBehind = [] } = {}) {
  const calls = [];
  let lists = 0;
  const run = (cmd, args, options) => {
    calls.push({ cmd, args, options });
    if (cmd !== 'git') return helper;
    if (args[0] === 'worktree' && args[1] === 'list') {
      lists += 1;
      const paths = ['/checkout', ...(lists > 1 ? leftBehind : [])];
      return { status: 0, stdout: `${paths.map((p) => `worktree ${p}\nHEAD ${'0'.repeat(40)}\n`).join('\n')}` };
    }
    if (args[0] === 'worktree' && args[1] === 'add') return { status: addStatus, stdout: '', stderr: '' };
    return { status: 0, stdout: '', stderr: '' };
  };
  return { run, calls };
}

test('ARC-09-C195 — the target is asked through the helper, with a 30 s limit, and only its stdout is read', () => {
  const state = { version: 1, steps: { B07: { status: 'ok', inputsHash: 'recorded' } } };
  const { run, calls } = fakeRun({ helper: { status: 0, stdout: `${JSON.stringify(TARGETS)}\n`,
    stderr: 'a warning the target printed\n' } });
  assert.deepEqual(targetPlan('/checkout', 'v9.2.0', { run, state }), { plan: TARGETS });
  const helper = calls.find((c) => c.cmd === process.execPath);
  assert.equal(helper.args[0], PLAN_HELPER);
  assert.deepEqual(helper.args.slice(2), ['/checkout', 'v9.2.0']);
  assert.equal(PLAN_TIMEOUT_MS, 30_000);
  assert.equal(helper.options.timeout, PLAN_TIMEOUT_MS);
  assert.deepEqual(JSON.parse(helper.options.input), { manifestWritten: true, state });
  // The worktree the helper read from is made from the tag, and removed again.
  const add = calls.find((c) => c.cmd === 'git' && c.args[1] === 'add');
  assert.equal(add.args.at(-1), 'v9.2.0');
  assert.ok(calls.some((c) => c.cmd === 'git' && c.args[1] === 'remove' && c.args.at(-1) === helper.args[1]));
});

test('ARC-09-C195 — a timeout, a failure, or an answer that is not a plan is a reason, never a plan', () => {
  const ask = (helper) => targetPlan('/checkout', 'v9.2.0', { run: fakeRun({ helper }).run });
  const prefix = 'the target\'s own plan could not be read: ';
  const timedOut = Object.assign(new Error('spawnSync node ETIMEDOUT'), { code: 'ETIMEDOUT' });
  assert.deepEqual(ask({ status: null, signal: 'SIGTERM', error: timedOut, stdout: '', stderr: '' }),
    { reason: `${prefix}it did not answer within 30 s` });
  // One line of stderr, the first that says anything.
  assert.deepEqual(ask({ status: 1, stdout: '', stderr: '\nplan-at-target: no planSteps\n    at file:///x.mjs:1\n' }),
    { reason: `${prefix}plan-at-target: no planSteps` });
  assert.deepEqual(ask({ status: 0, stdout: 'Upgrade plan: v9.1.0 → v9.2.0\n', stderr: '' }),
    { reason: `${prefix}its answer was not JSON` });
  for (const answer of [{ steps: 'B07', estimate: false }, { steps: [{ step: 'B07' }], estimate: false },
    { steps: [], estimate: 'no' }, null]) {
    assert.deepEqual(ask({ status: 0, stdout: JSON.stringify(answer), stderr: '' }),
      { reason: `${prefix}its answer had an unexpected shape` }, JSON.stringify(answer));
  }
});

test('ARC-09-C195 — a tag that cannot be checked out is a reason, and nothing is spawned', () => {
  const { run, calls } = fakeRun({ addStatus: 128 });
  assert.deepEqual(targetPlan('/checkout', 'v9.2.0', { run }),
    { reason: 'the target\'s own plan could not be read: the tag could not be checked out to ask it' });
  assert.equal(calls.some((c) => c.cmd === process.execPath), false);
});

test('ARC-09-C195 — a worktree a stopped child left registered is removed; the main one never is', () => {
  const timedOut = Object.assign(new Error('spawnSync node ETIMEDOUT'), { code: 'ETIMEDOUT' });
  const { run, calls } = fakeRun({ helper: { status: null, signal: 'SIGTERM', error: timedOut },
    leftBehind: ['/tmp/snowarch-plan-x/at-tag'] });
  targetPlan('/checkout', 'v9.2.0', { run });
  const removed = calls.filter((c) => c.cmd === 'git' && c.args[1] === 'remove').map((c) => c.args.at(-1));
  assert.ok(removed.includes('/tmp/snowarch-plan-x/at-tag'), JSON.stringify(removed));
  assert.equal(removed.includes('/checkout'), false, 'the main worktree was asked to be removed');
});

/** Every file under `dir` but .git, by its bytes: what a read-only run must leave as it found it. */
function snapshot(dir) {
  const out = {};
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === '.git') continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out[relative(dir, p)] = createHash('sha256').update(readFileSync(p)).digest('hex');
    }
  };
  walk(dir);
  return out;
}

test('ARC-09-C195 — the helper plans and nothing more: the checkout and .local/ are byte-unchanged', (t) => {
  // The target's code runs before the user says Y. This tree stands in for the target's code; the fixture is the
  // checkout, with a recorded state, moving from v9.1.0 to v9.2.0.
  const repo = tempDir('snowarch-c195-', t);
  const git = (args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: 'pipe', env: IDENTITY });
  const put = (path, text) => {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), text);
  };
  initFixtureRepo(git, repo, ['-q', '-b', 'main']);
  put('.gitignore', '.local/\n');
  put('package.json', '{"name":"fixture","version":"9.2.0"}\n');
  put('package-lock.json', '{"lockfileVersion":3}\n');
  git(['add', '-A']);
  git(['commit', '-qm', 'one']);
  git(['tag', 'v9.1.0']);
  put('package-lock.json', '{"lockfileVersion":3,"packages":{}}\n');
  git(['commit', '-qam', 'two']);
  git(['tag', 'v9.2.0']);
  git(['checkout', '-q', 'v9.1.0']);
  assert.equal(git(['rev-parse', 'HEAD']), git(['rev-parse', 'v9.1.0^{commit}']),
    'the checkout did not move to v9.1.0');
  const state = { version: 1, steps: { B04: { status: 'ok', inputsHash: 'recorded' } } };
  put('.local/bootstrap-state.json', `${JSON.stringify(state)}\n`);
  put('.local/notes.txt', 'mine\n');
  const before = { files: snapshot(repo), worktrees: git(['worktree', 'list', '--porcelain']),
    status: git(['status', '--porcelain', '--ignored']) };

  const r = spawnSync(process.execPath, [PLAN_HELPER, ROOT, repo, 'v9.2.0'], { cwd: repo, encoding: 'utf8',
    input: JSON.stringify({ manifestWritten: true, state }), timeout: PLAN_TIMEOUT_MS });
  assert.equal(r.status, 0, r.stderr);
  const plan = JSON.parse(r.stdout);
  assert.ok(Array.isArray(plan.steps) && plan.steps.length > 0 && typeof plan.estimate === 'boolean', r.stdout);

  assert.deepEqual(snapshot(repo), before.files, 'the helper changed a file in the checkout or in its .local/');
  assert.equal(git(['worktree', 'list', '--porcelain']), before.worktrees, 'the helper left a worktree registered');
  assert.equal(git(['status', '--porcelain', '--ignored']), before.status);
});

/** A two-tag fixture checkout at v9.1.0, moving to v9.2.0, whose move changes a step's input (B04's lock file). */
function fixtureCheckout(t) {
  const repo = tempDir('snowarch-c241-', t);
  const git = (args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: 'pipe', env: IDENTITY });
  const put = (path, text) => {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), text);
  };
  initFixtureRepo(git, repo, ['-q', '-b', 'main']);
  put('.gitignore', '.local/\n');
  put('package.json', '{"name":"fixture","version":"9.2.0"}\n');
  put('package-lock.json', '{"lockfileVersion":3}\n');
  git(['add', '-A']);
  git(['commit', '-qm', 'one']);
  git(['tag', 'v9.1.0']);
  put('package-lock.json', '{"lockfileVersion":3,"packages":{}}\n');
  git(['commit', '-qam', 'two']);
  git(['tag', 'v9.2.0']);
  git(['checkout', '-q', 'v9.1.0']);
  assert.equal(git(['rev-parse', 'HEAD']), git(['rev-parse', 'v9.1.0^{commit}']), 'the checkout did not move to v9.1.0');
  return { repo, git };
}

/** git through spawnSync, recorded: every `git worktree add` this process makes. planSteps spawns nothing else. */
function recordedRun() {
  const adds = [];
  const run = (cmd, args, options) => {
    assert.equal(cmd, 'git', `planSteps spawned ${cmd}`);
    if (args[0] === 'worktree' && args[1] === 'add') adds.push(args.at(-2));
    return spawnSync('git', args, options);
  };
  return { run, adds };
}

/** git through spawnSync, every call recorded; the one other command, the helper, is a stand-in target that fails. */
function standInRun() {
  const adds = [];
  const calls = [];
  let asked = null;
  const run = (cmd, args, options) => {
    if (cmd !== 'git') {
      asked = args[1];
      return { status: 1, stdout: '', stderr: 'plan-at-target: no planSteps\n' };
    }
    calls.push(args);
    if (args[0] === 'worktree' && args[1] === 'add') adds.push(args.at(-2));
    return spawnSync('git', args, options);
  };
  return { run, adds, calls, asked: () => asked };
}

test('ARC-09-C241 — planSteps hands a kept worktree to rerunAtTag, which then adds none', (t) => {
  const { repo, git } = fixtureCheckout(t);
  const ctx = { root: repo, config: loadConfig(ROOT) };
  const fresh = recordedRun();
  const planned = planSteps(repo, 'v9.2.0', { ctx, state: null, run: fresh.run });
  assert.equal(fresh.adds.length, 1, 'the control: without a kept worktree, planSteps adds one');

  const kept = join(tempDir('snowarch-c241-kept-', t), 'at-tag');
  git(['worktree', 'add', '--detach', '--quiet', kept, 'v9.2.0']);
  t.after(() => { try { git(['worktree', 'remove', '--force', kept]); } catch { /* removed by the case */ } });
  const reused = recordedRun();
  const again = planSteps(repo, 'v9.2.0', { ctx, state: null, run: reused.run, keepWorktree: kept });
  assert.deepEqual(reused.adds, [], 'planSteps added a worktree although it was handed one');
  assert.deepEqual(again, planned, 'the plan from the kept worktree is not the plan from a fresh one');
  assert.ok(existsSync(join(kept, 'package.json')), 'planSteps removed a worktree it did not make');
});

test('ARC-09-C241 — the helper hands the target\'s planSteps the worktree it runs in, when that is the tag\'s', (t) => {
  // The tag's own code is a planSteps that answers with the options it was handed.
  const repo = tempDir('snowarch-c241-target-', t);
  const git = (args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: 'pipe', env: IDENTITY });
  initFixtureRepo(git, repo, ['-q', '-b', 'main']);
  mkdirSync(join(repo, 'tools', 'snowarch', 'lib', 'commands'), { recursive: true });
  writeFileSync(join(repo, 'engine.config.json'), '{}\n');
  writeFileSync(join(repo, 'tools', 'snowarch', 'lib', 'commands', 'upgrade.mjs'),
    'export function planSteps(root, tag, options) {\n'
    + '  const seen = JSON.stringify({ keepWorktree: options.keepWorktree ?? null });\n'
    + '  return { steps: [{ step: "B00", title: seen, why: "probe", files: [] }], estimate: false };\n}\n');
  git(['add', '-A']);
  git(['commit', '-qm', 'the target']);
  git(['tag', 'v9.2.0']);
  const seen = (at) => {
    const r = spawnSync(process.execPath, [PLAN_HELPER, at, repo, 'v9.2.0'], { cwd: repo, encoding: 'utf8',
      input: JSON.stringify({ manifestWritten: true, state: null }), timeout: PLAN_TIMEOUT_MS });
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(JSON.parse(r.stdout).steps[0].title).keepWorktree;
  };
  const at = join(tempDir('snowarch-c241-at-', t), 'at-tag');
  git(['worktree', 'add', '--detach', '--quiet', at, 'v9.2.0']);
  t.after(() => { try { git(['worktree', 'remove', '--force', at]); } catch { /* the repository went first */ } });
  assert.equal(seen(at), at, 'the helper did not hand over the worktree of the tag it ran in');
  // The control: a tree that holds the target's code without being the tag's checkout is not planned in.
  git(['commit', '-q', '--allow-empty', '-m', 'past the tag']);
  assert.equal(seen(repo), null, 'the helper handed over a tree that is not the tag\'s checkout');
});

test('ARC-09-C241 — planForMove makes one worktree, asks the target in it, and plans the fallback in it', (t) => {
  const { repo } = fixtureCheckout(t);
  const ctx = { root: repo, config: loadConfig(ROOT) };
  const fresh = planSteps(repo, 'v9.2.0', { ctx, state: null, run: spawnSync });
  const { run, adds, asked } = standInRun();
  let handed;
  const plan = planForMove(repo, 'v9.2.0', { ctx, state: null, run, signed: true,
    ownPlan: (root, tag, options) => { handed = options.keepWorktree; return planSteps(root, tag, options); } });
  assert.equal(adds.length, 1, `U4 made ${adds.length} worktrees of the tag`);
  assert.ok(asked(), 'the stand-in target was never asked');
  assert.equal(handed, asked(), 'the fallback did not plan in the worktree the target was asked in');
  assert.deepEqual(plan.steps, fresh.steps, 'the fallback in the shared worktree planned otherwise than a fresh one');
  assert.match(plan.installedBecause, /plan-at-target: no planSteps/);
  assert.equal(existsSync(asked()), false, 'the shared worktree was not removed');
});

test('ARC-09-C241 — a worktree that is not ours beyond doubt is never reset or cleaned, and the plan stays right',
  (t) => {
    // reset --hard and clean -fd are destructive, and `git -C ""` runs in the current directory: a bug that handed
    // over an empty path, the checkout itself or some other directory must not reach either.
    const { repo, git } = fixtureCheckout(t);
    const ctx = { root: repo, config: loadConfig(ROOT) };
    const foreign = tempDir('snowarch-c241-foreign-', t);
    writeFileSync(join(foreign, 'package.json'), '{"name":"not a worktree"}\n');
    // The checkout at the tag, with a change of its own: had anything been reset here, the change would be gone.
    git(['checkout', '-q', 'v9.2.0']);
    assert.equal(git(['rev-parse', 'HEAD']), git(['rev-parse', 'v9.2.0^{commit}']), 'the checkout did not move to v9.2.0');
    writeFileSync(join(repo, 'package.json'), '{"name":"fixture","version":"9.2.0","edited":"by the user"}\n');
    const fresh = planSteps(repo, 'v9.2.0', { ctx, state: null, run: spawnSync });
    for (const [why, at] of [['an empty path', ''], ['the checkout itself', repo], ['a foreign directory', foreign]]) {
      const scratch = tempDir('snowarch-c241-scratch-', t);
      const { run, calls } = standInRun();
      let handed = 'never asked';
      const plan = planForMove(repo, 'v9.2.0', { ctx, state: null, run, signed: true,
        makeWorktree: () => ({ at, scratch }),
        ownPlan: (root, tag, options) => { handed = options.keepWorktree; return planSteps(root, tag, options); } });
      const destructive = calls.filter((a) => a.includes('reset') || a.includes('clean'));
      assert.deepEqual(destructive, [], `${why}: a reset or a clean ran`);
      assert.equal(handed, null, `${why}: the fallback planned in it`);
      assert.deepEqual(plan.steps, fresh.steps, `${why}: the plan is not the one a fresh worktree gives`);
    }
    assert.match(readFileSync(join(repo, 'package.json'), 'utf8'), /"edited":"by the user"/,
      'the change in the checkout is gone');
    assert.equal(readFileSync(join(foreign, 'package.json'), 'utf8'), '{"name":"not a worktree"}\n');
  });
