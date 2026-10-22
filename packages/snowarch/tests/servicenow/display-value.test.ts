// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C205 — `display_value` on the two read tools: 'false', the default and today's request, or 'all', the stored
 * value and the label of every field, passed through as the instance sends them. 'true' is refused, with its reason.
 *
 * The owner's live read on 2.2.1 returned state 6, priority 3 and a group sys_id: codes a person cannot read, and a
 * second call for the labels. His probe (2026-10-22, a maintainer's PDI, one read-only GET through a 2.2.3-rc.1
 * install's own client) gave the shape under `sysparm_display_value=all`: every field is { display_value, value }, and
 * a reference adds `link`. The stubs take that shape: a string, a choice, a reference with its link, and a date.
 *
 * Every case runs through the router, as a caller meets the tool: the router refuses an undeclared argument first
 * (ARC-09-C121), and every read passes the write-verification wrapper, which must leave a read's answer untouched.
 * The owner's third rule, that nothing working today may change, is asserted byte for byte: the URL as a string and the
 * answer as the JSON text the server sends.
 *
 * The fetch mock REPEATS a lone last queued answer rather than consuming it (tests/helpers/fetch-mock.ts), so a case
 * that makes several calls resets it and queues one answer before each call, or the next call gets the last answer.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { respond, resetFetchMock, snFetchMockModule, type SnFetchState } from '../helpers/fetch-mock.js';
import { useLicensedSession } from '../helpers/licensed-session.js';

const http = vi.hoisted<SnFetchState>(() => ({ calls: [], queue: [] }));
vi.mock('../../src/servicenow/http.js', async () => snFetchMockModule(http));

useLicensedSession();

function setEnv() {
  process.env.SERVICENOW_INSTANCE_URL = 'https://dummy.service-now.com';
  process.env.SERVICENOW_AUTH_METHOD = 'basic';
  process.env.SERVICENOW_BASIC_USERNAME = 'd';
  process.env.SERVICENOW_BASIC_PASSWORD = 'd';
  process.env.LOG_LEVEL = 'error';
  delete process.env.MAX_RECORDS;
}

const GROUP = 'a'.repeat(32);
const RECORD_ID = 'b'.repeat(32);

/** One record under `all`, in the probe's shape: a string, a choice, a reference with its link, and a date. */
const ALL_RECORD = {
  number: { display_value: 'INC0010001', value: 'INC0010001' },
  state: { display_value: 'In Progress', value: '2' },
  assignment_group: {
    display_value: 'Service Desk', link: `https://dummy.service-now.com/api/now/table/sys_user_group/${GROUP}`, value: GROUP,
  },
  opened_at: { display_value: '22.10.2026 10:31:12', value: '2026-10-22 08:31:12' },
};

/** The same record without `all`: the stored values only, as every read returns them today. */
const STORED_RECORD = { number: 'INC0010001', state: '2', assignment_group: GROUP, opened_at: '2026-10-22 08:31:12' };

const FIELDS = 'number,state,assignment_group,opened_at';
const BASE = 'https://dummy.service-now.com/api/now/table/incident';

/** One answer from the instance, with `X-Total-Count` when `total` is given. */
function answer(result: unknown, total: string | null = null): void {
  const body = JSON.stringify({ result });
  respond(http, {
    ok: true, status: 200, json: async () => JSON.parse(body), text: async () => body,
    headers: { get: (k: string) => (k.toLowerCase() === 'x-total-count' ? total : null) },
  });
}

/** A tool through the router, as a caller meets it. */
async function tool(name: string, args: Record<string, unknown>): Promise<Record<string, any>> {
  const { instanceManager } = await import('../../src/servicenow/instances.js');
  const { routeToolInvocation } = await import('../../src/tools/index.js');
  return routeToolInvocation(instanceManager.getClient(), name, args) as Promise<Record<string, any>>;
}

const lastUrl = (): string => http.calls.at(-1)!.url;

beforeEach(() => { setEnv(); resetFetchMock(http); });
afterEach(() => vi.restoreAllMocks());

describe('ARC-09-C205 — nothing that works today changes: no display_value, today\'s request and today\'s answer', () => {
  it('the query sends the same URL and returns the same JSON text', async () => {
    answer([STORED_RECORD], '1');
    const r = await tool('snow_core_records_query', { table: 'incident', fields: FIELDS, limit: 1 });
    expect(lastUrl()).toBe(`${BASE}?sysparm_fields=number%2Cstate%2Cassignment_group%2Copened_at&sysparm_limit=1`);
    expect(JSON.stringify(r)).toBe(JSON.stringify({
      count: 1, records: [STORED_RECORD], limit: 1, offset: 0, total: 1, truncated: false,
      summary: 'Found 1 record(s) in "incident"',
    }));
  });

  it('the read sends the same URL and returns the same JSON text', async () => {
    answer(STORED_RECORD);
    const r = await tool('snow_core_record_read', { table: 'incident', sys_id: RECORD_ID, fields: FIELDS });
    expect(lastUrl()).toBe(`${BASE}/${RECORD_ID}?sysparm_fields=number%2Cstate%2Cassignment_group%2Copened_at`);
    expect(JSON.stringify(r)).toBe(JSON.stringify(STORED_RECORD));
  });

  it('display_value \'false\', and false, send exactly the request with none', async () => {
    // One answer per call, reset first: the mock repeats a lone last entry rather than consuming it.
    for (const display_value of ['false', false]) {
      resetFetchMock(http);
      answer([STORED_RECORD], '1');
      await tool('snow_core_records_query', { table: 'incident', fields: FIELDS, limit: 1, display_value });
      expect(lastUrl()).toBe(`${BASE}?sysparm_fields=number%2Cstate%2Cassignment_group%2Copened_at&sysparm_limit=1`);
      resetFetchMock(http);
      answer(STORED_RECORD);
      await tool('snow_core_record_read', { table: 'incident', sys_id: RECORD_ID, fields: FIELDS, display_value });
      expect(lastUrl()).toBe(`${BASE}/${RECORD_ID}?sysparm_fields=number%2Cstate%2Cassignment_group%2Copened_at`);
    }
  });
});

describe('ARC-09-C205 — display_value \'all\': the stored value and the label, passed through', () => {
  it('the query adds exactly sysparm_display_value=all, and its answer keeps counting as before', async () => {
    answer([ALL_RECORD], '3');
    const r = await tool('snow_core_records_query',
      { table: 'incident', fields: `${FIELDS},impact`, limit: 1, display_value: 'all' });
    expect(lastUrl()).toBe(
      `${BASE}?sysparm_fields=number%2Cstate%2Cassignment_group%2Copened_at%2Cimpact&sysparm_limit=1&sysparm_display_value=all`);
    // Passed through, not reshaped: each field as the instance sent it, the date's two forms included.
    expect(r.records).toEqual([ALL_RECORD]);
    expect([r.count, r.total, r.offset, r.limit, r.truncated]).toEqual([1, 3, 0, 1, true]);
    expect(r.summary).toBe('Found 1 record(s) in "incident"; 2 more match: read on with offset 1');
    // By key: an asked field no record carries is named, and a field present as an object is not.
    expect(r.fields_not_returned).toEqual(['impact']);
  });

  it('the read adds exactly sysparm_display_value=all, and passes the record through', async () => {
    answer(ALL_RECORD);
    const r = await tool('snow_core_record_read',
      { table: 'incident', sys_id: RECORD_ID, fields: `${FIELDS},impact`, display_value: 'all' });
    expect(lastUrl()).toBe(
      `${BASE}/${RECORD_ID}?sysparm_fields=number%2Cstate%2Cassignment_group%2Copened_at%2Cimpact&sysparm_display_value=all`);
    expect(r).toEqual({ ...ALL_RECORD, fields_not_returned: ['impact'] });
  });

  it('the server\'s cap drops whole records from the end, and says why, with every kept field intact', async () => {
    const { capResult } = await import('../../src/utils/result-size.js');
    const records = Array.from({ length: 50 }, () => ALL_RECORD);
    const capped = capResult({ count: 50, records, truncated: false, summary: 'Found 50 record(s) in "incident"' }, 4000);
    expect(capped.truncated).toBe(true);
    expect(capped.strategy).toBe('records');
    const body = JSON.parse(capped.text);
    expect(body.returned).toBeLessThan(50);
    expect(body.total_fetched).toBe(50);
    expect(body.hint).toBe('Narrow the query or lower `limit`; the dropped records were taken from the end.');
    for (const kept of body.records) expect(kept).toEqual(ALL_RECORD);
  });
});

describe('ARC-09-C205 — \'true\' and anything else are refused before any request', () => {
  // Each tool's own arguments: the query does not declare sys_id, and the router would refuse it first.
  const argsOf = (name: string, display_value: unknown): Record<string, unknown> => (name === 'snow_core_record_read'
    ? { table: 'incident', sys_id: RECORD_ID, fields: FIELDS, display_value }
    : { table: 'incident', fields: FIELDS, display_value });
  for (const name of ['snow_core_records_query', 'snow_core_record_read']) {
    it(`${name}: 'true', and true, are refused with the reason`, async () => {
      for (const display_value of ['true', true]) {
        resetFetchMock(http);
        const call = tool(name, argsOf(name, display_value));
        await expect(call).rejects.toMatchObject({
          code: 'INVALID_REQUEST',
          message: 'display_value \'true\' is refused: it returns labels only, without the stored values, and dates in '
            + 'the user\'s time zone that would shift if written back. Pass \'all\' for both.',
        });
        expect(http.calls).toHaveLength(0);
      }
    });

    it(`${name}: any other value is refused`, async () => {
      resetFetchMock(http);
      const call = tool(name, argsOf(name, 'labels'));
      await expect(call).rejects.toMatchObject({ code: 'INVALID_REQUEST', message: 'display_value is \'false\' or \'all\'' });
      expect(http.calls).toHaveLength(0);
    });
  }
});

describe('ARC-09-C205 — the schema: both tools declare display_value, with the one presentation instruction', () => {
  it('snow_core_records_query and snow_core_record_read carry the same property', async () => {
    const { coreToolManifest } = await import('../../src/tools/core.js');
    const tools = coreToolManifest();
    for (const name of ['snow_core_records_query', 'snow_core_record_read']) {
      const property = tools.find((t) => t.name === name)?.inputSchema.properties?.display_value;
      expect(property, name).toEqual({
        type: 'string',
        enum: ['false', 'all'],
        description: 'For a list a person will read, pass display_value: \'all\' with `fields`: each field then carries '
          + 'its stored value and its label. Show a field as \'Label (value)\' when the two differ (choices, references, '
          + 'dates), and once when they are equal. A date\'s label is in the user\'s format and time zone; its stored '
          + 'value is UTC. Use only the stored value in any query, filter, encoded query or write, never the label. '
          + 'Default \'false\' returns stored values only, as before; \'true\' is refused.',
      });
    }
  });
});
