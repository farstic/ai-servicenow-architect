// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C303 — THE ENGINE'S HALF OF "A PROCESS THAT RUNS AS ROOT WRITES NOTHING" (the architect's ruling, 2026-11-19).
 *
 * `sudo ./snowarch upgrade`, `sudo claude`, a container that runs everything as root: each leaves files in the checkout and in the
 * user's home folder that only root can change, and the next run of the user's own fails on them with a message that does not say why.
 * So a root process does not write. The package's half (the integrity check, the MCP server, the package CLI) is
 * packages/snowarch/src/licence/elevated.ts; this is the engine's: who is root, and the one sentence every refusal ends with.
 *
 * WHO IS ROOT. The effective user id is 0. Where the platform has no `geteuid` (Windows) nobody is root, and nothing here applies.
 */

/**
 * What a refusal tells the person to do: a FRAGMENT, as every sentence the launchers print is. bootstrap.sh prints these words (the
 * launcher text is generated from this constant, scripts/gen-launcher-text.mjs), and the package holds the same words in
 * ELEVATED_REMEDY (packages/snowarch/src/licence/elevated.ts); tools/snowarch/tests/integrity-elevated.test.mjs holds the first two equal, and the launcher parity test the third.
 *
 * It is not a row of remedies.json: those are the seven preflight CHECKS of B00, and two cases pin that
 * (tools/snowarch/tests/b00-checks.test.mjs), because a check without a remedy is a status, not help.
 */
export const ELEVATED_REMEDY =
  'run this as your own user, without sudo: as root it would leave files in this folder, or in your home folder, that only root can change';

/** `ELEVATED_REMEDY` as a sentence: a capital, and a full stop. */
export const elevatedSentence = () => `${ELEVATED_REMEDY[0].toUpperCase()}${ELEVATED_REMEDY.slice(1)}.`;

/** Is this process root? `proc` is the process by default; a case passes an object with its own `geteuid`. */
export const isElevated = (proc = process) => typeof proc.geteuid === 'function' && proc.geteuid() === 0;
