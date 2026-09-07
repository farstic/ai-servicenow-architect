/**
 * Integration tools — REST Messages, Transform Maps, Import Sets, and Event Registry.
 * Read tools: Tier 0. Write tools: Tier 1 (WRITE_ENABLED=true).
 * Inspired by snow-flow's "Automation/Integration" category.
 */
import type { ServiceNowClient } from '../servicenow/client.js';
export declare function integrationToolManifest(): ({
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
            sys_id_or_name?: undefined;
            rest_message_sys_id?: undefined;
            name?: undefined;
            endpoint?: undefined;
            description?: undefined;
            use_mutual_auth?: undefined;
            authentication_type?: undefined;
            target_table?: undefined;
            transform_map_sys_id?: undefined;
            import_set_sys_id?: undefined;
            state?: undefined;
            sys_id?: undefined;
            staging_table?: undefined;
            data?: undefined;
            type?: undefined;
            name_or_sysid?: undefined;
            table?: undefined;
            event_name?: undefined;
            record_sys_id?: undefined;
            parm1?: undefined;
            parm2?: undefined;
        };
        required: never[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            sys_id_or_name: {
                type: string;
                description: string;
            };
            query?: undefined;
            limit?: undefined;
            rest_message_sys_id?: undefined;
            name?: undefined;
            endpoint?: undefined;
            description?: undefined;
            use_mutual_auth?: undefined;
            authentication_type?: undefined;
            target_table?: undefined;
            transform_map_sys_id?: undefined;
            import_set_sys_id?: undefined;
            state?: undefined;
            sys_id?: undefined;
            staging_table?: undefined;
            data?: undefined;
            type?: undefined;
            name_or_sysid?: undefined;
            table?: undefined;
            event_name?: undefined;
            record_sys_id?: undefined;
            parm1?: undefined;
            parm2?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            rest_message_sys_id: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            query?: undefined;
            sys_id_or_name?: undefined;
            name?: undefined;
            endpoint?: undefined;
            description?: undefined;
            use_mutual_auth?: undefined;
            authentication_type?: undefined;
            target_table?: undefined;
            transform_map_sys_id?: undefined;
            import_set_sys_id?: undefined;
            state?: undefined;
            sys_id?: undefined;
            staging_table?: undefined;
            data?: undefined;
            type?: undefined;
            name_or_sysid?: undefined;
            table?: undefined;
            event_name?: undefined;
            record_sys_id?: undefined;
            parm1?: undefined;
            parm2?: undefined;
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
            endpoint: {
                type: string;
                description: string;
            };
            description: {
                type: string;
                description: string;
            };
            use_mutual_auth: {
                type: string;
                description: string;
            };
            authentication_type: {
                type: string;
                description: string;
            };
            query?: undefined;
            limit?: undefined;
            sys_id_or_name?: undefined;
            rest_message_sys_id?: undefined;
            target_table?: undefined;
            transform_map_sys_id?: undefined;
            import_set_sys_id?: undefined;
            state?: undefined;
            sys_id?: undefined;
            staging_table?: undefined;
            data?: undefined;
            type?: undefined;
            name_or_sysid?: undefined;
            table?: undefined;
            event_name?: undefined;
            record_sys_id?: undefined;
            parm1?: undefined;
            parm2?: undefined;
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
            target_table: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            sys_id_or_name?: undefined;
            rest_message_sys_id?: undefined;
            name?: undefined;
            endpoint?: undefined;
            description?: undefined;
            use_mutual_auth?: undefined;
            authentication_type?: undefined;
            transform_map_sys_id?: undefined;
            import_set_sys_id?: undefined;
            state?: undefined;
            sys_id?: undefined;
            staging_table?: undefined;
            data?: undefined;
            type?: undefined;
            name_or_sysid?: undefined;
            table?: undefined;
            event_name?: undefined;
            record_sys_id?: undefined;
            parm1?: undefined;
            parm2?: undefined;
        };
        required: never[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            transform_map_sys_id: {
                type: string;
                description: string;
            };
            import_set_sys_id: {
                type: string;
                description: string;
            };
            query?: undefined;
            limit?: undefined;
            sys_id_or_name?: undefined;
            rest_message_sys_id?: undefined;
            name?: undefined;
            endpoint?: undefined;
            description?: undefined;
            use_mutual_auth?: undefined;
            authentication_type?: undefined;
            target_table?: undefined;
            state?: undefined;
            sys_id?: undefined;
            staging_table?: undefined;
            data?: undefined;
            type?: undefined;
            name_or_sysid?: undefined;
            table?: undefined;
            event_name?: undefined;
            record_sys_id?: undefined;
            parm1?: undefined;
            parm2?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            transform_map_sys_id: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            query?: undefined;
            sys_id_or_name?: undefined;
            rest_message_sys_id?: undefined;
            name?: undefined;
            endpoint?: undefined;
            description?: undefined;
            use_mutual_auth?: undefined;
            authentication_type?: undefined;
            target_table?: undefined;
            import_set_sys_id?: undefined;
            state?: undefined;
            sys_id?: undefined;
            staging_table?: undefined;
            data?: undefined;
            type?: undefined;
            name_or_sysid?: undefined;
            table?: undefined;
            event_name?: undefined;
            record_sys_id?: undefined;
            parm1?: undefined;
            parm2?: undefined;
        };
        required: string[];
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
            sys_id_or_name?: undefined;
            rest_message_sys_id?: undefined;
            name?: undefined;
            endpoint?: undefined;
            description?: undefined;
            use_mutual_auth?: undefined;
            authentication_type?: undefined;
            target_table?: undefined;
            transform_map_sys_id?: undefined;
            import_set_sys_id?: undefined;
            sys_id?: undefined;
            staging_table?: undefined;
            data?: undefined;
            type?: undefined;
            name_or_sysid?: undefined;
            table?: undefined;
            event_name?: undefined;
            record_sys_id?: undefined;
            parm1?: undefined;
            parm2?: undefined;
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
            query?: undefined;
            limit?: undefined;
            sys_id_or_name?: undefined;
            rest_message_sys_id?: undefined;
            name?: undefined;
            endpoint?: undefined;
            description?: undefined;
            use_mutual_auth?: undefined;
            authentication_type?: undefined;
            target_table?: undefined;
            transform_map_sys_id?: undefined;
            import_set_sys_id?: undefined;
            state?: undefined;
            staging_table?: undefined;
            data?: undefined;
            type?: undefined;
            name_or_sysid?: undefined;
            table?: undefined;
            event_name?: undefined;
            record_sys_id?: undefined;
            parm1?: undefined;
            parm2?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            staging_table: {
                type: string;
                description: string;
            };
            data: {
                type: string;
                description: string;
            };
            query?: undefined;
            limit?: undefined;
            sys_id_or_name?: undefined;
            rest_message_sys_id?: undefined;
            name?: undefined;
            endpoint?: undefined;
            description?: undefined;
            use_mutual_auth?: undefined;
            authentication_type?: undefined;
            target_table?: undefined;
            transform_map_sys_id?: undefined;
            import_set_sys_id?: undefined;
            state?: undefined;
            sys_id?: undefined;
            type?: undefined;
            name_or_sysid?: undefined;
            table?: undefined;
            event_name?: undefined;
            record_sys_id?: undefined;
            parm1?: undefined;
            parm2?: undefined;
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
            type: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            sys_id_or_name?: undefined;
            rest_message_sys_id?: undefined;
            name?: undefined;
            endpoint?: undefined;
            description?: undefined;
            use_mutual_auth?: undefined;
            authentication_type?: undefined;
            target_table?: undefined;
            transform_map_sys_id?: undefined;
            import_set_sys_id?: undefined;
            state?: undefined;
            sys_id?: undefined;
            staging_table?: undefined;
            data?: undefined;
            name_or_sysid?: undefined;
            table?: undefined;
            event_name?: undefined;
            record_sys_id?: undefined;
            parm1?: undefined;
            parm2?: undefined;
        };
        required: never[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            name_or_sysid: {
                type: string;
                description: string;
            };
            query?: undefined;
            limit?: undefined;
            sys_id_or_name?: undefined;
            rest_message_sys_id?: undefined;
            name?: undefined;
            endpoint?: undefined;
            description?: undefined;
            use_mutual_auth?: undefined;
            authentication_type?: undefined;
            target_table?: undefined;
            transform_map_sys_id?: undefined;
            import_set_sys_id?: undefined;
            state?: undefined;
            sys_id?: undefined;
            staging_table?: undefined;
            data?: undefined;
            type?: undefined;
            table?: undefined;
            event_name?: undefined;
            record_sys_id?: undefined;
            parm1?: undefined;
            parm2?: undefined;
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
            table: {
                type: string;
                description: string;
            };
            query?: undefined;
            limit?: undefined;
            sys_id_or_name?: undefined;
            rest_message_sys_id?: undefined;
            endpoint?: undefined;
            use_mutual_auth?: undefined;
            authentication_type?: undefined;
            target_table?: undefined;
            transform_map_sys_id?: undefined;
            import_set_sys_id?: undefined;
            state?: undefined;
            sys_id?: undefined;
            staging_table?: undefined;
            data?: undefined;
            type?: undefined;
            name_or_sysid?: undefined;
            event_name?: undefined;
            record_sys_id?: undefined;
            parm1?: undefined;
            parm2?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            event_name: {
                type: string;
                description: string;
            };
            table: {
                type: string;
                description: string;
            };
            record_sys_id: {
                type: string;
                description: string;
            };
            parm1: {
                type: string;
                description: string;
            };
            parm2: {
                type: string;
                description: string;
            };
            query?: undefined;
            limit?: undefined;
            sys_id_or_name?: undefined;
            rest_message_sys_id?: undefined;
            name?: undefined;
            endpoint?: undefined;
            description?: undefined;
            use_mutual_auth?: undefined;
            authentication_type?: undefined;
            target_table?: undefined;
            transform_map_sys_id?: undefined;
            import_set_sys_id?: undefined;
            state?: undefined;
            sys_id?: undefined;
            staging_table?: undefined;
            data?: undefined;
            type?: undefined;
            name_or_sysid?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            event_name: {
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
            query?: undefined;
            sys_id_or_name?: undefined;
            rest_message_sys_id?: undefined;
            name?: undefined;
            endpoint?: undefined;
            description?: undefined;
            use_mutual_auth?: undefined;
            authentication_type?: undefined;
            target_table?: undefined;
            transform_map_sys_id?: undefined;
            import_set_sys_id?: undefined;
            sys_id?: undefined;
            staging_table?: undefined;
            data?: undefined;
            type?: undefined;
            name_or_sysid?: undefined;
            table?: undefined;
            record_sys_id?: undefined;
            parm1?: undefined;
            parm2?: undefined;
        };
        required: never[];
    };
})[];
export declare function dispatchIntegrationAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
//# sourceMappingURL=integration.d.ts.map