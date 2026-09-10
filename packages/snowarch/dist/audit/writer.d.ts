/** Rotate at 10 MB, keeping three older files. */
export declare const MAX_BYTES: number;
export declare const KEEP = 3;
export interface AuditEntry {
    /** ISO-8601. Passed in rather than taken here, so a caller can time a call precisely. */
    ts: string;
    instance: string;
    environment: string;
    tool: string;
    gate: string;
    table: string | null;
    sysId: string | null;
    query: string | null;
    /** `ok`, or the error code of the refusal or failure. */
    result: string;
    ms: number;
    /** Which surface made the call. ARC-07-S06 appends CLI lines through the same writer. */
    source: 'mcp' | 'cli';
    /** Free-text context for a call with no table — `"switch → prod"`. Never a payload. */
    note?: string;
}
/**
 * A line written by the CLI rather than by a tool call (ARC-07-S06).
 *
 * Same file, same rotation, same `ts` / `instance` / `environment` / `result` keys — a reader
 * following one instance's history should not need to know which surface made each change. What
 * differs is what there is to say: there is no tool, no gate, no table and no duration, so `tool`
 * is `null` and the MCP-only fields are absent rather than filled with zeroes that would read as
 * measurements. `action` says which sub-command, and `confirmedVia` records whether a production
 * raise was confirmed by a typed label or by `--confirm-label` on a CI command line — the one
 * distinction D-05's "typed" intent turns on.
 */
export interface CliAuditEntry {
    ts: string;
    instance: string;
    environment: string;
    tool: null;
    actor: 'cli';
    action: 'set-preset' | 'set-flags' | 'set-credentials' | 'set-default' | 'remove';
    result: string;
    preset?: string;
    prodWriteAck?: boolean;
    confirmedVia?: 'prompt' | 'flag';
}
/**
 * Where the file lives: beside the store in use, so the audit sits with the configuration it
 * records. `SNOW_AUDIT_FILE` overrides; `off` disables it entirely.
 *
 * Returns `null` when disabled. With no store on disk (env-defined instances) it falls back to
 * the project path — `<CLAUDE_PROJECT_DIR ?? cwd>/.local/` — rather than giving up, because an
 * env-configured instance is exactly the setup most likely to be doing something ad hoc.
 */
export declare function resolveAuditPath(): string | null;
/** True when the trail is switched off, so start-up can say so once. */
export declare const auditDisabled: () => boolean;
/** Test seam: the module-level "already warned" latch, reset between cases. */
export declare function resetAuditWarning(): void;
/**
 * Append one line. Never throws.
 *
 * A tool call that succeeded against the instance must not be reported as failed because the
 * local disk was full or read-only — the write already happened, and telling the caller
 * otherwise would be worse than losing the audit line.
 */
export declare function appendAudit(entry: AuditEntry | CliAuditEntry): void;
/** The last `n` lines, parsed. Unparseable lines are skipped rather than throwing. */
export declare function tailAudit(n?: number): AuditEntry[];
/** The name ARC-07/08's `snowarch audit tail` calls. Same function, story's spelling. */
export declare const readAuditTail: typeof tailAudit;
