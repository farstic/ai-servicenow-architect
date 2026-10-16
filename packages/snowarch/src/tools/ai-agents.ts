// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C165 — AI Agent Studio: agents and agentic workflows, in the platform's own tables.
 *
 * The table inventory is documented (vendor/ServiceNowDocs markdown/intelligent-experiences/na-aia-reference.md,
 * the AI Agent Studio tables): an agent is `sn_aia_agent`, its configuration `sn_aia_agent_config`, a tool
 * `sn_aia_tool`, an agent's tool `sn_aia_agent_tool_m2m`; an agentic workflow is `sn_aia_usecase`, and its agents are
 * `sn_aia_team_member` rows of an `sn_aia_team`. Until this row these tools wrote `sys_ai_agent`,
 * `sys_ai_agentic_workflow` and two `sys_security_acl` rows conditioned on the first — tables a current instance does
 * not have.
 *
 * What the owner's live trial observed, and the bundled corpus does not say (docs/PLATFORM-NOTES.md PN-17): an insert
 * into `sn_aia_agent` creates the agent's configuration (active) and a version by itself; an insert into
 * `sn_aia_usecase` creates a version and no team. So these tools READ BACK the configuration and the version, and
 * report them; they never create or assert them. Nothing here creates access control: the result says so, and where
 * it is configured.
 *
 * The composite-write conventions of the ATF authoring tools (ARC-09-C95): every check is a read made before the first
 * write, and a refusal says "Nothing was written."; every record is read back after its write, and a difference is a
 * warning; a failure after the first record rethrows naming every record created, and nothing is deleted — a delete
 * is a write that needs its own approval.
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import type { ServiceNowRecord } from '../servicenow/types.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireNowAssist, requireWrite } from '../utils/permissions.js';
import { plain, write } from './atf-author.js';
import type { ToolDefinition } from './types.js';

const AGENT = 'sn_aia_agent';
const CONFIG = 'sn_aia_agent_config';
const VERSION = 'sn_aia_version';
const TOOL = 'sn_aia_tool';
const LINK = 'sn_aia_agent_tool_m2m';
const USECASE = 'sn_aia_usecase';
const TEAM = 'sn_aia_team';
const MEMBER = 'sn_aia_team_member';

const SYS_ID = /^[0-9a-f]{32}$/i;

/** The Studio pages, observed on Brazil patch 0 only (PN-17): one note says so, never prose in every field. */
const agentRoute = (sysId: string): string => `/aiux/aia/agent/${sysId}/visualize`;
const workflowRoute = (sysId: string): string => `/aiux/aia/workflow/${sysId}/visualize`;
const ROUTE_NOTE = "observed on Brazil patch 0; not in the australia corpus — verify on the instance's family";

/** What a record written here carries for access: nothing, and where that is configured (ruling OQ-DS-2). */
const accessRules = (route: string) => ({
  acl: 'none', identity: 'instance default (dynamic user)', role_filtering: 'none', configure_at: route,
});
/** The read inspects no access control, so it says that, not "none": an agent made in Studio may have an ACL. */
const accessNotRead = (route: string) => ({
  checked: false, note: 'this tool does not read access rules', configure_at: route,
});

/** The record_type values the owner's trial saw (PN-17): template for the platform's agents, custom for ours. */
const RECORD_TYPES = new Set(['custom', 'template']);

type Row = Record<string, unknown>;
/** A warning with no registered code: a record the platform was expected to create was not found. The audit skips it. */
type Note = { table: string; message: string } & Row;

