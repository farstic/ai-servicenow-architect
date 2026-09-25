/**
 * ARC-09-C61 — which release tag a user page may name, and why there are two answers.
 *
 * ONE IMPLEMENTATION, because there are two callers and they must not drift: the real-tree guard in
 * `tests/install-page.test.mjs`, and the release fixture in `tests/release.test.mjs` which drives the
 * same question at the shape a release commit has. The first version of this lived inline in the
 * guard, and the release commit is the shape it had not been asked about.
 *
 * THE RELEASE COMMIT IS A SHAPE THE GUARD PASSES THROUGH. `writeInstallTag` writes `--branch v2.0.4`
 * to the pages during the release, and the v2.0.4 tag does not exist yet — `--tag-only` creates it
 * AFTER the post-write suite. So "the page names the newest tag that exists" is false there by
 * construction, and the v2.0.4 cut was refused by this guard before any tag was made.
 *
 * A tree whose own version is FINAL and newer than every tag IS the release being cut, so its page
 * must name it. A `-dev` or prerelease tree naming a version ahead of every tag is a hand-edited
 * page — the defect this guard exists for — and stays refused.
 */

/** `v2.0.3` → `[2, 0, 3]`; accepts a bare version too. */
const parts = (v) => String(v).replace(/^v/, '').split('.').map(Number);

/** Is `a` strictly older than `b`? Numeric per field, never a string comparison (ARC-09-S12). */
export function olderThan(a, b) {
  const [x, y] = [parts(a), parts(b)];
  return ((x[0] - y[0]) || (x[1] - y[1]) || (x[2] - y[2])) < 0;
}

/** The final release tags in a clone, newest first. Prereleases are not releases. */
export const finalTags = (all) => [...all]
  .map((t) => String(t).trim())
  .filter((t) => /^v\d+\.\d+\.\d+$/.test(t))
  .sort((a, b) => (olderThan(a, b) ? 1 : -1));

/**
 * The tags a page may name on this tree, or `null` when there is nothing to compare against.
 *
 * `null` is the deferral: a clone with no release tags — a shallow CI checkout, a fresh fixture —
 * has no newest release, and a guard that passed there silently would never fire where it matters.
 */
export function allowedCloneTags({ tags, treeVersion }) {
  const sorted = finalTags(tags);
  if (sorted.length === 0) return null;
  const newest = sorted[0];
  const isFinal = /^\d+\.\d+\.\d+$/.test(String(treeVersion));
  return isFinal && olderThan(newest, treeVersion)
    ? [newest, `v${treeVersion}`]
    : [newest];
}

/** Every release tag a page tells a reader to clone. */
export const cloneTagsIn = (text) =>
  [...new Set([...String(text).matchAll(/git clone --branch (v\d+\.\d+\.\d+)/g)].map((m) => m[1]))];
