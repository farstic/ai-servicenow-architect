/**
 * Task Management tools.
 * Read tools: Tier 0. Write tools: Tier 1 (WRITE_ENABLED=true).
 */
import type { ServiceNowClient } from '../servicenow/client.js';
export declare function taskToolManifest(): ({
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            number_or_sysid: {
                type: string;
                description: string;
            };
            sys_id?: undefined;
            fields?: undefined;
            limit?: undefined;
            close_notes?: undefined;
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
            fields: {
                type: string;
                description: string;
            };
            number_or_sysid?: undefined;
            limit?: undefined;
            close_notes?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            limit: {
                type: string;
                description: string;
            };
            number_or_sysid?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            close_notes?: undefined;
        };
        required: never[];
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
            close_notes: {
                type: string;
                description: string;
            };
            number_or_sysid?: undefined;
            fields?: undefined;
            limit?: undefined;
        };
        required: string[];
    };
})[];
export declare function dispatchTaskAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
//# sourceMappingURL=task.d.ts.map