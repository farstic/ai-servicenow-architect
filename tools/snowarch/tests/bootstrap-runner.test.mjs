import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ABSENT, FILE, TEXT, hashInputs } from '../lib/steps/inputs.mjs';
import { STEPS, interrupt, killTree, runSteps, stepById } from '../lib/steps/index.mjs';
import { failureBlock, humanDuration, stepLine } from '../lib/steps/format.mjs';
import { emptyState, loadState } from '../lib/state.mjs';
import { makeCheckout, stub } from './helpers/workspace.mjs';

const base = (root) => ({ root, mode: 'design-only', docs: 'sparse', env: {},
  node: { present: true, version: '22.11.0', major: 22 } });
const state = () => emptyState({ engineVersion: '2.0.0-test', platform: 'darwin' });
// These tests drive FAKE steps with invented ids, which have no row in ARC-09-S05's INPUTS table.
// The runner hashes from the table by id; a fixture that invents a step supplies its own hasher
// through the same seam the product uses. That is a fixture, not a second source of truth — the
// real steps are hashed by the table, and `input-hash.test.mjs` is what holds the table honest.
const fakeHash = (step, ctx) => hashInputs(ctx.root, step.inputs(ctx));
const run = (opts) => runSteps({ save: () => {}, hash: fakeHash, ...opts });

test('the registry is ten steps in order, and every one honours the contract', () => {
  assert.deepEqual(STEPS.map((s) => s.id),
    ['B00', 'B01', 'B02', 'B03', 'B04', 'B05', 'B06', 'B07', 'B08', 'B09']);
  for (const s of STEPS) {
    assert.equal(typeof s.title, 'string');
    assert.equal(typeof s.needsNode, 'boolean');
    assert.equal(typeof s.runsWhen, 'function');
    assert.equal(typeof s.inputs, 'function');
    assert.equal(typeof s.run, 'function');
  }
  assert.equal(stepById('B06').id, 'B06');
  assert.equal(stepById('B99'), null);
});

test('B00 and B09 are never cached, and say so on the step rather than in the runner', () => {
  assert.equal(stepById('B00').cacheable, false);
  assert.equal(stepById('B09').cacheable, false);
  assert.equal(stepById('B01').cacheable, undefined, 'the default is cacheable');
});

test('an input hash is content-addressed, and a missing file is not an empty one', () => {
  const root = makeCheckout();
  const of = (entries) => hashInputs(root, entries);
  const a = of([FILE('package-lock.json'), TEXT('mode=design-only')]);
  assert.match(a, /^sha256:[0-9a-f]{64}$/);
  assert.equal(a, of([FILE('package-lock.json'), TEXT('mode=design-only')]), 'not stable');
  assert.notEqual(a, of([FILE('package-lock.json'), TEXT('mode=live')]), 'the literal is not hashed');

  writeFileSync(join(root, 'package-lock.json'), '{"lockfileVersion":3}\n\n');
  assert.notEqual(a, of([FILE('package-lock.json'), TEXT('mode=design-only')]), 'content ignored');

  // An absent file and an empty file must differ: "not installed yet" and "installed nothing" are
  // different states, and a hash that conflated them would cache over the first.
  writeFileSync(join(root, 'empty.txt'), '');
  assert.notEqual(of([FILE('empty.txt')]), of([FILE('no-such-file.txt')]));
  assert.equal(ABSENT, '<absent>');
});

test('an untagged input is an error, not a guess', () => {
  // Untagged, `design-only` would be read as a path, found missing, and hashed as `<absent>` —
  // making live and design-only produce the same digest. Better to be unable to write the step.
  assert.throws(() => hashInputs(makeCheckout(), ['package-lock.json']), /no file:\/text: tag/);
});

