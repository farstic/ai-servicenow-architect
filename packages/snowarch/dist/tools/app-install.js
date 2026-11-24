import { ServiceNowError } from '../utils/errors.js';
import { CICD_PAGE, DEFAULT_BUDGET_SECONDS, MAX_BUDGET_SECONDS, SPOKE_PAGE, classifyCicd, followProgress, labelOf, reasonOf, } from './atf-cicd.js';
export const TOOL_NAME = 'snow_deploy_app_batch_install';
/** The plan record the batch lands in (the page's `batch_plan.url`); the audit record names it. */
const PLAN_TABLE = 'sys_batch_install_plan';
const SYS_ID = /^[0-9a-f]{32}$/i;
/** A plugin identifier, such as `com.glide.some.plugin`: no space, no slash, nothing a URL or a query could read differently. */
const PLUGIN_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;
const fail = (message) => new ServiceNowError(message, 'VALIDATION_ERROR');
const asText = (v) => (typeof v === 'string' && v !== '' ? v : undefined);
/** `budget_seconds` for the tool's schema: the ATF tools' wording, for an install. */
export const BATCH_BUDGET_PROPERTY = {
    type: 'number',
    description: `How long to wait for the outcome, in seconds, from 1 to ${MAX_BUDGET_SECONDS} (default: ${DEFAULT_BUDGET_SECONDS}). `
        + 'An install still going when it runs out is reported with its ids, not cancelled.',
};
const PACKAGE_KEYS = new Set(['id', 'type', 'requested_version', 'load_demo_data', 'requested_customization_version', 'notes']);
function packageArg(value, index) {
    const at = `packages[${index}]`;
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw fail(`${at} must be an object with an id and a type; got ${JSON.stringify(value)}`);
    }
    const p = value;
    for (const key of Object.keys(p)) {
        if (!PACKAGE_KEYS.has(key))
            throw fail(`${at} has an argument this tool does not take: ${key}`);
    }
    if (p.type !== 'application' && p.type !== 'plugin') {
        throw fail(`${at}.type must be "application" or "plugin"; got ${JSON.stringify(p.type)}`);
    }
    if (typeof p.id !== 'string' || p.id === '')
        throw fail(`${at}.id is required: the sys_id of the application, or the identifier of the plugin`);
    if (p.type === 'application' && !SYS_ID.test(p.id)) {
        throw fail(`${at}.id of an application must be its sys_id, 32 hexadecimal characters, not its scope or its name; got ${JSON.stringify(p.id)}`);
    }
    if (p.type === 'plugin' && !PLUGIN_ID.test(p.id)) {
        throw fail(`${at}.id of a plugin must be its plugin identifier, such as com.glide.some.plugin (letters, digits, dots, dashes and underscores); got ${JSON.stringify(p.id)}`);
    }
    for (const key of ['requested_version', 'requested_customization_version', 'notes']) {
        if (p[key] !== undefined && (typeof p[key] !== 'string' || p[key] === '')) {
            throw fail(`${at}.${key} must be a non-empty string when it is given; got ${JSON.stringify(p[key])}`);
        }
    }
    if (p.type === 'application' && p.requested_version === undefined) {
        throw fail(`${at}.requested_version is required when type is "application": the version to install, such as 1.0.2`);
    }
    if (p.load_demo_data !== undefined && typeof p.load_demo_data !== 'boolean') {
        throw fail(`${at}.load_demo_data must be true or false when it is given; got ${JSON.stringify(p.load_demo_data)}`);
    }
    return {
        id: p.id,
        type: p.type,
        ...(p.requested_version === undefined ? {} : { requested_version: p.requested_version }),
        load_demo_data: p.load_demo_data === true,
        ...(p.requested_customization_version === undefined ? {} : { requested_customization_version: p.requested_customization_version }),
        ...(p.notes === undefined ? {} : { notes: p.notes }),
    };
}
/** The tool's arguments, checked: anything the page would refuse, or that is not what it takes, is refused here and sent nowhere. */
export function batchInstallArgs(args) {
    const { name, notes, packages } = args;
    if (typeof name !== 'string' || name.trim() === '') {
        throw fail('name is required: a descriptive name for the batch, as a non-empty string');
    }
    if (notes !== undefined && typeof notes !== 'string')
        throw fail(`notes must be a string when it is given; got ${JSON.stringify(notes)}`);
    if (!Array.isArray(packages) || packages.length === 0) {
        throw fail('packages is required: a non-empty array, one { id, type, requested_version, ... } per package to install');
    }
    return {
        name,
        ...(notes === undefined ? {} : { notes }),
        packages: packages.map((p, i) => packageArg(p, i)),
    };
}
/**
 * A CI/CD refusal as the remedy for it, in the terms of the step it stopped at. Before the batch is accepted nothing has been
 * installed; after it, the install goes on whatever this server can read. The classes of refusal are the ATF tools' (`classifyCicd`).
 */