export function aiAgentsToolManifest(): ToolDefinition[] {
  return [
    {
      name: 'snow_ai_ai_agent_add',
      description: 'Create an AI Agent Studio agent: writes sn_aia_agent, then one sn_aia_agent_tool_m2m per tool, and '
        + 'reads back the configuration and version the instance creates. Creates no access control '
        + '(requires NOW_ASSIST_ENABLED + WRITE_ENABLED)',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Agent name' },
          description: { type: 'string', description: 'What the agent does' },
          role: { type: 'string', description: 'The agent\'s role' },
          instructions: { type: 'string', description: 'The agent\'s instructions' },
          agent_type: { type: 'string', description: 'Sent only when given; the instance default otherwise' },
          channel: { type: 'string', description: 'Sent only when given; the instance default otherwise' },
          tools: {
            type: 'array',
            description: 'Existing sn_aia_tool records to link, one sn_aia_agent_tool_m2m each',
            items: {
              type: 'object',
              properties: {
                tool_sys_id: { type: 'string', description: 'sys_id of an existing sn_aia_tool' },
                execution_mode: { type: 'string', description: 'A value listed in sys_choice on the instance; omitted, the instance default' },
                name: { type: 'string', description: 'The link\'s name' },
                display_output: { type: 'boolean', description: 'Show the tool\'s raw output to the user (instance default true)' },
              },
              required: ['tool_sys_id'],
            },
          },
          active: { type: 'boolean', description: 'false sets the agent\'s configuration inactive; an inserted agent is active' },
        },
        required: ['name', 'description', 'role', 'instructions'],
      },
      gate: 'now_assist',
      mutates: true,
      alsoRequires: 'write',
    },
    {
      name: 'snow_ai_ai_agents_index',
      description: 'List AI Agent Studio agents (sn_aia_agent), each with active from its configuration',
      inputSchema: {
        type: 'object',
        properties: {
          active: { type: 'boolean', description: 'Filter by the configuration\'s active flag' },
          record_type: { type: 'string', description: 'Filter by record_type (custom or template)' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
        },
        required: [],
      },
      gate: 'none',
      mutates: false,
    },
    {
      name: 'snow_ai_ai_agent_read',
      description: 'Get an AI Agent Studio agent (sn_aia_agent) with its configuration, versions and tool links',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'sys_id of the sn_aia_agent' },
        },
        required: ['sys_id'],
      },
      gate: 'none',
      mutates: false,
    },
    {
      name: 'snow_ai_agentic_workflow_add',
      description: 'Create an agentic workflow: writes sn_aia_team, sn_aia_usecase, then one sn_aia_team_member per '
        + 'agent, and reads back the version the instance creates. Creates no access control '
        + '(requires NOW_ASSIST_ENABLED + WRITE_ENABLED)',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Workflow name' },
          description: { type: 'string', description: 'What the workflow does' },
          base_plan: { type: 'string', description: 'The workflow\'s base plan' },
          agent_sys_ids: { type: 'array', items: { type: 'string' }, description: 'sys_ids of existing sn_aia_agent records, one team member each' },
          execution_mode: { type: 'string', description: 'A value listed in sys_choice on the instance; omitted, the instance default' },
          team_name: { type: 'string', description: 'The team\'s name (default: the workflow\'s name)' },
          memory_scope: { type: 'string', description: 'Written only when the instance\'s dictionary has the column' },
        },
        required: ['name', 'description', 'base_plan', 'agent_sys_ids'],
      },
      gate: 'now_assist',
      mutates: true,
      alsoRequires: 'write',
    },
  ];
}

const AI_AGENT_TOOL_NAMES = new Set([
  'snow_ai_ai_agent_add', 'snow_ai_ai_agents_index', 'snow_ai_ai_agent_read', 'snow_ai_agentic_workflow_add',
]);

// ─── Checks: every one a read, every one before the first write ────────────────────────────────────────────────

const refuse = (why: string): never => { throw new ServiceNowError(`${why} Nothing was written.`, 'INVALID_REQUEST'); };
const codeOf = (e: unknown): string => (e instanceof ServiceNowError ? e.code : 'UNKNOWN');

