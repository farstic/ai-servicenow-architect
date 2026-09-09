import type { ServiceNowClient } from '../../src/servicenow/client.js';

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
