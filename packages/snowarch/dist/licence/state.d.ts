import { type LicenceStatus, type ProductKey, type VerifiedList } from './core.js';
export declare const ENFORCE_VAR = "SNOW_LICENCE_ENFORCE";
/** The states enforcement refuses. `expiring` is not one: a licence in its last month is in force. */
export declare const REFUSED: readonly string[];
/** A list older than this is refreshed at a live server start. */
export declare const LIST_REFRESH_MS: number;
export declare const isEnforced: (env?: NodeJS.ProcessEnv | Record<string, string | undefined>) => boolean;
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
/** Is the cached list due a refresh? No cache, an unreadable date or one from the future all are. */
export declare function listStale(cache: ListCache | null, now?: Date, afterMs?: number): boolean;
export declare function licenceStatus(root: string, { keys, now, env }?: {
    keys?: readonly ProductKey[];
    now?: Date;
    env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
}): CheckoutStatus;
/** The line: the same words as the CLI's banner (the parity test holds them). */
export declare function licenceLine(s: Pick<LicenceStatus, 'state' | 'id' | 'scope' | 'perpetual' | 'validUntil'>, { enforced }: {
    enforced: boolean;
}): string;
/** `owner/name` is GitHub over HTTPS; anything else is a URL or path, used as written. */
export declare const repoUrl: (repo: string) => string;
/** `{ url, ref, path }` from `engine.config.json`'s `licence.revocations`, or `null` when none is configured. */
export declare function listSource(config: unknown): ListSource | null;
