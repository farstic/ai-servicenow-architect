/**
 * Scripting Management tools — latest release (ES2021/ES12 support).
 * All tools require SCRIPTING_ENABLED=true (Tier 3).
 * Note: ServiceNow supports Promises, async/await, optional chaining.
 * GlideEncrypter is deprecated in recent releases.
 */
import type { ServiceNowClient } from '../servicenow/client.js';
export declare function scriptToolManifest(): ({
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            table: {
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
            sys_id?: undefined;
            name?: undefined;
            when?: undefined;
            script?: undefined;
            condition?: undefined;
            order?: undefined;
            fields?: undefined;
            query?: undefined;
            sys_id_or_name?: undefined;
            api_name?: undefined;
            access?: undefined;
            type?: undefined;
            state?: undefined;
            field_name?: undefined;
            global?: undefined;
            short_description?: undefined;
            conditions?: undefined;
            run_scripts?: undefined;
            action_name?: undefined;
            form_button?: undefined;
            list_button?: undefined;
            operation?: undefined;
            admin_overrides?: undefined;
            roles?: undefined;
            description?: undefined;
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
            table?: undefined;
            active?: undefined;
            limit?: undefined;
            name?: undefined;
            when?: undefined;
            script?: undefined;
            condition?: undefined;
            order?: undefined;
            fields?: undefined;
            query?: undefined;
            sys_id_or_name?: undefined;
            api_name?: undefined;
            access?: undefined;
            type?: undefined;
            state?: undefined;
            field_name?: undefined;
            global?: undefined;
            short_description?: undefined;
            conditions?: undefined;
            run_scripts?: undefined;
            action_name?: undefined;
            form_button?: undefined;
            list_button?: undefined;
            operation?: undefined;
            admin_overrides?: undefined;
            roles?: undefined;
            description?: undefined;
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
            when: {
                type: string;
                description: string;
            };
            script: {
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
            limit?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            query?: undefined;
            sys_id_or_name?: undefined;
            api_name?: undefined;
            access?: undefined;
            type?: undefined;
            state?: undefined;
            field_name?: undefined;
            global?: undefined;
            short_description?: undefined;
            conditions?: undefined;
            run_scripts?: undefined;
            action_name?: undefined;
            form_button?: undefined;
            list_button?: undefined;
            operation?: undefined;
            admin_overrides?: undefined;
            roles?: undefined;
            description?: undefined;
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
            table?: undefined;
            active?: undefined;
            limit?: undefined;
            name?: undefined;
            when?: undefined;
            script?: undefined;
            condition?: undefined;
            order?: undefined;
            query?: undefined;
            sys_id_or_name?: undefined;
            api_name?: undefined;
            access?: undefined;
            type?: undefined;
            state?: undefined;
            field_name?: undefined;
            global?: undefined;
            short_description?: undefined;
            conditions?: undefined;
            run_scripts?: undefined;
            action_name?: undefined;
            form_button?: undefined;
            list_button?: undefined;
            operation?: undefined;
            admin_overrides?: undefined;
            roles?: undefined;
            description?: undefined;
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
            table?: undefined;
            sys_id?: undefined;
            name?: undefined;
            when?: undefined;
            script?: undefined;
            condition?: undefined;
            order?: undefined;
            fields?: undefined;
            sys_id_or_name?: undefined;
            api_name?: undefined;
            access?: undefined;
            type?: undefined;
            state?: undefined;
            field_name?: undefined;
            global?: undefined;
            short_description?: undefined;
            conditions?: undefined;
            run_scripts?: undefined;
            action_name?: undefined;
            form_button?: undefined;
            list_button?: undefined;
            operation?: undefined;
            admin_overrides?: undefined;
            roles?: undefined;
            description?: undefined;
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
            table?: undefined;
            active?: undefined;
            limit?: undefined;
            sys_id?: undefined;
            name?: undefined;
            when?: undefined;
            script?: undefined;
            condition?: undefined;
            order?: undefined;
            fields?: undefined;
            query?: undefined;
            api_name?: undefined;
            access?: undefined;
            type?: undefined;
            state?: undefined;
            field_name?: undefined;
            global?: undefined;
            short_description?: undefined;
            conditions?: undefined;
            run_scripts?: undefined;
            action_name?: undefined;
            form_button?: undefined;
            list_button?: undefined;
            operation?: undefined;
            admin_overrides?: undefined;
            roles?: undefined;
            description?: undefined;
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
            script: {
                type: string;
                description: string;
            };
            api_name: {
                type: string;
                description: string;
            };
            access: {
                type: string;
                description: string;
            };
            active: {
                type: string;
                description: string;
            };
            table?: undefined;
            limit?: undefined;
            sys_id?: undefined;
            when?: undefined;
            condition?: undefined;
            order?: undefined;
            fields?: undefined;
            query?: undefined;
            sys_id_or_name?: undefined;
            type?: undefined;
            state?: undefined;
            field_name?: undefined;
            global?: undefined;
            short_description?: undefined;
            conditions?: undefined;
            run_scripts?: undefined;
            action_name?: undefined;
            form_button?: undefined;
            list_button?: undefined;
            operation?: undefined;
            admin_overrides?: undefined;
            roles?: undefined;
            description?: undefined;
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
            type: {
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
            sys_id?: undefined;
            name?: undefined;
            when?: undefined;
            script?: undefined;
            condition?: undefined;
            order?: undefined;
            fields?: undefined;
            query?: undefined;
            sys_id_or_name?: undefined;
            api_name?: undefined;
            access?: undefined;
            state?: undefined;
            field_name?: undefined;
            global?: undefined;
            short_description?: undefined;
            conditions?: undefined;
            run_scripts?: undefined;
            action_name?: undefined;
            form_button?: undefined;
            list_button?: undefined;
            operation?: undefined;
            admin_overrides?: undefined;
            roles?: undefined;
            description?: undefined;
        };
        required: never[];
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
            limit: {
                type: string;
                description: string;
            };
            table?: undefined;
            active?: undefined;
            sys_id?: undefined;
            name?: undefined;
            when?: undefined;
            script?: undefined;
            condition?: undefined;
            order?: undefined;
            fields?: undefined;
            query?: undefined;
            sys_id_or_name?: undefined;
            api_name?: undefined;
            access?: undefined;
            type?: undefined;
            field_name?: undefined;
            global?: undefined;
            short_description?: undefined;
            conditions?: undefined;
            run_scripts?: undefined;
            action_name?: undefined;
            form_button?: undefined;
            list_button?: undefined;
            operation?: undefined;
            admin_overrides?: undefined;
            roles?: undefined;
            description?: undefined;
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
            table: {
                type: string;
                description: string;
            };
            type: {
                type: string;
                description: string;
            };
            script: {
                type: string;
                description: string;
            };
            field_name: {
                type: string;
                description: string;
            };
            active: {
                type: string;
                description: string;
            };
            global: {
                type: string;
                description: string;
            };
            limit?: undefined;
            sys_id?: undefined;
            when?: undefined;
            condition?: undefined;
            order?: undefined;
            fields?: undefined;
            query?: undefined;
            sys_id_or_name?: undefined;
            api_name?: undefined;
            access?: undefined;
            state?: undefined;
            short_description?: undefined;
            conditions?: undefined;
            run_scripts?: undefined;
            action_name?: undefined;
            form_button?: undefined;
            list_button?: undefined;
            operation?: undefined;
            admin_overrides?: undefined;
            roles?: undefined;
            description?: undefined;
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
            table: {
                type: string;
                description: string;
            };
            conditions: {
                type: string;
                description: string;
            };
            script: {
                type: string;
                description: string;
            };
            active: {
                type: string;
                description: string;
            };
            run_scripts: {
                type: string;
                description: string;
            };
            limit?: undefined;
            sys_id?: undefined;
            name?: undefined;
            when?: undefined;
            condition?: undefined;
            order?: undefined;
            fields?: undefined;
            query?: undefined;
            sys_id_or_name?: undefined;
            api_name?: undefined;
            access?: undefined;
            type?: undefined;
            state?: undefined;
            field_name?: undefined;
            global?: undefined;
            action_name?: undefined;
            form_button?: undefined;
            list_button?: undefined;
            operation?: undefined;
            admin_overrides?: undefined;
            roles?: undefined;
            description?: undefined;
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
            action_name: {
                type: string;
                description: string;
            };
            script: {
                type: string;
                description: string;
            };
            type: {
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
            form_button: {
                type: string;
                description: string;
            };
            list_button: {
                type: string;
                description: string;
            };
            limit?: undefined;
            sys_id?: undefined;
            when?: undefined;
            order?: undefined;
            fields?: undefined;
            query?: undefined;
            sys_id_or_name?: undefined;
            api_name?: undefined;
            access?: undefined;
            state?: undefined;
            field_name?: undefined;
            global?: undefined;
            short_description?: undefined;
            conditions?: undefined;
            run_scripts?: undefined;
            operation?: undefined;
            admin_overrides?: undefined;
            roles?: undefined;
            description?: undefined;
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
            operation: {
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
            sys_id?: undefined;
            name?: undefined;
            when?: undefined;
            script?: undefined;
            condition?: undefined;
            order?: undefined;
            fields?: undefined;
            query?: undefined;
            sys_id_or_name?: undefined;
            api_name?: undefined;
            access?: undefined;
            type?: undefined;
            state?: undefined;
            field_name?: undefined;
            global?: undefined;
            short_description?: undefined;
            conditions?: undefined;
            run_scripts?: undefined;
            action_name?: undefined;
            form_button?: undefined;
            list_button?: undefined;
            admin_overrides?: undefined;
            roles?: undefined;
            description?: undefined;
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
            type: {
                type: string;
                description: string;
            };
            operation: {
                type: string;
                description: string;
            };
            admin_overrides: {
                type: string;
                description: string;
            };
            active: {
                type: string;
                description: string;
            };
            script: {
                type: string;
                description: string;
            };
            roles: {
                type: string;
                description: string;
            };
            description: {
                type: string;
                description: string;
            };
            table?: undefined;
            limit?: undefined;
            sys_id?: undefined;
            when?: undefined;
            condition?: undefined;
            order?: undefined;
            fields?: undefined;
            query?: undefined;
            sys_id_or_name?: undefined;
            api_name?: undefined;
            access?: undefined;
            state?: undefined;
            field_name?: undefined;
            global?: undefined;
            short_description?: undefined;
            conditions?: undefined;
            run_scripts?: undefined;
            action_name?: undefined;
            form_button?: undefined;
            list_button?: undefined;
        };
        required: string[];
    };
})[];
export declare function dispatchScriptAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
//# sourceMappingURL=script.d.ts.map