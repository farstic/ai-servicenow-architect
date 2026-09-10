/**
 * ARC-07-S04 — propose, review, apply. Nothing is imposed and nothing is decided by a probe.
 *
 * D-05, and it is worth being exact about what it rules, because the temptation runs the other
 * way: THE PROPOSAL IS A FUNCTION OF THE ENVIRONMENT ALONE. A probe that came back `not licensed`
 * changes the RECOMMENDATION TEXT on that line and never the toggle — because a probe is a
 * reading of the instance at one moment, and a wizard that silently turned a flag off on the
 * strength of one would produce an installation the user did not choose and cannot explain.
 *
 * Production is capped at `read-only` here with no override at all. Raising it is a separate,
 * named step in a different command (`set-preset --ack-prod`, ARC-07-S06), which is the point:
 * the moment you can raise production inside a wizard, raising production becomes something that
 * happens while you are doing something else.
 */
import { type FlagName, type Flags, type PresetName } from '../utils/permissions.js';
import type { LastProbe, ProbeStatus } from '../servicenow/probes.js';
/** Every line this screen prints fits here. A wrapped hint is indented under its annotation. */
export declare const COLUMNS = 100;
export type Environment = 'pdi' | 'dev' | 'test' | 'prod';
/** The short label a reader sees, derived from the flag key — never a second list to maintain. */
export declare const labelOf: (flag: FlagName) => string;
/**
 * What `?` prints. Kept beside the screen that prints it, and asserted against
 * `docs/MODES-AND-PRESETS.md` §4 — one meaning per flag, in the page's own words.
 */
export declare const FLAG_MEANINGS: Readonly<Record<FlagName, string>>;
/** P-25: written on every entry, whatever the preset. One constant, consumed by S05's save. */
export declare const ENTRY_DEFAULTS: Readonly<{
    toolPackage: "full";
    maxRecords: 100;
}>;
/** The proposal. The environment, and nothing else — see the note at the top of this file. */
export declare function proposePreset(environment: Environment): PresetName;
export declare const PROD_LOCKED: (label: string, flag: FlagName) => string;
/** The refusal, in the story's words. Exit 3 — a policy answer, not a usage mistake. */
export declare const prodRefusal: (label: string) => string;
/**
 * The probe annotation for one flag.
 *
 * `ok` is one word; everything else says what was found AND what it would mean to leave the flag
 * on — a recommendation the user is free to ignore, which is the whole shape of this screen.
 */
export declare function annotate(status: ProbeStatus | undefined, hint?: string): string;
/** The `LastProbe` field that carries a flag's result. One mapping, used by the screen and S05. */
export declare const PROBE_FIELD: Readonly<Record<FlagName, keyof Omit<LastProbe, 'at' | 'auth'>>>;
export interface ScreenInput {
    label: string;
    environment: Environment;
    preset: PresetName;
    flags: Flags;
    probes?: LastProbe;
    /** Per-flag hint text, for `role missing`. */
    hints?: Partial<Record<FlagName, string>>;
}
/**
 * Wrap `text` to `width`, on word boundaries.
 *
 * Truncation is not an option: the part of a hint that gets cut is the part that says what to do
 * about it, and a reader cannot tell anything is missing. A word longer than the width is left
 * whole and allowed to overflow — breaking a URL or a table name in half helps nobody.
 */
export declare function wrapText(text: string, width: number): string[];
/**
 * One flag row: a FIXED prefix and a wrapped annotation under it.
 *
 * Wrapping the whole row as one string was the first attempt, and it collapsed the column
 * padding — `NOW_ASSIST` sat one space from its annotation while every other row lined up,
 * because the padding is consecutive spaces and a word-wrapper eats those. The prefix is
 * therefore never wrapped; only the text after it is.
 */
export declare function wrapRow(prefix: string, note: string, columns?: number): string[];
/** The screen, byte for byte. The snapshot files in `docs/snippets/` are this function's output. */
export declare function renderReviewScreen(input: ScreenInput): string;
/** `Applying: preset custom — WRITE=on CMDB_WRITE=on …` — printed before anything is saved. */
export declare function applyingLine(preset: PresetName, flags: Flags): string;
export interface FlagsParse {
    ok: boolean;
    flags?: Flags;
    message?: string;
}
/**
 * `--flags WRITE=on,CMDB_WRITE=on,…` — all six, or it is not a description of an installation.
 *
 * Five entries is a usage error naming the missing flag rather than a default for it: the whole
 * point of the flag form is that a machine said exactly what it wanted, and filling in the sixth
 * would be the wizard choosing while claiming the caller did.
 */
export declare function parseFlagsArg(raw: string): FlagsParse;
/** The dependency rule as a sentence, or null. The UI's copy of the server's own rule. */
export declare function dependencyViolation(flags: Flags): string | null;
export interface ReviewIo {
    /** One line from the operator, or null when input has ended. */
    ask: (prompt: string) => Promise<string | null>;
    write: (text: string) => void;
}
export interface ReviewResult {
    preset: PresetName;
    flags: Flags;
    cancelled?: boolean;
}
/**
 * The screen, until Enter.
 *
 * Case-insensitive because the labels are shouted in the screen and typed in lower case by
 * everyone. `q` and end-of-input both cancel, and cancelling saves nothing — which is why the
 * result says so rather than returning a preset the caller might write.
 */
export declare function runReviewScreen(input: ScreenInput, io: ReviewIo): Promise<ReviewResult>;
export interface ResolveInput {
    label: string;
    environment: Environment;
    preset?: string;
    flags?: string;
    yes?: boolean;
    probes?: LastProbe;
    hints?: Partial<Record<FlagName, string>>;
    io?: ReviewIo;
}
export interface ResolveResult {
    ok: boolean;
    preset?: PresetName;
    flags?: Flags;
    applying?: string;
    /** Set when the answer is a refusal: the caller exits with it and writes nothing. */
    exitCode?: number;
    message?: string;
}
/**
 * The whole decision, with nothing written.
 *
 * S05 owns the save; this owns what would be saved, and returns BEFORE any store call on every
 * refusal path — which is what makes "writes nothing" testable here rather than only end to end.
 */
export declare function resolveFlags(input: ResolveInput): Promise<ResolveResult>;
