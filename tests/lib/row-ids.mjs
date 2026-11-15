// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C282 — the plan row and story ids that stand in the prose of a skill or an agent.
 *
 * A skill's sentence is read by the model and can come back in an answer, where an id such as ARC-09-C160 means nothing
 * to the reader. The ids a maintainer leaves in an HTML comment are notes and are not read as sentences.
 */

/** A plan row or story id: ARC-09-C160, ARC-02-S13, ARC-09-C263b. A plan name (ARC-09) or a bare C number is not one. */
const ROW_ID = /\bARC-\d{2}-[CS]\d+[a-z]?\b/g;

/** The text with each HTML comment blanked and its line breaks kept, so a line number in the result is the file's. */
const withoutComments = (text) => text.replace(/<!--[\s\S]*?-->/g, (comment) => comment.replace(/[^\n]/g, ''));

/** The ids in the prose of a text, as `{ id, line }` in reading order; an id in an HTML comment is not counted. */
export function rowIdsIn(text) {
  const hits = [];
  withoutComments(String(text)).split('\n').forEach((line, i) => {
    for (const m of line.matchAll(ROW_ID)) hits.push({ id: m[0], line: i + 1 });
  });
  return hits;
}
