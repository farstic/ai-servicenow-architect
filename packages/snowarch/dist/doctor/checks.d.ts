import { pathToFileURL } from 'node:url';
import type { Check } from './types.js';
/**
 * Where `dist/` is, relative to this module once built.
 *
 * `fileURLToPath`, never `new URL(...).pathname`. On Windows the pathname of a file URL is
 * `/C:/…` — a leading slash before the drive letter, which is not a filesystem path. The first
 * version used it, so `dist/contract.json` was never found on any Windows cell: SV-05 skipped,
 * SV-01 failed, and the report read as a broken installation on a perfectly good one.
 */
declare const distDir: () => string;
export declare const svNodeFloor: Check;
export declare const svDist: Check;
export declare const svStore: Check;
export declare const svInstances: Check;
export declare const svProbes: Check;
/** Test seam: forget the cached handshake between fixtures. */
export declare function resetHandshakeCache(): void;
export declare const svHandshake: Check;
export declare const svCapabilities: Check;
export declare const svAudit: Check;
/**
 * Every ancestor of `dir` that holds a `.claude/skills`.
 *
 * Ported from `scripts/ci/skill-listing-check.mjs`, which is the measured implementation behind
 * the S-13 addendum. Kept as a separate exported function so ARC-08 can re-home this check as
 * an engine check without moving the walk.
 */
export declare function pollutingAncestors(dir: string): string[];
export declare const svAncestorSkills: Check;
export declare const ALL_CHECKS: Check[];
/** Exported so a caller can resolve `dist/` the same way the checks do. */
export { distDir, pathToFileURL };
