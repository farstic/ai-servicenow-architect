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

  it.each([[''], [' '], ['\n'], ['\t  \r\n']])(
    'a blank string (%j) is "not given" — there is nothing to clear on a create, and a blank condition is not a filter',
    async (blank) => {
      const data = await body({ filter_condition: blank });
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

  it('is always a boolean in the body when it is sent', async () => {
    expect(typeof (await body()).advanced).toBe('boolean');
    expect(typeof (await body({ advanced: null })).advanced).toBe('boolean');
  });
});

describe('ARC-09-C92 - active and advanced are booleans or they are refused', () => {
  // The server does not validate arguments against the input schema, so a client can send the
  // STRING "false". Treating it as "not given" created a LIVE rule when the caller asked for an
  // inactive one — the half-built state this row exists to remove, in its worst form.
  const refused: Array<[unknown]> = [['false'], ['true'], [0], [1], ['no'], [{}], [[]]];

  it.each(refused)('active: %j is refused before any write', async (bad) => {
    const client = new FakeRestClient({ created: { sys_script: { sys_id: 'b1' } } });
    await expect(runWithInstance(runtime(), () =>
      dispatchScriptAction(client.asClient(), 'snow_scr_business_rule_add', { ...REQUIRED, active: bad })))
      .rejects.toMatchObject({ code: 'INVALID_REQUEST', message: expect.stringContaining('active must be true or false') });
    expect(client.calls).toHaveLength(0);
  });

  it.each(refused)('advanced: %j is refused before any write', async (bad) => {
    const client = new FakeRestClient({ created: { sys_script: { sys_id: 'b1' } } });
    await expect(runWithInstance(runtime(), () =>
      dispatchScriptAction(client.asClient(), 'snow_scr_business_rule_add', { ...REQUIRED, advanced: bad })))
      .rejects.toMatchObject({ code: 'INVALID_REQUEST', message: expect.stringContaining('advanced must be true or false') });
    expect(client.calls).toHaveLength(0);
  });

  it('null and undefined are "not given": the defaults stand', async () => {
    const a = await body({ active: null, advanced: null });
    expect(a).toMatchObject({ active: true, advanced: true });
    const b = await body({ active: undefined, advanced: undefined });
    expect(b).toMatchObject({ active: true, advanced: true });
  });

  it('a real false for each is honoured', async () => {
    expect(await body({ active: false, advanced: false })).toMatchObject({ active: false, advanced: false });
  });
});

describe('ARC-09-C92 - the one write is checked against what came back', () => {
  /** The platform's answer, built from what was SENT unless the test says otherwise. */
  async function addWith(stored: Record<string, unknown>, over: Record<string, unknown> = {}) {
    const client = new FakeRestClient({ created: { sys_script: { sys_id: 'b1', name: 'Dup check', ...stored } } });
    const result = await runWithInstance(runtime(), () =>
      dispatchScriptAction(client.asClient(), 'snow_scr_business_rule_add',
        { ...REQUIRED, filter_condition: 'priority=1^state=2', ...over }));
    return result as { warnings?: Array<Record<string, unknown> & { message: string }>; note?: string };
  }
  const WHOLE = { filter_condition: 'priority=1^state=2', advanced: 'true', active: 'true' };

  it('says nothing when the record shows the filter and the Advanced switch', async () => {
    const r = await addWith(WHOLE);
    expect(Object.prototype.hasOwnProperty.call(r, 'warnings')).toBe(false);
  });

  it('a platform that appends to the filter (for example "^EQ") is not a mismatch: the filter is there', async () => {
    const r = await addWith({ ...WHOLE, filter_condition: 'priority=1^state=2^EQ' });
    expect(Object.prototype.hasOwnProperty.call(r, 'warnings')).toBe(false);
  });

  it.each([
    ['the response has no filter_condition at all', { advanced: 'true' }],
    ['the response has an empty filter_condition', { advanced: 'true', filter_condition: '' }],
  ])('FIELD_NOT_STORED for the filter when %s - the rule exists and is not filtered', async (_l, stored) => {
    const r = await addWith(stored);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings![0]).toMatchObject({ code: 'FIELD_NOT_STORED', table: 'sys_script', sys_id: 'b1', field: 'filter_condition' });
    expect(r.warnings![0]!.message).toMatch(/not filtered|every matching operation|no filter/i);
    expect(r.warnings![0]!.message).toMatch(/modify/);
  });

  it.each([
    ['absent', {}], ['"false"', { advanced: 'false' }], ['empty', { advanced: '' }],
  ])('FIELD_NOT_STORED for advanced when the response has it %s and true was sent', async (_l, extra) => {
    const r = await addWith({ filter_condition: 'priority=1^state=2', ...extra });
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings![0]).toMatchObject({ code: 'FIELD_NOT_STORED', field: 'advanced' });
  });

  it('both missing is two warnings, filter first', async () => {
    const r = await addWith({});
    expect(r.warnings!.map((w) => w.field)).toEqual(['filter_condition', 'advanced']);
  });

  it('nothing is checked that was not sent: no filter given, no filter warning', async () => {
    const r = await addWith({ advanced: 'true' }, { filter_condition: undefined });
    expect(Object.prototype.hasOwnProperty.call(r, 'warnings')).toBe(false);
  });

  it('advanced: false was sent, so a stored "false" is the answer asked for', async () => {
    const r = await addWith({ filter_condition: 'priority=1^state=2', advanced: 'false' }, { advanced: false });
    expect(Object.prototype.hasOwnProperty.call(r, 'warnings')).toBe(false);
  });

  it('a boolean true in the response is as good as the string', async () => {
    const r = await addWith({ filter_condition: 'priority=1^state=2', advanced: true });
    expect(Object.prototype.hasOwnProperty.call(r, 'warnings')).toBe(false);
  });

  it('advanced: false is honoured, and the result says what is not known about it', async () => {
    const r = await addWith({ filter_condition: 'priority=1^state=2', advanced: 'false' }, { advanced: false });
    expect(r.note).toMatch(/advanced is false/);
    expect(r.note).toMatch(/not documented in the bundled corpus/);
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

  it('filter_condition and advanced carry the corpus marker for what the corpus does not print', () => {
    // The column names `filter_condition` and `advanced` are not printed in the bundled corpus; the
    // form's labels ("Filter Conditions", "Advanced") are. A reader is told which is which.
    expect(props.filter_condition!.description).toMatch(/not documented in the bundled corpus/);
    expect(props.advanced!.description).toMatch(/not documented in the bundled corpus/);
  });

  it('filter_condition says change-based tests are a script matter and their encoded spelling is not known', () => {
    expect(props.filter_condition!.description).toContain('changesTo');
  });

  it('the description tells the caller where a cut value is reported', () => {
    expect(tool.description).toContain('warnings');
  });

  it('the modify tool names the two fields it did not before, and which is a script', () => {
    const modify = collectToolCatalog().find((t) => t.name === 'snow_scr_business_rule_modify')!;
    const fields = (modify.inputSchema as { properties: { fields: { description: string } } }).properties.fields.description;
    expect(fields).toContain('filter_condition');
    expect(fields).toContain('advanced');
    expect(fields).toMatch(/condition \[a script\]/);
  });

  it('the description states the new default and that a rule is one write', () => {
    expect(tool.description).toContain('advanced true');
    expect(tool.description.toLowerCase()).toContain('one write');
    // ...and keeps what the action-flag fix put there.
    expect(tool.description).toContain('action_insert true');
  });
});
