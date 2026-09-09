// B04 deps — `npm ci` for the server. Body: ARC-06-S07.
import { FILE, TEXT } from './inputs.mjs';

export const id = 'B04';
export const title = 'deps';
export const needsNode = true;
/**
 * `SNOWARCH_TEST_FORCE_DEPS` is read here and nowhere else in the product.
 *
 * Acceptance criteria 3 and 4 are about the interrupt and the lockfile, not about ServiceNow — but
 * both need a step that runs long enough to interrupt and has a file to change. Forcing this one
 * step on lets those criteria run in design mode on the ordinary CI matrix, with no instance and no
 * credentials anywhere near them. It changes `runsWhen` and nothing else.
 */
export const runsWhen = (ctx) => ctx.mode === 'live' || ctx.env.SNOWARCH_TEST_FORCE_DEPS === '1';
export const skipReason = 'design-only';
export const inputs = (ctx) => [
  FILE('package-lock.json'),
  // The MAJOR only: a patch bump of Node does not change what `npm ci` installs, and hashing the
  // full version would re-run this step on every machine that happens to be one patch ahead.
  TEXT(`node=${ctx.node.major ?? 'none'}`),
];
export const run = async () => ({ status: 'ok', detail: 'placeholder until ARC-06-S07' });
