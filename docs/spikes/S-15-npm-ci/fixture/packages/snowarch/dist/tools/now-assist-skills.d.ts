/**
 * Now Assist Skills management tools — create, list, get, and test Now Assist skills.
 * All tools require NOW_ASSIST_ENABLED=true (Tier AI).
 * Write tools additionally require WRITE_ENABLED=true (Tier 1).
 */
import type { ServiceNowClient } from '../servicenow/client.js';
export declare function nowAssistSkillsToolManifest(): ({
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
            input_schema: {
                type: string;
                description: string;
            };
            output_schema: {
                type: string;
                description: string;
            };
            prompt_template: {
                type: string;
                description: string;
            };
            model: {
                type: string;
                description: string;
            };
            active?: undefined;
            limit?: undefined;
            query?: undefined;
            sys_id?: undefined;
            skill_sys_id?: undefined;
            test_input?: undefined;
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
            query: {
                type: string;
                description: string;
            };
            name?: undefined;
            description?: undefined;
            input_schema?: undefined;
            output_schema?: undefined;
            prompt_template?: undefined;
            model?: undefined;
            sys_id?: undefined;
            skill_sys_id?: undefined;
            test_input?: undefined;
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
            input_schema?: undefined;
            output_schema?: undefined;
            prompt_template?: undefined;
            model?: undefined;
            active?: undefined;
            limit?: undefined;
            query?: undefined;
            skill_sys_id?: undefined;
            test_input?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            skill_sys_id: {
                type: string;
                description: string;
            };
            test_input: {
                type: string;
                description: string;
            };
            name?: undefined;
            description?: undefined;
            input_schema?: undefined;
            output_schema?: undefined;
            prompt_template?: undefined;
            model?: undefined;
            active?: undefined;
            limit?: undefined;
            query?: undefined;
            sys_id?: undefined;
        };
        required: string[];
    };
})[];
export declare function dispatchNowAssistSkillsAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
//# sourceMappingURL=now-assist-skills.d.ts.map