function text(args: Row, key: string, required: boolean): string | undefined {
  const v = args[key];
  if (v === undefined && !required) return undefined;
  if (typeof v !== 'string' || v.trim() === '') return refuse(`${key} must be a non-empty string.`);
  return v;
}

/** The record by sys_id, or a refusal that says whether it is absent or could not be read. */
async function mustExist(client: ServiceNowClient, table: string, sysId: string, what: string): Promise<ServiceNowRecord> {
  if (!SYS_ID.test(sysId)) refuse(`${what} ${JSON.stringify(sysId)} is not a sys_id.`);
  let record: ServiceNowRecord | undefined;
  try {
    record = await client.getRecord(table, sysId);
  } catch (e) {
    if (codeOf(e) !== 'NOT_FOUND') refuse(`${what} ${sysId} could not be read from ${table} (${codeOf(e)}).`);
  }
  // An empty answer is how the REST layer reports "no such record", as a 404 is.
  if (!record || !plain(record.sys_id)) refuse(`${what} ${sysId} is not a ${table} record on this instance.`);
  return record!;
}

/**
 * The execution modes the instance lists for `table`, read from `sys_choice` (the brief: never hard-coded). Read only
 * when the caller passed one; one query per table per call; the values across every language.
 */
async function listedModes(client: ServiceNowClient, table: string): Promise<Set<string>> {
  let rows: ServiceNowRecord[];
  try {
    rows = (await client.queryRecords({ table: 'sys_choice', query: `name=${table}^element=execution_mode^inactive=false`,
      fields: 'value', limit: 100 })).records;
  } catch (e) {
    return refuse(`execution_mode cannot be checked: the choice list could not be read (${codeOf(e)}).`);
  }
  const values = new Set(rows.map((r) => plain(r.value)).filter((v): v is string => Boolean(v)));
  if (values.size === 0) refuse(`execution_mode cannot be checked: no execution_mode choices are listed on this instance for ${table}.`);
  return values;
}

function checkMode(mode: string, listed: Set<string>, table: string): void {
  if (!listed.has(mode)) {
    refuse(`execution_mode ${JSON.stringify(mode)} is not listed on this instance for ${table} (listed: ${[...listed].join(', ')}).`);
  }
}

/** Whether the instance's dictionary has `table.column` — read before a column the corpus does not document is sent. */
async function hasColumn(client: ServiceNowClient, table: string, column: string): Promise<void> {
  let rows: ServiceNowRecord[];
  try {
    rows = (await client.queryRecords({ table: 'sys_dictionary', query: `name=${table}^element=${column}`,
      fields: 'element', limit: 1 })).records;
  } catch (e) {
    return refuse(`${column} cannot be checked: the dictionary could not be read (${codeOf(e)}).`);
  }
  if (rows.length === 0) refuse(`${column} is not a column of ${table} on this instance.`);
}

/** The first record matching `query`, or null. A read after a write: a refusal here is not a write failure. */
async function first(client: ServiceNowClient, table: string, query: string): Promise<ServiceNowRecord | null> {
  const resp = await client.queryRecords({ table, query, limit: 1, orderBy: '-sys_created_on' });
  return resp.records[0] ?? null;
}

/** A failure after the first record: rethrown, naming every record already created. Nothing is deleted. */
function leftBehind(error: unknown, created: Array<{ table: string; sysId: string }>, warnings: Row[], retry: string): ServiceNowError {
  const [head, ...rest] = created;
  const also = rest.length === 0 ? '' : `, as were ${rest.map((c) => `${c.table} ${c.sysId}`).join(', ')}`;
  const readBackNote = warnings.length === 0 ? ''
    : ` The read-back reported ${warnings.map((w) => `${w.code} on ${w.table}.${w.field}`).join(', ')}.`;
  const message = error instanceof Error ? error.message : String(error);
  return new ServiceNowError(`${message} — ${head.table} ${head.sysId} was created, but the call did not finish${also}. `
    + `Read them before trying again, and ${retry}. Nothing was deleted.${readBackNote}`,
  error instanceof ServiceNowError ? error.code : 'CREATE_FAILED', error instanceof ServiceNowError ? error.details : undefined);
}

