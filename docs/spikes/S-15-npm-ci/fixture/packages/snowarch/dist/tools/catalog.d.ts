/**
 * Service Catalog and Approval tools.
 * Read tools: Tier 0. Write tools: Tier 1 (WRITE_ENABLED=true).
 */
import type { ServiceNowClient } from '../servicenow/client.js';
export declare function catalogToolManifest(): ({
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            category: {
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
            short_description?: undefined;
            description?: undefined;
            price?: undefined;
            delivery_time?: undefined;
            active?: undefined;
            roles?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            quantity?: undefined;
            variables?: undefined;
            table?: undefined;
            approver_type?: undefined;
            approver?: undefined;
            condition?: undefined;
            order?: undefined;
            state?: undefined;
            comments?: undefined;
            task_sys_id?: undefined;
            cat_item_id?: undefined;
            question_text?: undefined;
            type?: undefined;
            mandatory?: undefined;
            conditions?: undefined;
            reverse_if_false?: undefined;
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
            limit: {
                type: string;
                description: string;
            };
            category?: undefined;
            sys_id_or_name?: undefined;
            name?: undefined;
            short_description?: undefined;
            description?: undefined;
            price?: undefined;
            delivery_time?: undefined;
            active?: undefined;
            roles?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            quantity?: undefined;
            variables?: undefined;
            table?: undefined;
            approver_type?: undefined;
            approver?: undefined;
            condition?: undefined;
            order?: undefined;
            state?: undefined;
            comments?: undefined;
            task_sys_id?: undefined;
            cat_item_id?: undefined;
            question_text?: undefined;
            type?: undefined;
            mandatory?: undefined;
            conditions?: undefined;
            reverse_if_false?: undefined;
        };
        required: string[];
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
            category?: undefined;
            limit?: undefined;
            query?: undefined;
            name?: undefined;
            short_description?: undefined;
            description?: undefined;
            price?: undefined;
            delivery_time?: undefined;
            active?: undefined;
            roles?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            quantity?: undefined;
            variables?: undefined;
            table?: undefined;
            approver_type?: undefined;
            approver?: undefined;
            condition?: undefined;
            order?: undefined;
            state?: undefined;
            comments?: undefined;
            task_sys_id?: undefined;
            cat_item_id?: undefined;
            question_text?: undefined;
            type?: undefined;
            mandatory?: undefined;
            conditions?: undefined;
            reverse_if_false?: undefined;
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
            short_description: {
                type: string;
                description: string;
            };
            description: {
                type: string;
                description: string;
            };
            category: {
                type: string;
                description: string;
            };
            price: {
                type: string;
                description: string;
            };
            delivery_time: {
                type: string;
                description: string;
            };
            active: {
                type: string;
                description: string;
            };
            roles: {
                type: string;
                description: string;
            };
            limit?: undefined;
            query?: undefined;
            sys_id_or_name?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            quantity?: undefined;
            variables?: undefined;
            table?: undefined;
            approver_type?: undefined;
            approver?: undefined;
            condition?: undefined;
            order?: undefined;
            state?: undefined;
            comments?: undefined;
            task_sys_id?: undefined;
            cat_item_id?: undefined;
            question_text?: undefined;
            type?: undefined;
            mandatory?: undefined;
            conditions?: undefined;
            reverse_if_false?: undefined;
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
            category?: undefined;
            limit?: undefined;
            query?: undefined;
            sys_id_or_name?: undefined;
            name?: undefined;
            short_description?: undefined;
            description?: undefined;
            price?: undefined;
            delivery_time?: undefined;
            active?: undefined;
            roles?: undefined;
            quantity?: undefined;
            variables?: undefined;
            table?: undefined;
            approver_type?: undefined;
            approver?: undefined;
            condition?: undefined;
            order?: undefined;
            state?: undefined;
            comments?: undefined;
            task_sys_id?: undefined;
            cat_item_id?: undefined;
            question_text?: undefined;
            type?: undefined;
            mandatory?: undefined;
            conditions?: undefined;
            reverse_if_false?: undefined;
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
            quantity: {
                type: string;
                description: string;
            };
            variables: {
                type: string;
                description: string;
            };
            category?: undefined;
            limit?: undefined;
            query?: undefined;
            sys_id_or_name?: undefined;
            name?: undefined;
            short_description?: undefined;
            description?: undefined;
            price?: undefined;
            delivery_time?: undefined;
            active?: undefined;
            roles?: undefined;
            fields?: undefined;
            table?: undefined;
            approver_type?: undefined;
            approver?: undefined;
            condition?: undefined;
            order?: undefined;
            state?: undefined;
            comments?: undefined;
            task_sys_id?: undefined;
            cat_item_id?: undefined;
            question_text?: undefined;
            type?: undefined;
            mandatory?: undefined;
            conditions?: undefined;
            reverse_if_false?: undefined;
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
            table: {
                type: string;
                description: string;
            };
            approver_type: {
                type: string;
                description: string;
            };
            approver: {
                type: string;
                description: string;
            };
            condition: {
                type: string;
                description: string;
            };
            active: {
                type: string;
                description: string;
            };
            order: {
                type: string;
                description: string;
            };
            category?: undefined;
            limit?: undefined;
            query?: undefined;
            sys_id_or_name?: undefined;
            short_description?: undefined;
            description?: undefined;
            price?: undefined;
            delivery_time?: undefined;
            roles?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            quantity?: undefined;
            variables?: undefined;
            state?: undefined;
            comments?: undefined;
            task_sys_id?: undefined;
            cat_item_id?: undefined;
            question_text?: undefined;
            type?: undefined;
            mandatory?: undefined;
            conditions?: undefined;
            reverse_if_false?: undefined;
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
            category?: undefined;
            limit?: undefined;
            query?: undefined;
            sys_id_or_name?: undefined;
            name?: undefined;
            short_description?: undefined;
            description?: undefined;
            price?: undefined;
            delivery_time?: undefined;
            active?: undefined;
            roles?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            quantity?: undefined;
            variables?: undefined;
            table?: undefined;
            approver_type?: undefined;
            approver?: undefined;
            condition?: undefined;
            order?: undefined;
            comments?: undefined;
            task_sys_id?: undefined;
            cat_item_id?: undefined;
            question_text?: undefined;
            type?: undefined;
            mandatory?: undefined;
            conditions?: undefined;
            reverse_if_false?: undefined;
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
            state: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            category?: undefined;
            sys_id_or_name?: undefined;
            name?: undefined;
            short_description?: undefined;
            description?: undefined;
            price?: undefined;
            delivery_time?: undefined;
            active?: undefined;
            roles?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            quantity?: undefined;
            variables?: undefined;
            table?: undefined;
            approver_type?: undefined;
            approver?: undefined;
            condition?: undefined;
            order?: undefined;
            comments?: undefined;
            task_sys_id?: undefined;
            cat_item_id?: undefined;
            question_text?: undefined;
            type?: undefined;
            mandatory?: undefined;
            conditions?: undefined;
            reverse_if_false?: undefined;
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
            comments: {
                type: string;
                description: string;
            };
            category?: undefined;
            limit?: undefined;
            query?: undefined;
            sys_id_or_name?: undefined;
            name?: undefined;
            short_description?: undefined;
            description?: undefined;
            price?: undefined;
            delivery_time?: undefined;
            active?: undefined;
            roles?: undefined;
            fields?: undefined;
            quantity?: undefined;
            variables?: undefined;
            table?: undefined;
            approver_type?: undefined;
            approver?: undefined;
            condition?: undefined;
            order?: undefined;
            state?: undefined;
            task_sys_id?: undefined;
            cat_item_id?: undefined;
            question_text?: undefined;
            type?: undefined;
            mandatory?: undefined;
            conditions?: undefined;
            reverse_if_false?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            task_sys_id: {
                type: string;
                description: string;
            };
            category?: undefined;
            limit?: undefined;
            query?: undefined;
            sys_id_or_name?: undefined;
            name?: undefined;
            short_description?: undefined;
            description?: undefined;
            price?: undefined;
            delivery_time?: undefined;
            active?: undefined;
            roles?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            quantity?: undefined;
            variables?: undefined;
            table?: undefined;
            approver_type?: undefined;
            approver?: undefined;
            condition?: undefined;
            order?: undefined;
            state?: undefined;
            comments?: undefined;
            cat_item_id?: undefined;
            question_text?: undefined;
            type?: undefined;
            mandatory?: undefined;
            conditions?: undefined;
            reverse_if_false?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            cat_item_id: {
                type: string;
                description: string;
            };
            name: {
                type: string;
                description: string;
            };
            question_text: {
                type: string;
                description: string;
            };
            type: {
                type: string;
                description: string;
            };
            order: {
                type: string;
                description: string;
            };
            mandatory: {
                type: string;
                description: string;
            };
            category?: undefined;
            limit?: undefined;
            query?: undefined;
            sys_id_or_name?: undefined;
            short_description?: undefined;
            description?: undefined;
            price?: undefined;
            delivery_time?: undefined;
            active?: undefined;
            roles?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            quantity?: undefined;
            variables?: undefined;
            table?: undefined;
            approver_type?: undefined;
            approver?: undefined;
            condition?: undefined;
            state?: undefined;
            comments?: undefined;
            task_sys_id?: undefined;
            conditions?: undefined;
            reverse_if_false?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            cat_item_id: {
                type: string;
                description: string;
            };
            short_description: {
                type: string;
                description: string;
            };
            conditions: {
                type: string;
                description: string;
            };
            reverse_if_false: {
                type: string;
                description: string;
            };
            category?: undefined;
            limit?: undefined;
            query?: undefined;
            sys_id_or_name?: undefined;
            name?: undefined;
            description?: undefined;
            price?: undefined;
            delivery_time?: undefined;
            active?: undefined;
            roles?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            quantity?: undefined;
            variables?: undefined;
            table?: undefined;
            approver_type?: undefined;
            approver?: undefined;
            condition?: undefined;
            order?: undefined;
            state?: undefined;
            comments?: undefined;
            task_sys_id?: undefined;
            question_text?: undefined;
            type?: undefined;
            mandatory?: undefined;
        };
        required: string[];
    };
})[];
export declare function dispatchCatalogAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
//# sourceMappingURL=catalog.d.ts.map