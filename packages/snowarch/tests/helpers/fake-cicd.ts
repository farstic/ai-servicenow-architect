/**
 * ARC-09-C94 — a fake of the CI/CD API, at the one HTTP seam.
 *
 * The ATF exec tools speak to three endpoints of
 * vendor/ServiceNowDocs/markdown/api-reference/rest-apis/cicd-api.md: `POST /sn_cicd/testsuite/run`,
 * `GET /sn_cicd/progress/{progress_id}` and `GET /sn_cicd/testsuite/results/{result_id}`, and the test
 * exec reads two tables before it runs anything; the tests index reads two to list a suite's tests
 * (ARC-09-C113). The REAL client runs against this fake, so what the
 * tests read is the URL the client built, the method it sent, how many times it sent it, and the code
 * its own status mapping produced — not a value a stub chose to return.
 *
 * A path the fake has no answer for gets what the platform gives a path it does not serve:
 * "Requested URI does not represent any resource" (docs/PLATFORM-NOTES.md PN-15). An unconfigured
 * endpoint is therefore an absent API, never a quiet success.
 *
 * `vi.mock` is hoisted within the file that contains it, so it is written in the test file
 * (see fetch-mock.ts); what lives here is the module body it returns.
 */
export interface CicdCall {
  method: string;
  /** The path, without the query string. */
  path: string;
  query: Record<string, string>;
  /** `Date.now()` when it was sent — the fake clock's time in a test that fakes timers. */
  at: number;
  /** The JSON body of a write, parsed. */
  body?: Record<string, unknown>;
}

export interface CicdAnswer {
  status: number;
  body: unknown;
}

export interface CicdState {
  calls: CicdCall[];
  /** The answer to `POST /api/sn_cicd/testsuite/run`. */
  run?: CicdAnswer;
  /** Successive answers to `GET /api/sn_cicd/progress/<id>`; the last one repeats. */
  progress: CicdAnswer[];
  /** The answer to `GET /api/sn_cicd/testsuite/results/<id>`. */
  results?: CicdAnswer;
  /**
   * Answers to `GET /api/now/table/<table>`, by table name: a fixed answer, which is what the platform
   * gives when it ignores a condition it cannot apply, or a function of the request's query
   * (`tableOf`), for a table that has to filter.
   */
  tables: Record<string, CicdAnswer | TableAnswer>;
  /** A stateful Table API (ARC-09-C95). When set, it answers every `/api/now/table` request. */
  db?: FakeDb;
}

export type TableAnswer = (query: Record<string, string>) => CicdAnswer;

/**
 * ARC-09-C95 — a Table API that keeps what was written, for tools that write and then read back.
 *
 * Rows hold a reference as the plain sys_id; the columns in `refs` are answered as `{ link, value }`,
 * the shape the Table API gives a reference when no display value is asked for. The hooks are the
 * instance's behaviour under test: what it stores of a write, whether a write's answer echoes what was
 * sent or shows what was stored, the rows it adds itself after an insert, and queries it answers empty.
 */
export interface FakeDb {
  rows: Record<string, Array<Record<string, unknown>>>;
  refs: Record<string, string[]>;
  store?: (table: string, sent: Record<string, unknown>, existing?: Record<string, unknown>) => Record<string, unknown>;
  echo?: 'stored' | 'sent';
  afterInsert?: (table: string, row: Record<string, unknown>, db: FakeDb) => void;
  hide?: (table: string, query: Record<string, string>) => boolean;
  /**
   * Rows the instance answers a query with, whatever the query says — a condition it ignored, or rows
   * that match it on paper and are not the ones asked for. Undefined lets the query run.
   */
  answer?: (table: string, query: Record<string, string>) => Array<Record<string, unknown>> | undefined;
  /** A request the instance refuses, a read or a write: return the refusal to answer with. */
  refuse?: (method: string, table: string) => CicdAnswer | undefined;
  /** How long the instance takes to answer a request, in ms of the test's clock (fake timers). */
  delayMs?: (method: string, table: string) => number;
  /** The last sys_id handed out; the next is this plus one, as 32 hexadecimal characters. */
  seq: number;
}

