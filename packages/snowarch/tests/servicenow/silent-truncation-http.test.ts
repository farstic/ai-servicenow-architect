import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  resetFetchMock, respond, snFetchMockModule, type SnFetchState,
} from '../helpers/fetch-mock.js';
import { withPreset } from '../helpers/preset.js';
import { runWithInstance, type Flags, type InstanceRuntime } from '../../src/servicenow/context.js';
import { expandPreset } from '../../src/utils/permissions.js';

withPreset('pdi-developer');

/**
 * ARC-09-C93 at the HTTP seam: the REAL `ServiceNowClient`, the real router, and a platform (the
 * mocked `snFetch`) that answers 201 with a record whose `name` is the first 40 characters of what
 * was posted — what PN-07 observed for `sys_script_fix.name`, and assumed here for `sys_script`.
 *
 * `silent-truncation.test.ts` proves the logic against a fake client. This file proves the one thing
 * a fake cannot: that the value the check reads is the one the real client hands back, and that the
 * dictionary lookup is a real GET with the query a real instance would be asked.
 */
const http = vi.hoisted<SnFetchState>(() => ({ calls: [], queue: [] }));
vi.mock('../../src/servicenow/http.js', async () => snFetchMockModule(http));

function setEnv() {
  process.env.SERVICENOW_INSTANCE_URL = 'https://dummy.service-now.com';
  process.env.SERVICENOW_AUTH_METHOD = 'basic';
  process.env.SERVICENOW_BASIC_USERNAME = 'd';
  process.env.SERVICENOW_BASIC_PASSWORD = 'd';
  process.env.LOG_LEVEL = 'error';
}

const ok = (status: number, body: unknown) => ({
  ok: true, status, statusText: 'OK',
  headers: { get: () => null },
  text: async () => JSON.stringify(body),
});

function runtime(): InstanceRuntime {
  const flags: Flags = expandPreset('pdi-developer');
  return {
    label: 'pdi', url: 'https://dummy.service-now.com', environment: 'pdi', preset: 'pdi-developer',
    flags, effectiveFlags: flags, toolPackage: 'full', maxRecords: 100, prodWriteAck: false,
    client: {} as InstanceRuntime['client'], warnings: [],
  };
}

const SENT = 'Close every task still open when the parent incident closes';
const CUT = SENT.slice(0, 40);
const SYS_ID = 'b'.repeat(32);

/** What a caller reads back from the router. */
interface Result { sys_id?: string; summary?: string; warnings?: Array<Record<string, unknown>>; [k: string]: unknown }

describe('ARC-09-C93 - over the real client', () => {
  beforeEach(() => { setEnv(); resetFetchMock(http); });
  afterEach(() => vi.restoreAllMocks());

  it('a cut name comes back as a confirmed warning, and the dictionary is read with a real GET', async () => {
    const { instanceManager } = await import('../../src/servicenow/instances.js');
    const { routeToolInvocation } = await import('../../src/tools/index.js');
    respond(http, ok(201, { result: { sys_id: SYS_ID, name: CUT, advanced: 'true' } }));           // the POST
    respond(http, ok(200, { result: [{ element: 'name', max_length: '40' }] }));   // the dictionary

    const client = instanceManager.getClient();
    const result = await runWithInstance(runtime(), () => routeToolInvocation(client,
      'snow_scr_business_rule_add', { name: SENT, table: 'incident', when: 'before', script: 'gs.info(1);' }));

    expect(http.calls).toHaveLength(2);
    expect(String(http.calls[0]!.init.method)).toBe('POST');
    expect(http.calls[0]!.url).toContain('/api/now/table/sys_script');
    // The body that went out is the whole rule — C92 and C93 meet here.
    const posted = JSON.parse(String(http.calls[0]!.init.body));
    expect(posted).toMatchObject({ name: SENT, collection: 'incident', advanced: true, active: true });

    expect(http.calls[1]!.url).toContain('/api/now/table/sys_dictionary');
    expect(decodeURIComponent(http.calls[1]!.url)).toContain('name=sys_script^elementINname');
    expect(decodeURIComponent(http.calls[1]!.url)).toContain('sysparm_fields=element,max_length');

    expect((result as Result).warnings).toHaveLength(1);
    expect((result as Result).warnings![0]).toMatchObject({
      code: 'VALUE_TRUNCATED', table: 'sys_script', sys_id: SYS_ID, field: 'name',
      sent_length: SENT.length, stored_length: 40, column_limit: 40, confirmed: true,
    });
    expect((result as Result).summary).toContain(CUT);
    expect((result as Result).summary).not.toContain(SENT);
  });

  it('a platform that stores the name whole produces one request and no warnings', async () => {
    const { instanceManager } = await import('../../src/servicenow/instances.js');
    const { routeToolInvocation } = await import('../../src/tools/index.js');
    respond(http, ok(201, { result: { sys_id: SYS_ID, name: 'Close open tasks', advanced: 'true' } }));

    const client = instanceManager.getClient();
    const result = await runWithInstance(runtime(), () => routeToolInvocation(client,
      'snow_scr_business_rule_add', { name: 'Close open tasks', table: 'incident', when: 'before', script: 'gs.info(1);' }));

    expect(http.calls).toHaveLength(1);
    expect(Object.prototype.hasOwnProperty.call(result, 'warnings')).toBe(false);
  });

  it('a dictionary lookup that FAILS does not fail the write: the warning arrives, unconfirmed', async () => {
    const { instanceManager } = await import('../../src/servicenow/instances.js');
    const { routeToolInvocation } = await import('../../src/tools/index.js');
    respond(http, ok(201, { result: { sys_id: SYS_ID, name: CUT, advanced: 'true' } }));
    respond(http, {
      ok: false, status: 403, statusText: 'Forbidden', headers: { get: () => null },
      text: async () => JSON.stringify({ error: { message: 'User Not Authorized' } }),
    });

    const client = instanceManager.getClient();
    const result = await runWithInstance(runtime(), () => routeToolInvocation(client,
      'snow_scr_business_rule_add', { name: SENT, table: 'incident', when: 'before', script: 'gs.info(1);' }));

    expect((result as Result).sys_id).toBe(SYS_ID);                     // the write still succeeded
    expect((result as Result).warnings).toHaveLength(1);
    expect((result as Result).warnings![0]).toMatchObject({ column_limit: 40, confirmed: false });
    // The write and ONE lookup. The client retries a 403 with backoff (1s + 2s + 4s) unless told not
    // to, and the caller of a tool should not wait that long to learn the dictionary is unreadable.
    expect(http.calls).toHaveLength(2);
  });
});
