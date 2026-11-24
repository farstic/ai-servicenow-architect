// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ABSENT_MESSAGE, ok, refused, resetCicd, type CicdState,
} from '../helpers/fake-cicd.js';
import { ServiceNowClient } from '../../src/servicenow/client.js';
import { FLAG_NAMES, runWithInstance, type Flags, type InstanceRuntime } from '../../src/servicenow/context.js';
import { instanceManager } from '../../src/servicenow/instances.js';
import { dispatchDeploymentAction } from '../../src/tools/deployment.js';
import { collectToolCatalog } from '../../src/tools/index.js';
import type { ServiceNowError } from '../../src/utils/errors.js';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { trackTempDir } from '../helpers/server-child.js';

/**
 * ARC-09-C312 — `snow_deploy_app_batch_install`, against a fake of the CI/CD API.
 *
 * No snowarch tool installed an application: the owner asked for SPM on a live instance and the model, rightly, would
 * not call `/api/sn_cicd/app/batch/install` around the server with the stored credentials. The corpus documents the call
 * (vendor/ServiceNowDocs/markdown/api-reference/rest-apis/cicd-api.md, "CI/CD - POST /sn_cicd/app/batch/install"): a JSON
 * body with a name, notes and `packages`; an asynchronous answer with `links.progress`, `links.results` and
 * `links.rollback`; `GET /sn_cicd/progress/{id}` until the status is Successful, Failed or Canceled; and
 * `GET /sn_cicd/app/batch/results/{id}` for the plan and each package. The REAL client runs here and the fake stands at
 * the HTTP seam (as in atf-cicd.test.ts), so these tests read the requests that were sent — method, path, body, how
 * many — and what the tool made of the answers. The clock is fake: a test never spends a real second.
 */
const cicd = vi.hoisted<CicdState>(() => ({ calls: [], progress: [], tables: {} }));
vi.mock('../../src/servicenow/http.js', async () => (await import('../helpers/fake-cicd.js')).fakeCicdModule(cicd));

const TOOL = 'snow_deploy_app_batch_install';
const HOST = 'https://test.service-now.com';
const APP = `${'a'.repeat(31)}1`;
const APP_2 = `${'a'.repeat(31)}2`;
const PLUGIN = 'com.glide.some.plugin';
const PROGRESS = `${'b'.repeat(31)}1`;
const PLAN = `${'c'.repeat(31)}1`;
const ROLLBACK = `${'e'.repeat(31)}1`;

const links = {
  progress: { id: PROGRESS, url: `${HOST}/api/sn_cicd/progress/${PROGRESS}` },
  results: { id: PLAN, url: `${HOST}/api/sn_cicd/app/batch/results/${PLAN}` },
  rollback: { id: ROLLBACK },
};
const state = (status: string, label: string, percent: number, message = '', error = '', answerLinks: Record<string, unknown> = links) => ({
  links: answerLinks, status, status_label: label, status_message: message, status_detail: message, error, percent_complete: percent,
});
/** The install's own answer carries all three links (the page's example); a progress read carries its own. The results id is the install's. */
const progressOnly = { progress: links.progress };
/** The install's own answer: accepted, pending, with the three links (the page's example). */
const accepted = ok(state('0', 'Pending', 0));
const pending = ok(state('0', 'Pending', 0, '', '', progressOnly));
const running = (percent: number) => ok(state('1', 'Running', percent, '', '', progressOnly));
const finished = (status: string, label: string, message = '') => ok(state(status, label, 100, message, '', progressOnly));

const item = (over: Record<string, unknown>) => ({
  name: 'Some app', type: 'Application', version: '1.0.2', state: 'Installed', install_date: '2026-11-24 10:00:00',
  id: `${'9'.repeat(31)}1`, url: `${HOST}/sys_batch_install_item.do?sys_id=${'9'.repeat(31)}1`, notes: '', status_message: '', ...over,
});
const plan = (state: string, items: unknown[]) => ok({
  batch_plan: { name: 'Release 2.2 Deployment', id: PLAN, url: `${HOST}/sys_batch_install_plan.do?sys_id=${PLAN}`, state, notes: 'for the owner' },
  batch_items: items,
});

