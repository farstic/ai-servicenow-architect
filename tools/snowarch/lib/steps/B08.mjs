// B08 verify — the MCP stdio handshake and the live probes. Body: ARC-06-S08.
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { contractSha } from '../config.mjs';
import { TEXT } from './inputs.mjs';

export const id = 'B08';
export const title = 'verify';
export const needsNode = true;
export const runsWhen = (ctx) => ctx.mode === 'live';
export const skipReason = 'design-only';

/**
 * The store's mtime — deliberately, and it is worth saying why the obvious objection is fine.
 *
 * A `touch` re-runs the verification, which costs a handshake and proves the same thing again. A
 * wizard run that CHANGED an instance and did not re-verify would be the other kind of wrong, and
 * that is the one to avoid.
 */
export function storeMtime(root) {
  const p = join(root, '.local', 'instances.json');
  return existsSync(p) ? String(statSync(p).mtimeMs) : 'none';
}

export const inputs = (ctx) => [
  TEXT(`contract=${contractSha(ctx.root) ?? 'not-built'}`),
  TEXT(`storeMtime=${storeMtime(ctx.root)}`),
  // The MODE, because a design → live → design round trip can leave the other two unchanged while
  // the recorded `ok` describes a verification of a different installation. ARC-06-S07's story says
  // a mode change invalidates B06, B07 and B08; for the first two that already fell out of their
  // inputs, and this is the line that makes it true of the third.
  TEXT(`mode=${ctx.mode}`),
];
export const run = async () => ({ status: 'ok', detail: 'placeholder until ARC-06-S08' });