// ─── snow_ai_ai_agent_add ───────────────────────────────────────────────────────────────────────────────────────

type ToolArg = { tool_sys_id: string; execution_mode?: string; name?: string; display_output?: boolean };

function toolsArg(v: unknown): ToolArg[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) return refuse('tools must be an array.');
  return v.map((t, i) => {
    if (typeof t !== 'object' || t === null) return refuse(`tools[${i}] must be an object.`);
    const o = t as Row;
    if (typeof o.tool_sys_id !== 'string') return refuse(`tools[${i}].tool_sys_id is required.`);
    if (o.execution_mode !== undefined && typeof o.execution_mode !== 'string') refuse(`tools[${i}].execution_mode must be a string.`);
    if (o.name !== undefined && typeof o.name !== 'string') refuse(`tools[${i}].name must be a string.`);
    if (o.display_output !== undefined && typeof o.display_output !== 'boolean') refuse(`tools[${i}].display_output must be true or false.`);
    return o as ToolArg;
  });
}

async function addAgent(client: ServiceNowClient, args: Row): Promise<Row> {
  const name = text(args, 'name', true)!;
  const sent: Row = {
    name, description: text(args, 'description', true), role: text(args, 'role', true),
    instructions: text(args, 'instructions', true),
  };
  for (const key of ['agent_type', 'channel']) {
    const v = text(args, key, false);
    if (v !== undefined) sent[key] = v;
  }
  if (args.active !== undefined && typeof args.active !== 'boolean') refuse('active must be true or false.');
  const tools = toolsArg(args.tools);
  for (const [i, t] of tools.entries()) await mustExist(client, TOOL, t.tool_sys_id, `tools[${i}].tool_sys_id`);
  if (tools.some((t) => t.execution_mode !== undefined)) {
    const listed = await listedModes(client, LINK);
    for (const t of tools) if (t.execution_mode !== undefined) checkMode(t.execution_mode, listed, LINK);
  }

  const agent = await write(client, AGENT, sent, args.active !== false);
  const created = [{ table: AGENT, sysId: agent.sysId }];
  const warnings: Row[] = [...agent.warnings];
  const links: Row[] = [];
  let config: ServiceNowRecord | null;
  let version: ServiceNowRecord | null;
  try {
    config = await first(client, CONFIG, `agent=${agent.sysId}`);
    version = await first(client, VERSION, `target_id=${agent.sysId}`);
    for (const t of tools) {
      const link: Row = { agent: agent.sysId, tool: t.tool_sys_id };
      if (t.name !== undefined) link.name = t.name;
      if (t.execution_mode !== undefined) link.execution_mode = t.execution_mode;
      if (t.display_output !== undefined) link.display_output = t.display_output;
      const done = await write(client, LINK, link, true);
      created.push({ table: LINK, sysId: done.sysId });
      warnings.push(...done.warnings);
      links.push(done.stored);
    }
    if (args.active === false && config) {
      const done = await write(client, CONFIG, { active: false }, false, String(plain(config.sys_id)));
      warnings.push(...done.warnings);
      config = done.stored;
    }
  } catch (error) {
    throw leftBehind(error, created, warnings, 'do not add the agent a second time');
  }
  if (!config) {
    warnings.push({ table: CONFIG, message: `configuration record not found; the agent may be active. No ${CONFIG} row has `
      + `agent=${agent.sysId}, and none was created: read it on the instance${args.active === false ? ', then set active to false' : ''}.` } as Note);
  }
  if (!version) {
    warnings.push({ table: VERSION, message: `version record not found: no ${VERSION} row has target_id=${agent.sysId}, `
      + 'and none was created. Open the agent in AI Agent Studio to see its version.' } as Note);
  }
  const route = agentRoute(agent.sysId);
  return {
    ...(warnings.length > 0 ? { warnings } : {}),
    agent: agent.stored, config, version,
    active: config ? (plain(config.active) ?? 'unknown') : 'unknown',
    tool_links: links,
    access_rules: accessRules(route), studio_route: route, studio_route_note: ROUTE_NOTE,
    summary: `Created AI agent "${name}" (${agent.sysId}) with ${links.length} tool link(s); `
      + (warnings.length === 0 ? 'every record reads back as sent.' : `${warnings.length} warning(s) — see warnings.`)
      + ' It has no access control: configure it in AI Agent Studio before use.',
  };
}

