import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { newDb, refused, resetCicd, type CicdState, type FakeDb } from '../helpers/fake-cicd.js';
import { ServiceNowClient } from '../../src/servicenow/client.js';
import { runWithInstance, type InstanceRuntime } from '../../src/servicenow/context.js';
import { routeToolInvocation } from '../../src/tools/index.js';
import { expandPreset } from '../../src/utils/permissions.js';
import type { ServiceNowError } from '../../src/utils/errors.js';

/**
 * ARC-09-C95 — ATF authoring with a read-back (the owner's R2: a test, a step and its script were
 * written by hand and nothing could confirm the script was attached).
 *
 * The corpus names the tables — a test step is "a record in the Test Step [sys_atf_step] table that
 * specifies a test action, the step configuration, and an execution order"
 * (vendor/ServiceNowDocs/markdown/application-development/automated-test-framework-atf/automated-test-framework.md)
 * — but not the columns, nor where a step's input values are kept. The column names and the
 * sys_variable_value shape used here are the design's assumption, which the live run reads (R3, R4).
 *
 * The tools are called through the router, as a session calls them, so the cut-value check that wraps
 * every write takes part. The Table API is a stateful fake (`FakeDb`): the hooks say what the instance
 * stores of a write, whether a write's answer echoes what was sent, the rows it adds itself, the
 * queries it answers empty, and the writes it refuses.
 */
const cicd = vi.hoisted<CicdState>(() => ({ calls: [], progress: [], tables: {} }));
vi.mock('../../src/servicenow/http.js', async () => (await import('../helpers/fake-cicd.js')).fakeCicdModule(cicd));

const id = (c: string, n: number) => `${c.repeat(28)}${String(n).padStart(4, '0')}`;
const TEST = id('a', 1);
const RSSS = id('b', 1);
const RSSS_SCOPED = id('b', 2);
const LOG = id('b', 3);
const RETIRED = id('b', 4);
const V_SCRIPT = id('c', 1);
const V_JASMINE = id('c', 2);
const V_LOG = id('c', 3);
const GLOBAL = id('d', 1);
const SCOPE_X = id('d', 2);
const SCRIPT = 'describe("c95", function () {\n  it("runs", function () { expect(true).toBe(true); });\n});';
const SCRIPT_CRLF = SCRIPT.replace(/\n/g, '\r\n');

const REFS = {
  sys_atf_step: ['test', 'step_config'], sys_variable_value: ['variable'],
  atf_input_variable: ['model'], sys_atf_step_config: ['sys_scope'],
};

function baseline(): FakeDb {
  const db = newDb({
    sys_atf_test: [{ sys_id: TEST, name: 'Existing test', description: '', active: 'true' }],
    sys_atf_step_config: [
      { sys_id: RSSS, name: 'Run Server Side Script', active: 'true', sys_scope: GLOBAL },
      { sys_id: LOG, name: 'Log', active: 'true', sys_scope: GLOBAL },
      { sys_id: RETIRED, name: 'Retired step', active: 'false', sys_scope: GLOBAL },
    ],
    atf_input_variable: [
      { sys_id: V_SCRIPT, model: RSSS, element: 'script' },
      { sys_id: V_JASMINE, model: RSSS, element: 'jasmine_version' },
      { sys_id: V_LOG, model: LOG, element: 'log' },
    ],
    sys_atf_step: [],
    sys_variable_value: [],
  }, REFS);
  // The instance numbers a step it is given no order for: the next-highest integer in its test
  // (atf-edit-step-order.md). Everything else is stored as sent.
  db.store = (table, sent, existing) => {
    if (table === 'sys_atf_step' && !existing && sent.order === undefined) {
      const orders = db.rows.sys_atf_step.filter((s) => s.test === sent.test).map((s) => Number(s.order));
      return { ...sent, order: String(Math.max(0, ...orders) + 1) };
    }
    return existing ? { ...existing, ...sent } : sent;
  };
  return db;
}

const client = () => new ServiceNowClient({
  instanceUrl: 'https://test.service-now.com', authMethod: 'basic', basic: { username: 'u', password: 'p' },
  maxRetries: 3, retryDelayMs: 0,
});

