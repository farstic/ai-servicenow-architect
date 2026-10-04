/**
 * What the platform STORED, compared with what was SENT (ARC-09-C93).
 *
 * THE PROBLEM. A string longer than its column is, on the evidence, not refused: the Table API stores
 * the first N characters, answers 2xx, and echoes the cut value (`docs/PLATFORM-NOTES.md` PN-07,
 * observed on `sys_script_fix.name` with a POST; the owner's live test, finding R4, reported a
 * Business Rule name cut at 40). Most tools then built their success line from the ARGUMENT —
 * "Created business rule <the long name>" — so the report agreed with the request instead of the
 * record. The premise that `sys_script` and a PATCH behave the same is ASSUMED, not seen; the
 * procedure that settles it is in `packages/snowarch/tests/live/README.md`.
 *
 * THE DESIGN, in three parts, each chosen from what was measured:
 *
 *   1. DETECT from the write's own response. `createRecord` and `updateRecord` return the platform's
 *      record, and no tool compares it with what it sent. Comparing costs no request. The comparison
 *      lives where every tool already passes: `routeToolInvocation` wraps the client for one
 *      invocation (`withWriteVerification`), so a tool needs no edit for the check to cover it.
 *      Detection is CPU only and runs inside the write, so the write's latency is the write's.
 *
 *   2. CONFIRM AND NAME THE LIMIT, afterwards and only if something was cut. When the tool has
 *      finished — returned or thrown — `settle` reads `sys_dictionary.max_length` for the cut columns:
 *      one request per TABLE, one total budget, and the first failed lookup stops the rest (a failed
 *      login that is repeated is how an account is locked). Nothing is read before a write. The only
 *      other dictionary reader in the server (`snow_disco_table_discover`) turns a blank limit into
 *      255, keys its cache by table without the instance, and does not walk inherited columns, so a
 *      limit taken from it BEFORE a write could refuse a valid write. Here a wrong limit can mislabel
 *      a warning or, below, hide one; it can never block a write.
 *
 *   3. REPORT in the tool's result as `warnings`, and on the error of a tool that throws after it
 *      wrote. The server cannot stop the cut — by the time the response says so, the record exists.
 *      Refusing BEFORE the write needs the limit first; PN-10 lists what that needs and why it waits.
 *
 * WHAT THE DICTIONARY IS ALLOWED TO DO. `max_length` is "a logical limit for the size of string
 * fields" (`vendor/ServiceNowDocs/markdown/platform-administration/table-administration-and-data-management/r_DictionaryEntryForm.md`),
 * and the page says the system maps it to a physical type with more length available than stated. So
 * "the platform cuts at exactly `max_length`" is not documented in the bundled corpus — verify on the
 * instance; the live run confirms it for `sys_script.name` only. The warning therefore says what the
 * dictionary STATES, never that the column "holds" it. The dictionary may:
 *   - confirm a cut (`confirmed: true`) when the stored value fits the limit and the sent one did not;
 *   - suppress a warning when the limit fits the sent value under BOTH ways of counting characters
 *     (code points and UTF-16 units; which one the platform uses is not documented — verify), because
 *     then something other than the column shortened the value, usually a normalisation;
 *   - suppress a warning when the STORED value is longer than the limit, which proves the limit did
 *     not cut it (a sanitiser removed a tail from an HTML field).
 * It cannot answer for a column defined on a PARENT table (`incident.short_description` is defined
 * on `task`): there is no row under the child's name, so those warnings stay `confirmed: false`, and
 * a benign normalisation on such a column is not suppressed. That is a known gap (PN-10).
 *
 * WHAT IT DOES NOT SEE. Only `createRecord` and `updateRecord` are checked. Not checked:
 * `batchRequest` (`snow_fluent_request_batch`), `uploadAttachment`, `createChangeRequest`, the Now
 * Assist and catalogue POSTs, and a client copy made with `withUser`. Only STRING values are compared.
 * A field the response does not echo (a journal field, a password, a column the account can write but
 * not read) can never warn, so an absent `warnings` key is not proof that nothing was cut.
 *
 * FALSE ALARMS ARE THE OTHER FAILURE. A warning raised for a decimal that lost its trailing zero
 * teaches the reader to skip the one that matters, so the signature is narrow: both values are
 * strings, the stored one is non-empty and strictly shorter, it is a PREFIX of what was sent once line
 * endings are normalised, and what is gone contains something other than whitespace and is not just a
 * decimal's trailing zeros. Reformats that drop a tail and are NOT exempt — a datetime written to a
 * date column, a trailing list delimiter, a sanitised HTML tail — do warn unless the dictionary rules
 * them out; `tests/servicenow/stored-values.test.ts` names the ones it knows.
 */
