import { describe, expect, it } from 'vitest';
import { summariseWarnings, warningsOfResult } from '../../src/audit/warnings.js';
import { carriedWarnings, carryWarningsOnError, type CutValueWarning } from '../../src/servicenow/stored-values.js';

/**
 * ARC-09-C101 (b) — what a warning may leave behind in the audit trail.
 *
 * A write that came back with `warnings[]` succeeded, and the trail used to say `ok` and nothing
 * more. The line now carries the CODES, the table, the field names and a count — and nothing a
 * caller typed. The marker below is the property that matters: it sits in every free-text slot a
 * warning has (the message, a stray key) and must not be found in what comes out.
 */
const MARKER = 'SECRET-PAYLOAD-MARKER';

const w = (over: Record<string, unknown> = {}) => ({
  code: 'VALUE_TRUNCATED', operation: 'create', table: 'sys_script', sys_id: 'a'.repeat(32), field: 'name',
  sent_length: 61, stored_length: 40, column_limit: 40, confirmed: true, message: `m ${MARKER}`, ...over,
});

describe('summariseWarnings - codes, table, fields, count', () => {
  it('one warning is one group', () => {
    expect(summariseWarnings([w()])).toEqual([
      { code: 'VALUE_TRUNCATED', table: 'sys_script', fields: ['name'], count: 1 },
    ]);
  });

  it('groups by code and table, lists each field once, and counts every warning', () => {
    const got = summariseWarnings([
      w({ field: 'name' }), w({ field: 'name' }), w({ field: 'script' }),
      w({ table: 'sys_script_include', field: 'name' }),
      w({ code: 'FIELD_NOT_STORED', field: 'filter_condition' }),
    ]);
    expect(got).toEqual([
      { code: 'VALUE_TRUNCATED', table: 'sys_script', fields: ['name', 'script'], count: 3 },
      { code: 'VALUE_TRUNCATED', table: 'sys_script_include', fields: ['name'], count: 1 },
      { code: 'FIELD_NOT_STORED', table: 'sys_script', fields: ['filter_condition'], count: 1 },
    ]);
  });

  it('never carries a value: not the message, not a sys_id, not a length, not a stray key', () => {
    const text = JSON.stringify(summariseWarnings([
      w({ extra: MARKER, sys_id: MARKER, message: MARKER }),
    ]));
    expect(text).not.toContain(MARKER);
    expect(text).not.toContain('sys_id');
    expect(text).not.toContain('message');
    expect(text).not.toContain('sent_length');
  });

  it.each([
    ['a code nobody registered', { code: MARKER }],
    ['a code that is not a string', { code: 7 }],
    ['no code at all', { code: undefined }],
  ])('drops a warning with %s', (_l, over) => {
    expect(summariseWarnings([w(over)])).toEqual([]);
  });

  it.each([
    ['a table with an encoded-query operator', { table: 'a^ORb' }],
    ['a table that is the marker', { table: MARKER }],
    ['a table with a space', { table: 'sys script' }],
  ])('a warning with %s keeps its code but records no table', (_l, over) => {
    const [g] = summariseWarnings([w(over)]);
    expect(g).toMatchObject({ code: 'VALUE_TRUNCATED', table: null, count: 1 });
    expect(JSON.stringify(g)).not.toContain(MARKER);
  });

  it('a field that is not a column-shaped name is not recorded, and the count still is', () => {
    const [g] = summariseWarnings([w({ field: `x ${MARKER}` }), w({ field: 'caller_id.name' }), w({ field: 'name' })]);
    expect(g).toMatchObject({ fields: ['name'], count: 3 });
  });

  it('is bounded: at most 10 groups and 10 fields a group, however many warnings there are', () => {
    const many = Array.from({ length: 40 }, (_, i) => w({ table: `u_t${i}`, field: `f${i}` }));
    expect(summariseWarnings(many)).toHaveLength(10);
    const fields = Array.from({ length: 40 }, (_, i) => w({ field: `f${i}` }));
    const [g] = summariseWarnings(fields);
    expect(g!.fields).toHaveLength(10);
    expect(g!.count).toBe(40);
  });

  it.each([[undefined], [null], ['text'], [{}], [[]], [[null, 3, 'x']]])('is [] for %j', (input) => {
    expect(summariseWarnings(input)).toEqual([]);
  });
});

describe('warningsOfResult - only the top-level key the server itself puts there', () => {
  it('reads `warnings` from an object result', () => {
    expect(warningsOfResult({ sys_id: 'a', warnings: [w()] })).toHaveLength(1);
  });

  it('reads `warnings` from the wrapper attachWarnings makes for a result that cannot carry the key', () => {
    expect(warningsOfResult({ warnings: [w()], result: [1, 2] })).toHaveLength(1);
  });

  it('does not look inside `result`: a record\'s own column called warnings is not ours', () => {
    expect(warningsOfResult({ warnings: [w()], result: { warnings: [w(), w()] } })).toHaveLength(1);
  });

  it('and does not go looking for them there when the top level has none', () => {
    // Nothing attaches warnings to a nested `result` on its own; one that is only there is a record's
    // content, not the server's word.
    expect(warningsOfResult({ sys_id: 'a', result: { warnings: [w()] } })).toEqual([]);
  });

  it.each([[undefined], [null], ['text'], [[w()]], [{ warnings: 'careful' }], [{ nothing: true }]])(
    'is [] for %j', (input) => {
      expect(warningsOfResult(input)).toEqual([]);
    });
});

describe('carriedWarnings - what an error brought out of a tool that wrote first', () => {
  it('is what carryWarningsOnError put there, and [] for anything else', () => {
    const err = new Error('boom');
    expect(carriedWarnings(err)).toEqual([]);
    carryWarningsOnError(err, [w() as unknown as CutValueWarning]);
    expect(carriedWarnings(err)).toHaveLength(1);
    expect(carriedWarnings('boom')).toEqual([]);
    expect(carriedWarnings(undefined)).toEqual([]);
  });
});
