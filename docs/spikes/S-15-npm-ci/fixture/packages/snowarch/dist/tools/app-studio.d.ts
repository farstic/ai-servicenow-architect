/**
 * Scoped Application (App Studio) tools — manage ServiceNow scoped apps.
 * Read tools: Tier 0. Write/create tools: Tier 1 (WRITE_ENABLED=true).
 * ServiceNow table: sys_app (scoped applications), sys_scope (application scopes).
 */
import type { ServiceNowClient } from '../servicenow/client.js';
export declare function appStudioToolManifest(): ({
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            query: {
                type: string;
                description: string;
            };
            active: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            id?: undefined;
            name?: undefined;
            scope?: undefined;
            version?: undefined;
            short_description?: undefined;
            description?: undefined;
            vendor?: undefined;
            logo?: undefined;
            sys_id?: undefined;
            fields?: undefined;
        };
        required: never[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            id: {
                type: string;
                description: string;
            };
            query?: undefined;
            active?: undefined;
            limit?: undefined;
            name?: undefined;
            scope?: undefined;
            version?: undefined;
            short_description?: undefined;
            description?: undefined;
            vendor?: undefined;
            logo?: undefined;
            sys_id?: undefined;
            fields?: undefined;
        };
        required: string[];
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
            scope: {
                type: string;
                description: string;
            };
            version: {
                type: string;
                description: string;
            };
            short_description: {
                type: string;
                description: string;
            };
            description: {
                type: string;
                description: string;
            };
            vendor: {
                type: string;
                description: string;
            };
            active: {
                type: string;
                description: string;
            };
            logo: {
                type: string;
                description: string;
            };
            query?: undefined;
            limit?: undefined;
            id?: undefined;
            sys_id?: undefined;
            fields?: undefined;
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
            query?: undefined;
            active?: undefined;
            limit?: undefined;
            id?: undefined;
            name?: undefined;
            scope?: undefined;
            version?: undefined;
            short_description?: undefined;
            description?: undefined;
            vendor?: undefined;
            logo?: undefined;
        };
        required: string[];
    };
})[];
export declare function dispatchAppStudioAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
//# sourceMappingURL=app-studio.d.ts.map