function refusal(error, step, name, progressId, rollbackId) {
    if (!(error instanceof ServiceNowError))
        return error;
    // A failed sign-in has its own remedy in the always-loaded rule file; it passes through untouched.
    if (error.code === 'AUTHENTICATION_FAILED')
        return error;
    const { kind } = classifyCicd(error);
    const after = step === 'install'
        ? 'Nothing was installed.'
        : `The batch install "${name}" was started (CI/CD progress id ${progressId}${rollbackId ? `, rollback id ${rollbackId}` : ''}) and is not cancelled; `
            + `its ${step} could not be read.`;
    if (kind === 'absent') {
        return new ServiceNowError(`The CI/CD API is not served on this instance: /api/sn_cicd answered "${error.message}". The corpus documents the CICD REST API `
            + `as "a ServiceNow AI Platform feature active by default" (${SPOKE_PAGE}) and names no plugin that provides it, so ask the `
            + `instance administrator why /api/sn_cicd is not available here. ${after}`, 'NOT_FOUND', error.details);
    }
    if (kind === 'forbidden') {
        return new ServiceNowError(`The CI/CD API refused this account (HTTP 403: ${error.message}). "The sn_cicd.sys_ci_automation or admin role is required to `
            + `use this API" (${CICD_PAGE}): ask the instance administrator to grant sn_cicd.sys_ci_automation to the account this server `
            + `signs in as. ${after}`, 'INSUFFICIENT_PRIVILEGES', error.details);
    }
    if (kind === 'not_found') {
        return new ServiceNowError(`The CI/CD API found no ${step === 'install' ? 'batch install endpoint' : step} for the install (HTTP 404: ${error.message}). ${after}`, 'NOT_FOUND', error.details);
    }
    if (kind === 'inactive') {
        return new ServiceNowError(`The CI/CD API answered HTTP 405 (${error.message}), which ${CICD_PAGE} documents as "Invalid method. The functionality is `
            + `inactive." Ask the instance administrator which CI/CD functionality is inactive here. ${after}`, 'REQUEST_FAILED', error.details);
    }
    if (step === 'install' && kind === 'bad_request') {
        return new ServiceNowError(`The CI/CD API rejected the batch install (HTTP 400: ${error.message}). ${after}`, 'INVALID_REQUEST', error.details);
    }
    if (step === 'install') {
        // No answer that says what happened: the batch may have started. It was sent once (`callCicd` with no retries), so at most one
        // batch exists, and the caller is told where it would be.
        return new ServiceNowError(`${error.message} — the batch install "${name}" was sent once and not retried, because a second request could install the batch `
            + `twice; before sending it again, look for a new ${PLAN_TABLE} record named "${name}".`, error.code, error.details);
    }
    return new ServiceNowError(`${error.message} — ${after}`, error.code, error.details);
}
async function cicd(send, step, name, progressId, rollbackId) {
    try {
        return await send();
    }
    catch (error) {
        throw refusal(error, step, name, progressId, rollbackId);
    }
}
const NO_UPDATE_SET = 'This install is captured in no update set: no update set holds it, so it cannot be previewed, moved to another instance '
    + 'or reverted through one, and no §2.2 capture is possible.';
