import { describe, expect, it } from 'vitest';
import { collectToolCatalog, routeToolInvocation } from '../../src/tools/index.js';
import { dispatchWorkspaceAction } from '../../src/tools/workspace.js';
import { FakeRestClient } from '../helpers/fake-rest.js';
import { withPreset } from '../helpers/preset.js';
import type { ServiceNowError } from '../../src/utils/errors.js';

withPreset('pdi-developer');

/**
 * ARC-09-C121 — an argument a tool does not declare is refused, not dropped.
 *
 * The server passed `arguments` to the router unchecked, and every handler read only the names it knew, so an
 * undeclared argument vanished and the caller believed it had acted. Seen live on rc.3:
 * `snow_atf_atf_tests_index { "query": "name=Jasmine Successful Test" }` answered the 20 active tests. Measured
 * on the 399 schemas: none was closed, and one undeclared `active: false` on eight create tools made a live
 * record — the worst a scheduled report that mails its recipients.
 *
 * One check in the router refuses the argument before any request; every schema says
 * `additionalProperties: false`, so a caller can see it too; an object argument that declares its own properties
 * is checked one level down, and a map (an object that declares none) stays open. ARC-04-S08 ignored a per-call
 * `instance` silently; it is refused too, with its own message, because a write the caller believes goes to
 * another instance would land on this one.
 */

type Schema = { type?: string; properties?: Record<string, Schema>; additionalProperties?: unknown };

const SYS = 'a'.repeat(32);

async function attempt(name: string, args: Record<string, unknown>, client = new FakeRestClient()) {
  const error = await routeToolInvocation(client.asClient(), name, args)
    .then(() => undefined, (e: ServiceNowError) => e);
  return { error, client };
}

describe('ARC-09-C121 — every schema says it takes nothing else', () => {
  it('all 399 tools declare additionalProperties: false, and so does an object argument that declares its own properties', () => {
    const tools = collectToolCatalog();
    expect(tools).toHaveLength(399);
    const open: string[] = [];
    for (const t of tools) {
      const schema = t.inputSchema as Schema;
      if (schema.additionalProperties !== false) open.push(t.name);
      for (const [key, prop] of Object.entries(schema.properties ?? {})) {
        if (prop.type === 'object' && prop.properties && prop.additionalProperties !== false) open.push(`${t.name}.${key}`);
      }
    }
    expect(open).toEqual([]);
  });

  it('an object argument that declares no properties is a map, and stays open', () => {
    const tool = collectToolCatalog().find((t) => t.name === 'snow_core_record_add')!;
    const fields = (tool.inputSchema as Schema).properties!.fields!;
    expect(fields.type).toBe('object');
    expect(fields.additionalProperties).not.toBe(false);
  });
});

describe('ARC-09-C121 — the router refuses an undeclared argument before any request', () => {
  it('a mutating tool: an undeclared `active: false` is refused, and nothing is sent', async () => {
    const { error, client } = await attempt('snow_rpt_scheduled_report_add',
      { report_id: SYS, frequency: 'weekly', recipients: 'ops', active: false });

    expect(error?.code).toBe('INVALID_REQUEST');
    expect(error?.message).toContain('takes no `active`');
    expect(error?.message).toContain('it takes report_id, frequency, recipients, day_of_week, day_of_month, format');
    expect(client.calls).toEqual([]);
  });

  it('a read tool: the rc.3 call, `query` on the tests index, is refused by name', async () => {
    const { error, client } = await attempt('snow_atf_atf_tests_index', { query: 'name=Jasmine Successful Test' });

    expect(error?.code).toBe('INVALID_REQUEST');
    expect(error?.message).toBe(
      'snow_atf_atf_tests_index takes no `query`; it takes suite_sys_id, active, limit. Nothing was sent.');
    expect(client.calls).toEqual([]);
  });

  it('declared arguments still pass', async () => {
    const { error, client } = await attempt('snow_atf_atf_tests_index', { active: true, limit: 5 });

    expect(error).toBeUndefined();
    expect(client.sequence).toEqual(['query sys_atf_test:active=true']);
  });

  it('a per-call `instance` is refused with its own message, naming this instance and the switch tool', async () => {
    const { error, client } = await attempt('snow_atf_atf_tests_index', { instance: 'prod', active: true });

    expect(error?.code).toBe('INVALID_REQUEST');
    expect(error?.message).toContain('No tool takes `instance`');
    expect(error?.message).toContain('"test"');            // the label tests/setup.ts enters
    expect(error?.message).toContain('snow_core_instance_switch');
    expect(client.calls).toEqual([]);
  });

  it('an object argument that declares its properties is checked one level down', async () => {
    const { error } = await attempt('snow_orch_playbook_exec',
      { playbook: { name: 'p', description: 'd', steps: [], owner: 'x' } });

    expect(error?.code).toBe('INVALID_REQUEST');
    expect(error?.message).toContain('takes no `playbook.owner`');
  });

  it('a map is not checked: any column goes through `fields`', async () => {
    const { error, client } = await attempt('snow_core_record_add', { table: 'incident', fields: { u_anything: 'x' } });

    expect(error).toBeUndefined();
    expect(client.calls.filter((c) => c.op === 'create')).toHaveLength(1);
  });

  it('a tool that needs no instance is checked too, before it runs', async () => {
    const error = await routeToolInvocation(null as never, 'snow_core_capabilities_read', { verbose: true })
      .then(() => undefined, (e: ServiceNowError) => e);

    expect(error?.code).toBe('INVALID_REQUEST');
    expect(error?.message).toBe('snow_core_capabilities_read takes no `verbose`; it takes no arguments. Nothing was sent.');
  });
});

describe('ARC-09-C121 — the two UI Builder modify tools write only what they declare', () => {
  it.each([
    ['snow_ws_uib_page_modify', 'sys_ux_page', { title: 'T' }],
    ['snow_ws_uib_component_modify', 'sys_ux_macroponent', { label: 'L' }],
  ])('%s: a declared field is written alone', async (name, table, fields) => {
    const { error, client } = await attempt(name, { sys_id: SYS, ...fields });

    expect(error).toBeUndefined();
    const update = client.calls.find((c) => c.op === 'update')!;
    expect(update.table).toBe(table);
    expect(update.data).toEqual(fields);
  });

  it.each([['snow_ws_uib_page_modify'], ['snow_ws_uib_component_modify']])(
    '%s: an undeclared field is refused before any request', async (name) => {
      const { error, client } = await attempt(name, { sys_id: SYS, active: false });

      expect(error?.code).toBe('INVALID_REQUEST');
      expect(client.calls).toEqual([]);
    });

  it.each([
    ['snow_ws_uib_page_modify', { title: 'T' }],
    ['snow_ws_uib_component_modify', { label: 'L' }],
  ])('%s: past the router, the handler still writes only its declared fields', async (name, fields) => {
    const client = new FakeRestClient();
    await dispatchWorkspaceAction(client.asClient(), name, { sys_id: SYS, ...fields, active: false });

    expect(client.calls.find((c) => c.op === 'update')!.data).toEqual(fields);
  });
});
