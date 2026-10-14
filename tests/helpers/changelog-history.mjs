// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * Where `docs/CHANGELOG.md` stops being a live document and starts being history.
 *
 * ARC-09-C17. Every sweep that scans this file needs the same answer, and two of them had their own
 * — both spelled `## Before 2.0.0`, the frozen region ARC-09-S02 created. That was right until a
 * release: the release moves the hand-written Unreleased block down into a NEW `## <version>`
 * section, which sits ABOVE the frozen heading. Sentences that were tolerated under `## Unreleased`
 * — a historical note naming a path that has since moved, say — were suddenly in a released section
 * and reported as live references. Rehearsal run 4 failed on exactly that, on the release commit's
 * own pull request.
 *
 * THE RULE: everything from the newest `## <version>` heading downwards is history. A released
 * section is a record of what was said at the time, exactly like the frozen region, and rewriting
 * one would falsify it. `## Unreleased` and everything above the first release heading is live.
 *
 * A file with no release section at all (only `## Unreleased`) has no history: the answer is
 * `Infinity`, so every line is live, which is the correct reading of a changelog that has never
 * released anything.
 */

/** The index of the first line that is history, or `Infinity` when none of it is. */
export function historyStartsAt(text) {
  const lines = Array.isArray(text) ? text : text.split('\n');
  const at = lines.findIndex((l) => /^## (\d|Before )/.test(l));
  return at === -1 ? Infinity : at;
}

/** Is this 0-based line index inside the history region? */
export const isHistory = (text, index) => index >= historyStartsAt(text);

/** The line `scripts/lib/release/changelog.mjs` writes for one commit, conventional or not. */
const GENERATED_ENTRY = /^- .+ \([0-9a-f]{7}\)( \(unconventional\))?$/;

/**
 * The text with each release section's generated `### Internal` entries blanked, and every other line
 * as it was.
 *
 * ARC-07-C43, the architect's ruling of 2026-10-12, after the rc.3 cut. A release writes every commit
 * since the last final into the new section, and a `test:`, `docs:`, `ci:` or `chore:` subject lands in
 * its `### Internal` group: a commit log, not a page. A sweep that keeps a name out of the pages reads
 * the rest. A line is blanked only when it is under an `### Internal` heading AND in the generator's
 * exact shape, because the older sections carry hand-written Internal entries, in prose or with a pull
 * request number beside the sha, and those are pages like the Notes. A hand-written line typed in exactly
 * the generator's shape would read as generated; none is written that way.
 *
 * Blanked rather than removed, so a caller's line numbers still match the file.
 */
export function withoutGeneratedInternal(text) {
  let internal = false;
  return text.split('\n').map((line) => {
    if (/^#{1,6} /.test(line)) {
      internal = /^### Internal[ \t]*$/.test(line);
      return line;
    }
    return internal && GENERATED_ENTRY.test(line) ? '' : line;
  }).join('\n');
}
