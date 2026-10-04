import { describe, expect, it } from 'vitest';
import { dispatchScriptAction } from '../../src/tools/script.js';
import { FakeRestClient } from '../helpers/fake-rest.js';
import { withPreset } from '../helpers/preset.js';
import { runWithInstance, type Flags, type InstanceRuntime } from '../../src/servicenow/context.js';
import { expandPreset } from '../../src/utils/permissions.js';
import { collectToolCatalog } from '../../src/tools/index.js';

withPreset('pdi-developer');

/**
 * ARC-09-C92 — a Business Rule is ONE write.
 *
 * The owner's live test (finding R3) needed two: `snow_scr_business_rule_add` took neither
 * `filter_condition` nor `advanced`, so a rule that was meant to carry a filter and run its script
 * had to be created without them, left sitting inactive so it could not fire on every row of its
 * table, and then patched with `snow_scr_business_rule_modify`. The tool takes all three of
 * `filter_condition`, `advanced` and `active` now, so the rule is complete the moment it exists.
 *
 * `active` was already accepted when this row was opened (see `script-business-rule.test.ts`); what
 * was missing is the other two, and the case that matters is all three together in a SINGLE create.
 */
const REQUIRED = { name: 'Dup check', table: 'incident', when: 'before', script: 'gs.info(1);' };

function runtime(): InstanceRuntime {
  const flags: Flags = expandPreset('pdi-developer');
  return {
    label: 'pdi', url: 'https://dev1.service-now.com', environment: 'pdi', preset: 'pdi-developer',
    flags, effectiveFlags: flags, toolPackage: 'full', maxRecords: 100, prodWriteAck: false,
    client: {} as InstanceRuntime['client'], warnings: [],
  };
}

async function addVia(over: Record<string, unknown> = {}) {
  const client = new FakeRestClient({ created: { sys_script: { sys_id: 'b1' } } });
  await runWithInstance(runtime(), () =>
    dispatchScriptAction(client.asClient(), 'snow_scr_business_rule_add', { ...REQUIRED, ...over }));
  return client;
}

const body = async (over: Record<string, unknown> = {}) =>
  (await addVia(over)).calls[0]!.data as Record<string, unknown>;

describe('ARC-09-C92 - the whole rule is in one create', () => {
  it('filter_condition, advanced and active go in the same POST, and nothing follows it', async () => {
    const client = await addVia({
      filter_condition: 'priority=1^state=2', advanced: true, active: true,
      condition: 'current.short_description.changes()',
    });
    // The point of the row, as a sequence: one write, and no PATCH to complete it.
    expect(client.sequence).toEqual(['create sys_script']);
    const data = client.calls[0]!.data as Record<string, unknown>;
    expect(data.filter_condition).toBe('priority=1^state=2');
    expect(data.advanced).toBe(true);
    expect(data.active).toBe(true);
    expect(data.condition).toBe('current.short_description.changes()');
  });

  it('a rule created inactive is still one write — the caller chooses, not the tool', async () => {
    const client = await addVia({ filter_condition: 'priority=1', advanced: true, active: false });
    expect(client.sequence).toEqual(['create sys_script']);
    const data = client.calls[0]!.data as Record<string, unknown>;
    // All three, not just `active`: an inactive rule that still lacks its filter and its Advanced
    // switch is exactly the half-built state this row exists to remove.
    expect(data.active).toBe(false);
    expect(data.filter_condition).toBe('priority=1');
    expect(data.advanced).toBe(true);
  });
});

describe('ARC-09-C92 - filter_condition', () => {
  it('is sent as given', async () => {
    expect((await body({ filter_condition: 'active=true^priority<3' })).filter_condition)
      .toBe('active=true^priority<3');
  });

  it('is not sent at all when it was not given, so the platform default stands', async () => {
    const data = await body();
    expect(Object.prototype.hasOwnProperty.call(data, 'filter_condition')).toBe(false);
  });

  it('an empty string is "not given" — there is nothing to clear on a create', async () => {
    const data = await body({ filter_condition: '' });
    expect(Object.prototype.hasOwnProperty.call(data, 'filter_condition')).toBe(false);
  });

  it.each([[5], [true], [{ q: 'priority=1' }], [['priority=1']]])(
    'a non-string (%j) is refused before any write, because dropping it would create an unconditioned rule',
    async (bad) => {
      const client = new FakeRestClient({ created: { sys_script: { sys_id: 'b1' } } });
      await expect(runWithInstance(runtime(), () =>
        dispatchScriptAction(client.asClient(), 'snow_scr_business_rule_add',
          { ...REQUIRED, filter_condition: bad })))
        .rejects.toMatchObject({ code: 'INVALID_REQUEST', message: expect.stringContaining('filter_condition') });
      expect(client.calls).toHaveLength(0);
    });
});

describe('ARC-09-C92 - advanced', () => {
  it('defaults to true: the tool requires a script, and the script lives in the Advanced section', async () => {
    expect((await body()).advanced).toBe(true);
  });

  it('an explicit false is honoured, not overwritten by the default', async () => {
    // The bug a `||` default would introduce: `args.advanced || true` is always true.
    expect((await body({ advanced: false })).advanced).toBe(false);
  });

  it('is always a boolean in the body, and a non-boolean falls back to the default', async () => {
    expect((await body({ advanced: 'false' })).advanced).toBe(true);
    expect(typeof (await body()).advanced).toBe('boolean');
  });
});

describe('ARC-09-C92 - what did not change', () => {
  it('the four action flags, the order and the defaults are still in the body', async () => {
    const data = await body();
    expect(data).toMatchObject({
      action_insert: true, action_update: true, action_delete: false, action_query: false,
      active: true, order: 100, collection: 'incident', when: 'before', name: 'Dup check',
    });
  });
});

describe('ARC-09-C92 - the schema and description say so', () => {
  const tool = collectToolCatalog().find((t) => t.name === 'snow_scr_business_rule_add')!;
  const props = (tool.inputSchema as { properties: Record<string, { type: string; description: string }> }).properties;

  it('filter_condition is a string, advanced and active are booleans', () => {
    expect(props.filter_condition?.type).toBe('string');
    expect(props.advanced?.type).toBe('boolean');
    expect(props.active?.type).toBe('boolean');
  });

  it('none of the three is required — the required set is exactly what it was', () => {
    expect((tool.inputSchema as { required: string[] }).required).toEqual(['name', 'table', 'when', 'script']);
  });

  it('filter_condition is described as an encoded query, distinct from the condition script', () => {
    expect(props.filter_condition!.description.toLowerCase()).toContain('encoded query');
    expect(props.condition!.description.toLowerCase()).toContain('script');
  });

  it('the description states the new default and that a rule is one write', () => {
    expect(tool.description).toContain('advanced true');
    expect(tool.description.toLowerCase()).toContain('one write');
    // ...and keeps what the action-flag fix put there.
    expect(tool.description).toContain('action_insert true');
  });
});
