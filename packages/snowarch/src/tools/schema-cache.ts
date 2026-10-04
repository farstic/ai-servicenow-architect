/**
 * Schema Cache — TTL-based in-memory cache for discovered table schemas.
 * Used by the dynamic schema discovery tool to avoid re-querying on every call.
 *
 * Keyed by INSTANCE and table (ARC-09-C98). It was keyed by table alone, so a server holding two
 * instances answered the second with the first one's columns for half an hour; a custom table, or
 * a column added on one of them, is exactly what differs between instances.
 */

export interface ColumnSchema {
  element: string;
  internal_type: string;
  label: string;
  /** The dictionary's limit, or null when it states none (blank, 0, not a number): unknown, never 255. */
  max_length: number | null;
  mandatory: boolean;
  reference?: string;
  read_only: boolean;
  default_value?: string;
}

export interface CachedSchema {
  instance: string;
  table: string;
  columns: ColumnSchema[];
  cachedAt: number;
  ttlMs: number;
}

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes

/** A NUL cannot occur in a label or in a table name, so two pairs never share a key. */
const keyOf = (instance: string, table: string): string => `${instance}\u0000${table}`;

class SchemaCache {
  private cache = new Map<string, CachedSchema>();

  /** Get cached schema if still valid. `instance` is the label of the instance it was read from. */
  get(instance: string, table: string): CachedSchema | undefined {
    const key = keyOf(instance, table);
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.cachedAt > entry.ttlMs) {
      this.cache.delete(key);
      return undefined;
    }
    return entry;
  }

  /** Store schema for a table of an instance. */
  set(instance: string, table: string, columns: ColumnSchema[], ttlMs = DEFAULT_TTL_MS): void {
    this.cache.set(keyOf(instance, table), {
      instance,
      table,
      columns,
      cachedAt: Date.now(),
      ttlMs,
    });
  }

  /** Remove expired entries. */
  evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now - entry.cachedAt > entry.ttlMs) {
        this.cache.delete(key);
      }
    }
  }

  /** Get all dynamically generated tool definitions across all cached tables. */
  // getGeneratedTools() was removed by ARC-04-S08 with the runtime-generated tools.
  // This is a COLUMN cache now: it remembers what a table looks like, and nothing
  // it returns can change the shape of tools/list.


  /** The tables cached for an instance. */
  getCachedTables(instance: string): string[] {
    this.evictExpired();
    return Array.from(this.cache.values()).filter((e) => e.instance === instance).map((e) => e.table);
  }

  /** Clear all cached schemas. */
  clear(): void {
    this.cache.clear();
  }
}

// buildDynamicTools was removed by ARC-04-S08 with the runtime-generated tools.


export const schemaCache = new SchemaCache();