// ─── snow_ai_agentic_workflow_add ───────────────────────────────────────────────────────────────────────────────

async function addWorkflow(client: ServiceNowClient, args: Row): Promise<Row> {
  const name = text(args, 'name', true)!;
  const description = text(args, 'description', true);
  const basePlan = text(args, 'base_plan', true);
  const mode = text(args, 'execution_mode', false);
  const teamName = text(args, 'team_name', false) ?? name;
  const memoryScope = text(args, 'memory_scope', false);
  const agents = args.agent_sys_ids;
  if (!Array.isArray(agents) || agents.length === 0 || agents.some((a) => typeof a !== 'string')) {
    refuse('agent_sys_ids must be a non-empty array of sys_ids.');
  }
  const agentIds = agents as string[];
  for (const [i, id] of agentIds.entries()) await mustExist(client, AGENT, id, `agent_sys_ids[${i}]`);
  if (mode !== undefined) checkMode(mode, await listedModes(client, USECASE), USECASE);
  if (memoryScope !== undefined) await hasColumn(client, MEMBER, 'memory_scope');

  // The team first, so the workflow's insert carries it and nothing is modified afterwards (PN-17).
  const team = await write(client, TEAM, { name: teamName }, true);
  const created = [{ table: TEAM, sysId: team.sysId }];
  const warnings: Row[] = [...team.warnings];
  const members: Row[] = [];
  let workflow: Awaited<ReturnType<typeof write>>;
  let version: ServiceNowRecord | null;
  try {
    const sent: Row = { name, description, base_plan: basePlan, team: team.sysId };
    if (mode !== undefined) sent.execution_mode = mode;
    workflow = await write(client, USECASE, sent, true);
    created.push({ table: USECASE, sysId: workflow.sysId });
    warnings.push(...workflow.warnings);
    for (const agent of agentIds) {
      const member: Row = { team: team.sysId, agent };
      if (memoryScope !== undefined) member.memory_scope = memoryScope;
      const done = await write(client, MEMBER, member, true);
      created.push({ table: MEMBER, sysId: done.sysId });
      warnings.push(...done.warnings);
      members.push(done.stored);
    }
    version = await first(client, VERSION, `target_id=${workflow.sysId}`);
  } catch (error) {
    throw leftBehind(error, created, warnings, 'do not add the workflow a second time');
  }
  if (!version) {
    warnings.push({ table: VERSION, message: `version record not found: no ${VERSION} row has target_id=${workflow.sysId}, `
      + 'and none was created. Open the workflow in AI Agent Studio to see its version.' } as Note);
  }
  const route = workflowRoute(workflow.sysId);
  return {
    ...(warnings.length > 0 ? { warnings } : {}),
    workflow: workflow.stored, team: team.stored, members, version,
    access_rules: accessRules(route), studio_route: route, studio_route_note: ROUTE_NOTE,
    summary: `Created agentic workflow "${name}" (${workflow.sysId}) with team ${team.sysId} and ${members.length} member(s); `
      + (warnings.length === 0 ? 'every record reads back as sent.' : `${warnings.length} warning(s) — see warnings.`)
      + ' It has no access control: configure it in AI Agent Studio before use.',
  };
}

