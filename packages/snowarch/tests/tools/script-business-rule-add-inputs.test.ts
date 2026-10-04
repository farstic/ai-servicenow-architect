import { describe, expect, it } from 'vitest';
import { dispatchScriptAction } from '../../src/tools/script.js';
import { FakeRestClient } from '../helpers/fake-rest.js';
import { withPreset } from '../helpers/preset.js';
import { runWithInstance, type Flags, type InstanceRuntime } from '../../src/servicenow/context.js';
import { expandPreset } from '../../src/utils/permissions.js';
import { collectToolCatalog } from '../../src/tools/index.js';

withPreset('pdi-developer');

/**
 * ARC-09-C103 - `snow_scr_business_rule_add` refuses the two inputs it used to guess at.
 *
 * `order: args.order || 100` turned an `order` of 0 into 100 - a rule meant to run first ran at the
 * default - and passed `"abc"` through to the platform. `when` was only checked for being present, so
 * "beefore" went to the platform as it stood. Both are refused HERE, before any write, naming the
 * input and what is accepted, because a rule created with the wrong `when` or `order` exists, is
 * active, and fires in the wrong place.
 *
 * Grounding: the four `when` values and "a number indicating the sequence ... from lowest to highest"
 * are printed in vendor/ServiceNowDocs/markdown/api-reference/business-rules-classic/c_BusinessRules.md.
 * That the column holds a whole number is not printed there; a fractional order is refused as well,
 * because sending one to an integer column would be cut or rounded without a word (the C93 class).
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

/** Run the add; return the client (what was written) and the error if it was refused. */
async function add(over: Record<string, unknown> = {}) {
  const client = new FakeRestClient({ created: { sys_script: { sys_id: 'b1', advanced: 'true' } } });
  let error: unknown;
  try {
    await runWithInstance(runtime(), () =>
      dispatchScriptAction(client.asClient(), 'snow_scr_business_rule_add', { ...REQUIRED, ...over }));
  } catch (e) { error = e; }
  return { client, error };
}

const sent = async (over: Record<string, unknown> = {}) => {
  const { client, error } = await add(over);
  expect(error).toBeUndefined();
  return client.calls[0]!.data as Record<string, unknown>;
};

describe('ARC-09-C103 - order', () => {
  it('0 is an order, not "not given": it is sent as 0', async () => {
    expect((await sent({ order: 0 })).order).toBe(0);
  });

  it('absent or null means the default of 100, and a given number is sent as it is', async () => {
    expect((await sent()).order).toBe(100);
    expect((await sent({ order: null })).order).toBe(100);
    expect((await sent({ order: 250 })).order).toBe(250);
    expect((await sent({ order: -5 })).order).toBe(-5);
  });

  it.each([
    ['a word', 'abc'],
    ['a numeric string', '50'],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['a fraction', 2.5],
    ['a boolean', true],
    ['an object', {}],
    ['an array', [100]],
  ])('refuses %s before any write', async (_label, order) => {
    const { client, error } = await add({ order });
    expect(error).toMatchObject({ code: 'INVALID_REQUEST' });
    expect(String((error as Error).message)).toMatch(/order must be a whole number/);
    expect(client.sequence).toEqual([]);
  });
});

describe('ARC-09-C103 - when', () => {
  it.each(['before', 'after', 'async', 'display'])('%s is sent as given', async (when) => {
    expect((await sent({ when })).when).toBe(when);
  });

  it.each([
    ['a misspelling', 'beefore'],
    ['a different case', 'Before'],
    ['upper case', 'ASYNC'],
    ['a platform event name', 'on_insert'],
    ['a number', 7],
    ['a padded value', ' before'],
  ])('refuses %s before any write, and names the four it accepts', async (_label, when) => {
    const { client, error } = await add({ when });
    expect(error).toMatchObject({ code: 'INVALID_REQUEST' });
    expect(String((error as Error).message)).toMatch(/when must be one of "before", "after", "async" or "display"/);
    expect(client.sequence).toEqual([]);
  });

  it('a long wrong value is not echoed whole', async () => {
    const { error } = await add({ when: 'x'.repeat(500) });
    expect(String((error as Error).message).length).toBeLessThan(200);
  });
});

describe('ARC-09-C103 - the schema says what the handler enforces', () => {
  it('declares the four when values and a whole-number order', () => {
    const tool = collectToolCatalog().find((t) => t.name === 'snow_scr_business_rule_add')!;
    const props = (tool.inputSchema as { properties: Record<string, Record<string, unknown>> }).properties;
    expect(props.when!.enum).toEqual(['before', 'after', 'async', 'display']);
    expect(props.order!.type).toBe('integer');
    expect(String(props.order!.description)).toMatch(/0 is a valid order/);
  });
});
