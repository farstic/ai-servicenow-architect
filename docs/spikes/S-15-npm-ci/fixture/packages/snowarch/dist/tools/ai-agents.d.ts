/**
 * AI Agents tools — create and manage AI agents and agentic workflows.
 * Write tools require NOW_ASSIST_ENABLED + WRITE_ENABLED.
 */
import type { ServiceNowClient } from '../servicenow/client.js';
export declare function aiAgentsToolManifest(): ({
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
            capabilities: {
                type: string;
                items: {
                    type: string;
                };
                description: string;
            };
            auto_generate_acls: {
                type: string;
                description: string;
            };
            active?: undefined;
            limit?: undefined;
            sys_id?: undefined;
            agent_sys_id?: undefined;
            steps?: undefined;
            trigger_conditions?: undefined;
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
            limit: {
                type: string;
                description: string;
            };
            name?: undefined;
            description?: undefined;
            capabilities?: undefined;
            auto_generate_acls?: undefined;
            sys_id?: undefined;
            agent_sys_id?: undefined;
            steps?: undefined;
            trigger_conditions?: undefined;
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
            name?: undefined;
            description?: undefined;
            capabilities?: undefined;
            auto_generate_acls?: undefined;
            active?: undefined;
            limit?: undefined;
            agent_sys_id?: undefined;
            steps?: undefined;
            trigger_conditions?: undefined;
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
            agent_sys_id: {
                type: string;
                description: string;
            };
            steps: {
                type: string;
                description: string;
                items: {
                    type: string;
                    properties: {
                        name: {
                            type: string;
                            description: string;
                        };
                        action: {
                            type: string;
                            description: string;
                        };
                        inputs: {
                            type: string;
                            description: string;
                        };
                        condition: {
                            type: string;
                            description: string;
                        };
                    };
                    required: string[];
                };
            };
            trigger_conditions: {
                type: string;
                description: string;
            };
            capabilities?: undefined;
            auto_generate_acls?: undefined;
            active?: undefined;
            limit?: undefined;
            sys_id?: undefined;
        };
        required: string[];
    };
})[];
export declare function dispatchAiAgentsAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
//# sourceMappingURL=ai-agents.d.ts.map