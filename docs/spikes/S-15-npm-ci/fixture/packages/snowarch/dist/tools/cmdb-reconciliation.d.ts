/**
 * CMDB Reconciliation tools — find duplicates, orphans, stale CIs, and reconcile.
 * Read tools: Tier 0. Reconcile action: Tier 2 (CMDB_WRITE_ENABLED=true).
 */
import type { ServiceNowClient } from '../servicenow/client.js';
export declare function cmdbReconciliationToolManifest(): ({
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            ci_class: {
                type: string;
                description: string;
            };
            match_fields: {
                type: string;
                items: {
                    type: string;
                };
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            days_threshold?: undefined;
            action?: undefined;
            targets?: undefined;
            dry_run?: undefined;
        };
        required: never[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            ci_class: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            match_fields?: undefined;
            days_threshold?: undefined;
            action?: undefined;
            targets?: undefined;
            dry_run?: undefined;
        };
        required: never[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            ci_class: {
                type: string;
                description: string;
            };
            days_threshold: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            match_fields?: undefined;
            action?: undefined;
            targets?: undefined;
            dry_run?: undefined;
        };
        required: never[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            action: {
                type: string;
                enum: string[];
                description: string;
            };
            targets: {
                type: string;
                items: {
                    type: string;
                };
                description: string;
            };
            dry_run: {
                type: string;
                description: string;
            };
            ci_class?: undefined;
            match_fields?: undefined;
            limit?: undefined;
            days_threshold?: undefined;
        };
        required: string[];
    };
})[];
export declare function dispatchCmdbReconciliationAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
//# sourceMappingURL=cmdb-reconciliation.d.ts.map