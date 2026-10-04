import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  resetFetchMock, respond, snFetchMockModule, type SnFetchState,
} from '../helpers/fetch-mock.js';

/**
 * The HTTP seam, not `global.fetch`. ARC-04-S11 routed every request through
 * `src/servicenow/http.ts` for proxy support, so a stub on the global sits unused while a real
 * request goes out — a test that quietly stops testing rather than failing. This suite did
 * exactly that and then hung for five seconds on a real connection attempt.
 *
 * `vi.mock` must be written here, in the test file: it is hoisted within its own file, and
 * calling it from inside a helper registers it after the module under test has already loaded.
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

describe('ServiceNowClient.request — 429 rate-limit handling', () => {
  beforeEach(() => { setEnv(); resetFetchMock(http); });
  afterEach(() => vi.restoreAllMocks());

  it('retries on HTTP 429 honoring Retry-After, then succeeds', async () => {
    setEnv();
    const { instanceManager } = await import('../../src/servicenow/instances.js');
    const client = instanceManager.getClient();

    respond(http, {
      ok: false, status: 429, statusText: 'Too Many Requests',
      headers: { get: (h: string) => (h.toLowerCase() === 'retry-after' ? '0' : null) },
      text: async () => JSON.stringify({ error: { message: 'rate limited' } }),
    });
    respond(http, {
      ok: true, status: 200,
      headers: { get: () => null },
      text: async () => JSON.stringify({ result: [{ sys_id: 'x', number: 'INC1' }] }),
    });

    const r = await client.queryRecords({ table: 'incident', limit: 1 });

    expect(http.calls).toHaveLength(2);   // retried once after the 429
    expect(r.records?.length).toBe(1);    // and ultimately succeeded
  });
});

/**
 * ARC-09-C93 gave `queryRecords` a `retries` option so an advisory lookup could fail fast. It is a
 * field of `QueryRecordsParams`, and `snow_core_records_query` hands the caller's arguments to
 * `queryRecords` as they come — so a caller can pass it, and no schema stops them. The option may
 * only ever LOWER the client's own policy: a value that raised it would turn "retry 3 times with
 * backoff" into a number the caller picks.
 */
describe('QueryRecordsParams.retries - can lower the retry policy, never raise it', () => {
  beforeEach(() => { setEnv(); resetFetchMock(http); });
  afterEach(() => vi.restoreAllMocks());

  const unavailable = () => ({
    ok: false, status: 503, statusText: 'Service Unavailable', headers: { get: () => null },
    text: async () => JSON.stringify({ error: { message: 'down' } }),
  });

  async function clientWith(maxRetries: number) {
    const { ServiceNowClient } = await import('../../src/servicenow/client.js');
    return new ServiceNowClient({
      instanceUrl: 'https://dummy.service-now.com', authMethod: 'basic',
      basic: { username: 'd', password: 'd' }, maxRetries, retryDelayMs: 0,
    } as never);
  }

  it('a value above the policy is held to the policy', async () => {
    respond(http, unavailable());
    const client = await clientWith(2);
    await expect(client.queryRecords({ table: 'incident', limit: 1, retries: 99 })).rejects.toBeTruthy();
    expect(http.calls).toHaveLength(3);                       // 1 attempt + the policy's 2 retries, not 100
  });

  it('0 means one attempt and no more', async () => {
    respond(http, unavailable());
    const client = await clientWith(2);
    await expect(client.queryRecords({ table: 'incident', limit: 1, retries: 0 })).rejects.toBeTruthy();
    expect(http.calls).toHaveLength(1);
  });

  it.each([[-1], [1.5], [Number.NaN], ['3'], [Number.POSITIVE_INFINITY]])(
    'a value that is not a count (%j) is ignored: the policy stands', async (bad) => {
      respond(http, unavailable());
      const client = await clientWith(2);
      await expect(client.queryRecords({ table: 'incident', limit: 1, retries: bad as never })).rejects.toBeTruthy();
      expect(http.calls).toHaveLength(3);
    });
});