import type { ServiceNowClient } from './client.js';
import { logger } from '../utils/logging.js';

export interface CutValueWarning {
  code: 'VALUE_TRUNCATED';
  operation: 'create' | 'update';
  table: string;
  sys_id?: string;
  field: string;
  /**
   * Characters, counted in Unicode code points. That the platform counts the same way is an
   * assumption (not documented in the bundled corpus — verify on the instance).
   */
  sent_length: number;
  stored_length: number;
  /**
   * When `confirmed`, the `max_length` the dictionary states for the column. Otherwise the length the
   * platform stored: a LOWER bound of the real limit, because whitespace the platform trimmed after
   * the cut makes the stored value shorter than the column allowed.
   */
  column_limit: number;
  /** True when the dictionary stated the limit and it explains the cut. False means inferred. */
  confirmed: boolean;
  message: string;
}

/** Count code points without allocating an array — a script field can be tens of kilobytes. */
export function lengthOf(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i += 1) {
    const hi = s.charCodeAt(i);
    // A surrogate pair is one code point and two UTF-16 units; whether the platform counts the pair
    // as one character is not documented in the bundled corpus — verify on the instance.
    if (hi >= 0xd800 && hi <= 0xdbff && i + 1 < s.length) {
      const lo = s.charCodeAt(i + 1);
      if (lo >= 0xdc00 && lo <= 0xdfff) i += 1;
    }
    n += 1;
  }
  return n;
}

/** Line endings the platform may rewrite. Compared as LF so a CRLF script that is also cut is seen. */
const EOL = /\r\n?/g;
const normal = (s: string): string => s.replace(EOL, '\n');

/** A string that is a decimal number WITH a point (`1.50`, `.5`, `1.`) — the only kind that can lose a tail harmlessly. */
const DECIMAL = /^[+-]?(\d[\d,]*)?\.\d*$/;
/** What a decimal may lose: its point and zeros after it. */
const ZERO_TAIL = /^\.?0*$/;

/**
 * Does `stored` look like `sent` cut short?
 *
 * Both must be strings and `stored` non-empty — an empty echo is a field the response does not
 * carry (a journal input, a password), and absence is not a cut. After line endings are normalised it
 * must be strictly shorter and a PREFIX of what was sent, and the part that is gone must contain
 * something other than whitespace (a trailing space the platform trimmed is a normalisation, not a
 * loss). The one exemption is a decimal that lost only its trailing zeros: `"1.50"` becoming `"1.5"`
 * is a decimal's business. It is deliberately NOT exempt by shape — a string of digits with no point
 * has no way to lose its tail harmlessly, and an all-digit label, an identifier or a list of integers
 * that is cut must warn.
 */
export function looksCut(sent: unknown, stored: unknown): boolean {
  if (typeof sent !== 'string' || typeof stored !== 'string') return false;
  const a = normal(sent);
  const b = normal(stored);
  if (b === '' || b.length >= a.length) return false;
  if (!a.startsWith(b)) return false;
  const tail = a.slice(b.length);
  if (tail.trim() === '') return false;
  if (DECIMAL.test(a.trim()) && ZERO_TAIL.test(tail)) return false;
  return true;
}

