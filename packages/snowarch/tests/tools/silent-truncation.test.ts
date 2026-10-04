import { describe, expect, it } from 'vitest';
import { routeToolInvocation } from '../../src/tools/index.js';
import { FakeRestClient, type FakeRestOptions } from '../helpers/fake-rest.js';
import { withPreset } from '../helpers/preset.js';
import { runWithInstance, type Flags, type InstanceRuntime } from '../../src/servicenow/context.js';
import { expandPreset } from '../../src/utils/permissions.js';

withPreset('pdi-developer');

/**
 * ARC-09-C93 — a value longer than its column is never cut SILENTLY.
 *
 * The owner's live test (finding R4) created a Business Rule whose name was longer than 40
 * characters. The platform stored the first 40, answered 201, and the tool reported
 * "Created business rule <the long name>" — built from the argument, so the report agreed with the
 * request and not with the record. `docs/PLATFORM-NOTES.md` PN-07 records the same thing for
 * `sys_script_fix.name`: no error, the cut value echoed in the response, and a `sys_name` that is
 * wrong everywhere it is displayed.
 *
 * WHAT THE WRITE PATH ALREADY HAS. `createRecord` and `updateRecord` return the platform's own
 * `result`, which is the stored record. Nothing compared it with what was sent. These tests drive
 * `routeToolInvocation` — the one funnel every tool passes through — with a platform that stores a
 * cut value, and require that the cut is REPORTED, with the column's limit, in the result the caller
 * reads. The cases that must NOT warn are as important as the ones that must: a warning raised for a
 * decimal that lost its trailing zero teaches the reader to ignore the warning that matters.
 */
function runtime(): InstanceRuntime {
  const flags: Flags = expandPreset('pdi-developer');
  return {
    label: 'pdi', url: 'https://dev1.service-now.com', environment: 'pdi', preset: 'pdi-developer',
    flags, effectiveFlags: flags, toolPackage: 'full', maxRecords: 100, prodWriteAck: false,
    client: {} as InstanceRuntime['client'], warnings: [],
  };
}

async function call(tool: string, args: Record<string, unknown>, opts: FakeRestOptions = {}) {
  const client = new FakeRestClient(opts);
  const result = await runWithInstance(runtime(), () => routeToolInvocation(client.asClient(), tool, args));
  return { client, result: result as Record<string, any> };
}

const SENT = 'Close every task still open when the parent incident closes';
const LIMIT = 40;
const CUT = SENT.slice(0, LIMIT);
const DICT_NAME = (table: string, field: string) => `sys_dictionary?name=${table}^element=${field}`;
const BR = { name: SENT, table: 'incident', when: 'before', script: 'gs.info(1);' };

describe('the fixture is what it claims to be', () => {
  it('the name is longer than the column, and the cut is a prefix of it', () => {
    expect(SENT.length).toBeGreaterThan(LIMIT);
    expect(CUT).toHaveLength(LIMIT);
    expect(SENT.startsWith(CUT)).toBe(true);
  });
});

describe('ARC-09-C93 - a Business Rule name cut by the platform is reported with the limit', () => {
  const cut = { created: { sys_script: { sys_id: 'b1', name: CUT, collection: 'incident' } } };

  it('names the field, the table, both lengths and the limit, and says the dictionary confirmed it', async () => {
    const { result, client } = await call('snow_scr_business_rule_add', BR, {
      ...cut, queries: { [DICT_NAME('sys_script', 'name')]: [{ max_length: String(LIMIT) }] },
    });
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatchObject({
      code: 'VALUE_TRUNCATED', operation: 'create', table: 'sys_script', sys_id: 'b1', field: 'name',
      sent_length: SENT.length, stored_length: LIMIT, column_limit: LIMIT, confirmed: true,
    });
    // The words a person reads: the limit, how much was sent, and that the record exists cut.
    expect(result.warnings[0].message).toContain(String(LIMIT));
    expect(result.warnings[0].message).toContain(String(SENT.length));
    // Exactly one extra request, and only because a cut was seen.
    expect(client.sequence).toEqual([
      'create sys_script', `query sys_dictionary:name=sys_script^element=name`,
    ]);
  });

  it('the success line no longer repeats the name that was SENT — it says what was STORED', async () => {
    const { result } = await call('snow_scr_business_rule_add', BR, cut);
    expect(result.summary).toContain(CUT);
    expect(result.summary).not.toContain(SENT);
  });

  it('with the dictionary unreadable it still warns, and says the limit is inferred', async () => {
    // No fixture for sys_dictionary: the fake answers an empty result, as an account that cannot
    // read the dictionary does. The cut is real either way, so the warning is not withheld.
    const { result } = await call('snow_scr_business_rule_add', BR, cut);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatchObject({
      code: 'VALUE_TRUNCATED', field: 'name', column_limit: LIMIT, stored_length: LIMIT, confirmed: false,
    });
  });

  it('a dictionary that says the column holds MORE than was sent means it was not a length cut', async () => {
    const { result } = await call('snow_scr_business_rule_add', BR, {
      ...cut, queries: { [DICT_NAME('sys_script', 'name')]: [{ max_length: '255' }] },
    });
    expect(result.warnings).toBeUndefined();
  });

  it('a limit the dictionary states as 0 or blank is "unknown", never a limit of 255', async () => {
    for (const max_length of ['', '0', null]) {
      const { result } = await call('snow_scr_business_rule_add', BR, {
        ...cut, queries: { [DICT_NAME('sys_script', 'name')]: [{ max_length }] },
      });
      expect(result.warnings, JSON.stringify(max_length)).toHaveLength(1);
      expect(result.warnings[0].confirmed, JSON.stringify(max_length)).toBe(false);
    }
  });
});

