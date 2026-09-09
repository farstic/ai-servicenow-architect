import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DOCS, MODES, applyChoice, buildPlan, formatPlan, runPlanScreen } from '../lib/plan.mjs';
import { LIVE_YES_WITHOUT_FILE, USAGE, bootstrapCommand } from '../lib/bootstrap.mjs';
import { loadState, statePath } from '../lib/state.mjs';
import { commandArgs, makeCheckout, recorder } from './helpers/workspace.mjs';

const ctxOf = (root, { present = true } = {}) => ({
  root, env: {}, areaCount: 19,
  node: present ? { present: true, version: '22.11.0', major: 22 } : { present: false, version: null },
});

/** Answers fed to the screen in order, then end-of-input. */
const scripted = (answers) => {
  let i = 0;
  return { ask: async () => (i < answers.length ? answers[i++] : null), close: () => {} };
};
const sink = () => { const s = []; return { write: (x) => s.push(x), text: () => s.join('') }; };

test('the plan proposes the safe thing, and says what live would need', () => {
  const root = makeCheckout();
  const plan = buildPlan({ ctx: ctxOf(root), state: null, flags: {} });
  assert.equal(plan.mode, 'design-only');
  assert.equal(plan.docs, 'sparse');

  const text = formatPlan(plan, ctxOf(root));
  assert.match(text, /^Plan — Enter runs it as shown · type a number to change that line · q quits$/m);
  assert.match(text, /^ {2}1 {2}Mode {3}design-only/m);
  assert.match(text, /live needs a ServiceNow instance/);
  assert.match(text, /Node 22\.11\.0 found/);
  assert.match(text, /^ {2}2 {2}Docs {3}sparse \(19 areas\)/m);
  assert.match(text, /^ {2}Steps {2}B01 workspace · B02 docs · B05 contract · B07 toggles · B09 summary$/m);
});

test('with no Node the mode is fixed, and the line says how to add live later', () => {
  const root = makeCheckout();
  const ctx = ctxOf(root, { present: false });
  const plan = buildPlan({ ctx, state: null, flags: { mode: 'live' } });
  assert.equal(plan.mode, 'design-only', '--mode live cannot win against an absent Node');
  assert.match(formatPlan(plan, ctx), /design-only \(fixed — Node\.js 20\+ not found; add live mode later with \.\/snowarch mode live\)/);

  const after = applyChoice(plan, '1');
  assert.equal(after.plan.mode, 'design-only', 'the fixed line must not change');
  assert.match(after.message, /fixed at design-only/);
});

test('a recorded live mode is proposed again, so a configured checkout is not demoted', () => {
  const root = makeCheckout();
  assert.equal(buildPlan({ ctx: ctxOf(root), state: { mode: 'live' }, flags: {} }).mode, 'live');
  assert.equal(buildPlan({ ctx: ctxOf(root), state: { mode: 'live' }, flags: { mode: 'design' } }).mode,
    'design-only', 'an explicit flag still wins');
  assert.equal(buildPlan({ ctx: ctxOf(root), state: { docs: { mode: 'full' } }, flags: {} }).docs, 'full');
});

test('the parser: Enter runs, q quits, 1 and 2 cycle, anything else is refused by name', () => {
  const plan = buildPlan({ ctx: ctxOf(makeCheckout()), state: null, flags: {} });
  assert.equal(applyChoice(plan, '').action, 'run');
  assert.equal(applyChoice(plan, '   ').action, 'run');
  assert.equal(applyChoice(plan, 'q').action, 'quit');
  assert.equal(applyChoice(plan, 'Q').action, 'quit');
  assert.equal(applyChoice(plan, 'quit').action, 'quit');

  assert.equal(applyChoice(plan, '1').plan.mode, 'live');
  assert.equal(applyChoice(applyChoice(plan, '1').plan, '1').plan.mode, 'design-only', 'cycles back');
  assert.deepEqual(MODES, ['design-only', 'live']);

  let p = plan;
  const seen = [];
  for (let i = 0; i < 4; i += 1) { p = applyChoice(p, '2').plan; seen.push(p.docs); }
  assert.deepEqual(seen, ['full', 'skip', 'sparse', 'full']);
  assert.deepEqual(DOCS, ['sparse', 'full', 'skip']);

  const bad = applyChoice(plan, '9');
  assert.equal(bad.action, 'reprint');
  assert.match(bad.message, /"9" is not one of 1, 2, q or Enter\./);
});