export const newDb = (rows: FakeDb['rows'] = {}, refs: FakeDb['refs'] = {}): FakeDb => ({ rows, refs, seq: 0 });

/** The next sys_id the fake hands out. */
export function nextId(db: FakeDb): string {
  db.seq += 1;
  return `${'f'.repeat(24)}${db.seq.toString(16).padStart(8, '0')}`;
}

export const ABSENT_MESSAGE = 'Requested URI does not represent any resource';
export const absentBody = { error: { message: ABSENT_MESSAGE, detail: null }, status: 'failure' };

export const newCicdState = (): CicdState => ({ calls: [], progress: [], tables: {} });

export function resetCicd(state: CicdState): void {
  state.calls.length = 0;
  state.progress.length = 0;
  state.run = undefined;
  state.results = undefined;
  for (const k of Object.keys(state.tables)) delete state.tables[k];
  state.db = undefined;
}

/** `{ result: ... }`, the envelope every one of these endpoints answers in. */
export const ok = (result: unknown): CicdAnswer => ({ status: 200, body: { result } });

/** A refusal in the platform's error shape, which the client reads `error.message` from. */
export const refused = (status: number, message: string): CicdAnswer =>
  ({ status, body: { error: { message, detail: null }, status: 'failure' } });

/**
 * A table that filters the way the instance does, for the part of the encoded-query grammar the tools
 * send: conditions joined by `^`, each `field=value` or `fieldINvalue1,value2`
 * (vendor/ServiceNowDocs/markdown/platform-user-interface/c_EncodedQueryStrings.md), and `sysparm_limit`.
 * A reference field compares by its `value`. A condition on a column no row has is IGNORED, because
 * that is what the instance does with "an invalid field name"
 * (vendor/ServiceNowDocs/markdown/api-reference/rest-apis/c_TableAPI.md). Any other operator is a
 * test-authoring error, not a row that silently matches.
 */
export function tableOf(rows: Array<Record<string, unknown>>): TableAnswer {
  return (query) => ok(matching(rows, query));
}

/** The rows `query` selects, as `tableOf` describes, up to `sysparm_limit`. */
export function matching(rows: Array<Record<string, unknown>>, query: Record<string, string>): Array<Record<string, unknown>> {
  const columns = new Set(rows.flatMap((row) => Object.keys(row)));
  const valueOf = (row: Record<string, unknown>, field: string): unknown => {
    const v = row[field];
    return v !== null && typeof v === 'object' ? (v as { value?: unknown }).value : v;
  };
  const conditions = (query.sysparm_query ?? '').split('^').filter(Boolean).flatMap((term) => {
    const m = /^([a-z_]+)(=|IN)(.*)$/.exec(term);
    if (!m) throw new Error(`tableOf: the fake does not evaluate "${term}"`);
    const [, field, op, raw] = m;
    if (!columns.has(field)) return [];
    return [op === 'IN'
      ? (row: Record<string, unknown>) => raw.split(',').includes(String(valueOf(row, field)))
      : (row: Record<string, unknown>) => String(valueOf(row, field)) === raw];
  });
  const limit = Number(query.sysparm_limit) || rows.length;
  return rows.filter((row) => conditions.every((c) => c(row))).slice(0, limit);
}

/** A row as the Table API answers it: only `sysparm_fields` when asked, references as `{ link, value }`. */
function shown(db: FakeDb, table: string, row: Record<string, unknown>, fields?: string): Record<string, unknown> {
  const wanted = fields ? fields.split(',').map((f) => f.trim()) : Object.keys(row);
  const out: Record<string, unknown> = {};
  for (const f of wanted) {
    if (!(f in row)) continue;
    const v = row[f];
    out[f] = (db.refs[table] ?? []).includes(f) && typeof v === 'string' && v !== ''
      ? { link: `https://test.service-now.com/api/now/table/${f}/${v}`, value: v }
      : v;
  }
  return out;
}

