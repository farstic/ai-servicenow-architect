import type { ServiceNowClient } from '../../src/servicenow/client.js';
import { ServiceNowError } from '../../src/utils/errors.js';

/**
 * A ServiceNow client that RECORDS what was asked of it and serves fixtures back.
 *
 * The throwing proxy used elsewhere answers one question — "did the gate let this through" —
 * and cannot answer the one ARC-04-S07 needs: *which requests, in which order, with which
 * query*. `snow_us_capture_target_set` is a four-step composition whose correctness is
 * entirely in that sequence, and a mock that returned plausible values without recording the
 * calls would pass whether or not the steps happened.
 *
 * Reused by ARC-04-S09.
 */
export interface RecordedCall {
  op: 'get' | 'query' | 'create' | 'update' | 'delete';
  table: string;
  /** The encoded query for `query`, the sys_id for `get`/`update`/`delete`. */
  arg?: string;
  fields?: string;
  data?: Record<string, unknown>;
}

export interface FakeRestOptions {
  /** `get` fixtures keyed `<table>/<sys_id>`. */
  records?: Record<string, Record<string, unknown> | null>;
  /**
   * `query` fixtures keyed `<table>?<query>` — matched exactly, so a test that changes the
   * query it expects has to say so. A miss returns an empty result, which is a real
   * ServiceNow answer rather than a thrown error.
   */
  queries?: Record<string, Array<Record<string, unknown>>>;
  /** What `createRecord` returns, keyed by table. */
  created?: Record<string, Record<string, unknown>>;
  username?: string;
}

export class FakeRestClient {
  readonly calls: RecordedCall[] = [];

  constructor(private readonly opts: FakeRestOptions = {}) {}

  /** The calls, as `op table[:arg]` — the shape an assertion reads most clearly. */
  get sequence(): string[] {
    return this.calls.map((c) => `${c.op} ${c.table}${c.arg ? `:${c.arg}` : ''}`);
  }

  getAuthUsername(): string | undefined {
    return this.opts.username;
  }

  async getRecord(table: string, sysId: string, fields?: string): Promise<Record<string, unknown>> {
    this.calls.push({ op: 'get', table, arg: sysId, fields });
    const hit = this.opts.records?.[`${table}/${sysId}`];
    // A missing fixture returns an empty object, which is how the REST layer reports "no such
    // record" — the tool turns that into NOT_FOUND, and this lets the test exercise that path.
    return hit ?? {};
  }

  async queryRecords(params: { table: string; query?: string; limit?: number; fields?: string }):
  Promise<{ count: number; records: Array<Record<string, unknown>> }> {
    this.calls.push({ op: 'query', table: params.table, arg: params.query, fields: params.fields });
    const records = this.opts.queries?.[`${params.table}?${params.query ?? ''}`] ?? [];
    return { count: records.length, records };
  }

  async createRecord(table: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.calls.push({ op: 'create', table, data });
    return this.opts.created?.[table] ?? { sys_id: `created-${table}`, ...data };
  }

  async updateRecord(table: string, sysId: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.calls.push({ op: 'update', table, arg: sysId, data });
    return { sys_id: sysId, ...data };
  }

  async deleteRecord(table: string, sysId: string): Promise<Record<string, unknown>> {
    this.calls.push({ op: 'delete', table, arg: sysId });
    return { sys_id: sysId };
  }

  /** Any method a tool reaches that this fake does not implement is a test-authoring bug. */
  asClient(): ServiceNowClient {
    return new Proxy(this, {
      get(target, prop, receiver) {
        if (prop in target) return Reflect.get(target, prop, receiver);
        return () => {
          throw new Error(
            `FakeRestClient: the tool called client.${String(prop)}(), which the fake does not `
            + 'implement — add it rather than letting the test pass on a silent undefined');
        };
      },
    }) as unknown as ServiceNowClient;
  }
}

/**
 * ARC-07-S03's fake, beside ARC-04-S07's rather than instead of it.
 *
 * `FakeRestClient` above answers "which requests, in which order, with which query" and serves
 * fixture ROWS. The probes need a different question answered: WHAT STATUS came back, and HOW
 * MANY requests were made. "Never retries a 401" is the difference between a failed probe and an
 * account three attempts closer to a lockout, and no returned value can express a request that
 * did not happen — only a counter can.
 *
 * The error shape is the client's own — `ServiceNowError` with `details.status` — so a probe that
 * reads it here reads exactly what it reads in production.
 */