const client = () => new ServiceNowClient({
  instanceUrl: HOST, authMethod: 'basic', basic: { username: 'u', password: 'p' }, maxRetries: 3, retryDelayMs: 0,
});

/** Run one tool call to its end on the fake clock. */
async function call(args: Record<string, unknown>) {
  const t0 = Date.now();
  const settled = dispatchDeploymentAction(client(), TOOL, args)
    .then((value) => ({ value, error: undefined }), (error: ServiceNowError) => ({ value: undefined, error }));
  await vi.runAllTimersAsync();
  const out = await settled;
  return { ...out, waitedMs: Date.now() - t0 };
}

const sent = () => cicd.calls.map((c) => `${c.method} ${c.path}`);
const posts = () => cicd.calls.filter((c) => c.method === 'POST');
const progressReads = () => cicd.calls.filter((c) => c.path.startsWith('/api/sn_cicd/progress/')).length;
const resultsRead = () => sent().some((s) => s.startsWith('GET /api/sn_cicd/app/batch/results/'));

const TWO = [
  { id: APP, type: 'application', requested_version: '1.0.2' },
  { id: PLUGIN, type: 'plugin' },
];
const ARGS = { name: 'Release 2.2 Deployment', packages: TWO };

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

describe('ARC-09-C312 — the request', () => {
  it('one POST with the batch as the page documents it: the packages as given, load_demo_data false when not said, no query', async () => {
    cicd.install = accepted;
    cicd.progress.push(finished('2', 'Successful'));
    cicd.batchResults = plan('Installed', [item({})]);

    const { error } = await call({
      name: 'Release 2.2 Deployment', notes: 'for the owner',
      packages: [
        { id: APP, type: 'application', requested_version: '1.0.2', notes: 'the base app' },
        { id: APP_2, type: 'application', requested_version: '1.0.0', requested_customization_version: '2.0.7' },
        { id: PLUGIN, type: 'plugin', load_demo_data: true, notes: 'plugin notes' },
      ],
    });

    expect(error).toBeUndefined();
    expect(posts()).toHaveLength(1);
    expect(posts()[0].path).toBe('/api/sn_cicd/app/batch/install');
    expect(posts()[0].query).toEqual({});
    expect(posts()[0].body).toEqual({
      name: 'Release 2.2 Deployment', notes: 'for the owner',
      packages: [
        { id: APP, type: 'application', requested_version: '1.0.2', load_demo_data: false, notes: 'the base app' },
        { id: APP_2, type: 'application', requested_version: '1.0.0', requested_customization_version: '2.0.7', load_demo_data: false },
        { id: PLUGIN, type: 'plugin', load_demo_data: true, notes: 'plugin notes' },
      ],
    });
  });

  it('the POST is sent once even when the instance answers a server error: a second request could install the batch twice', async () => {
    cicd.install = refused(500, 'Internal server error');

    const { error } = await call(ARGS);

    expect(posts()).toHaveLength(1);
    expect(error?.message).toMatch(/sent once and not retried/);
    expect(error?.message).toMatch(/sys_batch_install_plan/);
  });
});

