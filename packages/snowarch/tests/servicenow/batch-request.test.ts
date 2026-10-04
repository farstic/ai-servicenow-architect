import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resetFetchMock, respond, snFetchMockModule, type SnFetchState,
} from '../helpers/fetch-mock.js';

/**
 * ARC-09-C108 - `client.batchRequest` against the Batch API as the corpus documents it.
 * Source: vendor/ServiceNowDocs/markdown/api-reference/rest-apis/batch-api.md. Three things it says that
 * the client did not do:
 *
 *   1. `rest_requests.body` - "Base64-encoded body of the request ... Before encoding, the body can be in
 *      any format. For example, XML or JSON." The client sent `JSON.stringify(body)`, not encoded.
 *   2. `serviced_requests.body` - "Base64 encoded body of the response. To get the value of the body,
 *      Base64 decode the content of this parameter." The client ran `JSON.parse` on it, which throws on
 *      Base64, and handed the caller the string as it came: every result body was still encoded.
 *   3. `unserviced_requests` - "IDs of the requests that were not processed because the batch request
 *      reached a size or processing limit". The client never read it, so a batch the platform cut short
 *      returned fewer results than operations and said nothing.
 *
 * The HTTP seam is mocked as in client-retry.test.ts: `src/servicenow/http.ts` is the one place a request
 * leaves the process, so what the platform would receive is exactly `http.calls[n].init.body`.
 */
const http = vi.hoisted<SnFetchState>(() => ({ calls: [], queue: [] }));
vi.mock('../../src/servicenow/http.js', async () => snFetchMockModule(http));

const b64 = (s: string): string => Buffer.from(s, 'utf8').toString('base64');
const fromB64 = (s: string): string => Buffer.from(s, 'base64').toString('utf8');
const ok = (body: unknown) => ({
  ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify(body),
});
/** A batch answer in the shape the page documents. */
const answer = (serviced: Array<Record<string, unknown>>, unserviced?: unknown[]) =>
  ok({ batch_request_id: '1', serviced_requests: serviced, ...(unserviced ? { unserviced_requests: unserviced } : {}) });

async function client() {
  const { ServiceNowClient } = await import('../../src/servicenow/client.js');
  return new ServiceNowClient({
    instanceUrl: 'https://dummy.service-now.com', authMethod: 'basic',
    basic: { username: 'd', password: 'd' }, maxRetries: 0, retryDelayMs: 0,
  } as never);
}
/** The payload the platform received for the last request. */
const sent = () => JSON.parse(String(http.calls.at(-1)!.init.body)) as { rest_requests: Array<Record<string, unknown>> };

beforeEach(() => { process.env.LOG_LEVEL = 'error'; resetFetchMock(http); });
afterEach(() => vi.restoreAllMocks());

describe('ARC-09-C108 (1) - the request body goes out Base64 encoded', () => {
  it('an object body is the Base64 of its JSON', async () => {
    respond(http, answer([{ id: 'a', status_code: 201, body: b64('{"result":{}}') }]));
    await (await client()).batchRequest([{ id: 'a', method: 'POST', url: '/api/now/table/incident', body: { short_description: 'x', n: 1 } }]);
    const op = sent().rest_requests[0]!;
    expect(op.body).toBe(b64('{"short_description":"x","n":1}'));
    expect(fromB64(op.body as string)).toBe('{"short_description":"x","n":1}');   // and not the JSON itself
    expect(op.body).not.toBe('{"short_description":"x","n":1}');
  });

  it('a string body is a body in whatever format the caller chose (the page: "XML or JSON"), encoded once', async () => {
    respond(http, answer([{ id: 'a', status_code: 201, body: b64('<response/>') }]));
    await (await client()).batchRequest([{ id: 'a', method: 'POST', url: '/api/now/table/incident', body: '<request><short_description>x</short_description></request>' }]);
    expect(fromB64(sent().rest_requests[0]!.body as string)).toBe('<request><short_description>x</short_description></request>');
  });

  it('non-ASCII text is encoded as UTF-8', async () => {
    respond(http, answer([{ id: 'a', status_code: 201, body: b64('{}') }]));
    await (await client()).batchRequest([{ id: 'a', method: 'POST', url: '/api/now/table/incident', body: { d: 'café — naïve' } }]);
    expect(fromB64(sent().rest_requests[0]!.body as string)).toBe('{"d":"café — naïve"}');
  });

  it('a GET carries no body at all', async () => {
    respond(http, answer([{ id: 'g', status_code: 200, body: b64('{"result":[]}') }]));
    await (await client()).batchRequest([{ id: 'g', method: 'GET', url: '/api/now/table/incident?sysparm_limit=1' }]);
    expect('body' in sent().rest_requests[0]!).toBe(false);
  });

  it('the rest of the request is as the page specifies: relative url, id, method, headers as {name, value}', async () => {
    respond(http, answer([{ id: 'a', status_code: 200, body: b64('{}') }]));
    await (await client()).batchRequest([{ id: 'a', method: 'GET', url: 'api/now/table/incident' }]);
    const op = sent().rest_requests[0]!;
    expect(op.url).toBe('/api/now/table/incident');
    expect(op).toMatchObject({ id: 'a', method: 'GET' });
    expect(op.headers).toEqual(expect.arrayContaining([{ name: 'Content-Type', value: 'application/json' }, { name: 'Accept', value: 'application/json' }]));
    expect(http.calls.at(-1)!.url).toBe('https://dummy.service-now.com/api/now/v1/batch');
  });
});

