import type { ProductKey } from './core.js';
import { type RefreshResult } from './refresh.js';
import { type CheckoutStatus } from './state.js';
interface Options {
    root?: string;
    env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
    keys?: readonly ProductKey[];
    now?: () => Date;
}
/** Read the licence and the cached list, and hold the result for this process. */
export declare function initLicence({ root, env, keys, now }?: Options): CheckoutStatus;
/** This process's licence; read on first use when `main()` has not started it (a test's import). */
export declare function currentLicence(): CheckoutStatus;
/** Test seam: forget the session. Never called by the server. */
export declare function resetLicenceForTests(): void;
/** Throws LICENCE_NOT_VALID when enforcement is on and this licence does not cover a live call. */
export declare function assertLicensed(): void;
/**
 * The first answer's extra block, once per process — or `null`. Always the SECOND block: a caller that
 * parses `content[0]` as JSON reads exactly what it always read.
 */
export declare function takeLicenceNotice(): string | null;
/** `{ licence: id }` when the licence's signature holds; `{}` otherwise, so a default audit line is unchanged. */
export declare function licenceAuditField(): {
    licence?: string;
};
/**
 * Refresh the revocation list in the background and recompute the state when it lands. Never rejects
 * and never throws: a refresh that cannot run is an unreachable list, and the cached state stands.
 */
export declare function refreshLicenceList({ budgetMs }?: {
    budgetMs?: number;
}): Promise<RefreshResult>;
/**
 * `main()`'s call: read the licence, and — for a LIVE server with a licence installed — start the refresh
 * of the revocation list in the background, EVERY start, whatever the cached list's age (the architect's
 * ruling (a), for the owner's "revoke → it stops at the next start"). Returns that refresh's promise, or
 * `null` when there is none; `main()` does not wait for it.
 *
 * No licence, no fetch: there is nothing a list could revoke, and a checkout without a licence starts
 * exactly as it did before ARC-11 — the owner's first requirement.
 */
export declare function startLicence({ live, ...options }: Options & {
    live: boolean;
}): Promise<RefreshResult> | null;
export {};
