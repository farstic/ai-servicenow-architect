import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { newDb, refused, resetCicd, type CicdState, type FakeDb } from '../helpers/fake-cicd.js';
import { ServiceNowClient } from '../../src/servicenow/client.js';
import { runWithInstance, type InstanceRuntime } from '../../src/servicenow/context.js';
import { resetColumnLimits } from '../../src/servicenow/stored-values.js';
import { routeToolInvocation } from '../../src/tools/index.js';
import { expandPreset } from '../../src/utils/permissions.js';
import type { ServiceNowError } from '../../src/utils/errors.js';

/**
 * ARC-09-C97 — a value longer than its column is refused BEFORE the write, so no record and no update-set
 * entry exist; C93's after-the-write warning stays as the backstop.
 *
 * The limit is the dictionary's `max_length`, "a logical limit for the size of string fields" that can only
 * be changed for a String field (vendor/ServiceNowDocs/markdown/platform-administration/table-administration-and-data-management/r_DictionaryEntryForm.md).
 * A column a table inherits is defined on the table it extends ("incorporates all the fields of the
 * original table", t_CreateATable.md), and an override cannot change its length (c_DictionaryOverrides.md),
 * so the reader walks up `sys_db_object` to the table that defines it. `super_class` is not in the corpus;
 * the live run reads it.
 *
 * The rulings this pins: a budget of its own, so a slow read cannot blind C93 on the same call; lengths in
 * code points, as C93 counts; a refusal after an earlier write of the same call names that write; never a
 * refusal on a cached guess; a 403 remembered per instance, a 5xx not, and a 401 ending the call, so that a
 * call with bad credentials makes one failed login and not two.
 */
const cicd = vi.hoisted<CicdState>(() => ({ calls: [], progress: [], tables: {} }));
vi.mock('../../src/servicenow/http.js', async () => (await import('../helpers/fake-cicd.js')).fakeCicdModule(cicd));

const id = (c: string, n: number) => `${c.repeat(28)}${String(n).padStart(4, '0')}`;
const OBJ = { task: id('a', 1), incident: id('a', 2), ci: id('a', 3), hardware: id('a', 4), computer: id('a', 5), server: id('a', 6) };

let rowSeq = 0;
const dict = (table: string, element: string, max: string, type = 'string') =>
  ({ sys_id: id('d', (rowSeq += 1)), name: table, element, max_length: max, internal_type: type });

function baseline(): FakeDb {
  return newDb({
    sys_db_object: [
      { sys_id: OBJ.task, name: 'task', super_class: '' },
      { sys_id: OBJ.incident, name: 'incident', super_class: OBJ.task },
      { sys_id: OBJ.ci, name: 'cmdb_ci', super_class: '' },
      { sys_id: OBJ.hardware, name: 'cmdb_ci_hardware', super_class: OBJ.ci },
      { sys_id: OBJ.computer, name: 'cmdb_ci_computer', super_class: OBJ.hardware },
      { sys_id: OBJ.server, name: 'cmdb_ci_server', super_class: OBJ.computer },
    ],
    sys_dictionary: [
      dict('task', 'short_description', '160'),
      dict('incident', 'u_code', '10'),
      dict('incident', 'u_count', '40', 'integer'),
      dict('incident', 'u_blank', ''),
      dict('incident', 'u_zero', '0'),
      dict('cmdb_ci', 'name', '255'),
    ],
    incident: [],
    cmdb_ci_server: [],
  }, { sys_db_object: ['super_class'] });
}

const client = () => new ServiceNowClient({
  instanceUrl: 'https://test.service-now.com', authMethod: 'basic', basic: { username: 'u', password: 'p' },
  maxRetries: 3, retryDelayMs: 0,
});

type Outcome = { value: Record<string, unknown>; error: ServiceNowError | undefined };
async function add(table: string, fields: Record<string, unknown>): Promise<Outcome> {
  const settled = (routeToolInvocation(client(), 'snow_core_record_add', { table, fields }) as Promise<Record<string, unknown>>)
    .then((value) => ({ value, error: undefined }), (error: ServiceNowError) => ({ value: {}, error }));
  await vi.runAllTimersAsync();
  return settled;
}

/** The same write under another instance: its own label and URL, so its own dictionary cache. */
function onInstance<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const flags = expandPreset('pdi-developer');
  const rt: InstanceRuntime = {
    label, url: `https://${label}.service-now.com`, environment: 'pdi', preset: 'pdi-developer',
    flags, effectiveFlags: flags, toolPackage: 'full', maxRecords: 100, prodWriteAck: false,
    client: {} as InstanceRuntime['client'], warnings: [],
  };
  return runWithInstance(rt, fn);
}

