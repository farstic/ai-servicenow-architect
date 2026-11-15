// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C283 — the install page's corpus figures, read from the page, and the line a docs-bump pull request prints with the
// corpus's own.
//
// The first, empty version: it reads nothing and says nothing, so that the cases written against it can be seen to fail before it
// does any work.

/** `{ areas, files, workingTreeMb }` as the page states them in "What the corpus costs", each `null` when it does not. */
export function pageFigures() {
  return { areas: null, files: null, workingTreeMb: null };
}

/** The checklist lines for a bump's pull-request body: what the corpus measures, next to what the page says. */
export function figuresChecklist() {
  return [];
}
