// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C183 — the instance's mandatory fields are checked before the first write.
 *
 * The owner's v2.2.0-rc.2 and rc.3 checks: an `sn_aia_agent_tool_m2m` insert without `name` was refused by a data
 * policy after the agent had been written (ARC-09-C180 named that one field). Mandatory fields are instance-specific.
 * A dictionary entry's Mandatory does not apply to web services (`t_MakingAFieldMandatory.md`), and a data policy does,
 * the REST Table API included (`c_DataPolicy.md`). So the write path reads the active data policies for the table and
 * the tables it extends (a parent's only when Inherit is set) before a create. It refuses a create that lacks an
 * unconditionally mandatory field, with nothing written. It reports a conditional policy, a field the dictionary
 * defaults, and a check it could not make. A composite build checks every table it will write before its first write.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { newDb, refused, resetCicd, type CicdState, type FakeDb } from '../helpers/fake-cicd.js';
import { ServiceNowClient } from '../../src/servicenow/client.js';
import { runWithInstance, type InstanceRuntime } from '../../src/servicenow/context.js';
import { resetColumnLimits } from '../../src/servicenow/stored-values.js';
import { routeToolInvocation } from '../../src/tools/index.js';
import { expandPreset } from '../../src/utils/permissions.js';
import type { ServiceNowError } from '../../src/utils/errors.js';
import { useLicensedSession } from '../helpers/licensed-session.js';

useLicensedSession();

const cicd = vi.hoisted<CicdState>(() => ({ calls: [], progress: [], tables: {} }));
vi.mock('../../src/servicenow/http.js', async () => (await import('../helpers/fake-cicd.js')).fakeCicdModule(cicd));

const id = (c: string, n: number) => `${c.repeat(28)}${String(n).padStart(4, '0')}`;
const TASK = id('1', 1);
const INCIDENT = id('1', 2);
const META = id('1', 3);
const AGENT_T = id('1', 4);
const LINK_T = id('1', 5);
const NAMED_TOOL = id('2', 1);
const UNNAMED_TOOL = id('2', 2);

type Row = Record<string, unknown>;
const policy = (n: number, table: string, short: string, extra: Row = {}): Row =>
  ({ sys_id: id('3', n), model_table: table, short_description: short, active: 'true', conditions: '', inherit: 'false', ...extra });
const rule = (n: number, policyId: string, field: string): Row =>
  ({ sys_id: id('4', n), sys_data_policy: policyId, field, mandatory: 'true' });

function world(rows: FakeDb['rows'] = {}): FakeDb {
  return newDb({
    sys_db_object: [
      { sys_id: TASK, name: 'task', super_class: '' },
      { sys_id: INCIDENT, name: 'incident', super_class: TASK },
      { sys_id: META, name: 'sys_metadata', super_class: '' },
      { sys_id: AGENT_T, name: 'sn_aia_agent', super_class: META },
      { sys_id: LINK_T, name: 'sn_aia_agent_tool_m2m', super_class: META },
    ],
    sn_aia_tool: [{ sys_id: NAMED_TOOL, name: 'lookup_directory' }, { sys_id: UNNAMED_TOOL }],
    sys_data_policy2: [],
    sys_data_policy_rule: [],
    sys_dictionary: [],
    incident: [],
    sn_aia_agent: [],
    sn_aia_agent_tool_m2m: [],
    ...rows,
  }, { sys_db_object: ['super_class'], sys_data_policy_rule: ['sys_data_policy'] });
}

const client = () => new ServiceNowClient({
  instanceUrl: 'https://test.service-now.com', authMethod: 'basic', basic: { username: 'u', password: 'p' },
  maxRetries: 0, retryDelayMs: 0,
});
type Outcome = { value: Row; error: ServiceNowError | undefined };
async function call(name: string, args: Row): Promise<Outcome> {
  const flags = { ...expandPreset('full') } as InstanceRuntime['flags'];
  const rt: InstanceRuntime = {
    label: 'pdi', url: 'https://test.service-now.com', environment: 'pdi', preset: 'full',
    flags, effectiveFlags: flags, toolPackage: 'full', maxRecords: 100, prodWriteAck: false,
    client: {} as InstanceRuntime['client'], warnings: [],
  };
  return runWithInstance(rt, async () => {
    try {
      return { value: (await routeToolInvocation(client(), name, args)) as Row, error: undefined };
    } catch (error) {
      return { value: {}, error: error as ServiceNowError };
    }
  });
}
const writes = () => cicd.calls.filter((c) => c.method === 'POST' || c.method === 'PATCH');
const reads = (table: string) => cicd.calls.filter((c) => c.method === 'GET' && c.path.startsWith(`/api/now/table/${table}`));
const addIncident = (fields: Row) => call('snow_core_record_add', { table: 'incident', fields });

const logLevel = process.env.LOG_LEVEL;
beforeAll(() => { process.env.LOG_LEVEL = 'error'; });
afterAll(() => {
  if (logLevel === undefined) delete process.env.LOG_LEVEL;
  else process.env.LOG_LEVEL = logLevel;
});
beforeEach(() => { resetCicd(cicd); resetColumnLimits(); });

describe('ARC-09-C183 — a data policy\'s mandatory field is checked before the first write', () => {
  it('an inherited, unconditional policy on task refuses an incident without the field, before any write', async () => {
    cicd.db = world({
      sys_data_policy2: [policy(1, 'task', 'Task short description', { inherit: 'true' })],
      sys_data_policy_rule: [rule(1, id('3', 1), 'short_description')],
    });
    const { error } = await addIncident({ caller_id: 'x' });
    expect(error?.code).toBe('INVALID_REQUEST');
    expect(error?.message).toMatch(/^The instance requires short_description for incident — data policy 'Task short description' \(on task\): short_description\. Nothing was written\. Ask the user/);
    expect(writes()).toHaveLength(0);
  });

  it('a parent\'s policy without Inherit does not apply: the write proceeds', async () => {
    cicd.db = world({
      sys_data_policy2: [policy(1, 'task', 'Task only')],
      sys_data_policy_rule: [rule(1, id('3', 1), 'short_description')],
    });
    const { error, value } = await addIncident({ caller_id: 'x' });
    expect(error).toBeUndefined();
    expect(writes()).toHaveLength(1);
    expect(value).not.toHaveProperty('mandatory_fields');
  });

  it('a conditional policy does not block; it is reported as may be required, with its condition', async () => {
    cicd.db = world({
      sys_data_policy2: [policy(1, 'incident', 'P1 needs a cause', { conditions: 'priority=1^EQ' })],
      sys_data_policy_rule: [rule(1, id('3', 1), 'cause')],
    });
    const { error, value } = await addIncident({ caller_id: 'x' });
    expect(error).toBeUndefined();
    expect(writes()).toHaveLength(1);
    expect(value.mandatory_fields).toEqual([{ table: 'incident',
      may_be_required: [{ field: 'cause', policy: 'P1 needs a cause', condition: 'priority=1^EQ' }] }]);
  });

  it('control: the field is sent, so nothing is said and the write proceeds', async () => {
    cicd.db = world({
      sys_data_policy2: [policy(1, 'incident', 'Needs a description')],
      sys_data_policy_rule: [rule(1, id('3', 1), 'short_description')],
    });
    const { error, value } = await addIncident({ short_description: 'Printer down' });
    expect(error).toBeUndefined();
    expect(value).not.toHaveProperty('mandatory_fields');
  });

  it('a field the dictionary defaults is reported, not blocked', async () => {
    cicd.db = world({
      sys_data_policy2: [policy(1, 'incident', 'Needs urgency')],
      sys_data_policy_rule: [rule(1, id('3', 1), 'urgency')],
      sys_dictionary: [{ sys_id: id('5', 1), name: 'task', element: 'urgency', default_value: '3' }],
    });
    const { error, value } = await addIncident({ caller_id: 'x' });
    expect(error).toBeUndefined();
    expect(writes()).toHaveLength(1);
    expect(value.mandatory_fields).toEqual([{ table: 'incident', defaulted: ['urgency'] }]);
  });

  it('data policies this account cannot read: not checked, said so, and the write proceeds', async () => {
    cicd.db = world();
    cicd.db.refuse = (method, table) => (method === 'GET' && table === 'sys_data_policy2' ? refused(403, 'ACL') : undefined);
    const { error, value } = await addIncident({ caller_id: 'x' });
    expect(error).toBeUndefined();
    expect(writes()).toHaveLength(1);
    expect(value.mandatory_fields).toEqual([{ table: 'incident', not_checked: expect.stringMatching(/data policies could not be read/) }]);
  });

  it('read once per table per session: two creates read the policies once', async () => {
    cicd.db = world({ sys_data_policy2: [policy(1, 'incident', 'Needs a description')],
      sys_data_policy_rule: [rule(1, id('3', 1), 'short_description')] });
    await addIncident({ short_description: 'one' });
    await addIncident({ short_description: 'two' });
    expect(writes()).toHaveLength(2);
    expect(reads('sys_data_policy2')).toHaveLength(1);
    expect(reads('sys_data_policy_rule')).toHaveLength(1);
  });

  it('the AI agent build checks every table it will write before its first write', async () => {
    cicd.db = world({
      sys_data_policy2: [policy(1, 'sn_aia_agent_tool_m2m', 'Tool link name')],
      sys_data_policy_rule: [rule(1, id('3', 1), 'name')],
    });
    const args = { name: 'Group reader', description: 'd', role: 'r', instructions: 'i' };
    const refusedBuild = await call('snow_ai_ai_agent_add', { ...args, tools: [{ tool_sys_id: UNNAMED_TOOL }] });
    expect(refusedBuild.error?.code).toBe('INVALID_REQUEST');
    expect(refusedBuild.error?.message).toMatch(/The instance requires name for sn_aia_agent_tool_m2m — data policy 'Tool link name': name\..*Nothing was written\./);
    expect(writes()).toHaveLength(0);

    // ARC-09-C180's default name satisfies the policy: the build proceeds.
    const built = await call('snow_ai_ai_agent_add', { ...args, tools: [{ tool_sys_id: NAMED_TOOL }] });
    expect(built.error).toBeUndefined();
    expect(writes().map((c) => c.path)).toEqual(['/api/now/table/sn_aia_agent', '/api/now/table/sn_aia_agent_tool_m2m']);
  });

  it('a cold agent build with no policies adds a bounded number of reads', async () => {
    cicd.db = world();
    const { error } = await call('snow_ai_ai_agent_add', { name: 'Group reader', description: 'd', role: 'r', instructions: 'i',
      tools: [{ tool_sys_id: NAMED_TOOL }] });
    expect(error).toBeUndefined();
    const policyReads = reads('sys_data_policy2').length;
    const ruleReads = reads('sys_data_policy_rule').length;
    console.log(`    cold agent build: sys_data_policy2 ${policyReads}, sys_data_policy_rule ${ruleReads}, `
      + `sys_db_object ${reads('sys_db_object').length} (shared with ARC-09-C97)`);
    expect(policyReads).toBe(2);
    expect(ruleReads).toBe(0);
  });
});
