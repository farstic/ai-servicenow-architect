import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { COLUMNS, DOCS, EXPLANATIONS, HEADER, LINES, MODES, ORIENTATION, applyChoice, buildPlan,
  explainLines, formatPlan, resolveChoice, runPlanScreen }
  from '../lib/plan.mjs';
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
    /^Plan — Enter runs it as shown · type a number to choose that line's value · "\?" explains · q quits$/m);
  assert.equal(/to toggle that line/.test(text), false,
    'the header still says a number toggles — ARC-07-C12 made it a choice');
  assert.match(text, /^ {2}1 {2}Mode {3}design-only/m);
  assert.match(text, /live needs a ServiceNow instance/);
  assert.match(text, /Node 22\.11\.0 found/);
  assert.match(text, /^ {2}2 {2}Docs {3}sparse \(19 areas\)/m);
  // A LITERAL, AND IT STAYS ONE. Deriving this from `plannedSteps` would make it agree with itself
  // whatever the titles say — the ARC-07-C23 trap, where an assertion derived on both sides could
  // not see a step move. This is the one place the five titles are written out, so a retitle shows
  // up here and nowhere else has to be hunted for.
  assert.match(text,
    /^ {2}Steps {2}B01 workspace · B02 docs · B05 tool list · B07 Claude settings · B09 summary$/m);
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

  // ARC-07-C12 — A NUMBER NO LONGER CYCLES; it OPENS that line's question. This asserted the toggle
  // the owner read as a choice three screens running, so it asserts the new contract: the parser
  // hands back the line, changes nothing itself, and the caller asks the question because the parser
  // has no io.
  const opened = applyChoice(plan, '1');
  assert.equal(opened.action, 'choose');
  assert.equal(opened.line.label, 'Mode');
  assert.deepEqual(opened.line.values, MODES);
  assert.equal(opened.plan.mode, plan.mode, 'the parser changed a value while opening a line');
  assert.deepEqual(MODES, ['design-only', 'live']);

  const openedDocs = applyChoice(plan, '2');
  assert.equal(openedDocs.action, 'choose');
  assert.deepEqual(openedDocs.line.values, DOCS);
  assert.equal(openedDocs.plan.docs, plan.docs);
  assert.deepEqual(DOCS, ['sparse', 'full', 'skip']);

  // ...and the answer is resolved by number or by name, the wizard's two spellings.
  assert.equal(resolveChoice(opened.line, '2'), 'live');
  assert.equal(resolveChoice(opened.line, 'live'), 'live');
  assert.equal(resolveChoice(opened.line, ''), null, 'Enter must mean leave it, not run');
  assert.equal(resolveChoice(opened.line, 'nope'), undefined, 'an unknown answer is not a value');

  const bad = applyChoice(plan, '9');
  assert.equal(bad.action, 'reprint');
  // ARC-07-C11 added `?`, and the refusal lists what is accepted — so it has to list that too,
  // or the one key a confused user is most likely to try is the one the error omits.
  assert.match(bad.message, /"9" is not one of 1, 2, \?, q or Enter\./);
});

