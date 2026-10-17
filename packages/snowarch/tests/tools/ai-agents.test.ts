// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C165 — the four snow_ai_* tools against AI Agent Studio's own tables.
 *
 * Until this row the tools wrote `sys_ai_agent`, `sys_ai_agentic_workflow` and two `sys_security_acl` rows conditioned
 * on the former. None of those tables exists on a current instance (the owner's live trial, 2026-10-16: the index
 * answered `Invalid table sys_ai_agent`), and nothing tested them. The table inventory is documented
 * (`markdown/intelligent-experiences/na-aia-reference.md`): an agent is `sn_aia_agent`, its tools are
 * `sn_aia_agent_tool_m2m` rows, and an agentic workflow is `sn_aia_usecase` with its agents as `sn_aia_team_member`
 * rows of an `sn_aia_team`.
 *
 * The client here is a small in-memory instance that does what the trial observed (PN-17): an insert into
 * `sn_aia_agent` creates its `sn_aia_agent_config` (active) and its `sn_aia_version`; an insert into `sn_aia_usecase`
 * creates a version and no team. Every case asserts what was written, in which order, and what was never written.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { aiAgentsToolManifest, dispatchAiAgentsAction } from '../../src/tools/ai-agents.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';
import { ServiceNowError } from '../../src/utils/errors.js';
import { withPreset } from '../helpers/preset.js';

withPreset('full');

type Row = Record<string, unknown>;

const TOOL = 'a'.repeat(32);
const AGENT_A = 'b'.repeat(32);
const AGENT_B = 'c'.repeat(32);

/** `field=value`, `fieldINa,b`, joined by `^` — the subset the tools send. */
function matches(row: Row, query: string | undefined): boolean {
  if (!query) return true;
  return query.split('^').every((term) => {
    const inAt = term.indexOf('IN');
    const eq = term.indexOf('=');
    if (inAt > 0 && (eq === -1 || inAt < eq)) {
      const field = term.slice(0, inAt);
      return term.slice(inAt + 2).split(',').includes(String(row[field] ?? ''));
    }
    const field = term.slice(0, eq);
    return String(row[field] ?? '') === term.slice(eq + 1);
  });
}

let counter = 0;
const nextId = (): string => (counter += 1).toString(16).padStart(32, '0');

function fakeInstance(seed: Record<string, Row[]> = {}) {
  const db = new Map<string, Map<string, Row>>();
  const table = (name: string) => db.get(name) ?? db.set(name, new Map()).get(name)!;
  const put = (name: string, row: Row): Row => {
    const sysId = String(row.sys_id ?? nextId());
    const stored = { ...row, sys_id: sysId };
    table(name).set(sysId, stored);
    return stored;
  };
  for (const [name, rows] of Object.entries(seed)) for (const row of rows) put(name, row);

  const client = {
    createRecord: vi.fn(async (name: string, data: Row) => {
      const stored = put(name, data);
      // What the trial observed the platform do in the same transaction (PN-17).
      if (name === 'sn_aia_agent') {
        put('sn_aia_agent_config', { agent: stored.sys_id, active: 'true', public: 'false', current_version: '' });
        put('sn_aia_version', { target_table: 'sn_aia_agent', target_id: stored.sys_id, version_name: 'Version 1',
          version_number: '1', state: 'committed', active: 'true', snapshot: JSON.stringify({ overlay: { tools: [] } }) });
      }
      if (name === 'sn_aia_usecase') {
        put('sn_aia_version', { target_table: 'sn_aia_usecase', target_id: stored.sys_id, version_name: 'V1',
          version_number: '1', state: 'published', active: 'true' });
      }
      // ...and a tool link rewrites the agent's version snapshot, without a new version (PN-17).
      if (name === 'sn_aia_agent_tool_m2m') {
        for (const v of table('sn_aia_version').values()) {
          if (v.target_id !== data.agent) continue;
          const snap = JSON.parse(String(v.snapshot ?? '{"overlay":{"tools":[]}}'));
          snap.overlay.tools.push({ m2mId: stored.sys_id, toolId: data.tool });
          v.snapshot = JSON.stringify(snap);
        }
      }
      return { ...stored };
    }),
    updateRecord: vi.fn(async (name: string, sysId: string, data: Row) => {
      const row = table(name).get(sysId);
      if (!row) throw new ServiceNowError(`No record ${sysId} in ${name}`, 'NOT_FOUND');
      Object.assign(row, Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])));
      return { ...row };
    }),
    getRecord: vi.fn(async (name: string, sysId: string) => {
      const row = table(name).get(sysId);
      if (!row) throw new ServiceNowError(`Record not found: ${name}/${sysId}`, 'NOT_FOUND');
      return { ...row };
    }),
    queryRecords: vi.fn(async ({ table: name, query, limit }: { table: string; query?: string; limit?: number }) => {
      const rows = [...table(name).values()].filter((r) => matches(r, query));
      const records = rows.slice(0, limit ?? 1000).map((r) => ({ ...r }));
      return { count: records.length, total: rows.length, records };
    }),
    deleteRecord: vi.fn(),
  };
  return { client: client as unknown as ServiceNowClient & typeof client, db, table };
}

