/**
 * User and Group Management tools.
 * Read tools: Tier 0. Write tools: Tier 1 (WRITE_ENABLED=true).
 */
import type { ServiceNowClient } from '../servicenow/client.js';
export declare function userToolManifest(): ({
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            query: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            user_name?: undefined;
            email?: undefined;
            first_name?: undefined;
            last_name?: undefined;
            title?: undefined;
            department?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            name?: undefined;
            description?: undefined;
            manager?: undefined;
            user_sys_id?: undefined;
            group_sys_id?: undefined;
            member_sys_id?: undefined;
        };
        required: never[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            user_name: {
                type: string;
                description: string;
            };
            email: {
                type: string;
                description: string;
            };
            first_name: {
                type: string;
                description: string;
            };
            last_name: {
                type: string;
                description: string;
            };
            title: {
                type: string;
                description: string;
            };
            department: {
                type: string;
                description: string;
            };
            query?: undefined;
            limit?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            name?: undefined;
            description?: undefined;
            manager?: undefined;
            user_sys_id?: undefined;
            group_sys_id?: undefined;
            member_sys_id?: undefined;
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
            limit?: undefined;
            user_name?: undefined;
            email?: undefined;
            first_name?: undefined;
            last_name?: undefined;
            title?: undefined;
            department?: undefined;
            name?: undefined;
            description?: undefined;
            manager?: undefined;
            user_sys_id?: undefined;
            group_sys_id?: undefined;
            member_sys_id?: undefined;
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
            description: {
                type: string;
                description: string;
            };
            manager: {
                type: string;
                description: string;
            };
            query?: undefined;
            limit?: undefined;
            user_name?: undefined;
            email?: undefined;
            first_name?: undefined;
            last_name?: undefined;
            title?: undefined;
            department?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            user_sys_id?: undefined;
            group_sys_id?: undefined;
            member_sys_id?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            user_sys_id: {
                type: string;
                description: string;
            };
            group_sys_id: {
                type: string;
                description: string;
            };
            query?: undefined;
            limit?: undefined;
            user_name?: undefined;
            email?: undefined;
            first_name?: undefined;
            last_name?: undefined;
            title?: undefined;
            department?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            name?: undefined;
            description?: undefined;
            manager?: undefined;
            member_sys_id?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            member_sys_id: {
                type: string;
                description: string;
            };
            query?: undefined;
            limit?: undefined;
            user_name?: undefined;
            email?: undefined;
            first_name?: undefined;
            last_name?: undefined;
            title?: undefined;
            department?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            name?: undefined;
            description?: undefined;
            manager?: undefined;
            user_sys_id?: undefined;
            group_sys_id?: undefined;
        };
        required: string[];
    };
})[];
export declare function dispatchUserAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
//# sourceMappingURL=user.d.ts.map