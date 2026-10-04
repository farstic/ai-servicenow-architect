/**
 * What the platform STORED, compared with what was SENT (ARC-09-C93).
 *
 * The Table API does not reject a string that is longer than its column. It stores the first N
 * characters, answers 2xx, and echoes the cut value in the response (`docs/PLATFORM-NOTES.md`
 * PN-07; the owner's live test, finding R4, saw it on a Business Rule name at 40). Every tool then
 * reported success, and most built that report from the ARGUMENT — "Created business rule <the long
 * name>" — so the report agreed with the request instead of the record, and the cut was found later,
 * in a list view, by a person.
 *
 * THE DESIGN, from what was measured:
 *
 *   - The write path ALREADY holds the answer. `createRecord` and `updateRecord` return the
 *     platform's own `result`, which is the stored record, and every one of the 83 + 66 call sites
 *     under `src/tools/` throws it away. Comparing it with what was sent costs no request.
 *   - So the comparison lives where every tool already passes: `routeToolInvocation` wraps the client
 *     for one invocation (`withWriteVerification`), and any cut it sees is attached to the tool's
 *     result as `warnings`. No tool is edited, and a new tool is covered by existing.
 *   - The column's LIMIT is read from `sys_dictionary` only when a cut has actually been seen — one
 *     lookup, on the rare path — to confirm it and to name the limit exactly. It is NOT read before
 *     every write: the only dictionary reader in the server (`snow_disco_table_discover`) turns a
 *     blank limit into 255, keys its cache by table with no instance, and does not walk inherited
 *     columns, and a wrong limit consulted BEFORE a write would refuse a write that was valid.
 *     Consulted after a cut, the worst a wrong limit can do is mislabel a warning.
 *
 * WHAT IT DOES NOT DO, said plainly: it cannot stop the cut. By the time the response says the value
 * was shortened the record exists, and so does the update-set entry that captured it. The warning
 * therefore says that, and says what to do (modify, do not re-add: a retry makes a second record).
 * Refusing BEFORE the write needs the limit first; see the PR for why that is deferred and what it
 * would take.
 *
 * FALSE ALARMS ARE THE OTHER FAILURE. A warning raised for a decimal that lost its trailing zero
 * teaches the reader to skip the one that matters, so the signature is narrow on purpose: both values
 * are strings, the stored one is non-empty and strictly shorter, it is a PREFIX of what was sent, and
 * what was dropped contains something other than whitespace. A journal field that is not echoed
 * (empty), a reference returned as an object, a number returned as a string, a value the platform
 * reformatted, a value it trimmed — none of those is a prefix cut, and none warns.
 */
import type { ServiceNowClient } from './client.js';
export interface CutValueWarning {
    code: 'VALUE_TRUNCATED';
    operation: 'create' | 'update';
    table: string;
    sys_id?: string;
    field: string;
    /** Characters (Unicode code points), not UTF-16 units. */
    sent_length: number;
    stored_length: number;
    /**
     * The column's limit. When `confirmed` it is `sys_dictionary.max_length`; otherwise it is the
     * length the platform stored, which is what the limit must be if the value was cut by length.
     */
    column_limit: number;
    /** True when the dictionary stated the limit. False means inferred from the stored length. */
    confirmed: boolean;
    message: string;
}
/** Count code points without allocating an array — a script field can be tens of kilobytes. */
export declare function lengthOf(s: string): number;
/**
 * Does `stored` look like `sent` cut short?
 *
 * Both must be strings and `stored` non-empty — an empty echo is a field the response does not
 * carry (a journal input, a password), and absence is not a cut. It must be strictly shorter, be a
 * PREFIX of what was sent, and the part that is gone must contain something other than whitespace
 * (a trailing space the platform trimmed is a normalisation, not a loss). Numeric-looking strings
 * are left alone: `"1.50"` becoming `"1.5"` is a prefix and a decimal's business, not a column's.
 */
export declare function looksCut(sent: unknown, stored: unknown): boolean;
export interface CutField {
    field: string;
    sent: string;
    stored: string;
}
/** Every field of `sent` that `stored` holds as a shorter prefix, in the order it was sent. */
export declare function findCuts(sent: Record<string, unknown>, stored: Record<string, unknown>): CutField[];
/**
 * `sys_dictionary.max_length` for one column of one table, or null when it cannot be stated.
 *
 * Null covers every way of not knowing: the account cannot read the dictionary, the column is
 * defined on a PARENT table (so there is no row under this table's name), the limit is blank or 0,
 * or the lookup threw. It is never a default — the discovery tool's `|| 255` is exactly the
 * placeholder this must not repeat — and it is read fresh, not cached, because it is only reached
 * after a cut and a cache keyed without the instance would answer for the wrong one.
 */
export declare function dictionaryLimit(client: Pick<ServiceNowClient, 'queryRecords'>, table: string, field: string): Promise<number | null>;
/**
 * The warnings for one write. The dictionary is asked only for a field that was actually cut, and
 * a dictionary that says the column holds MORE than was sent means the platform changed the value in
 * some other way — that is not a length cut, so it is not reported as one.
 */
export declare function verifyWrite(client: Pick<ServiceNowClient, 'queryRecords'>, operation: 'create' | 'update', table: string, sysId: string | undefined, sent: Record<string, unknown>, stored: Record<string, unknown>): Promise<CutValueWarning[]>;
export interface Verified {
    client: ServiceNowClient;
    warnings: CutValueWarning[];
    /** False when `client` was already a wrapper: an outer invocation owns the warnings. */
    owner: boolean;
}
/**
 * Wrap `client` for ONE tool invocation so `createRecord` and `updateRecord` are verified.
 *
 * A Proxy rather than a subclass or a copy, for three reasons that each cost a defect somewhere
 * else: `Object.create(client)` would put the client's mutable state (its token) on the copy and
 * re-authenticate every call; every other method must run with `this` as the REAL client so a class
 * with `#private` fields still works; and nothing may be touched at wrap time, because the gate
 * tests hand the router a client that throws on any access.
 *
 * Re-entrant: an orchestration step calls `routeToolInvocation` with the client it was given, which
 * is already a wrapper. That call joins the outer invocation's list instead of starting a second
 * one, so a cut is reported once, on the outermost result.
 */
export declare function withWriteVerification(client: ServiceNowClient): Verified;
/**
 * Put the warnings on the result the caller reads. An object result gains a `warnings` array (any
 * the tool already produced stay ahead of ours). A result that is not an object — an array, a
 * string — cannot carry a field, so it is wrapped as `{ result, warnings }`: a changed shape on the
 * rare path is better than a cut value nobody was told about.
 *
 * `warnings` is the FIRST key, on purpose. A result over the client's size ceiling is cut from the
 * END of its text (`capResult`, strategy `chars`), so a warning appended last is the first thing a
 * large result loses — and a large result is the script body whose cut matters most. Keys keep the
 * order they are inserted in, and the record spread after `warnings` keeps its own.
 */
export declare function attachWarnings(result: unknown, warnings: CutValueWarning[]): unknown;
