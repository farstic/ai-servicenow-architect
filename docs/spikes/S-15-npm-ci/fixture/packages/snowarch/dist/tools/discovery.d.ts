/**
 * Dynamic Schema Discovery tool — reads table schema at runtime and generates
 * ad-hoc CRUD tools for any ServiceNow table.
 *
 * Tools:
 *   discover_table — Discover a table's schema and register dynamic CRUD tools
 */
import type { ServiceNowClient } from '../servicenow/client.js';
export declare function discoveryToolManifest(): {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            table: {
                type: string;
                description: string;
            };
            operations: {
                type: string;
                description: string;
                items: {
                    type: string;
                    enum: string[];
                };
            };
        };
        required: string[];
    };
}[];
export declare function dispatchDiscoveryAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
/** Execute a dynamically discovered tool. */
export declare function dispatchDynamicAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
//# sourceMappingURL=discovery.d.ts.map