function dbAnswer(db: FakeDb, method: string, table: string, id: string | undefined,
  query: Record<string, string>, body: Record<string, unknown> | undefined): CicdAnswer {
  const rows = (db.rows[table] ??= []);
  const at = id === undefined ? -1 : rows.findIndex((r) => r.sys_id === id);
  const refusal = db.refuse?.(method, table);
  if (refusal) return refusal;
  if (method === 'GET' && id !== undefined) {
    return at === -1 ? refused(404, 'No Record found') : ok(shown(db, table, rows[at], query.sysparm_fields));
  }
  if (method === 'GET') {
    if (db.hide?.(table, query)) return ok([]);
    const forced = db.answer?.(table, query);
    return ok((forced ?? matching(rows, query)).map((r) => shown(db, table, r, query.sysparm_fields)));
  }
  const sent = body ?? {};
  if (method === 'POST' && id === undefined) {
    const stored = { ...(db.store ? db.store(table, sent) : sent), sys_id: nextId(db) };
    rows.push(stored);
    db.afterInsert?.(table, stored, db);
    return ok(db.echo === 'sent' ? { ...sent, sys_id: stored.sys_id } : shown(db, table, stored));
  }
  if (method === 'PATCH' && at !== -1) {
    const before = rows[at];
    const stored = { ...(db.store ? db.store(table, sent, before) : { ...before, ...sent }), sys_id: before.sys_id };
    rows[at] = stored;
    return ok(db.echo === 'sent' ? { ...before, ...sent } : shown(db, table, stored));
  }
  return refused(at === -1 ? 404 : 400, 'No Record found');
}

function answerFor(state: CicdState, method: string, path: string, query: Record<string, string>,
  body?: Record<string, unknown>): CicdAnswer {
  const record = /^\/api\/now\/table\/([A-Za-z0-9_]+)(?:\/([0-9a-f]{32}))?$/.exec(path);
  if (state.db && record) return dbAnswer(state.db, method, record[1], record[2], query, body);
  if (method === 'POST' && path === '/api/sn_cicd/testsuite/run') return state.run ?? refused(400, ABSENT_MESSAGE);
  if (method === 'GET' && path.startsWith('/api/sn_cicd/progress/')) {
    const next = state.progress.length > 1 ? state.progress.shift() : state.progress[0];
    return next ?? refused(404, ABSENT_MESSAGE);
  }
  if (method === 'GET' && path.startsWith('/api/sn_cicd/testsuite/results/')) return state.results ?? refused(404, ABSENT_MESSAGE);
  const table = /^\/api\/now\/table\/([A-Za-z0-9_]+)/.exec(path)?.[1];
  const answer = method === 'GET' && table ? state.tables[table] : undefined;
  if (answer) return typeof answer === 'function' ? answer(query) : answer;
  return refused(method === 'GET' ? 404 : 400, ABSENT_MESSAGE);
}

/** The module shape `src/servicenow/http.ts` exports, backed by `state`. */
export function fakeCicdModule(state: CicdState): Record<string, unknown> {
  return {
    snFetch: async (url: string | URL, init: { method?: string; body?: unknown } = {}) => {
      const u = new URL(String(url));
      const method = (init.method ?? 'GET').toUpperCase();
      const query = Object.fromEntries(u.searchParams);
      const body = typeof init.body === 'string' && init.body !== '' ? JSON.parse(init.body) as Record<string, unknown> : undefined;
      state.calls.push({ method, path: u.pathname, query, at: Date.now(), ...(body ? { body } : {}) });
      const delayTable = /^\/api\/now\/table\/([A-Za-z0-9_]+)/.exec(u.pathname)?.[1];
      const delay = delayTable ? state.db?.delayMs?.(method, delayTable) ?? 0 : 0;
      if (delay > 0) await new Promise((resolve) => { setTimeout(resolve, delay); });
      const answer = answerFor(state, method, u.pathname, query, body);
      const text = JSON.stringify(answer.body);
      return {
        ok: answer.status >= 200 && answer.status < 300,
        status: answer.status,
        statusText: '',
        headers: { get: () => null },
        text: async () => text,
        json: async () => answer.body,
      };
    },
    resetHttpDispatcher: () => {},
    proxyConfigured: () => false,
  };
}
