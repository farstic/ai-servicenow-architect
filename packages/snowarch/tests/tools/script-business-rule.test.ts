import { describe, expect, it } from 'vitest';
import { dispatchScriptAction } from '../../src/tools/script.js';
import { FakeRestClient } from '../helpers/fake-rest.js';
import { withPreset } from '../helpers/preset.js';
import { runWithInstance, type Flags, type InstanceRuntime } from '../../src/servicenow/context.js';
import { expandPreset } from '../../src/utils/permissions.js';
import { collectToolCatalog } from '../../src/tools/index.js';

withPreset('pdi-developer');

/**
 * `snow_scr_business_rule_add` omitted the four `action_*` flags entirely.
 *
 * A `sys_script` row created with no action flags fires on nothing. The rule was created, it
 * appeared in the UI list looking exactly like a working rule, and it never ran (field-notes
 * §5). The failure had no error and no symptom other than silence, which is why the flags are
 * now ALWAYS sent rather than sent when supplied.
 */
const REQUIRED = { name: 'Dup check', table: 'incident', when: 'before', script: 'gs.info(1);' };

async function add(over: Record<string, unknown> = {}) {
  const client = new FakeRestClient({ created: { sys_script: { sys_id: 'b1' } } });
  const flags: Flags = expandPreset('pdi-developer');
  const rt: InstanceRuntime = {
    label: 'pdi', url: 'https://dev1.service-now.com', environment: 'pdi', preset: 'pdi-developer',
    flags, effectiveFlags: flags, toolPackage: 'full', maxRecords: 100, prodWriteAck: false,
    client: {} as InstanceRuntime['client'], warnings: [],
  };
  await runWithInstance(rt, () =>
    dispatchScriptAction(client.asClient(), 'snow_scr_business_rule_add', { ...REQUIRED, ...over }));
  return client.calls[0]!.data as Record<string, unknown>;
}

describe('criterion 4 - all four action flags are always in the body', () => {
  it('with no action arguments the defaults are insert/update on, delete/query off', async () => {
    const body = await add();
    expect(body.action_insert).toBe(true);
    expect(body.action_update).toBe(true);
    expect(body.action_delete).toBe(false);
    expect(body.action_query).toBe(false);
  });

  it('they are booleans, not the strings ServiceNow would coerce', async () => {
    const body = await add();
    for (const k of ['action_insert', 'action_update', 'action_delete', 'action_query']) {
      expect(typeof body[k], k).toBe('boolean');
    }
  });

  it('an explicit false is honoured, not overwritten by the default', async () => {
    // The bug a `||` default would introduce: `args.action_update || true` is always true.
    const body = await add({ action_update: false });
    expect(body.action_update).toBe(false);
    expect(body.action_insert).toBe(true);
  });

  it('an explicit true on a normally-false flag is honoured too', async () => {
    const body = await add({ action_delete: true, action_query: true });
    expect(body.action_delete).toBe(true);
    expect(body.action_query).toBe(true);
  });

  it('a non-boolean argument falls back to the default rather than being sent through', async () => {
    // `action_delete: "true"` from a loosely-typed caller must not reach the platform as a
    // string, and must not be read as truthy either — the schema says boolean.
    const body = await add({ action_delete: 'true', action_insert: 'false' });
    expect(body.action_delete).toBe(false);
    expect(body.action_insert).toBe(true);
  });

  it('the rest of the payload is unchanged', async () => {
    const body = await add({ condition: 'current.active', order: 250, active: false });
    expect(body.name).toBe('Dup check');
    expect(body.collection).toBe('incident');
    expect(body.when).toBe('before');
    expect(body.condition).toBe('current.active');
    expect(body.order).toBe(250);
    expect(body.active).toBe(false);
  });
});

describe('the schema and description state the defaults', () => {
  const tool = collectToolCatalog().find((t) => t.name === 'snow_scr_business_rule_add')!;

  it('all four flags are declared as booleans', () => {
    const props = (tool.inputSchema as { properties: Record<string, { type: string }> }).properties;
    for (const k of ['action_insert', 'action_update', 'action_delete', 'action_query']) {
      expect(props[k], k).toBeDefined();
      expect(props[k]!.type, k).toBe('boolean');
    }
  });

  it('none of them is required — the defaults are the point', () => {
    expect((tool.inputSchema as { required: string[] }).required)
      .toEqual(['name', 'table', 'when', 'script']);
  });

  it('the description says what happens when they are omitted', () => {
    expect(tool.description).toContain('action_insert true');
    expect(tool.description).toContain('action_delete false');
  });
});

describe('the modify path is untouched', () => {
  it('business_rule_modify still passes `fields` through verbatim', async () => {
    // It takes an explicit field map, so defaulting anything there would silently re-enable a
    // flag the caller had deliberately turned off in the UI.
    const client = new FakeRestClient();
    const flags: Flags = expandPreset('pdi-developer');
    const rt: InstanceRuntime = {
      label: 'pdi', url: 'https://dev1.service-now.com', environment: 'pdi', preset: 'pdi-developer',
      flags, effectiveFlags: flags, toolPackage: 'full', maxRecords: 100, prodWriteAck: false,
      client: {} as InstanceRuntime['client'], warnings: [],
    };
    await runWithInstance(rt, () => dispatchScriptAction(client.asClient(),
      'snow_scr_business_rule_modify', { sys_id: 'b1', fields: { active: false } }));
    expect(client.calls[0]!.data).toEqual({ active: false });
  });
});
