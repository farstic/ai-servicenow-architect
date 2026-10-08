/**
 * ARC-09-C95 — ATF authoring: a test, a step and the step's inputs, each written and then read back.
 *
 * The owner's R2: a session wrote `sys_atf_test`, `sys_atf_step` and `sys_variable_value` by hand and
 * could not confirm the script was attached. These tools write the same records and say what the
 * instance kept: after each write the record is read back by sys_id and every field sent is compared,
 * value by value, in the warnings model of ARC-09-C92/C93 —
 *   not shown          FIELD_NOT_STORED
 *   a shorter prefix   VALUE_TRUNCATED (the C93 detector; reported here only when the write's own
 *                      answer hid the cut, because the router's check reports a cut the answer showed)
 *   anything else      VALUE_NOT_AS_SENT, with the first differing offset and both lengths, never the
 *                      values — a script in a warning is noise
 * Line endings are normalised (\r\n → \n) on both sides before comparing, and nothing else is. The
 * transport shape comes off first: a reference arrives as `{ link, value }`, `true` as `"true"`.
 *
 * What the corpus gives (vendor/ServiceNowDocs/markdown/application-development/automated-test-framework-atf/):
 *   automated-test-framework.md   a test step is "a record in the Test Step [sys_atf_step] table that
 *                                 specifies a test action, the step configuration, and an execution
 *                                 order"; a step configuration is a record in the Test Step Config
 *                                 [sys_atf_step_config] table that "specifies the input variables"
 *   atf-test-record-form.md       a test has a Name, a Description and Active
 *   atf-step-config-record.md     a step config has a Name, Active and an "Input Variables related list"
 *   atf-edit-step-order.md        "the system assigns it the next-highest available integer value"
 *   test-steps-server-category.md Run Server Side Script: "The javascript for the server to execute"
 *   atf-move-test.md              tests move "using update sets": these are configuration writes (§2.2)
 * What it does not give: every column name below, and where a step's input VALUES are kept. That is the
 * design's assumption — one `sys_variable_value` row per input (`document`, `document_key`, `variable`,
 * `value`), its variable an `atf_input_variable` row (`model` = the step config, `element` = the input's
 * name) — which the live run reads (R3, R4) before its first write. A wrong guess shows up here as a
 * read-back warning or a refusal, never as a write the tool claims it made.
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { dictionaryLimits, lengthOf, looksCut, reconcile } from '../servicenow/stored-values.js';
import type { ServiceNowRecord } from '../servicenow/types.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireScripting } from '../utils/permissions.js';
import { sysIdArg } from './atf-cicd.js';

const TEST = 'sys_atf_test';
const STEP = 'sys_atf_step';
const CONFIG = 'sys_atf_step_config';
const INPUT_VARIABLE = 'atf_input_variable';
const VALUE = 'sys_variable_value';

/**
 * The baseline step that stores server JavaScript the instance runs (test-steps-server-category.md).
 * A step of this config also needs SCRIPTING (the architect's ruling). The limit, said once: other
 * script-bearing configs are not recognised — the config's name is the only tell the corpus gives.
 */
const SERVER_SCRIPT_CONFIG = 'Run Server Side Script';

const SYS_ID = /^[0-9a-f]{32}$/i;

type Row = Record<string, unknown>;
export type AuthorWarning = Row & { code: string; table: string; field: string; message: string };

/** A value with its transport shape taken off: a reference's `value`, every scalar as its string. */
function plain(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'object') return plain((v as { value?: unknown }).value);
  return String(v);
}

/** Line endings as LF: the one normalisation a compared value gets. */
const lf = (s: string): string => s.replace(/\r\n/g, '\n');

/** Where two strings first differ, in code points, as VALUE_TRUNCATED counts its lengths. */
function firstDifference(a: string, b: string): number {
  const x = Array.from(a);
  const y = Array.from(b);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i += 1) if (x[i] !== y[i]) return i;
  return n;
}

interface Written {
  table: string;
  sysId: string;
  sent: Row;
  /** What the write answered with — the router's check has already looked at it for cuts. */
  answer: Row;
  operation: 'create' | 'update';
  live: boolean;
}

function notStored(w: Pick<Written, 'table' | 'sysId'>, field: string, why: string): AuthorWarning {
  return {
    code: 'FIELD_NOT_STORED', table: w.table, sys_id: w.sysId, field,
    message: `${w.table}.${field} ${why} The record exists without it. Read it back; if it is not set, set it with `
      + 'snow_core_record_modify rather than adding the record again. If it is set, the read-back missed it: the column '
      + 'names are not documented in the bundled corpus, so check them on the instance.',
  };
}