export interface FakeRoute {
  status: number;
  /** Rows a 200 returns. Absent means one row; an empty array means a 200 with no rows. */
  records?: unknown[];
  /** Thrown instead of answering — a network failure, with `cause.code`. */
  throws?: unknown;
}

export interface FakeRest {
  queryRecords(params: { table: string; query?: string; fields?: string; limit?: number }):
  Promise<{ count: number; records: unknown[] }>;
  /** Every table asked for, in order. */
  readonly calls: string[];
  countOf(table: string): number;
}

const STATUS_CODE: Record<number, string> = {
  401: 'AUTHENTICATION_FAILED',
  403: 'INSUFFICIENT_PRIVILEGES',
  404: 'NOT_FOUND',
  429: 'RATE_LIMITED',
};

export function fakeRest(routes: Record<string, FakeRoute | FakeRoute[]>): FakeRest {
  const calls: string[] = [];
  // A route may be an ARRAY: successive answers for successive calls. That is how "would succeed
  // on the second call" is expressed — the fixture for the test proving the second call is never
  // made.
  const queues = new Map<string, FakeRoute[]>(
    Object.entries(routes).map(([k, v]) => [k, Array.isArray(v) ? [...v] : [v]]),
  );

  return {
    calls,
    countOf: (table: string) => calls.filter((c) => c === table).length,
    async queryRecords({ table }: { table: string }) {
      calls.push(table);
      const queue = queues.get(table);
      if (!queue || queue.length === 0) {
        throw new ServiceNowError(`no fake route for ${table}`, 'NOT_FOUND', { status: 404 });
      }
      const route = queue.length > 1 ? (queue.shift() as FakeRoute) : queue[0];
      if (route.throws) throw route.throws;
      if (route.status >= 400) {
        throw new ServiceNowError(`HTTP ${route.status}`,
          (STATUS_CODE[route.status] ?? 'REQUEST_FAILED') as never, { status: route.status });
      }
      const records = route.records ?? [{ sys_id: '0'.repeat(32) }];
      return { count: records.length, records };
    },
  };
}

/** undici's shape for a socket failure, for the `unreachable` path. */
export const networkFailure = (code: string): Error =>
  Object.assign(new TypeError('fetch failed'), { cause: { code } });

/**
 * ARC-07-S05 — the same routes, over a real socket.
 *
 * The integration tests SPAWN the built CLI, so the fake has to be something a separate process
 * can talk to. It binds `127.0.0.1` on a RANDOM port (`listen(0)`): a fixed port makes two test
 * files on one machine fight, and a fixed port makes CI flaky in the way that gets blamed on the
 * code under test.
 *
 * It counts requests for the same reason the in-process fake does: "never retries a 401" is a
 * claim about a request that did not happen.
 */
export interface FakeRestServer {
  /** `http://127.0.0.1:<port>` — pass this as the instance URL. */
  readonly url: string;
  /** Every path requested, in order. */
  readonly requests: string[];
  countOf(fragment: string): number;
  close(): Promise<void>;
}

export interface ServerRoute {
  status: number;
  /** The `result` array a table request answers with. Default: one row. */
  records?: unknown[];
  /** A body for a non-table endpoint (the OAuth token, for instance). */
  body?: unknown;
}

export async function fakeRestServer(
  routes: Record<string, ServerRoute | ServerRoute[]>,
): Promise<FakeRestServer> {
  const { createServer } = await import('node:http');
  const requests: string[] = [];
  const queues = new Map<string, ServerRoute[]>(
    Object.entries(routes).map(([k, v]) => [k, Array.isArray(v) ? [...v] : [v]]),
  );

  const pick = (path: string): ServerRoute | undefined => {
    for (const [key, queue] of queues) {
      if (!path.includes(key) || queue.length === 0) continue;
      return queue.length > 1 ? (queue.shift() as ServerRoute) : queue[0];
    }
    return undefined;
  };

  const server = createServer((req, res) => {
    const path = req.url ?? '';
    requests.push(path);
    const route = pick(path);
    if (!route) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'no fake route' } }));
      return;
    }
    res.writeHead(route.status, { 'content-type': 'application/json' });
    if (route.body !== undefined) { res.end(JSON.stringify(route.body)); return; }
    const records = route.records ?? [{ sys_id: '0'.repeat(32) }];
    res.end(JSON.stringify(route.status >= 400
      ? { error: { message: `HTTP ${route.status}` } }
      : { result: records }));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    countOf: (fragment: string) => requests.filter((r) => r.includes(fragment)).length,
    close: () => new Promise<void>((resolve) => { server.close(() => resolve()); }),
  };
}