function rollbackText(rollbackId, complete) {
    if (!rollbackId)
        return 'The instance returned no rollback id, so this server cannot say how to roll the batch back.';
    return `To undo it, roll the whole batch back to the previous versions of its packages with the rollback id ${rollbackId}: `
        + `POST /api/sn_cicd/app/batch/rollback/${rollbackId}, called by an instance administrator or an account with the `
        + `sn_cicd.sys_ci_automation role (this server has no tool for it).`
        + (complete ? '' : ` It cannot be used yet: "The rollback capability is only available after the installation is complete" (${CICD_PAGE}).`);
}
const compact = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
function itemOf(raw) {
    const r = (raw !== null && typeof raw === 'object' ? raw : {});
    return compact({
        id: asText(r.id), name: asText(r.name), type: asText(r.type), version: asText(r.version),
        customization_version: asText(r.customization_version), state: asText(r.state), status_message: asText(r.status_message),
        install_date: asText(r.install_date), url: asText(r.url),
    });
}
/**
 * Start the batch, follow its progress until it ends or the budget runs out, and read its results. Never waits past the budget, and
 * never cancels: an install still going when the budget ends is reported as such, with its ids.
 */
export async function installBatch(client, input, budgetSeconds) {
    const { name } = input;
    // `retries` 0: the POST that starts the install is sent once (see `callCicd`).
    const started = await cicd(() => client.callCicd('POST', 'app/batch/install', {}, 0, { ...input }), 'install', name);
    // The page's failure example for these endpoints is a call refused at the start: status 3 and an `error` naming why.
    if (String(started.status) === '3') {
        throw new ServiceNowError(`The CI/CD API did not start the batch install: ${reasonOf(started)}. Nothing was installed.`, 'REQUEST_FAILED');
    }
    const progressId = started.links?.progress?.id;
    if (typeof progressId !== 'string' || !progressId) {
        throw new ServiceNowError(`The CI/CD API answered the batch install with no progress id, so it cannot be followed (status ${labelOf(started)}). If it started, `
            + `its plan is a new ${PLAN_TABLE} record named "${name}".`, 'REQUEST_FAILED');
    }
    const rollbackId = asText(started.links?.rollback?.id);
    const followed = await followProgress(started, budgetSeconds, () => cicd(() => client.callCicd('GET', `progress/${encodeURIComponent(progressId)}`), 'progress', name, progressId, rollbackId));
    const progress = followed.progress;
    const resultsId = asText(started.links?.results?.id) ?? asText(progress.links?.results?.id);
    const label = labelOf(progress);
    const base = { progress_id: progressId, ...(resultsId ? { results_id: resultsId } : {}), ...(rollbackId ? { rollback_id: rollbackId } : {}), budget_seconds: budgetSeconds };
    if (!followed.finished) {
        return {
            outcome: label.toLowerCase(), status_label: label, packages: [], ...base,
            percent_complete: typeof progress.percent_complete === 'number' ? progress.percent_complete : undefined,
            captured_in_update_set: false,
            summary: `The batch install "${name}" was started and is still ${label} after ${budgetSeconds} s, the budget, so its outcome is not known yet. `
                + 'It was not cancelled: it continues on the instance, and '
                + (resultsId ? `its plan is the ${PLAN_TABLE} record ${resultsId}` : `its plan will be a new ${PLAN_TABLE} record named "${name}"`)
                + ` (CI/CD progress id ${progressId}). ${NO_UPDATE_SET} ${rollbackText(rollbackId, false)}`,
        };
    }
    if (!resultsId) {
        if (String(progress.status) === '3') {
            throw new ServiceNowError(`The batch install "${name}" failed with no results to read: ${reasonOf(progress)} (CI/CD progress id ${progressId}).`, 'REQUEST_FAILED');
        }
        return {
            outcome: label.toLowerCase(), status_label: label, packages: [], ...base, captured_in_update_set: false,
            summary: `The batch install "${name}" ended ${label} with no results link, so there are no packages to report (CI/CD progress id ${progressId}). `
                + `${NO_UPDATE_SET} ${rollbackText(rollbackId, true)}`,
        };
    }
    const results = await cicd(() => client.callCicd('GET', `app/batch/results/${encodeURIComponent(resultsId)}`), 'results', name, progressId, rollbackId);
    const rawPlan = (results.batch_plan !== null && typeof results.batch_plan === 'object' ? results.batch_plan : {});
    const plan = compact({ id: asText(rawPlan.id), name: asText(rawPlan.name), state: asText(rawPlan.state), url: asText(rawPlan.url), notes: asText(rawPlan.notes) });
    const packages = (Array.isArray(results.batch_items) ? results.batch_items : []).map(itemOf);
    const outcome = (plan.state ?? label).toLowerCase();
    const installed = packages.filter((p) => p.state?.toLowerCase() === 'installed').length;
    const notInstalled = packages
        .filter((p) => p.state?.toLowerCase() !== 'installed')
        .map((p) => `${p.name ?? p.id ?? 'a package'} (${p.state ?? 'no state'}${p.status_message ? `: ${p.status_message}` : ''})`);
    const sentences = [
        ...(String(progress.status) === '3' ? [`The install ended Failed: ${reasonOf(progress)}.`] : []),
        ...(String(progress.status) === '4' ? [`The install was Canceled on the instance before it finished: ${reasonOf(progress)}.`] : []),
        `Batch install "${plan.name ?? name}": ${outcome} — ${packages.length === 0 ? 'the plan lists no packages' : `${installed} of ${packages.length} packages installed`}`
            + `${notInstalled.length > 0 ? `; not installed: ${notInstalled.join('; ')}` : ''}.`,
        NO_UPDATE_SET,
        rollbackText(rollbackId, true),
    ];
    return {
        outcome, status_label: label, plan, packages, ...base, captured_in_update_set: false, summary: sentences.join(' '),
    };
}
/**
 * The registration of `snow_deploy_app_batch_install`: mutating, under the write gate (so a production instance without the
 * acknowledgement is capped read-only and refuses it like every write), with the plan table fixed for the audit record.
 */