function notAsSent(w: Pick<Written, 'table' | 'sysId'>, field: string, sent: string, stored: string): AuthorWarning {
  const at = firstDifference(sent, stored);
  const sentLength = lengthOf(sent);
  const storedLength = lengthOf(stored);
  return {
    code: 'VALUE_NOT_AS_SENT', table: w.table, sys_id: w.sysId, field,
    first_difference_at: at, sent_length: sentLength, stored_length: storedLength,
    message: `${w.table}.${field} reads back different from what was sent, with line endings normalised: the two first `
      + `differ at character ${at}; ${sentLength} characters were sent and ${storedLength} are stored. The record exists `
      + 'with the stored value: read it back and, if that value is wrong, correct it with snow_core_record_modify — do not '
      + 'add it again, which would make a second record.',
  };
}

/** A cut the write's answer did not show: the C93 warning, with the dictionary's limit when it is readable. */
async function truncated(client: ServiceNowClient, w: Written, field: string, sent: string, stored: string):
Promise<AuthorWarning> {
  let limit: number | null = null;
  try {
    limit = (await dictionaryLimits(client, w.table, [field])).get(field) ?? null;
  } catch {
    // A dictionary this account cannot read leaves the limit unknown; the warning says so.
  }
  const cut = { field, sent, stored };
  const warning = reconcile({ operation: w.operation, table: w.table, sysId: w.sysId, live: w.live, cuts: [cut] }, cut, limit);
  // The dictionary says the column holds what was sent: the value was not cut by length, it differs.
  return (warning as AuthorWarning | null) ?? notAsSent(w, field, lf(sent), lf(stored));
}

/** Read `w` back by sys_id and compare every field it sent. A difference is a warning, never an error. */
async function readBack(client: ServiceNowClient, w: Written): Promise<{ stored: ServiceNowRecord; warnings: AuthorWarning[] }> {
  const stored = (await client.getRecord(w.table, w.sysId)) ?? {};
  const warnings: AuthorWarning[] = [];
  for (const [field, value] of Object.entries(w.sent)) {
    const sent = plain(value);
    if (sent === undefined || sent === '') continue;
    const got = plain(stored[field]);
    if (got === undefined || got === '') {
      warnings.push(notStored(w, field, 'was sent but does not read back as set.'));
    } else if (lf(got) === lf(sent)) {
      continue;
    } else if (looksCut(sent, got)) {
      if (!looksCut(sent, plain(w.answer[field]))) warnings.push(await truncated(client, w, field, sent, got));
    } else {
      warnings.push(notAsSent(w, field, lf(sent), lf(got)));
    }
  }
  return { stored, warnings };
}

async function write(client: ServiceNowClient, table: string, sent: Row, live: boolean, sysId?: string):
Promise<{ sysId: string; stored: ServiceNowRecord; warnings: AuthorWarning[] }> {
  const answer = (sysId === undefined
    ? await client.createRecord(table, sent)
    : await client.updateRecord(table, sysId, sent)) ?? {};
  const id = sysId ?? plain(answer.sys_id);
  if (!id) throw new ServiceNowError(`The instance answered the create on ${table} with no sys_id, so it cannot be read back.`, 'CREATE_FAILED');
  const { stored, warnings } = await readBack(client, {
    table, sysId: id, sent, answer, operation: sysId === undefined ? 'create' : 'update', live,
  });
  return { sysId: id, stored, warnings };
}

const isBoolean = (v: unknown): v is boolean => typeof v === 'boolean';

function activeArg(v: unknown): boolean {
  if (v === undefined) return true;
  if (!isBoolean(v)) throw new ServiceNowError(`active must be true or false; got ${JSON.stringify(v)}`, 'VALIDATION_ERROR');
  return v;
}

// ─── snow_atf_atf_test_add ───────────────────────────────────────────────────────────────────────

export async function addTest(client: ServiceNowClient, args: Row): Promise<Row> {
  if (typeof args.name !== 'string' || args.name.trim() === '') throw new ServiceNowError('name is required', 'INVALID_REQUEST');
  if (args.description !== undefined && typeof args.description !== 'string') {
    throw new ServiceNowError('description must be a string', 'VALIDATION_ERROR');
  }
  const active = activeArg(args.active);
  const sent: Row = { name: args.name, ...(args.description ? { description: args.description } : {}), active };
  const { sysId, stored, warnings } = await write(client, TEST, sent, active);
  const name = plain(stored.name) || args.name;
  return {
    ...(warnings.length > 0 ? { warnings } : {}),
    sys_id: sysId, name, active: plain(stored.active),
    summary: warnings.length === 0
      ? `Created ATF test "${name}" (${sysId}); it reads back as sent.`
      : `Created ATF test "${name}" (${sysId}); ${warnings.length} field(s) read back differently — see warnings.`,
  };
}

// ─── snow_atf_atf_step_add ───────────────────────────────────────────────────────────────────────