describe('ARC-09-C108 (2) - the response body is decoded', () => {
  it('a Base64 JSON body comes back as the object', async () => {
    respond(http, answer([{ id: 'a', status_code: 201, body: b64('{"result":{"sys_id":"abc","short_description":"x"}}') }]));
    const r = await (await client()).batchRequest([{ id: 'a', method: 'POST', url: '/api/now/table/incident', body: {} }]);
    expect(r.results[0]).toMatchObject({ id: 'a', status_code: 201, body: { result: { sys_id: 'abc', short_description: 'x' } } });
  });

  it('Base64 that is not JSON (the page\'s own XML example) comes back as the decoded text', async () => {
    const xml = '<?xml version="1.0" encoding="UTF-8"?><response><result><user_name/></result></response>';
    respond(http, answer([{ id: '11', status_code: 200, body: b64(xml) }]));
    const r = await (await client()).batchRequest([{ id: '11', method: 'GET', url: '/api/global/user_role_inheritance' }]);
    expect(r.results[0].body).toBe(xml);
  });

  it('UTF-8 in the response survives', async () => {
    respond(http, answer([{ id: 'a', status_code: 200, body: b64('{"result":{"d":"café — naïve"}}') }]));
    const r = await (await client()).batchRequest([{ id: 'a', method: 'GET', url: '/api/now/table/incident' }]);
    expect(r.results[0].body.result.d).toBe('café — naïve');
  });

  it('a body that really contains the replacement character U+FFFD is decoded, not mistaken for broken bytes', async () => {
    respond(http, answer([{ id: 'a', status_code: 200, body: b64('{"result":{"d":"bad \uFFFD char"}}') }]));
    const r = await (await client()).batchRequest([{ id: 'a', method: 'GET', url: '/api/now/table/incident' }]);
    expect(r.results[0].body.result.d).toBe('bad \uFFFD char');
  });

  it.each([
    ['text that is not Base64 at all', '%%% not a body %%%'],
    ['a short plain word that happens to be valid Base64', 'test'],
    ['Base64 of bytes that are not UTF-8', Buffer.from([0xff, 0xfe, 0xfd, 0xfc]).toString('base64')],
    ['a string that decodes but is not what an encoder produces (non-canonical padding bits)', 'YR=='],
  ])('%s is kept as it came, never turned into garbage', async (_label, body) => {
    respond(http, answer([{ id: 'a', status_code: 200, body }]));
    const r = await (await client()).batchRequest([{ id: 'a', method: 'GET', url: '/api/now/table/incident' }]);
    expect(r.results[0].body).toBe(body);
  });

  it('Base64 wrapped across lines, as the page prints its own example, still decodes', async () => {
    const wrapped = b64('{"result":{"sys_id":"abc"}}').replace(/(.{8})/g, '$1\n');
    expect(wrapped).toContain('\n');
    respond(http, answer([{ id: 'a', status_code: 200, body: wrapped }]));
    const r = await (await client()).batchRequest([{ id: 'a', method: 'GET', url: '/api/now/table/incident' }]);
    expect(r.results[0].body).toEqual({ result: { sys_id: 'abc' } });
  });

  it('a body that is already JSON text is parsed (an older platform, or a proxy that decoded it)', async () => {
    respond(http, answer([{ id: 'a', status_code: 200, body: '{"result":[1]}' }]));
    const r = await (await client()).batchRequest([{ id: 'a', method: 'GET', url: '/api/now/table/incident' }]);
    expect(r.results[0].body).toEqual({ result: [1] });
  });

  it('an empty or absent body is left alone', async () => {
    respond(http, answer([{ id: 'a', status_code: 204, body: '' }, { id: 'b', status_code: 204 }]));
    const r = await (await client()).batchRequest([{ id: 'a', method: 'DELETE', url: '/x' }, { id: 'b', method: 'DELETE', url: '/y' }]);
    expect(r.results[0].body).toBe('');
    expect(r.results[1].body).toBeUndefined();
  });

  it('the id and the status of each item are kept, in order', async () => {
    respond(http, answer([{ id: 'b', status_code: 404, body: b64('{"error":{"message":"No Record found"}}') }, { id: 'a', status_code: 200, body: b64('{}') }]));
    const r = await (await client()).batchRequest([{ id: 'a', method: 'GET', url: '/x' }, { id: 'b', method: 'GET', url: '/y' }]);
    expect(r.results.map((x: { id: string; status_code: number }) => [x.id, x.status_code])).toEqual([['b', 404], ['a', 200]]);
    expect(r.results[0].body.error.message).toBe('No Record found');
    expect(r.total).toBe(2);
  });
});

