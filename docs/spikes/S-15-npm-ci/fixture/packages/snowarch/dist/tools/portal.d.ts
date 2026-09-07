/**
 * Service Portal & UI Builder tools — manage portals, pages, widgets, and themes.
 * Read tools: Tier 0. Write/deploy tools: Tier 1 (WRITE_ENABLED=true).
 * Inspired by snow-flow's "Deployment" category tools.
 */
import type { ServiceNowClient } from '../servicenow/client.js';
export declare function portalToolManifest(): ({
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
            title?: undefined;
            url_suffix?: undefined;
            default_homepage?: undefined;
            theme?: undefined;
            logo?: undefined;
            description?: undefined;
            id?: undefined;
            portal_sys_id?: undefined;
            sys_id?: undefined;
            id_or_sysid?: undefined;
            name?: undefined;
            template?: undefined;
            css?: undefined;
            client_script?: undefined;
            server_script?: undefined;
            option_schema?: undefined;
            demo_data?: undefined;
            fields?: undefined;
            widget_sys_id?: undefined;
            sys_id_or_name?: undefined;
            app_sys_id?: undefined;
        };
        required: never[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            title: {
                type: string;
                description: string;
            };
            url_suffix: {
                type: string;
                description: string;
            };
            default_homepage: {
                type: string;
                description: string;
            };
            theme: {
                type: string;
                description: string;
            };
            logo: {
                type: string;
                description: string;
            };
            description: {
                type: string;
                description: string;
            };
            query?: undefined;
            limit?: undefined;
            id?: undefined;
            portal_sys_id?: undefined;
            sys_id?: undefined;
            id_or_sysid?: undefined;
            name?: undefined;
            template?: undefined;
            css?: undefined;
            client_script?: undefined;
            server_script?: undefined;
            option_schema?: undefined;
            demo_data?: undefined;
            fields?: undefined;
            widget_sys_id?: undefined;
            sys_id_or_name?: undefined;
            app_sys_id?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            title: {
                type: string;
                description: string;
            };
            id: {
                type: string;
                description: string;
            };
            portal_sys_id: {
                type: string;
                description: string;
            };
            description: {
                type: string;
                description: string;
            };
            query?: undefined;
            limit?: undefined;
            url_suffix?: undefined;
            default_homepage?: undefined;
            theme?: undefined;
            logo?: undefined;
            sys_id?: undefined;
            id_or_sysid?: undefined;
            name?: undefined;
            template?: undefined;
            css?: undefined;
            client_script?: undefined;
            server_script?: undefined;
            option_schema?: undefined;
            demo_data?: undefined;
            fields?: undefined;
            widget_sys_id?: undefined;
            sys_id_or_name?: undefined;
            app_sys_id?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            id: {
                type: string;
                description: string;
            };
            query?: undefined;
            limit?: undefined;
            title?: undefined;
            url_suffix?: undefined;
            default_homepage?: undefined;
            theme?: undefined;
            logo?: undefined;
            description?: undefined;
            portal_sys_id?: undefined;
            sys_id?: undefined;
            id_or_sysid?: undefined;
            name?: undefined;
            template?: undefined;
            css?: undefined;
            client_script?: undefined;
            server_script?: undefined;
            option_schema?: undefined;
            demo_data?: undefined;
            fields?: undefined;
            widget_sys_id?: undefined;
            sys_id_or_name?: undefined;
            app_sys_id?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            portal_sys_id: {
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
            title?: undefined;
            url_suffix?: undefined;
            default_homepage?: undefined;
            theme?: undefined;
            logo?: undefined;
            description?: undefined;
            id?: undefined;
            sys_id?: undefined;
            id_or_sysid?: undefined;
            name?: undefined;
            template?: undefined;
            css?: undefined;
            client_script?: undefined;
            server_script?: undefined;
            option_schema?: undefined;
            demo_data?: undefined;
            fields?: undefined;
            widget_sys_id?: undefined;
            sys_id_or_name?: undefined;
            app_sys_id?: undefined;
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
            query?: undefined;
            limit?: undefined;
            title?: undefined;
            url_suffix?: undefined;
            default_homepage?: undefined;
            theme?: undefined;
            logo?: undefined;
            description?: undefined;
            id?: undefined;
            portal_sys_id?: undefined;
            id_or_sysid?: undefined;
            name?: undefined;
            template?: undefined;
            css?: undefined;
            client_script?: undefined;
            server_script?: undefined;
            option_schema?: undefined;
            demo_data?: undefined;
            fields?: undefined;
            widget_sys_id?: undefined;
            sys_id_or_name?: undefined;
            app_sys_id?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            id_or_sysid: {
                type: string;
                description: string;
            };
            query?: undefined;
            limit?: undefined;
            title?: undefined;
            url_suffix?: undefined;
            default_homepage?: undefined;
            theme?: undefined;
            logo?: undefined;
            description?: undefined;
            id?: undefined;
            portal_sys_id?: undefined;
            sys_id?: undefined;
            name?: undefined;
            template?: undefined;
            css?: undefined;
            client_script?: undefined;
            server_script?: undefined;
            option_schema?: undefined;
            demo_data?: undefined;
            fields?: undefined;
            widget_sys_id?: undefined;
            sys_id_or_name?: undefined;
            app_sys_id?: undefined;
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
            id: {
                type: string;
                description: string;
            };
            template: {
                type: string;
                description: string;
            };
            css: {
                type: string;
                description: string;
            };
            client_script: {
                type: string;
                description: string;
            };
            server_script: {
                type: string;
                description: string;
            };
            option_schema: {
                type: string;
                description: string;
            };
            demo_data: {
                type: string;
                description: string;
            };
            query?: undefined;
            limit?: undefined;
            title?: undefined;
            url_suffix?: undefined;
            default_homepage?: undefined;
            theme?: undefined;
            logo?: undefined;
            description?: undefined;
            portal_sys_id?: undefined;
            sys_id?: undefined;
            id_or_sysid?: undefined;
            fields?: undefined;
            widget_sys_id?: undefined;
            sys_id_or_name?: undefined;
            app_sys_id?: undefined;
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
            query?: undefined;
            limit?: undefined;
            title?: undefined;
            url_suffix?: undefined;
            default_homepage?: undefined;
            theme?: undefined;
            logo?: undefined;
            description?: undefined;
            id?: undefined;
            portal_sys_id?: undefined;
            id_or_sysid?: undefined;
            name?: undefined;
            template?: undefined;
            css?: undefined;
            client_script?: undefined;
            server_script?: undefined;
            option_schema?: undefined;
            demo_data?: undefined;
            widget_sys_id?: undefined;
            sys_id_or_name?: undefined;
            app_sys_id?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            widget_sys_id: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            query?: undefined;
            title?: undefined;
            url_suffix?: undefined;
            default_homepage?: undefined;
            theme?: undefined;
            logo?: undefined;
            description?: undefined;
            id?: undefined;
            portal_sys_id?: undefined;
            sys_id?: undefined;
            id_or_sysid?: undefined;
            name?: undefined;
            template?: undefined;
            css?: undefined;
            client_script?: undefined;
            server_script?: undefined;
            option_schema?: undefined;
            demo_data?: undefined;
            fields?: undefined;
            sys_id_or_name?: undefined;
            app_sys_id?: undefined;
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
            query?: undefined;
            limit?: undefined;
            title?: undefined;
            url_suffix?: undefined;
            default_homepage?: undefined;
            theme?: undefined;
            logo?: undefined;
            description?: undefined;
            id?: undefined;
            portal_sys_id?: undefined;
            sys_id?: undefined;
            id_or_sysid?: undefined;
            name?: undefined;
            template?: undefined;
            css?: undefined;
            client_script?: undefined;
            server_script?: undefined;
            option_schema?: undefined;
            demo_data?: undefined;
            fields?: undefined;
            widget_sys_id?: undefined;
            app_sys_id?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            app_sys_id: {
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
            title?: undefined;
            url_suffix?: undefined;
            default_homepage?: undefined;
            theme?: undefined;
            logo?: undefined;
            description?: undefined;
            id?: undefined;
            portal_sys_id?: undefined;
            sys_id?: undefined;
            id_or_sysid?: undefined;
            name?: undefined;
            template?: undefined;
            css?: undefined;
            client_script?: undefined;
            server_script?: undefined;
            option_schema?: undefined;
            demo_data?: undefined;
            fields?: undefined;
            widget_sys_id?: undefined;
            sys_id_or_name?: undefined;
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
            query?: undefined;
            title?: undefined;
            url_suffix?: undefined;
            default_homepage?: undefined;
            theme?: undefined;
            logo?: undefined;
            description?: undefined;
            id?: undefined;
            portal_sys_id?: undefined;
            sys_id?: undefined;
            id_or_sysid?: undefined;
            name?: undefined;
            template?: undefined;
            css?: undefined;
            client_script?: undefined;
            server_script?: undefined;
            option_schema?: undefined;
            demo_data?: undefined;
            fields?: undefined;
            widget_sys_id?: undefined;
            sys_id_or_name?: undefined;
            app_sys_id?: undefined;
        };
        required: never[];
    };
})[];
export declare function dispatchPortalAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
//# sourceMappingURL=portal.d.ts.map