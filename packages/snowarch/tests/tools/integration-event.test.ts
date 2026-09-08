import { describe, expect, it } from 'vitest';
import { dispatchIntegrationAction } from '../../src/tools/integration.js';
import { FakeRestClient } from '../helpers/fake-rest.js';
import { withPreset } from '../helpers/preset.js';
import { runWithInstance, type Flags, type InstanceRuntime } from '../../src/servicenow/context.js';
import { expandPreset } from '../../src/utils/permissions.js';
import { collectToolCatalog } from '../../src/tools/index.js';

withPreset('pdi-developer');

/**
 * `snow_intg_event_register` wrote `{ name, table, description }`.
 *
 * `sysevent_register`'s matching key is `event_name`; `name` exists as a column but is not what
 * the platform matches on, so the row registered nothing usable and read back with an empty
 * `event_name` (field-notes §4). Nothing errored — a caller saw a created record with a sys_id
 * and every reason to believe the event was registered.
 *
 * Asserted on the POST BODY, which is where the whole defect lived. A test on the return value
 * would have passed before the fix and after it.
 */
async function register(args: Record<string, unknown>) {
  const client = new FakeRestClient({ created: { sysevent_register: { sys_id: 'e1' } } });
  const flags: Flags = expandPreset('pdi-developer');
  const rt: InstanceRuntime = {
    label: 'pdi', url: 'https://dev1.service-now.com', environment: 'pdi', preset: 'pdi-developer',
    flags, effectiveFlags: flags, toolPackage: 'full', maxRecords: 100, prodWriteAck: false,
    client: {} as InstanceRuntime['client'], warnings: [],
  };
  const result = await runWithInstance(rt, () =>
    dispatchIntegrationAction(client.asClient(), 'snow_intg_event_register', args));
  return { body: client.calls[0]?.data ?? {}, sequence: client.sequence, result: result as Record<string, unknown> };
}

describe('criterion 3 - the POST body carries event_name and a derived suffix', () => {
  it('a dotted name splits into event_name and suffix', async () => {
    const { body, sequence } = await register({ name: 'duplicate.incident.detected', table: 'incident' });
    expect(sequence).toEqual(['create sysevent_register']);
    expect(body.event_name).toBe('duplicate.incident.detected');
    expect(body.suffix).toBe('incident.detected');
    expect(body.table).toBe('incident');
  });

  it('the `name` column is no longer sent at all', async () => {
    // Not merely "event_name is also present": sending both would leave the same ambiguity
    // that made the original bug invisible.
    const { body } = await register({ name: 'duplicate.incident.detected', table: 'incident' });
    expect(Object.keys(body).sort())
      .toEqual(['description', 'event_name', 'fired_by', 'suffix', 'table']);
  });

  it('a single-segment name gets an EMPTY suffix, not the whole name', async () => {
    // The tempting fallback. `x.split('.').slice(1).join('.')` is '' here, and empty is what
    // the UI produces — a suffix equal to the name would register a second, wrong key.
    const { body } = await register({ name: 'myevent', table: 'incident' });
    expect(body.event_name).toBe('myevent');
    expect(body.suffix).toBe('');
  });

  it('description and fired_by pass through, defaulting to empty strings', async () => {
    const withBoth = await register({
      name: 'a.b', table: 'incident', description: 'why', fired_by: 'Business Rule: Dup detection',
    });
    expect(withBoth.body.description).toBe('why');
    expect(withBoth.body.fired_by).toBe('Business Rule: Dup detection');

    const without = await register({ name: 'a.b', table: 'incident' });
    expect(without.body.description).toBe('');
    expect(without.body.fired_by).toBe('');
  });

  it('the response echoes event_name', async () => {
    const { result } = await register({ name: 'a.b.c', table: 'incident' });
    expect(result.event_name).toBe('a.b.c');
    expect(result.sys_id).toBe('e1');
  });

  it('name and table are still required, before any request', async () => {
    const client = new FakeRestClient();
    const flags: Flags = expandPreset('pdi-developer');
    const rt: InstanceRuntime = {
      label: 'pdi', url: 'https://dev1.service-now.com', environment: 'pdi', preset: 'pdi-developer',
      flags, effectiveFlags: flags, toolPackage: 'full', maxRecords: 100, prodWriteAck: false,
      client: {} as InstanceRuntime['client'], warnings: [],
    };
    await expect(runWithInstance(rt, () =>
      dispatchIntegrationAction(client.asClient(), 'snow_intg_event_register', { name: 'a.b' })))
      .rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(client.sequence).toEqual([]);
  });
});

describe('it is declared as the write it is', () => {
  it('mutates: true — it creates a sysevent_register row', () => {
    // It was `mutates: false`, which kept it out of the generated §2.1 ask-list: a write that
    // never prompted. The gate was right all along; the label was not.
    const tool = collectToolCatalog().find((t) => t.name === 'snow_intg_event_register')!;
    expect(tool.mutates).toBe(true);
    expect(tool.gate).toBe('scripting');
  });
});
