import { describe, expect, it } from 'vitest';
import {
  attachWarnings, beginStep, capWarnings, withWriteVerification, type CutValueWarning,
} from '../../src/servicenow/stored-values.js';
import { summariseWarnings } from '../../src/audit/warnings.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';
import { routeToolInvocation } from '../../src/tools/index.js';
import { withPreset } from '../helpers/preset.js';
import { runWithInstance, type Flags, type InstanceRuntime } from '../../src/servicenow/context.js';
import { expandPreset } from '../../src/utils/permissions.js';

withPreset('full');

/**
 * ARC-09-C100 - the cut check (ARC-09-C93) saw `createRecord` and `updateRecord` and nothing else.
 *
 * Measured in `src/servicenow/client.ts`, the methods that send a write:
 *
 *   createRecord, updateRecord   checked since C93
 *   batchRequest                 POST /api/now/v1/batch: carries POST/PATCH/PUT to ANY table, and each
 *                                answer echoes the stored record - checkable, and not checked
 *   uploadAttachment             creates a sys_attachment row; the answer echoes `file_name`
 *   createChangeRequest          POST /table/change_request; the answer is the stored record
 *   withUser                     a copy of the real client: a write through it skipped the wrapper
 *   callNowAssist                POSTs that RUN something (a skill, a prediction, an order). The answer
 *                                is the action's result, not an echo of what was written, so there is
 *                                nothing to compare a sent value with. Not covered, on purpose.
 *
 * The other half of the row is where the warnings land and how many there are, below.
 */

const LONG = 'abcdefghij';
const SYS = 'a'.repeat(32);
const cut = (v: unknown) => (typeof v === 'string' ? v.slice(0, 5) : v);
const cutAll = (d: Record<string, unknown>) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, cut(v)]));

/** What `client.batchRequest` returns: the answers, each with a body of whatever shape the platform used. */
interface BatchAnswer { batch_id: string; total: number; results: Array<{ id: string; status_code: number; body: unknown }> }

/** A client with the five write methods; every write stores strings cut to 5 characters. */
class Wide {
  lookups: unknown[] = [];
  as: unknown;
  /** Per operation id: a status code other than the one the method would give. */
  statusOf: Record<string, number> = {};
  async createRecord(_t: string, data: Record<string, unknown>) { return { sys_id: 'n1', ...cutAll(data) }; }
  async updateRecord(_t: string, sysId: string, data: Record<string, unknown>) { return { sys_id: sysId, ...cutAll(data) }; }
  async queryRecords(p: unknown) { this.lookups.push(p); return { count: 0, records: [] }; }
  async createChangeRequest(params: Record<string, unknown>) { return { sys_id: 'cr1', ...cutAll(params) }; }
  async uploadAttachment(table: string, sysId: string, fileName: string, _contentType?: string, _contentBase64?: string) {
    return { sys_id: 'at1', file_name: cut(fileName), table_name: table, table_sys_id: sysId };
  }
  async batchRequest(ops: Array<{ id: string; method: string; url: string; body?: Record<string, unknown> }>): Promise<BatchAnswer> {
    return {
      batch_id: 'b1', total: ops.length,
      results: ops.map((op) => ({
        id: op.id,
        status_code: this.statusOf[op.id] ?? (op.method === 'POST' ? 201 : 200),
        body: { result: { sys_id: /([0-9a-f]{32})/.exec(op.url)?.[1] ?? 'n1', ...cutAll(op.body ?? {}) } },
      })),
    };
  }
  withUser(options: unknown): Wide {
    const copy = Object.create(Object.getPrototypeOf(this)) as Wide;
    Object.assign(copy, this);
    copy.as = options;
    return copy;
  }
}
const asClient = (c: unknown) => c as ServiceNowClient;
const wrap = () => { const real = new Wide(); return { real, v: withWriteVerification(asClient(real)) }; };
const w = (c: ServiceNowClient) => c as unknown as Wide;

