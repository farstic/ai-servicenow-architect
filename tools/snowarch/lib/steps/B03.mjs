// B03 mode — records the answers the plan screen collected. Body: ARC-06-S07.
import { TEXT } from './inputs.mjs';

export const id = 'B03';
export const title = 'mode';
export const needsNode = false;
export const runsWhen = () => true;
export const inputs = (ctx) => [TEXT(`mode=${ctx.mode}`)];
export const run = async () => ({ status: 'ok', detail: 'placeholder until ARC-06-S07' });
