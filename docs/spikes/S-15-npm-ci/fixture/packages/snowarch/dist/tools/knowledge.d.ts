/**
 * Knowledge Base tools.
 * Read tools: Tier 0. Write tools: Tier 1 (WRITE_ENABLED=true).
 */
import type { ServiceNowClient } from '../servicenow/client.js';
export declare function knowledgeToolManifest(): ({
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            limit: {
                type: string;
                description: string;
            };
            query?: undefined;
            knowledge_base?: undefined;
            number_or_sysid?: undefined;
            short_description?: undefined;
            text?: undefined;
            knowledge_base_sys_id?: undefined;
            category?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            article_id?: undefined;
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
            knowledge_base: {
                type: string;
                description: string;
            };
            number_or_sysid?: undefined;
            short_description?: undefined;
            text?: undefined;
            knowledge_base_sys_id?: undefined;
            category?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            article_id?: undefined;
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
            limit?: undefined;
            query?: undefined;
            knowledge_base?: undefined;
            short_description?: undefined;
            text?: undefined;
            knowledge_base_sys_id?: undefined;
            category?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            article_id?: undefined;
        };
        required: string[];
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
            text: {
                type: string;
                description: string;
            };
            knowledge_base_sys_id: {
                type: string;
                description: string;
            };
            category: {
                type: string;
                description: string;
            };
            limit?: undefined;
            query?: undefined;
            knowledge_base?: undefined;
            number_or_sysid?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            article_id?: undefined;
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
            limit?: undefined;
            query?: undefined;
            knowledge_base?: undefined;
            number_or_sysid?: undefined;
            short_description?: undefined;
            text?: undefined;
            knowledge_base_sys_id?: undefined;
            category?: undefined;
            article_id?: undefined;
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
            limit?: undefined;
            query?: undefined;
            knowledge_base?: undefined;
            number_or_sysid?: undefined;
            short_description?: undefined;
            text?: undefined;
            knowledge_base_sys_id?: undefined;
            category?: undefined;
            fields?: undefined;
            article_id?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            article_id: {
                type: string;
                description: string;
            };
            limit?: undefined;
            query?: undefined;
            knowledge_base?: undefined;
            number_or_sysid?: undefined;
            short_description?: undefined;
            text?: undefined;
            knowledge_base_sys_id?: undefined;
            category?: undefined;
            sys_id?: undefined;
            fields?: undefined;
        };
        required: string[];
    };
})[];
export declare function dispatchKnowledgeAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
//# sourceMappingURL=knowledge.d.ts.map