type Result = Record<string, unknown>;
type Outcome = { value: Result; error: ServiceNowError | undefined };
async function call(name: string, args: Record<string, unknown>): Promise<Outcome> {
  try {
    return { value: (await routeToolInvocation(client(), name, args)) as Result, error: undefined };
  } catch (error) {
    return { value: {}, error: error as ServiceNowError };
  }
}

/** The same call under explicit flags — the preset a test needs, not the file's. */
async function callUnder(flags: Record<string, string>, name: string, args: Record<string, unknown>): Promise<Outcome> {
  const all = { ...expandPreset('read-only'), ...flags } as InstanceRuntime['flags'];
  const rt: InstanceRuntime = {
    label: 'pdi', url: 'https://test.service-now.com', environment: 'pdi', preset: 'custom',
    flags: all, effectiveFlags: all, toolPackage: 'full', maxRecords: 100, prodWriteAck: false,
    client: {} as InstanceRuntime['client'], warnings: [],
  };
  return runWithInstance(rt, () => call(name, args));
}

const writes = () => cicd.calls.filter((c) => c.method === 'POST' || c.method === 'PATCH');
const writesTo = (table: string) => writes().filter((c) => c.path.startsWith(`/api/now/table/${table}`));
const warningsOf = (value: Result): Array<Record<string, unknown>> =>
  (Array.isArray(value.warnings) ? value.warnings as Array<Record<string, unknown>> : []);
const warningFor = (value: Result, field: string) => warningsOf(value).find((w) => w.field === field);
const rowsFor = (db: FakeDb, step: string, variable: string) =>
  db.rows.sys_variable_value.filter((r) => r.document_key === step && r.variable === variable);

const logLevel = process.env.LOG_LEVEL;
beforeAll(() => { process.env.LOG_LEVEL = 'error'; });
afterAll(() => {
  if (logLevel === undefined) delete process.env.LOG_LEVEL;
  else process.env.LOG_LEVEL = logLevel;
});
beforeEach(() => {
  resetCicd(cicd);
  cicd.db = baseline();
});

describe('ARC-09-C95 — snow_atf_atf_test_add writes the test and reads it back', () => {
  it('creates the test, reads it back by sys_id, and reports nothing when every field matches', async () => {
    const { value, error } = await call('snow_atf_atf_test_add', { name: 'c95-live-probe', description: 'probe' });

    expect(error).toBeUndefined();
    expect(writesTo('sys_atf_test')).toHaveLength(1);
    expect(writesTo('sys_atf_test')[0].body).toEqual({ name: 'c95-live-probe', description: 'probe', active: true });
    const created = cicd.db!.rows.sys_atf_test[1];
    expect(cicd.calls.some((c) => c.method === 'GET' && c.path === `/api/now/table/sys_atf_test/${created.sys_id}`)).toBe(true);
    expect(value).toMatchObject({ sys_id: created.sys_id, name: 'c95-live-probe' });
    expect(value.warnings).toBeUndefined();
  });

  it.each([
    ['name', 'c95-live-probX'], ['description', 'probe-other'], ['active', 'false'],
  ])('a %s the instance stores other than sent is VALUE_NOT_AS_SENT, with the offset and lengths, never the values', async (field, stored) => {
    const db = cicd.db!;
    db.store = (table, sent) => (table === 'sys_atf_test' ? { ...sent, [field]: stored } : sent);

    const { value, error } = await call('snow_atf_atf_test_add', { name: 'c95-live-probe', description: 'probe' });

    expect(error).toBeUndefined();
    const w = warningFor(value, field);
    expect(w).toMatchObject({ code: 'VALUE_NOT_AS_SENT', table: 'sys_atf_test', field });
    expect(typeof w?.first_difference_at).toBe('number');
    expect(typeof w?.sent_length).toBe('number');
    expect(typeof w?.stored_length).toBe('number');
    // A value in a warning is noise, and a script in one is worse. (`false` is too common a word to test for.)
    if (field !== 'active') expect(JSON.stringify(w)).not.toContain(stored);
  });

  it('a field the read-back does not show is FIELD_NOT_STORED', async () => {
    cicd.db!.store = (table, sent) => {
      if (table !== 'sys_atf_test') return sent;
      const rest = { ...sent };
      delete rest.description;
      return rest;
    };

    const { value } = await call('snow_atf_atf_test_add', { name: 'c95-live-probe', description: 'probe' });

    expect(warningFor(value, 'description')).toMatchObject({ code: 'FIELD_NOT_STORED', table: 'sys_atf_test' });
  });

  it('a test with no name is refused before anything is sent', async () => {
    const { error } = await call('snow_atf_atf_test_add', { description: 'nameless' });

    expect(error?.code).toBe('INVALID_REQUEST');
    expect(cicd.calls).toEqual([]);
  });

  it('a name of only spaces is no name: refused before anything is sent', async () => {
    const { error } = await call('snow_atf_atf_test_add', { name: '   ' });

    expect(error?.code).toBe('INVALID_REQUEST');
    expect(cicd.calls).toEqual([]);
  });
});