test('a step whose inputs are unchanged is cached; changed, it runs', async () => {
  const root = makeCheckout();
  let ran = 0;
  const steps = [stub('B01', { inputs: () => [FILE('package-lock.json')],
    onRun: () => { ran += 1; return { status: 'ok' }; } })];
  const s = state();

  const lines = [];
  await run({ root, ctx: base(root), state: s, steps, onLine: (l) => lines.push(l) });
  assert.equal(ran, 1);
  assert.match(lines[0], /^\[B01\/01\] b01 … ok \(/);

  await run({ root, ctx: base(root), state: s, steps, onLine: (l) => lines.push(l) });
  assert.equal(ran, 1, 'an unchanged input must not re-run the step');
  assert.equal(lines[1], '[B01/01] b01 … ok (cached)');

  writeFileSync(join(root, 'package-lock.json'), 'changed\n');
  await run({ root, ctx: base(root), state: s, steps, onLine: (l) => lines.push(l) });
  assert.equal(ran, 2, 'a changed input must re-run the step');
});

test('a step recorded as failed is re-run even when its inputs match', async () => {
  const root = makeCheckout();
  let ran = 0;
  const steps = [stub('B01', { onRun: () => { ran += 1; return { status: 'ok' }; } })];
  const s = state();
  await run({ root, ctx: base(root), state: s, steps });
  s.steps.B01.status = 'failed';
  await run({ root, ctx: base(root), state: s, steps });
  assert.equal(ran, 2, 'only an `ok` may be cached');
});

test('runsWhen false prints the step\'s own reason and records skipped', async () => {
  const root = makeCheckout();
  const steps = [stub('B04', { title: 'deps', runsWhen: () => false, skipReason: 'design-only' })];
  const s = state();
  const lines = [];
  const r = await run({ root, ctx: base(root), state: s, steps, onLine: (l) => lines.push(l) });
  assert.equal(lines[0], '[B04/04] deps … skipped (design-only)');
  assert.equal(s.steps.B04.status, 'skipped');
  assert.equal(s.steps.B04.detail, 'design-only');
  assert.equal(r.summary.skipped, 1);
});

test('--from re-runs its step and everything after it, and caches what came before', async () => {
  const root = makeCheckout();
  const ran = [];
  const steps = ['B01', 'B02', 'B03'].map((id) =>
    stub(id, { onRun: () => { ran.push(id); return { status: 'ok' }; } }));
  const s = state();
  await run({ root, ctx: base(root), state: s, steps });
  assert.deepEqual(ran, ['B01', 'B02', 'B03'], 'precondition: the first run ran everything');

  ran.length = 0;
  const lines = [];
  await run({ root, ctx: base(root), state: s, steps, from: 'B02', onLine: (l) => lines.push(l) });
  assert.deepEqual(ran, ['B02', 'B03']);
  assert.match(lines[0], /ok \(cached\)/);
  assert.ok(!lines[1].includes('cached'));
});

test('a fail stops the run, writes the state, and prints cause, remedy and how to resume', async () => {
  const root = makeCheckout();
  const ran = [];
  const steps = [
    stub('B01', { onRun: () => { ran.push('B01'); return { status: 'ok' }; } }),
    stub('B02', { title: 'docs', result: { status: 'fail', detail: 'the corpus is empty',
      remedy: 'run ./snowarch docs sync' } }),
    stub('B03', { onRun: () => { ran.push('B03'); return { status: 'ok' }; } }),
  ];
  const s = state();
  const lines = [];
  let saved = 0;
  const r = await runSteps({ root, ctx: base(root), state: s, steps, hash: fakeHash,
    onLine: (l) => lines.push(l), save: () => { saved += 1; } });

  assert.equal(r.code, 1);
  assert.equal(r.stoppedAt, 'B02');
  assert.deepEqual(ran, ['B01'], 'a step after the failure must not run');
  assert.ok(saved > 0, 'the state must be written before the run gives up');
  assert.equal(lines[1], '[B02/03] docs … FAIL');
  assert.deepEqual(lines.slice(2, 5), [
    'FAIL B02: the corpus is empty',
    'Remedy: run ./snowarch docs sync',
    'Re-run ./bootstrap.sh to resume at B02.',
  ]);
});

test('a warn continues, and is counted as a warn rather than an ok', async () => {
  const root = makeCheckout();
  const steps = [
    stub('B01', { result: { status: 'warn', detail: 'a cloud-synced checkout' } }),
    stub('B02'),
  ];
  const s = state();
  const r = await run({ root, ctx: base(root), state: s, steps });
  assert.equal(r.code, 0);
  assert.equal(r.summary.warn, 1);
  assert.equal(s.steps.B01.status, 'warn');
  assert.equal(s.steps.B01.detail, 'a cloud-synced checkout');
});

test('every step records a duration, because ARC-09 reads it and no flag turns it on', async () => {
  const root = makeCheckout();
  const s = state();
  await run({ root, ctx: base(root), state: s, steps: [stub('B01')] });
  assert.equal(typeof s.steps.B01.durationMs, 'number');
  assert.ok(s.steps.B01.durationMs >= 0);
  assert.equal(humanDuration(48000), '48 s');
  assert.equal(humanDuration(400), '0.4 s', 'a sub-second step must not print as (0 s)');
  assert.equal(humanDuration(-1), null);
});

test('a step that throws becomes a fail, not a crash', async () => {
  const root = makeCheckout();
  const steps = [stub('B01', { onRun: () => { throw new Error('npm exploded'); } })];
  const s = state();
  const r = await run({ root, ctx: base(root), state: s, steps });
  assert.equal(r.code, 1);
  assert.equal(s.steps.B01.status, 'fail');
  assert.match(s.steps.B01.detail, /npm exploded/);
});

test('the step line is the conventions block, denominator derived from the list', () => {
  assert.equal(stepLine({ id: 'B02', title: 'docs', status: 'ok', durationMs: 48000, last: 'B09' }),
    '[B02/09] docs … ok (48 s)');
  assert.equal(stepLine({ id: 'B02', title: 'docs', status: 'cached', last: 'B09' }),
    '[B02/09] docs … ok (cached)');
  assert.equal(stepLine({ id: 'B06', title: 'instance', status: 'skipped', detail: 'design-only',
    last: 'B09' }), '[B06/09] instance … skipped (design-only)');
  assert.equal(stepLine({ id: 'B04', title: 'deps', status: 'fail', last: 'B09' }),
    '[B04/09] deps … FAIL');
  // A remedy nobody wrote must not print as an empty promise.
  assert.match(failureBlock({ id: 'B04', cause: 'x', remedy: null })[1], /none recorded/);
});

test('an interrupt ends the child, records the step as interrupted, and exits 130', async () => {
  const root = makeCheckout();
  const s = state();
  const live = { child: null, step: null };
  let child;
  const steps = [stub('B04', { onRun: async (ctx) => {
    child = ctx.spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' });
    // The step is still "running" while we interrupt it, which is the state this is about.
    assert.equal(live.child, child, 'the runner must publish the child it spawned');
    assert.ok(child.pid > 0);
    const r = interrupt({ root, state: s, live, save: () => {}, onLine: () => {} });
    assert.equal(r.code, 130);
    assert.equal(r.at, 'B04');
    await new Promise((res) => child.on('exit', res));
    return { status: 'ok' };
  } })];

  const r = await run({ root, ctx: base(root), state: s, steps, live });

  assert.equal(child.killed || child.exitCode !== null || child.signalCode !== null, true,
    'the child outlived the interrupt');
  // The step returned `ok` after being interrupted, as a body that ignores its dead child would.
  // The interrupted record is what survives — otherwise the resume reads "this step succeeded".
  assert.equal(s.steps.B04.status, 'failed');
  assert.equal(s.steps.B04.reason, 'interrupted');
  assert.equal(r.code, 130);
  assert.equal(r.stoppedAt, 'B04');
});

test('the interrupt message names the step to resume at, and the state says failed', () => {
  const s = state();
  s.steps.B04 = { status: 'ok' };
  const lines = [];
  const r = interrupt({ root: makeCheckout(), state: s, live: { child: null, step: 'B04' },
    save: () => {}, onLine: (l) => lines.push(l) });
  assert.equal(lines[0], 'interrupted during B04 — re-run ./bootstrap.sh to resume at B04');
  assert.equal(s.steps.B04.status, 'failed');
  assert.equal(s.steps.B04.reason, 'interrupted');
  assert.equal(r.code, 130);
});

test('the Windows kill is a tree kill — asserted without being on Windows', () => {
  // `child.kill()` on Windows is TerminateProcess on the DIRECT child, so npm's shim dies and the
  // node process doing the install carries on. The platform is a parameter and `spawn` is injected
  // precisely so this branch is provable from the machine that is not it.
  const calls = [];
  const fake = { pid: 4321, exitCode: null, signalCode: null, kill() { calls.push('kill'); } };
  const r = killTree(fake, { platform: 'win32', spawn: (cmd, args) => calls.push([cmd, ...args]) });
  assert.deepEqual(calls, [['taskkill', '/PID', '4321', '/T', '/F']]);
  assert.equal(r.how, 'taskkill');

  calls.length = 0;
  const posix = killTree(fake, { platform: 'linux', spawn: () => calls.push('spawned') });
  assert.deepEqual(calls, ['kill'], 'POSIX signals the child directly');
  assert.equal(posix.how, 'SIGINT');

  // An already-dead child is not signalled again.
  assert.equal(killTree({ pid: 1, exitCode: 0, signalCode: null }, { platform: 'linux' }), null);
});

test('the state is written after every step, not only at the end', async () => {
  const root = makeCheckout();
  const s = state();
  const steps = [stub('B01'), stub('B02', { result: { status: 'fail', detail: 'x' } })];
  await runSteps({ root, ctx: base(root), state: s, steps, hash: fakeHash });
  const onDisk = loadState(root);
  assert.equal(onDisk.steps.B01.status, 'ok', 'B01 must survive a later failure');
  assert.equal(onDisk.steps.B02.status, 'fail');
  assert.ok(existsSync(join(root, '.local', 'bootstrap-state.json')));
  assert.ok(readFileSync(join(root, '.local', 'bootstrap-state.json'), 'utf8').includes('"B01"'));
});