// ─── The reads ──────────────────────────────────────────────────────────────────────────────────────────────────

async function indexAgents(client: ServiceNowClient, args: Row): Promise<Row> {
  const limit = typeof args.limit === 'number' && args.limit > 0 ? args.limit : 25;
  const recordType = args.record_type;
  if (recordType !== undefined && recordType !== '' && !RECORD_TYPES.has(recordType as string)) {
    throw new ServiceNowError('record_type must be custom or template', 'INVALID_REQUEST');
  }
  const query = recordType ? `record_type=${recordType}` : undefined;
  const resp = await client.queryRecords({ table: AGENT, query, limit,
    fields: 'sys_id,name,description,agent_type,record_type,sys_scope,sys_updated_on' });
  const ids = resp.records.map((r) => plain(r.sys_id)).filter((v): v is string => Boolean(v));
  // `active` is the configuration's (PN-17), joined here rather than dot-walked.
  const configs = ids.length === 0 ? [] : (await client.queryRecords({ table: CONFIG, query: `agentIN${ids.join(',')}`,
    fields: 'agent,active', limit: ids.length })).records;
  const activeOf = new Map(configs.map((c) => [plain(c.agent), plain(c.active)]));
  let agents = resp.records.map((r) => ({ ...r, active: activeOf.get(plain(r.sys_id)) ?? 'unknown' }));
  if (args.active !== undefined) agents = agents.filter((a) => a.active === String(args.active));
  return {
    count: agents.length, total: resp.total ?? null, truncated: resp.count >= limit, agents,
  };
}

async function readAgent(client: ServiceNowClient, args: Row): Promise<Row> {
  const sysId = args.sys_id;
  if (typeof sysId !== 'string' || !SYS_ID.test(sysId)) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
  const agent = await client.getRecord(AGENT, sysId);
  if (!plain(agent?.sys_id)) throw new ServiceNowError(`${sysId} is not a ${AGENT} record on this instance`, 'NOT_FOUND');
  const config = await first(client, CONFIG, `agent=${sysId}`);
  const versions = (await client.queryRecords({ table: VERSION, query: `target_id=${sysId}`, limit: 20,
    fields: 'sys_id,version_name,version_number,state,active,sys_created_on' })).records;
  const links = (await client.queryRecords({ table: LINK, query: `agent=${sysId}`, limit: 50,
    fields: 'sys_id,name,tool,execution_mode,active,display_output' })).records;
  const toolIds = [...new Set(links.map((l) => plain(l.tool)).filter((v): v is string => Boolean(v)))];
  const tools = toolIds.length === 0 ? [] : (await client.queryRecords({ table: TOOL, query: `sys_idIN${toolIds.join(',')}`,
    fields: 'sys_id,name,type,target_document_table', limit: toolIds.length })).records;
  const toolOf = new Map(tools.map((t) => [plain(t.sys_id), t]));
  const route = agentRoute(sysId);
  return {
    agent, config, active: config ? (plain(config.active) ?? 'unknown') : 'unknown', versions,
    tool_links: links.map((l) => ({ ...l, tool_record: toolOf.get(plain(l.tool)) ?? null })),
    access_rules: accessNotRead(route), studio_route: route, studio_route_note: ROUTE_NOTE,
  };
}

export async function dispatchAiAgentsAction(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  if (!AI_AGENT_TOOL_NAMES.has(name)) return null;

  switch (name) {
    case 'snow_ai_ai_agent_add':
      requireNowAssist();
      requireWrite();
      return addAgent(client, args);
    case 'snow_ai_ai_agents_index':
      return indexAgents(client, args);
    case 'snow_ai_ai_agent_read':
      return readAgent(client, args);
    case 'snow_ai_agentic_workflow_add':
      requireNowAssist();
      requireWrite();
      return addWorkflow(client, args);
    default:
      return null;
  }
}
