import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  attachWarnings, carryWarningsOnError, describeCutsOnError, dictionaryLimits, findCuts, lengthOf, looksCut,
  reconcile, withWriteVerification,
  type CutField, type CutValueWarning, type Pending,
} from '../../src/servicenow/stored-values.js';
import { routeToolInvocation } from '../../src/tools/index.js';
import { capResult } from '../../src/utils/result-size.js';
import { ServiceNowError } from '../../src/utils/errors.js';
import { FakeRestClient, isPrecheckRead } from '../helpers/fake-rest.js';
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

describe('lengthOf - code points, the unit this module ASSUMES the platform counts in', () => {
  it('counts code points, not UTF-16 units', () => {
    expect(lengthOf('')).toBe(0);
    expect(lengthOf('abc')).toBe(3);
    expect(lengthOf('😀')).toBe(1);               // two UTF-16 units
    expect(lengthOf('a😀b')).toBe(3);
    expect(lengthOf('\ud83d')).toBe(1);           // a lone high surrogate is one character, not a crash
  });
});

describe('looksCut - the narrow signature of a cut', () => {
  it.each([
    ['a plain cut', 'abcdefghij', 'abcdef', true],
    ['a cut that ends on a space (PN-07 saw one)', 'Close every task still open when the', 'Close every task still open when ', true],
    ['a cut of a long script', 'x'.repeat(5000), 'x'.repeat(4000), true],
  ])('%s', (_l, sent, stored, want) => expect(looksCut(sent, stored)).toBe(want));

  // These are the ones the first version could not see: "it looks like a number" was exempted by
  // SHAPE, so an all-digit label, an identifier or a list of integers could be cut and never warn.
  it.each([
    ['a 43-digit label cut at 40', '1234567890'.repeat(4) + '123', '1234567890'.repeat(4)],
    ['a hundred nines cut at forty', '9'.repeat(100), '9'.repeat(40)],
    ['a phone number with a plus sign', '+359888123456789012345678901234567890123', '+35988812345678901234567890123456789'],
    ['a list of integers', Array.from({ length: 50 }, (_, i) => String(i + 1)).join(','), '1,2,3,4,5,6,7,8,9,10,11,12,13,14,15'],
    ['one digit lost from an integer', '4111111111111111', '411111111111111'],
    ['a zero lost from an integer - there is no decimal point to excuse it', '1000', '100'],
    ['digits lost AFTER a decimal point', '10.25', '10.2'],
    ['the fraction lost, not just its zeros', '10.2', '10'],
    ['a zero lost from the middle of a longer fraction', '100.0', '10'],
  ])('IS a cut: %s', (_l, sent, stored) => expect(looksCut(sent, stored)).toBe(true));

  it.each([
    ['identical', 'abc', 'abc'],
    ['stored longer', 'abc', 'abcdef'],
    ['stored empty - a field the response does not echo', 'abc', ''],
    ['stored is not a prefix', 'abcdef', 'ABC'],
    ['only whitespace was dropped', 'abc   ', 'abc'],
    ['a decimal that lost a zero', '1.50', '1.5'],
    ['a decimal that lost every zero', '1.00', '1'],
    ['a decimal with no integer part', '.50', '.5'],
    ['a decimal that lost only its point', '1.', '1'],
    ['a signed grouped number', '-1,200.50', '-1,200.5'],
    ['sent is not a string', 12345, '123'],
    ['stored is an object (a reference)', 'abc', { value: 'abc' }],
    ['stored is undefined', 'abc', undefined],
    ['stored is null', 'abc', null],
    ['both booleans', true, false],
  ])('is NOT a cut: %s', (_l, sent, stored) => expect(looksCut(sent, stored)).toBe(false));

  describe('line endings - compared in a normalised space', () => {
    it('a script the platform stored with LF after it was sent with CRLF, and then cut, IS a cut', () => {
      const sent = 'var a = 1;\r\nvar b = 2;\r\nvar c = 3;\r\nvar d = 4;\r\n';
      expect(looksCut(sent, 'var a = 1;\nvar b = 2;\nvar c = 3;')).toBe(true);
    });

    it('a pure CRLF to LF rewrite is not a cut: nothing was lost', () => {
      expect(looksCut('a\r\nb\r\nc', 'a\nb\nc')).toBe(false);
      expect(looksCut('a\rb', 'a\nb')).toBe(false);
    });
  });
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

  it('keeps the RAW strings, so the lengths reported are the ones the caller sent', () => {
    const sent = 'a\r\nbbbb';
    expect(findCuts({ s: sent }, { s: 'a\nbb' })).toEqual([{ field: 's', sent, stored: 'a\nbb' }]);
  });
});

