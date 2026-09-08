import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dispatchDiscoveryAction, discoveryToolManifest } from '../../src/tools/discovery.js';
import { schemaCache } from '../../src/tools/schema-cache.js';
import { collectToolCatalog } from '../../src/tools/index.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

/**
 * The version of this suite before ARC-04-S08 asserted that discovery MINTED tools:
 * `expect(result.available_tools).toContain('dynamic_create_incident')`. It passed, and what
 * it was protecting was the defect — a catalogue that changed shape depending on what had been
 * called earlier in the session, with write tools whose names did not exist until runtime and
 * so were walked by no parity or gate test.
 *
 * So the assertions below are the inverse. Removing the phantom tools is not proved by the old
 * tests being deleted; it is proved by asserting that nothing mints them.
 */
const mockClient = {
  queryRecords: vi.fn(),
  getRecord: vi.fn(),
  createRecord: vi.fn(),
  updateRecord: vi.fn(),
  deleteRecord: vi.fn(),
} as unknown as ServiceNowClient;

const dictRow = (over: Record<string, unknown> = {}) => ({
  element: 'short_description', internal_type: 'string', column_label: 'Short Description',
  max_length: '160', mandatory: 'true', read_only: 'false', reference: '', default_value: '',
  ...over,
});

beforeEach(() => { vi.clearAllMocks(); schemaCache.clear(); });

describe('the manifest', () => {
  it('declares one tool, taking only a table', () => {
    const tools = discoveryToolManifest();
    expect(tools).toHaveLength(1);
    expect(tools[0]!.name).toBe('snow_disco_table_discover');
    expect(tools[0]!.inputSchema.required).toContain('table');
    // `operations` existed only to choose which dynamic tools to mint.
    expect(Object.keys((tools[0]!.inputSchema as { properties: object }).properties)).toEqual(['table']);
  });

  it('the description promises columns and names the tools to use them with', () => {
    const d = discoveryToolManifest()[0]!.description;
    expect(d).toContain('snow_core_records_query');
    expect(d).not.toContain('dynamic_');
  });

  it('it is a read, and gated as one', () => {
    expect(discoveryToolManifest()[0]!.mutates).toBe(false);
    expect(discoveryToolManifest()[0]!.gate).toBe('none');
  });
});

describe('the catalogue does not change when a table is discovered', () => {
  it('no dynamic_* tool exists before or after a discover call', async () => {
    const before = collectToolCatalog().map((t) => t.name);
    expect(before.filter((n) => n.startsWith('dynamic_'))).toEqual([]);

    (mockClient.queryRecords as ReturnType<typeof vi.fn>)
      .mockResolvedValue({ count: 1, records: [dictRow()] });
    await dispatchDiscoveryAction(mockClient, 'snow_disco_table_discover', { table: 'incident' });

    // Identical, name for name and in order — not merely "the same length".
    expect(collectToolCatalog().map((t) => t.name)).toEqual(before);
  });

  it('the removed dispatcher is gone from the module', async () => {
    const mod = await import('../../src/tools/discovery.js') as Record<string, unknown>;
    expect(Object.keys(mod).sort()).toEqual(['discoveryToolManifest', 'dispatchDiscoveryAction']);
  });
});