/** The instance every case starts from: one read-only script tool, two agents, the execution-mode choices. */
const SEED = (): Record<string, Row[]> => ({
  sn_aia_tool: [{ sys_id: TOOL, name: 'Read groups', type: 'script' }],
  sn_aia_agent: [{ sys_id: AGENT_A, name: 'Agent A' }, { sys_id: AGENT_B, name: 'Agent B' }],
  sys_choice: [
    { name: 'sn_aia_agent_tool_m2m', element: 'execution_mode', value: 'copilot', label: 'Supervised', inactive: 'false' },
    { name: 'sn_aia_agent_tool_m2m', element: 'execution_mode', value: 'autopilot', label: 'Autonomous', inactive: 'false' },
    { name: 'sn_aia_usecase', element: 'execution_mode', value: 'copilot', label: 'Supervised', inactive: 'false' },
  ],
});

const AGENT_ARGS = {
  name: 'Group reader', description: 'Reads the user groups', role: 'You list user groups.',
  instructions: 'Run the tool and report the count.',
};
const WORKFLOW_ARGS = { name: 'Group workflow', description: 'Lists groups', base_plan: 'Hand off to the agent.',
  agent_sys_ids: [AGENT_A, AGENT_B] };

const createdTables = (c: { createRecord: ReturnType<typeof vi.fn> }): string[] => c.createRecord.mock.calls.map((x) => x[0]);

