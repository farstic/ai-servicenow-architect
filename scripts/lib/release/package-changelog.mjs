// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C206 — the server package's changelog at the cut: `packages/snowarch/CHANGELOG.md`.
 *
 * The 2.2.1 cut changed `packages/snowarch/src` and left this file with no 2.2.1 section. Its Unreleased held only
 * the carried C119 "Known gap" paragraph, and the bump wrote the section afterwards (#491). The root CHANGELOG has a
 * writer at the cut (`changelog.mjs`); this file had none, and nothing asked.
 *
 * THE FILE'S SHAPE, as every section from 2.0.0 on has it: paragraphs, each opening with a bold sentence. One kind
 * is not an entry: "**Known gap, raised not closed: …**" states a problem still open, so it stays under Unreleased
 * from cut to cut until a release closes it, and a released section never holds it.
 */
export const PACKAGE_CHANGELOG = 'packages/snowarch/CHANGELOG.md';

/** `## Unreleased`, with the `(x.y.z-dev)` a bump writes beside it. */
const UNRELEASED = /^## Unreleased(?: \([^)\n]*\))?[ \t]*$/m;

/** A paragraph that states an open problem rather than a change. */
const isKnownGap = (paragraph) => /^\*\*Known gap\b/.test(paragraph);

/** `{ head, body, tail }` around the Unreleased block, or `null` with no heading. */
function unreleased(text) {
  const heading = UNRELEASED.exec(text);
  if (!heading) return null;
  const after = text.slice(heading.index + heading[0].length);
  const next = /^## /m.exec(after);
  return {
    head: text.slice(0, heading.index),
    body: next ? after.slice(0, next.index) : after,
    tail: next ? after.slice(next.index) : '',
  };
}

/** The Unreleased block's paragraphs, split into the open gaps and what was written. */
function entries(body) {
  const paragraphs = body.split(/\n[ \t]*\n/).map((p) => p.trim()).filter(Boolean);
  return { gaps: paragraphs.filter(isKnownGap), written: paragraphs.filter((p) => !isKnownGap(p)) };
}

/**
 * `{ ok, text, changed }` — at a final, the Unreleased block becomes `## <version> — <date>`, holding what was
 * written, and a new `## Unreleased` above it carries the open Known-gap paragraphs. With nothing written there is
 * no section to cut, and the text is returned unchanged. A section that already exists is refused, as the root
 * writer refuses one.
 */
export function writePackageChangelog(text, version, date) {
  if (new RegExp(`^## ${version.replace(/\./g, '\\.')}[ \t]`, 'm').test(text)) {
    return { ok: false, message: `${PACKAGE_CHANGELOG}: section ${version} already exists` };
  }
  const block = unreleased(text);
  if (!block) return { ok: false, message: `${PACKAGE_CHANGELOG}: no "## Unreleased" heading` };
  const { gaps, written } = entries(block.body);
  if (written.length === 0) return { ok: true, text, changed: false };
  const carried = gaps.length > 0 ? `${gaps.join('\n\n')}\n\n` : '';
  return {
    ok: true,
    changed: true,
    text: `${block.head}## Unreleased\n\n${carried}## ${version} — ${date}\n\n${written.join('\n\n')}\n\n${block.tail}`,
  };
}

/**
 * The cut's refusal, or `null`: a final whose package source changed since the previous final, `since`, while this
 * file says nothing about it — no section for the version (the `--tag-only` pass comes back after the writer cut one)
 * and nothing written under Unreleased. A release that did not touch the server has nothing to say about it.
 */
export function packageChangelogRefusal({ text, version, since, srcChanged }) {
  if (!srcChanged) return null;
  if (new RegExp(`^## ${version.replace(/\./g, '\\.')}[ \t]`, 'm').test(text)) return null;
  const block = unreleased(text);
  if (block && entries(block.body).written.length > 0) return null;
  return `release: packages/snowarch/src changed since ${since}, and ${PACKAGE_CHANGELOG} has no ${version} section `
    + 'and nothing written under Unreleased (its Known-gap paragraphs are carried, not written) — say what changed '
    + 'for the server package under its Unreleased first; nothing was written';
}
