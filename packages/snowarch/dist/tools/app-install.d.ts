/**
 * ARC-09-C312 — a batch of applications and plugins installed through the CI/CD API.
 *
 * No snowarch tool installed an application: the owner asked for SPM on a live instance, and the model, rightly, would not call
 * `/api/sn_cicd/app/batch/install` around the server with the stored credentials. What the corpus documents is
 * vendor/ServiceNowDocs/markdown/api-reference/rest-apis/cicd-api.md:
 *
 *   - `POST /api/sn_cicd/app/batch/install` "Installs two or more packages in a single specified batch", named by a JSON body:
 *     `name` and `packages` (required), `notes`; each package has `id` (the sys_id of an application, or the identifier of a
 *     plugin), `type` (application or plugin), `requested_version` ("Required if packages.type is set to application"),
 *     `load_demo_data` (default false), `requested_customization_version` and `notes`. It answers at once ("an asynchronous
 *     response model") with `links.progress.id`, `links.results.id` and `links.rollback.id`.
 *   - `GET /api/sn_cicd/progress/{progress_id}`: "0: Pending, 1: Running, 2: Successful, 3: Failed, 4: Canceled" (followed as
 *     the ATF tools follow it, `followProgress` in atf-cicd.ts).
 *   - `GET /api/sn_cicd/app/batch/results/{result_id}` gives `batch_plan` (its state) and `batch_items`, one per package, each
 *     with a `state` and the `status_message` of "any errors that occurred during the installation".
 *   - `POST /api/sn_cicd/app/batch/rollback/{rollback_id}` rolls every package of the batch back to its previous version, "only
 *     available after the installation is complete". This server has no tool for it, and the answer says so.
 *   - "The sn_cicd.sys_ci_automation or admin role is required to use this API."
 *
 * An install is captured in NO update set. Nothing about it can be previewed, moved to another instance or reverted through
 * one, so the §2.2 capture of the always-loaded rule cannot apply, and the answer says that in words.
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import type { ToolDefinition } from './types.js';
export declare const TOOL_NAME = "snow_deploy_app_batch_install";
export interface BatchPackage {
    id: string;
    type: 'application' | 'plugin';
    requested_version?: string;
    load_demo_data: boolean;
    requested_customization_version?: string;
    notes?: string;
}
export interface BatchInstallInput {
    name: string;
    notes?: string;
    packages: BatchPackage[];
}
export interface BatchItem {
    id?: string;
    name?: string;
    type?: string;
    version?: string;
    customization_version?: string;
    state?: string;
    status_message?: string;
    install_date?: string;
    url?: string;
}
export interface BatchInstall {
    /** The plan's state when the results were read (the page's "Installed", "Partial Install", "Failed", ...), lower-cased; otherwise the CI/CD state. */
    outcome: string;
    /** The CI/CD status label the install ended on, or was still in when the budget ran out. */
    status_label: string;
    plan?: {
        id?: string;
        name?: string;
        state?: string;
        url?: string;
        notes?: string;
    };
    /** One entry per package, as the results list them; empty while the install is still running. */
    packages: BatchItem[];
    rollback_id?: string;
    progress_id: string;
    results_id?: string;
    percent_complete?: number;
    budget_seconds: number;
    /** An install is in no update set. Always false, and said in `summary`. */
    captured_in_update_set: false;
    summary: string;
}
/** `budget_seconds` for the tool's schema: the ATF tools' wording, for an install. */
export declare const BATCH_BUDGET_PROPERTY: {
    readonly type: "number";
    readonly description: string;
};
/** The tool's arguments, checked: anything the page would refuse, or that is not what it takes, is refused here and sent nowhere. */
export declare function batchInstallArgs(args: Record<string, unknown>): BatchInstallInput;
/**
 * Start the batch, follow its progress until it ends or the budget runs out, and read its results. Never waits past the budget, and
 * never cancels: an install still going when the budget ends is reported as such, with its ids.
 */
export declare function installBatch(client: ServiceNowClient, input: BatchInstallInput, budgetSeconds: number): Promise<BatchInstall>;
/**
 * The registration of `snow_deploy_app_batch_install`: mutating, under the write gate (so a production instance without the
 * acknowledgement is capped read-only and refuses it like every write), with the plan table fixed for the audit record.
 */
export declare function appBatchInstallDefinition(): ToolDefinition;
