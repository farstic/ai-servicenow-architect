// ARC-06-S03 — the one amendable plan screen (principle 10).
//
// The whole installation is uninterrupted except here. That is the point: an installer that asks
// eleven questions is an installer nobody finishes, and one that asks none is one that surprises
// people. So everything that will be decided is shown ONCE, before anything is written, and can be
// changed from this screen.
//
// "Before anything is written" is load-bearing and is why this module writes through an injected
// function rather than the logger: the logger creates `.local/logs/` on its first line, and
// acceptance criterion 2 says quitting here leaves no `.local/` at all.
import { MODE } from './docs/sync.mjs';
import { plannedSteps } from './steps/index.mjs';
import { redact } from './redact.mjs';

export const MODES = Object.freeze(['design-only', 'live']);
/**
 * The docs choices, and only ONE of the three is spelled here.
 *
 * `sparse` and `full` are ARC-03's vocabulary — they name the two shapes a checkout can have, and
 * `MODE` is where that is decided. Retyping them would be a second declaration of a word the docs
 * library already owns, and the contract-literals guard says so out loud: `full` is also a preset
 * name, so a literal here is indistinguishable from a preset typed into a wizard. `skip` is the one
 * genuinely local value: it is not a checkout shape, it is this command declining to make one.
 */
export const DOCS = Object.freeze([MODE.sparse, MODE.full, 'skip']);

export const HEADER =
  // ARC-07-C10 (S06 sitting) — "change" read as "open a sub-prompt for that line": the owner
  // pressed 1 seven times waiting to be asked something, and each press silently TOGGLED Mode and
  // redrew the plan. The verb is the whole of the fix; the behaviour was right.
  'Plan — Enter runs it as shown · type a number to toggle that line · "?" explains · q quits';

/**
 * What each line and each key is for (ARC-07-C11) — the owner's ruling, and the pattern is the
 * preset editor's.
 *
 * "Everything very easy and understandable; there can even be information for each option so the
 * user knows what it is instead of wondering." The measurement behind it: fourteen presses of `1`.
 * `preset-ui.ts` already answers the same question one screen over — its footer offers
 * `"?" explains the flags` and it prints a line per flag — so this mirrors that rather than
 * inventing a second convention for "tell me what this is".
 *
 * The KEYS are explained too, which the header cannot carry: a header long enough to say what
 * Enter, a number and q each do is a header nobody finishes reading.
 */
export const EXPLANATIONS = Object.freeze([
  // SHORT ENOUGH NOT TO WRAP, because the engine has no wrapper and should not grow one for this:
  // `preset-ui.ts` wraps at 100 columns but lives in the server package, which this must not depend
  // on, and the doctor's renderer already ruled that "a wrapped remedy that starts mid-line is the
  // part people stop reading". The plan line above each entry already shows the VALUES, so these
  // say what the option is for and stop. `explainLines` asserts the budget; the test asserts it too.
  //
  // "skips ServiceNow" rather than the phrase ARC-08-C7 reserves for the unconfigured STATE: this
  // explains what a mode IS, and borrowing that sentence would put a second answer to "no instance
  // configured" in the tree. Plainer for a first-time reader too, which is what this row is for.
  ['Mode', 'design-only skips ServiceNow; live also configures an instance and needs Node.js 20+.'],
  ['Docs', 'how much of the documentation corpus to fetch — sparse, full, or skip it for now.'],
  ['Enter', 'runs the plan exactly as shown above. Nothing is written before that.'],
  ['a number', 'moves that line to its next value and redraws. It asks nothing further.'],
  ['q', 'quits without writing anything.'],
]);

/** The budget every other line on this screen is written to. */
export const COLUMNS = 100;

/** The explanation block, one row per entry, in the plan's own label column. */
export const explainLines = () => EXPLANATIONS.map(([label, text]) => `  ${label} — ${text}`);

/**
 * What to say after a press (ARC-07-C11).
 *
 * The header alone was not enough: the owner pressed `1` seven times against "change that line" and
 * fourteen times against "toggle that line", asking why it kept asking again. Both times the plan
 * was redrawn and followed by a bare `> `, which answers neither question a person has after a
 * keystroke — *did that do anything*, and *what does Enter do now*.
 *
 * So the prompt answers both, at the only moment they are asked. The label and the value are the
 * plan's OWN for that line (`modeValue`/`docsValue`), because a second vocabulary for the thing
 * on screen would be a third way to describe one fact.
 */
export const ackLine = ({ label, to, key }) =>
  `${label} → ${to} · Enter runs it · ${key} toggles back · q quits`;

/**
 * The plan, before any of it is applied.
 *
 * Mode proposes `design-only` (principle 1: the safe thing is the default) unless the operator
 * asked otherwise or a previous run already recorded `live` — someone who has configured an
 * instance should not be offered the beginner's path every time.
 */
