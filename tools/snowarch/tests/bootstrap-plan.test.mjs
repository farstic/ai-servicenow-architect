import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DOCS, MODES, applyChoice, buildPlan, formatPlan, runPlanScreen } from '../lib/plan.mjs';
import { LIVE_YES_WITHOUT_FILE, USAGE, bootstrapCommand,
  liveYesNeedsInstanceFile } from '../lib/bootstrap.mjs';
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
  // ARC-07-C10 — "toggle", not "change": at the S06 sitting the owner pressed 1 seven times
  // expecting a sub-prompt, while each press flipped Mode and redrew the plan.
  // ARC-07-C11 added `"?" explains` to this header. The C10 wording guard stays — "change" was
  // the reading that cost seven presses — and the offer is asserted because an explanation the
  // screen never mentions is not available on demand.
  assert.match(text,
    /^Plan — Enter runs it as shown · type a number to toggle that line · "\?" explains · q quits$/m);
  assert.equal(/to change that line/.test(text), false,
    'the header says "change", which reads as a sub-prompt the plan never opens');
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
  // ARC-07-C11 added `?`, and the refusal lists what is accepted — so it has to list that too,
  // or the one key a confused user is most likely to try is the one the error omits.
  assert.match(bad.message, /"9" is not one of 1, 2, \?, q or Enter\./);
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
  assert.equal(s.docs.mode, 'skip', 'the accepted plan\'s docs mode reaches the state');
  assert.ok('mode' in s.docs, 'docsStatus() reads docs.mode — the PATH is the claim here');
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
  // B02 is `--docs skip` in this fixture (no upstream to clone from), so it is skipped rather than
  // cached; `b02-docs.test.mjs` proves its caching against the fixture corpus.
  for (const id of ['B01', 'B05', 'B07']) {
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
  assert.equal(payload.summary.skipped, 4, 'B04, B06, B08 for design-only and B02 for --docs skip');
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

/**
 * ARC-06-C16 — the refusal is about an EMPTY store, and said so in only one of the two places.
 *
 * The owner's rc.5 → rc.6 upgrade, with `pdi` already in the store:
 *
 *   [U6/7] bootstrap (only the steps whose inputs changed)
 *   error: live mode with --yes needs --instance-file <path>: credentials cannot be typed
 *          non-interactively (see docs/INSTALL.md "Operators and CI")
 *
 * `upgrade` runs `bootstrap --mode live --yes`, so every live user upgrading hit this, and the
 * remedy it prints — re-run the upgrade — hits it again. No B0x line was printed: it refused at
 * argument validation, so B04, B05 and B08 never ran and the tree sat at the new tag with the old
 * `node_modules`.
 *
 * `mode.mjs` had the right condition all along — `&& !hasStore` — and its comment says the
 * SENTENCE was "imported rather than repeated: there is one reason this combination cannot work
 * and it should not have two phrasings". The sentence was shared and the condition was not.
 * `liveYesNeedsInstanceFile` is now the one statement, and both callers ask it.
 */
test('ARC-06-C16 — live --yes is allowed when the store already holds an instance', async () => {
  const root = makeCheckout();
  mkdirSync(join(root, '.local'), { recursive: true });
  writeFileSync(join(root, '.local', 'instances.json'), JSON.stringify({
    version: 1, defaultInstance: 'pdi', instances: { pdi: { environment: 'pdi', preset: 'custom' } },
  }));

  const log = recorder();
  const code = await bootstrapCommand({ ...commandArgs(root, { mode: 'live', yes: true }), log,
    out: sink(), err: sink() });

  assert.notEqual(code, 2, 'the upgrade path is still refused at argument validation');
  assert.equal(log.lines.includes(LIVE_YES_WITHOUT_FILE), false,
    'the empty-store sentence was printed for a store that is not empty');
});

test('ARC-06-C16 — the predicate is one rule, and both callers get the same answer', () => {
  // The two callers each wrote their own condition and disagreed on exactly the case that
  // mattered. This asserts the rule itself over the whole space, so a third caller cannot invent
  // a fourth reading of it.
  for (const hasStore of [true, false]) {
    for (const yes of [true, false]) {
      for (const instanceFile of [undefined, '/tmp/i.json']) {
        const expected = yes === true && !instanceFile && !hasStore;
        assert.equal(liveYesNeedsInstanceFile({ mode: 'live', yes, instanceFile, hasStore }),
          expected, `live yes=${yes} file=${!!instanceFile} store=${hasStore}`);
        // design-only never needs the file, whatever else is true.
        assert.equal(liveYesNeedsInstanceFile({ mode: 'design', yes, instanceFile, hasStore }),
          false);
      }
    }
  }
});

// ─── ARC-07-C11 — a redraw that says nothing reads as a prompt that did nothing ────────────────
//
// TWICE IN ONE SITTING, with two different headers, which is what makes this the prompt's fault and
// not the wording's. At the S06 sitting the owner pressed `1` seven times while the header read
// "type a number to change that line"; ARC-07-C10 reworded it to "toggle"; on the same clone with
// the new wording they pressed `1` FOURTEEN times and asked "why does it ask me again when I press
// 1".
//
// The behaviour was right both times. What the screen gave back was a full redraw and a bare `> `,
// which answers neither question a person has after pressing a key: *did that do anything*, and
// *what does Enter do now*. A numbered list invites the model "the number is my choice"; this one is
// "the number flips a line and Enter runs it", and nothing on screen said so at the moment it
// mattered — the moment after a press.
//
// The fix is one line of acknowledgement, and the row it replaces is the evidence that rewording the
// header was not enough: my own C10 change is the failed first attempt.

test('ARC-07-C11 — a toggle is acknowledged: what changed, and what Enter does now', async () => {
  const root = makeCheckout();
  const ctx = ctxOf(root);
  const out = sink();
  const r = await runPlanScreen({ plan: buildPlan({ ctx, state: null, flags: {} }), ctx,
    ask: scripted(['1', '']).ask, write: out.write });
  assert.equal(r.action, 'run');
  assert.equal(r.plan.mode, 'live');

  // WHAT CHANGED, in the plan's own words for that line — `Mode`, and the value it now shows.
  assert.match(out.text(), /Mode → live/,
    `the redraw does not say what the press changed:\n${out.text()}`);
  // ...AND WHAT ENTER DOES NOW, which is the second question and the one that cost fourteen presses.
  assert.match(out.text(), /Enter runs it/,
    'the acknowledgement does not say what Enter does now');
  assert.match(out.text(), /1 toggles back/,
    'the acknowledgement does not say how to undo the press just made');

  // NOT a bare prompt after a toggle — and the property is that the acknowledgement IMMEDIATELY
  // PRECEDES the prompt, not that `> ` is absent: `> ` is where the cursor waits and always follows.
  // My first cut asserted its absence and failed against a correct fix, which is the right way round
  // for a mistake in an assertion to go.
  assert.match(out.text(), /Mode → live · Enter runs it · 1 toggles back · q quits\n> $/,
    `the prompt the user faces after a press is not the acknowledgement:\n${JSON.stringify(out.text().slice(-120))}`);
});

test('ARC-07-C11 — pressing it twice acknowledges each press, with the value it lands on', async () => {
  // The owner's actual sequence was the same key repeated. Two presses return Mode to where it
  // started, and a screen that said nothing would look identical after both — which is exactly how
  // fourteen presses happen.
  const root = makeCheckout();
  const ctx = ctxOf(root);
  const out = sink();
  const r = await runPlanScreen({ plan: buildPlan({ ctx, state: null, flags: {} }), ctx,
    ask: scripted(['1', '1', '']).ask, write: out.write });
  assert.equal(r.action, 'run');
  assert.equal(r.plan.mode, 'design-only', 'two presses did not return Mode to where it started');

  assert.equal((out.text().match(/Mode → live/g) ?? []).length, 1,
    'the first press was not acknowledged exactly once');
  assert.equal((out.text().match(/Mode → design-only/g) ?? []).length, 1,
    'the second press was not acknowledged with the value it landed on');
});

test('ARC-07-C11 — the first draw has no acknowledgement, because nothing has happened', async () => {
  // Both directions. An acknowledgement on the first screen would be a claim about a press nobody
  // made, which is the same class of untruth as the silence it replaces.
  const root = makeCheckout();
  const ctx = ctxOf(root);
  const out = sink();
  await runPlanScreen({ plan: buildPlan({ ctx, state: null, flags: {} }), ctx,
    ask: scripted(['q']).ask, write: out.write });
  assert.equal(/Mode →/.test(out.text()), false,
    'the first draw claims a change nobody made');
  assert.equal(/toggles back/.test(out.text()), false,
    'the first draw offers to undo a press that did not happen');
});

test('ARC-07-C11 — "?" explains each line and what the keys do, like the preset screen', async (t) => {
  // THE OWNER'S RULING, not an inference from the presses: "everything very easy and understandable;
  // there can even be information for each option so the user knows what it is instead of
  // wondering". The pattern already exists one screen over — the preset editor's footer offers
  // `"?" explains the flags` and prints a line per flag — so this mirrors it rather than inventing a
  // second convention for the same question.
  const root = makeCheckout();
  const ctx = ctxOf(root);
  const out = sink();
  await runPlanScreen({ plan: buildPlan({ ctx, state: null, flags: {} }), ctx,
    ask: scripted(['?', 'q']).ask, write: out.write });

  // OFFERED on the screen, because an explanation nobody is told about is not available on demand.
  assert.match(out.text(), /"\?" explains/,
    `the plan never offers the explanation:\n${out.text()}`);

  // A line per toggleable option, named as the plan names it.
  for (const label of ['Mode', 'Docs']) {
    assert.match(out.text(), new RegExp(`${label} — `),
      `"?" does not explain ${label}`);
  }
  // ...and what the three keys do, which is the half the header could not carry.
  assert.match(out.text(), /Enter — /, '"?" does not say what Enter does');
  assert.match(out.text(), /q — /, '"?" does not say what q does');

  // It EXPLAINS rather than acting: the plan is unchanged and the screen comes back.
  assert.equal(/Mode →/.test(out.text()), false, '"?" toggled something');
  assert.ok(out.text().split('Plan —').length - 1 >= 2, 'the screen was not redrawn after "?"');

  // WITHIN THE BUDGET every other line here is written to. The engine has no wrapper — the one in
  // `preset-ui.ts` belongs to the server package, which this must not depend on — so the only thing
  // keeping these readable is their length, and the doctor's renderer already ruled that a line
  // folding mid-word is the part people stop reading. Asserted rather than trusted, because prose
  // grows.
  const { COLUMNS, explainLines } = await import('../lib/plan.mjs');
  for (const line of explainLines()) {
    assert.ok(line.length <= COLUMNS,
      `an explanation is ${line.length} columns, over the ${COLUMNS} budget: ${line}`);
  }
});
