// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-11-C6, the owner's ruling from the rc.3 sitting (2026-10-13): "the user must not learn how to have a working
 * Architect without a licence". What says how, as patterns, defined once for every reader that enforces the ruling:
 * `tests/no-way-back.test.mjs` over the shipped files and the pages, and the release's `notes` gate over the section
 * it is about to cut. A subject or a page that one of them refuses is refused by both.
 *
 * PRECISE patterns hold for every text. GENERIC ones, the words "way back" in any sense, hold for what a person
 * reads: the pages and the release notes. In shipped code the same words also mean other things.
 */

/** What the product said, and what would say it again. */
export const PRECISE = Object.freeze([/go back to the last release/i, /last release that runs without/i,
  /upgrade --to v2\.0\.12(?![-\w]|\.\d)/, /\bWAY_BACK\b/]);

/** Words a page and the release notes may not use, in any sense. */
export const GENERIC = Object.freeze([/\bway back\b/i]);

/** `{ line, text }` for each line of `text` that a pattern matches, 1-based. */
export function forbiddenLines(text, patterns) {
  const found = [];
  text.split('\n').forEach((line, i) => {
    if (patterns.some((re) => re.test(line))) found.push({ line: i + 1, text: line.trim() });
  });
  return found;
}