export function buildPlan({ ctx, state = null, flags = {} }) {
  const nodeFixed = !ctx.node.present;
  const asked = flags.mode === 'live' ? 'live' : (flags.mode === 'design' ? 'design-only' : null);
  const recorded = state?.mode === 'live' ? 'live' : null;
  return {
    mode: nodeFixed ? 'design-only' : (asked ?? recorded ?? 'design-only'),
    docs: DOCS.includes(flags.docs) ? flags.docs : (state?.docs?.mode ?? 'sparse'),
    nodeFixed,
    nodeVersion: ctx.node.version,
    areas: ctx.areaCount,
  };
}

const modeHint = (plan) => (plan.nodeFixed
  ? ''
  : 'live needs a ServiceNow instance (wizard runs in this terminal); '
    + `Node ${plan.nodeVersion} found`);

const modeValue = (plan) => (plan.nodeFixed
  ? 'design-only (fixed — Node.js 20+ not found; add live mode later with ./snowarch mode live)'
  : plan.mode);

const docsValue = (plan) => (plan.docs === 'sparse' ? `sparse (${plan.areas} areas)` : plan.docs);

/** The screen. `accepted` is the `(accepted: --yes)` suffix, present only on the non-interactive path. */
export function formatPlan(plan, ctx, { accepted = null } = {}) {
  const steps = plannedSteps({ ...ctx, mode: plan.mode, docs: plan.docs })
    .map((s) => `${s.id} ${s.title}`).join(' · ');
  const pad = (s, w) => s.padEnd(w);
  return [
    `${HEADER}${accepted ? `  (accepted: ${accepted})` : ''}`,
    `  1  Mode   ${pad(modeValue(plan), 20)} ${modeHint(plan)}`.trimEnd(),
    `  2  Docs   ${pad(docsValue(plan), 20)} `
      + 'full = whole corpus · skip = none (the doctor will report FAIL)',
    `  Steps  ${steps}`,
  ].join('\n');
}

/**
 * One keystroke's worth of decision.
 *
 * Returns the next plan and what the caller should do, rather than acting: a parser that printed
 * and exited could only be tested through a terminal, and the interactive path is the one part of
 * this story a test cannot drive end to end.
 */
export function applyChoice(plan, input) {
  const answer = String(input ?? '').trim().toLowerCase();
  if (answer === '') return { plan, action: 'run' };
  if (answer === 'q' || answer === 'quit') return { plan, action: 'quit' };
  // ARC-07-C11 — a QUESTION, not a choice: it changes nothing and the screen comes back.
  if (answer === '?' || answer === 'help') return { plan, action: 'reprint', help: true };

  if (answer === '1') {
    if (plan.nodeFixed) {
      return { plan, action: 'reprint',
        message: 'Mode is fixed at design-only until Node.js 20+ is installed.' };
    }
    const next = MODES[(MODES.indexOf(plan.mode) + 1) % MODES.length];
    const after = { ...plan, mode: next };
    return { plan: after, action: 'reprint', changed: { key: '1', label: 'Mode', to: modeValue(after) } };
  }
  if (answer === '2') {
    const next = DOCS[(DOCS.indexOf(plan.docs) + 1) % DOCS.length];
    const after = { ...plan, docs: next };
    return { plan: after, action: 'reprint', changed: { key: '2', label: 'Docs', to: docsValue(after) } };
  }
  return { plan, action: 'reprint',
    message: `"${answer}" is not one of 1, 2, ?, q or Enter.` };
}

/**
 * Drive the screen against a line source.
 *
 * `ask` is injected — `node:readline` in production, an array of answers in the tests. The screen
 * is the only interactive moment in the installation, and an interactive moment that can only be
 * exercised by a human is one that breaks silently.
 */
export async function runPlanScreen({ plan, ctx, ask, write, accepted = null }) {
  let current = plan;
  if (accepted) {
    write(`${formatPlan(current, ctx, { accepted })}\n`);
    return { plan: current, action: 'run' };
  }
  // ARC-07-C11 — the prompt carries the last press's acknowledgement, or nothing on the first draw
  // because nothing has happened yet. A redraw that says nothing is indistinguishable from a prompt
  // that did nothing, which is how one keystroke came to be pressed fourteen times.
  let ack = null;
  for (;;) {
    write(`${formatPlan(current, ctx)}\n${ack ? `${ack}\n` : ''}> `);
    const answer = await ask();
    if (answer === null) return { plan: current, action: 'quit' };   // stdin closed: not a yes
    const next = applyChoice(current, answer);
    current = next.plan;
    if (next.action !== 'reprint') return { plan: current, action: next.action };
    if (next.help) write(`${explainLines().join('\n')}\n`);
    ack = next.changed ? ackLine(next.changed) : null;
    if (next.message) write(`${redact(next.message)}\n`);
  }
}