test('choosing live rewrites the Steps line to include the three live steps', () => {
  const root = makeCheckout();
  const ctx = ctxOf(root);
  // ARC-07-C12 — set through the line's own setter, since `applyChoice` now opens rather than sets.
  const base = buildPlan({ ctx, state: null, flags: {} });
  const plan = LINES[1].set(base, 'live');
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
  // ARC-07-C12 — `['1', '2', '']`: open Mode, choose live, run. It was `['1', '']` when a number
  // flipped the value.
  const r = await runPlanScreen({ plan: buildPlan({ ctx, state: null, flags: {} }), ctx,
    ask: scripted(['1', '2', '']).ask, write: out.write });
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
  // ARC-07-C12 — the sequence is now `1` to open Mode and `2` to choose live; the PROPERTY this case
  // asserts is unchanged, which is why it keeps its name. What changed is how a value is set, not
  // that a change is acknowledged.
  const r = await runPlanScreen({ plan: buildPlan({ ctx, state: null, flags: {} }), ctx,
    ask: scripted(['1', '2', '']).ask, write: out.write });
  assert.equal(r.action, 'run');
  assert.equal(r.plan.mode, 'live');

  // WHAT CHANGED, in the plan's own words for that line — `Mode`, and the value it now shows.
  assert.match(out.text(), /Mode → live/,
    `the redraw does not say what the press changed:\n${out.text()}`);
  // ...AND WHAT ENTER DOES NOW, which is the second question and the one that cost fourteen presses.
  assert.match(out.text(), /Enter runs it/,
    'the acknowledgement does not say what Enter does now');
  assert.match(out.text(), /1 changes it again/,
    'the acknowledgement does not say how to change the line again');

  // NOT a bare prompt after a toggle — and the property is that the acknowledgement IMMEDIATELY
  // PRECEDES the prompt, not that `> ` is absent: `> ` is where the cursor waits and always follows.
  // My first cut asserted its absence and failed against a correct fix, which is the right way round
  // for a mistake in an assertion to go.
  assert.match(out.text(), /Mode → live · Enter runs it · 1 changes it again · q quits\n> $/,
    `the prompt the user faces after a press is not the acknowledgement:\n${JSON.stringify(out.text().slice(-120))}`);
});