test('choosing live rewrites the Steps line to include the three live steps', () => {
  const root = makeCheckout();
  const ctx = ctxOf(root);
  const plan = applyChoice(buildPlan({ ctx, state: null, flags: {} }), '1').plan;
  const steps = /^ {2}Steps {2}(.+)$/m.exec(formatPlan(plan, ctx))[1];
  for (const id of ['B04 deps', 'B06 instance', 'B08 verify']) {
    assert.ok(steps.includes(id), `${id} missing from: ${steps}`);
  }
  assert.ok(!steps.includes('B00'), 'preflight has already run by the time the plan is shown');
  assert.ok(!steps.includes('B03'), 'B03 records the answers; it is not a choice');
});

test('the screen re-prints after every change and only then runs', async () => {
  const root = makeCheckout();
  const ctx = ctxOf(root);
  const out = sink();
  const r = await runPlanScreen({ plan: buildPlan({ ctx, state: null, flags: {} }), ctx,
    ask: scripted(['1', '']).ask, write: out.write });
  assert.equal(r.action, 'run');
  assert.equal(r.plan.mode, 'live');
  assert.equal(out.text().split('Plan —').length - 1, 2, 'the screen must be shown again after a change');
});

test('--yes prints the plan with its provenance and asks nothing', async () => {
  const root = makeCheckout();
  const ctx = ctxOf(root);
  const out = sink();
  const r = await runPlanScreen({ plan: buildPlan({ ctx, state: null, flags: {} }), ctx,
    ask: () => { throw new Error('--yes must not read stdin'); }, write: out.write,
    accepted: '--yes' });
  assert.equal(r.action, 'run');
  assert.match(out.text(), /\(accepted: --yes\)/);
});

test('stdin closing is a quit, never an accept', async () => {
  const root = makeCheckout();
  const ctx = ctxOf(root);
  const r = await runPlanScreen({ plan: buildPlan({ ctx, state: null, flags: {} }), ctx,
    ask: scripted([]).ask, write: () => {} });
  assert.equal(r.action, 'quit', 'end-of-input must not install anything');
});

test('AC 2 — q exits 0 and leaves no .local/ at all', async () => {
  const root = makeCheckout();
  const log = recorder();
  const code = await bootstrapCommand({ ...commandArgs(root), log, asker: scripted(['q']),
    out: sink(), err: sink() });
  assert.equal(code, 0, log.lines.join('\n'));
  assert.equal(existsSync(join(root, '.local')), false, 'quitting must write nothing');
});

test('AC 7 — live with --yes and no instance file is a usage error that writes nothing', async () => {
  const root = makeCheckout();
  const log = recorder();
  const code = await bootstrapCommand({ ...commandArgs(root, { mode: 'live', yes: true }), log,
    out: sink(), err: sink() });
  assert.equal(code, 2);
  assert.ok(log.lines.includes(LIVE_YES_WITHOUT_FILE));
  assert.match(LIVE_YES_WITHOUT_FILE, /credentials cannot be typed non-interactively/);
  assert.equal(existsSync(join(root, '.local')), false, 'not even a log directory');
});

test('a bad --mode, --docs or --from is refused by name, and writes nothing', async () => {
  for (const flags of [{ mode: 'lively' }, { docs: 'some' }, { from: 'B42' }]) {
    const root = makeCheckout();
    const log = recorder();
    const code = await bootstrapCommand({ ...commandArgs(root, flags), log, asker: scripted([]),
      out: sink(), err: sink() });
    assert.equal(code, 2, `${JSON.stringify(flags)} should be a usage error`);
    assert.equal(existsSync(join(root, '.local')), false);
  }
  assert.match(USAGE, /--from BNN/);
});