describe('ARC-09-C312 — following the install', () => {
  it('pending, running, successful: the progress is read at five-second steps, then the results, and no longer', async () => {
    cicd.install = accepted;
    cicd.progress.push(pending, running(50), finished('2', 'Successful'));
    cicd.batchResults = plan('Installed', [item({ name: 'Strategic Portfolio Management' }), item({ name: PLUGIN, type: 'Plugin', version: '' })]);

    const { value, error, waitedMs } = await call(ARGS);

    expect(error).toBeUndefined();
    expect(progressReads()).toBe(3);
    expect(waitedMs).toBe(15_000);
    expect(sent().filter((s) => s.startsWith('GET /api/sn_cicd/app/batch/results/'))).toEqual([`GET /api/sn_cicd/app/batch/results/${PLAN}`]);
    expect(value).toMatchObject({ outcome: 'installed', status_label: 'Successful', progress_id: PROGRESS, results_id: PLAN, budget_seconds: 300 });
  });

  it('the first answer has no results link: the one the progress answer carries is used', async () => {
    cicd.install = ok(state('0', 'Pending', 0, '', '', { progress: links.progress, rollback: links.rollback }));
    cicd.progress.push(ok(state('2', 'Successful', 100, '', '', { progress: links.progress, results: links.results })));
    cicd.batchResults = plan('Installed', [item({})]);

    const { value, error } = await call(ARGS);

    expect(error).toBeUndefined();
    expect(resultsRead()).toBe(true);
    expect(value).toMatchObject({ outcome: 'installed', results_id: PLAN, rollback_id: ROLLBACK });
  });

  it('the budget ends first: nothing is cancelled, no results are read, and the answer says where the install is', async () => {
    cicd.install = accepted;
    cicd.progress.push(running(40));

    const { value, error, waitedMs } = await call({ ...ARGS, budget_seconds: 12 });

    expect(error).toBeUndefined();
    expect(waitedMs).toBe(12_000);
    expect(resultsRead()).toBe(false);
    expect(sent().every((s) => !s.includes('cancel'))).toBe(true);
    expect(value).toMatchObject({ outcome: 'running', status_label: 'Running', progress_id: PROGRESS, results_id: PLAN, percent_complete: 40, budget_seconds: 12 });
    const summary = (value as { summary: string }).summary;
    expect(summary).toMatch(/not cancelled/i);
    expect(summary).toMatch(/still Running after 12 s/);
    expect(summary).toContain(PLAN);
    expect(summary).toMatch(/sys_batch_install_plan/);
    expect(summary).toMatch(/only available after the installation is complete/i);
  });

  it('a budget outside 1 to 1800 seconds is refused before anything is sent', async () => {
    const { error } = await call({ ...ARGS, budget_seconds: 99_999 });
    expect(error?.code).toBe('VALIDATION_ERROR');
    expect(cicd.calls).toHaveLength(0);
  });
});

