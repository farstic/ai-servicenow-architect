/**
 * Table schema discovery: what are this table's columns?
 *
 * It used to do more than that. `snow_disco_table_discover` MINTED tools — after discovering
 * `u_widget` the session gained `dynamic_query_u_widget`, `dynamic_create_u_widget` and three
 * more, dispatched by `dispatchDynamicAction` and named by `buildToolNames`. ARC-04-S08 removed
 * all of it, because a catalogue that depends on what was called earlier in the session cannot
 * be described by any contract, cannot be cached by any client, and — the part that matters for
 * the gates — mints WRITE tools whose gating lives in a code path no parity test walks, since
 * the names do not exist until runtime.
 *
 * What replaces them is not smaller: the columns come back as DATA, and the caller uses
 * `snow_core_records_query`, `snow_core_record_add` and their siblings, which are declared,
 * gated, counted and in the contract. Same operations, on tools someone can audit.
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { schemaCache, type ColumnSchema } from './schema-cache.js';
import type { ToolDefinition } from './types.js';

export function discoveryToolManifest(): ToolDefinition[] {
  return [
    {
      name: 'snow_disco_table_discover',
      description:
        'Read a ServiceNow table schema and return its columns (element, type, label, '
        + 'max_length, mandatory, reference, read_only, default_value). Use the result to build '
        + 'calls to snow_core_records_query / snow_core_record_read / snow_core_record_add. '
        + 'Schemas are cached for 30 minutes.',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Table name to discover (e.g., "u_custom_table")' },
        },
        required: ['table'],
      },
      gate: 'none',
      mutates: false,
    },
  ];
}

const minutesLeft = (cachedAt: number, ttlMs: number): number =>
  Math.round((ttlMs - (Date.now() - cachedAt)) / 60000);

export async function dispatchDiscoveryAction(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  if (name !== 'snow_disco_table_discover') return null;

  const table = args.table;
  if (!table || typeof table !== 'string') {
    throw new ServiceNowError('table is required', 'INVALID_REQUEST');
  }

  const cached = schemaCache.get(table);
  if (cached) {
    return {
      table,
      source: 'cache',
      // The columns themselves. This used to be `columns: cached.columns.length` beside an
      // `available_tools` list — a caller was told how MANY columns there were and given tool
      // names instead of the schema, so the one thing the tool is for had to be inferred.
      columns: cached.columns,
      cache_expires_in_minutes: minutesLeft(cached.cachedAt, cached.ttlMs),
    };
  }

  const dictResult = await client.queryRecords({
    table: 'sys_dictionary',
    query: `name=${table}^elementISNOTEMPTY^internal_type!=collection`,
    fields: 'element,internal_type,column_label,max_length,mandatory,reference,read_only,default_value',
    limit: 200,
  });

  if (dictResult.count === 0) {
    // sys_dictionary can be empty for a table the account can read rows of but not the
    // dictionary of. Probing one row gives the column NAMES, which is less than the dictionary
    // gives but more than nothing — and the `note` says which of the two happened, because a
    // probe-derived `internal_type: 'string'` is a placeholder, not a finding.
    try {
      const probe = await client.queryRecords({ table, limit: 1 });
      if (probe.count === 0 && probe.records.length === 0) {
        throw new ServiceNowError(`Table "${table}" not found or has no schema`, 'NOT_FOUND');
      }
      const record = probe.records[0] || {};
      const probed: ColumnSchema[] = Object.keys(record).map((key) => ({
        element: key,
        internal_type: 'string',
        label: key,
        max_length: 255,
        mandatory: false,
        read_only: key.startsWith('sys_'),
        default_value: undefined,
      }));

      schemaCache.set(table, probed);

      return {
        table,
        source: 'instance',
        columns: probed,
        cache_expires_in_minutes: minutesLeft(Date.now(), schemaCache.get(table)!.ttlMs),
        note: 'Schema derived from record structure (sys_dictionary returned nothing for this '
          + 'table); internal_type and max_length are placeholders, not the dictionary values.',
      };
    } catch (e) {
      if (e instanceof ServiceNowError) throw e;
      throw new ServiceNowError(`Table "${table}" not found`, 'NOT_FOUND');
    }
  }

  const columns: ColumnSchema[] = dictResult.records.map((r: any) => ({
    element: r.element,
    internal_type: r.internal_type || 'string',
    label: r.column_label || r.element,
    max_length: parseInt(r.max_length) || 255,
    mandatory: r.mandatory === 'true' || r.mandatory === true,
    reference: r.reference || undefined,
    read_only: r.read_only === 'true' || r.read_only === true,
    default_value: r.default_value || undefined,
  }));

  schemaCache.set(table, columns);

  return {
    table,
    source: 'instance',
    columns,
    cache_expires_in_minutes: minutesLeft(Date.now(), schemaCache.get(table)!.ttlMs),
  };
}

// dispatchDynamicAction and buildToolNames were removed by ARC-04-S08 along with the
// runtime-generated `dynamic_<op>_<table>` tools — see the file header.
