/**
 * Notification, Email, and Attachment tools.
 * Read tools: Tier 0. Write tools: Tier 1 (WRITE_ENABLED=true).
 * Inspired by servicenow-helper's direct script deployment and snow-flow's artifact management.
 */
import type { ServiceNowClient } from '../servicenow/client.js';
export declare function notificationToolManifest(): ({
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            query: {
                type: string;
                description: string;
            };
            table: {
                type: string;
                description: string;
            };
            event: {
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
            sys_id_or_name?: undefined;
            name?: undefined;
            subject?: undefined;
            message_html?: undefined;
            recipients?: undefined;
            condition?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            state?: undefined;
            recipient?: undefined;
            record_sys_id?: undefined;
            attachment_sys_id?: undefined;
            file_name?: undefined;
            content_type?: undefined;
            content_base64?: undefined;
            user_sys_id?: undefined;
            notification_sys_id?: undefined;
            body?: undefined;
            channels?: undefined;
            notification_id?: undefined;
            schedule?: undefined;
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
            query?: undefined;
            table?: undefined;
            event?: undefined;
            active?: undefined;
            limit?: undefined;
            name?: undefined;
            subject?: undefined;
            message_html?: undefined;
            recipients?: undefined;
            condition?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            state?: undefined;
            recipient?: undefined;
            record_sys_id?: undefined;
            attachment_sys_id?: undefined;
            file_name?: undefined;
            content_type?: undefined;
            content_base64?: undefined;
            user_sys_id?: undefined;
            notification_sys_id?: undefined;
            body?: undefined;
            channels?: undefined;
            notification_id?: undefined;
            schedule?: undefined;
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
            event: {
                type: string;
                description: string;
            };
            subject: {
                type: string;
                description: string;
            };
            message_html: {
                type: string;
                description: string;
            };
            recipients: {
                type: string;
                description: string;
            };
            active: {
                type: string;
                description: string;
            };
            condition: {
                type: string;
                description: string;
            };
            query?: undefined;
            limit?: undefined;
            sys_id_or_name?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            state?: undefined;
            recipient?: undefined;
            record_sys_id?: undefined;
            attachment_sys_id?: undefined;
            file_name?: undefined;
            content_type?: undefined;
            content_base64?: undefined;
            user_sys_id?: undefined;
            notification_sys_id?: undefined;
            body?: undefined;
            channels?: undefined;
            notification_id?: undefined;
            schedule?: undefined;
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
            table?: undefined;
            event?: undefined;
            active?: undefined;
            limit?: undefined;
            sys_id_or_name?: undefined;
            name?: undefined;
            subject?: undefined;
            message_html?: undefined;
            recipients?: undefined;
            condition?: undefined;
            state?: undefined;
            recipient?: undefined;
            record_sys_id?: undefined;
            attachment_sys_id?: undefined;
            file_name?: undefined;
            content_type?: undefined;
            content_base64?: undefined;
            user_sys_id?: undefined;
            notification_sys_id?: undefined;
            body?: undefined;
            channels?: undefined;
            notification_id?: undefined;
            schedule?: undefined;
        };
        required: string[];
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
            recipient: {
                type: string;
                description: string;
            };
            subject: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            query?: undefined;
            table?: undefined;
            event?: undefined;
            active?: undefined;
            sys_id_or_name?: undefined;
            name?: undefined;
            message_html?: undefined;
            recipients?: undefined;
            condition?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            record_sys_id?: undefined;
            attachment_sys_id?: undefined;
            file_name?: undefined;
            content_type?: undefined;
            content_base64?: undefined;
            user_sys_id?: undefined;
            notification_sys_id?: undefined;
            body?: undefined;
            channels?: undefined;
            notification_id?: undefined;
            schedule?: undefined;
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
            query?: undefined;
            table?: undefined;
            event?: undefined;
            active?: undefined;
            limit?: undefined;
            sys_id_or_name?: undefined;
            name?: undefined;
            subject?: undefined;
            message_html?: undefined;
            recipients?: undefined;
            condition?: undefined;
            fields?: undefined;
            state?: undefined;
            recipient?: undefined;
            record_sys_id?: undefined;
            attachment_sys_id?: undefined;
            file_name?: undefined;
            content_type?: undefined;
            content_base64?: undefined;
            user_sys_id?: undefined;
            notification_sys_id?: undefined;
            body?: undefined;
            channels?: undefined;
            notification_id?: undefined;
            schedule?: undefined;
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
            record_sys_id: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            query?: undefined;
            event?: undefined;
            active?: undefined;
            sys_id_or_name?: undefined;
            name?: undefined;
            subject?: undefined;
            message_html?: undefined;
            recipients?: undefined;
            condition?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            state?: undefined;
            recipient?: undefined;
            attachment_sys_id?: undefined;
            file_name?: undefined;
            content_type?: undefined;
            content_base64?: undefined;
            user_sys_id?: undefined;
            notification_sys_id?: undefined;
            body?: undefined;
            channels?: undefined;
            notification_id?: undefined;
            schedule?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            attachment_sys_id: {
                type: string;
                description: string;
            };
            query?: undefined;
            table?: undefined;
            event?: undefined;
            active?: undefined;
            limit?: undefined;
            sys_id_or_name?: undefined;
            name?: undefined;
            subject?: undefined;
            message_html?: undefined;
            recipients?: undefined;
            condition?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            state?: undefined;
            recipient?: undefined;
            record_sys_id?: undefined;
            file_name?: undefined;
            content_type?: undefined;
            content_base64?: undefined;
            user_sys_id?: undefined;
            notification_sys_id?: undefined;
            body?: undefined;
            channels?: undefined;
            notification_id?: undefined;
            schedule?: undefined;
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
            record_sys_id: {
                type: string;
                description: string;
            };
            file_name: {
                type: string;
                description: string;
            };
            content_type: {
                type: string;
                description: string;
            };
            content_base64: {
                type: string;
                description: string;
            };
            query?: undefined;
            event?: undefined;
            active?: undefined;
            limit?: undefined;
            sys_id_or_name?: undefined;
            name?: undefined;
            subject?: undefined;
            message_html?: undefined;
            recipients?: undefined;
            condition?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            state?: undefined;
            recipient?: undefined;
            attachment_sys_id?: undefined;
            user_sys_id?: undefined;
            notification_sys_id?: undefined;
            body?: undefined;
            channels?: undefined;
            notification_id?: undefined;
            schedule?: undefined;
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
            limit: {
                type: string;
                description: string;
            };
            table?: undefined;
            event?: undefined;
            active?: undefined;
            sys_id_or_name?: undefined;
            name?: undefined;
            subject?: undefined;
            message_html?: undefined;
            recipients?: undefined;
            condition?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            state?: undefined;
            recipient?: undefined;
            record_sys_id?: undefined;
            attachment_sys_id?: undefined;
            file_name?: undefined;
            content_type?: undefined;
            content_base64?: undefined;
            user_sys_id?: undefined;
            notification_sys_id?: undefined;
            body?: undefined;
            channels?: undefined;
            notification_id?: undefined;
            schedule?: undefined;
        };
        required: never[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            user_sys_id: {
                type: string;
                description: string;
            };
            notification_sys_id: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            query?: undefined;
            table?: undefined;
            event?: undefined;
            active?: undefined;
            sys_id_or_name?: undefined;
            name?: undefined;
            subject?: undefined;
            message_html?: undefined;
            recipients?: undefined;
            condition?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            state?: undefined;
            recipient?: undefined;
            record_sys_id?: undefined;
            attachment_sys_id?: undefined;
            file_name?: undefined;
            content_type?: undefined;
            content_base64?: undefined;
            body?: undefined;
            channels?: undefined;
            notification_id?: undefined;
            schedule?: undefined;
        };
        required: never[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            subject: {
                type: string;
                description: string;
            };
            body: {
                type: string;
                description: string;
            };
            recipients: {
                type: string;
                description: string;
            };
            channels: {
                type: string;
                description: string;
            };
            query?: undefined;
            table?: undefined;
            event?: undefined;
            active?: undefined;
            limit?: undefined;
            sys_id_or_name?: undefined;
            name?: undefined;
            message_html?: undefined;
            condition?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            state?: undefined;
            recipient?: undefined;
            record_sys_id?: undefined;
            attachment_sys_id?: undefined;
            file_name?: undefined;
            content_type?: undefined;
            content_base64?: undefined;
            user_sys_id?: undefined;
            notification_sys_id?: undefined;
            notification_id?: undefined;
            schedule?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            notification_id: {
                type: string;
                description: string;
            };
            schedule: {
                type: string;
                description: string;
            };
            active: {
                type: string;
                description: string;
            };
            query?: undefined;
            table?: undefined;
            event?: undefined;
            limit?: undefined;
            sys_id_or_name?: undefined;
            name?: undefined;
            subject?: undefined;
            message_html?: undefined;
            recipients?: undefined;
            condition?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            state?: undefined;
            recipient?: undefined;
            record_sys_id?: undefined;
            attachment_sys_id?: undefined;
            file_name?: undefined;
            content_type?: undefined;
            content_base64?: undefined;
            user_sys_id?: undefined;
            notification_sys_id?: undefined;
            body?: undefined;
            channels?: undefined;
        };
        required: string[];
    };
})[];
export declare function dispatchNotificationAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
//# sourceMappingURL=notification.d.ts.map