/**
 * Now Assist & ServiceNow AI tools — latest release.
 * All tools require NOW_ASSIST_ENABLED=true (Tier AI).
 *
 * ServiceNow APIs used:
 *   - Now Assist Skills: POST /api/sn_assist/skill/invoke
 *   - Agentic Playbooks:  POST /api/sn_assist/playbook/trigger
 *   - AI Search:          GET  /api/now/ai_search/search
 *   - Predictive Intel.:  POST /api/sn_ml/solution/{id}/predict (LightGBM in latest release)
 *   - NLQ:               POST /api/sn_nl_text_to_value/text_query
 *   - Virtual Agent:      GET  /api/sn_cs/topic               (streaming in latest release)
 *   - MS Copilot 365:     GET  /api/sn_assist/copilot/topics
 */
import type { ServiceNowClient } from '../servicenow/client.js';
export declare function nowAssistToolManifest(): ({
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            question: {
                type: string;
                description: string;
            };
            table: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            query?: undefined;
            sources?: undefined;
            sys_id?: undefined;
            incident_sys_id?: undefined;
            short_description?: undefined;
            description?: undefined;
            active?: undefined;
            category?: undefined;
            playbook_sys_id?: undefined;
            context?: undefined;
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
            sources: {
                type: string;
                items: {
                    type: string;
                };
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            question?: undefined;
            table?: undefined;
            sys_id?: undefined;
            incident_sys_id?: undefined;
            short_description?: undefined;
            description?: undefined;
            active?: undefined;
            category?: undefined;
            playbook_sys_id?: undefined;
            context?: undefined;
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
            question?: undefined;
            limit?: undefined;
            query?: undefined;
            sources?: undefined;
            incident_sys_id?: undefined;
            short_description?: undefined;
            description?: undefined;
            active?: undefined;
            category?: undefined;
            playbook_sys_id?: undefined;
            context?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            incident_sys_id: {
                type: string;
                description: string;
            };
            question?: undefined;
            table?: undefined;
            limit?: undefined;
            query?: undefined;
            sources?: undefined;
            sys_id?: undefined;
            short_description?: undefined;
            description?: undefined;
            active?: undefined;
            category?: undefined;
            playbook_sys_id?: undefined;
            context?: undefined;
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
            description: {
                type: string;
                description: string;
            };
            question?: undefined;
            table?: undefined;
            limit?: undefined;
            query?: undefined;
            sources?: undefined;
            sys_id?: undefined;
            incident_sys_id?: undefined;
            active?: undefined;
            category?: undefined;
            playbook_sys_id?: undefined;
            context?: undefined;
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
            limit: {
                type: string;
                description: string;
            };
            question?: undefined;
            table?: undefined;
            query?: undefined;
            sources?: undefined;
            sys_id?: undefined;
            incident_sys_id?: undefined;
            short_description?: undefined;
            description?: undefined;
            playbook_sys_id?: undefined;
            context?: undefined;
        };
        required: never[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            playbook_sys_id: {
                type: string;
                description: string;
            };
            context: {
                type: string;
                description: string;
            };
            question?: undefined;
            table?: undefined;
            limit?: undefined;
            query?: undefined;
            sources?: undefined;
            sys_id?: undefined;
            incident_sys_id?: undefined;
            short_description?: undefined;
            description?: undefined;
            active?: undefined;
            category?: undefined;
        };
        required: string[];
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
            question?: undefined;
            table?: undefined;
            query?: undefined;
            sources?: undefined;
            sys_id?: undefined;
            incident_sys_id?: undefined;
            short_description?: undefined;
            description?: undefined;
            active?: undefined;
            category?: undefined;
            playbook_sys_id?: undefined;
            context?: undefined;
        };
        required: never[];
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
            context: {
                type: string;
                description: string;
            };
            question?: undefined;
            limit?: undefined;
            query?: undefined;
            sources?: undefined;
            incident_sys_id?: undefined;
            short_description?: undefined;
            description?: undefined;
            active?: undefined;
            category?: undefined;
            playbook_sys_id?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            question?: undefined;
            table?: undefined;
            limit?: undefined;
            query?: undefined;
            sources?: undefined;
            sys_id?: undefined;
            incident_sys_id?: undefined;
            short_description?: undefined;
            description?: undefined;
            active?: undefined;
            category?: undefined;
            playbook_sys_id?: undefined;
            context?: undefined;
        };
        required: never[];
    };
})[];
export declare function dispatchNowAssistAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
//# sourceMappingURL=now-assist.d.ts.map