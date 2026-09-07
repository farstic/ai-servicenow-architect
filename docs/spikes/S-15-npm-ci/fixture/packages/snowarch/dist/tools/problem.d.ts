/**
 * Problem Management tools.
 * Read tools: Tier 0. Write tools: Tier 1 (WRITE_ENABLED=true).
 */
import type { ServiceNowClient } from '../servicenow/client.js';
export declare function problemToolManifest(): ({
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            short_description: {
                type: string;
                description: string;
            };
            description: {
                type: string;
                description: string;
            };
            assignment_group: {
                type: string;
                description: string;
            };
            priority: {
                type: string;
                description: string;
            };
            number_or_sysid?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            root_cause?: undefined;
            resolution_notes?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            number_or_sysid: {
                type: string;
                description: string;
            };
            short_description?: undefined;
            description?: undefined;
            assignment_group?: undefined;
            priority?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            root_cause?: undefined;
            resolution_notes?: undefined;
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
            short_description?: undefined;
            description?: undefined;
            assignment_group?: undefined;
            priority?: undefined;
            number_or_sysid?: undefined;
            root_cause?: undefined;
            resolution_notes?: undefined;
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
            root_cause: {
                type: string;
                description: string;
            };
            resolution_notes: {
                type: string;
                description: string;
            };
            short_description?: undefined;
            description?: undefined;
            assignment_group?: undefined;
            priority?: undefined;
            number_or_sysid?: undefined;
            fields?: undefined;
        };
        required: string[];
    };
})[];
export declare function dispatchProblemAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
//# sourceMappingURL=problem.d.ts.map