// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C303 — A PROCESS THAT RUNS AS ROOT WRITES NOTHING.
 *
 * `sudo ./snowarch upgrade`, `sudo claude`, a container that runs everything as root: each leaves files in the checkout and in the user's
 * home folder that only root can change, and the user's next run fails on them with a message that does not say why. So a root process
 * does not write. It reads, it verifies, and where it would write it says so and stops (the architect's ruling, 2026-11-19).
 *
 * This module is the shared part: who is root, and the one sentence every refusal ends with. The integrity check
 * (`ensureIntegrity`), the MCP server and the package CLI import it; the engine's own guard (tools/snowarch/lib/root-guard.mjs) asks the same
 * question in the same way. It imports nothing: the engine loads it before any install has run.
 *
 * WHO IS ROOT. The effective user id is 0. Where the platform has no `geteuid` (Windows) nobody is root, and nothing here applies: a
 * Windows administrator's files are not out of the user's reach. A caller that must name the id passes it (`euid`), which is how the
 * cases ask without being root.
 */
/**
 * What a refusal tells the person to do. A FRAGMENT, as every sentence the launchers print is, and the engine holds the same words
 * (tools/snowarch/lib/root-guard.mjs, from which bootstrap.sh's is generated): a test holds the two equal. A line that prints it as a
 * sentence goes through `elevatedSentence`.
 */
export const ELEVATED_REMEDY = 'run this as your own user, without sudo: as root it would leave files in this folder, or in your home folder, that only root can change';
/** The effective user id of this process, or `null` where there is no such thing (Windows). */
export const currentEuid = () => (typeof process.geteuid === 'function' ? process.geteuid() : null);
/** Is this id root? With no id given, this process's own is asked. */
export const isElevated = (euid = currentEuid()) => euid === 0;
/** `ELEVATED_REMEDY` as a sentence: a capital, and a full stop. */
export const elevatedSentence = () => `${ELEVATED_REMEDY[0].toUpperCase()}${ELEVATED_REMEDY.slice(1)}.`;
