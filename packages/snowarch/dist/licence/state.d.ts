import { type LicenceStatus, type ProductKey, type VerifiedList } from './core.js';
/** The states enforcement refuses. `expiring` is not one: a licence in its last month is in force. */
export declare const REFUSED: readonly string[];
export declare const licencePath: (root: string) => string;
export declare const revocationsPath: (root: string) => string;
export interface ListCache {
    checkedAt: string;
    source?: string;
    list: unknown;
}
export interface CheckoutStatus extends LicenceStatus {
    enforced: boolean;
    list: {
        version: number;
        checkedAt: string;
    } | null;
}
export interface ListSource {
    url: string;
    ref: string;
    path: string;
}
export declare function readLicenceText(root: string): string | null;
/** The cache, or `null`. A malformed file is an absent one. */
export declare function readListCache(root: string): ListCache | null;
/** Written whole, atomically, 0600 — the discipline of every `.local/` file. */
export declare function writeListCache(root: string, { list, checkedAt, source }: {
    list: unknown;
    checkedAt: string;
    source: string;
}): void;
/** The cached list, verified — or `null`, which is what an unverifiable one is. */
export declare function heldList(cache: ListCache | null, keys?: readonly ProductKey[]): VerifiedList | null;
/**
 * The checkout's licence, judged against the held list. `enforced` is true on every build. `env` is accepted and
 * read by nothing: no variable turns enforcement off, and `licence/unconditional.test.ts` passes every value to show it.
 */
export declare function licenceStatus(root: string, { keys, now }?: {
    keys?: readonly ProductKey[];
    now?: Date;
    env?: unknown;
}): CheckoutStatus;
/** The line: the same words as the CLI's banner (the parity test holds them). */
export declare function licenceLine(s: Pick<LicenceStatus, 'state' | 'id' | 'scope' | 'perpetual' | 'validUntil'>): string;
/** `owner/name` is GitHub over HTTPS; anything else is a URL or path, used as written. */
export declare const repoUrl: (repo: string) => string;
/** `{ url, ref, path }` from `engine.config.json`'s `licence.revocations`, or `null` when none is configured. */
export declare function listSource(config: unknown): ListSource | null;