const posts = (table: string) => cicd.calls.filter((c) => c.method === 'POST' && c.path === `/api/now/table/${table}`);
const dictionaryReads = () => cicd.calls.filter((c) => c.method === 'GET' && c.path === '/api/now/table/sys_dictionary').length;
const details = (e: ServiceNowError | undefined) => (e?.details ?? {}) as Record<string, unknown>;

const logLevel = process.env.LOG_LEVEL;
beforeAll(() => { process.env.LOG_LEVEL = 'error'; });
afterAll(() => {
  if (logLevel === undefined) delete process.env.LOG_LEVEL;
  else process.env.LOG_LEVEL = logLevel;
});
beforeEach(() => {
  vi.useFakeTimers();
  resetCicd(cicd);
  cicd.db = baseline();
  resetColumnLimits();
});
afterEach(() => { vi.useRealTimers(); });

describe('ARC-09-C97 — a value longer than its column is refused before the write', () => {
  it('over a limit read fresh for this write: VALUE_TOO_LONG, and nothing is sent', async () => {
    const { error } = await add('incident', { u_code: 'ABCDEFGHIJK' });

    expect(error?.code).toBe('VALUE_TOO_LONG');
    expect(details(error)).toMatchObject({ table: 'incident', field: 'u_code', sent_length: 11, column_limit: 10, defined_on: 'incident' });
    expect(error?.message).not.toContain('ABCDEFGHIJK');
    expect(posts('incident')).toEqual([]);
  });

  it('a value that fits is written', async () => {
    const { error } = await add('incident', { u_code: 'ABCDEFGHIJ' });

    expect(error).toBeUndefined();
    expect(posts('incident')).toHaveLength(1);
  });

  it('an inherited column is read on the table that defines it', async () => {
    const { error } = await add('incident', { short_description: 'x'.repeat(161) });

    expect(error?.code).toBe('VALUE_TOO_LONG');
    expect(details(error)).toMatchObject({ field: 'short_description', column_limit: 160, defined_on: 'task' });
    expect(posts('incident')).toEqual([]);
  });

  it('the walk goes as far up as the column is: three levels, from cmdb_ci_server to cmdb_ci', async () => {
    const { error } = await add('cmdb_ci_server', { name: 's'.repeat(256) });

    expect(error?.code).toBe('VALUE_TOO_LONG');
    expect(details(error)).toMatchObject({ field: 'name', column_limit: 255, defined_on: 'cmdb_ci' });
  });

  it.each([['u_blank'], ['u_zero']])('a %s max_length is unknown: never refused', async (field) => {
    const { error } = await add('incident', { [field]: 'y'.repeat(5000) });

    expect(error).toBeUndefined();
    expect(posts('incident')).toHaveLength(1);
  });

  it('a column that is not a String is never refused, whatever its max_length says', async () => {
    const { error } = await add('incident', { u_count: '1'.repeat(43) });

    expect(error).toBeUndefined();
    expect(posts('incident')).toHaveLength(1);
  });

  it('lengths are code points, as C93 counts them: 9 letters and one emoji fit a column of 10', async () => {
    const { error } = await add('incident', { u_code: 'ABCDEFGHI😀' });

    expect(error).toBeUndefined();
    expect(posts('incident')).toHaveLength(1);
  });
});

