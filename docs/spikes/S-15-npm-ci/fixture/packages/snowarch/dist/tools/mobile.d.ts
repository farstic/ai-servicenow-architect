/**
 * ServiceNow Mobile tools — mobile app configuration, layout management,
 * push notifications, offline sync, and mobile analytics.
 *
 * ServiceNow tables: sys_sg_mobile_app_config, sys_sg_mobile_layout,
 *   sys_sg_mobile_applet, sys_sg_push_notification, sys_sg_offline_sync
 */
import type { ServiceNowClient } from '../servicenow/client.js';
export declare function mobileToolManifest(): ({
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
            };
            sys_id?: undefined;
            name?: undefined;
            description?: undefined;
            branding_color?: undefined;
            app_config?: undefined;
            table?: undefined;
            icon?: undefined;
            type?: undefined;
            query?: undefined;
            max_records?: undefined;
            user?: undefined;
            group?: undefined;
            title?: undefined;
            body?: undefined;
            action_url?: undefined;
            days?: undefined;
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
            active?: undefined;
            limit?: undefined;
            name?: undefined;
            description?: undefined;
            branding_color?: undefined;
            app_config?: undefined;
            table?: undefined;
            icon?: undefined;
            type?: undefined;
            query?: undefined;
            max_records?: undefined;
            user?: undefined;
            group?: undefined;
            title?: undefined;
            body?: undefined;
            action_url?: undefined;
            days?: undefined;
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
            };
            branding_color: {
                type: string;
                description: string;
            };
            active?: undefined;
            limit?: undefined;
            sys_id?: undefined;
            app_config?: undefined;
            table?: undefined;
            icon?: undefined;
            type?: undefined;
            query?: undefined;
            max_records?: undefined;
            user?: undefined;
            group?: undefined;
            title?: undefined;
            body?: undefined;
            action_url?: undefined;
            days?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            app_config: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
            };
            active?: undefined;
            sys_id?: undefined;
            name?: undefined;
            description?: undefined;
            branding_color?: undefined;
            table?: undefined;
            icon?: undefined;
            type?: undefined;
            query?: undefined;
            max_records?: undefined;
            user?: undefined;
            group?: undefined;
            title?: undefined;
            body?: undefined;
            action_url?: undefined;
            days?: undefined;
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
            icon: {
                type: string;
                description: string;
            };
            app_config: {
                type: string;
                description: string;
            };
            active?: undefined;
            limit?: undefined;
            sys_id?: undefined;
            description?: undefined;
            branding_color?: undefined;
            type?: undefined;
            query?: undefined;
            max_records?: undefined;
            user?: undefined;
            group?: undefined;
            title?: undefined;
            body?: undefined;
            action_url?: undefined;
            days?: undefined;
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
            };
            active?: undefined;
            sys_id?: undefined;
            name?: undefined;
            description?: undefined;
            branding_color?: undefined;
            app_config?: undefined;
            table?: undefined;
            icon?: undefined;
            type?: undefined;
            query?: undefined;
            max_records?: undefined;
            user?: undefined;
            group?: undefined;
            title?: undefined;
            body?: undefined;
            action_url?: undefined;
            days?: undefined;
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
            active?: undefined;
            limit?: undefined;
            sys_id?: undefined;
            description?: undefined;
            branding_color?: undefined;
            app_config?: undefined;
            icon?: undefined;
            query?: undefined;
            max_records?: undefined;
            user?: undefined;
            group?: undefined;
            title?: undefined;
            body?: undefined;
            action_url?: undefined;
            days?: undefined;
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
            query: {
                type: string;
                description: string;
            };
            max_records: {
                type: string;
                description: string;
            };
            active?: undefined;
            limit?: undefined;
            sys_id?: undefined;
            name?: undefined;
            description?: undefined;
            branding_color?: undefined;
            app_config?: undefined;
            icon?: undefined;
            type?: undefined;
            user?: undefined;
            group?: undefined;
            title?: undefined;
            body?: undefined;
            action_url?: undefined;
            days?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            user: {
                type: string;
                description: string;
            };
            group: {
                type: string;
                description: string;
            };
            title: {
                type: string;
                description: string;
            };
            body: {
                type: string;
                description: string;
            };
            action_url: {
                type: string;
                description: string;
            };
            active?: undefined;
            limit?: undefined;
            sys_id?: undefined;
            name?: undefined;
            description?: undefined;
            branding_color?: undefined;
            app_config?: undefined;
            table?: undefined;
            icon?: undefined;
            type?: undefined;
            query?: undefined;
            max_records?: undefined;
            days?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            days: {
                type: string;
                description: string;
            };
            active?: undefined;
            limit?: undefined;
            sys_id?: undefined;
            name?: undefined;
            description?: undefined;
            branding_color?: undefined;
            app_config?: undefined;
            table?: undefined;
            icon?: undefined;
            type?: undefined;
            query?: undefined;
            max_records?: undefined;
            user?: undefined;
            group?: undefined;
            title?: undefined;
            body?: undefined;
            action_url?: undefined;
        };
        required: never[];
    };
})[];
export declare function dispatchMobileAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
//# sourceMappingURL=mobile.d.ts.map