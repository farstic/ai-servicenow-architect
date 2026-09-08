export type StoreSource = 'env' | 'project' | 'global' | 'none';
export interface StoreCandidate {
    path: string;
    exists: boolean;
}
export interface StoreResolution {
    path: string | null;
    source: StoreSource;
    candidates: StoreCandidate[];
}
/**
 * An environment variable is "set" only when it is present AND non-empty.
 *
 * `.mcp.json` passes `${SNOW_STORE:-}` (01 §5), so an unset variable arrives as an
 * empty string. Treating `""` as a value would resolve the store to the current
 * directory and load whatever happened to be there.
 */
export declare function envPath(name: string): string | undefined;
/** The per-user global store, per OS. */
export declare function globalStorePath(): string;
/** The per-checkout store. `CLAUDE_PROJECT_DIR` is set by Claude Code; cwd is the fallback. */
export declare function projectStorePath(): string;
/**
 * The precedence: explicit override, then per-checkout, then global. First existing wins;
 * they are never merged, because a merge makes "which file set this value" unanswerable.
 *
 * `SNOW_STORE` is the exception: it is explicit, so a missing file is an ERROR rather than
 * a reason to try the next candidate. Falling back would mean a typo in the override
 * silently loads a different instance than the one asked for.
 */
export declare function resolveStorePath(): StoreResolution;
/**
 * A path fit for a log line: the home directory becomes `~`, the checkout becomes
 * `<checkout>`. Absolute paths carry the account name, and a log is the one place a
 * username reaches a screen share, a bug report or a support ticket.
 */
export declare function maskPath(p: string): string;
/**
 * A path fit for a REMEDY the reader will paste into a shell: home becomes `~`, which a
 * shell expands, and the checkout is left alone because `<checkout>` is not a path.
 *
 * `maskPath` is for prose and log lines; this is for the text after `Run:`. A remedy that
 * has been prettified into something unrunnable is worse than one that was never offered.
 */
export declare function maskPathForShell(p: string): string;
/**
 * The whole `Run:` clause for a remedy, phrased so it is BOTH pasteable and free of an
 * absolute path. Which of the three it is depends on where the file actually lives:
 *
 *  - inside the checkout  → a checkout-relative path, with "from the checkout" said out
 *    loud. This is the case `maskPathForShell` alone could not handle: a checkout on a
 *    second volume, under /srv, in a sandbox or on a CI runner is not under HOME, so
 *    there was no `~` to substitute and the absolute path was echoed.
 *  - under HOME           → `~/…`, which a shell expands.
 *  - anywhere else        → as given. The user chose that path explicitly (SNOW_STORE),
 *    and rewriting it would make the remedy point somewhere they did not name.
 */
export declare function shellRemedy(command: string, target: string): string;
/** `cvetomir@corp.com` → `c***@corp.com`; `admin` → `a***`. Never the whole name. */
export declare function maskUsername(u: string): string;
/**
 * True when the store would sit inside a folder a cloud client synchronises.
 *
 * It matters because 0600 is a LOCAL permission: the sync client runs as the same user,
 * so the mode does not stop the file leaving the machine. The wizard and the doctor turn
 * this into a warning (D-04); the server only logs it.
 *
 * Both separators are accepted, because a Windows path can reach a POSIX test runner
 * (criterion 8 asserts exactly that).
 */
export declare function isUnderCloudSyncFolder(p: string): boolean;
