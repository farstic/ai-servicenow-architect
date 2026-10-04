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

/**
 * ARC-09-C99 - a 403 is a decision, not a fault.
 *
 * The client's retry loop rethrew 401, 400 and 404 at once and retried everything else, so a 403
 * (`INSUFFICIENT_PRIVILEGES`) cost the caller 1 s + 2 s + 4 s of backoff and four requests to be told
 * the same thing four times. The platform answers a request that breaks an access rule with a 403
 * (vendor/ServiceNowDocs/markdown/application-development/c_RuntimeAccessToAppTables.md: "a 403
 * Forbidden HTTP error"); asking again does not change a role. The corpus documents no 403 that clears
 * by itself, so none is retried here. What IS retried is unchanged and pinned below: 429, 5xx and a
 * request that did not reach the instance.
 */
describe('ARC-09-C99 - which statuses the client retries', () => {
  beforeEach(() => { setEnv(); resetFetchMock(http); });
  afterEach(() => vi.restoreAllMocks());

  const status = (code: number, text = 'x') => ({
    ok: false, status: code, statusText: text, headers: { get: () => null },
    text: async () => JSON.stringify({ error: { message: `HTTP ${code}` } }),
  });

  async function clientWith(maxRetries: number) {
    const { ServiceNowClient } = await import('../../src/servicenow/client.js');
    return new ServiceNowClient({
      instanceUrl: 'https://dummy.service-now.com', authMethod: 'basic',
      basic: { username: 'd', password: 'd' }, maxRetries, retryDelayMs: 0,
    } as never);
  }

  it('a 403 is ONE request and surfaces as INSUFFICIENT_PRIVILEGES, with the status kept', async () => {
    respond(http, status(403, 'Forbidden'));
    const client = await clientWith(3);
    const err = await client.queryRecords({ table: 'incident', limit: 1 }).catch((e) => e);
    expect(err).toMatchObject({ code: 'INSUFFICIENT_PRIVILEGES', details: { status: 403 } });
    expect(http.calls).toHaveLength(1);                       // not 1 + 3
  });

  it('...whatever the verb: a refused write is not sent a second time', async () => {
    const client = await clientWith(3);
    respond(http, status(403, 'Forbidden'));
    await expect(client.createRecord('incident', { short_description: 'x' })).rejects.toMatchObject({ code: 'INSUFFICIENT_PRIVILEGES' });
    expect(http.calls).toHaveLength(1);

    resetFetchMock(http); respond(http, status(403, 'Forbidden'));
    await expect(client.updateRecord('incident', 'a'.repeat(32), { state: '2' })).rejects.toMatchObject({ code: 'INSUFFICIENT_PRIVILEGES' });
    expect(http.calls).toHaveLength(1);
  });

  it('a refused delete is still classified as an ACL refusal, from one request', async () => {
    respond(http, status(403, 'Forbidden'));
    const client = await clientWith(3);
    await expect(client.deleteRecord('incident', 'a'.repeat(32))).rejects.toMatchObject({ code: 'DELETE_ACL_DENIED' });
    expect(http.calls).toHaveLength(1);
  });

  it('a 403 costs no backoff: a client whose delay is a minute answers at once', async () => {
    const { ServiceNowClient } = await import('../../src/servicenow/client.js');
    const client = new ServiceNowClient({
      instanceUrl: 'https://dummy.service-now.com', authMethod: 'basic',
      basic: { username: 'd', password: 'd' }, maxRetries: 3, retryDelayMs: 60_000,
    } as never);
    respond(http, status(403, 'Forbidden'));
    const started = Date.now();
    await expect(client.queryRecords({ table: 'incident', limit: 1 })).rejects.toMatchObject({ code: 'INSUFFICIENT_PRIVILEGES' });
    expect(Date.now() - started).toBeLessThan(2_000);
  }, 5_000);                                                  // a regression waits 60 s: fail in 5, not 30

  // The controls: the change is one status, and these must not move with it.
  it.each([
    [401, 'AUTHENTICATION_FAILED', 1],
    [400, 'INVALID_REQUEST', 1],
    [404, 'NOT_FOUND', 1],
    [429, 'RATE_LIMITED', 4],
    [503, 'RATE_LIMITED', 4],
    [500, 'REQUEST_FAILED', 4],
    [502, 'REQUEST_FAILED', 4],
  ])('a %i is %s and takes %i request(s) under a policy of 3 retries', async (code, expected, calls) => {
    respond(http, status(code));
    const client = await clientWith(3);
    await expect(client.queryRecords({ table: 'incident', limit: 1 })).rejects.toMatchObject({ code: expected });
    expect(http.calls).toHaveLength(calls);
  });

  it('a request that never reached the instance is still retried', async () => {
    const { reject } = await import('../helpers/fetch-mock.js');
    reject(http, Object.assign(new Error('fetch failed'), { cause: Object.assign(new Error('connect ECONNRESET'), { code: 'ECONNRESET' }) }));
    respond(http, { ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify({ result: [{ sys_id: 'x' }] }) });
    const client = await clientWith(3);
    const r = await client.queryRecords({ table: 'incident', limit: 1 });
    expect(r.records).toHaveLength(1);
    expect(http.calls).toHaveLength(2);
  });
});