describe('ARC-09-C312 — what the answer says', () => {
  it('per package: its state and its message, the plan, the rollback id; a partial install is named as one', async () => {
    cicd.install = accepted;
    cicd.progress.push(finished('2', 'Successful'));
    cicd.batchResults = plan('Partial Install', [
      item({ name: 'Strategic Portfolio Management', id: APP, version: '1.0.2' }),
      item({ name: 'Customization for SPM', id: APP_2, version: '1.0.0', customization_version: '2.0.7' }),
      item({ name: PLUGIN, id: PLUGIN, type: 'Plugin', version: '', state: 'Failed', install_date: '', status_message: 'Plugin activation failed: a dependency is missing' }),
    ]);

    const { value, error } = await call(ARGS);

    expect(error).toBeUndefined();
    const v = value as { outcome: string; plan: Record<string, unknown>; packages: Array<Record<string, unknown>>; rollback_id: string; summary: string };
    expect(v.outcome).toBe('partial install');
    expect(v.plan).toMatchObject({ id: PLAN, name: 'Release 2.2 Deployment', state: 'Partial Install' });
    expect(v.rollback_id).toBe(ROLLBACK);
    expect(v.packages).toHaveLength(3);
    expect(v.packages[0]).toMatchObject({ id: APP, name: 'Strategic Portfolio Management', type: 'Application', version: '1.0.2', state: 'Installed' });
    expect(v.packages[1]).toMatchObject({ customization_version: '2.0.7', state: 'Installed' });
    expect(v.packages[2]).toMatchObject({ name: PLUGIN, state: 'Failed', status_message: 'Plugin activation failed: a dependency is missing' });
    // an empty field is left out, not passed on as an empty string
    expect(v.packages[2]).not.toHaveProperty('install_date');
    expect(v.summary).toMatch(/2 of 3 packages installed/);
    expect(v.summary).toContain('Plugin activation failed: a dependency is missing');
  });

  it('the text says plainly that an install is captured in no update set, and how to roll it back', async () => {
    cicd.install = accepted;
    cicd.progress.push(finished('2', 'Successful'));
    cicd.batchResults = plan('Installed', [item({})]);

    const { value } = await call(ARGS);

    const v = value as { summary: string; captured_in_update_set: boolean };
    expect(v.captured_in_update_set).toBe(false);
    expect(v.summary).toMatch(/captured in no update set/i);
    expect(v.summary).toMatch(/§2\.2/);
    expect(v.summary).toContain(`POST /api/sn_cicd/app/batch/rollback/${ROLLBACK}`);
    expect(v.summary).toMatch(/administrator/i);
  });

  it('an install that ends Failed is reported with the instance\'s own reason and the packages it read, not thrown away', async () => {
    cicd.install = accepted;
    cicd.progress.push(finished('3', 'Failed', 'Dependency check failed for Strategic Portfolio Management'));
    cicd.batchResults = plan('Failed', [item({ state: 'Failed', status_message: 'Missing dependency' })]);

    const { value, error } = await call(ARGS);

    expect(error).toBeUndefined();
    expect(value).toMatchObject({ outcome: 'failed', status_label: 'Failed' });
    const summary = (value as { summary: string }).summary;
    expect(summary).toContain('Dependency check failed for Strategic Portfolio Management');
    expect(summary).toContain('Missing dependency');
  });

  it('an install that ends Canceled on the instance is reported as canceled there, with the packages it read', async () => {
    cicd.install = accepted;
    cicd.progress.push(finished('4', 'Canceled', 'Canceled by an administrator'));
    cicd.batchResults = plan('Failed', [item({ state: 'Ready', install_date: '' })]);

    const { value, error } = await call(ARGS);

    expect(error).toBeUndefined();
    expect(value).toMatchObject({ status_label: 'Canceled', outcome: 'failed' });
    const summary = (value as { summary: string }).summary;
    expect(summary).toMatch(/Canceled on the instance before it finished: Canceled by an administrator/);
    expect(summary).toMatch(/0 of 1 packages installed/);
  });

  it('an install the instance refuses at the start (status Failed in the first answer) is an error, and nothing was installed', async () => {
    cicd.install = ok({ ...state('3', 'Failed', 0, '', 'The batch plan could not be created: a package is invalid') });

    const { error } = await call(ARGS);

    expect(error?.code).toBe('REQUEST_FAILED');
    expect(error?.message).toMatch(/did not start the batch install: The batch plan could not be created: a package is invalid/);
    expect(error?.message).toMatch(/Nothing was installed/);
    expect(progressReads()).toBe(0);
  });

  it('an answer with no progress link cannot be followed, and the error says where an install would be', async () => {
    cicd.install = ok({ status: '0', status_label: 'Pending', links: {} });

    const { error } = await call(ARGS);

    expect(error?.code).toBe('REQUEST_FAILED');
    expect(error?.message).toMatch(/no progress id/);
    expect(error?.message).toMatch(/sys_batch_install_plan/);
  });
});

describe('ARC-09-C312 — the refusals, as remedies', () => {
  it('403: the role the page names, and that nothing was installed', async () => {
    cicd.install = refused(403, 'User Not Authorized');

    const { error } = await call(ARGS);

    expect(error?.code).toBe('INSUFFICIENT_PRIVILEGES');
    expect(error?.message).toMatch(/sn_cicd\.sys_ci_automation or admin/);
    expect(error?.message).toMatch(/Nothing was installed/);
  });

  it('an instance that does not serve /api/sn_cicd: NOT_FOUND, and the administrator to ask', async () => {
    cicd.install = refused(400, ABSENT_MESSAGE);

    const { error } = await call(ARGS);

    expect(error?.code).toBe('NOT_FOUND');
    expect(error?.message).toMatch(/CI\/CD API is not served on this instance/);
    expect(error?.message).toMatch(/Nothing was installed/);
  });

  it('405: the functionality is inactive, in the page\'s words', async () => {
    cicd.install = refused(405, 'Method not allowed');

    const { error } = await call(ARGS);

    expect(error?.code).toBe('REQUEST_FAILED');
    expect(error?.message).toMatch(/Invalid method\. The functionality is inactive/);
  });

  it('400 to the request itself: INVALID_REQUEST with the instance\'s message', async () => {
    cicd.install = refused(400, 'Package not found in the application repository');

    const { error } = await call(ARGS);

    expect(error?.code).toBe('INVALID_REQUEST');
    expect(error?.message).toMatch(/rejected the batch install \(HTTP 400: Package not found in the application repository\)/);
    expect(error?.message).toMatch(/Nothing was installed/);
  });

  it('a 404 after the install started says it is not cancelled and names the progress id', async () => {
    cicd.install = accepted;
    cicd.progress.push(refused(404, 'No Record found'));

    const { error } = await call(ARGS);

    expect(error?.code).toBe('NOT_FOUND');
    expect(error?.message).toContain(PROGRESS);
    expect(error?.message).toMatch(/not cancelled/);
  });

  it('results that cannot be read after a finished install: the install stands, and the error says so', async () => {
    cicd.install = accepted;
    cicd.progress.push(finished('2', 'Successful'));
    cicd.batchResults = refused(404, 'No Record found');

    const { error } = await call(ARGS);

    expect(error?.code).toBe('NOT_FOUND');
    expect(error?.message).toMatch(/not cancelled/);
    expect(error?.message).toContain(PROGRESS);
    expect(error?.message).toContain(ROLLBACK);
  });
});