describe('ARC-09-C97 — the reader: instance-keyed, never refusing on a cached guess', () => {
  it('a cached "fits" passes without a request', async () => {
    await add('incident', { u_code: 'ABC' });
    const before = dictionaryReads();

    const { error } = await add('incident', { u_code: 'ABCD' });

    expect(error).toBeUndefined();
    expect(dictionaryReads()).toBe(before);
  });

  it('a cached "too long" is read again, and a larger fresh limit lets the write through', async () => {
    await add('incident', { u_code: 'ABC' });
    // An administrator raises the column after it was cached.
    cicd.db!.rows.sys_dictionary.find((r) => r.element === 'u_code')!.max_length = '20';

    const { error } = await add('incident', { u_code: 'ABCDEFGHIJKLMNO' });

    expect(error).toBeUndefined();
    expect(posts('incident')).toHaveLength(2);
  });

  it('a 403 on the dictionary is remembered for the instance: the next write asks nothing', async () => {
    cicd.db!.refuse = (method, table) => (method === 'GET' && table === 'sys_dictionary' ? refused(403, 'personalize_dictionary') : undefined);

    const first = await add('incident', { u_code: 'ABCDEFGHIJK' });
    const reads = dictionaryReads();
    const second = await add('incident', { u_code: 'ABCDEFGHIJKLM' });

    expect(first.error).toBeUndefined();
    expect(second.error).toBeUndefined();
    expect(reads).toBe(1);
    expect(dictionaryReads()).toBe(reads);
  });

  it('a 5xx is not remembered: the next write reads again, and refuses on what it reads', async () => {
    let failures = 1;
    cicd.db!.refuse = (method, table) => (method === 'GET' && table === 'sys_dictionary' && failures-- > 0
      ? refused(500, 'Internal Server Error') : undefined);

    const first = await add('incident', { u_code: 'ABCDEFGHIJK' });
    const second = await add('incident', { u_code: 'ABCDEFGHIJK' });

    expect(first.error).toBeUndefined();
    expect(second.error?.code).toBe('VALUE_TOO_LONG');
  });

  it('a 401 on the pre-check\'s read ends the call there: the write is not sent, one failed login and not two', async () => {
    cicd.db!.refuse = (method, table) => (method === 'GET' && table === 'sys_dictionary' ? refused(401, 'User Not Authenticated') : undefined);

    const { error } = await add('incident', { u_code: 'ABCD' });

    expect(error?.code).toBe('AUTHENTICATION_FAILED');
    expect(posts('incident')).toHaveLength(0);
    expect(cicd.calls).toHaveLength(1);
  });

  it('two instances keep their own limits', async () => {
    await onInstance('alpha', () => add('incident', { u_code: 'ABCDEFGHI' }));
    // The other instance's dictionary says 5; alpha's cached 10 must not answer for it.
    cicd.db!.rows.sys_dictionary.find((r) => r.element === 'u_code')!.max_length = '5';

    const beta = await onInstance('beta', () => add('incident', { u_code: 'ABCDEFGHI' }));

    expect(beta.error?.code).toBe('VALUE_TOO_LONG');
    expect(details(beta.error)).toMatchObject({ column_limit: 5 });
  });

  it('the pre-check has a budget of its own: a slow read before the write leaves C93 its whole budget after it', async () => {
    // Every dictionary and table read takes a second. The pre-check finds no limit for u_note and walks up
    // to task, using its full budget; the write is then cut, and the dictionary learns the column only now.
    const db = cicd.db!;
    db.delayMs = (method, table) => (method === 'GET' && (table === 'sys_dictionary' || table === 'sys_db_object') ? 1000 : 0);
    db.store = (table, sent) => (table === 'incident' && typeof sent.u_note === 'string' ? { ...sent, u_note: sent.u_note.slice(0, 20) } : sent);
    db.afterInsert = (table) => { if (table === 'incident') db.rows.sys_dictionary.push(dict('incident', 'u_note', '20')); };

    const { value, error } = await add('incident', { u_note: 'n'.repeat(30) });

    expect(error).toBeUndefined();
    expect(value.warnings).toEqual([expect.objectContaining({ code: 'VALUE_TRUNCATED', field: 'u_note', column_limit: 20, confirmed: true })]);
  });
});

describe('ARC-09-C97 — a refusal after an earlier write of the same call names that write', () => {
  it('the step is written, its script input is refused, and the error carries the step', async () => {
    const TEST = id('b', 1);
    const RSSS = id('b', 2);
    const V_SCRIPT = id('b', 3);
    const db = cicd.db!;
    db.rows.sys_atf_test = [{ sys_id: TEST, name: 'probe', active: 'true' }];
    db.rows.sys_atf_step_config = [{ sys_id: RSSS, name: 'Run Server Side Script', active: 'true', sys_scope: id('b', 4) }];
    db.rows.atf_input_variable = [{ sys_id: V_SCRIPT, model: RSSS, element: 'script' }];
    db.rows.sys_atf_step = [];
    db.rows.sys_variable_value = [];
    db.rows.sys_dictionary.push(dict('sys_variable_value', 'value', '20'));
    db.refs = { ...db.refs, sys_atf_step: ['test', 'step_config'], sys_variable_value: ['variable'], atf_input_variable: ['model'] };

    const settled = (routeToolInvocation(client(), 'snow_atf_atf_step_add', {
      test: TEST, step_config: RSSS, inputs: { script: 'describe("x", function () { it("y", function () {}); });' },
    }) as Promise<unknown>).then(() => undefined, (e: ServiceNowError) => e);
    await vi.runAllTimersAsync();
    const error = await settled;

    const step = db.rows.sys_atf_step[0]?.sys_id as string;
    expect(step).toBeTruthy();
    expect(error?.code).toBe('VALUE_TOO_LONG');
    expect(details(error).written).toEqual(expect.arrayContaining([expect.objectContaining({ table: 'sys_atf_step', sys_id: step })]));
    expect(error?.message).toContain(step);
    expect(posts('sys_variable_value')).toEqual([]);
  });
});
