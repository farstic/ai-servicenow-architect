// B01 workspace — the committed registration files. Body: ARC-06-S05.
import { FILE, TEXT } from './inputs.mjs';

export const id = 'B01';
export const title = 'workspace';
export const needsNode = false;
export const runsWhen = () => true;
export const inputs = (ctx) => [
  FILE('.mcp.json'),
  FILE('.claude/settings.json'),
  TEXT(`mode=${ctx.mode}`),
];
export const run = async () => ({ status: 'ok', detail: 'placeholder until ARC-06-S05' });
