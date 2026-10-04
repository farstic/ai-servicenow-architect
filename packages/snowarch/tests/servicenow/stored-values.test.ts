import { describe, expect, it } from 'vitest';
import {
  attachWarnings, dictionaryLimit, findCuts, lengthOf, looksCut, verifyWrite, withWriteVerification,
  type CutValueWarning,
} from '../../src/servicenow/stored-values.js';
import { routeToolInvocation } from '../../src/tools/index.js';
import { FakeRestClient } from '../helpers/fake-rest.js';
import { withPreset } from '../helpers/preset.js';
import { runWithInstance, type Flags, type InstanceRuntime } from '../../src/servicenow/context.js';
import { expandPreset } from '../../src/utils/permissions.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

withPreset('pdi-developer');

/**
 * ARC-09-C93 — the pieces of `src/servicenow/stored-values.ts`, one at a time.
 *
 * `tests/tools/silent-truncation.test.ts` and `tests/servicenow/silent-truncation-http.test.ts` say
 * what a CALLER sees. These say why each decision inside is the one it is, with the case that
 * would have made the opposite decision wrong.
 */

describe('lengthOf - characters, as the platform counts them', () => {
  it('counts code points, not UTF-16 units', () => {
    expect(lengthOf('')).toBe(0);
    expect(lengthOf('abc')).toBe(3);
    expect(lengthOf('😀')).toBe(1);               // two UTF-16 units
    expect(lengthOf('a😀b')).toBe(3);
    expect(lengthOf('\ud83d')).toBe(1);           // a lone high surrogate is one character, not a crash
  });
});

describe('looksCut - the narrow signature of a length cut', () => {
  it.each([
    ['a plain cut', 'abcdefghij', 'abcdef', true],
    ['a cut that ends on a space (PN-07 saw one)', 'Close every task still open when the', 'Close every task still open when ', true],
    ['a cut of a long script', 'x'.repeat(5000), 'x'.repeat(4000), true],
  ])('%s', (_l, sent, stored, want) => expect(looksCut(sent, stored)).toBe(want));

  it.each([
    ['identical', 'abc', 'abc'],
    ['stored longer', 'abc', 'abcdef'],
    ['stored empty - a field the response does not echo', 'abc', ''],
    ['stored is not a prefix', 'abcdef', 'ABC'],
    ['only whitespace was dropped', 'abc   ', 'abc'],
    ['a decimal that lost a zero', '1.50', '1.5'],
    ['a signed grouped number', '-1,200.50', '-1,200.5'],
    ['sent is not a string', 12345, '123'],
    ['stored is an object (a reference)', 'abc', { value: 'abc' }],
    ['stored is undefined', 'abc', undefined],
    ['stored is null', 'abc', null],
    ['both booleans', true, false],
  ])('is NOT a cut: %s', (_l, sent, stored) => expect(looksCut(sent, stored)).toBe(false));
});

describe('findCuts - the fields, in the order they were sent', () => {
  it('returns each cut field and ignores the rest', () => {
    const cuts = findCuts(
      { b: 'bbbbbb', a: 'aaaa', n: 5, ok: 'fine' },
      { b: 'bbb', a: 'aaaa', n: '5', ok: 'fine' });
    expect(cuts).toEqual([{ field: 'b', sent: 'bbbbbb', stored: 'bbb' }]);
  });

  it('survives a stored value that is not an object', () => {
    expect(findCuts({ a: 'aaaa' }, undefined as unknown as Record<string, unknown>)).toEqual([]);
  });
});