describe('ARC-09-C312 — the input is checked before anything is sent', () => {
  const bad: Array<[string, Record<string, unknown>, RegExp]> = [
    ['no name', { packages: TWO }, /name/],
    ['a blank name', { name: '   ', packages: TWO }, /name/],
    ['no packages', { name: 'x' }, /packages/],
    ['an empty list of packages', { name: 'x', packages: [] }, /packages/],
    ['a package that is not an object', { name: 'x', packages: ['a'] }, /packages\[0\] must be an object/],
    ['a package with no id', { name: 'x', packages: [{ type: 'plugin' }] }, /packages\[0\]\.id/],
    ['a package with an unknown type', { name: 'x', packages: [{ id: PLUGIN, type: 'update_set' }] }, /packages\[0\]\.type/],
    ['an application whose id is not a sys_id', { name: 'x', packages: [{ id: 'sn_spm', type: 'application', requested_version: '1.0.0' }] }, /sys_id/],
    ['an application with no requested_version', { name: 'x', packages: [{ id: APP, type: 'application' }] }, /requested_version/],
    ['a plugin id with a space in it', { name: 'x', packages: [{ id: 'com glide', type: 'plugin' }] }, /packages\[0\]\.id/],
    ['load_demo_data that is not a boolean', { name: 'x', packages: [{ id: PLUGIN, type: 'plugin', load_demo_data: 'yes' }] }, /load_demo_data/],
    ['notes that are not a string', { name: 'x', notes: 5, packages: TWO }, /notes/],
    ['a package with an argument this tool does not take', { name: 'x', packages: [{ id: PLUGIN, type: 'plugin', force: true }] }, /force/],
  ];
  it.each(bad)('%s is refused, and no request goes out', async (_label, args, re) => {
    const { error } = await call(args);
    expect(error?.code).toBe('VALIDATION_ERROR');
    expect(error?.message).toMatch(re);
    expect(cicd.calls).toHaveLength(0);
  });
});

