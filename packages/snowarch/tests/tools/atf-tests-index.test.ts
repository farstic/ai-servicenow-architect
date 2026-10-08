import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ok, resetCicd, tableOf, type CicdState } from '../helpers/fake-cicd.js';
import { ServiceNowClient } from '../../src/servicenow/client.js';
import { dispatchAtfAction } from '../../src/tools/atf.js';
import type { ServiceNowError } from '../../src/utils/errors.js';

/**
 * ARC-09-C113 — `snow_atf_atf_tests_index` lists a suite's tests from the suite's membership rows.
 *
 * Given `suite_sys_id`, the tool queried `sys_atf_test` with `test_suite=<suite>`. The corpus puts a
 * suite's tests in its "Test Suite Tests" related list
 * (vendor/ServiceNowDocs/markdown/application-development/automated-test-framework-atf/atf-test-suite-record.md),
 * the Test Suite Test table `sys_atf_test_suite_test`, and names no `test_suite` column on `sys_atf_test`.
 * A condition on a column that does not exist is ignored, not refused
 * (vendor/ServiceNowDocs/markdown/api-reference/rest-apis/c_TableAPI.md), so the filter could drop out and
 * leave every active test listed as the suite's.
 *
 * The membership table answers with fixed rows here — what the platform returns when it ignores a
 * condition — while `sys_atf_test` filters by the query it is sent (`tableOf`), so a list that is not
 * bounded by the suite's ids shows up as tests that do not belong to it.
 */
const cicd = vi.hoisted<CicdState>(() => ({ calls: [], progress: [], tables: {} }));
vi.mock('../../src/servicenow/http.js', async () => (await import('../helpers/fake-cicd.js')).fakeCicdModule(cicd));

const SUITE = `${'a'.repeat(31)}1`;
const SUITE_2 = `${'a'.repeat(31)}2`;
const T1 = `${'d'.repeat(31)}1`;
const T2 = `${'d'.repeat(31)}2`;
const T3 = `${'d'.repeat(31)}3`;
const T4 = `${'d'.repeat(31)}4`;
const HOST = 'https://test.service-now.com';

const ref = (table: string, id: string) => ({ link: `${HOST}/api/now/table/${table}/${id}`, value: id });
const membership = (test: string, suite: string) => ({ test: ref('sys_atf_test', test), test_suite: ref('sys_atf_test_suite', suite) });
const testRow = (sysId: string, name: string, active = true) => ({ sys_id: sysId, name, active: String(active) });

/** T1, T2 and T4 are in SUITE (T4 inactive); T3 is in SUITE_2. */
const ALL_TESTS = [testRow(T1, 'one'), testRow(T2, 'two'), testRow(T3, 'three'), testRow(T4, 'four', false)];

const client = () => new ServiceNowClient({
  instanceUrl: HOST, authMethod: 'basic', basic: { username: 'u', password: 'p' }, maxRetries: 3, retryDelayMs: 0,
});

async function index(args: Record<string, unknown>) {
  try {
    return { value: await dispatchAtfAction(client(), 'snow_atf_atf_tests_index', args), error: undefined };
  } catch (error) {
    return { value: undefined, error: error as ServiceNowError };
  }
}

const reads = (table: string) => cicd.calls.filter((c) => c.path === `/api/now/table/${table}`);
const listed = (value: { tests: Array<{ sys_id: string }> }) => value.tests.map((t) => t.sys_id);

// The client logs every request at INFO; these tests read the requests from the fake instead.
const logLevel = process.env.LOG_LEVEL;
beforeAll(() => { process.env.LOG_LEVEL = 'error'; });
afterAll(() => {
  if (logLevel === undefined) delete process.env.LOG_LEVEL;
  else process.env.LOG_LEVEL = logLevel;
});

beforeEach(() => {
  resetCicd(cicd);
});