describe('ARC-09-C100 - the Batch API (it can write any table)', () => {
  it('a POST and a PATCH in one batch are each checked against what the batch says was stored', async () => {
    const { v } = wrap();
    const out = await w(v.client).batchRequest([
      { id: 'a', method: 'POST', url: '/api/now/table/u_t', body: { name: LONG } },
      { id: 'b', method: 'PATCH', url: `/api/now/table/u_other/${SYS}`, body: { label: LONG } },
    ]);
    expect(out.total).toBe(2);                                   // the batch result is returned untouched
    expect((out.results[0]!.body as { result: Record<string, unknown> }).result.name).toBe('abcde');
    const warnings = await v.settle();
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toMatchObject({ operation: 'create', table: 'u_t', field: 'name', sent_length: 10, stored_length: 5 });
    expect(warnings[1]).toMatchObject({ operation: 'update', table: 'u_other', field: 'label', sys_id: SYS });
  });

  // vendor/ServiceNowDocs/markdown/api-reference/rest-apis/batch-api.md: `serviced_requests.body` is
  // "Base64 encoded body of the response. To get the value of the body, Base64 decode the content".
  // `client.batchRequest` does not decode it (it tries JSON.parse, which fails on base64, and returns
  // the string as it came), so on a real instance this is the shape the check is given. The fake above
  // returns parsed objects, which is not what the platform sends.
  describe('the body as the documented API sends it', () => {
    const encode = (o: unknown): string => Buffer.from(JSON.stringify(o), 'utf8').toString('base64');
    const batchOf = (bodyOf: (record: Record<string, unknown>) => unknown) => {
      const { real, v } = wrap();
      real.batchRequest = async (ops) => ({
        batch_id: 'b1', total: ops.length,
        results: ops.map((op) => ({ id: op.id, status_code: 201, body: bodyOf({ sys_id: 'n1', ...cutAll(op.body ?? {}) }) })),
      });
      return v;
    };
    const op = { id: 'a', method: 'POST', url: '/api/now/table/u_t', body: { name: LONG } };

    it('a Base64 body is decoded and the cut is found', async () => {
      const v = batchOf((record) => encode({ result: record }));
      await w(v.client).batchRequest([op]);
      expect(await v.settle()).toMatchObject([{ table: 'u_t', field: 'name', sent_length: 10, stored_length: 5 }]);
    });

    it('a body that is JSON text is read as it is', async () => {
      const v = batchOf((record) => JSON.stringify({ result: record }));
      await w(v.client).batchRequest([op]);
      expect(await v.settle()).toHaveLength(1);
    });

    it.each([
      ['Base64 of something that is not JSON', Buffer.from('<response/>').toString('base64')],
      ['text that is neither', '%%% not a body %%%'],
      ['Base64 of a JSON string', encode('text')],
      ['Base64 of a JSON number', encode(7)],
      ['an empty string', ''],
    ])('%s cannot be compared, and is ignored without failing the batch', async (_label, body) => {
      const v = batchOf(() => body);
      await expect(w(v.client).batchRequest([op])).resolves.toMatchObject({ total: 1 });
      expect(await v.settle()).toEqual([]);
    });
  });

  it('a PUT is an update; a versioned path and a query string still name the table', async () => {
    const { v } = wrap();
    await w(v.client).batchRequest([
      { id: 'a', method: 'put', url: `api/now/v2/table/u_t/${SYS}?sysparm_fields=name`, body: { name: LONG } },
    ]);
    expect(await v.settle()).toMatchObject([{ operation: 'update', table: 'u_t', sys_id: SYS }]);
  });

  it.each([
    ['a GET', { id: 'g', method: 'GET', url: '/api/now/table/u_t' }],
    ['a path that is not a table', { id: 'x', method: 'POST', url: '/api/now/attachment/file', body: { name: LONG } }],
    ['a table path with a further segment', { id: 'y', method: 'POST', url: '/api/now/table/u_t/extra/more', body: { name: LONG } }],
    ['a body that is not an object', { id: 'z', method: 'POST', url: '/api/now/table/u_t', body: 'text' }],
  ])('%s is not a write the check can compare, and is ignored', async (_label, op) => {
    const { v } = wrap();
    await w(v.client).batchRequest([op as never]);
    expect(await v.settle()).toEqual([]);
  });

  it('an operation the platform refused stored nothing, so it cannot have stored a cut value', async () => {
    const { real, v } = wrap();
    real.statusOf = { a: 403, b: 500 };
    await w(v.client).batchRequest([
      { id: 'a', method: 'POST', url: '/api/now/table/u_t', body: { name: LONG } },
      { id: 'b', method: 'PATCH', url: `/api/now/table/u_t/${SYS}`, body: { name: LONG } },
    ]);
    expect(await v.settle()).toEqual([]);
  });

  it('a batch that stored everything warns about nothing and never reaches the dictionary', async () => {
    const { real, v } = wrap();
    await w(v.client).batchRequest([{ id: 'a', method: 'POST', url: '/api/now/table/u_t', body: { name: 'abc' } }]);
    expect(await v.settle()).toEqual([]);
    expect(real.lookups).toHaveLength(0);
  });

  it('an odd answer cannot turn a successful batch into a failure', async () => {
    const { real, v } = wrap();
    for (const odd of [undefined, null, 'ok', { results: 'no' }, { results: [null, 1, { id: 'a' }] }]) {
      real.batchRequest = async () => odd as never;
      await expect(w(v.client).batchRequest([{ id: 'a', method: 'POST', url: '/api/now/table/u_t', body: { name: LONG } }]))
        .resolves.toBe(odd);
    }
    expect(await v.settle()).toEqual([]);
  });

  it('an error from the batch itself propagates unchanged and records nothing', async () => {
    const { real, v } = wrap();
    real.batchRequest = async () => { throw new Error('BATCH_FAILED'); };
    await expect(w(v.client).batchRequest([])).rejects.toThrow('BATCH_FAILED');
    expect(await v.settle()).toEqual([]);
  });
});