describe('dictionaryLimits - a limit per field, or null; never a default', () => {
  const rows = (records: unknown[]) => ({ queryRecords: async () => ({ count: records.length, records }) }) as never;

  it.each([
    ['a string', '40', 40],
    ['a number', 40, 40],
    ['with spaces', ' 80 ', 80],
  ])('reads %s', async (_l, max_length, want) => {
    const got = await dictionaryLimits(rows([{ element: 'name', max_length }]), 'sys_script', ['name']);
    expect(got.get('name')).toBe(want);
  });

  it.each([
    ['blank', ''], ['zero', '0'], ['null', null], ['negative', '-5'], ['text', 'forty'], ['fractional', '4.5'],
  ])('is null for a %s limit - the discovery tool\'s "|| 255" is exactly what this must not do', async (_l, max_length) => {
    const got = await dictionaryLimits(rows([{ element: 'short_description', max_length }]), 'incident', ['short_description']);
    expect(got.get('short_description')).toBeNull();
  });

  it.each([
    ['no row (the column is defined on a parent table)', []],
    ['a row with no limit at all', [{ element: 'short_description' }]],
    ['a row for some other field', [{ element: 'other', max_length: '40' }]],
  ])('is null for %s', async (_l, records) => {
    const got = await dictionaryLimits(rows(records), 'incident', ['short_description']);
    expect(got.get('short_description')).toBeNull();
  });

  it('answers each field from its own row, in one request', async () => {
    const seen: unknown[] = [];
    const spy = {
      queryRecords: async (p: unknown) => {
        seen.push(p);
        return { count: 2, records: [{ element: 'name', max_length: '40' }, { element: 'active', max_length: '40' }] };
      },
    } as never;
    const got = await dictionaryLimits(spy, 'sys_script', ['name', 'collection']);
    expect(got.get('name')).toBe(40);
    expect(got.get('collection')).toBeNull();                       // asked for, not answered
    expect(got.has('active')).toBe(false);                          // answered, not asked for
    expect(seen).toEqual([{
      table: 'sys_dictionary', query: 'name=sys_script^elementINname,collection',
      fields: 'element,max_length', limit: 2, retries: 0,
    }]);
  });

  it('a failed request REJECTS, so the caller can stop asking - it is not turned into "unknown"', async () => {
    const boom = { queryRecords: async () => { throw new Error('403'); } } as never;
    await expect(dictionaryLimits(boom, 'sys_script', ['name'])).rejects.toThrow('403');
  });

  it.each([
    ['a table with an encoded-query operator', 'a^ORb', ['name']],
    ['a field with an encoded-query operator', 'sys_script', ['name^ORactive=true']],
    ['a dot-walked field', 'incident', ['caller_id.name']],
    ['an empty field', 'incident', ['']],
  ])('never builds a query from %s', async (_l, table, fields) => {
    let asked = 0;
    const spy = { queryRecords: async () => { asked += 1; return { count: 0, records: [] }; } } as never;
    const got = await dictionaryLimits(spy, table, fields);
    expect([...got.values()].every((v) => v === null)).toBe(true);
    expect(asked).toBe(0);
  });

  it('asks for the safe fields only when some are unsafe', async () => {
    const seen: Array<{ query: string }> = [];
    const spy = { queryRecords: async (p: { query: string }) => { seen.push(p); return { count: 0, records: [] }; } } as never;
    const got = await dictionaryLimits(spy, 'incident', ['short_description', 'caller_id.name']);
    expect(seen[0]!.query).toBe('name=incident^elementINshort_description');
    expect(got.get('caller_id.name')).toBeNull();
  });
});

