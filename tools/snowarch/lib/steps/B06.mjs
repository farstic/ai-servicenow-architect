// B06 instance — the configuration wizard's slot. Body: ARC-06-S07, wizard: ARC-07-S05.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TEXT } from './inputs.mjs';

export const id = 'B06';
export const title = 'instance';
export const needsNode = true;
export const runsWhen = (ctx) => ctx.mode === 'live';
export const skipReason = 'design-only';

/**
 * The store's SHAPE, never its contents.
 *
 * `.local/instances.json` holds credentials. Its schema version and whether it exists are what
 * decide if this step has work to do; reading further would put a secret one careless line away
 * from the hash, the log and the state file. Presence and version, and nothing else.
 */
export function storeShape(root) {
  const p = join(root, '.local', 'instances.json');
  if (!existsSync(p)) return { present: false, version: null };
  try {
    const v = JSON.parse(readFileSync(p, 'utf8'))?.version;
    return { present: true, version: Number.isInteger(v) ? v : null };
  } catch {
    return { present: true, version: null };
  }
}

export const inputs = (ctx) => {
  const store = storeShape(ctx.root);
  return [
    TEXT(`storeVersion=${store.version ?? 'none'}`),
    TEXT(`storePresent=${store.present ? 'yes' : 'no'}`),
    TEXT(`instanceFile=${ctx.instanceFile ? 'yes' : 'no'}`),
  ];
};
export const run = async () => ({ status: 'ok', detail: 'placeholder until ARC-06-S07' });
