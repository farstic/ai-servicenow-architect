// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C178 — a read names the fields it asked for and did not get.
 *
 * On a PDI (2026-10-17) two `sn_aia` Script Includes came back without a `script` field, with nothing saying so:
 * the platform withholds a Protected script (PN-20). The tools pass on what the instance answers, which is right, but
 * a missing field read as an empty one. When `fields` is passed, the result now carries `fields_not_returned` with the
 * requested fields the answer lacks; the record or records are as returned, and nothing is invented.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetFetchMock, respond, snFetchMockModule, type SnFetchState } from '../helpers/fetch-mock.js';

const http = vi.hoisted<SnFetchState>(() => ({ calls: [], queue: [] }));
vi.mock('../../src/servicenow/http.js', async () => snFetchMockModule(http));

import { ServiceNowClient } from '../../src/servicenow/client.js';
import { dispatchCoreAction } from '../../src/tools/core.js';

const ID = 'a'.repeat(32);
const client = () => new ServiceNowClient({
  instanceUrl: 'https://test.service-now.com', authMethod: 'basic', basic: { username: 'u', password: 'p' },
  maxRetries: 0, retryDelayMs: 0,
});
const ok = (body: unknown) => ({
  ok: true, status: 200, statusText: '', headers: { get: () => null },
  text: async () => JSON.stringify(body), json: async () => body,
});
const read = (args: Record<string, unknown>) =>
  dispatchCoreAction(client(), 'snow_core_record_read', { table: 'sys_script_include', sys_id: ID, ...args });
const query = (args: Record<string, unknown>) =>
  dispatchCoreAction(client(), 'snow_core_records_query', { table: 'sys_script_include', limit: 5, ...args });

beforeEach(() => { resetFetchMock(http); process.env.LOG_LEVEL = 'error'; });

describe('ARC-09-C178 — a read names the requested fields the instance did not return', () => {
  it('snow_core_record_read: `script` asked for and absent is named; the record is as returned', async () => {
    respond(http, ok({ result: { sys_id: ID, name: 'AgentToolM2MDao' } }));
    const result = await read({ fields: 'name, script' });
    expect(result).toMatchObject({ sys_id: ID, name: 'AgentToolM2MDao', fields_not_returned: ['script'] });
    expect(result).not.toHaveProperty('script');
  });

  it('snow_core_records_query: a field no returned record carries is named', async () => {
    respond(http, ok({ result: [{ sys_id: ID, name: 'AgentToolM2MDao' }, { sys_id: 'b'.repeat(32), name: 'AgentVersionDao' }] }));
    const result = await query({ fields: 'name,script' });
    expect(result.fields_not_returned).toEqual(['script']);
    expect(result.records).toHaveLength(2);
  });

  it('control: without `fields`, nothing is added', async () => {
    respond(http, ok({ result: { sys_id: ID, name: 'AgentToolM2MDao' } }));
    expect(await read({})).not.toHaveProperty('fields_not_returned');
    resetFetchMock(http);
    respond(http, ok({ result: [{ sys_id: ID, name: 'AgentToolM2MDao' }] }));
    expect(await query({})).not.toHaveProperty('fields_not_returned');
  });

  it('control: every requested field returned, a dotted one included, adds nothing', async () => {
    respond(http, ok({ result: { sys_id: ID, name: 'X', 'sys_scope.scope': 'sn_aia' } }));
    expect(await read({ fields: 'sys_id,name,sys_scope.scope' })).not.toHaveProperty('fields_not_returned');
  });

  it('control: a query page with no records says nothing about the fields', async () => {
    respond(http, ok({ result: [] }));
    expect(await query({ fields: 'name,script' })).not.toHaveProperty('fields_not_returned');
  });
});
