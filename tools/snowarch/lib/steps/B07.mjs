// B07 toggles — `settings.local.json`, merged and never overwritten. Body: ARC-06-S05.
import { TEXT } from './inputs.mjs';

export const id = 'B07';
export const title = 'toggles';
export const needsNode = false;
export const runsWhen = () => true;
export const inputs = (ctx) => [
  TEXT(`mode=${ctx.mode}`),
  TEXT(`node=${ctx.node.present ? 'yes' : 'no'}`),
  // The S-05 branch (whether a hook survives with Node absent) and the registration kind are both
  // decided by ARC-06-S05's writer. Until then they come from the state, so a change of either
  // re-runs this step rather than being masked by a hash that never saw them.
  TEXT(`hooks=${ctx.state.hooksDisabledByBootstrap ? 'disabled' : 'default'}`),
  TEXT(`registration=${ctx.state.registration}`),
];
export const run = async () => ({ status: 'ok', detail: 'placeholder until ARC-06-S05' });