describe('reconcile - what the dictionary can and cannot overrule', () => {
  const P = (over: Partial<Pending> = {}): Pending =>
    ({ operation: 'create', table: 'sys_script', sysId: 'b1', live: false, cuts: [], ...over });
  const cut = (sent: string, stored: string, field = 'name'): CutField => ({ field, sent, stored });

  it('a limit below what was sent confirms the cut', () => {
    const w = reconcile(P(), cut('x'.repeat(44), 'x'.repeat(40)), 40)!;
    expect(w).toMatchObject({
      code: 'VALUE_TRUNCATED', confirmed: true, column_limit: 40, stored_length: 40, sent_length: 44, sys_id: 'b1',
      operation: 'create', table: 'sys_script', field: 'name',
    });
  });

  it('says what the dictionary STATED, not what the column "holds" - the semantics are not documented', () => {
    const w = reconcile(P(), cut('x'.repeat(44), 'x'.repeat(40)), 40)!;
    expect(w.message).toContain('maximum length of 40');
    expect(w.message).not.toContain('the column holds');
  });

  it('a limit that FITS what was sent means the platform changed it some other way: no length cut', () => {
    expect(reconcile(P(), cut('x'.repeat(44), 'x'.repeat(40)), 255)).toBeNull();
    expect(reconcile(P(), cut('x'.repeat(44), 'x'.repeat(40)), 44)).toBeNull();
  });

  it('a limit above the stored length but below the sent one still confirms (trailing whitespace trimmed)', () => {
    const w = reconcile(P({ operation: 'update', sysId: 'abc' }), cut('x'.repeat(44), 'x'.repeat(38)), 40)!;
    expect(w).toMatchObject({ confirmed: true, column_limit: 40, stored_length: 38, sys_id: 'abc', operation: 'update' });
  });

  it('a stored value LONGER than the stated limit proves the limit did not cut it', () => {
    // A sanitiser removed trailing <script> blocks from a 4532-character article and left 4407; the
    // dictionary says 4000. "The column holds 4000, so the platform stored the first 4407" is
    // nonsense, and so is the warning.
    expect(reconcile(P({ table: 'kb_knowledge' }), cut('x'.repeat(4532), 'x'.repeat(4407), 'text'), 4000)).toBeNull();
    expect(reconcile(P(), cut('x'.repeat(60), 'x'.repeat(45)), 40)).toBeNull();
  });

  it('a limit is compared under BOTH counting units: 30 emoji are 30 code points and 60 UTF-16 units', () => {
    // Which unit the platform counts in is not documented in the bundled corpus - verify on the
    // instance. Under UTF-16 units a limit of 40 cuts 30 emoji to 20, and a code-point-only rule
    // would call 30 <= 40 "fits" and say nothing.
    const w = reconcile(P(), cut('😀'.repeat(30), '😀'.repeat(20)), 40)!;
    expect(w).toMatchObject({ confirmed: true, sent_length: 30, stored_length: 20, column_limit: 40 });
  });

  it('a limit that fits under both units is still "not a length cut"', () => {
    expect(reconcile(P(), cut('😀'.repeat(20), '😀'.repeat(12)), 40)).toBeNull();
  });

  it('with no limit, the stored length is reported as a lower bound and the warning is not confirmed', () => {
    const w = reconcile(P({ table: 'incident' }), cut('y'.repeat(200), 'y'.repeat(160), 'short_description'), null)!;
    expect(w).toMatchObject({ confirmed: false, column_limit: 160 });
    expect(w.message).toContain('appears to have been cut');
    expect(w.message).toContain('at least 160');
  });

  it('whitespace trimmed after a cut makes the inferred limit a LOWER bound, and the message says so', () => {
    const sent = 'z'.repeat(37) + '   ' + 'tail';
    const w = reconcile(P(), cut(sent, 'z'.repeat(37)), null)!;
    expect(w).toMatchObject({ confirmed: false, column_limit: 37 });
    expect(w.message).toContain('at least 37');
  });

  it('counts characters, so an emoji is one', () => {
    const w = reconcile(P({ table: 'u_t' }), cut('😀'.repeat(10), '😀'.repeat(6), 'u_f'), null)!;
    expect(w).toMatchObject({ sent_length: 10, stored_length: 6 });
  });

  it('an ACTIVE record gets the sentence that matters: it is running with the cut value', () => {
    const live = reconcile(P({ live: true }), cut('x'.repeat(44), 'x'.repeat(40)), 40)!;
    const off = reconcile(P({ live: false }), cut('x'.repeat(44), 'x'.repeat(40)), 40)!;
    expect(live.message).toMatch(/record is active/);
    expect(live.message).toMatch(/active to false/);
    expect(off.message).not.toMatch(/active/);
  });

  it('an UNCONFIRMED update says it may be a write the platform ignored; a create does not', () => {
    // A PATCH the platform ignores (a field ACL, a data policy) answers with the OLD value, and when
    // the old value is a prefix of the new one that is indistinguishable from a cut.
    const upd = reconcile(P({ operation: 'update' }), cut('Server down - restarted', 'Server down', 'comments'), null)!;
    const add = reconcile(P({ operation: 'create' }), cut('Server down - restarted', 'Server down', 'comments'), null)!;
    expect(upd.message).toMatch(/ignored/);
    expect(add.message).not.toMatch(/ignored/);
  });

  it('claims nothing about the update set unconditionally - not every table is captured', () => {
    const w = reconcile(P({ table: 'incident' }), cut('y'.repeat(200), 'y'.repeat(160), 'short_description'), null)!;
    expect(w.message).not.toContain('so does the update-set entry');
    expect(w.message).toMatch(/If update-set capture was on/);
  });

  it('tells a create to modify, not to add again; the limit it names is a number it can stand behind', () => {
    const c = reconcile(P(), cut('x'.repeat(44), 'x'.repeat(40)), 40)!;
    expect(c.message).toMatch(/modify/);
    expect(c.message).toMatch(/do not re-add/);
    expect(c.message).toContain('at most 40');
    const u = reconcile(P({ operation: 'update' }), cut('x'.repeat(44), 'x'.repeat(40)), null)!;
    expect(u.message).toContain('40 characters is known to fit');
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
  });

  it('a record\'s OWN `warnings` column is preserved, not coerced into the list', () => {
    // A table with a column called "warnings" returns it as a string. Folding that into an array of
    // warning objects would lose the column's value from where the caller looks for it.
    const record = { sys_id: 'a', warnings: 'text from the column' };
    expect(attachWarnings(record, [w])).toEqual({ warnings: [w], result: record });
  });

  it.each([[[1, 2]], ['text'], [null]])('wraps a result that cannot carry a field (%j)', (r) => {
    expect(attachWarnings(r, [w])).toEqual({ result: r, warnings: [w] });
  });

  it('wraps a Date, a Map and a class instance rather than spreading away their value', () => {
    class Box { constructor(public v = 1) {} get doubled() { return this.v * 2; } toJSON() { return { boxed: this.v }; } }
    for (const r of [new Date(0), new Map([[1, 2]]), new Box()]) {
      expect(attachWarnings(r, [w])).toEqual({ warnings: [w], result: r });
    }
  });

  it('puts warnings FIRST, because the result-size cap keeps the start of the text and cuts the end', () => {
    const big = { sys_id: 'a', name: 'cut', script: 'x'.repeat(5000) };
    const attached = attachWarnings(big, [w]) as Record<string, unknown>;
    expect(Object.keys(attached)[0]).toBe('warnings');
    // The cap that reaches a client: a result over the ceiling is cut from the END. A warning
    // appended last would be the first thing lost, on exactly the large results where a cut hurts.
    const capped = capResult(attached, 1000);
    expect(capped.truncated).toBe(true);
    expect(capped.text).toContain('VALUE_TRUNCATED');
  });

  it('keeps that order when the tool already produced warnings of its own', () => {
    const attached = attachWarnings({ sys_id: 'a', warnings: [{ code: 'OWN' }] }, [w]) as Record<string, unknown>;
    expect(Object.keys(attached)[0]).toBe('warnings');
    expect((attached.warnings as unknown[]).length).toBe(2);
  });
});

