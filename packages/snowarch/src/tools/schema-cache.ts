/**
 * Schema Cache — TTL-based in-memory cache for discovered table schemas.
 * Used by the dynamic schema discovery tool to avoid re-querying on every call.
 */

export interface ColumnSchema {
  element: string;
  internal_type: string;
  label: string;
  max_length: number;
  mandatory: boolean;
  reference?: string;
  read_only: boolean;
  default_value?: string;
}

export interface CachedSchema {
  table: string;
  columns: ColumnSchema[];
  cachedAt: number;
  ttlMs: number;
}

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes

class SchemaCache {
  private cache = new Map<string, CachedSchema>();

  /** Get cached schema if still valid. */
  get(table: string): CachedSchema | undefined {
    const entry = this.cache.get(table);
    if (!entry) return undefined;
    if (Date.now() - entry.cachedAt > entry.ttlMs) {
      this.cache.delete(table);
      return undefined;
    }
    return entry;
  }

  /** Store schema for a table. */
  set(table: string, columns: ColumnSchema[], ttlMs = DEFAULT_TTL_MS): void {
    this.cache.set(table, {
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


  /** Get all cached table names. */
  getCachedTables(): string[] {
    this.evictExpired();
    return Array.from(this.cache.keys());
  }

  /** Clear all cached schemas. */
  clear(): void {
    this.cache.clear();
  }
}

// buildDynamicTools was removed by ARC-04-S08 with the runtime-generated tools.


export const schemaCache = new SchemaCache();
