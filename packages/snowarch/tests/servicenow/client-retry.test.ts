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
