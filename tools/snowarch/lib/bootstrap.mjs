// ARC-06-S03 — the `bootstrap` sub-command: build the context, show the plan, run the steps.
//
// The command itself decides very little. It assembles the context every step reads, gets the plan
// accepted, and hands the list to the runner; the resume semantics live in `steps/index.mjs`, the
// schema in `state.mjs`, the wording in `steps/format.mjs`. Keeping this thin is what lets
// ARC-06-S04…S09 land one step at a time without any of them touching the command.
import { createInterface } from 'node:readline';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXIT_FAIL, EXIT_OK, EXIT_USAGE } from './exit.mjs';
import { loadConfig, root as defaultRoot, version } from './config.mjs';
import { DOCS, buildPlan, runPlanScreen } from './plan.mjs';
import { LAST, STEPS, interrupt, runSteps, stepById } from './steps/index.mjs';
import { RESET_MESSAGE, StateError, emptyState, loadState, resetState, saveState } from './state.mjs';

export const USAGE = [
  'usage: ./snowarch bootstrap [options]',
  '',
  '  --mode design|live        what to install for (default: design-only)',
  `  --docs ${DOCS.join('|')}   how much of the documentation corpus to check out`,
  '  --yes                     accept the plan without showing the prompt',
  '  --from BNN                re-run from this step, caching the ones before it',
  '  --reset                   clear the bootstrap state and start over',
  '  --instance-file <path>    read live-mode connection details from a file, once',
  '  --skip-claude-check       do not check the Claude Code version floor',
  '  --json                    print the summary object on stdout',
].join('\n');

/** The sentence for the one combination that cannot work. Exported so the test cannot paraphrase it. */
export const LIVE_YES_WITHOUT_FILE =
  'live mode with --yes needs --instance-file <path>: credentials cannot be typed '
  + 'non-interactively (see docs/INSTALL.md "Operators and CI")';

const nodeInfo = () => {
  const v = process.versions.node;
  return { present: true, version: v, major: Number(v.split('.')[0]) };
};

const countAreas = (root, config) => {
  const p = join(root, config.docs.areasFile);
  if (!existsSync(p)) return 0;
  return readFileSync(p, 'utf8').split('\n').filter((l) => l.trim() !== '').length;
};

/** One line from stdin, or `null` at end of input. */
const stdinAsker = (input, output) => {
  const rl = createInterface({ input, output, terminal: false });
  const it = rl[Symbol.asyncIterator]();
  return {
    ask: async () => { const { value, done } = await it.next(); return done ? null : value; },
    close: () => rl.close(),
  };
};

