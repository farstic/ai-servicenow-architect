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
  'Plan — Enter runs it as shown · type a number to change that line · q quits';

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

  if (answer === '1') {
    if (plan.nodeFixed) {
      return { plan, action: 'reprint',
        message: 'Mode is fixed at design-only until Node.js 20+ is installed.' };
    }
    const next = MODES[(MODES.indexOf(plan.mode) + 1) % MODES.length];
    return { plan: { ...plan, mode: next }, action: 'reprint' };
  }
  if (answer === '2') {
    const next = DOCS[(DOCS.indexOf(plan.docs) + 1) % DOCS.length];
    return { plan: { ...plan, docs: next }, action: 'reprint' };
  }
  return { plan, action: 'reprint',
    message: `"${answer}" is not one of 1, 2, q or Enter.` };
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
  for (;;) {
    write(`${formatPlan(current, ctx)}\n> `);
    const answer = await ask();
    if (answer === null) return { plan: current, action: 'quit' };   // stdin closed: not a yes
    const next = applyChoice(current, answer);
    current = next.plan;
    if (next.action !== 'reprint') return { plan: current, action: next.action };
    if (next.message) write(`${redact(next.message)}\n`);
  }
}
