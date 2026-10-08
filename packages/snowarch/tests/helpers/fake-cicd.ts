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
}

export type TableAnswer = (query: Record<string, string>) => CicdAnswer;

export const ABSENT_MESSAGE = 'Requested URI does not represent any resource';
export const absentBody = { error: { message: ABSENT_MESSAGE, detail: null }, status: 'failure' };

export const newCicdState = (): CicdState => ({ calls: [], progress: [], tables: {} });

export function resetCicd(state: CicdState): void {
  state.calls.length = 0;
  state.progress.length = 0;
  state.run = undefined;
  state.results = undefined;
  for (const k of Object.keys(state.tables)) delete state.tables[k];
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
  const columns = new Set(rows.flatMap((row) => Object.keys(row)));
  const valueOf = (row: Record<string, unknown>, field: string): unknown => {
    const v = row[field];
    return v !== null && typeof v === 'object' ? (v as { value?: unknown }).value : v;
  };
  return (query) => {
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
    return ok(rows.filter((row) => conditions.every((c) => c(row))).slice(0, limit));
  };
}

function answerFor(state: CicdState, method: string, path: string, query: Record<string, string>): CicdAnswer {
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
    snFetch: async (url: string | URL, init: { method?: string } = {}) => {
      const u = new URL(String(url));
      const method = (init.method ?? 'GET').toUpperCase();
      const query = Object.fromEntries(u.searchParams);
      state.calls.push({ method, path: u.pathname, query, at: Date.now() });
      const answer = answerFor(state, method, u.pathname, query);
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
