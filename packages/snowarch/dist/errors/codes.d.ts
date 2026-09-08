/**
 * Every error code the server throws, with its remedy — one registry, so ARC-05's
 * TROUBLESHOOTING generator has a single truthful source instead of a prose sweep.
 *
 * `tests/errors/codes.test.ts` greps `src/` for every string literal passed as a code and
 * fails on one that is not here. That is what keeps this file honest: a registry nobody
 * checks drifts from the code within one story.
 */
export interface ErrorCode {
    code: string;
    /** What the caller does next. Empty only where nothing they can do would help. */
    remedy: string;
}
export declare const ERROR_CODES: ErrorCode[];
export declare const ERROR_CODE_NAMES: ReadonlySet<string>;
