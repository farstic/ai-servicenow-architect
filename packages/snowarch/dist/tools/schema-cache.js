/**
 * Schema Cache — TTL-based in-memory cache for discovered table schemas.
 * Used by the dynamic schema discovery tool to avoid re-querying on every call.
 */
const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes
class SchemaCache {
    cache = new Map();
    /** Get cached schema if still valid. */
    get(table) {
        const entry = this.cache.get(table);
        if (!entry)
            return undefined;
        if (Date.now() - entry.cachedAt > entry.ttlMs) {
            this.cache.delete(table);
            return undefined;
        }
        return entry;
    }
    /** Store schema for a table. */
    set(table, columns, ttlMs = DEFAULT_TTL_MS) {
        this.cache.set(table, {
            table,
            columns,
            cachedAt: Date.now(),
            ttlMs,
        });
    }
    /** Remove expired entries. */
    evictExpired() {
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
    getCachedTables() {
        this.evictExpired();
        return Array.from(this.cache.keys());
    }
    /** Clear all cached schemas. */
    clear() {
        this.cache.clear();
    }
}
// buildDynamicTools was removed by ARC-04-S08 with the runtime-generated tools.
export const schemaCache = new SchemaCache();
