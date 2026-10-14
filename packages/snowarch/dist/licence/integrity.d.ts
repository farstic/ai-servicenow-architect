import { spawnSync } from 'node:child_process';
import { type KeyRole, type ProductKey } from './core.js';
export declare const MANIFEST_FORMAT = "snowarch-manifest/1";
export interface Coverage {
    covers: readonly string[];
    excludes?: readonly string[];
    ignores?: readonly string[];
}
/** A verified manifest's body. */
export interface ManifestBody {
    tag: string;
    commit: string;
    covers: string[];
    excludes: string[];
    ignores: string[];
    files: Record<string, string>;
}
/** What a release's manifest covers (ARC-11-C7). */
export declare const COVERAGE: Readonly<{
    covers: readonly string[];
    excludes: readonly string[];
    ignores: readonly string[];
}>;
/** The sha256 of `bytes`, as hex. */
export declare const hashBytes: (bytes: Buffer | string) => string;
/**
 * Is `path` covered by `{ covers, excludes, ignores }`? An entry named exactly as an excluded directory is excluded
 * with it, so a link standing where that directory was is not an extra file.
 */
export declare function isCovered(path: string, { covers, excludes, ignores }: Coverage): boolean;
export type ReadManifest = {
    ok: true;
    manifest: ManifestBody;
    key: KeyRole;
} | {
    ok: false;
    reason: string;
};
/**
 * A manifest — its text or its parsed document — verified: `{ ok, manifest, key }`, or `{ ok: false, reason }`.
 * A manifest that does not verify is never used to judge a tree.
 */
export declare function readManifest(input: unknown, { keys }?: {
    keys?: readonly ProductKey[];
}): ReadManifest;
export interface TreeDifference {
    path: string;
    why: 'changed' | 'missing' | 'extra';
}
export interface TreeCheck {
    ok: boolean;
    checked: number;
    modified: TreeDifference[];
}
/**
 * The tree at `root` against a VERIFIED manifest body: `{ ok, checked, modified }`, `modified` sorted, each
 * `{ path, why }` with `why` one of `changed`, `missing` or `extra`.
 */
export declare function checkTree(root: string, manifest: ManifestBody): TreeCheck;
/** `.local/release-manifest.json` — this release's signed manifest, as last fetched, and when. */
export declare const manifestCachePath: (root: string, local?: string) => string;
export interface ManifestCache {
    tag?: string;
    checkedAt: string;
    source?: string;
    doc: unknown;
}
/** The cache, `{ tag, checkedAt, source, doc }`, or `null`. A malformed file is an absent one. */
export declare function readManifestCache(root: string, { local }?: {
    local?: string;
}): ManifestCache | null;
export type Held = {
    state: 'missing';
} | {
    state: 'invalid';
    reason: string;
} | {
    state: 'other';
    manifestTag: string;
} | {
    state: 'held';
    manifest: ManifestBody;
};
/**
 * What the cache holds for `tag`, the one reading of it (ARC-09-C140): E-32's verdict starts here, and B01's
 * `outputMissing` asks the same question, so the two cannot disagree about a cache. Offline; nothing is fetched.
 *
 *   missing   no cache, or a file that is not one;
 *   invalid   the cached manifest does not verify (`reason`);
 *   other     it verifies and is another release's (`manifestTag`);
 *   held      it verifies and is `tag`'s (`manifest`).
 */
export declare function cachedManifest(root: string, tag: string, { keys, local }?: {
    keys?: readonly ProductKey[];
    local?: string;
}): Held;
/** A development version: `2.1.0-dev`, and `2.1.0-dev.1` should one ever be cut. */
export declare const isDevVersion: (version: string) => boolean;
/** The commit this checkout's own `tag` names, or `null`: no git, no repository, or no such tag (a download). */
export declare function tagCommit(root: string, tag: string, { run }?: {
    run?: typeof spawnSync;
}): string | null;
/** This checkout's release tag, `v<version>`, or `null` for a development version or none. */
export declare function releaseTagOf(root: string): string | null;
export type IntegrityStatus = {
    state: 'dev';
    version: string;
} | {
    state: 'verified';
    version: string;
    tag: string;
    checked: number;
    modified: TreeDifference[];
} | {
    state: 'modified';
    version: string;
    tag: string;
    checked: number;
    modified: TreeDifference[];
} | {
    state: 'missing';
    version: string;
    tag: string;
} | {
    state: 'invalid';
    version: string | null;
    tag?: string;
    reason: string;
} | {
    state: 'other';
    version: string;
    tag: string;
    manifestTag: string;
    manifestCommit?: string;
    localCommit?: string;
};
/**
 * This checkout against its release's signed manifest, read from the cache: `{ state, version, tag, … }`.
 *
 *   dev       a development version, which no manifest is signed for;
 *   verified  the manifest is this release's, and every covered file is as signed;
 *   modified  the manifest is this release's, and `modified` lists what differs;
 *   missing   no manifest is held: none was fetched, or the cache was deleted;
 *   invalid   the cached manifest does not verify, or `package.json` names no version;
 *   other     the manifest is another release's (`manifestTag`), or another commit's than this checkout's own tag.
 *
 * Every state but `dev` and `verified` is a FAIL (the architect's ruling, 2026-10-13): a deleted or swapped manifest
 * is the cheapest tamper, and must read as one. One bounded `git` call, for the tag's commit; nothing is fetched.
 */
export declare function integrityStatus(root: string, { keys, commitOf, local }?: {
    keys?: readonly ProductKey[];
    commitOf?: (root: string, tag: string) => string | null;
    local?: string;
}): IntegrityStatus;
/** The `Integrity:` line a status names, for every state; E-32 reports it, `status` and the banner print it. */
export declare function integrityLine(s: IntegrityStatus): string;
/** The remedy for a state that is not `verified`, spelled for `cli`; `null` for `dev` and `verified`. */
export declare function integrityRemedy(s: IntegrityStatus, cli: string): string | null;