describe('ARC-09-C100 - the other write methods', () => {
  it('an attachment whose file name was cut warns, on sys_attachment.file_name', async () => {
    const { v } = wrap();
    const stored = await w(v.client).uploadAttachment('incident', SYS, LONG, 'text/plain', 'aGk=');
    expect(stored.file_name).toBe('abcde');
    expect(await v.settle()).toMatchObject([{ operation: 'create', table: 'sys_attachment', field: 'file_name', sent_length: 10, stored_length: 5 }]);
  });

  it('an attachment stored whole warns about nothing', async () => {
    const { v } = wrap();
    await w(v.client).uploadAttachment('incident', SYS, 'a.txt', 'text/plain', 'aGk=');
    expect(await v.settle()).toEqual([]);
  });

  it('a change request created with a cut value warns, on change_request', async () => {
    const { v } = wrap();
    await w(v.client).createChangeRequest({ short_description: LONG, type: 'new' });
    expect(await v.settle()).toMatchObject([{ operation: 'create', table: 'change_request', field: 'short_description' }]);
  });

  it('a client copy made with withUser is wrapped too, and shares the invocation\'s list', async () => {
    const { real, v } = wrap();
    const copy = w(v.client).withUser({ sysId: SYS });
    expect((copy as unknown as Wide).as).toEqual({ sysId: SYS });          // the copy is the real withUser's
    await (copy as unknown as Wide).createRecord('u_t', { name: LONG });
    expect(await v.settle()).toMatchObject([{ table: 'u_t', field: 'name' }]);
    expect(real.lookups).toHaveLength(1);
  });

  it('...and a copy of a copy', async () => {
    const { v } = wrap();
    const twice = w(w(v.client).withUser({ sysId: SYS }) as unknown as ServiceNowClient).withUser({ bearerToken: 't' });
    await (twice as unknown as Wide).updateRecord('u_t', SYS, { name: LONG });
    expect(await v.settle()).toHaveLength(1);
  });

  it('callNowAssist is NOT claimed: it is passed through and records nothing', async () => {
    const { real, v } = wrap();
    (real as unknown as { callNowAssist: (e: string, p: unknown) => Promise<unknown> }).callNowAssist = async (_e, p) => ({ echoed: p });
    await (v.client as never as { callNowAssist: (e: string, p: unknown) => Promise<unknown> }).callNowAssist('/api/sn_assist/skill/invoke', { name: LONG });
    expect(await v.settle()).toEqual([]);
  });
});

