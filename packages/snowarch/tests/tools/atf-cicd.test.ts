import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ABSENT_MESSAGE, ok, refused, resetCicd, type CicdState,
} from '../helpers/fake-cicd.js';
import { ServiceNowClient } from '../../src/servicenow/client.js';
import { dispatchAtfAction } from '../../src/tools/atf.js';
import type { ServiceNowError } from '../../src/utils/errors.js';

/**
 * ARC-09-C94 — the ATF exec tools, against a fake of the CI/CD API.
 *
 * Both tools posted to `/api/now/atf/runner/run_*`, a path the platform does not serve: on the owner's
 * PDI it answered "Requested URI does not represent any resource" (docs/validation/2.0.11-rc.1-live-sitting.md,
 * § ARC-09-C94). The corpus documents one way to run tests over REST, the CI/CD API
 * (vendor/ServiceNowDocs/markdown/api-reference/rest-apis/cicd-api.md): start a suite, poll its progress,
 * read its results. The REAL client runs here; the fake stands at the HTTP seam, so these tests read the
 * requests that were sent — method, path, query, how many — and what the tool made of the answers.
 *
 * The poll waits on timers, so the clock is fake and a test never spends real seconds; `waitedMs` is
 * how long the tool waited on that clock.
 */
const cicd = vi.hoisted<CicdState>(() => ({ calls: [], progress: [], tables: {} }));
vi.mock('../../src/servicenow/http.js', async () => (await import('../helpers/fake-cicd.js')).fakeCicdModule(cicd));

const SUITE = `${'a'.repeat(31)}1`;
const SUITE_2 = `${'a'.repeat(31)}2`;
const TEST = `${'d'.repeat(31)}1`;
const OTHER_TEST = `${'d'.repeat(31)}2`;
const PROGRESS = `${'b'.repeat(31)}1`;
const RESULT = `${'c'.repeat(31)}1`;
const HOST = 'https://test.service-now.com';

const progressLink = { id: PROGRESS, url: `${HOST}/api/sn_cicd/progress/${PROGRESS}` };
const resultsLink = { id: RESULT, url: `${HOST}/api/sn_cicd/testsuite/results/${RESULT}` };

/** The run's own answer: accepted, pending, with the progress link (the page's example). */
const accepted = ok({
  links: { progress: progressLink }, status: '0', status_label: 'Pending',
  status_message: '', status_detail: '', error: '', percent_complete: 0,
});
const progressIs = (status: string, label: string, percent: number) => ok({
  links: { progress: progressLink }, status, status_label: label,
  status_message: '', status_detail: '', error: '', percent_complete: percent,
});
const finished = (status: string, label: string, message: string) => ok({
  links: { progress: progressLink, results: resultsLink }, status, status_label: label,
  status_message: message, status_detail: message, error: '', percent_complete: 100,
});
const resultsOf = (suiteStatus: string, counts: [number, number, number, number]) => ok({
  links: { results: { id: RESULT, url: `${HOST}/sys_atf_test_suite_result.do?sys_id=${RESULT}` } },
  status: '2', status_label: 'Successful', status_message: '', status_detail: '', error: '',
  test_suite_status: suiteStatus, test_suite_duration: '4 Seconds',
  rolledup_test_success_count: counts[0], rolledup_test_failure_count: counts[1],
  rolledup_test_error_count: counts[2], rolledup_test_skip_count: counts[3],
  test_suite_name: 'Server Suite', child_suite_results: [],
});
/** A reference field as the Table API returns it without display values: a link and a value. */
const ref = (table: string, id: string) => ({ link: `${HOST}/api/now/table/${table}/${id}`, value: id });
const membership = (test: string, suite: string) => ({ test: ref('sys_atf_test', test), test_suite: ref('sys_atf_test_suite', suite) });

const client = () => new ServiceNowClient({
  instanceUrl: HOST, authMethod: 'basic', basic: { username: 'u', password: 'p' }, maxRetries: 3, retryDelayMs: 0,
});

/** Run one tool call to its end on the fake clock. */
async function call(name: string, args: Record<string, unknown>) {
  const t0 = Date.now();
  const settled = dispatchAtfAction(client(), name, args)
    .then((value) => ({ value, error: undefined }), (error: ServiceNowError) => ({ value: undefined, error }));
  await vi.runAllTimersAsync();
  const out = await settled;
  return { ...out, waitedMs: Date.now() - t0 };
}

