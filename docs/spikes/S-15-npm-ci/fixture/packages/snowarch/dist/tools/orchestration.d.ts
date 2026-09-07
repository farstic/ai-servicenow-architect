/**
 * Orchestration tools — create, list, and execute multi-step playbooks.
 * Playbooks chain tool calls with conditional logic and error handling.
 * Requires NOW_ASSIST_ENABLED (Tier AI). Write tools also require WRITE_ENABLED.
 */
import type { ServiceNowClient } from '../servicenow/client.js';
export declare function orchestrationToolManifest(): ({
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
            steps: {
                type: string;
                description: string;
                items: {
                    type: string;
                    properties: {
                        tool_name: {
                            type: string;
                            description: string;
                        };
                        args_template: {
                            type: string;
                            description: string;
                        };
                        condition: {
                            type: string;
                            description: string;
                        };
                        on_error: {
                            type: string;
                            enum: string[];
                            description: string;
                        };
                    };
                    required: string[];
                };
            };
            playbook?: undefined;
            context?: undefined;
            dry_run?: undefined;
            limit?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            playbook: {
                type: string;
                description: string;
                properties: {
                    name: {
                        type: string;
                    };
                    description: {
                        type: string;
                    };
                    steps: {
                        type: string;
                        items: {
                            type: string;
                            properties: {
                                tool_name: {
                                    type: string;
                                };
                                args_template: {
                                    type: string;
                                };
                                condition: {
                                    type: string;
                                };
                                on_error: {
                                    type: string;
                                    enum: string[];
                                };
                            };
                            required: string[];
                        };
                    };
                };
                required: string[];
            };
            context: {
                type: string;
                description: string;
            };
            dry_run: {
                type: string;
                description: string;
            };
            name?: undefined;
            description?: undefined;
            steps?: undefined;
            limit?: undefined;
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
            name?: undefined;
            description?: undefined;
            steps?: undefined;
            playbook?: undefined;
            context?: undefined;
            dry_run?: undefined;
        };
        required: never[];
    };
})[];
export declare function dispatchOrchestrationAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
//# sourceMappingURL=orchestration.d.ts.map