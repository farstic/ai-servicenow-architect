/**
 * The permission gates — now per instance, not per process.
 *
 * Every `require*()` keeps its zero-argument signature and reads the ambient instance
 * (`currentInstance()`), so the 166 call sites in the dispatchers did not change. What
 * changed is where the answer comes from: the instance's EFFECTIVE flags, after preset
 * expansion and the dependency rule, rather than `process.env`.
 *
 * `evaluateGate` is the single implementation. The `require*` functions are thin wrappers
 * over it, so the contract test (S06) and the runtime cannot disagree about what a gate
 * means — which they could if each gate carried its own copy of the rule.
 */
import { ServiceNowError } from './errors.js';
import type { ErrorCodeName } from '../errors/codes.js';
import { FLAG_NAMES, type FlagName, type Flags } from '../servicenow/context.js';
export { FLAG_NAMES };
export type { FlagName, Flags };
export type PresetName = 'read-only' | 'pdi-developer' | 'full' | 'custom';
export type GateName = 'none' | 'write' | 'cmdb_write' | 'scripting' | 'atf' | 'now_assist' | 'fluent';
/**
 * The preset table of `01` §6.3. Exported because ARC-04-S06 emits it into the contract:
 * one table, so a client and the server cannot hold different ideas of what `full` means.
 */
export declare const PRESETS: Record<Exclude<PresetName, 'custom'>, Flags>;
/** Six explicit strings, always. `custom` takes the store's flags; absent reads as "false". */
export declare function expandPreset(preset: PresetName, custom?: Partial<Flags>): Flags;
/**
 * The named preset these six toggles ARE, or `custom`.
 *
 * The inverse of `expandPreset`, and it lives here for the same reason `expandPreset` does: the
 * preset table is one definition, and a UI that decided "this looks like pdi-developer" by its own
 * comparison would be a second one — wrong the moment a preset gains a flag.
 *
 * `custom` is not a failure. It is the honest name for a combination nobody named, and the wizard
 * prints it as such.
 */
export declare function matchPreset(flags: Flags): PresetName;
/**
 * Scripting and CMDB writes are writes. Declaring one without `WRITE_ENABLED` is a
 * contradiction, and resolving it towards "allowed" would let a store that reads as
 * read-only perform writes. The dependent flag is forced false and the contradiction is
 * reported; the store on disk is never modified by the server.
 */
export declare function applyDependencyRule(flags: Flags, label?: string): {
    effective: Flags;
    warnings: string[];
};
/** A preset whose expansion disagrees with the stored flags. The expansion wins. */
export declare function checkPresetMismatch(preset: PresetName, stored: Partial<Flags>, label?: string): string[];
export interface ProdPosture {
    ok: boolean;
    code?: 'PROD_WRITE_NOT_ACKNOWLEDGED';
    message?: string;
}
/**
 * D-05. The threshold is ANY effective flag true, not `WRITE_ENABLED` — deliberately
 * stricter. A `custom` instance with only `ATF_ENABLED` still runs tests against
 * production, and the acknowledgement is about the operator having chosen that on purpose.
 */
export declare function checkProdPosture(entry: {
    label: string;
    environment: string;
    preset: string;
    effectiveFlags: Flags;
    prodWriteAck: boolean;
}): ProdPosture;
export interface GateResult {
    ok: boolean;
    code?: ErrorCodeName;
    missing?: FlagName[];
}
/**
 * The one place a gate is decided. `mutates` matters only for `fluent`, whose read
 * operations are harmless and whose writes are writes.
 *
 * Ordering note: for the composite gates the message names WRITE first when WRITE is what
 * is missing — the same order the old `requireCmdbWrite` produced, so an existing client
 * parsing these codes sees no change.
 */
export declare function evaluateGate(gate: GateName, mutates: boolean, flags: Flags): GateResult;
/**
 * The smallest preset whose expansion turns every missing flag on.
 *
 * Hard-coding `pdi-developer` was wrong and shipped: a FLUENT or NOW_ASSIST refusal on an
 * instance already at `pdi-developer` told the reader to set the preset they were already
 * on — a remedy that changes nothing. Those two flags are only in `full`.
 *
 * Ordered least-permissive first, so the suggestion never grants more than the caller
 * actually needs.
 */
export declare function remedyPreset(missing?: FlagName[]): Exclude<PresetName, 'custom'>;
/**
 * The refusal a caller sees. It names the instance, because with several configured
 * "writes are disabled" is not actionable on its own, and it carries the command that
 * changes it. A prod instance gets the stronger sentence: the cap is deliberate, and
 * raising it needs an explicit acknowledgement rather than a preset change.
 */
export declare function gateError(result: GateResult): ServiceNowError;
export declare function requireWrite(): void;
export declare function requireCmdbWrite(): void;
export declare function requireScripting(): void;
export declare function requireAtf(): void;
export declare function requireNowAssist(): void;
export declare function requireFluent(): void;
export declare function isWriteEnabled(): boolean;
export declare function isCmdbWriteEnabled(): boolean;
export declare function isScriptingEnabled(): boolean;
export declare function isAtfEnabled(): boolean;
export declare function isNowAssistEnabled(): boolean;
export declare function isFluentEnabled(): boolean;