describe('ARC-09-C100 - a step of a larger call owns the warnings of its own writes', () => {
  it('beginStep on a client that is not wrapped is null', () => {
    expect(beginStep(asClient(new Wide()))).toBeNull();
  });

  it('only the writes since the mark belong to the step; the owner still reports all of them, tagged', async () => {
    const { v } = wrap();
    await v.client.createRecord('u_before', { name: LONG });
    const scope = beginStep(v.client)!;
    await v.client.createRecord('u_during', { name: LONG });
    const stepWarnings = await scope.end({ step: 1, tool: 'snow_core_record_add' });
    await v.client.createRecord('u_after', { name: LONG });

    expect(stepWarnings).toHaveLength(1);
    expect(stepWarnings[0]).toMatchObject({ table: 'u_during', step: 1, tool: 'snow_core_record_add' });

    const all = await v.settle();
    expect(all.map((x) => x.table).sort()).toEqual(['u_after', 'u_before', 'u_during']);     // reported once each
    expect(all.find((x) => x.table === 'u_during')).toMatchObject({ step: 1, tool: 'snow_core_record_add' });
    expect(all.find((x) => x.table === 'u_before')!.step).toBeUndefined();
    expect(all.find((x) => x.table === 'u_after')!.step).toBeUndefined();
  });

  it('a step that wrote nothing cut is an empty list, and asks the dictionary nothing', async () => {
    const { real, v } = wrap();
    const scope = beginStep(v.client)!;
    await v.client.createRecord('u_t', { name: 'abc' });
    expect(await scope.end({ step: 0, tool: 't' })).toEqual([]);
    expect(real.lookups).toHaveLength(0);
  });

  it('ending a step twice returns nothing the second time', async () => {
    const { v } = wrap();
    const scope = beginStep(v.client)!;
    await v.client.createRecord('u_t', { name: LONG });
    expect(await scope.end({ step: 0, tool: 't' })).toHaveLength(1);
    expect(await scope.end({ step: 0, tool: 't' })).toEqual([]);
  });
});

