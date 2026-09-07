/**
 * Flow Designer tools — list, inspect, trigger, and monitor flows and subflows.
 * Read tools: Tier 0. Trigger/create tools: Tier 1 (WRITE_ENABLED=true).
 */
import type { ServiceNowClient } from '../servicenow/client.js';
export declare function flowToolManifest(): ({
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
            category: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            name_or_sysid?: undefined;
            flow_sys_id?: undefined;
            inputs?: undefined;
            execution_sysid?: undefined;
            status?: undefined;
            name?: undefined;
            description?: undefined;
            trigger_type?: undefined;
            trigger_table?: undefined;
            scope?: undefined;
            outputs?: undefined;
            script?: undefined;
            type?: undefined;
            test_inputs?: undefined;
            days?: undefined;
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
            active?: undefined;
            category?: undefined;
            limit?: undefined;
            flow_sys_id?: undefined;
            inputs?: undefined;
            execution_sysid?: undefined;
            status?: undefined;
            name?: undefined;
            description?: undefined;
            trigger_type?: undefined;
            trigger_table?: undefined;
            scope?: undefined;
            outputs?: undefined;
            script?: undefined;
            type?: undefined;
            test_inputs?: undefined;
            days?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            flow_sys_id: {
                type: string;
                description: string;
            };
            inputs: {
                type: string;
                description: string;
                items?: undefined;
            };
            query?: undefined;
            active?: undefined;
            category?: undefined;
            limit?: undefined;
            name_or_sysid?: undefined;
            execution_sysid?: undefined;
            status?: undefined;
            name?: undefined;
            description?: undefined;
            trigger_type?: undefined;
            trigger_table?: undefined;
            scope?: undefined;
            outputs?: undefined;
            script?: undefined;
            type?: undefined;
            test_inputs?: undefined;
            days?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            execution_sysid: {
                type: string;
                description: string;
            };
            query?: undefined;
            active?: undefined;
            category?: undefined;
            limit?: undefined;
            name_or_sysid?: undefined;
            flow_sys_id?: undefined;
            inputs?: undefined;
            status?: undefined;
            name?: undefined;
            description?: undefined;
            trigger_type?: undefined;
            trigger_table?: undefined;
            scope?: undefined;
            outputs?: undefined;
            script?: undefined;
            type?: undefined;
            test_inputs?: undefined;
            days?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            flow_sys_id: {
                type: string;
                description: string;
            };
            status: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            query?: undefined;
            active?: undefined;
            category?: undefined;
            name_or_sysid?: undefined;
            inputs?: undefined;
            execution_sysid?: undefined;
            name?: undefined;
            description?: undefined;
            trigger_type?: undefined;
            trigger_table?: undefined;
            scope?: undefined;
            outputs?: undefined;
            script?: undefined;
            type?: undefined;
            test_inputs?: undefined;
            days?: undefined;
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
            active: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            category?: undefined;
            name_or_sysid?: undefined;
            flow_sys_id?: undefined;
            inputs?: undefined;
            execution_sysid?: undefined;
            status?: undefined;
            name?: undefined;
            description?: undefined;
            trigger_type?: undefined;
            trigger_table?: undefined;
            scope?: undefined;
            outputs?: undefined;
            script?: undefined;
            type?: undefined;
            test_inputs?: undefined;
            days?: undefined;
        };
        required: never[];
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
            category: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            active?: undefined;
            name_or_sysid?: undefined;
            flow_sys_id?: undefined;
            inputs?: undefined;
            execution_sysid?: undefined;
            status?: undefined;
            name?: undefined;
            description?: undefined;
            trigger_type?: undefined;
            trigger_table?: undefined;
            scope?: undefined;
            outputs?: undefined;
            script?: undefined;
            type?: undefined;
            test_inputs?: undefined;
            days?: undefined;
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
            trigger_type: {
                type: string;
                description: string;
            };
            trigger_table: {
                type: string;
                description: string;
            };
            scope: {
                type: string;
                description: string;
            };
            query?: undefined;
            active?: undefined;
            category?: undefined;
            limit?: undefined;
            name_or_sysid?: undefined;
            flow_sys_id?: undefined;
            inputs?: undefined;
            execution_sysid?: undefined;
            status?: undefined;
            outputs?: undefined;
            script?: undefined;
            type?: undefined;
            test_inputs?: undefined;
            days?: undefined;
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
            inputs: {
                type: string;
                items: {
                    type: string;
                };
                description: string;
            };
            scope: {
                type: string;
                description: string;
            };
            query?: undefined;
            active?: undefined;
            category?: undefined;
            limit?: undefined;
            name_or_sysid?: undefined;
            flow_sys_id?: undefined;
            execution_sysid?: undefined;
            status?: undefined;
            trigger_type?: undefined;
            trigger_table?: undefined;
            outputs?: undefined;
            script?: undefined;
            type?: undefined;
            test_inputs?: undefined;
            days?: undefined;
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
            inputs: {
                type: string;
                items: {
                    type: string;
                };
                description: string;
            };
            outputs: {
                type: string;
                items: {
                    type: string;
                };
                description: string;
            };
            script: {
                type: string;
                description: string;
            };
            query?: undefined;
            active?: undefined;
            category?: undefined;
            limit?: undefined;
            name_or_sysid?: undefined;
            flow_sys_id?: undefined;
            execution_sysid?: undefined;
            status?: undefined;
            trigger_type?: undefined;
            trigger_table?: undefined;
            scope?: undefined;
            type?: undefined;
            test_inputs?: undefined;
            days?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            flow_sys_id: {
                type: string;
                description: string;
            };
            type: {
                type: string;
                description: string;
            };
            query?: undefined;
            active?: undefined;
            category?: undefined;
            limit?: undefined;
            name_or_sysid?: undefined;
            inputs?: undefined;
            execution_sysid?: undefined;
            status?: undefined;
            name?: undefined;
            description?: undefined;
            trigger_type?: undefined;
            trigger_table?: undefined;
            scope?: undefined;
            outputs?: undefined;
            script?: undefined;
            test_inputs?: undefined;
            days?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            flow_sys_id: {
                type: string;
                description: string;
            };
            test_inputs: {
                type: string;
                description: string;
            };
            query?: undefined;
            active?: undefined;
            category?: undefined;
            limit?: undefined;
            name_or_sysid?: undefined;
            inputs?: undefined;
            execution_sysid?: undefined;
            status?: undefined;
            name?: undefined;
            description?: undefined;
            trigger_type?: undefined;
            trigger_table?: undefined;
            scope?: undefined;
            outputs?: undefined;
            script?: undefined;
            type?: undefined;
            days?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            flow_sys_id: {
                type: string;
                description: string;
            };
            days: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            query?: undefined;
            active?: undefined;
            category?: undefined;
            name_or_sysid?: undefined;
            inputs?: undefined;
            execution_sysid?: undefined;
            status?: undefined;
            name?: undefined;
            description?: undefined;
            trigger_type?: undefined;
            trigger_table?: undefined;
            scope?: undefined;
            outputs?: undefined;
            script?: undefined;
            type?: undefined;
            test_inputs?: undefined;
        };
        required: string[];
    };
})[];
export declare function dispatchFlowAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
//# sourceMappingURL=flow.d.ts.map