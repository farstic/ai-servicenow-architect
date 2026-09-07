/**
 * Update Set management tools — full lifecycle for ServiceNow Update Sets.
 *
 * Goes beyond the basic changeset tools in script.ts to provide:
 * - Create / switch / preview / complete / export
 * - Auto-creation guard (ensure active update set exists)
 * - Batch artifact registration
 *
 * Tier 0 (Read):  get_current_update_set, list_update_sets, preview_update_set
 * Tier 3 (Script): create_update_set, switch_update_set, complete_update_set,
 *                   export_update_set, retrieve_remote_update_set
 *
 * ServiceNow tables: sys_update_set, sys_update_xml, sys_remote_update_set
 */
import type { ServiceNowClient } from '../servicenow/client.js';
export declare function updateSetToolManifest(): ({
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            state?: undefined;
            query?: undefined;
            limit?: undefined;
            name?: undefined;
            description?: undefined;
            release?: undefined;
            switch_to?: undefined;
            sys_id?: undefined;
            default_name?: undefined;
        };
        required: never[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            state: {
                type: string;
                description: string;
            };
            query: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            name?: undefined;
            description?: undefined;
            release?: undefined;
            switch_to?: undefined;
            sys_id?: undefined;
            default_name?: undefined;
        };
        required: never[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            name: {
                type: string;
                description: string;
            };
            description: {
                type: string;
                description: string;
            };
            release: {
                type: string;
                description: string;
            };
            switch_to: {
                type: string;
                description: string;
            };
            state?: undefined;
            query?: undefined;
            limit?: undefined;
            sys_id?: undefined;
            default_name?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            sys_id: {
                type: string;
                description: string;
            };
            state?: undefined;
            query?: undefined;
            limit?: undefined;
            name?: undefined;
            description?: undefined;
            release?: undefined;
            switch_to?: undefined;
            default_name?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            sys_id: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            state?: undefined;
            query?: undefined;
            name?: undefined;
            description?: undefined;
            release?: undefined;
            switch_to?: undefined;
            default_name?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            default_name: {
                type: string;
                description: string;
            };
            state?: undefined;
            query?: undefined;
            limit?: undefined;
            name?: undefined;
            description?: undefined;
            release?: undefined;
            switch_to?: undefined;
            sys_id?: undefined;
        };
        required: never[];
    };
})[];
export declare function dispatchUpdateSetAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
//# sourceMappingURL=updateset.d.ts.map