/** The step config the caller named: a sys_id that must exist, or a name exactly one config has. Active either way. */
async function resolveConfig(client: ServiceNowClient, ref: string): Promise<{ sysId: string; name: string }> {
  let row: Row;
  if (SYS_ID.test(ref)) {
    row = (await client.getRecord(CONFIG, ref, 'sys_id,name,active,sys_scope')) ?? {};
    if (!plain(row.sys_id)) throw new ServiceNowError(`Step config not found: ${ref}`, 'NOT_FOUND');
  } else {
    if (ref.includes('^')) throw new ServiceNowError(`step_config "${ref}" cannot be queried exactly: pass its sys_id`, 'VALIDATION_ERROR');
    const resp = await client.queryRecords({ table: CONFIG, query: `name=${ref}`, fields: 'sys_id,name,active,sys_scope', limit: 10 });
    // Exact names only: a condition the instance cannot apply is ignored and returns every config (c_TableAPI.md).
    const rows = resp.records.filter((r) => r.name === ref);
    if (rows.length === 0) throw new ServiceNowError(`No step config is named "${ref}"`, 'NOT_FOUND');
    if (rows.length > 1) {
      const listed = rows.map((r) => `${plain(r.sys_id)} (scope ${plain(r.sys_scope) ?? 'not shown'})`).join(', ');
      throw new ServiceNowError(`${rows.length} step configs are named "${ref}": ${listed}. A scoped application can ship `
        + 'a config with the same name as a baseline one: pass the sys_id of the one you mean. Nothing was written.', 'INVALID_REQUEST');
    }
    row = rows[0];
  }
  const sysId = plain(row.sys_id) as string;
  const name = plain(row.name) ?? '';
  if (plain(row.active) !== 'true') {
    throw new ServiceNowError(`Step config "${name}" (${sysId}) is not active (atf-step-config-record.md: Active). `
      + 'Nothing was written.', 'INVALID_REQUEST');
  }
  return { sysId, name };
}

/** The config's input variables, by name: the rows whose config IS this one (an ignored condition returns others). */
async function inputVariables(client: ServiceNowClient, config: string): Promise<Map<string, string>> {
  const resp = await client.queryRecords({ table: INPUT_VARIABLE, query: `model=${config}`, fields: 'sys_id,element,model', limit: 100 });
  const vars = new Map<string, string>();
  for (const r of resp.records) {
    const name = plain(r.element);
    const id = plain(r.sys_id);
    if (plain(r.model) === config && name && id) vars.set(name, id);
  }
  return vars;
}

function inputsArg(v: unknown): Map<string, string> {
  if (v === undefined) return new Map();
  if (v === null || typeof v !== 'object' || Array.isArray(v)) {
    throw new ServiceNowError('inputs must be an object of input name to value', 'VALIDATION_ERROR');
  }
  const out = new Map<string, string>();
  for (const [k, x] of Object.entries(v as Row)) {
    if (typeof x !== 'string' && typeof x !== 'number' && typeof x !== 'boolean') {
      throw new ServiceNowError(`inputs.${k} must be a string, a number or a boolean`, 'VALIDATION_ERROR');
    }
    out.set(k, String(x));
  }
  return out;
}

/** One input proven from the step's side: exactly one row, keyed to the step and to the input's variable. */
async function attached(client: ServiceNowClient, step: string, name: string, variable: string): Promise<AuthorWarning[]> {
  const resp = await client.queryRecords({
    table: VALUE, query: `document_key=${step}^variable=${variable}`, fields: 'sys_id,document_key,variable', limit: 10,
  });
  const rows = resp.records.filter((r) => plain(r.document_key) === step && plain(r.variable) === variable);
  if (rows.length === 1) return [];
  const field = `inputs.${name}`;
  if (rows.length === 0) {
    return [notStored({ table: VALUE, sysId: step }, field, `is not attached to step ${step}: no ${VALUE} row with `
      + `document_key=${step} and variable=${variable} reads back.`)];
  }
  const ids = rows.map((r) => plain(r.sys_id)).join(', ');
  return [{
    code: 'VALUE_NOT_AS_SENT', table: VALUE, sys_id: step, field,
    message: `${rows.length} ${VALUE} rows hold the ${name} input of step ${step} (${ids}); one was expected, so which `
      + 'value the step runs with is not known. Remove the extra rows with snow_core_record_remove, keeping the one with '
      + 'the intended value — do not add the step again.',
  }];
}

function leftBehind(error: unknown, step: string, warnings: AuthorWarning[]): unknown {
  if (!(error instanceof ServiceNowError)) return error;
  const readBackNote = warnings.length === 0 ? ''
    : ` The step's read-back reported ${warnings.map((w) => `${w.code} on ${w.field}`).join(', ')}.`;
  return new ServiceNowError(`${error.message} — step ${step} was created, but its inputs were not all written: read `
    + `${VALUE} with document_key=${step} before trying again, and do not add the step a second time.${readBackNote}`,
  error.code, error.details);
}