export function appBatchInstallDefinition() {
    return {
        name: TOOL_NAME,
        description: 'Install a batch of applications and plugins through the CI/CD API (POST /api/sn_cicd/app/batch/install), wait for it within '
            + 'budget_seconds, and return each package\'s state, the batch plan and the rollback id. The install is captured in no update set, so no '
            + 'update-set capture is possible and the result says how to roll back; it changes the whole instance, so name every package when asking for '
            + 'write approval. The account needs the sn_cicd.sys_ci_automation or admin role. **[Write]**',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'A descriptive name for this batch (required)' },
                notes: { type: 'string', description: 'Notes about the batch install plan' },
                packages: {
                    type: 'array',
                    minItems: 1,
                    description: 'The packages to install in this batch, one object each',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'string', description: 'The sys_id of the application (32 hexadecimal characters), or the identifier of the plugin' },
                            type: { type: 'string', enum: ['application', 'plugin'], description: 'The type of package' },
                            requested_version: { type: 'string', description: 'The version to install, such as 1.0.2 (required when type is application)' },
                            load_demo_data: { type: 'boolean', default: false, description: 'Whether to load demo data with the package (default false)' },
                            requested_customization_version: { type: 'string', description: 'The version of the customization of the application or plugin to install, such as 2.0.7' },
                            notes: { type: 'string', description: 'Notes about this package' },
                        },
                        required: ['id', 'type'],
                        additionalProperties: false,
                    },
                },
                budget_seconds: BATCH_BUDGET_PROPERTY,
            },
            required: ['name', 'packages'],
        },
        gate: 'write',
        mutates: true,
        table: PLAN_TABLE,
    };
}