export interface CutField { field: string; sent: string; stored: string }

/** Every field of `sent` that `stored` holds as a shorter prefix, in the order it was sent. RAW strings, not the normalised ones. */
export function findCuts(sent: Record<string, unknown>, stored: Record<string, unknown>): CutField[] {
  const out: CutField[] = [];
  for (const field of Object.keys(sent)) {
    if (looksCut(sent[field], stored?.[field])) {
      out.push({ field, sent: sent[field] as string, stored: stored[field] as string });
    }
  }
  return out;
}

/** Table and column names that are safe to put in an encoded query. Anything else is "unknown". */
const IDENT = /^[a-z][a-z0-9_]*$/i;

/** The dictionary's `max_length` as a limit; null when it states none (blank, 0, not a whole number). */
export function parseLimit(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && /^\s*\d+\s*$/.test(raw) ? Number(raw) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * `sys_dictionary.max_length` for columns of ONE table, one request: a map from each field asked
 * about to its limit, or `null` when none can be stated.
 *
 * Null covers every way of not knowing: the column is defined on a PARENT table (so there is no row
 * under this table's name), the limit is blank or 0, or the name is not safe to put in a query. It is
 * never a default — the discovery tool's `|| 255` is exactly the placeholder this must not repeat —
 * and it is read fresh, never cached, because it is only reached after a cut and a cache keyed
 * without the instance would answer for the wrong one.
 *
 * A request that FAILS rejects. The caller needs to know the lookup failed — to stop asking, not to
 * mistake "could not read" for "no limit" — and swallowing it here would hide that. Reading the
 * dictionary needs an elevated role (`personalize_dictionary`), so for a restricted account every
 * lookup fails.
 */
export async function dictionaryLimits(
  client: Pick<ServiceNowClient, 'queryRecords'>, table: string, fields: string[],
): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>(fields.map((f) => [f, null]));
  const safe = IDENT.test(table) ? [...new Set(fields.filter((f) => IDENT.test(f)))] : [];
  if (safe.length === 0) return out;
  const res = await client.queryRecords({
    table: 'sys_dictionary', query: `name=${table}^elementIN${safe.join(',')}`,
    fields: 'element,max_length', limit: safe.length,
    // No retries: this lookup is advisory, so a failure is the answer "unknown". A 403 is never
    // retried (ARC-09-C99); a 429, a 5xx or a dropped connection would otherwise spend 1s + 2s + 4s of
    // backoff while the tool's caller waits.
    retries: 0,
  });
  for (const row of (res.records ?? []) as Array<Record<string, unknown>>) {
    const element = row?.element;
    if (typeof element === 'string' && safe.includes(element) && out.get(element) === null) {
      out.set(element, parseLimit(row.max_length));
    }
  }
  return out;
}

/** One write that came back with at least one cut field, waiting for its limits. */
export interface Pending {
  operation: 'create' | 'update';
  table: string;
  sysId?: string;
  /** The record is active: it is already running with whatever was cut. */
  live: boolean;
  cuts: CutField[];
}

function explain(p: Pending, cut: CutField, limit: number | null, sentLen: number, storedLen: number): string {
  const where = `${p.table}.${cut.field}`;
  const head = limit !== null
    ? `${where}: ${sentLen} characters were sent; the dictionary states a maximum length of ${limit}, `
      + `and the platform stored the first ${storedLen} and reported success.`
    : `${where} appears to have been cut: ${sentLen} characters were sent and ${storedLen} were stored, so the `
      + `column seems to hold at least ${storedLen} (the dictionary did not state a limit: it may be defined on a `
      + 'parent table, or this account cannot read it).';
  const ignored = limit === null && p.operation === 'update'
    ? ' On an update this can also be a write the platform ignored (a field ACL or a data policy), which leaves the old value in place.'
    : '';
  const live = p.live
    ? ' The record is active: set active to false until it is corrected if the cut value changes what it does.'
    : '';
  // One entry per object per update set, and the latest version is the one included
  // (`vendor/ServiceNowDocs/markdown/application-development/system-update-sets/using-system-update-sets.md`).
  // Whether this table is captured at all is not known here, hence the condition.
  const captured = ' If update-set capture was on, its entry holds the cut value too: correct it while the same update '
    + 'set is still the capture target, so its latest version is the corrected one.';
  const fix = limit !== null
    ? `Correct it with a modify of at most ${limit} characters`
    : `Correct it with a modify (${storedLen} characters is known to fit)`;
  const tail = p.operation === 'create' ? ' — do not re-add it, which would make a second record.' : '.';
  return `${head}${ignored} The record exists with the stored value.${live}${captured} ${fix}${tail}`;
}

/**
 * The warning for one cut field, given what the dictionary stated for its column (`null` = unknown),
 * or `null` when the dictionary shows the value was not cut by length.
 *
 * Observation outranks the dictionary only as far as the dictionary can be wrong in a way that matters
 * here: it is not allowed to CONFIRM a limit the stored value contradicts, and it is not allowed to
 * explain away a cut under a counting unit it might not share with the platform.
 */
export function reconcile(p: Pending, cut: CutField, limit: number | null): CutValueWarning | null {
  const sentLen = lengthOf(cut.sent);
  const storedLen = lengthOf(cut.stored);
  if (limit !== null) {
    // The limit fits what was sent under both ways of counting: the column did not shorten it.
    if (Math.max(sentLen, cut.sent.length) <= limit) return null;
    // The stored value is longer than the limit: the limit cannot be what cut it.
    if (storedLen > limit) return null;
  }
  return {
    code: 'VALUE_TRUNCATED', operation: p.operation, table: p.table, ...(p.sysId ? { sys_id: p.sysId } : {}),
    field: cut.field, sent_length: sentLen, stored_length: storedLen,
    column_limit: limit ?? storedLen, confirmed: limit !== null,
    message: explain(p, cut, limit, sentLen, storedLen),
  };
}

// ─── The per-invocation wrapper ──────────────────────────────────────────────────────────────

/** How long `settle` may spend on dictionary lookups in total, before the warnings go out unconfirmed. */
export const SETTLE_BUDGET_MS = 3000;

interface State { pending: Pending[]; warnings: CutValueWarning[] }

/** Every client this module has wrapped, mapped to the state its invocation shares. */
const wrapped = new WeakMap<object, State>();

export interface Verified {
  client: ServiceNowClient;
  /** False when `client` was already a wrapper: an outer invocation owns the warnings. */
  owner: boolean;
  /**
   * Call once the tool has finished, whether it returned or threw. Reads the dictionary (once per
   * table, within `budgetMs`, stopping at the first failure) and returns every warning of the
   * invocation. A second call asks nothing new. A non-owner returns `[]`: its writes are reported by
   * the outer invocation.
   */
  settle(budgetMs?: number): Promise<CutValueWarning[]>;
}

const key = (table: string, field: string): string => `${table}\u0000${field}`;

/**
 * Read the limits for every cut column in `batch`: one request per table, all under `budgetMs`, the
 * first failure ends the reading. Never rejects. What was not read stays absent from the map.
 */
async function readLimits(
  client: Pick<ServiceNowClient, 'queryRecords'>, batch: Pending[], budgetMs: number,
): Promise<Map<string, number | null>> {
  const byTable = new Map<string, Set<string>>();
  for (const p of batch) {
    const fields = byTable.get(p.table) ?? new Set<string>();
    for (const c of p.cuts) fields.add(c.field);
    byTable.set(p.table, fields);
  }
  const limits = new Map<string, number | null>();
  let closed = false;
  const work = (async () => {
    for (const [table, fields] of byTable) {
      if (closed) return;
      let got: Map<string, number | null>;
      try {
        got = await dictionaryLimits(client, table, [...fields]);
      } catch (e) {
        // Any failure, authentication included, ends the reading: nothing else is asked of an
        // instance that just refused, and the warnings go out unconfirmed.
        logger.warn(`dictionary lookup stopped after a failure on ${table}: ${e instanceof Error ? e.message : String(e)}`);
        return;
      }
      if (closed) return;                           // the budget ran out while this request was in flight
      for (const [field, n] of got) limits.set(key(table, field), n);
    }
  })();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      logger.warn(`dictionary lookup abandoned after ${budgetMs}ms; the cut values are reported unconfirmed`);
      resolve();
    }, budgetMs);
  });
  try {
    await Promise.race([work, deadline]);
  } finally {
    closed = true;
    if (timer !== undefined) clearTimeout(timer);
  }
  return limits;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isTrue = (v: unknown): boolean => v === true || v === 'true';

