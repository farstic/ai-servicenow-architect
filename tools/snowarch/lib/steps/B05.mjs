// B05 contract — the built contract matches what the engine pinned. Body: ARC-06-S07.
import { FILE } from './inputs.mjs';

export const id = 'B05';
export const title = 'contract';
export const needsNode = true;
export const runsWhen = (ctx) => ctx.node.present;
export const skipReason = 'Node.js 20+ not found';
export const inputs = () => [
  FILE('packages/snowarch/dist/contract.json'),
  FILE('packages/contract/required-tools.json'),
];
export const run = async () => ({ status: 'ok', detail: 'placeholder until ARC-06-S07' });