export async function addStep(client: ServiceNowClient, args: Row): Promise<Row> {
  if (!args.test) throw new ServiceNowError('test is required', 'INVALID_REQUEST');
  if (typeof args.step_config !== 'string' || args.step_config.trim() === '') {
    throw new ServiceNowError('step_config is required: a step config sys_id, or its exact name', 'INVALID_REQUEST');
  }
  const test = sysIdArg(args.test, 'test');
  const order = args.order;
  if (order !== undefined && !(typeof order === 'number' && Number.isInteger(order) && order >= 0)) {
    throw new ServiceNowError(`order must be a whole number; got ${JSON.stringify(order)}`, 'VALIDATION_ERROR');
  }
  const active = activeArg(args.active);
  const inputs = inputsArg(args.inputs);

  // Refusals before any write: each one a read.
  const testRow = (await client.getRecord(TEST, test, 'sys_id,name')) ?? {};
  if (!plain(testRow.sys_id)) throw new ServiceNowError(`Test not found: ${test}`, 'NOT_FOUND');
  const config = await resolveConfig(client, args.step_config.trim());
  if (config.name === SERVER_SCRIPT_CONFIG) requireScripting();
  const variables = inputs.size > 0 ? await inputVariables(client, config.sysId) : new Map<string, string>();
  const unknown = [...inputs.keys()].filter((k) => !variables.has(k));
  if (unknown.length > 0) {
    throw new ServiceNowError(`Step config "${config.name}" has no input named ${unknown.map((k) => `"${k}"`).join(', ')}; `
      + `its inputs are: ${[...variables.keys()].join(', ') || 'none this account can read'}. Nothing was written.`, 'INVALID_REQUEST');
  }
  if (order !== undefined) {
    const steps = await client.queryRecords({ table: STEP, query: `test=${test}`, fields: 'sys_id,test,order', limit: 1000 });
    const clash = steps.records.find((r) => plain(r.test) === test && plain(r.order) === String(order));
    if (clash) {
      throw new ServiceNowError(`Test ${test} already has a step at order ${order} (${plain(clash.sys_id)}). Choose another `
        + 'order, or leave it out and the instance assigns the next-highest (atf-edit-step-order.md). Nothing was written.',
      'INVALID_REQUEST');
    }
  }

  // The step.
  const sent: Row = { test, step_config: config.sysId, active, ...(order !== undefined ? { order } : {}) };
  const step = await write(client, STEP, sent, active);
  const warnings: AuthorWarning[] = [...step.warnings];

  // Its inputs: look before writing, so a row the insert created is updated and not added a second time.
  const written: Row[] = [];
  try {
    const existing = await client.queryRecords({
      table: VALUE, query: `document_key=${step.sysId}`, fields: 'sys_id,document_key,variable,value', limit: 100,
    });
    const byVariable = new Map<string, ServiceNowRecord[]>();
    for (const r of existing.records) {
      if (plain(r.document_key) !== step.sysId) continue;
      const v = plain(r.variable) ?? '';
      byVariable.set(v, [...(byVariable.get(v) ?? []), r]);
    }
    for (const [name, value] of inputs) {
      const variable = variables.get(name) as string;
      const rows = byVariable.get(variable) ?? [];
      if (rows.length > 1) {
        written.push({ name, written: 'none', rows: rows.map((r) => plain(r.sys_id)) });
      } else if (rows.length === 1) {
        const row = plain(rows[0].sys_id) as string;
        const done = await write(client, VALUE, { value }, false, row);
        warnings.push(...done.warnings);
        written.push({ name, sys_id: row, written: 'updated' });
      } else {
        const done = await write(client, VALUE, { document: STEP, document_key: step.sysId, variable, value }, false);
        warnings.push(...done.warnings);
        written.push({ name, sys_id: done.sysId, written: 'created' });
      }
      warnings.push(...await attached(client, step.sysId, name, variable));
    }
  } catch (error) {
    throw leftBehind(error, step.sysId, warnings);
  }

  return {
    ...(warnings.length > 0 ? { warnings } : {}),
    sys_id: step.sysId,
    test,
    step_config: { sys_id: config.sysId, name: config.name },
    order: plain(step.stored.order),
    active: plain(step.stored.active),
    inputs: written,
    summary: warnings.length === 0
      ? `Added a "${config.name}" step (${step.sysId}) to test ${test} at order ${plain(step.stored.order) ?? '(not shown)'}; `
        + `the step${inputs.size > 0 ? ' and its inputs read back as sent, each input attached once' : ' reads back as sent'}.`
      : `Added a "${config.name}" step (${step.sysId}) to test ${test}; ${warnings.length} read-back warning(s) — see warnings.`,
  };
}