describe('withWriteVerification - a Proxy that must not change what it wraps', () => {
  /** A client with ES `#private` state, mutable state, and the two write methods. */
  class Strict {
    #secret = 'token';
    calls = 0;
    lookups: unknown[] = [];
    /** ARC-09-C97's reads before each write (`isPrecheckRead`), kept apart from C93's and answered with no rows. */
    prechecks: unknown[] = [];
    created: Array<[string, unknown]> = [];
    /** What the dictionary answers C93; a function so a test can fail it. */
    dictionary: (p: { query: string }) => Promise<unknown> | unknown = () => ({ count: 0, records: [] });
    async createRecord(table: string, data: Record<string, unknown>) {
      this.created.push([table, data]);
      const cutTo = (v: unknown) => (typeof v === 'string' ? v.slice(0, 5) : v);
      return { sys_id: 's1', ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, cutTo(v)])) };
    }
    async updateRecord(_t: string, sysId: string, data: Record<string, unknown>) { return { sys_id: sysId, ...data }; }
    async queryRecords(p: { table?: string; query: string; fields?: string }) {
      if (isPrecheckRead(p)) { this.prechecks.push(p); return { count: 0, records: [] }; }
      this.lookups.push(p);
      return this.dictionary(p);
    }
    bump() { this.calls += 1; return this.#secret; }   // would throw if `this` were the Proxy
  }
  const asClient = (c: unknown) => c as ServiceNowClient;
  const LONG = 'abcdefghij';

  afterEach(() => { vi.useRealTimers(); });

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

  it('returns the stored record untouched, and C93 asks nothing until the tool has finished', async () => {
    const real = new Strict();
    const v = withWriteVerification(asClient(real));
    const stored = await v.client.createRecord('u_t', { name: LONG });
    expect(stored).toMatchObject({ sys_id: 's1', name: 'abcde' });
    // C93 has asked nothing yet: its lookup waits for settle. What was asked BEFORE the write is the length
    // pre-check's (ARC-09-C97), under a budget of its own.
    expect(real.lookups).toHaveLength(0);
    expect(real.prechecks.length).toBeGreaterThan(0);
    const warnings = await v.settle();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ table: 'u_t', field: 'name', stored_length: 5, sent_length: 10, confirmed: false });
  });

  it('a write with nothing cut never reaches the dictionary at all', async () => {
    const real = new Strict();
    const v = withWriteVerification(asClient(real));
    await v.client.createRecord('u_t', { name: 'abc' });
    await v.client.updateRecord('u_t', 's1', { name: LONG });  // an update echoes what was sent in this fake
    expect(await v.settle()).toEqual([]);
    expect(real.lookups).toHaveLength(0);
  });

  it('a check that blows up cannot turn a successful write into a failure', async () => {
    const real = new Strict();
    real.dictionary = () => { throw new Error('dictionary down'); };
    const v = withWriteVerification(asClient(real));
    await expect(v.client.createRecord('u_t', { name: LONG })).resolves.toMatchObject({ sys_id: 's1' });
    expect(await v.settle()).toHaveLength(1);                // and the cut is still reported
    // a response that is not an object at all
    real.createRecord = async () => undefined as never;
    await expect(v.client.createRecord('u_t', { name: 'x' })).resolves.toBeUndefined();
  });

  it('an error from the WRITE itself propagates unchanged and records nothing', async () => {
    const real = new Strict();
    real.createRecord = async () => { throw new Error('INSUFFICIENT_PRIVILEGES'); };
    const v = withWriteVerification(asClient(real));
    await expect(v.client.createRecord('u_t', { name: 'x' })).rejects.toThrow('INSUFFICIENT_PRIVILEGES');
    expect(await v.settle()).toHaveLength(0);
  });

  it('is re-entrant: wrapping a wrapper joins the outer list and does not own it', async () => {
    const outer = withWriteVerification(asClient(new Strict()));
    const inner = withWriteVerification(outer.client);
    expect(inner.owner).toBe(false);
    expect(inner.client).toBe(outer.client);
    await inner.client.createRecord('u_t', { name: LONG });
    expect(await inner.settle()).toEqual([]);                // not the owner: it reports nothing
    expect(await outer.settle()).toHaveLength(1);            // reported once, on the outermost
  });

  it('settling twice asks nothing the second time and returns the same warnings', async () => {
    const real = new Strict();
    const v = withWriteVerification(asClient(real));
    await v.client.createRecord('u_t', { name: LONG });
    const first = await v.settle();
    const second = await v.settle();
    expect(second).toEqual(first);
    expect(real.lookups).toHaveLength(1);
  });

  describe('the dictionary is asked once per TABLE, after the tool, under one budget', () => {
    it('three cut fields in one write are one request', async () => {
      const real = new Strict();
      real.dictionary = () => ({ count: 3, records: [
        { element: 'u_a', max_length: '5' }, { element: 'u_b', max_length: '5' }, { element: 'u_c', max_length: '5' }] });
      const v = withWriteVerification(asClient(real));
      await v.client.createRecord('u_t', { u_a: LONG, u_b: LONG, u_c: LONG });
      const warnings = await v.settle();
      expect(warnings.map((x) => x.field)).toEqual(['u_a', 'u_b', 'u_c']);
      expect(warnings.every((x) => x.confirmed)).toBe(true);
      expect(real.lookups).toEqual([{
        table: 'sys_dictionary', query: 'name=u_t^elementINu_a,u_b,u_c', fields: 'element,max_length', limit: 3, retries: 0,
      }]);
    });

    it('many records of the same table and fields are one request, and each record keeps its own warning', async () => {
      const real = new Strict();
      real.dictionary = () => ({ count: 1, records: [{ element: 'name', max_length: '5' }] });
      const v = withWriteVerification(asClient(real));
      for (let i = 0; i < 4; i += 1) await v.client.createRecord('u_t', { name: LONG });
      const warnings = await v.settle();
      expect(warnings).toHaveLength(4);
      expect(real.lookups).toHaveLength(1);
    });

    it('two tables are two requests', async () => {
      const real = new Strict();
      const v = withWriteVerification(asClient(real));
      await v.client.createRecord('u_one', { name: LONG });
      await v.client.createRecord('u_two', { name: LONG });
      await v.settle();
      expect((real.lookups as Array<{ query: string }>).map((p) => p.query))
        .toEqual(['name=u_one^elementINname', 'name=u_two^elementINname']);
    });

    it('stops asking after the FIRST lookup that fails - every code, authentication included', async () => {
      for (const failure of [
        new Error('socket hang up'),
        new ServiceNowError('bad credentials', 'AUTHENTICATION_FAILED'),
        new ServiceNowError('no role', 'INSUFFICIENT_PRIVILEGES'),
      ]) {
        const real = new Strict();
        real.dictionary = () => { throw failure; };
        const v = withWriteVerification(asClient(real));
        await v.client.createRecord('u_one', { name: LONG });
        await v.client.createRecord('u_two', { name: LONG });
        await v.client.createRecord('u_three', { name: LONG });
        const warnings = await v.settle();
        // One request, not three: a failed login that is repeated is how an account gets locked.
        expect(real.lookups, String(failure)).toHaveLength(1);
        expect(warnings).toHaveLength(3);
        expect(warnings.every((x) => !x.confirmed)).toBe(true);
      }
    });

    it('gives up at the budget: a dictionary that never answers delays the tool by the budget, not forever', async () => {
      vi.useFakeTimers();
      const real = new Strict();
      real.dictionary = () => new Promise(() => { /* never answers */ });
      const v = withWriteVerification(asClient(real));
      await v.client.createRecord('u_t', { name: LONG });
      const pending = v.settle(50);
      await vi.advanceTimersByTimeAsync(50);
      const warnings = await pending;
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatchObject({ confirmed: false, column_limit: 5 });
    });

    it('a late answer after the budget cannot change warnings already handed back', async () => {
      vi.useFakeTimers();
      const real = new Strict();
      let release!: (v: unknown) => void;
      real.dictionary = () => new Promise((r) => { release = r; });
      const v = withWriteVerification(asClient(real));
      await v.client.createRecord('u_t', { name: LONG });
      const pending = v.settle(10);
      await vi.advanceTimersByTimeAsync(10);
      const warnings = await pending;
      const before = JSON.stringify(warnings);
      release({ count: 1, records: [{ element: 'name', max_length: '5' }] });
      await vi.advanceTimersByTimeAsync(1);
      expect(JSON.stringify(warnings)).toBe(before);
    });
  });
});