describe('ARC-09-C312 — the gate and the production lock', () => {
  const flags = (over: Partial<Flags> = {}): Flags =>
    Object.fromEntries(FLAG_NAMES.map((f) => [f, over[f] ?? 'false'])) as Flags;
  const runtime = (effective: Flags, environment = 'dev'): InstanceRuntime => ({
    label: 'pdi', url: HOST, environment, preset: 'custom', flags: effective, effectiveFlags: effective, toolPackage: 'full',
    maxRecords: 100, prodWriteAck: false, client: {} as InstanceRuntime['client'], warnings: [],
  });

  it('with WRITE_ENABLED off it is refused with WRITE_NOT_ENABLED before the arguments are looked at and before anything is sent', async () => {
    cicd.install = accepted;
    const refusal = await runWithInstance(runtime(flags()), () => dispatchDeploymentAction(client(), TOOL, {}))
      .then(() => undefined, (error: ServiceNowError) => error);

    expect(refusal?.code).toBe('WRITE_NOT_ENABLED');
    expect(cicd.calls).toHaveLength(0);
  });

  it('a production instance (read-only, as production is without the acknowledgement) is refused the same way', async () => {
    const refusal = await runWithInstance(runtime(flags(), 'prod'), () => dispatchDeploymentAction(client(), TOOL, ARGS))
      .then(() => undefined, (error: ServiceNowError) => error);

    expect(refusal?.code).toBe('WRITE_NOT_ENABLED');
    expect(cicd.calls).toHaveLength(0);
  });

  describe('the production instance that asks for write flags without --ack-prod is not loaded, so this tool cannot run on it', () => {
    // the same four variables prod-ack.test.ts clears: without SERVICENOW_INSTANCE_URL the suite's own env instance loads beside the store's
    const KEYS = ['SNOW_STORE', 'CLAUDE_PROJECT_DIR', 'SERVICENOW_INSTANCE_URL', 'WRITE_ENABLED'] as const;
    let saved: Record<string, string | undefined>;
    let tmp: string;
    beforeEach(() => {
      vi.useRealTimers();
      saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
      for (const k of KEYS) delete process.env[k];
      tmp = trackTempDir(mkdtempSync(join(tmpdir(), 'snowarch-c312-')));
      process.env.CLAUDE_PROJECT_DIR = tmp;
    });
    afterEach(() => {
      for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
      rmSync(tmp, { recursive: true, force: true });
      instanceManager.reload();
    });

    it('prod at pdi-developer, no prodWriteAck: not loaded, with the --ack-prod remedy; with the acknowledgement it loads with WRITE on', () => {
      const dir = join(tmp, '.local');
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      const path = join(dir, 'instances.json');
      const entry = (over: Record<string, unknown>) => ({
        url: 'https://prod12345.service-now.com', environment: 'prod', auth: { method: 'basic', username: 'admin', password: 'secret' },
        preset: 'pdi-developer', toolPackage: 'full', maxRecords: 100, prodWriteAck: false, ...over,
      });
      writeFileSync(path, JSON.stringify({ version: 1, instances: { prod: entry({}) } }), { mode: 0o600 });
      chmodSync(path, 0o600);
      const refused = instanceManager.reload();
      expect(refused.loaded).toEqual([]);
      expect(refused.notLoaded[0].code).toBe('PROD_WRITE_NOT_ACKNOWLEDGED');
      expect(refused.notLoaded[0].message).toContain('--ack-prod');

      writeFileSync(path, JSON.stringify({ version: 1, instances: { prod: entry({ prodWriteAck: true }) } }), { mode: 0o600 });
      chmodSync(path, 0o600);
      expect(instanceManager.reload().loaded).toEqual(['prod']);
      expect(instanceManager.getEntry('prod')?.effectiveFlags.WRITE_ENABLED).toBe('true');
    });
  });
});

describe('ARC-09-C312 — the declaration', () => {
  const declared = () => collectToolCatalog().find((t) => t.name === TOOL);

  it('is in the catalogue under the write gate, mutating, with its plan table fixed', () => {
    expect(declared()).toMatchObject({ gate: 'write', mutates: true, table: 'sys_batch_install_plan' });
    expect(declared()?.description).toMatch(/captured in no update set/i);
  });

  it('closes its arguments, and the objects inside them', () => {
    const schema = declared()?.inputSchema as {
      additionalProperties?: boolean; required?: string[];
      properties: { packages: { type: string; minItems?: number; items: { additionalProperties?: boolean; required?: string[]; properties: Record<string, { type?: string; enum?: string[]; default?: unknown }> } } };
    };
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(['name', 'packages']);
    expect(schema.properties.packages.type).toBe('array');
    expect(schema.properties.packages.minItems).toBe(1);
    expect(schema.properties.packages.items.additionalProperties).toBe(false);
    expect(schema.properties.packages.items.required).toEqual(['id', 'type']);
    expect(schema.properties.packages.items.properties.type.enum).toEqual(['application', 'plugin']);
    expect(schema.properties.packages.items.properties.load_demo_data).toMatchObject({ type: 'boolean', default: false });
  });
});
