// B03 mode — write down the answer the plan screen already collected.
//
// No prompt of its own, deliberately: principle 10 says the installation asks once, and a step that
// re-asked "are you sure about live?" would be the second question. What it does is make the
// decision DURABLE — into the state the doctor reads and into `.local/config.json` the launchers
// read — and, by being an input to B06, B07 and B08, make a changed mode re-run exactly the steps
// that depend on it.
import { TEXT } from './inputs.mjs';
import { writeConfig } from './B07.mjs';

export const id = 'B03';
export const title = 'mode';
export const needsNode = false;
export const runsWhen = () => true;
export const inputs = (ctx) => [TEXT(`mode=${ctx.mode}`)];

export const run = async (ctx) => {
  ctx.state.mode = ctx.mode;
  // The same writer B07 uses. A second one here would be a second opinion about what v1 looks
  // like, and the two would part company the first time a field was added.
  writeConfig(ctx.root, {
    mode: ctx.mode,
    registration: ctx.state.registration ?? 'project',
    ...(ctx.readLabel ? { readLabel: ctx.readLabel } : {}),
  });
  return { status: 'ok', detail: ctx.mode, data: { mode: ctx.mode } };
};
