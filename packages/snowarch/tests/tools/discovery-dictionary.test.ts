import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatchDiscoveryAction } from '../../src/tools/discovery.js';
import { schemaCache } from '../../src/tools/schema-cache.js';
import { runWithInstance, type Flags, type InstanceRuntime } from '../../src/servicenow/context.js';
import { ServiceNowError } from '../../src/utils/errors.js';
import { expandPreset } from '../../src/utils/permissions.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

/**
 * ARC-09-C98 - `snow_disco_table_discover` is the only dictionary reader in the server, and it had
 * four defects that make a limit taken from it unsafe to act on (plan row C97 is gated on them):
 *
 *   1. a blank `max_length` became 255 (`parseInt(x) || 255`), so "the dictionary states nothing" was
 *      reported as a limit of 255;
 *   2. the cache was keyed by table alone, so a second instance was answered with the first one's
 *      columns;
 *   3. only the columns defined ON the table were read, so `incident` came back without
 *      `short_description`, `number` or `state`, which are defined on `task`;
 *   4. at most 200 rows were read, with nothing to say a table had more.
 *
 * Grounding. That a child table inherits its parent's columns is printed in
 * vendor/ServiceNowDocs/markdown/platform-administration/table-administration-and-data-management/t_TableHierarchyAndTheExtModel.md
 * ("Incident is a logical table that extends Task and is physically located on Task"). That the
 * Max length of a dictionary entry only means something for a String field is printed in
 * .../r_DictionaryEntryForm.md ("You can only change this value for a String field"). That a reference
 * field comes back as { link, value } unless the link is excluded is printed in
 * vendor/ServiceNowDocs/markdown/api-reference/rest-apis/c_TableAPI.md. The NAME of the column that
 * holds the parent (`sys_db_object.super_class`) is NOT in the bundled corpus: it is the name plan
 * row C97 and PN-10 already use, and it is verified on the instance, not here.
 */

const sid = (t: string): string => createHash('md5').update(t).digest('hex');

type Row = Record<string, unknown>;
const dictRow = (over: Row = {}): Row => ({
  element: 'short_description', internal_type: 'string', column_label: 'Short Description',
  max_length: '160', mandatory: 'false', read_only: 'false', reference: '', default_value: '', ...over,
});

interface Def { extends?: string; columns?: Row[] }

/**
 * A small instance: `sys_db_object` answers `name=` and `sys_id=` lookups with the parent as the
 * Table API returns a reference ({ link, value }); `sys_dictionary` answers `name=` and `nameIN`,
 * honours offset and limit and sorts by element then name.
 */
function instance(tables: Record<string, Def>, opts: { hierarchyError?: Error } = {}) {
  const calls: Array<Record<string, any>> = [];
  const queryRecords = vi.fn(async (p: Record<string, any>) => {
    calls.push(p);
    const q = String(p.query ?? '');
    if (p.table === 'sys_db_object') {
      if (opts.hierarchyError) throw opts.hierarchyError;
      const byName = /name=([a-z0-9_]+)/i.exec(q)?.[1];
      const byId = /sys_id=([0-9a-f]{32})/i.exec(q)?.[1];
      const name = byName ?? Object.keys(tables).find((t) => sid(t) === byId);
      if (!name || !(name in tables)) return { count: 0, records: [] };
      const ext = tables[name]!.extends;
      return { count: 1, records: [{
        name, sys_id: sid(name),
        super_class: ext ? { link: `https://x.service-now.com/api/now/table/sys_db_object/${sid(ext)}`, value: sid(ext) } : '',
      }] };
    }
    if (p.table === 'sys_dictionary') {
      const names = /nameIN([a-z0-9_,]+)/i.exec(q)?.[1]?.split(',') ?? [/name=([a-z0-9_]+)/i.exec(q)?.[1] ?? ''];
      const rows: Row[] = names.flatMap((n) => (tables[n]?.columns ?? []).map((c) => ({ name: n, ...dictRow(), ...c })));
      rows.sort((a, b) => String(a.element).localeCompare(String(b.element)) || String(a.name).localeCompare(String(b.name)));
      const off = p.offset ?? 0;
      const slice = rows.slice(off, off + (p.limit ?? 100));
      return { count: slice.length, records: slice };
    }
    // the record probe of the fallback path
    return { count: 0, records: [] };
  });
  return { client: { queryRecords } as unknown as ServiceNowClient, calls, queryRecords };
}