const sent = () => cicd.calls.map((c) => `${c.method} ${c.path}`);
const posts = () => cicd.calls.filter((c) => c.method === 'POST');
const progressReads = () => cicd.calls.filter((c) => c.path.startsWith('/api/sn_cicd/progress/')).length;
const resultsRead = () => sent().some((s) => s.includes('/testsuite/results/'));
/** When each progress read was sent, in ms after the run's POST. */
const progressReadTimes = () => cicd.calls
  .filter((c) => c.path.startsWith('/api/sn_cicd/progress/'))
  .map((c) => c.at - posts()[0].at);

// The client logs every request at INFO; these tests read the requests from the fake instead.
const logLevel = process.env.LOG_LEVEL;
beforeAll(() => { process.env.LOG_LEVEL = 'error'; });
afterAll(() => {
  if (logLevel === undefined) delete process.env.LOG_LEVEL;
  else process.env.LOG_LEVEL = logLevel;
});

beforeEach(() => {
  vi.useFakeTimers();
  resetCicd(cicd);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('ARC-09-C94 — snow_atf_atf_suite_exec runs the suite through the CI/CD API', () => {
  it('run accepted, progress pending → running → successful: one POST, the polls, the results', async () => {
    cicd.run = accepted;
    cicd.progress.push(progressIs('0', 'Pending', 0), progressIs('1', 'Running', 50), finished('2', 'Successful', 'Suite passed'));
    cicd.results = resultsOf('success', [3, 0, 0, 0]);

    const { value, error, waitedMs } = await call('snow_atf_atf_suite_exec', { sys_id: SUITE });

    expect(error).toBeUndefined();
    expect(sent()).toEqual([
      'POST /api/sn_cicd/testsuite/run',
      `GET /api/sn_cicd/progress/${PROGRESS}`,
      `GET /api/sn_cicd/progress/${PROGRESS}`,
      `GET /api/sn_cicd/progress/${PROGRESS}`,
      `GET /api/sn_cicd/testsuite/results/${RESULT}`,
    ]);
    // The page documents the suite as a query parameter, not a body field.
    expect(cicd.calls[0].query).toEqual({ test_suite_sys_id: SUITE });
    expect(sent().some((s) => s.includes('/atf/runner/'))).toBe(false);
    expect(value).toMatchObject({
      outcome: 'success',
      status_label: 'Successful',
      suite: { sys_id: SUITE, name: 'Server Suite' },
      counts: { success: 3, failure: 0, error: 0, skipped: 0 },
      result_record: { table: 'sys_atf_test_suite_result', sys_id: RESULT },
      progress_id: PROGRESS,
    });
    expect(value.summary).toMatch(/Server Suite/);
    expect(value.summary).toMatch(/snow_atf_atf_suite_result_read/);
    expect(waitedMs).toBeLessThan(300_000);
  });

  it('a failed run is an outcome with its counts, not an error', async () => {
    cicd.run = accepted;
    cicd.progress.push(progressIs('1', 'Running', 50), finished('3', 'Failed', 'Suite failed'));
    cicd.results = resultsOf('failure', [2, 1, 0, 0]);

    const { value, error } = await call('snow_atf_atf_suite_exec', { sys_id: SUITE });

    expect(error).toBeUndefined();
    expect(value).toMatchObject({
      outcome: 'failure',
      counts: { success: 2, failure: 1, error: 0, skipped: 0 },
      result_record: { table: 'sys_atf_test_suite_result', sys_id: RESULT },
    });
    expect(value.summary).toMatch(/failure/);
  });

  it('a timeout at the budget: it stops polling at budget_seconds and says the run goes on', async () => {
    cicd.run = accepted;
    cicd.progress.push(progressIs('1', 'Running', 40));

    const { value, error, waitedMs } = await call('snow_atf_atf_suite_exec', { sys_id: SUITE, budget_seconds: 30 });

    expect(error).toBeUndefined();
    expect(waitedMs).toBe(30_000);
    // One read every five seconds: six in thirty, the last at the budget, and none after it.
    expect(progressReads()).toBe(6);
    expect(sent().some((s) => s.includes('/testsuite/results/'))).toBe(false);
    expect(value).toMatchObject({ outcome: 'running', status_label: 'Running', progress_id: PROGRESS, budget_seconds: 30 });
    expect(value.summary).toMatch(/30 s/);
    expect(value.summary).toMatch(/not cancelled/);
  });

  it('with no budget_seconds it waits 300 seconds, not forever', async () => {
    cicd.run = accepted;
    cicd.progress.push(progressIs('1', 'Running', 40));

    const { value, waitedMs } = await call('snow_atf_atf_suite_exec', { sys_id: SUITE });

    expect(waitedMs).toBe(300_000);
    expect(value).toMatchObject({ outcome: 'running', budget_seconds: 300 });
  });

  it('a budget that is not a multiple of the interval: the last read is at the budget, not past it', async () => {
    cicd.run = accepted;
    cicd.progress.push(progressIs('1', 'Running', 40));

    const { value, waitedMs } = await call('snow_atf_atf_suite_exec', { sys_id: SUITE, budget_seconds: 12 });

    expect(waitedMs).toBe(12_000);
    // The third wait is cut to what is left of the budget: reads at 5, 10 and 12 seconds, not at 15.
    expect(progressReadTimes()).toEqual([5_000, 10_000, 12_000]);
    expect(value).toMatchObject({ outcome: 'running', budget_seconds: 12 });
  });

  it('a run that ends Canceled stops the polling, and reports no counts', async () => {
    cicd.run = accepted;
    cicd.progress.push(progressIs('1', 'Running', 50), progressIs('4', 'Canceled', 50));

    const { value, error, waitedMs } = await call('snow_atf_atf_suite_exec', { sys_id: SUITE });

    expect(error).toBeUndefined();
    // "4: Canceled" ends a run: two reads in ten seconds and no results request, not polling on to the budget.
    expect(progressReads()).toBe(2);
    expect(waitedMs).toBe(10_000);
    expect(resultsRead()).toBe(false);
    expect(value).toMatchObject({ outcome: 'canceled', status_label: 'Canceled', progress_id: PROGRESS });
    expect(value.counts).toBeUndefined();
    expect(value.result_record).toBeUndefined();
  });

  it('a run that ends Failed with no results link is refused with the platform\'s reason, and no results are read', async () => {
    cicd.run = accepted;
    cicd.progress.push(ok({
      links: { progress: progressLink }, status: '3', status_label: 'Failed',
      status_message: '', status_detail: '', error: 'the suite could not be run', percent_complete: 0,
    }));

    const { error } = await call('snow_atf_atf_suite_exec', { sys_id: SUITE });

    expect(error?.code).toBe('REQUEST_FAILED');
    expect(error?.message).toContain('the suite could not be run');
    expect(error?.message).toContain(PROGRESS);
    expect(resultsRead()).toBe(false);
  });

  it('a run that ends Successful with no results link says so, with no counts and no record', async () => {
    cicd.run = accepted;
    cicd.progress.push(progressIs('2', 'Successful', 100));

    const { value, error } = await call('snow_atf_atf_suite_exec', { sys_id: SUITE });

    expect(error).toBeUndefined();
    expect(resultsRead()).toBe(false);
    expect(value).toMatchObject({ outcome: 'successful', status_label: 'Successful', progress_id: PROGRESS });
    expect(value.counts).toBeUndefined();
    expect(value.result_record).toBeUndefined();
    expect(value.summary).toMatch(/no results link/);
  });

  it.each([0, -5, 1801, '60'])('budget_seconds %j is refused before anything is sent', async (budget) => {
    const { error } = await call('snow_atf_atf_suite_exec', { sys_id: SUITE, budget_seconds: budget });

    expect(error?.code).toBe('VALIDATION_ERROR');
    expect(error?.message).toMatch(/budget_seconds/);
    expect(cicd.calls).toEqual([]);
  });

  it('a 403 names the role the page requires, and the run is sent once', async () => {
    cicd.run = refused(403, 'User Not Authorized');

    const { error } = await call('snow_atf_atf_suite_exec', { sys_id: SUITE });

    expect(error?.code).toBe('INSUFFICIENT_PRIVILEGES');
    expect(error?.message).toMatch(/sn_cicd\.sys_ci_automation/);
    expect(error?.message).toMatch(/admin/);
    expect(error?.message).toMatch(/api-reference\/rest-apis\/cicd-api\.md/);
    expect(posts()).toHaveLength(1);
    expect(progressReads()).toBe(0);
  });

  // The measured answer for an absent path is the MESSAGE; the status follows the method — 404 to a GET,
  // 400 to this server's POST (PN-15). Both must read as "the API is not here".
  it.each([400, 404])('an absent /api/sn_cicd (HTTP %i with the platform\'s message) names no plugin, because the corpus names none', async (status) => {
    cicd.run = refused(status, ABSENT_MESSAGE);

    const { error } = await call('snow_atf_atf_suite_exec', { sys_id: SUITE });

    expect(error?.code).toBe('NOT_FOUND');
    expect(error?.message).toMatch(/\/api\/sn_cicd/);
    expect(error?.message).toMatch(/active by default/);
    expect(error?.message).toMatch(/integration-hub\/cicd-spoke\.md/);
    expect(error?.message).toMatch(/names no plugin/);
    expect(error?.message).not.toMatch(/\bcom\.[a-z_]+/);
    expect(posts()).toHaveLength(1);
  });

  it('a 404 with any other message is the suite not found, not the API absent', async () => {
    cicd.run = refused(404, 'Test suite not found');

    const { error } = await call('snow_atf_atf_suite_exec', { sys_id: SUITE });

    expect(error?.code).toBe('NOT_FOUND');
    expect(error?.message).toContain(SUITE);
    expect(error?.message).toMatch(/snow_atf_atf_suites_index/);
    expect(error?.message).not.toMatch(/active by default/);
  });

  it('a 405 carries the page\'s meaning for it: the functionality is inactive', async () => {
    cicd.run = refused(405, 'Method Not Allowed');

    const { error } = await call('snow_atf_atf_suite_exec', { sys_id: SUITE });

    expect(error?.code).toBe('REQUEST_FAILED');
    expect(error?.message).toMatch(/The functionality is inactive/);
  });

  it('a run answered with status 3 is refused with the platform\'s own error, and nothing is polled', async () => {
    cicd.run = ok({
      status: '3', status_label: 'Failed', status_message: '', status_detail: '',
      error: "Scheduled test/suite execution is disabled. Change the value of property 'sn_atf.schedule.enabled' to true to enable it",
    });

    const { error } = await call('snow_atf_atf_suite_exec', { sys_id: SUITE });

    expect(error?.code).toBe('REQUEST_FAILED');
    expect(error?.message).toMatch(/sn_atf\.schedule\.enabled/);
    expect(progressReads()).toBe(0);
  });

  it('a 500 on the run is not retried: a second POST could start the suite twice', async () => {
    cicd.run = refused(500, 'Internal Server Error');

    const { error } = await call('snow_atf_atf_suite_exec', { sys_id: SUITE });

    expect(error?.code).toBe('REQUEST_FAILED');
    expect(posts()).toHaveLength(1);
    expect(error?.message).toMatch(/sys_atf_test_suite_result/);
  });

  it('a sys_id that is not one is refused before anything is sent', async () => {
    const { error } = await call('snow_atf_atf_suite_exec', { sys_id: 'Mixed Test Suite' });

    expect(error?.code).toBe('VALIDATION_ERROR');
    expect(cicd.calls).toEqual([]);
  });
});

describe('ARC-09-C94 — snow_atf_atf_test_exec runs the test through the one suite that holds it', () => {
  const testRecord = ok({ sys_id: TEST, name: 'Jasmine Successful Test' });

  it('exactly one suite: it runs that suite the same way, and says so', async () => {
    cicd.tables.sys_atf_test = testRecord;
    cicd.tables.sys_atf_test_suite_test = ok([membership(TEST, SUITE)]);
    cicd.run = accepted;
    cicd.progress.push(finished('2', 'Successful', 'Suite passed'));
    cicd.results = resultsOf('success', [3, 0, 0, 0]);

    const { value, error } = await call('snow_atf_atf_test_exec', { sys_id: TEST });

    expect(error).toBeUndefined();
    expect(sent()).toEqual([
      `GET /api/now/table/sys_atf_test/${TEST}`,
      'GET /api/now/table/sys_atf_test_suite_test',
      'POST /api/sn_cicd/testsuite/run',
      `GET /api/sn_cicd/progress/${PROGRESS}`,
      `GET /api/sn_cicd/testsuite/results/${RESULT}`,
    ]);
    expect(cicd.calls[1].query.sysparm_query).toBe(`test=${TEST}`);
    expect(cicd.calls[2].query).toEqual({ test_suite_sys_id: SUITE });
    expect(value).toMatchObject({
      outcome: 'success',
      test: { sys_id: TEST, name: 'Jasmine Successful Test' },
      ran_through_suite: { sys_id: SUITE, name: 'Server Suite' },
      counts: { success: 3, failure: 0, error: 0, skipped: 0 },
      result_record: { table: 'sys_atf_test_suite_result', sys_id: RESULT },
    });
    // The suite's other tests ran too, and the caller is told so rather than left to assume one test ran.
    expect(value.summary).toMatch(/Server Suite/);
    expect(value.summary).toMatch(/whole suite/);
  });

  it('no suite: refused with the remedy, and nothing is created or run', async () => {
    cicd.tables.sys_atf_test = testRecord;
    cicd.tables.sys_atf_test_suite_test = ok([]);

    const { error } = await call('snow_atf_atf_test_exec', { sys_id: TEST });

    expect(error?.code).toBe('INVALID_REQUEST');
    expect(error?.message).toMatch(/put the test in a suite, or run snow_atf_atf_suite_exec/);
    expect(posts()).toEqual([]);
  });

  it('several suites: refused, and each is listed so the caller picks', async () => {
    cicd.tables.sys_atf_test = testRecord;
    cicd.tables.sys_atf_test_suite_test = ok([membership(TEST, SUITE), membership(TEST, SUITE_2)]);
    cicd.tables.sys_atf_test_suite = ok([{ sys_id: SUITE, name: 'Server Suite' }, { sys_id: SUITE_2, name: 'Nightly Suite' }]);

    const { error } = await call('snow_atf_atf_test_exec', { sys_id: TEST });

    expect(error?.code).toBe('INVALID_REQUEST');
    for (const s of [SUITE, SUITE_2, 'Server Suite', 'Nightly Suite']) expect(error?.message).toContain(s);
    expect(error?.message).toMatch(/snow_atf_atf_suite_exec/);
    expect(posts()).toEqual([]);
  });

  it('a row whose test is another test is not a membership — an ignored condition cannot pick a suite', async () => {
    // c_TableAPI.md: "if part of a query is invalid, such as an invalid field name, the instance ignores
    // the invalid part". Rows for other tests coming back must not count.
    cicd.tables.sys_atf_test = testRecord;
    cicd.tables.sys_atf_test_suite_test = ok([membership(OTHER_TEST, SUITE_2), membership(TEST, SUITE)]);
    cicd.run = accepted;
    cicd.progress.push(finished('2', 'Successful', 'Suite passed'));
    cicd.results = resultsOf('success', [3, 0, 0, 0]);

    const { value, error } = await call('snow_atf_atf_test_exec', { sys_id: TEST });

    expect(error).toBeUndefined();
    expect(posts()).toHaveLength(1);
    expect(posts()[0].query).toEqual({ test_suite_sys_id: SUITE });
    expect(value).toMatchObject({ ran_through_suite: { sys_id: SUITE } });
  });

  it('two rows for the same suite and test are one suite: the test runs', async () => {
    cicd.tables.sys_atf_test = testRecord;
    cicd.tables.sys_atf_test_suite_test = ok([membership(TEST, SUITE), membership(TEST, SUITE)]);
    cicd.run = accepted;
    cicd.progress.push(finished('2', 'Successful', 'Suite passed'));
    cicd.results = resultsOf('success', [3, 0, 0, 0]);

    const { value, error } = await call('snow_atf_atf_test_exec', { sys_id: TEST });

    expect(error).toBeUndefined();
    expect(posts()).toHaveLength(1);
    expect(posts()[0].query).toEqual({ test_suite_sys_id: SUITE });
    expect(value).toMatchObject({ ran_through_suite: { sys_id: SUITE } });
  });

  it('a test that does not exist is NOT_FOUND, before any membership is read', async () => {
    cicd.tables.sys_atf_test = refused(404, 'No Record found');

    const { error } = await call('snow_atf_atf_test_exec', { sys_id: TEST });

    expect(error?.code).toBe('NOT_FOUND');
    expect(sent()).toEqual([`GET /api/now/table/sys_atf_test/${TEST}`]);
  });
});