describe('ARC-09-C108 (3) - requests the platform did not process are reported', () => {
  const ops = [{ id: 'a', method: 'GET', url: '/x' }, { id: 'b', method: 'GET', url: '/y' }, { id: 'c', method: 'GET', url: '/z' }];

  it('the ids come back as `unserviced`, with a note that says why and what to do', async () => {
    respond(http, answer([{ id: 'a', status_code: 200, body: b64('{}') }], ['b', 'c']));
    const r = await (await client()).batchRequest(ops);
    expect(r.results).toHaveLength(1);
    expect(r.unserviced).toEqual(['b', 'c']);
    expect(String(r.note)).toMatch(/not processed/);
    expect(String(r.note)).toMatch(/size or processing limit/);
    expect(String(r.note)).toMatch(/b, c/);
    expect(String(r.note)).toMatch(/not been run|were not run|did not run/);   // the caller must not assume they ran
  });

  it('nothing unserviced is an empty list and no note', async () => {
    respond(http, answer([{ id: 'a', status_code: 200, body: b64('{}') }], []));
    const r = await (await client()).batchRequest([ops[0]!]);
    expect(r.unserviced).toEqual([]);
    expect('note' in r).toBe(false);
  });

  it('an answer without the field is the same as an empty list', async () => {
    respond(http, answer([{ id: 'a', status_code: 200, body: b64('{}') }]));
    const r = await (await client()).batchRequest([ops[0]!]);
    expect(r.unserviced).toEqual([]);
  });

  it('ids that arrive as objects or numbers are named by their id, not as [object Object]', async () => {
    respond(http, answer([], [{ id: 'b' }, 7, null]));
    const r = await (await client()).batchRequest(ops);
    expect(r.unserviced).toEqual(['b', '7']);
  });
});

describe('ARC-09-C108 - what did not change', () => {
  it('more than 50 operations are still refused before any request', async () => {
    const many = Array.from({ length: 51 }, (_v, i) => ({ id: String(i), method: 'GET', url: '/x' }));
    await expect((await client()).batchRequest(many)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(http.calls).toHaveLength(0);
  });

  it('an answer with no serviced_requests at all is an empty result list, not a crash', async () => {
    respond(http, ok({ batch_request_id: '1' }));
    const r = await (await client()).batchRequest([{ id: 'a', method: 'GET', url: '/x' }]);
    expect(r.results).toEqual([]);
    expect(r.total).toBe(1);
  });
});

describe('ARC-09-C108 x C100 - the cut check reads the documented answer through the real client', () => {
  it('a POST whose stored value was cut warns, with the body arriving Base64 as the page says', async () => {
    const { withWriteVerification } = await import('../../src/servicenow/stored-values.js');
    const c = await client();
    // the dictionary lookup that confirms the cut is a separate request; it answers "no row", so the warning is unconfirmed
    respond(http, answer([{ id: 'a', status_code: 201, body: b64(JSON.stringify({ result: { sys_id: 's1', name: 'abcde' } })) }]));
    const v = withWriteVerification(c);
    await v.client.batchRequest([{ id: 'a', method: 'POST', url: '/api/now/table/u_t', body: { name: 'abcdefghij' } }]);
    http.queue.length = 0; respond(http, ok({ result: [] }));
    const warnings = await v.settle();
    expect(warnings).toMatchObject([{ operation: 'create', table: 'u_t', field: 'name', sent_length: 10, stored_length: 5 }]);
  });
});