test('ARC-07-C11 — pressing it twice acknowledges each press, with the value it lands on', async () => {
  // The owner's actual sequence was the same key repeated. Two presses return Mode to where it
  // started, and a screen that said nothing would look identical after both — which is exactly how
  // fourteen presses happen.
  const root = makeCheckout();
  const ctx = ctxOf(root);
  const out = sink();
  // ARC-07-C12 — two CHOICES now: open Mode and pick live, then open it again and pick design-only.
  // Under the toggle this was `['1','1','']`, and that sequence is exactly what the owner typed
  // while expecting to be asked something.
  const r = await runPlanScreen({ plan: buildPlan({ ctx, state: null, flags: {} }), ctx,
    ask: scripted(['1', '2', '1', '1', '']).ask, write: out.write });
  assert.equal(r.action, 'run');
  assert.equal(r.plan.mode, 'design-only', 'the second choice did not take');

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

// ─── ARC-07-C12 — the plan asks the way the wizard asks ────────────────────────────────────────
//
// THIRD OCCURRENCE, THREE DIFFERENT SCREENS. The owner met this at S06 on v2.0.2 ("change that
// line", seven presses of `1`), on develop after ARC-07-C10 reworded it to "toggle" (fourteen
// presses), and on **v2.0.4 with the whole ARC-07-C11 redesign rendering exactly as built** — the
// header offering `"?"`, the five explanations printing, and `Mode → live · Enter runs it · 1 toggles
// back · q quits` appearing after the press. Their words the third time: *"I press 1 and get the
// message again, I choose 1 again and nothing happens."*
//
// So it is not the wording, and it is not the acknowledgement. **`1` is being read as a CHOICE**, and
// ours was a toggle: "I choose 1" is what the owner wrote, twice, about a key that flipped a value.
//
// THE COUNTER-MEASUREMENT IS THE EVIDENCE, and it is on the same run: the wizard's own numbered
// questions — `What is this instance?  [1] pdi  [2] dev  [3] test  [4] prod` and
// `Authentication?  [1] basic  [2] oauth_ropc` — were answered first time, on both dry runs, with no
// confusion at all. The pattern this user reads correctly already exists one screen later. So the
// plan adopts it rather than explaining itself a fourth time.
//
// `?` stays, Enter-runs stays. What goes is a number silently flipping a value.

test('ARC-07-C12 — a number opens that line\'s choices, the way the wizard asks', async (t) => {
  const root = makeCheckout();
  const ctx = ctxOf(root);
  const out = sink();
  // `1` opens Mode; `2` picks live from ITS list; Enter runs.
  const r = await runPlanScreen({ plan: buildPlan({ ctx, state: null, flags: {} }), ctx,
    ask: scripted(['1', '2', '']).ask, write: out.write });

  assert.equal(r.action, 'run');
  assert.equal(r.plan.mode, 'live', 'choosing [2] from Mode\'s list did not set live');

  // THE ASSERTION THAT DISTINGUISHES THE TWO MODELS, and the first cut of this case did not have it:
  // under a toggle, `1` flips Mode and `2` flips DOCS, so `['1','2','']` reaches `mode: live` either
  // way and the case passed against the behaviour it was written to replace. Under choices the `2`
  // answers Mode's question, so Docs is untouched — which only the new model can produce.
  assert.equal(r.plan.docs, 'sparse',
    'Docs moved — the `2` was read as a second line rather than as Mode\'s answer');

  // THE WIZARD'S SHAPE, asserted as a shape rather than a sentence: the label, then numbered options.
  assert.match(out.text(), /Mode:\s+\[1\] design-only[^\n]*\[2\] live/,
    `the number did not open Mode's choices:\n${out.text()}`);
  // EACH OPTION'S MEANING BESIDE IT, per the owner's ruling: the question is the moment the meaning
  // is wanted, and a reader who has opened the line should not have to go back out to `?` for it.
  assert.match(out.text(), /\[2\] live — configures one/, 'the options carry no meaning beside them');
  assert.match(out.text(), /\(current\)/, 'the current value is not marked');
});

test('ARC-07-C12 — the owner\'s sequence: a number is a choice, not a flip', async (t) => {
  // THE EXACT SEQUENCE, and the property that makes the model right. Under a toggle, `1 1 1` lands
  // on live (odd number of flips) and the user who "chose 1" three times gets a value they never
  // named. Under choices, `1` opens Mode and `1` picks design-only — so choosing option 1 twice
  // leaves design-only both times, which is what "nothing happens" SHOULD mean when you keep
  // choosing the same thing.
  const root = makeCheckout();
  const ctx = ctxOf(root);
  const out = sink();
  const r = await runPlanScreen({ plan: buildPlan({ ctx, state: null, flags: {} }), ctx,
    ask: scripted(['1', '1', '1', '1', '']).ask, write: out.write });

  assert.equal(r.action, 'run');
  assert.equal(r.plan.mode, 'design-only',
    'choosing [1] design-only twice did not leave design-only — the number is still a flip');
  // AND THE SEQUENCE HAS TO BE READ AS CHOICES, not merely end in the same place: four flips also
  // land on design-only, so without this the case would pass against the toggle it replaces.
  assert.equal((out.text().match(/Mode:\s+\[1\] design-only/g) ?? []).length, 2,
    'Mode\'s choices were not opened twice — the two odd-numbered answers were read as flips');
});

test('ARC-07-C12 — the option can be typed by name too, as the wizard allows', async (t) => {
  const root = makeCheckout();
  const ctx = ctxOf(root);
  const out = sink();
  const r = await runPlanScreen({ plan: buildPlan({ ctx, state: null, flags: {} }), ctx,
    ask: scripted(['1', 'live', '']).ask, write: out.write });
  assert.equal(r.plan.mode, 'live', 'the value spelled out was not accepted');
  // Distinguishing again: under a toggle `live` is an unrecognised answer and the mode reached live
  // from the `1` alone, so the shape is what proves the name was read as an answer.
  assert.match(out.text(), /Mode:\s+\[1\] design-only/, 'the choices were never offered');
  assert.doesNotMatch(out.text(), /"live" is not one of/, '`live` was refused rather than accepted');
});

test('ARC-07-C12 — Enter at a line\'s choices keeps the value and returns to the plan', async (t) => {
  // Enter runs the PLAN, and only at the plan's own prompt. At a line's choices it must mean "leave
  // this as it is" — otherwise opening a line by mistake would start the install.
  const root = makeCheckout();
  const ctx = ctxOf(root);
  const out = sink();
  const r = await runPlanScreen({ plan: buildPlan({ ctx, state: null, flags: {} }), ctx,
    ask: scripted(['1', '', '']).ask, write: out.write });

  assert.equal(r.action, 'run', 'the run did not start from the plan prompt afterwards');
  assert.equal(r.plan.mode, 'design-only', 'Enter at the choices changed the value');
  assert.ok(out.text().split('Plan —').length - 1 >= 2, 'the plan was not shown again after the choices');
});

test('ARC-07-C12 — `?` and Enter-runs are unchanged', async (t) => {
  // The two things ARC-07-C11 added that this row keeps. A redesign that quietly dropped them would
  // be the third screen all over again.
  const root = makeCheckout();
  const ctx = ctxOf(root);
  const out = sink();
  await runPlanScreen({ plan: buildPlan({ ctx, state: null, flags: {} }), ctx,
    ask: scripted(['?', 'q']).ask, write: out.write });
  assert.match(out.text(), /"\?" explains/);
  assert.match(out.text(), /Mode — /, '`?` no longer explains the lines');

  const out2 = sink();
  const r = await runPlanScreen({ plan: buildPlan({ ctx, state: null, flags: {} }), ctx,
    ask: scripted(['']).ask, write: out2.write });
  assert.equal(r.action, 'run', 'Enter at the plan prompt no longer runs it');
});

test('ARC-07-C12 — `?` then a choice, which is the sitting\'s own sequence', async (t) => {
  // The owner pressed `1`, then `?`, then `1`, then Enter. `?` must not lose the screen's place, and
  // a choice after it must still take.
  const root = makeCheckout();
  const ctx = ctxOf(root);
  const out = sink();
  const r = await runPlanScreen({ plan: buildPlan({ ctx, state: null, flags: {} }), ctx,
    ask: scripted(['?', '1', '2', '']).ask, write: out.write });

  assert.equal(r.action, 'run');
  assert.equal(r.plan.mode, 'live', 'a choice made after `?` did not take');
  assert.match(out.text(), /Mode — /, '`?` no longer explains the lines');
  assert.match(out.text(), /Mode:\s+\[1\] design-only/, 'the choice after `?` never opened the line');
});

test('ARC-07-C12 — --yes still asks nothing at all', async (t) => {
  // The path a CI run and a scripted install take. A redesign of the interactive screen must not
  // reach it: `accepted` returns before the loop, and `ask` throwing is how that is proven.
  const root = makeCheckout();
  const ctx = ctxOf(root);
  const out = sink();
  const r = await runPlanScreen({ plan: buildPlan({ ctx, state: null, flags: {} }), ctx,
    ask: () => { throw new Error('--yes must not read stdin'); }, write: out.write,
    accepted: '--yes' });

  assert.equal(r.action, 'run');
  assert.match(out.text(), /\(accepted: --yes\)/);
  assert.equal(/Mode:\s+\[1\]/.test(out.text()), false, 'a line\'s choices were printed on the --yes path');
});

test('ARC-07-C12 — stdin closing at a line\'s choices is a quit, never an accept', async (t) => {
  // The same rule the plan prompt already has, at the new prompt. An install must not start because
  // input ended.
  const root = makeCheckout();
  const ctx = ctxOf(root);
  const out = sink();
  const r = await runPlanScreen({ plan: buildPlan({ ctx, state: null, flags: {} }), ctx,
    ask: scripted(['1']).ask, write: out.write });
  assert.equal(r.action, 'quit', 'end of input at the choices was treated as a yes');
});

test('ARC-07-C12 — an answer that is not an option says so, and the plan comes back', async (t) => {
  const root = makeCheckout();
  const ctx = ctxOf(root);
  const out = sink();
  const r = await runPlanScreen({ plan: buildPlan({ ctx, state: null, flags: {} }), ctx,
    ask: scripted(['1', 'nope', '']).ask, write: out.write });

  assert.equal(r.action, 'run');
  assert.equal(r.plan.mode, 'design-only', 'an unrecognised answer changed the value');
  assert.match(out.text(), /"nope" is not one of \[1\] design-only\s+\[2\] live/,
    `the refusal does not list the options: ${out.text().slice(-200)}`);
});


/**
 * ARC-07-W13 — the screen says what is being installed and how long it takes, before any option.
 *
 * It opened on `Plan — Enter runs it as shown …`: what the KEYS do, and nothing about what is being
 * decided or whether the reader is going to be sitting there. Both facts were in the code already.
 */
test('ARC-07-W13 — the two orientation lines come first, in order, above the header', () => {
  const root = makeCheckout();
  const ctx = ctxOf(root);
  const lines = formatPlan(buildPlan({ ctx }), ctx).split('\n');

  // ORDER AND POSITION, not mere presence: a reader gets the scope before the clock before the keys,
  // and a block that renders them under the option rows would satisfy an `includes` and read wrong.
  assert.deepEqual(lines.slice(0, 2), [...ORIENTATION], 'the screen does not open with the two lines');
  assert.equal(lines[2], HEADER, 'the header is no longer the third line');

  // THE CLAIM EACH ONE MAKES, named, so a rewrite that drops the load-bearing half is caught. "this
  // folder only" is the promise the whole design rests on — B07 is the one step that could falsify
  // it, and it writes Claude Code's settings per-checkout, which is why the sentence is true.
  assert.match(lines[0], /this folder only/);
  assert.match(lines[0], /nothing else on the machine changes/);
  assert.match(lines[1], /about a minute/);
  assert.match(lines[1], /live adds a short wizard/);
});

test('ARC-07-W13 — every line of the screen, and of `?`, is inside the column budget', () => {
  // The budget caught my own work twice in this row: the second orientation line as ruled was 103
  // columns, and the `this folder` explanation was 101. Both were trimmed by removing a phrase the
  // screen already prints elsewhere rather than by cutting the fact.
  const root = makeCheckout();
  const ctx = ctxOf(root);
  for (const line of [...ORIENTATION, HEADER, ...explainLines()]) {
    assert.ok(line.length <= COLUMNS, `${line.length} > ${COLUMNS}: ${line}`);
  }
  // ...and the Steps line, which the retitle lengthened.
  const steps = formatPlan(buildPlan({ ctx }), ctx).split('\n').find((l) => l.startsWith('  Steps'));
  assert.ok(steps.length <= COLUMNS, `${steps.length} > ${COLUMNS}: ${steps}`);
});

test('ARC-07-W13 — `?` explains the lines the screen grew, because it claims to explain the screen', () => {
  // The header offers `"?" explains`. A screen that gained two lines and left them unexplained makes
  // that offer false — so the two new claims get an entry each: where the writes land, and where the
  // minute goes. Keyed by the words the orientation lines use, not by new vocabulary.
  const keys = EXPLANATIONS.map(([label]) => label);
  assert.ok(keys.includes('this folder'), '`this folder` is claimed above and explained nowhere');
  assert.ok(keys.includes('the minute'), '`the minute` is claimed above and explained nowhere');
  const text = explainLines().join('\n');
  assert.match(text, /lands in this checkout/);
  assert.match(text, /fetching the documentation corpus/);
});

test('ARC-07-W13 — the two retitled steps say what they do, and their ids are untouched', () => {
  // ONE TITLE PER STEP, TWO READERS: the plan screen's Steps line and the runner's `[B05/09] … ok`.
  // `contract` and `toggles` are this repository's words for them; `tool list` and `Claude settings`
  // are what a first-time reader can act on. Changing the shared constant changes BOTH surfaces,
  // which is the right answer — a second title for the plan screen would be two names for one step,
  // the defect this programme keeps closing.
  const root = makeCheckout();
  const ctx = ctxOf(root);
  const steps = formatPlan(buildPlan({ ctx }), ctx).split('\n').find((l) => l.startsWith('  Steps'));
  assert.match(steps, /B05 tool list/);
  assert.match(steps, /B07 Claude settings/);
  // The ids are the contract with every other surface — the cache, the state file, the doctor's
  // step check, nine `[Bnn/09]` lines — and this row does not touch them.
  for (const id of ['B01', 'B02', 'B05', 'B07', 'B09']) assert.match(steps, new RegExp(`${id} `));
  assert.doesNotMatch(steps, /contract|toggles/, 'the old titles are still on the screen');
});
