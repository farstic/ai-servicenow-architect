/**
 * Agile/Scrum tools.
 * Read tools: Tier 0. Write tools: Tier 1 (WRITE_ENABLED=true).
 * Tables: rm_story, rm_epic, rm_scrum_task
 */
import type { ServiceNowClient } from '../servicenow/client.js';
export declare function agileToolManifest(): ({
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            short_description: {
                type: string;
                description: string;
            };
            story_points: {
                type: string;
                description: string;
            };
            sprint: {
                type: string;
                description: string;
            };
            epic: {
                type: string;
                description: string;
            };
            description: {
                type: string;
                description: string;
            };
            assigned_to: {
                type: string;
                description: string;
            };
            sys_id?: undefined;
            fields?: undefined;
            state?: undefined;
            limit?: undefined;
            project?: undefined;
            story_sys_id?: undefined;
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
            story_points?: undefined;
            sprint?: undefined;
            epic?: undefined;
            description?: undefined;
            assigned_to?: undefined;
            state?: undefined;
            limit?: undefined;
            project?: undefined;
            story_sys_id?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            sprint: {
                type: string;
                description: string;
            };
            state: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            short_description?: undefined;
            story_points?: undefined;
            epic?: undefined;
            description?: undefined;
            assigned_to?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            project?: undefined;
            story_sys_id?: undefined;
        };
        required: never[];
    };
} | {
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
            project: {
                type: string;
                description: string;
            };
            story_points?: undefined;
            sprint?: undefined;
            epic?: undefined;
            assigned_to?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            state?: undefined;
            limit?: undefined;
            story_sys_id?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            project: {
                type: string;
                description: string;
            };
            state: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            short_description?: undefined;
            story_points?: undefined;
            sprint?: undefined;
            epic?: undefined;
            description?: undefined;
            assigned_to?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            story_sys_id?: undefined;
        };
        required: never[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            short_description: {
                type: string;
                description: string;
            };
            story_sys_id: {
                type: string;
                description: string;
            };
            assigned_to: {
                type: string;
                description: string;
            };
            story_points?: undefined;
            sprint?: undefined;
            epic?: undefined;
            description?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            state?: undefined;
            limit?: undefined;
            project?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            story_sys_id: {
                type: string;
                description: string;
            };
            assigned_to: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            short_description?: undefined;
            story_points?: undefined;
            sprint?: undefined;
            epic?: undefined;
            description?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            state?: undefined;
            project?: undefined;
        };
        required: never[];
    };
})[];
export declare function dispatchAgileAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
//# sourceMappingURL=agile.d.ts.map