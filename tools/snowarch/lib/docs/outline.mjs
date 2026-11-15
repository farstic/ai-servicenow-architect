// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C284 — `docs outline`: the corpus's own hierarchy, browsed a level at a time.
//
// The first, empty version: it parses nothing and prints nothing, so that the cases written against it can be seen to fail
// before it does any work.

/** The most lines one call prints at its depth before it falls back to the first level. */
export const OUTLINE_LINES = 120;
/** The levels below the start node that a call prints unless it is told otherwise. */
export const OUTLINE_DEPTH = 2;

/** One index.md's nested list as a forest of `{ title, path, children }`. */
export function parseIndex() {
  return [];
}

/** `docs outline`: returns the exit code, prints each line through `out`. */
export function runOutline() {
  return 2;
}