describe('dictionaryLimit - a limit, or null; never a default', () => {
  const rows = (records: unknown[]) => ({ queryRecords: async () => ({ count: records.length, records }) }) as never;

  it.each([
    ['a string', [{ max_length: '40' }], 40],
    ['a number', [{ max_length: 40 }], 40],
    ['with spaces', [{ max_length: ' 80 ' }], 80],
  ])('reads %s', async (_l, records, want) => {
    expect(await dictionaryLimit(rows(records), 'sys_script', 'name')).toBe(want);
  });

  it.each([
    ['blank', [{ max_length: '' }]], ['zero', [{ max_length: '0' }]], ['null', [{ max_length: null }]],
    ['negative', [{ max_length: '-5' }]], ['text', [{ max_length: 'forty' }]], ['fractional', [{ max_length: '4.5' }]],
    ['no row (defined on a parent)', []], ['no field at all', [{}]],
  ])('is null for %s - the discovery tool\'s "|| 255" is exactly what this must not do', async (_l, records) => {
    expect(await dictionaryLimit(rows(records), 'incident', 'short_description')).toBeNull();
  });

  it('is null when the lookup throws, and never rethrows', async () => {
    const boom = { queryRecords: async () => { throw new Error('403'); } } as never;
    expect(await dictionaryLimit(boom, 'sys_script', 'name')).toBeNull();
  });

  it('asks the exact question, once, with retries off', async () => {
    const seen: unknown[] = [];
    const spy = { queryRecords: async (p: unknown) => { seen.push(p); return { count: 0, records: [] }; } } as never;
    await dictionaryLimit(spy, 'sys_script', 'name');
    expect(seen).toEqual([{
      table: 'sys_dictionary', query: 'name=sys_script^element=name', fields: 'max_length', limit: 1, retries: 0,
    }]);
  });

  it.each([
    ['a table with an encoded-query operator', 'a^ORb', 'name'],
    ['a field with an encoded-query operator', 'sys_script', 'name^ORactive=true'],
    ['a dot-walked field', 'incident', 'caller_id.name'],
    ['an empty field', 'incident', ''],
  ])('never builds a query from %s', async (_l, table, field) => {
    let asked = 0;
    const spy = { queryRecords: async () => { asked += 1; return { count: 0, records: [] }; } } as never;
    expect(await dictionaryLimit(spy, table, field)).toBeNull();
    expect(asked).toBe(0);
  });
});

describe('verifyWrite', () => {
  const dict = (max_length: unknown) => ({ queryRecords: async () => ({ count: 1, records: [{ max_length }] }) }) as never;

  it('a dictionary limit below what was sent confirms the cut', async () => {
    const [w] = await verifyWrite(dict('40'), 'create', 'sys_script', undefined,
      { name: 'x'.repeat(44) }, { sys_id: 'b1', name: 'x'.repeat(40) });
    expect(w).toMatchObject({ confirmed: true, column_limit: 40, stored_length: 40, sent_length: 44, sys_id: 'b1' });
  });

  it('a dictionary limit that fits what was sent means the platform changed it some other way', async () => {
    expect(await verifyWrite(dict('255'), 'create', 'sys_script', undefined,
      { name: 'x'.repeat(44) }, { name: 'x'.repeat(40) })).toEqual([]);
  });

  it('a limit that is not the stored length still confirms, and is the number reported', async () => {
    // Trailing whitespace trimmed after the cut, or a multi-byte column: stored 38, limit 40.
    const [w] = await verifyWrite(dict('40'), 'update', 'sys_script', 'abc',
      { name: 'x'.repeat(44) }, { name: 'x'.repeat(38) });
    expect(w).toMatchObject({ confirmed: true, column_limit: 40, stored_length: 38, sys_id: 'abc', operation: 'update' });
  });

  it('with no limit, the stored length is the inferred limit and it is not confirmed', async () => {
    const [w] = await verifyWrite(dict(''), 'create', 'incident', undefined,
      { short_description: 'y'.repeat(200) }, { short_description: 'y'.repeat(160) });
    expect(w).toMatchObject({ confirmed: false, column_limit: 160 });
    expect(w!.message).toContain('appears to have been cut');
  });

  it('counts characters, so an emoji is one', async () => {
    const [w] = await verifyWrite(dict(''), 'create', 'u_t', undefined, { u_f: '😀'.repeat(10) }, { u_f: '😀'.repeat(6) });
    expect(w).toMatchObject({ sent_length: 10, stored_length: 6 });
  });
});

describe('attachWarnings', () => {
  const w = { code: 'VALUE_TRUNCATED', field: 'name' } as CutValueWarning;

  it('returns the very same result when there is nothing to say', () => {
    const r = { a: 1 };
    expect(attachWarnings(r, [])).toBe(r);
  });

  it('adds a warnings array to an object result without disturbing it', () => {
    expect(attachWarnings({ a: 1 }, [w])).toEqual({ a: 1, warnings: [w] });
  });

  it('keeps warnings the tool already produced, first', () => {
    const own = { code: 'OWN' };
    expect((attachWarnings({ warnings: [own] }, [w]) as { warnings: unknown[] }).warnings).toEqual([own, w]);
    expect((attachWarnings({ warnings: 'careful' }, [w]) as { warnings: unknown[] }).warnings).toEqual(['careful', w]);
  });

  it.each([[[1, 2]], ['text'], [null]])('wraps a result that cannot carry a field (%j)', (r) => {
    expect(attachWarnings(r, [w])).toEqual({ result: r, warnings: [w] });
  });
});

