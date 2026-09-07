/**
 * Virtual Agent (VA) creation and management tools.
 *
 * Extends the read-only VA listing in now-assist.ts with full topic/conversation authoring.
 *
 * Tier 0 (Read):  list_va_topics (already in now-assist), get_va_conversation, discover_va_topics
 * Tier 1 (Write): create_va_topic, update_va_topic
 * Tier AI:        send_va_message (requires NOW_ASSIST_ENABLED)
 *
 * ServiceNow tables: sys_cs_topic, sys_cs_conversation, sys_cs_topic_block
 * API: /api/sn_cs/topic, /api/sn_cs/bot/integration
 */
import type { ServiceNowClient } from '../servicenow/client.js';
export declare function vaToolManifest(): ({
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
            category: {
                type: string;
                description: string;
            };
            active: {
                type: string;
                description: string;
            };
            fulfillment_type: {
                type: string;
                description: string;
            };
            sys_id?: undefined;
            fields?: undefined;
            query?: undefined;
            limit?: undefined;
            conversation_id?: undefined;
            topic_sys_id?: undefined;
            user_sys_id?: undefined;
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
            name?: undefined;
            description?: undefined;
            category?: undefined;
            active?: undefined;
            fulfillment_type?: undefined;
            query?: undefined;
            limit?: undefined;
            conversation_id?: undefined;
            topic_sys_id?: undefined;
            user_sys_id?: undefined;
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
            name?: undefined;
            description?: undefined;
            category?: undefined;
            active?: undefined;
            fulfillment_type?: undefined;
            fields?: undefined;
            query?: undefined;
            limit?: undefined;
            conversation_id?: undefined;
            topic_sys_id?: undefined;
            user_sys_id?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            active: {
                type: string;
                description: string;
            };
            category: {
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
            fulfillment_type?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            conversation_id?: undefined;
            topic_sys_id?: undefined;
            user_sys_id?: undefined;
        };
        required: never[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            conversation_id: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            name?: undefined;
            description?: undefined;
            category?: undefined;
            active?: undefined;
            fulfillment_type?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            query?: undefined;
            topic_sys_id?: undefined;
            user_sys_id?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            topic_sys_id: {
                type: string;
                description: string;
            };
            user_sys_id: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            name?: undefined;
            description?: undefined;
            category?: undefined;
            active?: undefined;
            fulfillment_type?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            query?: undefined;
            conversation_id?: undefined;
        };
        required: never[];
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
            name?: undefined;
            description?: undefined;
            category?: undefined;
            active?: undefined;
            fulfillment_type?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            query?: undefined;
            conversation_id?: undefined;
            topic_sys_id?: undefined;
            user_sys_id?: undefined;
        };
        required: never[];
    };
})[];
export declare function dispatchVaAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
//# sourceMappingURL=va.d.ts.map