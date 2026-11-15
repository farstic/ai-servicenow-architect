// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C280 — the files that quote the corpus pin without being generated from it by a recipe, and the corpus map.
//
// The first, empty version: it names the files and moves none of them, so that the cases written against it can be
// seen to fail before it does any work.

/** The files that quote the pin and that the bump has to move with it. */
export const PIN_FOLLOWERS = Object.freeze([
  '.claude/skills/snowarch/SKILL.md',
  'docs/snippets/status-template.md',
  'tests/VALIDATION-TESTS.md',
  'tests/fixtures/doctor/status-design.json',
  'tests/fixtures/doctor/status-live.json',
]);

/** Each follower's status after the bump, by path. */
export function followPin() {
  return {};
}

/** The corpus map's status after the bump: `{ status, note }`. */
export function followMap() {
  return { status: 'absent' };
}