describe('dispatchDiscoveryAction', () => {
  it('returns null for a name it does not own', async () => {
    expect(await dispatchDiscoveryAction(mockClient, 'unknown_tool', {})).toBeNull();
  });

  it('a missing table is refused before any request', async () => {
    await expect(dispatchDiscoveryAction(mockClient, 'snow_disco_table_discover', {}))
      .rejects.toThrow('table is required');
    expect(mockClient.queryRecords).not.toHaveBeenCalled();
  });

  it('reads sys_dictionary and returns the COLUMNS, not a count', async () => {
    // The fixture carries the three columns criterion 3 names for `incident`, so the unit half
    // of that criterion is satisfied by the same shape the live half would produce.
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 4,
      records: [
        dictRow(),
        dictRow({ element: 'number', column_label: 'Number', max_length: '40', mandatory: 'false' }),
        dictRow({ element: 'state', internal_type: 'integer', column_label: 'State',
          max_length: '40', mandatory: 'false', default_value: '1' }),
        dictRow({ element: 'caller_id', internal_type: 'reference', column_label: 'Caller',
          max_length: '32', mandatory: 'false', read_only: 'true', reference: 'sys_user' }),
      ],
    });

    const r = await dispatchDiscoveryAction(mockClient, 'snow_disco_table_discover', { table: 'incident' });

    expect(r.source).toBe('instance');
    expect(r.table).toBe('incident');
    expect(Array.isArray(r.columns)).toBe(true);
    expect(r.columns.map((c: { element: string }) => c.element))
      .toEqual(expect.arrayContaining(['number', 'short_description', 'state']));
    expect(r.columns).toHaveLength(4);
    expect(r.columns[0]).toEqual({
      element: 'short_description', internal_type: 'string', label: 'Short Description',
      max_length: 160, mandatory: true, reference: undefined, read_only: false,
      default_value: undefined,
    });
    // Strings off the wire become the types the story asked for.
    expect(r.columns[3].reference).toBe('sys_user');
    expect(r.columns[3].read_only).toBe(true);
    expect(r.columns[2].default_value).toBe('1');
    expect(r.cache_expires_in_minutes).toBe(30);
    expect(mockClient.queryRecords).toHaveBeenCalledWith(expect.objectContaining({
      table: 'sys_dictionary', query: expect.stringContaining('name=incident'),
    }));
  });

  it('nothing in the response mints or names a tool', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>)
      .mockResolvedValue({ count: 1, records: [dictRow()] });
    const r = await dispatchDiscoveryAction(mockClient, 'snow_disco_table_discover', { table: 'incident' });
    expect(JSON.stringify(r)).not.toContain('dynamic_');
    expect(r.available_tools).toBeUndefined();
    expect(r.generated_tools).toBeUndefined();
    expect(Object.keys(r).sort()).toEqual(['cache_expires_in_minutes', 'columns', 'source', 'table']);
  });

  it('a second call is served from cache without touching the instance', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>)
      .mockResolvedValue({ count: 1, records: [dictRow()] });
    const first = await dispatchDiscoveryAction(mockClient, 'snow_disco_table_discover', { table: 'incident' });
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockClear();

    const second = await dispatchDiscoveryAction(mockClient, 'snow_disco_table_discover', { table: 'incident' });

    expect(second.source).toBe('cache');
    expect(mockClient.queryRecords).not.toHaveBeenCalled();
    // The cached answer is the same answer — a cache that returned a different SHAPE would
    // make every caller handle two contracts.
    expect(second.columns).toEqual(first.columns);
    expect(Object.keys(second).sort()).toEqual(Object.keys(first).sort());
  });

  it('falls back to a record probe when sys_dictionary is empty, and says so', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ count: 0, records: [] })
      .mockResolvedValueOnce({ count: 1, records: [{ sys_id: 'abc', name: 'x', ip_address: '10.0.0.1' }] });

    const r = await dispatchDiscoveryAction(mockClient, 'snow_disco_table_discover', { table: 'u_custom' });

    expect(r.source).toBe('instance');
    expect(r.columns.map((c: { element: string }) => c.element)).toEqual(['sys_id', 'name', 'ip_address']);
    // The placeholder types are declared as placeholders rather than passed off as dictionary
    // values — a caller that trusted internal_type here would build the wrong query.
    expect(r.note).toContain('placeholders');
    expect(r.columns[0].read_only).toBe(true);   // sys_* is read-only
    expect(r.columns[1].read_only).toBe(false);
  });

  it('a table that is in neither is NOT_FOUND', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ count: 0, records: [] })
      .mockResolvedValueOnce({ count: 0, records: [] });
    await expect(dispatchDiscoveryAction(mockClient, 'snow_disco_table_discover', { table: 'nope' }))
      .rejects.toThrow('not found');
  });
});