describe('ARC-09-C100 - the list is capped, and nothing is lost from the count', () => {
  const many = async (n: number, tableOf: (i: number) => string = () => 'u_bulk') => {
    const { v } = wrap();
    for (let i = 0; i < n; i += 1) await v.client.createRecord(tableOf(i), { name: LONG });
    return v.settle();
  };

  it('ten warnings or fewer are returned whole', async () => {
    const warnings = await many(10);
    expect(attachWarnings({ ok: true }, warnings)).toMatchObject({ warnings: warnings });
    expect((attachWarnings({ ok: true }, warnings) as { warnings: unknown[] }).warnings).toHaveLength(10);
  });

  it('fifty warnings become nine whole ones and one roll-up that says how many it stands for', async () => {
    const warnings = await many(50);
    expect(warnings).toHaveLength(50);                           // the owner still holds every one
    const out = attachWarnings({ ok: true }, warnings) as { warnings: Array<Record<string, any>> };
    expect(out.warnings).toHaveLength(10);
    expect(out.warnings.slice(0, 9).every((x) => typeof x.sent_length === 'number')).toBe(true);
    const rollup = out.warnings[9]!;
    expect(rollup).toMatchObject({ code: 'VALUE_TRUNCATED', rollup: true, count: 41, table: 'u_bulk' });
    expect(rollup.fields).toEqual(['name']);
    expect(String(rollup.message)).toMatch(/41 more/);
    // fifty whole warnings are ~35 KB; the capped list is bounded by the nine it keeps
    expect(JSON.stringify(out).length).toBeLessThan(10000);
  });

  it('a roll-up over several tables names them instead of one', async () => {
    const warnings = await many(30, (i) => `u_t${i % 3}`);
    const rollup = (attachWarnings({}, warnings) as { warnings: Array<Record<string, any>> }).warnings[9]!;
    expect(rollup.rollup).toBe(true);
    expect(rollup.table).toBeUndefined();
    expect(rollup.tables).toEqual(['u_t0', 'u_t1', 'u_t2'].filter((t) => rollup.tables.includes(t)));
    expect(rollup.tables.length).toBeGreaterThan(1);
  });

  it('the audit summary still counts every write the roll-up stands for', async () => {
    const warnings = await many(50);
    const out = attachWarnings({ ok: true }, warnings) as { warnings: unknown[] };
    const summary = summariseWarnings(out.warnings);
    expect(summary.reduce((n, g) => n + g.count, 0)).toBe(50);
    expect(summary).toMatchObject([{ code: 'VALUE_TRUNCATED', table: 'u_bulk', fields: ['name'], count: 50 }]);
  });

  it('capping a list that already holds a roll-up adds the counts, so no write is lost between caps', async () => {
    const once = capWarnings(await many(50));                       // nine whole + a roll-up of 41
    const more = await many(10);
    const twice = capWarnings([...once, ...more] as never[]) as Array<Record<string, any>>;
    expect(twice).toHaveLength(10);
    expect(twice[9]).toMatchObject({ rollup: true, count: 51 });     // 41 already rolled up + 10 new, after nine kept
    expect(twice.slice(0, 9).length + twice[9]!.count).toBe(60);     // 50 + 10 writes, all accounted for
  });

  it('a roll-up count that is not a count is read as one write, not trusted', () => {
    const odd = [{ code: 'VALUE_TRUNCATED', table: 'u_t', count: -5 }, { code: 'VALUE_TRUNCATED', table: 'u_t', count: 'many' },
      { code: 'VALUE_TRUNCATED', table: 'u_t', count: 2.5 }, { code: 'VALUE_TRUNCATED', table: 'u_t' }];
    expect(summariseWarnings(odd)).toMatchObject([{ count: 4 }]);
  });

  it('warnings a tool put on its own result stay ahead of the capped list', () => {
    const prior = { code: 'FIELD_NOT_STORED', table: 'sys_script', field: 'filter_condition', message: 'm' };
    const list = Array.from({ length: 15 }, (_v, i) => ({ code: 'VALUE_TRUNCATED', table: 'u_t', field: 'name', operation: 'create', sent_length: 10, stored_length: 5, column_limit: 5, confirmed: false, message: String(i) })) as unknown as CutValueWarning[];
    const out = attachWarnings({ warnings: [prior] }, list) as { warnings: Array<Record<string, any>> };
    expect(out.warnings[0]).toEqual(prior);
    expect(out.warnings.length).toBeLessThanOrEqual(11);
  });
});

describe('ARC-09-C100 - through the tool that carries the batch (`snow_fluent_request_batch`)', () => {
  it('the warning for a cut value in a batched write arrives on the tool\'s result', async () => {
    const flags: Flags = expandPreset('full');
    const rt: InstanceRuntime = {
      label: 'pdi', url: 'https://dev1.service-now.com', environment: 'pdi', preset: 'full',
      flags, effectiveFlags: flags, toolPackage: 'full', maxRecords: 100, prodWriteAck: false,
      client: {} as InstanceRuntime['client'], warnings: [],
    };
    const real = new Wide();
    const result = await runWithInstance(rt, () => routeToolInvocation(asClient(real), 'snow_fluent_request_batch', {
      operations: [{ id: 'a', method: 'POST', url: '/api/now/table/u_t', body: { name: LONG } }],
    })) as Record<string, any>;
    expect(result.total).toBe(1);
    expect(result.warnings).toMatchObject([{ code: 'VALUE_TRUNCATED', operation: 'create', table: 'u_t', field: 'name' }]);
  });
});
