import { logger } from '../utils/logging.js';
/** Count code points without allocating an array — a script field can be tens of kilobytes. */
export function lengthOf(s) {
    let n = 0;
    for (let i = 0; i < s.length; i += 1) {
        const hi = s.charCodeAt(i);
        // A surrogate pair is ONE character to the platform and two UTF-16 units to `.length`.
        if (hi >= 0xd800 && hi <= 0xdbff && i + 1 < s.length) {
            const lo = s.charCodeAt(i + 1);
            if (lo >= 0xdc00 && lo <= 0xdfff)
                i += 1;
        }
        n += 1;
    }
    return n;
}
/** A value that is only digits, a sign, grouping and one decimal part: a number, not a label. */
const NUMERIC = /^[+-]?\d[\d,]*(\.\d+)?$/;
/**
 * Does `stored` look like `sent` cut short?
 *
 * Both must be strings and `stored` non-empty — an empty echo is a field the response does not
 * carry (a journal input, a password), and absence is not a cut. It must be strictly shorter, be a
 * PREFIX of what was sent, and the part that is gone must contain something other than whitespace
 * (a trailing space the platform trimmed is a normalisation, not a loss). Numeric-looking strings
 * are left alone: `"1.50"` becoming `"1.5"` is a prefix and a decimal's business, not a column's.
 */
export function looksCut(sent, stored) {
    if (typeof sent !== 'string' || typeof stored !== 'string')
        return false;
    if (stored === '' || stored.length >= sent.length)
        return false;
    if (!sent.startsWith(stored))
        return false;
    if (sent.slice(stored.length).trim() === '')
        return false;
    if (NUMERIC.test(sent.trim()))
        return false;
    return true;
}
/** Every field of `sent` that `stored` holds as a shorter prefix, in the order it was sent. */
export function findCuts(sent, stored) {
    const out = [];
    for (const field of Object.keys(sent)) {
        if (looksCut(sent[field], stored?.[field])) {
            out.push({ field, sent: sent[field], stored: stored[field] });
        }
    }
    return out;
}
/** Table and column names that are safe to put in an encoded query. Anything else is "unknown". */
const IDENT = /^[a-z][a-z0-9_]*$/i;
/**
 * `sys_dictionary.max_length` for one column of one table, or null when it cannot be stated.
 *
 * Null covers every way of not knowing: the account cannot read the dictionary, the column is
 * defined on a PARENT table (so there is no row under this table's name), the limit is blank or 0,
 * or the lookup threw. It is never a default — the discovery tool's `|| 255` is exactly the
 * placeholder this must not repeat — and it is read fresh, not cached, because it is only reached
 * after a cut and a cache keyed without the instance would answer for the wrong one.
 */
export async function dictionaryLimit(client, table, field) {
    if (!IDENT.test(table) || !IDENT.test(field))
        return null;
    try {
        const res = await client.queryRecords({
            table: 'sys_dictionary', query: `name=${table}^element=${field}`, fields: 'max_length', limit: 1,
            // No retries: a 403 here is the answer "unknown", and the client would otherwise spend
            // 1s + 2s + 4s of backoff on it while the tool's caller waits.
            retries: 0,
        });
        const raw = res.records?.[0]?.max_length;
        const n = typeof raw === 'number' ? raw : typeof raw === 'string' && /^\s*\d+\s*$/.test(raw) ? Number(raw) : NaN;
        return Number.isInteger(n) && n > 0 ? n : null;
    }
    catch {
        return null;
    }
}
function explain(op, table, c, limit) {
    const sent = lengthOf(c.sent);
    const stored = lengthOf(c.stored);
    const fix = op === 'create'
        ? 'Correct it with a modify of at most that many characters — do not re-add it, which would make a second record.'
        : 'Correct it with another modify of at most that many characters.';
    const where = `${table}.${c.field}`;
    return limit !== null
        ? `${where}: ${sent} characters were sent and the column holds ${limit}, so the platform stored the first ${stored} `
            + `and reported success. The record exists with the cut value, and so does the update-set entry that captured it. ${fix}`
        : `${where} appears to have been cut: ${sent} characters were sent and ${stored} were stored, so the column seems to `
            + `hold ${stored} (the dictionary could not confirm it). The record exists with the stored value, and so does the `
            + `update-set entry that captured it. ${fix}`;
}
/**
 * The warnings for one write. The dictionary is asked only for a field that was actually cut, and
 * a dictionary that says the column holds MORE than was sent means the platform changed the value in
 * some other way — that is not a length cut, so it is not reported as one.
 */
export async function verifyWrite(client, operation, table, sysId, sent, stored) {
    const out = [];
    for (const cut of findCuts(sent, stored)) {
        const limit = await dictionaryLimit(client, table, cut.field);
        const sentLen = lengthOf(cut.sent);
        if (limit !== null && limit >= sentLen)
            continue;
        const storedLen = lengthOf(cut.stored);
        const id = sysId ?? (typeof stored.sys_id === 'string' ? stored.sys_id : undefined);
        out.push({
            code: 'VALUE_TRUNCATED', operation, table, ...(id ? { sys_id: id } : {}), field: cut.field,
            sent_length: sentLen, stored_length: storedLen,
            column_limit: limit ?? storedLen, confirmed: limit !== null,
            message: explain(operation, table, cut, limit),
        });
    }
    return out;
}
// ─── The per-invocation wrapper ──────────────────────────────────────────────────────────────
/** Every client this module has wrapped, mapped to the list its warnings go into. */
const wrapped = new WeakMap();
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
export function withWriteVerification(client) {
    const existing = wrapped.get(client);
    if (existing)
        return { client, warnings: existing, owner: false };
    const warnings = [];
    const note = async (op, table, sysId, sent, stored) => {
        try {
            if (stored && typeof stored === 'object' && sent && typeof sent === 'object') {
                warnings.push(...await verifyWrite(client, op, table, sysId, sent, stored));
            }
        }
        catch (e) {
            // A check on a write that SUCCEEDED must never turn it into a failure.
            logger.warn(`write verification skipped for ${table}: ${e instanceof Error ? e.message : String(e)}`);
        }
    };
    const proxy = new Proxy(client, {
        get(target, prop) {
            if (prop === 'createRecord') {
                return async (table, data) => {
                    const stored = await target.createRecord(table, data);
                    await note('create', table, undefined, data, stored);
                    return stored;
                };
            }
            if (prop === 'updateRecord') {
                return async (table, sysId, data) => {
                    const stored = await target.updateRecord(table, sysId, data);
                    await note('update', table, sysId, data, stored);
                    return stored;
                };
            }
            const value = Reflect.get(target, prop, target);
            return typeof value === 'function' ? value.bind(target) : value;
        },
    });
    wrapped.set(proxy, warnings);
    return { client: proxy, warnings, owner: true };
}
const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
/**
 * Put the warnings on the result the caller reads. An object result gains a `warnings` array (any
 * the tool already produced stay first). A result that is not an object — an array, a string —
 * cannot carry a field, so it is wrapped as `{ result, warnings }`: a changed shape on the rare
 * path is better than a cut value nobody was told about.
 */
export function attachWarnings(result, warnings) {
    if (warnings.length === 0)
        return result;
    if (isPlainObject(result)) {
        const prior = result.warnings;
        const before = Array.isArray(prior) ? prior : prior === undefined ? [] : [prior];
        return { ...result, warnings: [...before, ...warnings] };
    }
    return { result, warnings };
}
