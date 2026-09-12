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