describe('ARC-09-C95 — snow_atf_atf_step_add writes the step and its inputs, and proves them attached', () => {
  it('a Run Server Side Script step: the step and its script row are written, read back and proven attached', async () => {
    const { value, error } = await call('snow_atf_atf_step_add', {
      test: TEST, step_config: 'Run Server Side Script', inputs: { script: SCRIPT },
    });

    expect(error).toBeUndefined();
    const db = cicd.db!;
    const step = db.rows.sys_atf_step[0];
    expect(writesTo('sys_atf_step')[0].body).toEqual({ test: TEST, step_config: RSSS, active: true });
    expect(writesTo('sys_variable_value')[0].body).toEqual({
      document: 'sys_atf_step', document_key: step.sys_id, variable: V_SCRIPT, value: SCRIPT,
    });
    expect(rowsFor(db, step.sys_id as string, V_SCRIPT)).toHaveLength(1);
    // Read back by sys_id, and the attachment asked for from the step's side.
    expect(cicd.calls.some((c) => c.method === 'GET' && c.path === `/api/now/table/sys_atf_step/${step.sys_id}`)).toBe(true);
    expect(cicd.calls.some((c) => c.method === 'GET' && c.path === '/api/now/table/sys_variable_value'
      && c.query.sysparm_query === `document_key=${step.sys_id}^variable=${V_SCRIPT}`)).toBe(true);
    expect(value).toMatchObject({
      sys_id: step.sys_id, test: TEST, step_config: { sys_id: RSSS, name: 'Run Server Side Script' }, order: '1',
      inputs: [{ name: 'script', written: 'created' }],
    });
    expect(value.warnings).toBeUndefined();
  });

  it.each([
    ['test', () => TEST.replace(/1$/, '9')], ['step_config', () => LOG], ['order', () => '6'], ['active', () => 'false'],
  ])('the step\'s %s read back other than sent is VALUE_NOT_AS_SENT', async (field, other) => {
    const db = cicd.db!;
    const plain = db.store!;
    db.store = (table, sent, existing) => (table === 'sys_atf_step' && !existing ? { ...sent, [field]: other() } : plain(table, sent, existing));

    const { value, error } = await call('snow_atf_atf_step_add', {
      test: TEST, step_config: 'Run Server Side Script', order: 5, inputs: { script: SCRIPT },
    });

    expect(error).toBeUndefined();
    expect(warningFor(value, field)).toMatchObject({ code: 'VALUE_NOT_AS_SENT', table: 'sys_atf_step', field });
  });

  it.each([
    ['document', 'sys_atf_test'], ['document_key', id('e', 1)], ['variable', V_JASMINE], ['value', SCRIPT.replace('c95', 'c96')],
  ])('the input row\'s %s read back other than sent is VALUE_NOT_AS_SENT', async (field, other) => {
    const db = cicd.db!;
    const plain = db.store!;
    db.store = (table, sent, existing) => (table === 'sys_variable_value' && !existing ? { ...sent, [field]: other } : plain(table, sent, existing));

    const { value } = await call('snow_atf_atf_step_add', { test: TEST, step_config: RSSS, inputs: { script: SCRIPT } });

    expect(warningFor(value, field)).toMatchObject({ code: 'VALUE_NOT_AS_SENT', table: 'sys_variable_value', field });
  });

  it('the script proof: no row attached to the step is FIELD_NOT_STORED, even when the row read by its sys_id is right', async () => {
    // The row exists and reads back as sent; asked for from the step's side, the instance has none.
    cicd.db!.hide = (table, q) => table === 'sys_variable_value' && (q.sysparm_query ?? '').includes('^variable=');

    const { value } = await call('snow_atf_atf_step_add', { test: TEST, step_config: RSSS, inputs: { script: SCRIPT } });

    expect(warningsOf(value)).toHaveLength(1);
    expect(warningFor(value, 'inputs.script')).toMatchObject({ code: 'FIELD_NOT_STORED', table: 'sys_variable_value' });
    expect(String(warningFor(value, 'inputs.script')?.message)).toMatch(/not attached/);
  });

  it('a proof row that belongs to another step is not proof: the input is not attached', async () => {
    // The instance answers the proof query with a row keyed to a different step.
    cicd.db!.answer = (table, q) => (table === 'sys_variable_value' && (q.sysparm_query ?? '').includes('^variable=')
      ? [{ sys_id: id('9', 8), document: 'sys_atf_step', document_key: id('e', 9), variable: V_SCRIPT, value: SCRIPT }]
      : undefined);

    const { value } = await call('snow_atf_atf_step_add', { test: TEST, step_config: RSSS, inputs: { script: SCRIPT } });

    expect(warningsOf(value)).toHaveLength(1);
    expect(warningFor(value, 'inputs.script')).toMatchObject({ code: 'FIELD_NOT_STORED', table: 'sys_variable_value' });
    expect(String(warningFor(value, 'inputs.script')?.message)).toMatch(/not attached/);
  });

  it('two rows for one input are reported, not taken as proof, and neither is overwritten', async () => {
    const db = cicd.db!;
    db.afterInsert = (table, row) => {
      if (table !== 'sys_atf_step') return;
      for (const v of ['', 'x']) {
        db.rows.sys_variable_value.push({ sys_id: `${'9'.repeat(31)}${v === '' ? 1 : 2}`, document: 'sys_atf_step', document_key: row.sys_id, variable: V_SCRIPT, value: v });
      }
    };

    const { value } = await call('snow_atf_atf_step_add', { test: TEST, step_config: RSSS, inputs: { script: SCRIPT } });

    expect(writesTo('sys_variable_value')).toEqual([]);
    expect(warningFor(value, 'inputs.script')).toMatchObject({ code: 'VALUE_NOT_AS_SENT', table: 'sys_variable_value' });
    expect(String(warningFor(value, 'inputs.script')?.message)).toContain(`${'9'.repeat(31)}1`);
  });

  it('look before write: an input row the step insert created is updated, not added a second time', async () => {
    const db = cicd.db!;
    db.afterInsert = (table, row) => {
      if (table === 'sys_atf_step') {
        db.rows.sys_variable_value.push({ sys_id: id('9', 7), document: 'sys_atf_step', document_key: row.sys_id, variable: V_SCRIPT, value: '' });
      }
    };

    const { value, error } = await call('snow_atf_atf_step_add', { test: TEST, step_config: RSSS, inputs: { script: SCRIPT } });

    expect(error).toBeUndefined();
    expect(writesTo('sys_variable_value').map((c) => c.method)).toEqual(['PATCH']);
    expect(rowsFor(db, db.rows.sys_atf_step[0].sys_id as string, V_SCRIPT)).toEqual([expect.objectContaining({ value: SCRIPT })]);
    expect(value).toMatchObject({ inputs: [{ name: 'script', written: 'updated' }] });
    expect(value.warnings).toBeUndefined();
  });

  it('SCRIPTING off: a Run Server Side Script step is refused before any write, naming the instance', async () => {
    const { error } = await callUnder({ ATF_ENABLED: 'true', WRITE_ENABLED: 'true' }, 'snow_atf_atf_step_add',
      { test: TEST, step_config: 'Run Server Side Script', inputs: { script: SCRIPT } });

    expect(error?.code).toBe('SCRIPTING_NOT_ENABLED');
    expect(error?.message).toContain('"pdi"');
    expect(writes()).toEqual([]);
  });

  it('SCRIPTING off: a step of another config is not refused for it', async () => {
    const { error } = await callUnder({ ATF_ENABLED: 'true', WRITE_ENABLED: 'true' }, 'snow_atf_atf_step_add',
      { test: TEST, step_config: 'Log', inputs: { log: 'hello' } });

    expect(error).toBeUndefined();
    expect(writesTo('sys_atf_step')).toHaveLength(1);
  });

  it('a CRLF script the instance stores with LF does not warn', async () => {
    const db = cicd.db!;
    const plain = db.store!;
    db.store = (table, sent, existing) => (table === 'sys_variable_value' && typeof sent.value === 'string'
      ? plain(table, { ...sent, value: sent.value.replace(/\r\n/g, '\n') }, existing) : plain(table, sent, existing));

    const { value, error } = await call('snow_atf_atf_step_add', { test: TEST, step_config: RSSS, inputs: { script: SCRIPT_CRLF } });

    expect(error).toBeUndefined();
    expect(value.warnings).toBeUndefined();
  });

  it('a script that still differs after line endings are normalised warns with where and how long, not the script', async () => {
    const db = cicd.db!;
    const plain = db.store!;
    const changed = `${SCRIPT.slice(0, 10)}#${SCRIPT.slice(11)}`;
    db.store = (table, sent, existing) => (table === 'sys_variable_value' ? plain(table, { ...sent, value: changed }, existing) : plain(table, sent, existing));

    const { value } = await call('snow_atf_atf_step_add', { test: TEST, step_config: RSSS, inputs: { script: SCRIPT_CRLF } });

    const w = warningFor(value, 'value');
    expect(w).toMatchObject({ code: 'VALUE_NOT_AS_SENT', first_difference_at: 10, sent_length: SCRIPT.length, stored_length: SCRIPT.length });
    expect(JSON.stringify(w)).not.toContain('describe(');
  });

  it('a step config name that two configs share is refused, listing their sys_ids and scopes', async () => {
    cicd.db!.rows.sys_atf_step_config.push({ sys_id: RSSS_SCOPED, name: 'Run Server Side Script', active: 'true', sys_scope: SCOPE_X });

    const { error } = await call('snow_atf_atf_step_add', { test: TEST, step_config: 'Run Server Side Script', inputs: { script: SCRIPT } });

    expect(error?.code).toBe('INVALID_REQUEST');
    for (const s of [RSSS, RSSS_SCOPED, GLOBAL, SCOPE_X]) expect(error?.message).toContain(s);
    expect(error?.message).toMatch(/pass the sys_id/);
    expect(writes()).toEqual([]);
  });

  it.each([
    ['a name no config has', 'No Such Step', 'NOT_FOUND'],
    ['a sys_id no config has', id('b', 9), 'NOT_FOUND'],
    ['an inactive config', RETIRED, 'INVALID_REQUEST'],
  ])('%s is refused before any write', async (_what, config, code) => {
    const { error } = await call('snow_atf_atf_step_add', { test: TEST, step_config: config });

    expect(error?.code).toBe(code);
    expect(writes()).toEqual([]);
  });

  it('an order a step of the test already holds is refused before any write, after reading the test\'s steps', async () => {
    cicd.db!.rows.sys_atf_step.push({ sys_id: id('e', 3), test: TEST, step_config: LOG, order: '3', active: 'true' });

    const { error } = await call('snow_atf_atf_step_add', { test: TEST, step_config: 'Log', order: 3 });

    expect(error?.code).toBe('INVALID_REQUEST');
    expect(error?.message).toContain(id('e', 3));
    expect(cicd.calls.some((c) => c.method === 'GET' && c.path === '/api/now/table/sys_atf_step'
      && c.query.sysparm_query === `test=${TEST}`)).toBe(true);
    expect(writes()).toEqual([]);
  });

  it('an input of another config is refused even when the instance returns that config\'s variables too', async () => {
    // An ignored condition: the instance answers the input-variable read with every config's rows.
    const db = cicd.db!;
    db.answer = (table) => (table === 'atf_input_variable' ? db.rows.atf_input_variable : undefined);

    const { error } = await call('snow_atf_atf_step_add', { test: TEST, step_config: RSSS, inputs: { log: 'from the Log config' } });

    expect(error?.code).toBe('INVALID_REQUEST');
    expect(error?.message).toMatch(/"log"/);
    expect(writes()).toEqual([]);
  });

  it('an input the config does not have is refused, naming the inputs it has', async () => {
    const { error } = await call('snow_atf_atf_step_add', { test: TEST, step_config: RSSS, inputs: { scrpt: SCRIPT } });

    expect(error?.code).toBe('INVALID_REQUEST');
    expect(error?.message).toMatch(/scrpt/);
    expect(error?.message).toMatch(/script, jasmine_version/);
    expect(writes()).toEqual([]);
  });

  it('a test that does not exist is refused before any write', async () => {
    const { error } = await call('snow_atf_atf_step_add', { test: id('a', 9), step_config: 'Log' });

    expect(error?.code).toBe('NOT_FOUND');
    expect(writes()).toEqual([]);
  });

  it('a script the read-back shows cut, while the write echoed it whole, is VALUE_TRUNCATED from the read-back', async () => {
    const db = cicd.db!;
    const plain = db.store!;
    db.echo = 'sent';
    db.store = (table, sent, existing) => (table === 'sys_variable_value' && typeof sent.value === 'string'
      ? plain(table, { ...sent, value: sent.value.slice(0, 20) }, existing) : plain(table, sent, existing));

    const { value } = await call('snow_atf_atf_step_add', { test: TEST, step_config: RSSS, inputs: { script: SCRIPT } });

    const cuts = warningsOf(value).filter((w) => w.code === 'VALUE_TRUNCATED');
    expect(cuts).toEqual([expect.objectContaining({ table: 'sys_variable_value', field: 'value', stored_length: 20 })]);
    expect(warningsOf(value).some((w) => w.code === 'VALUE_NOT_AS_SENT')).toBe(false);
  });

  it('a shorter stored value the dictionary says the column could hold is VALUE_NOT_AS_SENT, not silence', async () => {
    // Not a cut by length: the column holds 4000, more than was sent. So it differs, and says so.
    const db = cicd.db!;
    const plain = db.store!;
    db.echo = 'sent';
    db.rows.sys_dictionary = [{ sys_id: id('7', 1), name: 'sys_variable_value', element: 'value', max_length: '4000' }];
    db.store = (table, sent, existing) => (table === 'sys_variable_value' && typeof sent.value === 'string'
      ? plain(table, { ...sent, value: sent.value.slice(0, 20) }, existing) : plain(table, sent, existing));

    const { value } = await call('snow_atf_atf_step_add', { test: TEST, step_config: RSSS, inputs: { script: SCRIPT } });

    expect(warningsOf(value).filter((w) => w.field === 'value')).toEqual([
      expect.objectContaining({ code: 'VALUE_NOT_AS_SENT', first_difference_at: 20, stored_length: 20 }),
    ]);
    expect(warningsOf(value).some((w) => w.code === 'VALUE_TRUNCATED')).toBe(false);
  });

  it('a cut the write\'s answer already shows is reported once', async () => {
    const db = cicd.db!;
    const plain = db.store!;
    db.store = (table, sent, existing) => (table === 'sys_variable_value' && typeof sent.value === 'string'
      ? plain(table, { ...sent, value: sent.value.slice(0, 20) }, existing) : plain(table, sent, existing));

    const { value } = await call('snow_atf_atf_step_add', { test: TEST, step_config: RSSS, inputs: { script: SCRIPT } });

    expect(warningsOf(value).filter((w) => w.code === 'VALUE_TRUNCATED' && w.field === 'value')).toHaveLength(1);
    expect(warningsOf(value).some((w) => w.code === 'VALUE_NOT_AS_SENT')).toBe(false);
  });

  it('an input write the instance refuses says the step it left behind', async () => {
    cicd.db!.refuse = (method, table) => (method === 'POST' && table === 'sys_variable_value' ? refused(403, 'ACL') : undefined);

    const { error } = await call('snow_atf_atf_step_add', { test: TEST, step_config: RSSS, inputs: { script: SCRIPT } });

    expect(error?.code).toBe('INSUFFICIENT_PRIVILEGES');
    expect(error?.message).toContain(cicd.db!.rows.sys_atf_step[0].sys_id as string);
    expect(error?.message).toMatch(/was created/);
  });
});
