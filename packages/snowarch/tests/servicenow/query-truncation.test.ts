// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { respond, resetFetchMock, snFetchMockModule, type SnFetchState } from '../helpers/fetch-mock.js';
import { useLicensedSession } from '../helpers/licensed-session.js';

const http = vi.hoisted<SnFetchState>(() => ({ calls: [], queue: [] }));
vi.mock('../../src/servicenow/http.js', async () => snFetchMockModule(http));

// ARC-11-C6 — every case here goes through the router, which refuses every tool with no licence in force.
useLicensedSession();

/**
 * ARC-09-C125 — a query read says whether it was cut.
 *
 * On 2.0.12-rc.2 one `sys_choice` read covered state, stage and status over three tables, and the stage list came
 * back with two values "before the read cap". The Envelope cited it as partial, which was honest, but nothing
 * told it so. Measured on develop a4d2cb6:
 * - `count` was the page length (`response.result.length`), so a list cut at the limit looked complete;
 * - the schema advertised "default: 10" while the client sent the instance's `maxRecords`;
 * - there was no `offset`, so the next page could not be read: the router refuses an undeclared argument.
 * The Table API sends `X-Total-Count`, the "Total count of records returned by the query"
 * (markdown/api-reference/rest-apis/c_TableAPI.md:463). The tool now states the fact, so the rule can name it.
 */
function setEnv() {
  process.env.SERVICENOW_INSTANCE_URL = 'https://dummy.service-now.com';
  process.env.SERVICENOW_AUTH_METHOD = 'basic';
  process.env.SERVICENOW_BASIC_USERNAME = 'd';
  process.env.SERVICENOW_BASIC_PASSWORD = 'd';
  process.env.LOG_LEVEL = 'error';
  delete process.env.MAX_RECORDS;
}

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ sys_id: String(i).padStart(32, 'a'), value: `v${i}` }));

/** One answer from the instance: `n` rows, and `X-Total-Count` when `total` is not null. */
function answer(n: number, total: string | null): void {
  const body = JSON.stringify({ result: rows(n) });
  respond(http, {
    ok: true, status: 200, json: async () => JSON.parse(body), text: async () => body,
    headers: { get: (k: string) => (k.toLowerCase() === 'x-total-count' ? total : null) },
  });
}

/** The tool through the router, as a caller meets it: the router refuses an undeclared argument first. */
async function query(args: Record<string, unknown>): Promise<Record<string, any>> {
  const { instanceManager } = await import('../../src/servicenow/instances.js');
  const { routeToolInvocation } = await import('../../src/tools/index.js');
  return routeToolInvocation(instanceManager.getClient(), 'snow_core_records_query', args) as Promise<Record<string, any>>;
}

const sent = (name: string): string | null => new URL(http.calls.at(-1)!.url).searchParams.get(name);

beforeEach(() => { setEnv(); resetFetchMock(http); });
afterEach(() => vi.restoreAllMocks());

describe('ARC-09-C125 — the answer says whether the read was cut', () => {
  it('X-Total-Count 23 with 10 rows at limit 10: truncated, with its total, limit and offset', async () => {
    answer(10, '23');
    expect(await query({ table: 'sys_choice', query: 'name=sn_bom_case', limit: 10 }))
      .toMatchObject({ count: 10, limit: 10, offset: 0, total: 23, truncated: true });
  });

  it('7 of 7 is not truncated', async () => {
    answer(7, '7');
    expect(await query({ table: 'sys_choice', limit: 10 })).toMatchObject({ count: 7, limit: 10, total: 7, truncated: false });
  });

  it('with no X-Total-Count, total is null and truncated means the limit was reached', async () => {
    answer(10, null);
    expect(await query({ table: 'sys_choice', limit: 10 })).toMatchObject({ count: 10, total: null, truncated: true });
    resetFetchMock(http); // the mock repeats its last answer rather than shifting it
    answer(4, null);
    expect(await query({ table: 'sys_choice', limit: 10 })).toMatchObject({ count: 4, total: null, truncated: false });
  });
});

