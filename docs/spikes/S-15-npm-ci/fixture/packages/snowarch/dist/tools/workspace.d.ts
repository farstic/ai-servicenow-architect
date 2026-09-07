/**
 * Workspace & UI Builder tools — next-gen configurable workspaces, UIB pages,
 * components, data brokers, and UX framework configuration.
 *
 * NOTE: Does NOT duplicate existing portal.ts tools (list_portals, create_portal,
 * list_portal_widgets, etc.). These tools focus on the newer UI Builder (UIB) and
 * Configurable Workspace frameworks.
 *
 * ServiceNow tables: sys_ux_page, sys_ux_page_registry, sys_ux_macroponent,
 *   sys_ux_data_broker, sys_ux_client_script, sys_ux_client_state_parameter,
 *   sys_aw_workspace, sys_aw_list, sys_aw_form, aw_agent_workspace
 */
import type { ServiceNowClient } from '../servicenow/client.js';
export declare function workspaceToolManifest(): ({
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            limit: {
                type: string;
                description: string;
            };
            app: {
                type: string;
                description: string;
            };
            sys_id?: undefined;
            title?: undefined;
            path?: undefined;
            layout?: undefined;
            scope?: undefined;
            name?: undefined;
            label?: undefined;
            description?: undefined;
            category?: undefined;
            page_sys_id?: undefined;
            table?: undefined;
            query?: undefined;
            page?: undefined;
            active?: undefined;
            icon?: undefined;
            workspace_sys_id?: undefined;
            columns?: undefined;
            app_sys_id?: undefined;
            landing_page?: undefined;
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
            limit?: undefined;
            app?: undefined;
            title?: undefined;
            path?: undefined;
            layout?: undefined;
            scope?: undefined;
            name?: undefined;
            label?: undefined;
            description?: undefined;
            category?: undefined;
            page_sys_id?: undefined;
            table?: undefined;
            query?: undefined;
            page?: undefined;
            active?: undefined;
            icon?: undefined;
            workspace_sys_id?: undefined;
            columns?: undefined;
            app_sys_id?: undefined;
            landing_page?: undefined;
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
            path: {
                type: string;
                description: string;
            };
            app: {
                type: string;
                description: string;
            };
            layout: {
                type: string;
                description: string;
            };
            limit?: undefined;
            sys_id?: undefined;
            scope?: undefined;
            name?: undefined;
            label?: undefined;
            description?: undefined;
            category?: undefined;
            page_sys_id?: undefined;
            table?: undefined;
            query?: undefined;
            page?: undefined;
            active?: undefined;
            icon?: undefined;
            workspace_sys_id?: undefined;
            columns?: undefined;
            app_sys_id?: undefined;
            landing_page?: undefined;
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
            title: {
                type: string;
                description?: undefined;
            };
            path: {
                type: string;
                description?: undefined;
            };
            layout: {
                type: string;
                description?: undefined;
            };
            limit?: undefined;
            app?: undefined;
            scope?: undefined;
            name?: undefined;
            label?: undefined;
            description?: undefined;
            category?: undefined;
            page_sys_id?: undefined;
            table?: undefined;
            query?: undefined;
            page?: undefined;
            active?: undefined;
            icon?: undefined;
            workspace_sys_id?: undefined;
            columns?: undefined;
            app_sys_id?: undefined;
            landing_page?: undefined;
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
            scope: {
                type: string;
                description: string;
            };
            app?: undefined;
            sys_id?: undefined;
            title?: undefined;
            path?: undefined;
            layout?: undefined;
            name?: undefined;
            label?: undefined;
            description?: undefined;
            category?: undefined;
            page_sys_id?: undefined;
            table?: undefined;
            query?: undefined;
            page?: undefined;
            active?: undefined;
            icon?: undefined;
            workspace_sys_id?: undefined;
            columns?: undefined;
            app_sys_id?: undefined;
            landing_page?: undefined;
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
            label: {
                type: string;
                description: string;
            };
            description: {
                type: string;
            };
            category: {
                type: string;
                description: string;
            };
            limit?: undefined;
            app?: undefined;
            sys_id?: undefined;
            title?: undefined;
            path?: undefined;
            layout?: undefined;
            scope?: undefined;
            page_sys_id?: undefined;
            table?: undefined;
            query?: undefined;
            page?: undefined;
            active?: undefined;
            icon?: undefined;
            workspace_sys_id?: undefined;
            columns?: undefined;
            app_sys_id?: undefined;
            landing_page?: undefined;
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
            label: {
                type: string;
                description?: undefined;
            };
            description: {
                type: string;
            };
            limit?: undefined;
            app?: undefined;
            title?: undefined;
            path?: undefined;
            layout?: undefined;
            scope?: undefined;
            name?: undefined;
            category?: undefined;
            page_sys_id?: undefined;
            table?: undefined;
            query?: undefined;
            page?: undefined;
            active?: undefined;
            icon?: undefined;
            workspace_sys_id?: undefined;
            columns?: undefined;
            app_sys_id?: undefined;
            landing_page?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            page_sys_id: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description?: undefined;
            };
            app?: undefined;
            sys_id?: undefined;
            title?: undefined;
            path?: undefined;
            layout?: undefined;
            scope?: undefined;
            name?: undefined;
            label?: undefined;
            description?: undefined;
            category?: undefined;
            table?: undefined;
            query?: undefined;
            page?: undefined;
            active?: undefined;
            icon?: undefined;
            workspace_sys_id?: undefined;
            columns?: undefined;
            app_sys_id?: undefined;
            landing_page?: undefined;
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
            query: {
                type: string;
                description: string;
            };
            page: {
                type: string;
                description: string;
            };
            limit?: undefined;
            app?: undefined;
            sys_id?: undefined;
            title?: undefined;
            path?: undefined;
            layout?: undefined;
            scope?: undefined;
            label?: undefined;
            description?: undefined;
            category?: undefined;
            page_sys_id?: undefined;
            active?: undefined;
            icon?: undefined;
            workspace_sys_id?: undefined;
            columns?: undefined;
            app_sys_id?: undefined;
            landing_page?: undefined;
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
                description?: undefined;
            };
            app?: undefined;
            sys_id?: undefined;
            title?: undefined;
            path?: undefined;
            layout?: undefined;
            scope?: undefined;
            name?: undefined;
            label?: undefined;
            description?: undefined;
            category?: undefined;
            page_sys_id?: undefined;
            table?: undefined;
            query?: undefined;
            page?: undefined;
            icon?: undefined;
            workspace_sys_id?: undefined;
            columns?: undefined;
            app_sys_id?: undefined;
            landing_page?: undefined;
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
            };
            table: {
                type: string;
                description: string;
            };
            icon: {
                type: string;
                description: string;
            };
            limit?: undefined;
            app?: undefined;
            sys_id?: undefined;
            title?: undefined;
            path?: undefined;
            layout?: undefined;
            scope?: undefined;
            label?: undefined;
            category?: undefined;
            page_sys_id?: undefined;
            query?: undefined;
            page?: undefined;
            active?: undefined;
            workspace_sys_id?: undefined;
            columns?: undefined;
            app_sys_id?: undefined;
            landing_page?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            workspace_sys_id: {
                type: string;
                description: string;
            };
            table: {
                type: string;
                description: string;
            };
            title: {
                type: string;
                description: string;
            };
            query: {
                type: string;
                description: string;
            };
            columns: {
                type: string;
                description: string;
            };
            limit?: undefined;
            app?: undefined;
            sys_id?: undefined;
            path?: undefined;
            layout?: undefined;
            scope?: undefined;
            name?: undefined;
            label?: undefined;
            description?: undefined;
            category?: undefined;
            page_sys_id?: undefined;
            page?: undefined;
            active?: undefined;
            icon?: undefined;
            app_sys_id?: undefined;
            landing_page?: undefined;
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
            path: {
                type: string;
                description: string;
            };
            page_sys_id: {
                type: string;
                description: string;
            };
            title: {
                type: string;
                description: string;
            };
            limit?: undefined;
            app?: undefined;
            sys_id?: undefined;
            layout?: undefined;
            scope?: undefined;
            name?: undefined;
            label?: undefined;
            description?: undefined;
            category?: undefined;
            table?: undefined;
            query?: undefined;
            page?: undefined;
            active?: undefined;
            icon?: undefined;
            workspace_sys_id?: undefined;
            columns?: undefined;
            landing_page?: undefined;
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
            app_sys_id: {
                type: string;
                description: string;
            };
            landing_page: {
                type: string;
                description: string;
            };
            limit?: undefined;
            app?: undefined;
            sys_id?: undefined;
            title?: undefined;
            path?: undefined;
            layout?: undefined;
            scope?: undefined;
            label?: undefined;
            description?: undefined;
            category?: undefined;
            page_sys_id?: undefined;
            table?: undefined;
            query?: undefined;
            page?: undefined;
            active?: undefined;
            icon?: undefined;
            workspace_sys_id?: undefined;
            columns?: undefined;
        };
        required: string[];
    };
})[];
export declare function dispatchWorkspaceAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
//# sourceMappingURL=workspace.d.ts.map