const discover = (c: ServiceNowClient, table: string) =>
  dispatchDiscoveryAction(c, 'snow_disco_table_discover', { table });

function runtime(label: string): InstanceRuntime {
  const flags: Flags = expandPreset('read-only');
  return {
    label, url: `https://${label}.service-now.com`, environment: 'pdi', preset: 'read-only',
    flags, effectiveFlags: flags, toolPackage: 'full', maxRecords: 100, prodWriteAck: false,
    client: {} as InstanceRuntime['client'], warnings: [],
  };
}

beforeEach(() => { schemaCache.clear(); });

describe('ARC-09-C98 (1) - a limit the dictionary does not state is not 255', () => {
  it('a blank, a 0 and a non-number are null; a stated limit stays a number', async () => {
    const { client } = instance({ t: { columns: [
      dictRow({ element: 'a_stated', max_length: '160' }),
      dictRow({ element: 'b_blank', max_length: '' }),
      dictRow({ element: 'c_zero', max_length: '0' }),
      dictRow({ element: 'd_word', max_length: 'many' }),
      dictRow({ element: 'e_missing', max_length: undefined }),
      dictRow({ element: 'f_integer', internal_type: 'integer', max_length: '40' }),
    ] } });
    const r = await discover(client, 't');
    const limit = (e: string) => r.columns.find((c: { element: string }) => c.element === e).max_length;
    expect(limit('a_stated')).toBe(160);
    expect(limit('f_integer')).toBe(40);
    for (const e of ['b_blank', 'c_zero', 'd_word', 'e_missing']) expect(limit(e), e).toBeNull();
  });

  it('the record-probe fallback does not invent one either, and says so', async () => {
    const queryRecords = vi.fn()
      .mockResolvedValueOnce({ count: 0, records: [] })                        // sys_db_object
      .mockResolvedValueOnce({ count: 0, records: [] })                        // sys_dictionary
      .mockResolvedValueOnce({ count: 1, records: [{ sys_id: 'a', name: 'x' }] }); // the probe
    const r = await discover({ queryRecords } as unknown as ServiceNowClient, 'u_probe');
    expect(r.columns.map((c: { max_length: unknown }) => c.max_length)).toEqual([null, null]);
    expect(r.note).toMatch(/max_length is null/);
  });
});

describe('ARC-09-C98 (2) - the cache belongs to an instance', () => {
  const alpha = { t: { columns: [dictRow({ element: 'only_on_alpha' })] } };
  const beta = { t: { columns: [dictRow({ element: 'only_on_beta' })] } };

  it('a second instance is not answered with the first one\'s columns', async () => {
    const a = instance(alpha); const b = instance(beta);
    const first = await runWithInstance(runtime('alpha'), () => discover(a.client, 't'));
    const second = await runWithInstance(runtime('beta'), () => discover(b.client, 't'));
    expect(first.columns.map((c: { element: string }) => c.element)).toEqual(['only_on_alpha']);
    expect(second.source).toBe('instance');
    expect(second.columns.map((c: { element: string }) => c.element)).toEqual(['only_on_beta']);
  });

  it('...and each instance is still served from its own cache', async () => {
    const a = instance(alpha); const b = instance(beta);
    await runWithInstance(runtime('alpha'), () => discover(a.client, 't'));
    await runWithInstance(runtime('beta'), () => discover(b.client, 't'));
    a.queryRecords.mockClear(); b.queryRecords.mockClear();
    const again = await runWithInstance(runtime('alpha'), () => discover(a.client, 't'));
    expect(again.source).toBe('cache');
    expect(again.columns.map((c: { element: string }) => c.element)).toEqual(['only_on_alpha']);
    expect(a.queryRecords).not.toHaveBeenCalled();
    expect(b.queryRecords).not.toHaveBeenCalled();
  });

  it('outside any instance (a direct call) it still caches', async () => {
    const a = instance(alpha);
    await discover(a.client, 't');
    a.queryRecords.mockClear();
    expect((await discover(a.client, 't')).source).toBe('cache');
    expect(a.queryRecords).not.toHaveBeenCalled();
  });
});