export async function bootstrapCommand({ flags, log, root = defaultRoot, argv = [],
  input = process.stdin, out = process.stdout, err = process.stderr, env = process.env,
  asker = null } = {}) {
  // With `--json`, stdout carries ONE thing: the object. The plan screen is prose, so it follows
  // every other human line to stderr — a caller piping this into `jq` must not have to strip a
  // banner first. (`--json` with no `--yes` still shows the screen and still waits: the operator is
  // there, it is their terminal, and only the machine-readable channel changes.)
  const humanOut = flags.json ? err : out;
  const config = loadConfig(root);

  // A refusal before the plan is accepted leaves the checkout exactly as it found it — including
  // the log. Criterion 7 says this combination "writes nothing", and a `.local/logs/` directory
  // conjured by the error message is still something.
  const refuse = (message, code = EXIT_USAGE) => { log.fail(message); log.discard(); return code; };

  if (flags.mode !== undefined && flags.mode !== 'design' && flags.mode !== 'live') {
    return refuse(`--mode must be design or live, not "${flags.mode}"`);
  }
  if (flags.docs !== undefined && !DOCS.includes(flags.docs)) {
    return refuse(`--docs must be ${DOCS.join(', ')}, not "${flags.docs}"`);
  }
  if (flags.from !== undefined && !stepById(String(flags.from).toUpperCase())) {
    return refuse(`--from must name a step (${STEPS.map((s) => s.id).join(', ')}), not "${flags.from}"`);
  }
  // Checked BEFORE the state is loaded or anything is written: the story requires that this
  // combination writes nothing at all, and a usage error discovered halfway through a run has
  // already broken that promise.
  if (flags.mode === 'live' && flags.yes && !flags['instance-file']) {
    return refuse(LIVE_YES_WITHOUT_FILE);
  }

  if (flags.reset) {
    resetState(root);
    log.step(RESET_MESSAGE);
    return EXIT_OK;
  }

  let state;
  try { state = loadState(root); } catch (e) {
    if (!(e instanceof StateError)) throw e;
    return refuse(e.message, e.code);
  }

  const node = nodeInfo();
  const ctx = {
    root, config, env, node,
    areaCount: countAreas(root, config),
    instanceFile: flags['instance-file'] ?? null,
    skipClaudeCheck: Boolean(flags['skip-claude-check']),
    // Filled in from the accepted plan below. Present here so a step reading `ctx.mode` before the
    // plan is accepted gets `null` rather than a silently wrong default.
    mode: null, docs: null,
    state: state ?? emptyState({ engineVersion: version(root), node }),
  };

  const plan = buildPlan({ ctx, state, flags });
  const io = asker ?? stdinAsker(input, humanOut);
  let accepted;
  try {
    accepted = await runPlanScreen({
      plan, ctx, ask: io.ask, write: (s) => humanOut.write(s),
      accepted: flags.yes ? '--yes' : null,
    });
  } finally {
    if (io.close) io.close();
  }
  if (accepted.action === 'quit') {
    log.discard();                       // nothing was accepted, so nothing is written — not even a log
    return EXIT_OK;
  }
  log.commit();

  // The plan's answers become the state's, here. B03 will own this once ARC-06-S07 gives it a body;
  // until then the decision still has to reach the file, because acceptance criterion 1 reads it
  // back and every step's `runsWhen` is asked about it.
  const runState = state ?? emptyState({ engineVersion: version(root), node });
  runState.mode = accepted.plan.mode;
  runState.docs = { mode: accepted.plan.docs, pin: config.docs.pin };
  runState.node = node;
  ctx.mode = accepted.plan.mode;
  ctx.docs = accepted.plan.docs;
  ctx.state = runState;

  const lines = [];
  const onLine = (line) => { lines.push(line); log.step(line); };

  // Shared with the runner so the handler can reach the child of the step that is mid-flight.
  const live = { child: null, step: null };
  const onSigint = () => {
    const r = interrupt({ root, state: runState, live, onLine });
    process.exit(r.code);
  };
  process.on('SIGINT', onSigint);
  let outcome;
  try {
    outcome = await runSteps({ root, ctx, state: runState, live, from: flags.from
      ? String(flags.from).toUpperCase() : null, onLine });
  } finally {
    process.off('SIGINT', onSigint);
  }
  saveState(root, runState);

  if (flags.json) {
    log.json({
      mode: runState.mode,
      docs: runState.docs,
      steps: runState.steps,
      summary: { ok: outcome.summary.ok, warn: outcome.summary.warn,
        fail: outcome.summary.fail, skipped: outcome.summary.skipped },
      next: nextText(outcome, runState),
    });
  } else {
    log.step(nextText(outcome, runState));
  }
  return outcome.code === EXIT_OK ? EXIT_OK : EXIT_FAIL;
}

/** What to do now. ARC-06-S09 replaces this with B09's own text, dialog budget and all. */
export function nextText(outcome, state) {
  if (outcome.stoppedAt) {
    return `stopped at ${outcome.stoppedAt} — fix the cause above and re-run ./bootstrap.sh`;
  }
  return state.mode === 'live'
    ? `bootstrap complete (${LAST}) — run /snowarch status in Claude Code to confirm the instance`
    : `bootstrap complete (${LAST}) — design-only; add an instance later with ./snowarch mode live`;
}
