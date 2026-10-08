/**
 * ARC-09-C94 — ATF suites run through the CI/CD API, the one way the corpus documents to run tests
 * over REST.
 *
 * The exec tools used to post to `/api/now/atf/runner/run_suite` and `run_test`. No such path is
 * documented, and on the owner's PDI it answered "Requested URI does not represent any resource"
 * (docs/validation/2.0.11-rc.1-live-sitting.md, § ARC-09-C94). What the corpus documents is
 * vendor/ServiceNowDocs/markdown/api-reference/rest-apis/cicd-api.md:
 *
 *   - `POST /api/sn_cicd/testsuite/run` "Starts a specified automated test suite", named by the
 *     `test_suite_sys_id` query parameter, and answers at once: "This API uses an asynchronous
 *     response model", with the progress id in `links.progress.id`.
 *   - `GET /api/sn_cicd/progress/{progress_id}` gives the status — "0: Pending, 1: Running,
 *     2: Successful, 3: Failed, 4: Canceled" — and, for a suite run, `links.results.id`.
 *   - `GET /api/sn_cicd/testsuite/results/{result_id}` gives `test_suite_status`, `test_suite_name`
 *     and the `rolledup_test_*_count` fields; its `links.results.url` is the
 *     `sys_atf_test_suite_result` record, which is where the run's records are.
 *   - "The sn_cicd.sys_ci_automation or admin role is required to use this API."
 *
 * The page documents no call that runs a single test. The test exec therefore runs the one suite that
 * holds the test, says so, and creates nothing to make one (`suitesHolding` below).
 */
import type { ServiceNowClient } from '../servicenow/client.js';
export declare const CICD_PAGE = "vendor/ServiceNowDocs/markdown/api-reference/rest-apis/cicd-api.md";
/** How long a run is waited for when the caller does not say, in seconds. */
export declare const DEFAULT_BUDGET_SECONDS = 300;
/**
 * The most a caller may ask to wait. Any finite budget ends, but a caller could ask for a day; past
 * half an hour the run is better left to finish on the instance and its result record read later.
 */
export declare const MAX_BUDGET_SECONDS = 1800;
export interface SuiteRun {
    /** `test_suite_status` when the run finished (the page's example says `success`); otherwise the CI/CD state, lower-cased. */
    outcome: string;
    /** The CI/CD status label the run ended on, or was still in when the budget ran out. */
    status_label: string;
    suite: {
        sys_id: string;
        name?: string;
    };
    counts?: {
        success: number;
        failure: number;
        error: number;
        skipped: number;
    };
    duration?: string;
    /** Where the run's records are. */
    result_record?: {
        table: 'sys_atf_test_suite_result';
        sys_id: string;
    };
    progress_id: string;
    percent_complete?: number;
    budget_seconds: number;
    summary: string;
}
/** `sys_id`, checked: a sys_id is 32 hexadecimal characters, and anything else is not sent anywhere. */
export declare function sysIdArg(value: unknown): string;
/** `budget_seconds`, checked: from 1 to MAX_BUDGET_SECONDS, DEFAULT_BUDGET_SECONDS when absent. */
export declare function budgetArg(value: unknown): number;
/**
 * Start the suite, follow its progress until it finishes or the budget runs out, and read its results.
 * Never waits past the budget, and never cancels: a run still going when the budget ends is reported
 * as such, with its ids.
 */
export declare function runSuite(client: ServiceNowClient, suite: string, budgetSeconds: number): Promise<SuiteRun>;
/**
 * The suites that hold a test, read from `sys_atf_test_suite_test`, the "Test Suite Test" table
 * (vendor/ServiceNowDocs/markdown/build-workflows/workflow-studio/activate-process-automation-designer-for-app-engine.md)
 * behind a suite's "Test Suite Tests" related list, whose rows have a Test field
 * (vendor/ServiceNowDocs/markdown/application-development/automated-test-framework-atf/atf-add-test-to-suite.md).
 *
 * The column names `test` and `test_suite` are NOT in the corpus; the live README's after-the-fix run
 * reads them. A query naming a column that does not exist is not refused — "the instance ignores the
 * invalid part" and returns rows (vendor/ServiceNowDocs/markdown/api-reference/rest-apis/c_TableAPI.md) —
 * so a row counts only when the test it carries IS this test. A wrong column name then finds no suite
 * and the tool refuses; it can never pick a suite the test is not in.
 */
export declare function suitesHolding(client: ServiceNowClient, test: string): Promise<string[]>;
/** Names for a list of suites, for a refusal that asks the caller to pick one. */
export declare function suiteNames(client: ServiceNowClient, suites: string[]): Promise<Array<{
    sys_id: string;
    name?: string;
}>>;
