/**
 * Core platform tools – the original 15 tools migrated from tools/index.ts.
 * These are always available (Tier 0).
 */
import type { ServiceNowClient } from '../servicenow/client.js';
export declare function coreToolManifest(): ({
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            table: {
                type: string;
                description: string;
            };
            query: {
                type: string;
                description: string;
            };
            fields: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            orderBy: {
                type: string;
                description: string;
            };
            sys_id?: undefined;
            user_identifier?: undefined;
            group_identifier?: undefined;
            ci_sys_id?: undefined;
            active_only?: undefined;
            service_sys_id?: undefined;
            instruction?: undefined;
            name?: undefined;
            parent?: undefined;
            child?: undefined;
            type?: undefined;
            depth?: undefined;
            schedule_id?: undefined;
            mid_server?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            table: {
                type: string;
                description: string;
            };
            query?: undefined;
            fields?: undefined;
            limit?: undefined;
            orderBy?: undefined;
            sys_id?: undefined;
            user_identifier?: undefined;
            group_identifier?: undefined;
            ci_sys_id?: undefined;
            active_only?: undefined;
            service_sys_id?: undefined;
            instruction?: undefined;
            name?: undefined;
            parent?: undefined;
            child?: undefined;
            type?: undefined;
            depth?: undefined;
            schedule_id?: undefined;
            mid_server?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            table: {
                type: string;
                description: string;
            };
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
            orderBy?: undefined;
            user_identifier?: undefined;
            group_identifier?: undefined;
            ci_sys_id?: undefined;
            active_only?: undefined;
            service_sys_id?: undefined;
            instruction?: undefined;
            name?: undefined;
            parent?: undefined;
            child?: undefined;
            type?: undefined;
            depth?: undefined;
            schedule_id?: undefined;
            mid_server?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            table: {
                type: string;
                description: string;
            };
            fields: {
                type: string;
                description: string;
            };
            query?: undefined;
            limit?: undefined;
            orderBy?: undefined;
            sys_id?: undefined;
            user_identifier?: undefined;
            group_identifier?: undefined;
            ci_sys_id?: undefined;
            active_only?: undefined;
            service_sys_id?: undefined;
            instruction?: undefined;
            name?: undefined;
            parent?: undefined;
            child?: undefined;
            type?: undefined;
            depth?: undefined;
            schedule_id?: undefined;
            mid_server?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            table: {
                type: string;
                description: string;
            };
            sys_id: {
                type: string;
                description: string;
            };
            query?: undefined;
            fields?: undefined;
            limit?: undefined;
            orderBy?: undefined;
            user_identifier?: undefined;
            group_identifier?: undefined;
            ci_sys_id?: undefined;
            active_only?: undefined;
            service_sys_id?: undefined;
            instruction?: undefined;
            name?: undefined;
            parent?: undefined;
            child?: undefined;
            type?: undefined;
            depth?: undefined;
            schedule_id?: undefined;
            mid_server?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            user_identifier: {
                type: string;
                description: string;
            };
            table?: undefined;
            query?: undefined;
            fields?: undefined;
            limit?: undefined;
            orderBy?: undefined;
            sys_id?: undefined;
            group_identifier?: undefined;
            ci_sys_id?: undefined;
            active_only?: undefined;
            service_sys_id?: undefined;
            instruction?: undefined;
            name?: undefined;
            parent?: undefined;
            child?: undefined;
            type?: undefined;
            depth?: undefined;
            schedule_id?: undefined;
            mid_server?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            group_identifier: {
                type: string;
                description: string;
            };
            table?: undefined;
            query?: undefined;
            fields?: undefined;
            limit?: undefined;
            orderBy?: undefined;
            sys_id?: undefined;
            user_identifier?: undefined;
            ci_sys_id?: undefined;
            active_only?: undefined;
            service_sys_id?: undefined;
            instruction?: undefined;
            name?: undefined;
            parent?: undefined;
            child?: undefined;
            type?: undefined;
            depth?: undefined;
            schedule_id?: undefined;
            mid_server?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            ci_sys_id: {
                type: string;
                description: string;
            };
            fields: {
                type: string;
                description: string;
            };
            table?: undefined;
            query?: undefined;
            limit?: undefined;
            orderBy?: undefined;
            sys_id?: undefined;
            user_identifier?: undefined;
            group_identifier?: undefined;
            active_only?: undefined;
            service_sys_id?: undefined;
            instruction?: undefined;
            name?: undefined;
            parent?: undefined;
            child?: undefined;
            type?: undefined;
            depth?: undefined;
            schedule_id?: undefined;
            mid_server?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            ci_sys_id: {
                type: string;
                description: string;
            };
            table?: undefined;
            query?: undefined;
            fields?: undefined;
            limit?: undefined;
            orderBy?: undefined;
            sys_id?: undefined;
            user_identifier?: undefined;
            group_identifier?: undefined;
            active_only?: undefined;
            service_sys_id?: undefined;
            instruction?: undefined;
            name?: undefined;
            parent?: undefined;
            child?: undefined;
            type?: undefined;
            depth?: undefined;
            schedule_id?: undefined;
            mid_server?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            active_only: {
                type: string;
                description: string;
            };
            table?: undefined;
            query?: undefined;
            fields?: undefined;
            limit?: undefined;
            orderBy?: undefined;
            sys_id?: undefined;
            user_identifier?: undefined;
            group_identifier?: undefined;
            ci_sys_id?: undefined;
            service_sys_id?: undefined;
            instruction?: undefined;
            name?: undefined;
            parent?: undefined;
            child?: undefined;
            type?: undefined;
            depth?: undefined;
            schedule_id?: undefined;
            mid_server?: undefined;
        };
        required: never[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            table?: undefined;
            query?: undefined;
            fields?: undefined;
            limit?: undefined;
            orderBy?: undefined;
            sys_id?: undefined;
            user_identifier?: undefined;
            group_identifier?: undefined;
            ci_sys_id?: undefined;
            active_only?: undefined;
            service_sys_id?: undefined;
            instruction?: undefined;
            name?: undefined;
            parent?: undefined;
            child?: undefined;
            type?: undefined;
            depth?: undefined;
            schedule_id?: undefined;
            mid_server?: undefined;
        };
        required: never[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            service_sys_id: {
                type: string;
                description: string;
            };
            table?: undefined;
            query?: undefined;
            fields?: undefined;
            limit?: undefined;
            orderBy?: undefined;
            sys_id?: undefined;
            user_identifier?: undefined;
            group_identifier?: undefined;
            ci_sys_id?: undefined;
            active_only?: undefined;
            instruction?: undefined;
            name?: undefined;
            parent?: undefined;
            child?: undefined;
            type?: undefined;
            depth?: undefined;
            schedule_id?: undefined;
            mid_server?: undefined;
        };
        required: string[];
    };
} | {
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
            table?: undefined;
            fields?: undefined;
            orderBy?: undefined;
            sys_id?: undefined;
            user_identifier?: undefined;
            group_identifier?: undefined;
            ci_sys_id?: undefined;
            active_only?: undefined;
            service_sys_id?: undefined;
            instruction?: undefined;
            name?: undefined;
            parent?: undefined;
            child?: undefined;
            type?: undefined;
            depth?: undefined;
            schedule_id?: undefined;
            mid_server?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            instruction: {
                type: string;
                description: string;
            };
            table: {
                type: string;
                description: string;
            };
            query?: undefined;
            fields?: undefined;
            limit?: undefined;
            orderBy?: undefined;
            sys_id?: undefined;
            user_identifier?: undefined;
            group_identifier?: undefined;
            ci_sys_id?: undefined;
            active_only?: undefined;
            service_sys_id?: undefined;
            name?: undefined;
            parent?: undefined;
            child?: undefined;
            type?: undefined;
            depth?: undefined;
            schedule_id?: undefined;
            mid_server?: undefined;
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
            table?: undefined;
            query?: undefined;
            fields?: undefined;
            limit?: undefined;
            orderBy?: undefined;
            sys_id?: undefined;
            user_identifier?: undefined;
            group_identifier?: undefined;
            ci_sys_id?: undefined;
            active_only?: undefined;
            service_sys_id?: undefined;
            instruction?: undefined;
            parent?: undefined;
            child?: undefined;
            type?: undefined;
            depth?: undefined;
            schedule_id?: undefined;
            mid_server?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            parent: {
                type: string;
                description: string;
            };
            child: {
                type: string;
                description: string;
            };
            type: {
                type: string;
                description: string;
            };
            table?: undefined;
            query?: undefined;
            fields?: undefined;
            limit?: undefined;
            orderBy?: undefined;
            sys_id?: undefined;
            user_identifier?: undefined;
            group_identifier?: undefined;
            ci_sys_id?: undefined;
            active_only?: undefined;
            service_sys_id?: undefined;
            instruction?: undefined;
            name?: undefined;
            depth?: undefined;
            schedule_id?: undefined;
            mid_server?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            ci_sys_id: {
                type: string;
                description: string;
            };
            depth: {
                type: string;
                description: string;
            };
            table?: undefined;
            query?: undefined;
            fields?: undefined;
            limit?: undefined;
            orderBy?: undefined;
            sys_id?: undefined;
            user_identifier?: undefined;
            group_identifier?: undefined;
            active_only?: undefined;
            service_sys_id?: undefined;
            instruction?: undefined;
            name?: undefined;
            parent?: undefined;
            child?: undefined;
            type?: undefined;
            schedule_id?: undefined;
            mid_server?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            schedule_id: {
                type: string;
                description: string;
            };
            mid_server: {
                type: string;
                description: string;
            };
            table?: undefined;
            query?: undefined;
            fields?: undefined;
            limit?: undefined;
            orderBy?: undefined;
            sys_id?: undefined;
            user_identifier?: undefined;
            group_identifier?: undefined;
            ci_sys_id?: undefined;
            active_only?: undefined;
            service_sys_id?: undefined;
            instruction?: undefined;
            name?: undefined;
            parent?: undefined;
            child?: undefined;
            type?: undefined;
            depth?: undefined;
        };
        required: string[];
    };
})[];
export declare function dispatchCoreAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
//# sourceMappingURL=core.d.ts.map