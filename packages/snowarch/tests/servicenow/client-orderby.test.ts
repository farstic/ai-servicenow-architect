import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  resetFetchMock, respond, snFetchMockModule, type SnFetchState,
} from '../helpers/fetch-mock.js';

/**
 * The HTTP seam, not `global.fetch`. ARC-04-S11 routed every request through
 * `src/servicenow/http.ts` for proxy support, so a stub on the global would sit unused while a
 * real request went out — a test that quietly stops testing rather than failing.
 *
 * `vi.mock` must be written here, in the test file: it is hoisted within its own file, and
 * calling it from a helper registers it after the module under test has already loaded.
 */
const http = vi.hoisted<SnFetchState>(() => ({ calls: [], queue: [] }));
vi.mock('../../src/servicenow/http.js', async () => snFetchMockModule(http));


/**
 * The descending-sort defect, asserted on the CAPTURED URL.
 *
 * The client built `ORDERBY<field>^ORDERBYDESC` — two terms, the first sorting ascending and
 * the second a bare operator with no field. ServiceNow does not reject that; it sorts
 * ascending. So every "newest first" query returned the OLDEST records and looked like it had
 * worked, which is why the workaround in the legacy setup text talks about the newest result
 * being years old rather than about an error.
 *
 * The assertion has to read the request, not the response: a fixture returning records in
 * whatever order the test author chose would pass against either grammar.
 */
function setEnv() {
  process.env.SERVICENOW_INSTANCE_URL = 'https://dummy.service-now.com';
  process.env.SERVICENOW_AUTH_METHOD = 'basic';
  process.env.SERVICENOW_BASIC_USERNAME = 'd';
  process.env.SERVICENOW_BASIC_PASSWORD = 'd';
  process.env.LOG_LEVEL = 'error';
}


async function sysparmQuery(params: Record<string, unknown>): Promise<string | null> {
  const { instanceManager } = await import('../../src/servicenow/instances.js');
  resetFetchMock(http);
  respond(http, {
    ok: true, status: 200, json: async () => ({ result: [] }), text: async () => '{"result":[]}',
    headers: { get: () => null },
  });
  await instanceManager.getClient().queryRecords(params as never);
  expect(http.calls).toHaveLength(1);
  return new URL(http.calls[0]!.url).searchParams.get('sysparm_query');
}

beforeEach(() => setEnv());
afterEach(() => vi.restoreAllMocks());

describe('criterion 1 - the descending form is ORDERBYDESC<field>, one term', () => {
  it('orderBy "-sys_created_on" with no query sends ORDERBYDESCsys_created_on', async () => {
    expect(await sysparmQuery({ table: 'incident', orderBy: '-sys_created_on' }))
      .toBe('ORDERBYDESCsys_created_on');
  });

  it('with a query it is appended after ^', async () => {
    expect(await sysparmQuery({ table: 'incident', query: 'active=true', orderBy: '-sys_created_on' }))
      .toBe('active=true^ORDERBYDESCsys_created_on');
  });

  it('ascending is unchanged', async () => {
    expect(await sysparmQuery({ table: 'incident', orderBy: 'number' })).toBe('ORDERBYnumber');
  });

  it('the old grammar is gone in both directions', async () => {
    // Named explicitly: `ORDERBYsys_created_on^ORDERBYDESC` is what a reader of the old code
    // would expect to see, and it is the exact string that sorted the wrong way.
    const q = await sysparmQuery({ table: 'incident', orderBy: '-sys_created_on' });
    expect(q).not.toBe('ORDERBYsys_created_on^ORDERBYDESC');
    expect(q).not.toMatch(/ORDERBY[a-z_]+\^ORDERBYDESC$/);
  });
});

describe('multiple sort fields keep their own directions', () => {
  it('"-priority,sys_created_on" joins one term per field', async () => {
    expect(await sysparmQuery({ table: 'incident', orderBy: '-priority,sys_created_on' }))
      .toBe('ORDERBYDESCpriority^ORDERBYsys_created_on');
  });

  it('with a query in front', async () => {
    expect(await sysparmQuery({ table: 'incident', query: 'active=true', orderBy: '-priority,-number' }))
      .toBe('active=true^ORDERBYDESCpriority^ORDERBYDESCnumber');
  });

  it('surrounding whitespace in a term is trimmed', async () => {
    expect(await sysparmQuery({ table: 'incident', orderBy: ' -priority , number ' }))
      .toBe('ORDERBYDESCpriority^ORDERBYnumber');
  });
});

describe('degenerate input does not corrupt the query', () => {
  it('an orderBy of only separators drops the sort but keeps the query', async () => {
    // The dangerous outcome is a trailing bare `^` or a stray `ORDERBY` with no field: the
    // platform accepts both and quietly returns something else.
    expect(await sysparmQuery({ table: 'incident', query: 'active=true', orderBy: ' , ' }))
      .toBe('active=true');
  });

  it('and with no query at all, sysparm_query is not sent', async () => {
    expect(await sysparmQuery({ table: 'incident', orderBy: ',,' })).toBeNull();
  });

  it('no orderBy at all leaves the query untouched', async () => {
    expect(await sysparmQuery({ table: 'incident', query: 'active=true' })).toBe('active=true');
  });
});
