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
    generatedToolNames: string[];
    cachedAt: number;
    ttlMs: number;
}
export interface DynamicToolDefinition {
    name: string;
    description: string;
    inputSchema: Record<string, any>;
}
declare class SchemaCache {
    private cache;
    /** Get cached schema if still valid. */
    get(table: string): CachedSchema | undefined;
    /** Store schema for a table. */
    set(table: string, columns: ColumnSchema[], generatedToolNames: string[], ttlMs?: number): void;
    /** Remove expired entries. */
    evictExpired(): void;
    /** Get all dynamically generated tool definitions across all cached tables. */
    getGeneratedTools(): DynamicToolDefinition[];
    /** Get all cached table names. */
    getCachedTables(): string[];
    /** Clear all cached schemas. */
    clear(): void;
}
export declare const schemaCache: SchemaCache;
export {};
//# sourceMappingURL=schema-cache.d.ts.map