describe('warnings survive a tool that throws AFTER it wrote', () => {
  const full = expandPreset('full');
  const runtime = (): InstanceRuntime => ({
    label: 'pdi', url: 'https://dev1.service-now.com', environment: 'pdi', preset: 'full',
    flags: full as Flags, effectiveFlags: full as Flags, toolPackage: 'full', maxRecords: 100, prodWriteAck: false,
    client: {} as InstanceRuntime['client'], warnings: [],
  });

  it('carries them on the error, and describes them for the person who reads the error', () => {
    const err = new ServiceNowError('second step failed', 'INSUFFICIENT_PRIVILEGES');
    const w = { code: 'VALUE_TRUNCATED', operation: 'create', table: 'sys_ai_agent', sys_id: 'a1', field: 'name',
      sent_length: 60, stored_length: 40, column_limit: 40, confirmed: true, message: 'm' } as CutValueWarning;
    expect(describeCutsOnError(err)).toBe('');
    carryWarningsOnError(err, [w]);
    expect(err.message).toBe('second step failed');                   // the error itself is not rewritten
    const note = describeCutsOnError(err);
    expect(note).toContain('sys_ai_agent.name');
    expect(note).toContain('a1');
    expect(note).toMatch(/modify/);
    expect(note).not.toMatch(/\(Code:/);                               // never mistaken for the error's own code
  });

  it('tolerates being handed something that is not an object', () => {
    expect(() => carryWarningsOnError(undefined, [])).not.toThrow();
    expect(() => carryWarningsOnError('boom', [{ code: 'VALUE_TRUNCATED' } as CutValueWarning])).not.toThrow();
    expect(describeCutsOnError('boom')).toBe('');
    expect(describeCutsOnError(undefined)).toBe('');
  });

  it('the router puts the cut of an earlier write on the error of a later one', async () => {
    // snow_ai_ai_agent_add writes the agent, then two ACLs. The agent's name comes back cut and the
    // ACL write is refused: the person is told the second thing, and used to never hear the first.
    const fake = new FakeRestClient({
      created: { sys_ai_agent: { sys_id: 'a1', name: 'n'.repeat(40) } },
    });
    const real = fake.createRecord.bind(fake);
    fake.createRecord = async (table: string, data: Record<string, unknown>) => {
      if (table === 'sys_security_acl') throw new ServiceNowError('ACL refused', 'INSUFFICIENT_PRIVILEGES');
      return real(table, data);
    };
    let caught: unknown;
    try {
      await runWithInstance(runtime(), () => routeToolInvocation(fake.asClient(), 'snow_ai_ai_agent_add',
        { name: 'n'.repeat(60), description: 'd', capabilities: ['a'] }));
    } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(ServiceNowError);
    expect((caught as ServiceNowError).code).toBe('INSUFFICIENT_PRIVILEGES');
    expect(describeCutsOnError(caught)).toContain('sys_ai_agent.name');
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
  const cut = { created: { sys_script: { sys_id: 'b1', name: 'n'.repeat(40), advanced: 'true' } } };

  it('a nested invocation hands its warnings to the outer one and carries none itself', async () => {
    const fake = new FakeRestClient(cut);
    const outer = withWriteVerification(fake.asClient());
    const nested = await runWithInstance(runtime(), () =>
      routeToolInvocation(outer.client, 'snow_scr_business_rule_add', BR));
    expect(Object.prototype.hasOwnProperty.call(nested, 'warnings')).toBe(false);
    expect(await outer.settle()).toHaveLength(1);
  });

  it('an instance-free invocation (no client at all) is dispatched as it always was', async () => {
    await expect(routeToolInvocation(null as never, 'snow_no_such_tool_at_all', {}))
      .rejects.toMatchObject({ code: 'UNKNOWN_TOOL' });
  });
});