describe('ARC-09-C125 — the next page can be read', () => {
  it('offset is accepted, sent as sysparm_offset, and echoed', async () => {
    answer(10, '23');
    const r = await query({ table: 'sys_choice', limit: 10, offset: 10 });
    expect(sent('sysparm_offset')).toBe('10');
    expect(r).toMatchObject({ offset: 10, count: 10, total: 23, truncated: true });
  });

  it('truncated is per page: 20 + 3 of 23 is the end', async () => {
    answer(3, '23');
    expect(await query({ table: 'sys_choice', limit: 10, offset: 20 })).toMatchObject({ offset: 20, count: 3, truncated: false });
  });

  it('with no total, a full page at an offset reached the limit', async () => {
    answer(10, null);
    expect(await query({ table: 'sys_choice', limit: 10, offset: 10 })).toMatchObject({ offset: 10, count: 10, total: null, truncated: true });
  });
});

describe('ARC-09-C125 — the description states the defaults the client uses', () => {
  it('limit names the client\'s default and cap, from the same constants, and the client sends them', async () => {
    // Read through the namespace: the constants are the client's own, and the red-first commit names them
    // before they exist without failing the type-check.
    const client = (await import('../../src/servicenow/client.js')) as Record<string, unknown>;
    const DEFAULT_MAX_RECORDS = client.DEFAULT_MAX_RECORDS as number;
    const MAX_PAGE = client.MAX_PAGE as number;
    expect([typeof DEFAULT_MAX_RECORDS, typeof MAX_PAGE]).toEqual(['number', 'number']);
    const { coreToolManifest } = await import('../../src/tools/core.js');
    const props = (coreToolManifest().find((t) => t.name === 'snow_core_records_query')!.inputSchema as any).properties;
    expect(props.limit.description).toContain(String(DEFAULT_MAX_RECORDS));
    expect(props.limit.description).toContain(String(MAX_PAGE));
    expect(props.limit.description).not.toMatch(/default: 10\b/);
    answer(0, '0');
    await query({ table: 'incident' });
    expect(sent('sysparm_limit')).toBe(String(DEFAULT_MAX_RECORDS));
    resetFetchMock(http);
    answer(0, '0');
    await query({ table: 'incident', limit: 5000 });
    expect(sent('sysparm_limit')).toBe(String(MAX_PAGE));
  });

  it('offset says how to read the next page, and truncated what it means without a total', async () => {
    const { coreToolManifest } = await import('../../src/tools/core.js');
    const tool = coreToolManifest().find((t) => t.name === 'snow_core_records_query')!;
    const props = (tool.inputSchema as any).properties;
    expect(props.offset.description).toMatch(/offset \+ count/);
    expect(props.offset.description).toMatch(/until `?truncated`? is false/);
    expect(tool.description).toMatch(/reached the limit/);
  });
});

describe('ARC-09-C125 — the numbers are written once, in client.ts', () => {
  // A description that hard-coded "100" would pass the value check above while the constant it copies moved on.
  // That is how "default: 10" survived a client that sent 100. So the SOURCE is read: both places name the constants.
  const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../../src');

  it('the limit description and the client\'s default use DEFAULT_MAX_RECORDS and MAX_PAGE, never the numbers', () => {
    const core = readFileSync(resolve(SRC, 'tools/core.ts'), 'utf8');
    const limitLine = core.split('\n').find((l) => /^\s*limit: \{ type: 'number', description: `Max records/.test(l));
    expect(limitLine, 'the limit property is not where the guard reads it').toBeDefined();
    expect(limitLine).toContain('${DEFAULT_MAX_RECORDS}');
    expect(limitLine).toContain('${MAX_PAGE}');
    expect(limitLine).not.toMatch(/\b(10|100|1000)\b/);
    const client = readFileSync(resolve(SRC, 'servicenow/client.ts'), 'utf8');
    const queryRecords = client.slice(client.indexOf('async queryRecords'), client.indexOf('async getTableSchema'));
    expect(queryRecords).toContain('DEFAULT_MAX_RECORDS');
    expect(queryRecords).toContain('MAX_PAGE');
    expect(queryRecords).not.toMatch(/Math\.min\([^;]*\b(100|1000)\b/);
  });
});