describe('ARC-09-C165 — snow_ai_* writes AI Agent Studio\'s own tables', () => {
  beforeEach(() => { counter = 0; });

  it('1 — snow_ai_ai_agent_add inserts sn_aia_agent, and never sys_ai_agent or an ACL', async () => {
    const { client } = fakeInstance(SEED());
    const result = await dispatchAiAgentsAction(client, 'snow_ai_ai_agent_add', AGENT_ARGS);
    const tables = createdTables(client);
    expect(tables[0]).toBe('sn_aia_agent');
    expect(tables).not.toContain('sys_ai_agent');
    expect(tables).not.toContain('sys_security_acl');
    expect(client.createRecord).toHaveBeenCalledWith('sn_aia_agent', expect.objectContaining({
      name: AGENT_ARGS.name, description: AGENT_ARGS.description, role: AGENT_ARGS.role, instructions: AGENT_ARGS.instructions,
    }));
    // What the instance made by itself is read back and reported, never asserted or created.
    expect(result.config).toEqual(expect.objectContaining({ active: 'true' }));
    expect(result.version).toEqual(expect.objectContaining({ state: 'committed' }));
    expect(result.access_rules).toEqual({ acl: 'none', identity: 'instance default (dynamic user)', role_filtering: 'none',
      configure_at: result.studio_route });
    expect(result.studio_route).toBe(`/aiux/aia/agent/${result.agent.sys_id}/visualize`);
    expect(result.studio_route_note).toBe('observed on Brazil patch 0; not in the australia corpus — verify on the instance\'s family');
  });

  it('2 — one sn_aia_agent_tool_m2m per tools[] item, after the agent, linking agent and tool', async () => {
    const { client } = fakeInstance(SEED());
    const result = await dispatchAiAgentsAction(client, 'snow_ai_ai_agent_add', { ...AGENT_ARGS,
      tools: [{ tool_sys_id: TOOL }, { tool_sys_id: TOOL, name: 'Read groups, again', display_output: false }] });
    expect(createdTables(client)).toEqual(['sn_aia_agent', 'sn_aia_agent_tool_m2m', 'sn_aia_agent_tool_m2m']);
    const agentId = result.agent.sys_id;
    expect(client.createRecord).toHaveBeenNthCalledWith(2, 'sn_aia_agent_tool_m2m', expect.objectContaining({ agent: agentId, tool: TOOL }));
    expect(client.createRecord).toHaveBeenNthCalledWith(3, 'sn_aia_agent_tool_m2m',
      expect.objectContaining({ agent: agentId, tool: TOOL, name: 'Read groups, again', display_output: false }));
    expect(result.tool_links).toHaveLength(2);
  });

  it('3 — an unknown tool_sys_id is refused before anything is written', async () => {
    const { client } = fakeInstance(SEED());
    await expect(dispatchAiAgentsAction(client, 'snow_ai_ai_agent_add', { ...AGENT_ARGS, tools: [{ tool_sys_id: 'd'.repeat(32) }] }))
      .rejects.toThrow(/Nothing was written\./);
    expect(client.createRecord).not.toHaveBeenCalled();
    expect(client.updateRecord).not.toHaveBeenCalled();
  });

  it('4 — active: false sets the agent\'s own config inactive, the record the platform created', async () => {
    const { client, table } = fakeInstance(SEED());
    const result = await dispatchAiAgentsAction(client, 'snow_ai_ai_agent_add', { ...AGENT_ARGS, active: false });
    const config = [...table('sn_aia_agent_config').values()].find((r) => r.agent === result.agent.sys_id)!;
    expect(client.updateRecord).toHaveBeenCalledWith('sn_aia_agent_config', config.sys_id, { active: false });
    expect(result.config).toEqual(expect.objectContaining({ active: 'false' }));
    expect(createdTables(client)).not.toContain('sn_aia_agent_config');
  });

  it('5 — snow_ai_agentic_workflow_add: team, then the workflow with its team, then one member per agent; no modify', async () => {
    const { client } = fakeInstance(SEED());
    const result = await dispatchAiAgentsAction(client, 'snow_ai_agentic_workflow_add', WORKFLOW_ARGS);
    expect(createdTables(client)).toEqual(['sn_aia_team', 'sn_aia_usecase', 'sn_aia_team_member', 'sn_aia_team_member']);
    const teamId = result.team.sys_id;
    expect(client.createRecord).toHaveBeenNthCalledWith(2, 'sn_aia_usecase', expect.objectContaining({
      name: WORKFLOW_ARGS.name, description: WORKFLOW_ARGS.description, base_plan: WORKFLOW_ARGS.base_plan, team: teamId }));
    expect(client.createRecord).toHaveBeenNthCalledWith(3, 'sn_aia_team_member', expect.objectContaining({ team: teamId, agent: AGENT_A }));
    expect(client.createRecord).toHaveBeenNthCalledWith(4, 'sn_aia_team_member', expect.objectContaining({ team: teamId, agent: AGENT_B }));
    expect(client.updateRecord).not.toHaveBeenCalled();
    expect(createdTables(client)).not.toContain('sys_ai_agentic_workflow');
    expect(result.version).toEqual(expect.objectContaining({ state: 'published' }));
    expect(result.studio_route).toBe(`/aiux/aia/workflow/${result.workflow.sys_id}/visualize`);
    expect(result.access_rules.acl).toBe('none');
  });

  it('6 — snow_ai_ai_agents_index reads sn_aia_agent, never sys_ai_agent', async () => {
    const { client } = fakeInstance(SEED());
    const result = await dispatchAiAgentsAction(client, 'snow_ai_ai_agents_index', {});
    const queried = client.queryRecords.mock.calls.map((x) => x[0].table);
    expect(queried).toContain('sn_aia_agent');
    expect(queried).not.toContain('sys_ai_agent');
    expect(result.agents.map((a: Row) => a.sys_id)).toEqual(expect.arrayContaining([AGENT_A, AGENT_B]));
  });

  it('7 — a tool link that fails after the agent was created names what was created, and deletes nothing', async () => {
    const { client } = fakeInstance(SEED());
    const real = client.createRecord.getMockImplementation()!;
    client.createRecord.mockImplementation(async (name: string, data: Row) => {
      if (name === 'sn_aia_agent_tool_m2m') throw new ServiceNowError('Operation failed', 'INSUFFICIENT_PRIVILEGES');
      return real(name, data);
    });
    const failure = dispatchAiAgentsAction(client, 'snow_ai_ai_agent_add', { ...AGENT_ARGS, tools: [{ tool_sys_id: TOOL }] });
    await expect(failure).rejects.toThrow(/sn_aia_agent [0-9a-f]{32} was created, but/);
    expect(client.deleteRecord).not.toHaveBeenCalled();
  });

  it('9 — an execution_mode the instance does not list is refused before anything is written', async () => {
    const { client } = fakeInstance(SEED());
    await expect(dispatchAiAgentsAction(client, 'snow_ai_ai_agent_add', { ...AGENT_ARGS,
      tools: [{ tool_sys_id: TOOL, execution_mode: 'turbo' }] })).rejects.toThrow(/Nothing was written\./);
    await expect(dispatchAiAgentsAction(client, 'snow_ai_agentic_workflow_add', { ...WORKFLOW_ARGS, execution_mode: 'autopilot' }))
      .rejects.toThrow(/Nothing was written\./);
    expect(client.createRecord).not.toHaveBeenCalled();
    // ...and a listed one is written as given, never replaced by a hard-coded value.
    await dispatchAiAgentsAction(client, 'snow_ai_ai_agent_add', { ...AGENT_ARGS, tools: [{ tool_sys_id: TOOL, execution_mode: 'autopilot' }] });
    expect(client.createRecord).toHaveBeenCalledWith('sn_aia_agent_tool_m2m', expect.objectContaining({ execution_mode: 'autopilot' }));
  });

  it('9b — the choice list is read before any write, and a refusal says which case it is', async () => {
    const { client } = fakeInstance(SEED());
    await dispatchAiAgentsAction(client, 'snow_ai_ai_agent_add', { ...AGENT_ARGS, tools: [{ tool_sys_id: TOOL, execution_mode: 'copilot' }] });
    const choiceRead = client.queryRecords.mock.calls.findIndex((x) => x[0].table === 'sys_choice');
    expect(choiceRead).toBeGreaterThanOrEqual(0);
    expect(client.queryRecords.mock.invocationCallOrder[choiceRead]).toBeLessThan(client.createRecord.mock.invocationCallOrder[0]);

    const empty = fakeInstance({ ...SEED(), sys_choice: [] });
    await expect(dispatchAiAgentsAction(empty.client, 'snow_ai_ai_agent_add', { ...AGENT_ARGS,
      tools: [{ tool_sys_id: TOOL, execution_mode: 'copilot' }] }))
      .rejects.toThrow(/no execution_mode choices are listed on this instance for sn_aia_agent_tool_m2m\. Nothing was written\./);
    const refused = fakeInstance(SEED());
    const realQuery = refused.client.queryRecords.getMockImplementation()!;
    refused.client.queryRecords.mockImplementation(async (q: { table: string }) => {
      if (q.table === 'sys_choice') throw new ServiceNowError('ACL denied', 'INSUFFICIENT_PRIVILEGES');
      return realQuery(q as never);
    });
    await expect(dispatchAiAgentsAction(refused.client, 'snow_ai_agentic_workflow_add', { ...WORKFLOW_ARGS, execution_mode: 'copilot' }))
      .rejects.toThrow(/the choice list could not be read \(INSUFFICIENT_PRIVILEGES\)\. Nothing was written\./);
    expect(empty.client.createRecord).not.toHaveBeenCalled();
    expect(refused.client.createRecord).not.toHaveBeenCalled();
  });

  it('and with no execution_mode the field is not sent, so the instance default applies', async () => {
    const { client } = fakeInstance(SEED());
    await dispatchAiAgentsAction(client, 'snow_ai_ai_agent_add', { ...AGENT_ARGS, tools: [{ tool_sys_id: TOOL }] });
    await dispatchAiAgentsAction(client, 'snow_ai_agentic_workflow_add', WORKFLOW_ARGS);
    for (const [name, data] of client.createRecord.mock.calls) {
      if (name === 'sn_aia_agent_tool_m2m' || name === 'sn_aia_usecase') expect(data).not.toHaveProperty('execution_mode');
    }
  });

  it('4b — with no configuration record to modify, active: false is a warning and active reads unknown; a missing version is a warning', async () => {
    const { client, table } = fakeInstance(SEED());
    const real = client.createRecord.getMockImplementation()!;
    client.createRecord.mockImplementation(async (name: string, data: Row) => {
      const answer = await real(name, data);
      if (name === 'sn_aia_agent') { table('sn_aia_agent_config').clear(); table('sn_aia_version').clear(); }
      return answer;
    });
    const result = await dispatchAiAgentsAction(client, 'snow_ai_ai_agent_add', { ...AGENT_ARGS, active: false });
    expect(result.active).toBe('unknown');
    expect(result.warnings.map((w: Row) => w.message).join(' | ')).toMatch(/configuration record not found; the agent may be active/);
    expect(result.warnings.map((w: Row) => w.message).join(' | ')).toMatch(/version/);
    expect(client.updateRecord).not.toHaveBeenCalled();
    expect(createdTables(client)).toEqual(['sn_aia_agent']);
  });

  it('memory_scope is written only after the dictionary shows the column, and refused when it does not', async () => {
    const without = fakeInstance(SEED());
    await expect(dispatchAiAgentsAction(without.client, 'snow_ai_agentic_workflow_add', { ...WORKFLOW_ARGS, memory_scope: 'global' }))
      .rejects.toThrow(/memory_scope is not a column of sn_aia_team_member on this instance\. Nothing was written\./);
    expect(without.client.createRecord).not.toHaveBeenCalled();
    const withColumn = fakeInstance({ ...SEED(), sys_dictionary: [{ name: 'sn_aia_team_member', element: 'memory_scope' }] });
    await dispatchAiAgentsAction(withColumn.client, 'snow_ai_agentic_workflow_add', { ...WORKFLOW_ARGS, memory_scope: 'global' });
    expect(withColumn.client.createRecord).toHaveBeenCalledWith('sn_aia_team_member', expect.objectContaining({ memory_scope: 'global' }));
  });

  it('C169 — the version is read back after the last tool link and the configuration, so it carries the links', async () => {
    const { client } = fakeInstance(SEED());
    const result = await dispatchAiAgentsAction(client, 'snow_ai_ai_agent_add', { ...AGENT_ARGS, active: false,
      tools: [{ tool_sys_id: TOOL }, { tool_sys_id: TOOL, name: 'again' }] });
    // The rc.1 sitting: the version came back with `tools: []` and a re-read seconds later had the link.
    const tools = JSON.parse(String(result.version.snapshot)).overlay.tools;
    expect(tools).toHaveLength(2);
    expect(tools.every((x: Row) => x.toolId === TOOL)).toBe(true);
    const order = (fn: ReturnType<typeof vi.fn>, pick: (c: unknown[]) => boolean) =>
      fn.mock.calls.map((c, i) => [c, fn.mock.invocationCallOrder[i]] as const).filter(([c]) => pick(c)).map(([, o]) => o);
    const lastLink = Math.max(...order(client.createRecord, (c) => c[0] === 'sn_aia_agent_tool_m2m'));
    const configRead = Math.min(...order(client.queryRecords, (c) => (c[0] as Row).table === 'sn_aia_agent_config'));
    const configModify = Math.max(...order(client.updateRecord, (c) => c[0] === 'sn_aia_agent_config'));
    const versionRead = Math.min(...order(client.queryRecords, (c) => (c[0] as Row).table === 'sn_aia_version'));
    expect(configRead).toBeGreaterThan(lastLink);
    expect(versionRead).toBeGreaterThan(configModify);
    expect(result.config).toEqual(expect.objectContaining({ active: 'false' }));
  });

  it('C169 — the workflow\'s version is read back after its last member', async () => {
    const { client } = fakeInstance(SEED());
    await dispatchAiAgentsAction(client, 'snow_ai_agentic_workflow_add', WORKFLOW_ARGS);
    const lastMember = Math.max(...client.createRecord.mock.calls
      .map((c, i) => [c[0], client.createRecord.mock.invocationCallOrder[i]] as const)
      .filter(([t]) => t === 'sn_aia_team_member').map(([, o]) => o));
    const versionRead = Math.min(...client.queryRecords.mock.calls
      .map((c, i) => [(c[0] as Row).table, client.queryRecords.mock.invocationCallOrder[i]] as const)
      .filter(([t]) => t === 'sn_aia_version').map(([, o]) => o));
    expect(versionRead).toBeGreaterThan(lastMember);
  });

  it('each _add description names every table it writes, in order, and the removed inputs are gone', () => {
    const byName = Object.fromEntries(aiAgentsToolManifest().map((t) => [t.name, t]));
    expect(byName.snow_ai_ai_agent_add.description).toMatch(/writes sn_aia_agent, then one sn_aia_agent_tool_m2m per tool/);
    expect(byName.snow_ai_agentic_workflow_add.description).toMatch(/writes sn_aia_team, sn_aia_usecase, then one sn_aia_team_member per agent/);
    const props = (n: string) => Object.keys((byName[n].inputSchema as { properties: Row }).properties);
    for (const gone of ['capabilities', 'auto_generate_acls']) expect(props('snow_ai_ai_agent_add')).not.toContain(gone);
    for (const gone of ['agent_sys_id', 'steps', 'trigger_conditions']) expect(props('snow_ai_agentic_workflow_add')).not.toContain(gone);
    expect(JSON.stringify(aiAgentsToolManifest())).not.toMatch(/sys_ai_agent|sys_security_acl|ACL/);
  });

  it('10 — snow_ai_ai_agent_read reads the sn_aia_* tables, and says it did not inspect access rules', async () => {
    const { client } = fakeInstance({ ...SEED(),
      sn_aia_agent_config: [{ agent: AGENT_A, active: 'true' }],
      sn_aia_version: [{ target_table: 'sn_aia_agent', target_id: AGENT_A, state: 'committed' }],
      sn_aia_agent_tool_m2m: [{ agent: AGENT_A, tool: TOOL, name: 'Read groups' }] });
    const result = await dispatchAiAgentsAction(client, 'snow_ai_ai_agent_read', { sys_id: AGENT_A });
    expect(client.getRecord).toHaveBeenCalledWith('sn_aia_agent', AGENT_A);
    const queried = client.queryRecords.mock.calls.map((x) => x[0].table);
    expect(queried).toEqual(expect.arrayContaining(['sn_aia_agent_config', 'sn_aia_version', 'sn_aia_agent_tool_m2m', 'sn_aia_tool']));
    expect(queried).not.toContain('sys_ai_agent');
    expect(queried).not.toContain('sys_security_acl');
    expect(result.config).toEqual(expect.objectContaining({ active: 'true' }));
    expect(result.versions).toHaveLength(1);
    expect(result.tool_links[0].tool_record).toEqual(expect.objectContaining({ name: 'Read groups' }));
    // The read never looked at access control, so it says so rather than "none" (an agent made in Studio may have one).
    expect(result.access_rules).toEqual({ checked: false, note: 'this tool does not read access rules',
      configure_at: `/aiux/aia/agent/${AGENT_A}/visualize` });
  });

  it('11 — the index takes record_type as a plain choice value, and nothing else reaches the query', async () => {
    const { client } = fakeInstance(SEED());
    for (const bad of ['custom^ORname!=x', 'Template']) {
      await expect(dispatchAiAgentsAction(client, 'snow_ai_ai_agents_index', { record_type: bad })).rejects.toMatchObject(
        { code: 'INVALID_REQUEST', message: 'record_type must be a plain choice value (letters and underscores)' });
    }
    expect(client.queryRecords).not.toHaveBeenCalled();
    await dispatchAiAgentsAction(client, 'snow_ai_ai_agents_index', { record_type: 'template' });
    expect(client.queryRecords).toHaveBeenCalledWith(expect.objectContaining({ table: 'sn_aia_agent', query: 'record_type=template' }));
  });

  it('12 — agent_type and channel are sent only when passed', async () => {
    const bare = fakeInstance(SEED());
    await dispatchAiAgentsAction(bare.client, 'snow_ai_ai_agent_add', AGENT_ARGS);
    expect(bare.client.createRecord.mock.calls[0][0]).toBe('sn_aia_agent');
    expect(bare.client.createRecord.mock.calls[0][1]).not.toHaveProperty('agent_type');
    expect(bare.client.createRecord.mock.calls[0][1]).not.toHaveProperty('channel');
    const given = fakeInstance(SEED());
    await dispatchAiAgentsAction(given.client, 'snow_ai_ai_agent_add', { ...AGENT_ARGS, channel: 'x' });
    expect(given.client.createRecord).toHaveBeenNthCalledWith(1, 'sn_aia_agent', expect.objectContaining({ channel: 'x' }));
    expect(given.client.createRecord.mock.calls[0][1]).not.toHaveProperty('agent_type');
  });
});