test('AC 1 — a design-only run writes the state the other consumers read', async () => {
  const root = makeCheckout();
  const log = recorder();
  const code = await bootstrapCommand({ ...commandArgs(root, { mode: 'design', yes: true }), log,
    out: sink(), err: sink() });

  assert.equal(code, 0);
  const s = loadState(root);
  assert.equal(s.mode, 'design-only');
  assert.equal(s.steps.B09.status, 'ok');
  assert.equal(s.docs.mode, 'sparse', 'docsStatus() reads docs.mode');
  assert.equal(s.docs.pin, 'a'.repeat(40), 'and /snowarch status reads a pin');
  assert.equal(Object.keys(s.steps).length, 10, 'ten steps recorded');
  for (const id of ['B04', 'B06', 'B08']) assert.equal(s.steps[id].status, 'skipped');
  assert.equal(log.lines.filter((l) => /^\[B\d\d\/09\]/.test(l)).length, 10, 'ten step lines');

  // AC 8, on the file this run actually produced.
  const raw = readFileSync(statePath(root), 'utf8');
  for (const word of [`pass${'word'}`, `sec${'ret'}`, `to${'ken'}`, 'https://']) {
    assert.ok(!new RegExp(word, 'i').test(raw), `the state file contains "${word}"`);
  }
});

test('AC 1 — the second run caches and the summary counts it', async () => {
  const root = makeCheckout();
  const first = recorder();
  await bootstrapCommand({ ...commandArgs(root, { mode: 'design', yes: true }), log: first,
    out: sink(), err: sink() });
  const second = recorder();
  await bootstrapCommand({ ...commandArgs(root, { mode: 'design', yes: true }), log: second,
    out: sink(), err: sink() });

  const cached = second.lines.filter((l) => l.includes('ok (cached)')).map((l) => /\[(B\d\d)/.exec(l)[1]);
  for (const id of ['B01', 'B02', 'B05', 'B07']) {
    assert.ok(cached.includes(id), `${id} should have been cached: ${cached.join(' ')}`);
  }
  assert.ok(!cached.includes('B00'), 'preflight re-runs every time');
  assert.ok(!cached.includes('B09'), 'the summary describes this run, not the last one');
});

test('--json puts the object on stdout and every human line on stderr', async () => {
  const root = makeCheckout();
  const log = recorder();
  const out = sink(); const err = sink();
  await bootstrapCommand({ ...commandArgs(root, { mode: 'design', yes: true, json: true }), log, out, err });

  // The plan screen is prose: under --json it must not reach the stream carrying the object.
  assert.equal(out.text(), '', 'stdout was polluted by the plan screen');
  assert.match(err.text(), /Plan — Enter runs it/);

  const payload = JSON.parse(log.lines.at(-1));
  assert.deepEqual(Object.keys(payload), ['mode', 'docs', 'steps', 'summary', 'next']);
  assert.deepEqual(Object.keys(payload.summary), ['ok', 'warn', 'fail', 'skipped']);
  assert.equal(payload.summary.skipped, 3);
  assert.equal(payload.summary.fail, 0);
  assert.match(payload.next, /design-only/);
});

test('AC 6 — --reset clears the state and leaves the store byte-identical', async () => {
  const root = makeCheckout();
  await bootstrapCommand({ ...commandArgs(root, { mode: 'design', yes: true }), log: recorder(),
    out: sink(), err: sink() });
  const store = join(root, '.local', 'instances.json');
  writeFileSync(store, '{"version":1,"instances":[]}\n');
  const before = readFileSync(store);
  writeFileSync(join(root, '.local', 'doctor-last.json'), '{}\n');

  const log = recorder();
  const code = await bootstrapCommand({ ...commandArgs(root, { reset: true }), log, out: sink(), err: sink() });

  assert.equal(code, 0);
  assert.equal(existsSync(statePath(root)), false);
  assert.equal(existsSync(join(root, '.local', 'doctor-last.json')), false);
  assert.deepEqual(readFileSync(store), before);
  assert.ok(log.lines.some((l) => l.includes('instances.json and .local/config.json untouched')));
});

test('a state file from a newer snowarch stops the run with the upgrade sentence', async () => {
  const root = makeCheckout();
  await bootstrapCommand({ ...commandArgs(root, { mode: 'design', yes: true }), log: recorder(),
    out: sink(), err: sink() });
  const s = JSON.parse(readFileSync(statePath(root), 'utf8'));
  writeFileSync(statePath(root), JSON.stringify({ ...s, version: 99 }));

  const log = recorder();
  const code = await bootstrapCommand({ ...commandArgs(root, { mode: 'design', yes: true }), log,
    out: sink(), err: sink() });
  assert.equal(code, 1);
  assert.ok(log.lines.includes('state file is from a newer snowarch — run ./snowarch upgrade'));
});