describe('ARC-09-C98 (3) - columns defined on a parent table are read', () => {
  const hierarchy = {
    task: { columns: [dictRow({ element: 'short_description', max_length: '160' }), dictRow({ element: 'number', max_length: '40' }),
      dictRow({ element: 'state', internal_type: 'integer', max_length: '40' })] },
    incident: { extends: 'task', columns: [dictRow({ element: 'caller_id', internal_type: 'reference', reference: 'sys_user', max_length: '32' })] },
  };
  const elements = (r: { columns: Array<{ element: string }> }) => r.columns.map((c) => c.element).sort();

  it('incident comes back with the columns it inherits from task', async () => {
    const { client } = instance(hierarchy);
    const r = await discover(client, 'incident');
    expect(elements(r)).toEqual(['caller_id', 'number', 'short_description', 'state']);
    expect(r.note).toBeUndefined();
    expect(r.source).toBe('instance');
    expect(typeof r.cache_expires_in_minutes).toBe('number');
  });

  it('a table with no parent is read with one hierarchy request and no note', async () => {
    const { client, calls } = instance(hierarchy);
    const r = await discover(client, 'task');
    expect(elements(r)).toEqual(['number', 'short_description', 'state']);
    expect(calls.filter((c) => c.table === 'sys_db_object')).toHaveLength(1);
    expect(r.note).toBeUndefined();
  });

  it('a column defined on both is the child\'s', async () => {
    const { client } = instance({
      task: { columns: [dictRow({ element: 'priority', max_length: '', mandatory: 'false' })] },
      incident: { extends: 'task', columns: [dictRow({ element: 'priority', max_length: '40', mandatory: 'true' })] },
    });
    const r = await discover(client, 'incident');
    expect(r.columns).toHaveLength(1);
    expect(r.columns[0]).toMatchObject({ element: 'priority', max_length: 40, mandatory: true });
  });

  it('a table that adds no column of its own still returns the inherited ones, not a record probe', async () => {
    const { client, calls } = instance({
      task: { columns: [dictRow({ element: 'number' })] },
      u_empty_child: { extends: 'task', columns: [] },
    });
    const r = await discover(client, 'u_empty_child');
    expect(elements(r)).toEqual(['number']);
    expect(calls.map((c) => c.table)).not.toContain('u_empty_child');   // no probe
  });

  it('a three-level chain is read to the top, in one dictionary query per page', async () => {
    const { client, calls } = instance({
      a: { columns: [dictRow({ element: 'from_a' })] },
      b: { extends: 'a', columns: [dictRow({ element: 'from_b' })] },
      c: { extends: 'b', columns: [dictRow({ element: 'from_c' })] },
    });
    const r = await discover(client, 'c');
    expect(elements(r)).toEqual(['from_a', 'from_b', 'from_c']);
    expect(calls.filter((c) => c.table === 'sys_dictionary')).toHaveLength(1);
  });

  it('a hierarchy that loops back stops, keeps what it read, and says so', async () => {
    const { client } = instance({
      a: { extends: 'b', columns: [dictRow({ element: 'from_a' })] },
      b: { extends: 'a', columns: [dictRow({ element: 'from_b' })] },
    });
    const r = await discover(client, 'a');
    expect(elements(r)).toEqual(['from_a', 'from_b']);
    expect(r.note).toMatch(/loops back/);
  });

  it('an account that cannot read the hierarchy gets the table\'s own columns, a note, and no cache entry', async () => {
    const denied = new ServiceNowError('User Not Authorized', 'INSUFFICIENT_PRIVILEGES');
    const { client, queryRecords } = instance(hierarchy, { hierarchyError: denied });
    const r = await discover(client, 'incident');
    expect(elements(r)).toEqual(['caller_id']);
    expect(r.note).toMatch(/inherited columns are not included/i);
    expect(r.note).toMatch(/INSUFFICIENT_PRIVILEGES/);
    expect(r.cache_expires_in_minutes).toBeUndefined();
    // not cached: a partial answer must not stand in for the whole one for half an hour
    queryRecords.mockClear();
    expect((await discover(client, 'incident')).source).toBe('instance');
    expect(queryRecords).toHaveBeenCalled();
  });

  it('any OTHER failure reading the hierarchy is not swallowed (a failed login is not retried by hiding it)', async () => {
    const auth = new ServiceNowError('bad credentials', 'AUTHENTICATION_FAILED');
    const { client, calls } = instance(hierarchy, { hierarchyError: auth });
    await expect(discover(client, 'incident')).rejects.toMatchObject({ code: 'AUTHENTICATION_FAILED' });
    expect(calls.filter((c) => c.table === 'sys_dictionary')).toEqual([]);
  });

  it('a table name that is not an identifier is refused before any request', async () => {
    const { client, queryRecords } = instance(hierarchy);
    for (const bad of ['incident^ORDERBYDESCsys_id', 'a b', 'x=y', '1abc', 'a-b']) {
      await expect(discover(client, bad), bad).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    }
    expect(queryRecords).not.toHaveBeenCalled();
  });
});

