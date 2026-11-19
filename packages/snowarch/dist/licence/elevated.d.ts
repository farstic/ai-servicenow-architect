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
export declare const ELEVATED_REMEDY = "run this as your own user, without sudo: as root it would leave files in this folder, or in your home folder, that only root can change";
/** The effective user id of this process, or `null` where there is no such thing (Windows). */
export declare const currentEuid: () => number | null;
/** Is this id root? With no id given, this process's own is asked. */
export declare const isElevated: (euid?: number | null) => boolean;
/** `ELEVATED_REMEDY` as a sentence: a capital, and a full stop. */
export declare const elevatedSentence: () => string;
/**
 * The forms of the package CLI a root process may run: the two that read and write nothing, `instance list` (with the flags it takes)
 * and `store backups`. Every other form, a flag it does not know, a command it does not know, is refused: a write is the default, and a
 * form that reads must be named here to run. `name` is the command and `args` the words after it, as the CLI collected them.
 * (The integrity check does not refuse a verified tree, so without this a root `instance add` would run and write a store only root reads.)
 */
export declare function elevatedCliAllows(name: string, args: readonly string[]): boolean;