describe('ARC-09-C113 — snow_atf_atf_tests_index with suite_sys_id reads the suite\'s membership rows', () => {
  it('the tests of another suite are not listed: the sys_atf_test query is bounded by the suite\'s ids', async () => {
    cicd.tables.sys_atf_test_suite_test = ok([membership(T1, SUITE), membership(T2, SUITE)]);
    cicd.tables.sys_atf_test = tableOf(ALL_TESTS);

    const { value, error } = await index({ suite_sys_id: SUITE });

    expect(error).toBeUndefined();
    expect(reads('sys_atf_test_suite_test')).toHaveLength(1);
    expect(reads('sys_atf_test_suite_test')[0].query).toMatchObject({ sysparm_query: `test_suite=${SUITE}`, sysparm_fields: 'test,test_suite' });
    expect(reads('sys_atf_test')[0].query.sysparm_query).toBe(`active=true^sys_idIN${T1},${T2}`);
    expect(listed(value)).toEqual([T1, T2]);
    expect(value.count).toBe(2);
    expect(value.summary).toMatch(/sys_atf_test_suite_test/);
  });

  it('a membership row whose test_suite is not the suite is not counted — an ignored condition picks nothing', async () => {
    cicd.tables.sys_atf_test_suite_test = ok([membership(T1, SUITE), membership(T3, SUITE_2)]);
    cicd.tables.sys_atf_test = tableOf(ALL_TESTS);

    const { value, error } = await index({ suite_sys_id: SUITE });

    expect(error).toBeUndefined();
    expect(reads('sys_atf_test')[0].query.sysparm_query).toBe(`active=true^sys_idIN${T1}`);
    expect(listed(value)).toEqual([T1]);
  });

  it('only active tests by default; active: false reaches the sys_atf_test query', async () => {
    cicd.tables.sys_atf_test_suite_test = ok([membership(T1, SUITE), membership(T4, SUITE)]);
    cicd.tables.sys_atf_test = tableOf(ALL_TESTS);

    const byDefault = await index({ suite_sys_id: SUITE });
    expect(listed(byDefault.value)).toEqual([T1]);

    resetCicd(cicd);
    cicd.tables.sys_atf_test_suite_test = ok([membership(T1, SUITE), membership(T4, SUITE)]);
    cicd.tables.sys_atf_test = tableOf(ALL_TESTS);

    const all = await index({ suite_sys_id: SUITE, active: false });
    expect(reads('sys_atf_test')[0].query.sysparm_query).toBe(`sys_idIN${T1},${T4}`);
    expect(listed(all.value)).toEqual([T1, T4]);
  });

  it('a suite with no tests lists none, says so, and never asks for every active test', async () => {
    cicd.tables.sys_atf_test_suite_test = ok([]);
    cicd.tables.sys_atf_test = tableOf(ALL_TESTS);

    const { value, error } = await index({ suite_sys_id: SUITE });

    expect(error).toBeUndefined();
    expect(value).toMatchObject({ count: 0, tests: [] });
    expect(value.summary).toMatch(/holds no tests/);
    expect(reads('sys_atf_test')).toHaveLength(0);
  });

  it('a suite_sys_id that is not a sys_id is refused before anything is sent', async () => {
    const { error } = await index({ suite_sys_id: 'Mixed Test Suite' });

    expect(error?.code).toBe('VALIDATION_ERROR');
    expect(error?.message).toMatch(/suite_sys_id/);
    expect(cicd.calls).toEqual([]);
  });

  it('two membership rows for the same suite and test are one test', async () => {
    cicd.tables.sys_atf_test_suite_test = ok([membership(T1, SUITE), membership(T1, SUITE)]);
    cicd.tables.sys_atf_test = tableOf(ALL_TESTS);

    const { value, error } = await index({ suite_sys_id: SUITE });

    expect(error).toBeUndefined();
    expect(reads('sys_atf_test')[0].query.sysparm_query).toBe(`active=true^sys_idIN${T1}`);
    expect(value.summary).toMatch(/holds 1 test\(s\)/);
    expect(listed(value)).toEqual([T1]);
  });

  it('the limit is what is left of it: 150 tests and limit 120 ask for 120, then 20', async () => {
    const ids = Array.from({ length: 150 }, (_, i) => `e${String(i).padStart(31, '0')}`);
    cicd.tables.sys_atf_test_suite_test = ok(ids.map((id) => membership(id, SUITE)));
    cicd.tables.sys_atf_test = tableOf(ids.map((id, i) => testRow(id, `t${i}`)));

    const { value, error } = await index({ suite_sys_id: SUITE, limit: 120 });

    expect(error).toBeUndefined();
    expect(reads('sys_atf_test').map((r) => r.query.sysparm_limit)).toEqual(['120', '20']);
    expect(value.count).toBe(120);
    expect(listed(value)).toEqual(ids.slice(0, 120));
    expect(value.summary).toMatch(/up to the limit of 120/);
  });

  it.each([{ rows: 1000, capped: true }, { rows: 999, capped: false }])(
    'a membership read of $rows rows says it stopped at the 1000-row read: $capped', async ({ rows, capped }) => {
      const ids = Array.from({ length: rows }, (_, i) => `f${String(i).padStart(31, '0')}`);
      cicd.tables.sys_atf_test_suite_test = ok(ids.map((id) => membership(id, SUITE)));
      cicd.tables.sys_atf_test = tableOf(ids.map((id, i) => testRow(id, `t${i}`)));

      const { value, error } = await index({ suite_sys_id: SUITE });

      expect(error).toBeUndefined();
      expect(reads('sys_atf_test_suite_test')[0].query.sysparm_limit).toBe('1000');
      if (capped) expect(value.summary).toMatch(/in its first 1000 rows/);
      else expect(value.summary).not.toMatch(/in its first/);
    });

  it('a large suite is read in batches, each query under the client\'s 4096-character limit', async () => {
    const ids = Array.from({ length: 150 }, (_, i) => `e${String(i).padStart(31, '0')}`);
    cicd.tables.sys_atf_test_suite_test = ok(ids.map((id) => membership(id, SUITE)));
    cicd.tables.sys_atf_test = tableOf(ids.map((id, i) => testRow(id, `t${i}`)));

    const { value, error } = await index({ suite_sys_id: SUITE, limit: 200 });

    expect(error).toBeUndefined();
    expect(reads('sys_atf_test')).toHaveLength(2);
    for (const r of reads('sys_atf_test')) expect(r.query.sysparm_query.length).toBeLessThanOrEqual(4096);
    expect(listed(value)).toEqual(ids);
  });

  it('without suite_sys_id it behaves as before: one sys_atf_test query, active only, 20 at most', async () => {
    cicd.tables.sys_atf_test = tableOf(ALL_TESTS);

    const { value, error } = await index({});

    expect(error).toBeUndefined();
    expect(cicd.calls).toHaveLength(1);
    expect(reads('sys_atf_test')[0].query).toMatchObject({ sysparm_query: 'active=true', sysparm_limit: '20' });
    expect(listed(value)).toEqual([T1, T2, T3]);
  });
});