describe('withWriteVerification - a Proxy that must not change what it wraps', () => {
  /** A client with ES `#private` state, mutable state, and the two write methods. */
  class Strict {
    #secret = 'token';
    calls = 0;
    created: Array<[string, unknown]> = [];
    async createRecord(table: string, data: Record<string, unknown>) { this.created.push([table, data]); return { sys_id: 's1', ...data, name: String(data.name).slice(0, 5) }; }
    async updateRecord(_t: string, sysId: string, data: Record<string, unknown>) { return { sys_id: sysId, ...data }; }
    async queryRecords() { return { count: 0, records: [] }; }
    bump() { this.calls += 1; return this.#secret; }   // would throw if `this` were the Proxy
  }
  const asClient = (c: unknown) => c as ServiceNowClient;

  it('other methods run on the REAL client: #private fields work and state lands on the original', () => {
    const real = new Strict();
    const { client } = withWriteVerification(asClient(real));
    expect((client as unknown as Strict).bump()).toBe('token');
    expect((client as unknown as Strict).bump()).toBe('token');
    expect(real.calls).toBe(2);
  });

  it('touches nothing at wrap time - a client that throws on ANY access can still be wrapped', () => {
    const trap = new Proxy({}, { get() { throw new Error('touched'); }, has() { throw new Error('touched'); } });
    expect(() => withWriteVerification(asClient(trap))).not.toThrow();
  });

  it('reports a cut from createRecord and returns the stored record untouched', async () => {
    const real = new Strict();
    const v = withWriteVerification(asClient(real));
    const stored = await v.client.createRecord('u_t', { name: 'abcdefghij' });
    expect(stored).toMatchObject({ sys_id: 's1', name: 'abcde' });
    expect(v.warnings).toHaveLength(1);
    expect(v.warnings[0]).toMatchObject({ table: 'u_t', field: 'name', stored_length: 5, sent_length: 10, confirmed: false });
  });

  it('a check that blows up cannot turn a successful write into a failure', async () => {
    const real = new Strict();
    real.queryRecords = async () => { throw new Error('dictionary down'); };
    const v = withWriteVerification(asClient(real));
    await expect(v.client.createRecord('u_t', { name: 'abcdefghij' })).resolves.toMatchObject({ sys_id: 's1' });
    expect(v.warnings).toHaveLength(1);                      // and the cut is still reported
    // a response that is not an object at all
    real.createRecord = async () => undefined as never;
    await expect(v.client.createRecord('u_t', { name: 'x' })).resolves.toBeUndefined();
  });

  it('an error from the WRITE itself propagates unchanged and records nothing', async () => {
    const real = new Strict();
    real.createRecord = async () => { throw new Error('INSUFFICIENT_PRIVILEGES'); };
    const v = withWriteVerification(asClient(real));
    await expect(v.client.createRecord('u_t', { name: 'x' })).rejects.toThrow('INSUFFICIENT_PRIVILEGES');
    expect(v.warnings).toHaveLength(0);
  });

  it('is re-entrant: wrapping a wrapper joins the outer list and does not own it', async () => {
    const outer = withWriteVerification(asClient(new Strict()));
    const inner = withWriteVerification(outer.client);
    expect(inner.owner).toBe(false);
    expect(inner.warnings).toBe(outer.warnings);
    expect(inner.client).toBe(outer.client);
    await inner.client.createRecord('u_t', { name: 'abcdefghij' });
    expect(outer.warnings).toHaveLength(1);                  // reported once, on the outermost
  });
});

describe('routeToolInvocation - who owns the warnings', () => {
  function runtime(): InstanceRuntime {
    const flags: Flags = expandPreset('pdi-developer');
    return {
      label: 'pdi', url: 'https://dev1.service-now.com', environment: 'pdi', preset: 'pdi-developer',
      flags, effectiveFlags: flags, toolPackage: 'full', maxRecords: 100, prodWriteAck: false,
      client: {} as InstanceRuntime['client'], warnings: [],
    };
  }
  const BR = { name: 'n'.repeat(44), table: 'incident', when: 'before', script: 'gs.info(1);' };
  const cut = { created: { sys_script: { sys_id: 'b1', name: 'n'.repeat(40) } } };

  it('a nested invocation hands its warnings to the outer one and carries none itself', async () => {
    const fake = new FakeRestClient(cut);
    const outer = withWriteVerification(fake.asClient());
    const nested = await runWithInstance(runtime(), () =>
      routeToolInvocation(outer.client, 'snow_scr_business_rule_add', BR));
    expect(Object.prototype.hasOwnProperty.call(nested, 'warnings')).toBe(false);
    expect(outer.warnings).toHaveLength(1);
  });

  it('an instance-free invocation (no client at all) is dispatched as it always was', async () => {
    await expect(routeToolInvocation(null as never, 'snow_no_such_tool_at_all', {}))
      .rejects.toMatchObject({ code: 'UNKNOWN_TOOL' });
  });
});