describe('ARC-09-C98 (4) - more than 200 columns are read, and a table that cannot be read whole says so', () => {
  const wide = (n: number): Row[] => Array.from({ length: n }, (_v, i) => dictRow({ element: `c${String(i).padStart(4, '0')}` }));

  it('450 columns come back as 450, from three pages with advancing offsets', async () => {
    const { client, calls } = instance({ big: { columns: wide(450) } });
    const r = await discover(client, 'big');
    expect(r.columns).toHaveLength(450);
    expect(new Set(r.columns.map((c: { element: string }) => c.element)).size).toBe(450);
    const pages = calls.filter((c) => c.table === 'sys_dictionary');
    expect(pages.map((p) => p.offset)).toEqual([0, 200, 400]);
    expect(r.note).toBeUndefined();
  });

  it('the page walk is ordered, so an offset cannot skip or repeat a column', async () => {
    const { client, calls } = instance({ big: { columns: wide(250) } });
    await discover(client, 'big');
    for (const p of calls.filter((c) => c.table === 'sys_dictionary')) expect(String(p.orderBy)).toMatch(/element/);
  });

  it('exactly 200 columns: the next page is asked for, and is empty', async () => {
    const { client, calls } = instance({ big: { columns: wide(200) } });
    const r = await discover(client, 'big');
    expect(r.columns).toHaveLength(200);
    expect(calls.filter((c) => c.table === 'sys_dictionary')).toHaveLength(2);
  });

  it('199 columns is one page', async () => {
    const { client, calls } = instance({ big: { columns: wide(199) } });
    await discover(client, 'big');
    expect(calls.filter((c) => c.table === 'sys_dictionary')).toHaveLength(1);
  });

  it('a source that never stops is cut at a ceiling, and the result says it is cut and is not cached', async () => {
    const queryRecords = vi.fn(async (p: Record<string, any>) => {
      if (p.table === 'sys_db_object') return { count: 1, records: [{ name: 'endless', super_class: '' }] };
      return { count: 200, records: Array.from({ length: 200 }, (_v, i) => dictRow({ element: `e${p.offset}_${i}` })) };
    });
    const client = { queryRecords } as unknown as ServiceNowClient;
    const r = await discover(client, 'endless');
    expect(r.columns.length).toBeGreaterThanOrEqual(5000);
    expect(r.columns.length).toBeLessThan(10000);
    expect(r.note).toMatch(/stopped after \d+ dictionary rows/i);
    expect(r.cache_expires_in_minutes).toBeUndefined();
    queryRecords.mockClear();
    expect((await discover(client, 'endless')).source).toBe('instance');
  });
});