describe('ARC-09-C93 - the normal path costs nothing and says nothing', () => {
  it('a name that fits is stored whole: no warnings key, and no request beyond the write', async () => {
    const fits = 'Close open tasks';
    const { result, client } = await call('snow_scr_business_rule_add', { ...BR, name: fits },
      { created: { sys_script: { sys_id: 'b1', name: fits } } });
    expect(Object.prototype.hasOwnProperty.call(result, 'warnings')).toBe(false);
    expect(client.sequence).toEqual(['create sys_script']);
    expect(result.summary).toContain(fits);
  });
});

describe('ARC-09-C93 - it is the write path, not one tool', () => {
  it('an UPDATE that stores a cut value is reported too', async () => {
    const { result } = await call('snow_scr_business_rule_modify',
      { sys_id: 'b1', fields: { name: SENT } },
      { updated: { sys_script: { sys_id: 'b1', name: CUT } },
        queries: { [DICT_NAME('sys_script', 'name')]: [{ max_length: String(LIMIT) }] } });
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatchObject({
      code: 'VALUE_TRUNCATED', operation: 'update', table: 'sys_script', sys_id: 'b1',
      field: 'name', column_limit: LIMIT, confirmed: true,
    });
  });

  it('another tool on another table, with no change to that tool (Script Include)', async () => {
    const { result } = await call('snow_scr_script_include_add', { name: SENT, script: 'var x = 1;' }, {
      created: { sys_script_include: { sys_id: 's1', name: CUT, api_name: SENT } },
      queries: { [DICT_NAME('sys_script_include', 'name')]: [{ max_length: String(LIMIT) }] },
    });
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatchObject({ table: 'sys_script_include', field: 'name', confirmed: true });
  });

  it('the generic record tool, on a column whose definition lives on a parent table', async () => {
    // `incident.short_description` is defined on `task`, so the dictionary has no row under the
    // name "incident" and the limit cannot be confirmed — the cut is reported all the same.
    const long = 'y'.repeat(200);
    const { result } = await call('snow_core_record_add',
      { table: 'incident', fields: { short_description: long, impact: '2' } },
      { created: { incident: { sys_id: 'i1', short_description: long.slice(0, 160), impact: '2' } } });
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatchObject({
      table: 'incident', field: 'short_description', sent_length: 200, stored_length: 160,
      column_limit: 160, confirmed: false,
    });
  });

  it('two cut fields in one write are two warnings, in the order they were sent', async () => {
    const a = 'a'.repeat(100); const b = 'b'.repeat(300);
    const { result } = await call('snow_core_record_add',
      { table: 'u_thing', fields: { u_first: a, u_second: b } },
      { created: { u_thing: { sys_id: 't1', u_first: a.slice(0, 80), u_second: b.slice(0, 255) } } });
    expect(result.warnings.map((w: { field: string }) => w.field)).toEqual(['u_first', 'u_second']);
  });
});

describe('ARC-09-C93 - what the platform changes without cutting is not a warning', () => {
  const fields = async (sent: Record<string, unknown>, stored: Record<string, unknown>) => {
    const { result, client } = await call('snow_core_record_add', { table: 'u_thing', fields: sent },
      { created: { u_thing: { sys_id: 't1', ...stored } } });
    return { result, client };
  };

  it.each([
    ['a journal field the response does not echo', { work_notes: 'checked the queue' }, { work_notes: '' }],
    ['a decimal that lost its trailing zero', { u_cost: '1.50' }, { u_cost: '1.5' }],
    ['trailing whitespace the platform trimmed', { short_description: 'abc   ' }, { short_description: 'abc' }],
    ['a reference returned as an object', { assigned_to: 'a'.repeat(32) },
      { assigned_to: { link: 'https://x/api/now/table/sys_user/' + 'a'.repeat(32), value: 'a'.repeat(32) } }],
    ['booleans and numbers returned as strings', { active: true, priority: 2 }, { active: 'true', priority: '2' }],
    ['a date the platform completed', { u_due: '2026-10-04' }, { u_due: '2026-10-04 00:00:00' }],
    ['a field the response does not carry at all', { u_hidden: 'value' }, {}],
    ['a stored value that is not a prefix of what was sent', { u_note: 'one two three' }, { u_note: 'ONE TWO' }],
  ])('%s', async (_label, sent, stored) => {
    const { result, client } = await fields(sent, stored);
    expect(Object.prototype.hasOwnProperty.call(result, 'warnings')).toBe(false);
    // and none of them cost a dictionary lookup
    expect(client.sequence).toEqual(['create u_thing']);
  });
});
