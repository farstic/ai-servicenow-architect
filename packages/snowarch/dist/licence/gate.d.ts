/**
 * ARC-11-C6 — ONE DOOR, TWO ENTRANCES: the set of commands that run without a licence, and the decision.
 *
 * `./snowarch` (the engine's front door, `tools/snowarch/lib/cli.mjs`) and `dist/cli/index.js` (this package's
 * CLI) both refuse a command through `refusesCommand` below, and the engine imports it from this module's
 * build rather than keeping a copy: two entrances with different rules is the gap a red team finds first.
 * The bootstrap's B06 and B08 ask the same question before they start this package's CLI, so a bootstrap that
 * runs without a licence (ruling A) skips them instead of meeting the refusal.
 *
 * It imports nothing. The engine loads it before any install has run, and the server's licence state takes
 * `REFUSED` from it.
 */
/** The states enforcement refuses. `expiring` is not one: a licence in its last month is in force. */
export declare const REFUSED: readonly string[];
/**
 * The commands that run without a licence: the five a person needs to see and repair the state (R1), and
 * `bootstrap` in full (ARC-11-C6, ruling A), because installing is how a checkout first reads one.
 */
export declare const CLI_ALLOWED: readonly string[];
/**
 * And the forms of other commands that do: `mode design`, which deregisters a checkout before its folder is
 * deleted (INSTALL.md, Uninstall). `mode` itself, and `mode live`, are refused.
 */
export declare const CLI_ALLOWED_FORMS: Readonly<Record<string, readonly string[]>>;
/** Does this command, with these arguments, run without a licence? */
export declare const allowedCommand: (name: string, positional?: readonly string[]) => boolean;
/** Is this command refused? For a refused state, every command but the allowed ones. */
export declare const refusesCommand: (name: string, s: {
    state: string;
}, positional?: readonly string[]) => boolean;