/**
 * Wrap `client` for ONE tool invocation so `createRecord` and `updateRecord` are checked.
 *
 * A Proxy rather than a subclass or a copy: `Object.create(client)` would put the client's mutable
 * state (its token) on the copy and re-authenticate on every invocation; every other method must run
 * with `this` as the REAL client so a class with `#private` fields still works; and nothing may be
 * CALLED at wrap time, because the gate tests hand the router a client that throws when a method is
 * called. Known limits of a Proxy here: `proxy.method === proxy.method` is false (each access binds
 * a new function), `proxy.constructor` is a bound function, and a frozen target would throw on a
 * function property — the real client is none of those, and nothing reads them.
 *
 * Re-entrant: an orchestration step calls `routeToolInvocation` with the client it was given, which
 * is already a wrapper. That call joins the outer invocation's state instead of starting a second
 * one, so a cut is reported once, on the outermost result.
 */
export function withWriteVerification(client: ServiceNowClient): Verified {
  const existing = wrapped.get(client as unknown as object);
  if (existing) return { client, owner: false, settle: async () => [] };

  const state: State = { pending: [], warnings: [] };

  const record = (
    operation: 'create' | 'update', table: string, sysId: string | undefined,
    sent: unknown, stored: unknown,
  ): void => {
    try {
      if (!isObject(sent) || !isObject(stored)) return;
      const cuts = findCuts(sent, stored);
      if (cuts.length === 0) return;
      const id = sysId ?? (typeof stored.sys_id === 'string' ? stored.sys_id : undefined);
      state.pending.push({ operation, table, sysId: id, live: isTrue(sent.active) || isTrue(stored.active), cuts });
    } catch (e) {
      // A check on a write that SUCCEEDED must never turn it into a failure.
      logger.warn(`write verification skipped for ${table}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const proxy = new Proxy(client as unknown as object, {
    get(target, prop) {
      if (prop === 'createRecord') {
        return async (table: string, data: Record<string, unknown>) => {
          const stored = await (target as ServiceNowClient).createRecord(table, data);
          record('create', table, undefined, data, stored);
          return stored;
        };
      }
      if (prop === 'updateRecord') {
        return async (table: string, sysId: string, data: Record<string, unknown>) => {
          const stored = await (target as ServiceNowClient).updateRecord(table, sysId, data);
          record('update', table, sysId, data, stored);
          return stored;
        };
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as unknown as ServiceNowClient;

  wrapped.set(proxy as unknown as object, state);

  const settle = async (budgetMs: number = SETTLE_BUDGET_MS): Promise<CutValueWarning[]> => {
    const batch = state.pending.splice(0);
    if (batch.length === 0) return state.warnings;
    const limits = await readLimits(client, batch, budgetMs);
    let explainedAway = 0;
    for (const p of batch) {
      for (const cut of p.cuts) {
        const w = reconcile(p, cut, limits.get(key(p.table, cut.field)) ?? null);
        if (w) state.warnings.push(w); else explainedAway += 1;
      }
    }
    // A trace for the server's own log; tables and counts only, never a value.
    if (state.warnings.length > 0) {
      logger.warn(`${state.warnings.length} write(s) stored a cut value (tables: ${[...new Set(state.warnings.map((w) => w.table))].join(', ')})`);
    }
    if (explainedAway > 0) {
      logger.info(`${explainedAway} shorter stored value(s) were explained by the dictionary limit and not reported`);
    }
    return state.warnings;
  };

  return { client: proxy, owner: true, settle };
}

// ─── Carrying the warnings out ───────────────────────────────────────────────────────────────

/**
 * Only a prototype-less or `Object.prototype` object can take a new key without losing something:
 * a Date, a Map or a class instance would be flattened by a spread.
 */
const isPlain = (v: unknown): v is Record<string, unknown> => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

/** A list of things shaped like warnings — each an object with a string `code`. */
const isWarningList = (v: unknown): v is unknown[] =>
  Array.isArray(v) && v.every((x) => isObject(x) && typeof x.code === 'string');

/**
 * Put the warnings on the result the caller reads. A plain-object result gains a `warnings` array
 * (any warnings the tool already produced stay ahead of ours). Anything else — an array, a string, a
 * Date, or a record whose own `warnings` COLUMN is not a list of warnings — cannot take the key
 * without losing or coercing something, so it is wrapped as `{ warnings, result }`: a changed shape on
 * the rare path is better than a cut value nobody was told about.
 *
 * `warnings` is the first named key, on purpose. A result over the client's size ceiling is cut from
 * the END of its text (`capResult`, strategy `chars`), so a warning appended last is the first thing
 * a large result loses — and a large result is the script body whose cut matters most.
 */
export function attachWarnings(result: unknown, warnings: CutValueWarning[]): unknown {
  if (warnings.length === 0) return result;
  if (isPlain(result)) {
    const { warnings: prior, ...rest } = result;
    if (prior === undefined) return { warnings: [...warnings], ...rest };
    if (isWarningList(prior)) return { warnings: [...prior, ...warnings], ...rest };
  }
  return { warnings, result };
}

const ON_ERROR = Symbol.for('snowarch.storedValueWarnings');

/**
 * Hang the warnings off an error that is about to be thrown, so the layer that renders it can say
 * that an earlier write in the same call stored a cut value. A non-enumerable symbol key: it is not
 * serialised, not logged with the error, and not mistaken for the error's own fields.
 */
export function carryWarningsOnError(error: unknown, warnings: CutValueWarning[]): void {
  if (warnings.length === 0 || typeof error !== 'object' || error === null) return;
  try {
    Object.defineProperty(error, ON_ERROR, { value: warnings, enumerable: false, configurable: true });
  } catch { /* a frozen error: the server log still has the line */ }
}

/** The warnings an error carries out of a tool that wrote before it threw, or `[]`. */
export function carriedWarnings(error: unknown): CutValueWarning[] {
  if (typeof error !== 'object' || error === null) return [];
  const carried = (error as Record<symbol, unknown>)[ON_ERROR];
  return Array.isArray(carried) ? (carried as CutValueWarning[]) : [];
}

/**
 * One sentence about cuts that happened before a tool threw, or `''`. Server-built from the warnings;
 * it never repeats the error's own text and never contains a `(Code: …)` marker, which the session
 * rules read as the error's code.
 */
export function describeCutsOnError(error: unknown): string {
  const carried = carriedWarnings(error);
  if (carried.length === 0) return '';
  const listed = carried.slice(0, 5)
    .map((w) => `${w.table}.${w.field}${w.sys_id ? ` (${w.sys_id})` : ''}: ${w.sent_length} characters sent, ${w.stored_length} stored`);
  const more = carried.length > 5 ? `; and ${carried.length - 5} more` : '';
  return `Note: before this error, ${carried.length} write(s) in the same call stored a cut value — ${listed.join('; ')}${more}. `
    + 'Those records exist with the cut value: correct them with a modify, do not re-add them.';
}
