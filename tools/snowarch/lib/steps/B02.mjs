// B02 docs — the corpus checkout and its citations. Body: ARC-06-S06.
import { execFileSync } from 'node:child_process';
import { CORPUS_DIR } from '../docs/sync.mjs';
import { FILE, TEXT, ABSENT } from './inputs.mjs';

export const id = 'B02';
export const title = 'docs';
export const needsNode = false;
export const runsWhen = (ctx) => ctx.docs !== 'skip';
export const skipReason = '--docs skip';

/**
 * The gitlink, not the corpus.
 *
 * Hashing the checkout itself would mean reading 35,000 files to decide whether to skip a step, and
 * would make an unrelated `touch` invalidate it. The gitlink is the one value that changes exactly
 * when the corpus is supposed to be different — and it is read from the INDEX, so a checkout that
 * has moved without the superproject knowing still hashes as the superproject sees it.
 */
export function gitlink(root) {
  try {
    const out = execFileSync('git', ['ls-tree', 'HEAD', CORPUS_DIR],
      { cwd: root, encoding: 'utf8', stdio: 'pipe' });
    const m = /^160000 commit ([0-9a-f]{40})/.exec(out.trim());
    return m ? m[1] : ABSENT;
  } catch {
    // No git, no repository, no submodule entry — all of them mean "nothing to compare against"
    // rather than a failure. B02's own body decides what to do about it; this only has to hash.
    return ABSENT;
  }
}

export const inputs = (ctx) => [
  FILE(ctx.config.docs.areasFile),
  TEXT(`gitlink=${gitlink(ctx.root)}`),
  TEXT(`docs=${ctx.docs}`),
];
export const run = async () => ({ status: 'ok', detail: 'placeholder until ARC-06-S06' });
