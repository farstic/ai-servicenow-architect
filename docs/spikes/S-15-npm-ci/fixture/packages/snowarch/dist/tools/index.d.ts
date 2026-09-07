/**
 * Tool Router — aggregates all domain tool modules and implements the
 * MCP_TOOL_PACKAGE role-based packaging system.
 *
 * Tool packages (set via MCP_TOOL_PACKAGE env var):
 *   full (default), service_desk, change_coordinator, knowledge_author,
 *   catalog_builder, system_administrator, platform_developer, itom_engineer,
 *   agile_manager, ai_developer, portal_developer, integration_engineer
 */
import type { ServiceNowClient } from '../servicenow/client.js';
export declare const ROLE_BUNDLE_MAP: Record<string, string[]>;
export declare function collectToolCatalog(): ({
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
            fields: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            orderBy: {
                type: string;
                description: string;
            };
            sys_id?: undefined;
            user_identifier?: undefined;
            group_identifier?: undefined;
            ci_sys_id?: undefined;
            active_only?: undefined;
            service_sys_id?: undefined;
            instruction?: undefined;
            name?: undefined;
            parent?: undefined;
            child?: undefined;
            type?: undefined;
            depth?: undefined;
            schedule_id?: undefined;
            mid_server?: undefined;
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
            query?: undefined;
            fields?: undefined;
            limit?: undefined;
            orderBy?: undefined;
            sys_id?: undefined;
            user_identifier?: undefined;
            group_identifier?: undefined;
            ci_sys_id?: undefined;
            active_only?: undefined;
            service_sys_id?: undefined;
            instruction?: undefined;
            name?: undefined;
            parent?: undefined;
            child?: undefined;
            type?: undefined;
            depth?: undefined;
            schedule_id?: undefined;
            mid_server?: undefined;
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
            fields: {
                type: string;
                description: string;
            };
            query?: undefined;
            limit?: undefined;
            orderBy?: undefined;
            user_identifier?: undefined;
            group_identifier?: undefined;
            ci_sys_id?: undefined;
            active_only?: undefined;
            service_sys_id?: undefined;
            instruction?: undefined;
            name?: undefined;
            parent?: undefined;
            child?: undefined;
            type?: undefined;
            depth?: undefined;
            schedule_id?: undefined;
            mid_server?: undefined;
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
            fields: {
                type: string;
                description: string;
            };
            query?: undefined;
            limit?: undefined;
            orderBy?: undefined;
            sys_id?: undefined;
            user_identifier?: undefined;
            group_identifier?: undefined;
            ci_sys_id?: undefined;
            active_only?: undefined;
            service_sys_id?: undefined;
            instruction?: undefined;
            name?: undefined;
            parent?: undefined;
            child?: undefined;
            type?: undefined;
            depth?: undefined;
            schedule_id?: undefined;
            mid_server?: undefined;
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
            query?: undefined;
            fields?: undefined;
            limit?: undefined;
            orderBy?: undefined;
            user_identifier?: undefined;
            group_identifier?: undefined;
            ci_sys_id?: undefined;
            active_only?: undefined;
            service_sys_id?: undefined;
            instruction?: undefined;
            name?: undefined;
            parent?: undefined;
            child?: undefined;
            type?: undefined;
            depth?: undefined;
            schedule_id?: undefined;
            mid_server?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            user_identifier: {
                type: string;
                description: string;
            };
            table?: undefined;
            query?: undefined;
            fields?: undefined;
            limit?: undefined;
            orderBy?: undefined;
            sys_id?: undefined;
            group_identifier?: undefined;
            ci_sys_id?: undefined;
            active_only?: undefined;
            service_sys_id?: undefined;
            instruction?: undefined;
            name?: undefined;
            parent?: undefined;
            child?: undefined;
            type?: undefined;
            depth?: undefined;
            schedule_id?: undefined;
            mid_server?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            group_identifier: {
                type: string;
                description: string;
            };
            table?: undefined;
            query?: undefined;
            fields?: undefined;
            limit?: undefined;
            orderBy?: undefined;
            sys_id?: undefined;
            user_identifier?: undefined;
            ci_sys_id?: undefined;
            active_only?: undefined;
            service_sys_id?: undefined;
            instruction?: undefined;
            name?: undefined;
            parent?: undefined;
            child?: undefined;
            type?: undefined;
            depth?: undefined;
            schedule_id?: undefined;
            mid_server?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            ci_sys_id: {
                type: string;
                description: string;
            };
            fields: {
                type: string;
                description: string;
            };
            table?: undefined;
            query?: undefined;
            limit?: undefined;
            orderBy?: undefined;
            sys_id?: undefined;
            user_identifier?: undefined;
            group_identifier?: undefined;
            active_only?: undefined;
            service_sys_id?: undefined;
            instruction?: undefined;
            name?: undefined;
            parent?: undefined;
            child?: undefined;
            type?: undefined;
            depth?: undefined;
            schedule_id?: undefined;
            mid_server?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            ci_sys_id: {
                type: string;
                description: string;
            };
            table?: undefined;
            query?: undefined;
            fields?: undefined;
            limit?: undefined;
            orderBy?: undefined;
            sys_id?: undefined;
            user_identifier?: undefined;
            group_identifier?: undefined;
            active_only?: undefined;
            service_sys_id?: undefined;
            instruction?: undefined;
            name?: undefined;
            parent?: undefined;
            child?: undefined;
            type?: undefined;
            depth?: undefined;
            schedule_id?: undefined;
            mid_server?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            active_only: {
                type: string;
                description: string;
            };
            table?: undefined;
            query?: undefined;
            fields?: undefined;
            limit?: undefined;
            orderBy?: undefined;
            sys_id?: undefined;
            user_identifier?: undefined;
            group_identifier?: undefined;
            ci_sys_id?: undefined;
            service_sys_id?: undefined;
            instruction?: undefined;
            name?: undefined;
            parent?: undefined;
            child?: undefined;
            type?: undefined;
            depth?: undefined;
            schedule_id?: undefined;
            mid_server?: undefined;
        };
        required: never[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            table?: undefined;
            query?: undefined;
            fields?: undefined;
            limit?: undefined;
            orderBy?: undefined;
            sys_id?: undefined;
            user_identifier?: undefined;
            group_identifier?: undefined;
            ci_sys_id?: undefined;
            active_only?: undefined;
            service_sys_id?: undefined;
            instruction?: undefined;
            name?: undefined;
            parent?: undefined;
            child?: undefined;
            type?: undefined;
            depth?: undefined;
            schedule_id?: undefined;
            mid_server?: undefined;
        };
        required: never[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            service_sys_id: {
                type: string;
                description: string;
            };
            table?: undefined;
            query?: undefined;
            fields?: undefined;
            limit?: undefined;
            orderBy?: undefined;
            sys_id?: undefined;
            user_identifier?: undefined;
            group_identifier?: undefined;
            ci_sys_id?: undefined;
            active_only?: undefined;
            instruction?: undefined;
            name?: undefined;
            parent?: undefined;
            child?: undefined;
            type?: undefined;
            depth?: undefined;
            schedule_id?: undefined;
            mid_server?: undefined;
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
            fields?: undefined;
            orderBy?: undefined;
            sys_id?: undefined;
            user_identifier?: undefined;
            group_identifier?: undefined;
            ci_sys_id?: undefined;
            active_only?: undefined;
            service_sys_id?: undefined;
            instruction?: undefined;
            name?: undefined;
            parent?: undefined;
            child?: undefined;
            type?: undefined;
            depth?: undefined;
            schedule_id?: undefined;
            mid_server?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            instruction: {
                type: string;
                description: string;
            };
            table: {
                type: string;
                description: string;
            };
            query?: undefined;
            fields?: undefined;
            limit?: undefined;
            orderBy?: undefined;
            sys_id?: undefined;
            user_identifier?: undefined;
            group_identifier?: undefined;
            ci_sys_id?: undefined;
            active_only?: undefined;
            service_sys_id?: undefined;
            name?: undefined;
            parent?: undefined;
            child?: undefined;
            type?: undefined;
            depth?: undefined;
            schedule_id?: undefined;
            mid_server?: undefined;
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
            table?: undefined;
            query?: undefined;
            fields?: undefined;
            limit?: undefined;
            orderBy?: undefined;
            sys_id?: undefined;
            user_identifier?: undefined;
            group_identifier?: undefined;
            ci_sys_id?: undefined;
            active_only?: undefined;
            service_sys_id?: undefined;
            instruction?: undefined;
            parent?: undefined;
            child?: undefined;
            type?: undefined;
            depth?: undefined;
            schedule_id?: undefined;
            mid_server?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            parent: {
                type: string;
                description: string;
            };
            child: {
                type: string;
                description: string;
            };
            type: {
                type: string;
                description: string;
            };
            table?: undefined;
            query?: undefined;
            fields?: undefined;
            limit?: undefined;
            orderBy?: undefined;
            sys_id?: undefined;
            user_identifier?: undefined;
            group_identifier?: undefined;
            ci_sys_id?: undefined;
            active_only?: undefined;
            service_sys_id?: undefined;
            instruction?: undefined;
            name?: undefined;
            depth?: undefined;
            schedule_id?: undefined;
            mid_server?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            ci_sys_id: {
                type: string;
                description: string;
            };
            depth: {
                type: string;
                description: string;
            };
            table?: undefined;
            query?: undefined;
            fields?: undefined;
            limit?: undefined;
            orderBy?: undefined;
            sys_id?: undefined;
            user_identifier?: undefined;
            group_identifier?: undefined;
            active_only?: undefined;
            service_sys_id?: undefined;
            instruction?: undefined;
            name?: undefined;
            parent?: undefined;
            child?: undefined;
            type?: undefined;
            schedule_id?: undefined;
            mid_server?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            schedule_id: {
                type: string;
                description: string;
            };
            mid_server: {
                type: string;
                description: string;
            };
            table?: undefined;
            query?: undefined;
            fields?: undefined;
            limit?: undefined;
            orderBy?: undefined;
            sys_id?: undefined;
            user_identifier?: undefined;
            group_identifier?: undefined;
            ci_sys_id?: undefined;
            active_only?: undefined;
            service_sys_id?: undefined;
            instruction?: undefined;
            name?: undefined;
            parent?: undefined;
            child?: undefined;
            type?: undefined;
            depth?: undefined;
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
            urgency: {
                type: string;
                description: string;
            };
            impact: {
                type: string;
                description: string;
            };
            priority: {
                type: string;
                description: string;
            };
            description: {
                type: string;
                description: string;
            };
            assignment_group: {
                type: string;
                description: string;
            };
            caller_id: {
                type: string;
                description: string;
            };
            category: {
                type: string;
                description: string;
            };
            subcategory: {
                type: string;
                description: string;
            };
            number_or_sysid?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            resolution_code?: undefined;
            resolution_notes?: undefined;
            table?: undefined;
            note?: undefined;
            comment?: undefined;
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
            short_description?: undefined;
            urgency?: undefined;
            impact?: undefined;
            priority?: undefined;
            description?: undefined;
            assignment_group?: undefined;
            caller_id?: undefined;
            category?: undefined;
            subcategory?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            resolution_code?: undefined;
            resolution_notes?: undefined;
            table?: undefined;
            note?: undefined;
            comment?: undefined;
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
            short_description?: undefined;
            urgency?: undefined;
            impact?: undefined;
            priority?: undefined;
            description?: undefined;
            assignment_group?: undefined;
            caller_id?: undefined;
            category?: undefined;
            subcategory?: undefined;
            number_or_sysid?: undefined;
            resolution_code?: undefined;
            resolution_notes?: undefined;
            table?: undefined;
            note?: undefined;
            comment?: undefined;
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
            resolution_code: {
                type: string;
                description: string;
            };
            resolution_notes: {
                type: string;
                description: string;
            };
            short_description?: undefined;
            urgency?: undefined;
            impact?: undefined;
            priority?: undefined;
            description?: undefined;
            assignment_group?: undefined;
            caller_id?: undefined;
            category?: undefined;
            subcategory?: undefined;
            number_or_sysid?: undefined;
            fields?: undefined;
            table?: undefined;
            note?: undefined;
            comment?: undefined;
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
            short_description?: undefined;
            urgency?: undefined;
            impact?: undefined;
            priority?: undefined;
            description?: undefined;
            assignment_group?: undefined;
            caller_id?: undefined;
            category?: undefined;
            subcategory?: undefined;
            number_or_sysid?: undefined;
            fields?: undefined;
            resolution_code?: undefined;
            resolution_notes?: undefined;
            table?: undefined;
            note?: undefined;
            comment?: undefined;
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
            note: {
                type: string;
                description: string;
            };
            short_description?: undefined;
            urgency?: undefined;
            impact?: undefined;
            priority?: undefined;
            description?: undefined;
            assignment_group?: undefined;
            caller_id?: undefined;
            category?: undefined;
            subcategory?: undefined;
            number_or_sysid?: undefined;
            fields?: undefined;
            resolution_code?: undefined;
            resolution_notes?: undefined;
            comment?: undefined;
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
            comment: {
                type: string;
                description: string;
            };
            short_description?: undefined;
            urgency?: undefined;
            impact?: undefined;
            priority?: undefined;
            description?: undefined;
            assignment_group?: undefined;
            caller_id?: undefined;
            category?: undefined;
            subcategory?: undefined;
            number_or_sysid?: undefined;
            fields?: undefined;
            resolution_code?: undefined;
            resolution_notes?: undefined;
            note?: undefined;
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
            assignment_group: {
                type: string;
                description: string;
            };
            priority: {
                type: string;
                description: string;
            };
            number_or_sysid?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            root_cause?: undefined;
            resolution_notes?: undefined;
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
            short_description?: undefined;
            description?: undefined;
            assignment_group?: undefined;
            priority?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            root_cause?: undefined;
            resolution_notes?: undefined;
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
            short_description?: undefined;
            description?: undefined;
            assignment_group?: undefined;
            priority?: undefined;
            number_or_sysid?: undefined;
            root_cause?: undefined;
            resolution_notes?: undefined;
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
            root_cause: {
                type: string;
                description: string;
            };
            resolution_notes: {
                type: string;
                description: string;
            };
            short_description?: undefined;
            description?: undefined;
            assignment_group?: undefined;
            priority?: undefined;
            number_or_sysid?: undefined;
            fields?: undefined;
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
            type: {
                type: string;
                description: string;
            };
            category: {
                type: string;
                description: string;
            };
            risk: {
                type: string;
                description: string;
            };
            impact: {
                type: string;
                description: string;
            };
            priority: {
                type: string;
                description: string;
            };
            assignment_group: {
                type: string;
                description: string;
            };
            assigned_to: {
                type: string;
                description: string;
            };
            start_date: {
                type: string;
                description: string;
            };
            end_date: {
                type: string;
                description: string;
            };
            implementation_plan: {
                type: string;
                description: string;
            };
            backout_plan: {
                type: string;
                description: string;
            };
            test_plan: {
                type: string;
                description: string;
            };
            cmdb_ci: {
                type: string;
                description: string;
            };
            number_or_sysid?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            query?: undefined;
            state?: undefined;
            limit?: undefined;
            close_code?: undefined;
            close_notes?: undefined;
            change_id?: undefined;
            date?: undefined;
            duration_minutes?: undefined;
            attendees?: undefined;
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
            short_description?: undefined;
            description?: undefined;
            type?: undefined;
            category?: undefined;
            risk?: undefined;
            impact?: undefined;
            priority?: undefined;
            assignment_group?: undefined;
            assigned_to?: undefined;
            start_date?: undefined;
            end_date?: undefined;
            implementation_plan?: undefined;
            backout_plan?: undefined;
            test_plan?: undefined;
            cmdb_ci?: undefined;
            number_or_sysid?: undefined;
            fields?: undefined;
            query?: undefined;
            state?: undefined;
            limit?: undefined;
            close_code?: undefined;
            close_notes?: undefined;
            change_id?: undefined;
            date?: undefined;
            duration_minutes?: undefined;
            attendees?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            change_id: {
                type: string;
                description: string;
            };
            date: {
                type: string;
                description: string;
            };
            duration_minutes: {
                type: string;
                description: string;
            };
            attendees: {
                type: string;
                description: string;
            };
            short_description?: undefined;
            description?: undefined;
            type?: undefined;
            category?: undefined;
            risk?: undefined;
            impact?: undefined;
            priority?: undefined;
            assignment_group?: undefined;
            assigned_to?: undefined;
            start_date?: undefined;
            end_date?: undefined;
            implementation_plan?: undefined;
            backout_plan?: undefined;
            test_plan?: undefined;
            cmdb_ci?: undefined;
            number_or_sysid?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            query?: undefined;
            state?: undefined;
            limit?: undefined;
            close_code?: undefined;
            close_notes?: undefined;
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
            sys_id?: undefined;
            fields?: undefined;
            limit?: undefined;
            close_notes?: undefined;
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
            number_or_sysid?: undefined;
            limit?: undefined;
            close_notes?: undefined;
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
            number_or_sysid?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            close_notes?: undefined;
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
            close_notes: {
                type: string;
                description: string;
            };
            number_or_sysid?: undefined;
            fields?: undefined;
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
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            category: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            query?: undefined;
            sys_id_or_name?: undefined;
            name?: undefined;
            short_description?: undefined;
            description?: undefined;
            price?: undefined;
            delivery_time?: undefined;
            active?: undefined;
            roles?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            quantity?: undefined;
            variables?: undefined;
            table?: undefined;
            approver_type?: undefined;
            approver?: undefined;
            condition?: undefined;
            order?: undefined;
            state?: undefined;
            comments?: undefined;
            task_sys_id?: undefined;
            cat_item_id?: undefined;
            question_text?: undefined;
            type?: undefined;
            mandatory?: undefined;
            conditions?: undefined;
            reverse_if_false?: undefined;
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
            category?: undefined;
            sys_id_or_name?: undefined;
            name?: undefined;
            short_description?: undefined;
            description?: undefined;
            price?: undefined;
            delivery_time?: undefined;
            active?: undefined;
            roles?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            quantity?: undefined;
            variables?: undefined;
            table?: undefined;
            approver_type?: undefined;
            approver?: undefined;
            condition?: undefined;
            order?: undefined;
            state?: undefined;
            comments?: undefined;
            task_sys_id?: undefined;
            cat_item_id?: undefined;
            question_text?: undefined;
            type?: undefined;
            mandatory?: undefined;
            conditions?: undefined;
            reverse_if_false?: undefined;
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
            category?: undefined;
            limit?: undefined;
            query?: undefined;
            name?: undefined;
            short_description?: undefined;
            description?: undefined;
            price?: undefined;
            delivery_time?: undefined;
            active?: undefined;
            roles?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            quantity?: undefined;
            variables?: undefined;
            table?: undefined;
            approver_type?: undefined;
            approver?: undefined;
            condition?: undefined;
            order?: undefined;
            state?: undefined;
            comments?: undefined;
            task_sys_id?: undefined;
            cat_item_id?: undefined;
            question_text?: undefined;
            type?: undefined;
            mandatory?: undefined;
            conditions?: undefined;
            reverse_if_false?: undefined;
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
            short_description: {
                type: string;
                description: string;
            };
            description: {
                type: string;
                description: string;
            };
            category: {
                type: string;
                description: string;
            };
            price: {
                type: string;
                description: string;
            };
            delivery_time: {
                type: string;
                description: string;
            };
            active: {
                type: string;
                description: string;
            };
            roles: {
                type: string;
                description: string;
            };
            limit?: undefined;
            query?: undefined;
            sys_id_or_name?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            quantity?: undefined;
            variables?: undefined;
            table?: undefined;
            approver_type?: undefined;
            approver?: undefined;
            condition?: undefined;
            order?: undefined;
            state?: undefined;
            comments?: undefined;
            task_sys_id?: undefined;
            cat_item_id?: undefined;
            question_text?: undefined;
            type?: undefined;
            mandatory?: undefined;
            conditions?: undefined;
            reverse_if_false?: undefined;
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
            category?: undefined;
            limit?: undefined;
            query?: undefined;
            sys_id_or_name?: undefined;
            name?: undefined;
            short_description?: undefined;
            description?: undefined;
            price?: undefined;
            delivery_time?: undefined;
            active?: undefined;
            roles?: undefined;
            quantity?: undefined;
            variables?: undefined;
            table?: undefined;
            approver_type?: undefined;
            approver?: undefined;
            condition?: undefined;
            order?: undefined;
            state?: undefined;
            comments?: undefined;
            task_sys_id?: undefined;
            cat_item_id?: undefined;
            question_text?: undefined;
            type?: undefined;
            mandatory?: undefined;
            conditions?: undefined;
            reverse_if_false?: undefined;
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
            quantity: {
                type: string;
                description: string;
            };
            variables: {
                type: string;
                description: string;
            };
            category?: undefined;
            limit?: undefined;
            query?: undefined;
            sys_id_or_name?: undefined;
            name?: undefined;
            short_description?: undefined;
            description?: undefined;
            price?: undefined;
            delivery_time?: undefined;
            active?: undefined;
            roles?: undefined;
            fields?: undefined;
            table?: undefined;
            approver_type?: undefined;
            approver?: undefined;
            condition?: undefined;
            order?: undefined;
            state?: undefined;
            comments?: undefined;
            task_sys_id?: undefined;
            cat_item_id?: undefined;
            question_text?: undefined;
            type?: undefined;
            mandatory?: undefined;
            conditions?: undefined;
            reverse_if_false?: undefined;
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
            approver_type: {
                type: string;
                description: string;
            };
            approver: {
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
            category?: undefined;
            limit?: undefined;
            query?: undefined;
            sys_id_or_name?: undefined;
            short_description?: undefined;
            description?: undefined;
            price?: undefined;
            delivery_time?: undefined;
            roles?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            quantity?: undefined;
            variables?: undefined;
            state?: undefined;
            comments?: undefined;
            task_sys_id?: undefined;
            cat_item_id?: undefined;
            question_text?: undefined;
            type?: undefined;
            mandatory?: undefined;
            conditions?: undefined;
            reverse_if_false?: undefined;
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
            category?: undefined;
            limit?: undefined;
            query?: undefined;
            sys_id_or_name?: undefined;
            name?: undefined;
            short_description?: undefined;
            description?: undefined;
            price?: undefined;
            delivery_time?: undefined;
            active?: undefined;
            roles?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            quantity?: undefined;
            variables?: undefined;
            table?: undefined;
            approver_type?: undefined;
            approver?: undefined;
            condition?: undefined;
            order?: undefined;
            comments?: undefined;
            task_sys_id?: undefined;
            cat_item_id?: undefined;
            question_text?: undefined;
            type?: undefined;
            mandatory?: undefined;
            conditions?: undefined;
            reverse_if_false?: undefined;
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
            state: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            category?: undefined;
            sys_id_or_name?: undefined;
            name?: undefined;
            short_description?: undefined;
            description?: undefined;
            price?: undefined;
            delivery_time?: undefined;
            active?: undefined;
            roles?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            quantity?: undefined;
            variables?: undefined;
            table?: undefined;
            approver_type?: undefined;
            approver?: undefined;
            condition?: undefined;
            order?: undefined;
            comments?: undefined;
            task_sys_id?: undefined;
            cat_item_id?: undefined;
            question_text?: undefined;
            type?: undefined;
            mandatory?: undefined;
            conditions?: undefined;
            reverse_if_false?: undefined;
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
            comments: {
                type: string;
                description: string;
            };
            category?: undefined;
            limit?: undefined;
            query?: undefined;
            sys_id_or_name?: undefined;
            name?: undefined;
            short_description?: undefined;
            description?: undefined;
            price?: undefined;
            delivery_time?: undefined;
            active?: undefined;
            roles?: undefined;
            fields?: undefined;
            quantity?: undefined;
            variables?: undefined;
            table?: undefined;
            approver_type?: undefined;
            approver?: undefined;
            condition?: undefined;
            order?: undefined;
            state?: undefined;
            task_sys_id?: undefined;
            cat_item_id?: undefined;
            question_text?: undefined;
            type?: undefined;
            mandatory?: undefined;
            conditions?: undefined;
            reverse_if_false?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            task_sys_id: {
                type: string;
                description: string;
            };
            category?: undefined;
            limit?: undefined;
            query?: undefined;
            sys_id_or_name?: undefined;
            name?: undefined;
            short_description?: undefined;
            description?: undefined;
            price?: undefined;
            delivery_time?: undefined;
            active?: undefined;
            roles?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            quantity?: undefined;
            variables?: undefined;
            table?: undefined;
            approver_type?: undefined;
            approver?: undefined;
            condition?: undefined;
            order?: undefined;
            state?: undefined;
            comments?: undefined;
            cat_item_id?: undefined;
            question_text?: undefined;
            type?: undefined;
            mandatory?: undefined;
            conditions?: undefined;
            reverse_if_false?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            cat_item_id: {
                type: string;
                description: string;
            };
            name: {
                type: string;
                description: string;
            };
            question_text: {
                type: string;
                description: string;
            };
            type: {
                type: string;
                description: string;
            };
            order: {
                type: string;
                description: string;
            };
            mandatory: {
                type: string;
                description: string;
            };
            category?: undefined;
            limit?: undefined;
            query?: undefined;
            sys_id_or_name?: undefined;
            short_description?: undefined;
            description?: undefined;
            price?: undefined;
            delivery_time?: undefined;
            active?: undefined;
            roles?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            quantity?: undefined;
            variables?: undefined;
            table?: undefined;
            approver_type?: undefined;
            approver?: undefined;
            condition?: undefined;
            state?: undefined;
            comments?: undefined;
            task_sys_id?: undefined;
            conditions?: undefined;
            reverse_if_false?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            cat_item_id: {
                type: string;
                description: string;
            };
            short_description: {
                type: string;
                description: string;
            };
            conditions: {
                type: string;
                description: string;
            };
            reverse_if_false: {
                type: string;
                description: string;
            };
            category?: undefined;
            limit?: undefined;
            query?: undefined;
            sys_id_or_name?: undefined;
            name?: undefined;
            description?: undefined;
            price?: undefined;
            delivery_time?: undefined;
            active?: undefined;
            roles?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            quantity?: undefined;
            variables?: undefined;
            table?: undefined;
            approver_type?: undefined;
            approver?: undefined;
            condition?: undefined;
            order?: undefined;
            state?: undefined;
            comments?: undefined;
            task_sys_id?: undefined;
            question_text?: undefined;
            type?: undefined;
            mandatory?: undefined;
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
            user_name?: undefined;
            email?: undefined;
            first_name?: undefined;
            last_name?: undefined;
            title?: undefined;
            department?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            name?: undefined;
            description?: undefined;
            manager?: undefined;
            user_sys_id?: undefined;
            group_sys_id?: undefined;
            member_sys_id?: undefined;
        };
        required: never[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            user_name: {
                type: string;
                description: string;
            };
            email: {
                type: string;
                description: string;
            };
            first_name: {
                type: string;
                description: string;
            };
            last_name: {
                type: string;
                description: string;
            };
            title: {
                type: string;
                description: string;
            };
            department: {
                type: string;
                description: string;
            };
            query?: undefined;
            limit?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            name?: undefined;
            description?: undefined;
            manager?: undefined;
            user_sys_id?: undefined;
            group_sys_id?: undefined;
            member_sys_id?: undefined;
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
            user_name?: undefined;
            email?: undefined;
            first_name?: undefined;
            last_name?: undefined;
            title?: undefined;
            department?: undefined;
            name?: undefined;
            description?: undefined;
            manager?: undefined;
            user_sys_id?: undefined;
            group_sys_id?: undefined;
            member_sys_id?: undefined;
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
            manager: {
                type: string;
                description: string;
            };
            query?: undefined;
            limit?: undefined;
            user_name?: undefined;
            email?: undefined;
            first_name?: undefined;
            last_name?: undefined;
            title?: undefined;
            department?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            user_sys_id?: undefined;
            group_sys_id?: undefined;
            member_sys_id?: undefined;
        };
        required: string[];
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
            group_sys_id: {
                type: string;
                description: string;
            };
            query?: undefined;
            limit?: undefined;
            user_name?: undefined;
            email?: undefined;
            first_name?: undefined;
            last_name?: undefined;
            title?: undefined;
            department?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            name?: undefined;
            description?: undefined;
            manager?: undefined;
            member_sys_id?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            member_sys_id: {
                type: string;
                description: string;
            };
            query?: undefined;
            limit?: undefined;
            user_name?: undefined;
            email?: undefined;
            first_name?: undefined;
            last_name?: undefined;
            title?: undefined;
            department?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            name?: undefined;
            description?: undefined;
            manager?: undefined;
            user_sys_id?: undefined;
            group_sys_id?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            search: {
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
            sys_id_or_name?: undefined;
            table?: undefined;
            group_by?: undefined;
            aggregate?: undefined;
            query?: undefined;
            date_field?: undefined;
            periods?: undefined;
            widget_sys_id?: undefined;
            time_range?: undefined;
            fields?: undefined;
            active?: undefined;
            name?: undefined;
            script?: undefined;
            run_type?: undefined;
            run_time?: undefined;
            run_period?: undefined;
            sys_id?: undefined;
            title?: undefined;
            type?: undefined;
            field?: undefined;
            roles?: undefined;
            job_sys_id?: undefined;
            status?: undefined;
            report_id?: undefined;
            frequency?: undefined;
            recipients?: undefined;
            day_of_week?: undefined;
            day_of_month?: undefined;
            format?: undefined;
            conditions?: undefined;
            unit?: undefined;
            content?: undefined;
            sections?: undefined;
            capability?: undefined;
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
            search?: undefined;
            category?: undefined;
            limit?: undefined;
            table?: undefined;
            group_by?: undefined;
            aggregate?: undefined;
            query?: undefined;
            date_field?: undefined;
            periods?: undefined;
            widget_sys_id?: undefined;
            time_range?: undefined;
            fields?: undefined;
            active?: undefined;
            name?: undefined;
            script?: undefined;
            run_type?: undefined;
            run_time?: undefined;
            run_period?: undefined;
            sys_id?: undefined;
            title?: undefined;
            type?: undefined;
            field?: undefined;
            roles?: undefined;
            job_sys_id?: undefined;
            status?: undefined;
            report_id?: undefined;
            frequency?: undefined;
            recipients?: undefined;
            day_of_week?: undefined;
            day_of_month?: undefined;
            format?: undefined;
            conditions?: undefined;
            unit?: undefined;
            content?: undefined;
            sections?: undefined;
            capability?: undefined;
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
            group_by: {
                type: string;
                description: string;
            };
            aggregate: {
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
            search?: undefined;
            category?: undefined;
            sys_id_or_name?: undefined;
            date_field?: undefined;
            periods?: undefined;
            widget_sys_id?: undefined;
            time_range?: undefined;
            fields?: undefined;
            active?: undefined;
            name?: undefined;
            script?: undefined;
            run_type?: undefined;
            run_time?: undefined;
            run_period?: undefined;
            sys_id?: undefined;
            title?: undefined;
            type?: undefined;
            field?: undefined;
            roles?: undefined;
            job_sys_id?: undefined;
            status?: undefined;
            report_id?: undefined;
            frequency?: undefined;
            recipients?: undefined;
            day_of_week?: undefined;
            day_of_month?: undefined;
            format?: undefined;
            conditions?: undefined;
            unit?: undefined;
            content?: undefined;
            sections?: undefined;
            capability?: undefined;
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
            date_field: {
                type: string;
                description: string;
            };
            group_by: {
                type: string;
                description: string;
            };
            query: {
                type: string;
                description: string;
            };
            periods: {
                type: string;
                description: string;
            };
            search?: undefined;
            category?: undefined;
            limit?: undefined;
            sys_id_or_name?: undefined;
            aggregate?: undefined;
            widget_sys_id?: undefined;
            time_range?: undefined;
            fields?: undefined;
            active?: undefined;
            name?: undefined;
            script?: undefined;
            run_type?: undefined;
            run_time?: undefined;
            run_period?: undefined;
            sys_id?: undefined;
            title?: undefined;
            type?: undefined;
            field?: undefined;
            roles?: undefined;
            job_sys_id?: undefined;
            status?: undefined;
            report_id?: undefined;
            frequency?: undefined;
            recipients?: undefined;
            day_of_week?: undefined;
            day_of_month?: undefined;
            format?: undefined;
            conditions?: undefined;
            unit?: undefined;
            content?: undefined;
            sections?: undefined;
            capability?: undefined;
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
            time_range: {
                type: string;
                description: string;
            };
            search?: undefined;
            category?: undefined;
            limit?: undefined;
            sys_id_or_name?: undefined;
            table?: undefined;
            group_by?: undefined;
            aggregate?: undefined;
            query?: undefined;
            date_field?: undefined;
            periods?: undefined;
            fields?: undefined;
            active?: undefined;
            name?: undefined;
            script?: undefined;
            run_type?: undefined;
            run_time?: undefined;
            run_period?: undefined;
            sys_id?: undefined;
            title?: undefined;
            type?: undefined;
            field?: undefined;
            roles?: undefined;
            job_sys_id?: undefined;
            status?: undefined;
            report_id?: undefined;
            frequency?: undefined;
            recipients?: undefined;
            day_of_week?: undefined;
            day_of_month?: undefined;
            format?: undefined;
            conditions?: undefined;
            unit?: undefined;
            content?: undefined;
            sections?: undefined;
            capability?: undefined;
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
            fields: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            search?: undefined;
            category?: undefined;
            sys_id_or_name?: undefined;
            group_by?: undefined;
            aggregate?: undefined;
            date_field?: undefined;
            periods?: undefined;
            widget_sys_id?: undefined;
            time_range?: undefined;
            active?: undefined;
            name?: undefined;
            script?: undefined;
            run_type?: undefined;
            run_time?: undefined;
            run_period?: undefined;
            sys_id?: undefined;
            title?: undefined;
            type?: undefined;
            field?: undefined;
            roles?: undefined;
            job_sys_id?: undefined;
            status?: undefined;
            report_id?: undefined;
            frequency?: undefined;
            recipients?: undefined;
            day_of_week?: undefined;
            day_of_month?: undefined;
            format?: undefined;
            conditions?: undefined;
            unit?: undefined;
            content?: undefined;
            sections?: undefined;
            capability?: undefined;
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
            search?: undefined;
            category?: undefined;
            sys_id_or_name?: undefined;
            table?: undefined;
            group_by?: undefined;
            aggregate?: undefined;
            date_field?: undefined;
            periods?: undefined;
            widget_sys_id?: undefined;
            time_range?: undefined;
            fields?: undefined;
            active?: undefined;
            name?: undefined;
            script?: undefined;
            run_type?: undefined;
            run_time?: undefined;
            run_period?: undefined;
            sys_id?: undefined;
            title?: undefined;
            type?: undefined;
            field?: undefined;
            roles?: undefined;
            job_sys_id?: undefined;
            status?: undefined;
            report_id?: undefined;
            frequency?: undefined;
            recipients?: undefined;
            day_of_week?: undefined;
            day_of_month?: undefined;
            format?: undefined;
            conditions?: undefined;
            unit?: undefined;
            content?: undefined;
            sections?: undefined;
            capability?: undefined;
        };
        required: never[];
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
            query: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            search?: undefined;
            category?: undefined;
            sys_id_or_name?: undefined;
            table?: undefined;
            group_by?: undefined;
            aggregate?: undefined;
            date_field?: undefined;
            periods?: undefined;
            widget_sys_id?: undefined;
            time_range?: undefined;
            fields?: undefined;
            name?: undefined;
            script?: undefined;
            run_type?: undefined;
            run_time?: undefined;
            run_period?: undefined;
            sys_id?: undefined;
            title?: undefined;
            type?: undefined;
            field?: undefined;
            roles?: undefined;
            job_sys_id?: undefined;
            status?: undefined;
            report_id?: undefined;
            frequency?: undefined;
            recipients?: undefined;
            day_of_week?: undefined;
            day_of_month?: undefined;
            format?: undefined;
            conditions?: undefined;
            unit?: undefined;
            content?: undefined;
            sections?: undefined;
            capability?: undefined;
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
            script: {
                type: string;
                description: string;
            };
            run_type: {
                type: string;
                description: string;
            };
            run_time: {
                type: string;
                description: string;
            };
            run_period: {
                type: string;
                description: string;
            };
            active: {
                type: string;
                description: string;
            };
            search?: undefined;
            category?: undefined;
            limit?: undefined;
            sys_id_or_name?: undefined;
            table?: undefined;
            group_by?: undefined;
            aggregate?: undefined;
            query?: undefined;
            date_field?: undefined;
            periods?: undefined;
            widget_sys_id?: undefined;
            time_range?: undefined;
            fields?: undefined;
            sys_id?: undefined;
            title?: undefined;
            type?: undefined;
            field?: undefined;
            roles?: undefined;
            job_sys_id?: undefined;
            status?: undefined;
            report_id?: undefined;
            frequency?: undefined;
            recipients?: undefined;
            day_of_week?: undefined;
            day_of_month?: undefined;
            format?: undefined;
            conditions?: undefined;
            unit?: undefined;
            content?: undefined;
            sections?: undefined;
            capability?: undefined;
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
            search?: undefined;
            category?: undefined;
            limit?: undefined;
            sys_id_or_name?: undefined;
            table?: undefined;
            group_by?: undefined;
            aggregate?: undefined;
            query?: undefined;
            date_field?: undefined;
            periods?: undefined;
            widget_sys_id?: undefined;
            time_range?: undefined;
            active?: undefined;
            name?: undefined;
            script?: undefined;
            run_type?: undefined;
            run_time?: undefined;
            run_period?: undefined;
            title?: undefined;
            type?: undefined;
            field?: undefined;
            roles?: undefined;
            job_sys_id?: undefined;
            status?: undefined;
            report_id?: undefined;
            frequency?: undefined;
            recipients?: undefined;
            day_of_week?: undefined;
            day_of_month?: undefined;
            format?: undefined;
            conditions?: undefined;
            unit?: undefined;
            content?: undefined;
            sections?: undefined;
            capability?: undefined;
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
            search?: undefined;
            category?: undefined;
            limit?: undefined;
            sys_id_or_name?: undefined;
            table?: undefined;
            group_by?: undefined;
            aggregate?: undefined;
            query?: undefined;
            date_field?: undefined;
            periods?: undefined;
            widget_sys_id?: undefined;
            time_range?: undefined;
            fields?: undefined;
            active?: undefined;
            name?: undefined;
            script?: undefined;
            run_type?: undefined;
            run_time?: undefined;
            run_period?: undefined;
            title?: undefined;
            type?: undefined;
            field?: undefined;
            roles?: undefined;
            job_sys_id?: undefined;
            status?: undefined;
            report_id?: undefined;
            frequency?: undefined;
            recipients?: undefined;
            day_of_week?: undefined;
            day_of_month?: undefined;
            format?: undefined;
            conditions?: undefined;
            unit?: undefined;
            content?: undefined;
            sections?: undefined;
            capability?: undefined;
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
            table: {
                type: string;
                description: string;
            };
            type: {
                type: string;
                description: string;
            };
            field: {
                type: string;
                description: string;
            };
            query: {
                type: string;
                description: string;
            };
            aggregate: {
                type: string;
                description: string;
            };
            group_by: {
                type: string;
                description: string;
            };
            roles: {
                type: string;
                description: string;
            };
            search?: undefined;
            category?: undefined;
            limit?: undefined;
            sys_id_or_name?: undefined;
            date_field?: undefined;
            periods?: undefined;
            widget_sys_id?: undefined;
            time_range?: undefined;
            fields?: undefined;
            active?: undefined;
            name?: undefined;
            script?: undefined;
            run_type?: undefined;
            run_time?: undefined;
            run_period?: undefined;
            sys_id?: undefined;
            job_sys_id?: undefined;
            status?: undefined;
            report_id?: undefined;
            frequency?: undefined;
            recipients?: undefined;
            day_of_week?: undefined;
            day_of_month?: undefined;
            format?: undefined;
            conditions?: undefined;
            unit?: undefined;
            content?: undefined;
            sections?: undefined;
            capability?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            job_sys_id: {
                type: string;
                description: string;
            };
            status: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            search?: undefined;
            category?: undefined;
            sys_id_or_name?: undefined;
            table?: undefined;
            group_by?: undefined;
            aggregate?: undefined;
            query?: undefined;
            date_field?: undefined;
            periods?: undefined;
            widget_sys_id?: undefined;
            time_range?: undefined;
            fields?: undefined;
            active?: undefined;
            name?: undefined;
            script?: undefined;
            run_type?: undefined;
            run_time?: undefined;
            run_period?: undefined;
            sys_id?: undefined;
            title?: undefined;
            type?: undefined;
            field?: undefined;
            roles?: undefined;
            report_id?: undefined;
            frequency?: undefined;
            recipients?: undefined;
            day_of_week?: undefined;
            day_of_month?: undefined;
            format?: undefined;
            conditions?: undefined;
            unit?: undefined;
            content?: undefined;
            sections?: undefined;
            capability?: undefined;
        };
        required: never[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            report_id: {
                type: string;
                description: string;
            };
            frequency: {
                type: string;
                description: string;
            };
            recipients: {
                type: string;
                description: string;
            };
            day_of_week: {
                type: string;
                description: string;
            };
            day_of_month: {
                type: string;
                description: string;
            };
            format: {
                type: string;
                description: string;
                enum?: undefined;
            };
            search?: undefined;
            category?: undefined;
            limit?: undefined;
            sys_id_or_name?: undefined;
            table?: undefined;
            group_by?: undefined;
            aggregate?: undefined;
            query?: undefined;
            date_field?: undefined;
            periods?: undefined;
            widget_sys_id?: undefined;
            time_range?: undefined;
            fields?: undefined;
            active?: undefined;
            name?: undefined;
            script?: undefined;
            run_type?: undefined;
            run_time?: undefined;
            run_period?: undefined;
            sys_id?: undefined;
            title?: undefined;
            type?: undefined;
            field?: undefined;
            roles?: undefined;
            job_sys_id?: undefined;
            status?: undefined;
            conditions?: undefined;
            unit?: undefined;
            content?: undefined;
            sections?: undefined;
            capability?: undefined;
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
            field: {
                type: string;
                description: string;
            };
            aggregate: {
                type: string;
                description: string;
            };
            conditions: {
                type: string;
                description: string;
            };
            unit: {
                type: string;
                description: string;
            };
            search?: undefined;
            category?: undefined;
            limit?: undefined;
            sys_id_or_name?: undefined;
            group_by?: undefined;
            query?: undefined;
            date_field?: undefined;
            periods?: undefined;
            widget_sys_id?: undefined;
            time_range?: undefined;
            fields?: undefined;
            active?: undefined;
            script?: undefined;
            run_type?: undefined;
            run_time?: undefined;
            run_period?: undefined;
            sys_id?: undefined;
            title?: undefined;
            type?: undefined;
            roles?: undefined;
            job_sys_id?: undefined;
            status?: undefined;
            report_id?: undefined;
            frequency?: undefined;
            recipients?: undefined;
            day_of_week?: undefined;
            day_of_month?: undefined;
            format?: undefined;
            content?: undefined;
            sections?: undefined;
            capability?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            content: {
                type: string;
                description: string;
            };
            sections: {
                type: string;
                description: string;
                items: {
                    type: string;
                    properties: {
                        content: {
                            type: string;
                            description: string;
                        };
                        title: {
                            type: string;
                            description: string;
                        };
                        capability: {
                            type: string;
                            description: string;
                        };
                    };
                    required: string[];
                };
            };
            format: {
                type: string;
                enum: string[];
                description: string;
            };
            title: {
                type: string;
                description: string;
            };
            capability: {
                type: string;
                description: string;
            };
            search?: undefined;
            category?: undefined;
            limit?: undefined;
            sys_id_or_name?: undefined;
            table?: undefined;
            group_by?: undefined;
            aggregate?: undefined;
            query?: undefined;
            date_field?: undefined;
            periods?: undefined;
            widget_sys_id?: undefined;
            time_range?: undefined;
            fields?: undefined;
            active?: undefined;
            name?: undefined;
            script?: undefined;
            run_type?: undefined;
            run_time?: undefined;
            run_period?: undefined;
            sys_id?: undefined;
            type?: undefined;
            field?: undefined;
            roles?: undefined;
            job_sys_id?: undefined;
            status?: undefined;
            report_id?: undefined;
            frequency?: undefined;
            recipients?: undefined;
            day_of_week?: undefined;
            day_of_month?: undefined;
            conditions?: undefined;
            unit?: undefined;
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
            query: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            sys_id_or_name?: undefined;
            sys_id?: undefined;
            suite_sys_id?: undefined;
            result_sys_id?: undefined;
            suite_result_sys_id?: undefined;
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
            active?: undefined;
            query?: undefined;
            limit?: undefined;
            sys_id?: undefined;
            suite_sys_id?: undefined;
            result_sys_id?: undefined;
            suite_result_sys_id?: undefined;
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
            active?: undefined;
            query?: undefined;
            limit?: undefined;
            sys_id_or_name?: undefined;
            suite_sys_id?: undefined;
            result_sys_id?: undefined;
            suite_result_sys_id?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            suite_sys_id: {
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
            query?: undefined;
            sys_id_or_name?: undefined;
            sys_id?: undefined;
            result_sys_id?: undefined;
            suite_result_sys_id?: undefined;
        };
        required: never[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            result_sys_id: {
                type: string;
                description: string;
            };
            active?: undefined;
            query?: undefined;
            limit?: undefined;
            sys_id_or_name?: undefined;
            sys_id?: undefined;
            suite_sys_id?: undefined;
            suite_result_sys_id?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            suite_result_sys_id: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            active?: undefined;
            query?: undefined;
            sys_id_or_name?: undefined;
            sys_id?: undefined;
            suite_sys_id?: undefined;
            result_sys_id?: undefined;
        };
        required: never[];
    };
} | {
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
            story_points: {
                type: string;
                description: string;
            };
            sprint: {
                type: string;
                description: string;
            };
            epic: {
                type: string;
                description: string;
            };
            description: {
                type: string;
                description: string;
            };
            assigned_to: {
                type: string;
                description: string;
            };
            sys_id?: undefined;
            fields?: undefined;
            state?: undefined;
            limit?: undefined;
            project?: undefined;
            story_sys_id?: undefined;
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
            short_description?: undefined;
            story_points?: undefined;
            sprint?: undefined;
            epic?: undefined;
            description?: undefined;
            assigned_to?: undefined;
            state?: undefined;
            limit?: undefined;
            project?: undefined;
            story_sys_id?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            sprint: {
                type: string;
                description: string;
            };
            state: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            short_description?: undefined;
            story_points?: undefined;
            epic?: undefined;
            description?: undefined;
            assigned_to?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            project?: undefined;
            story_sys_id?: undefined;
        };
        required: never[];
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
            project: {
                type: string;
                description: string;
            };
            story_points?: undefined;
            sprint?: undefined;
            epic?: undefined;
            assigned_to?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            state?: undefined;
            limit?: undefined;
            story_sys_id?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            project: {
                type: string;
                description: string;
            };
            state: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            short_description?: undefined;
            story_points?: undefined;
            sprint?: undefined;
            epic?: undefined;
            description?: undefined;
            assigned_to?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            story_sys_id?: undefined;
        };
        required: never[];
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
            story_sys_id: {
                type: string;
                description: string;
            };
            assigned_to: {
                type: string;
                description: string;
            };
            story_points?: undefined;
            sprint?: undefined;
            epic?: undefined;
            description?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            state?: undefined;
            limit?: undefined;
            project?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            story_sys_id: {
                type: string;
                description: string;
            };
            assigned_to: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            short_description?: undefined;
            story_points?: undefined;
            sprint?: undefined;
            epic?: undefined;
            description?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            state?: undefined;
            project?: undefined;
        };
        required: never[];
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
            hr_service: {
                type: string;
                description: string;
            };
            subject_person: {
                type: string;
                description: string;
            };
            description: {
                type: string;
                description: string;
            };
            assignment_group: {
                type: string;
                description: string;
            };
            priority: {
                type: string;
                description: string;
            };
            number_or_sysid?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            state?: undefined;
            limit?: undefined;
            query?: undefined;
            close_notes?: undefined;
            close_code?: undefined;
            active?: undefined;
            sys_id_or_name?: undefined;
            user_identifier?: undefined;
            user_sys_id?: undefined;
            hr_case_sysid?: undefined;
            assigned_to?: undefined;
            due_date?: undefined;
            employee_sys_id?: undefined;
            start_date?: undefined;
            department?: undefined;
            manager?: undefined;
            location?: undefined;
            job_title?: undefined;
            last_day?: undefined;
            reason?: undefined;
            event_type?: undefined;
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
            sys_id_or_name: {
                type: string;
                description: string;
            };
            short_description?: undefined;
            hr_service?: undefined;
            subject_person?: undefined;
            description?: undefined;
            assignment_group?: undefined;
            priority?: undefined;
            number_or_sysid?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            state?: undefined;
            limit?: undefined;
            query?: undefined;
            close_notes?: undefined;
            close_code?: undefined;
            active?: undefined;
            user_identifier?: undefined;
            user_sys_id?: undefined;
            hr_case_sysid?: undefined;
            assigned_to?: undefined;
            due_date?: undefined;
            employee_sys_id?: undefined;
            start_date?: undefined;
            department?: undefined;
            manager?: undefined;
            location?: undefined;
            job_title?: undefined;
            last_day?: undefined;
            reason?: undefined;
            event_type?: undefined;
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
            user_identifier: {
                type: string;
                description: string;
            };
            short_description?: undefined;
            hr_service?: undefined;
            subject_person?: undefined;
            description?: undefined;
            assignment_group?: undefined;
            priority?: undefined;
            number_or_sysid?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            state?: undefined;
            limit?: undefined;
            query?: undefined;
            close_notes?: undefined;
            close_code?: undefined;
            active?: undefined;
            sys_id_or_name?: undefined;
            user_sys_id?: undefined;
            hr_case_sysid?: undefined;
            assigned_to?: undefined;
            due_date?: undefined;
            employee_sys_id?: undefined;
            start_date?: undefined;
            department?: undefined;
            manager?: undefined;
            location?: undefined;
            job_title?: undefined;
            last_day?: undefined;
            reason?: undefined;
            event_type?: undefined;
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
            user_sys_id: {
                type: string;
                description: string;
            };
            fields: {
                type: string;
                description: string;
            };
            short_description?: undefined;
            hr_service?: undefined;
            subject_person?: undefined;
            description?: undefined;
            assignment_group?: undefined;
            priority?: undefined;
            number_or_sysid?: undefined;
            sys_id?: undefined;
            state?: undefined;
            limit?: undefined;
            query?: undefined;
            close_notes?: undefined;
            close_code?: undefined;
            active?: undefined;
            sys_id_or_name?: undefined;
            user_identifier?: undefined;
            hr_case_sysid?: undefined;
            assigned_to?: undefined;
            due_date?: undefined;
            employee_sys_id?: undefined;
            start_date?: undefined;
            department?: undefined;
            manager?: undefined;
            location?: undefined;
            job_title?: undefined;
            last_day?: undefined;
            reason?: undefined;
            event_type?: undefined;
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
            hr_case_sysid: {
                type: string;
                description: string;
            };
            state: {
                type: string;
                description: string;
            };
            short_description?: undefined;
            hr_service?: undefined;
            subject_person?: undefined;
            description?: undefined;
            assignment_group?: undefined;
            priority?: undefined;
            number_or_sysid?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            limit?: undefined;
            query?: undefined;
            close_notes?: undefined;
            close_code?: undefined;
            active?: undefined;
            sys_id_or_name?: undefined;
            user_identifier?: undefined;
            user_sys_id?: undefined;
            assigned_to?: undefined;
            due_date?: undefined;
            employee_sys_id?: undefined;
            start_date?: undefined;
            department?: undefined;
            manager?: undefined;
            location?: undefined;
            job_title?: undefined;
            last_day?: undefined;
            reason?: undefined;
            event_type?: undefined;
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
            hr_case_sysid: {
                type: string;
                description: string;
            };
            short_description: {
                type: string;
                description: string;
            };
            assigned_to: {
                type: string;
                description: string;
            };
            due_date: {
                type: string;
                description: string;
            };
            hr_service?: undefined;
            subject_person?: undefined;
            description?: undefined;
            assignment_group?: undefined;
            priority?: undefined;
            number_or_sysid?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            state?: undefined;
            limit?: undefined;
            query?: undefined;
            close_notes?: undefined;
            close_code?: undefined;
            active?: undefined;
            sys_id_or_name?: undefined;
            user_identifier?: undefined;
            user_sys_id?: undefined;
            employee_sys_id?: undefined;
            start_date?: undefined;
            department?: undefined;
            manager?: undefined;
            location?: undefined;
            job_title?: undefined;
            last_day?: undefined;
            reason?: undefined;
            event_type?: undefined;
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
            hr_case_sysid: {
                type: string;
                description: string;
            };
            short_description?: undefined;
            hr_service?: undefined;
            subject_person?: undefined;
            description?: undefined;
            assignment_group?: undefined;
            priority?: undefined;
            number_or_sysid?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            state?: undefined;
            limit?: undefined;
            query?: undefined;
            close_notes?: undefined;
            close_code?: undefined;
            active?: undefined;
            sys_id_or_name?: undefined;
            user_identifier?: undefined;
            user_sys_id?: undefined;
            assigned_to?: undefined;
            due_date?: undefined;
            employee_sys_id?: undefined;
            start_date?: undefined;
            department?: undefined;
            manager?: undefined;
            location?: undefined;
            job_title?: undefined;
            last_day?: undefined;
            reason?: undefined;
            event_type?: undefined;
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
            employee_sys_id: {
                type: string;
                description: string;
            };
            start_date: {
                type: string;
                description: string;
            };
            department: {
                type: string;
                description: string;
            };
            manager: {
                type: string;
                description: string;
            };
            location: {
                type: string;
                description: string;
            };
            job_title: {
                type: string;
                description: string;
            };
            short_description?: undefined;
            hr_service?: undefined;
            subject_person?: undefined;
            description?: undefined;
            assignment_group?: undefined;
            priority?: undefined;
            number_or_sysid?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            state?: undefined;
            limit?: undefined;
            query?: undefined;
            close_notes?: undefined;
            close_code?: undefined;
            active?: undefined;
            sys_id_or_name?: undefined;
            user_identifier?: undefined;
            user_sys_id?: undefined;
            hr_case_sysid?: undefined;
            assigned_to?: undefined;
            due_date?: undefined;
            last_day?: undefined;
            reason?: undefined;
            event_type?: undefined;
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
            employee_sys_id: {
                type: string;
                description: string;
            };
            last_day: {
                type: string;
                description: string;
            };
            reason: {
                type: string;
                description: string;
            };
            manager: {
                type: string;
                description: string;
            };
            short_description?: undefined;
            hr_service?: undefined;
            subject_person?: undefined;
            description?: undefined;
            assignment_group?: undefined;
            priority?: undefined;
            number_or_sysid?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            state?: undefined;
            limit?: undefined;
            query?: undefined;
            close_notes?: undefined;
            close_code?: undefined;
            active?: undefined;
            sys_id_or_name?: undefined;
            user_identifier?: undefined;
            user_sys_id?: undefined;
            hr_case_sysid?: undefined;
            assigned_to?: undefined;
            due_date?: undefined;
            start_date?: undefined;
            department?: undefined;
            location?: undefined;
            job_title?: undefined;
            event_type?: undefined;
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
            employee_sys_id: {
                type: string;
                description: string;
            };
            event_type: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            short_description?: undefined;
            hr_service?: undefined;
            subject_person?: undefined;
            description?: undefined;
            assignment_group?: undefined;
            priority?: undefined;
            number_or_sysid?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            state?: undefined;
            query?: undefined;
            close_notes?: undefined;
            close_code?: undefined;
            active?: undefined;
            sys_id_or_name?: undefined;
            user_identifier?: undefined;
            user_sys_id?: undefined;
            hr_case_sysid?: undefined;
            assigned_to?: undefined;
            due_date?: undefined;
            start_date?: undefined;
            department?: undefined;
            manager?: undefined;
            location?: undefined;
            job_title?: undefined;
            last_day?: undefined;
            reason?: undefined;
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
            short_description: {
                type: string;
                description: string;
            };
            account: {
                type: string;
                description: string;
            };
            contact: {
                type: string;
                description: string;
            };
            category: {
                type: string;
                description: string;
            };
            subcategory: {
                type: string;
                description: string;
            };
            priority: {
                type: string;
                description: string;
            };
            description: {
                type: string;
                description: string;
            };
            product: {
                type: string;
                description: string;
            };
            assignment_group: {
                type: string;
                description: string;
            };
            number_or_sysid?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            state?: undefined;
            limit?: undefined;
            query?: undefined;
            resolution_code?: undefined;
            resolution_notes?: undefined;
            name_or_sysid?: undefined;
            active?: undefined;
            account_sysid?: undefined;
            case_sysid?: undefined;
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
            short_description?: undefined;
            account?: undefined;
            contact?: undefined;
            category?: undefined;
            subcategory?: undefined;
            priority?: undefined;
            description?: undefined;
            product?: undefined;
            assignment_group?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            state?: undefined;
            limit?: undefined;
            query?: undefined;
            resolution_code?: undefined;
            resolution_notes?: undefined;
            name_or_sysid?: undefined;
            active?: undefined;
            account_sysid?: undefined;
            case_sysid?: undefined;
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
            short_description?: undefined;
            account?: undefined;
            contact?: undefined;
            category?: undefined;
            subcategory?: undefined;
            priority?: undefined;
            description?: undefined;
            product?: undefined;
            assignment_group?: undefined;
            number_or_sysid?: undefined;
            state?: undefined;
            limit?: undefined;
            query?: undefined;
            resolution_code?: undefined;
            resolution_notes?: undefined;
            name_or_sysid?: undefined;
            active?: undefined;
            account_sysid?: undefined;
            case_sysid?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            account: {
                type: string;
                description: string;
            };
            contact: {
                type: string;
                description: string;
            };
            state: {
                type: string;
                description: string;
            };
            priority: {
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
            short_description?: undefined;
            category?: undefined;
            subcategory?: undefined;
            description?: undefined;
            product?: undefined;
            assignment_group?: undefined;
            number_or_sysid?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            resolution_code?: undefined;
            resolution_notes?: undefined;
            name_or_sysid?: undefined;
            active?: undefined;
            account_sysid?: undefined;
            case_sysid?: undefined;
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
            resolution_code: {
                type: string;
                description: string;
            };
            resolution_notes: {
                type: string;
                description: string;
            };
            short_description?: undefined;
            account?: undefined;
            contact?: undefined;
            category?: undefined;
            subcategory?: undefined;
            priority?: undefined;
            description?: undefined;
            product?: undefined;
            assignment_group?: undefined;
            number_or_sysid?: undefined;
            fields?: undefined;
            state?: undefined;
            limit?: undefined;
            query?: undefined;
            name_or_sysid?: undefined;
            active?: undefined;
            account_sysid?: undefined;
            case_sysid?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            name_or_sysid: {
                type: string;
                description: string;
            };
            short_description?: undefined;
            account?: undefined;
            contact?: undefined;
            category?: undefined;
            subcategory?: undefined;
            priority?: undefined;
            description?: undefined;
            product?: undefined;
            assignment_group?: undefined;
            number_or_sysid?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            state?: undefined;
            limit?: undefined;
            query?: undefined;
            resolution_code?: undefined;
            resolution_notes?: undefined;
            active?: undefined;
            account_sysid?: undefined;
            case_sysid?: undefined;
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
            short_description?: undefined;
            account?: undefined;
            contact?: undefined;
            category?: undefined;
            subcategory?: undefined;
            priority?: undefined;
            description?: undefined;
            product?: undefined;
            assignment_group?: undefined;
            number_or_sysid?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            state?: undefined;
            resolution_code?: undefined;
            resolution_notes?: undefined;
            name_or_sysid?: undefined;
            account_sysid?: undefined;
            case_sysid?: undefined;
        };
        required: never[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            account_sysid: {
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
            short_description?: undefined;
            account?: undefined;
            contact?: undefined;
            category?: undefined;
            subcategory?: undefined;
            priority?: undefined;
            description?: undefined;
            product?: undefined;
            assignment_group?: undefined;
            number_or_sysid?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            state?: undefined;
            resolution_code?: undefined;
            resolution_notes?: undefined;
            name_or_sysid?: undefined;
            active?: undefined;
            case_sysid?: undefined;
        };
        required: never[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            case_sysid: {
                type: string;
                description: string;
            };
            short_description?: undefined;
            account?: undefined;
            contact?: undefined;
            category?: undefined;
            subcategory?: undefined;
            priority?: undefined;
            description?: undefined;
            product?: undefined;
            assignment_group?: undefined;
            number_or_sysid?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            state?: undefined;
            limit?: undefined;
            query?: undefined;
            resolution_code?: undefined;
            resolution_notes?: undefined;
            name_or_sysid?: undefined;
            active?: undefined;
            account_sysid?: undefined;
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
            short_description?: undefined;
            account?: undefined;
            contact?: undefined;
            category?: undefined;
            subcategory?: undefined;
            priority?: undefined;
            description?: undefined;
            product?: undefined;
            assignment_group?: undefined;
            number_or_sysid?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            state?: undefined;
            resolution_code?: undefined;
            resolution_notes?: undefined;
            name_or_sysid?: undefined;
            active?: undefined;
            account_sysid?: undefined;
            case_sysid?: undefined;
        };
        required: never[];
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
            category: {
                type: string;
                description: string;
            };
            subcategory: {
                type: string;
                description: string;
            };
            severity: {
                type: string;
                description: string;
            };
            description: {
                type: string;
                description: string;
            };
            affected_cis: {
                type: string;
                items: {
                    type: string;
                };
                description: string;
            };
            assignment_group: {
                type: string;
                description: string;
            };
            number_or_sysid?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            state?: undefined;
            limit?: undefined;
            query?: undefined;
            ci_sysid?: undefined;
            risk_sysid?: undefined;
            type?: undefined;
            active?: undefined;
            playbook_sys_id?: undefined;
            incident_sys_id?: undefined;
            parameters?: undefined;
            days?: undefined;
            ci_sys_ids?: undefined;
            group?: undefined;
            scan_type?: undefined;
            name?: undefined;
            impact?: undefined;
            likelihood?: undefined;
            owner?: undefined;
            policy_sys_id?: undefined;
            control_sys_id?: undefined;
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
            short_description?: undefined;
            category?: undefined;
            subcategory?: undefined;
            severity?: undefined;
            description?: undefined;
            affected_cis?: undefined;
            assignment_group?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            state?: undefined;
            limit?: undefined;
            query?: undefined;
            ci_sysid?: undefined;
            risk_sysid?: undefined;
            type?: undefined;
            active?: undefined;
            playbook_sys_id?: undefined;
            incident_sys_id?: undefined;
            parameters?: undefined;
            days?: undefined;
            ci_sys_ids?: undefined;
            group?: undefined;
            scan_type?: undefined;
            name?: undefined;
            impact?: undefined;
            likelihood?: undefined;
            owner?: undefined;
            policy_sys_id?: undefined;
            control_sys_id?: undefined;
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
            short_description?: undefined;
            category?: undefined;
            subcategory?: undefined;
            severity?: undefined;
            description?: undefined;
            affected_cis?: undefined;
            assignment_group?: undefined;
            number_or_sysid?: undefined;
            state?: undefined;
            limit?: undefined;
            query?: undefined;
            ci_sysid?: undefined;
            risk_sysid?: undefined;
            type?: undefined;
            active?: undefined;
            playbook_sys_id?: undefined;
            incident_sys_id?: undefined;
            parameters?: undefined;
            days?: undefined;
            ci_sys_ids?: undefined;
            group?: undefined;
            scan_type?: undefined;
            name?: undefined;
            impact?: undefined;
            likelihood?: undefined;
            owner?: undefined;
            policy_sys_id?: undefined;
            control_sys_id?: undefined;
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
            severity: {
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
            query: {
                type: string;
                description: string;
            };
            short_description?: undefined;
            subcategory?: undefined;
            description?: undefined;
            affected_cis?: undefined;
            assignment_group?: undefined;
            number_or_sysid?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            ci_sysid?: undefined;
            risk_sysid?: undefined;
            type?: undefined;
            active?: undefined;
            playbook_sys_id?: undefined;
            incident_sys_id?: undefined;
            parameters?: undefined;
            days?: undefined;
            ci_sys_ids?: undefined;
            group?: undefined;
            scan_type?: undefined;
            name?: undefined;
            impact?: undefined;
            likelihood?: undefined;
            owner?: undefined;
            policy_sys_id?: undefined;
            control_sys_id?: undefined;
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
            severity: {
                type: string;
                description: string;
            };
            ci_sysid: {
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
            short_description?: undefined;
            category?: undefined;
            subcategory?: undefined;
            description?: undefined;
            affected_cis?: undefined;
            assignment_group?: undefined;
            number_or_sysid?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            risk_sysid?: undefined;
            type?: undefined;
            active?: undefined;
            playbook_sys_id?: undefined;
            incident_sys_id?: undefined;
            parameters?: undefined;
            days?: undefined;
            ci_sys_ids?: undefined;
            group?: undefined;
            scan_type?: undefined;
            name?: undefined;
            impact?: undefined;
            likelihood?: undefined;
            owner?: undefined;
            policy_sys_id?: undefined;
            control_sys_id?: undefined;
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
            category: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            short_description?: undefined;
            subcategory?: undefined;
            severity?: undefined;
            description?: undefined;
            affected_cis?: undefined;
            assignment_group?: undefined;
            number_or_sysid?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            query?: undefined;
            ci_sysid?: undefined;
            risk_sysid?: undefined;
            type?: undefined;
            active?: undefined;
            playbook_sys_id?: undefined;
            incident_sys_id?: undefined;
            parameters?: undefined;
            days?: undefined;
            ci_sys_ids?: undefined;
            group?: undefined;
            scan_type?: undefined;
            name?: undefined;
            impact?: undefined;
            likelihood?: undefined;
            owner?: undefined;
            policy_sys_id?: undefined;
            control_sys_id?: undefined;
        };
        required: never[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            risk_sysid: {
                type: string;
                description: string;
            };
            state: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            short_description?: undefined;
            category?: undefined;
            subcategory?: undefined;
            severity?: undefined;
            description?: undefined;
            affected_cis?: undefined;
            assignment_group?: undefined;
            number_or_sysid?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            query?: undefined;
            ci_sysid?: undefined;
            type?: undefined;
            active?: undefined;
            playbook_sys_id?: undefined;
            incident_sys_id?: undefined;
            parameters?: undefined;
            days?: undefined;
            ci_sys_ids?: undefined;
            group?: undefined;
            scan_type?: undefined;
            name?: undefined;
            impact?: undefined;
            likelihood?: undefined;
            owner?: undefined;
            policy_sys_id?: undefined;
            control_sys_id?: undefined;
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
            type: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            short_description?: undefined;
            category?: undefined;
            subcategory?: undefined;
            severity?: undefined;
            description?: undefined;
            affected_cis?: undefined;
            assignment_group?: undefined;
            number_or_sysid?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            state?: undefined;
            ci_sysid?: undefined;
            risk_sysid?: undefined;
            active?: undefined;
            playbook_sys_id?: undefined;
            incident_sys_id?: undefined;
            parameters?: undefined;
            days?: undefined;
            ci_sys_ids?: undefined;
            group?: undefined;
            scan_type?: undefined;
            name?: undefined;
            impact?: undefined;
            likelihood?: undefined;
            owner?: undefined;
            policy_sys_id?: undefined;
            control_sys_id?: undefined;
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
            short_description?: undefined;
            subcategory?: undefined;
            severity?: undefined;
            description?: undefined;
            affected_cis?: undefined;
            assignment_group?: undefined;
            number_or_sysid?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            state?: undefined;
            query?: undefined;
            ci_sysid?: undefined;
            risk_sysid?: undefined;
            type?: undefined;
            playbook_sys_id?: undefined;
            incident_sys_id?: undefined;
            parameters?: undefined;
            days?: undefined;
            ci_sys_ids?: undefined;
            group?: undefined;
            scan_type?: undefined;
            name?: undefined;
            impact?: undefined;
            likelihood?: undefined;
            owner?: undefined;
            policy_sys_id?: undefined;
            control_sys_id?: undefined;
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
            incident_sys_id: {
                type: string;
                description: string;
            };
            parameters: {
                type: string;
                description: string;
            };
            short_description?: undefined;
            category?: undefined;
            subcategory?: undefined;
            severity?: undefined;
            description?: undefined;
            affected_cis?: undefined;
            assignment_group?: undefined;
            number_or_sysid?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            state?: undefined;
            limit?: undefined;
            query?: undefined;
            ci_sysid?: undefined;
            risk_sysid?: undefined;
            type?: undefined;
            active?: undefined;
            days?: undefined;
            ci_sys_ids?: undefined;
            group?: undefined;
            scan_type?: undefined;
            name?: undefined;
            impact?: undefined;
            likelihood?: undefined;
            owner?: undefined;
            policy_sys_id?: undefined;
            control_sys_id?: undefined;
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
            short_description?: undefined;
            category?: undefined;
            subcategory?: undefined;
            severity?: undefined;
            description?: undefined;
            affected_cis?: undefined;
            assignment_group?: undefined;
            number_or_sysid?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            state?: undefined;
            limit?: undefined;
            query?: undefined;
            ci_sysid?: undefined;
            risk_sysid?: undefined;
            type?: undefined;
            active?: undefined;
            playbook_sys_id?: undefined;
            incident_sys_id?: undefined;
            parameters?: undefined;
            ci_sys_ids?: undefined;
            group?: undefined;
            scan_type?: undefined;
            name?: undefined;
            impact?: undefined;
            likelihood?: undefined;
            owner?: undefined;
            policy_sys_id?: undefined;
            control_sys_id?: undefined;
        };
        required: never[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            ci_sys_ids: {
                type: string;
                items: {
                    type: string;
                };
                description: string;
            };
            group: {
                type: string;
                description: string;
            };
            scan_type: {
                type: string;
                description: string;
            };
            short_description?: undefined;
            category?: undefined;
            subcategory?: undefined;
            severity?: undefined;
            description?: undefined;
            affected_cis?: undefined;
            assignment_group?: undefined;
            number_or_sysid?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            state?: undefined;
            limit?: undefined;
            query?: undefined;
            ci_sysid?: undefined;
            risk_sysid?: undefined;
            type?: undefined;
            active?: undefined;
            playbook_sys_id?: undefined;
            incident_sys_id?: undefined;
            parameters?: undefined;
            days?: undefined;
            name?: undefined;
            impact?: undefined;
            likelihood?: undefined;
            owner?: undefined;
            policy_sys_id?: undefined;
            control_sys_id?: undefined;
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
            category: {
                type: string;
                description: string;
            };
            description: {
                type: string;
                description: string;
            };
            impact: {
                type: string;
                description: string;
            };
            likelihood: {
                type: string;
                description: string;
            };
            owner: {
                type: string;
                description: string;
            };
            short_description?: undefined;
            subcategory?: undefined;
            severity?: undefined;
            affected_cis?: undefined;
            assignment_group?: undefined;
            number_or_sysid?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            state?: undefined;
            limit?: undefined;
            query?: undefined;
            ci_sysid?: undefined;
            risk_sysid?: undefined;
            type?: undefined;
            active?: undefined;
            playbook_sys_id?: undefined;
            incident_sys_id?: undefined;
            parameters?: undefined;
            days?: undefined;
            ci_sys_ids?: undefined;
            group?: undefined;
            scan_type?: undefined;
            policy_sys_id?: undefined;
            control_sys_id?: undefined;
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
            limit: {
                type: string;
                description: string;
            };
            short_description?: undefined;
            category?: undefined;
            subcategory?: undefined;
            severity?: undefined;
            description?: undefined;
            affected_cis?: undefined;
            assignment_group?: undefined;
            number_or_sysid?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            query?: undefined;
            ci_sysid?: undefined;
            risk_sysid?: undefined;
            type?: undefined;
            active?: undefined;
            playbook_sys_id?: undefined;
            incident_sys_id?: undefined;
            parameters?: undefined;
            days?: undefined;
            ci_sys_ids?: undefined;
            group?: undefined;
            scan_type?: undefined;
            name?: undefined;
            impact?: undefined;
            likelihood?: undefined;
            owner?: undefined;
            policy_sys_id?: undefined;
            control_sys_id?: undefined;
        };
        required: never[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            policy_sys_id: {
                type: string;
                description: string;
            };
            control_sys_id: {
                type: string;
                description: string;
            };
            short_description?: undefined;
            category?: undefined;
            subcategory?: undefined;
            severity?: undefined;
            description?: undefined;
            affected_cis?: undefined;
            assignment_group?: undefined;
            number_or_sysid?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            state?: undefined;
            limit?: undefined;
            query?: undefined;
            ci_sysid?: undefined;
            risk_sysid?: undefined;
            type?: undefined;
            active?: undefined;
            playbook_sys_id?: undefined;
            incident_sys_id?: undefined;
            parameters?: undefined;
            days?: undefined;
            ci_sys_ids?: undefined;
            group?: undefined;
            scan_type?: undefined;
            name?: undefined;
            impact?: undefined;
            likelihood?: undefined;
            owner?: undefined;
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
            severity: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            short_description?: undefined;
            category?: undefined;
            subcategory?: undefined;
            description?: undefined;
            affected_cis?: undefined;
            assignment_group?: undefined;
            number_or_sysid?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            query?: undefined;
            ci_sysid?: undefined;
            risk_sysid?: undefined;
            type?: undefined;
            active?: undefined;
            playbook_sys_id?: undefined;
            incident_sys_id?: undefined;
            parameters?: undefined;
            days?: undefined;
            ci_sys_ids?: undefined;
            group?: undefined;
            scan_type?: undefined;
            name?: undefined;
            impact?: undefined;
            likelihood?: undefined;
            owner?: undefined;
            policy_sys_id?: undefined;
            control_sys_id?: undefined;
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
            name_or_sysid?: undefined;
            flow_sys_id?: undefined;
            inputs?: undefined;
            execution_sysid?: undefined;
            status?: undefined;
            name?: undefined;
            description?: undefined;
            trigger_type?: undefined;
            trigger_table?: undefined;
            scope?: undefined;
            outputs?: undefined;
            script?: undefined;
            type?: undefined;
            test_inputs?: undefined;
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
            name_or_sysid: {
                type: string;
                description: string;
            };
            query?: undefined;
            active?: undefined;
            category?: undefined;
            limit?: undefined;
            flow_sys_id?: undefined;
            inputs?: undefined;
            execution_sysid?: undefined;
            status?: undefined;
            name?: undefined;
            description?: undefined;
            trigger_type?: undefined;
            trigger_table?: undefined;
            scope?: undefined;
            outputs?: undefined;
            script?: undefined;
            type?: undefined;
            test_inputs?: undefined;
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
            flow_sys_id: {
                type: string;
                description: string;
            };
            inputs: {
                type: string;
                description: string;
                items?: undefined;
            };
            query?: undefined;
            active?: undefined;
            category?: undefined;
            limit?: undefined;
            name_or_sysid?: undefined;
            execution_sysid?: undefined;
            status?: undefined;
            name?: undefined;
            description?: undefined;
            trigger_type?: undefined;
            trigger_table?: undefined;
            scope?: undefined;
            outputs?: undefined;
            script?: undefined;
            type?: undefined;
            test_inputs?: undefined;
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
            execution_sysid: {
                type: string;
                description: string;
            };
            query?: undefined;
            active?: undefined;
            category?: undefined;
            limit?: undefined;
            name_or_sysid?: undefined;
            flow_sys_id?: undefined;
            inputs?: undefined;
            status?: undefined;
            name?: undefined;
            description?: undefined;
            trigger_type?: undefined;
            trigger_table?: undefined;
            scope?: undefined;
            outputs?: undefined;
            script?: undefined;
            type?: undefined;
            test_inputs?: undefined;
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
            flow_sys_id: {
                type: string;
                description: string;
            };
            status: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            query?: undefined;
            active?: undefined;
            category?: undefined;
            name_or_sysid?: undefined;
            inputs?: undefined;
            execution_sysid?: undefined;
            name?: undefined;
            description?: undefined;
            trigger_type?: undefined;
            trigger_table?: undefined;
            scope?: undefined;
            outputs?: undefined;
            script?: undefined;
            type?: undefined;
            test_inputs?: undefined;
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
            category?: undefined;
            name_or_sysid?: undefined;
            flow_sys_id?: undefined;
            inputs?: undefined;
            execution_sysid?: undefined;
            status?: undefined;
            name?: undefined;
            description?: undefined;
            trigger_type?: undefined;
            trigger_table?: undefined;
            scope?: undefined;
            outputs?: undefined;
            script?: undefined;
            type?: undefined;
            test_inputs?: undefined;
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
            query: {
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
            active?: undefined;
            name_or_sysid?: undefined;
            flow_sys_id?: undefined;
            inputs?: undefined;
            execution_sysid?: undefined;
            status?: undefined;
            name?: undefined;
            description?: undefined;
            trigger_type?: undefined;
            trigger_table?: undefined;
            scope?: undefined;
            outputs?: undefined;
            script?: undefined;
            type?: undefined;
            test_inputs?: undefined;
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
            description: {
                type: string;
                description: string;
            };
            trigger_type: {
                type: string;
                description: string;
            };
            trigger_table: {
                type: string;
                description: string;
            };
            scope: {
                type: string;
                description: string;
            };
            query?: undefined;
            active?: undefined;
            category?: undefined;
            limit?: undefined;
            name_or_sysid?: undefined;
            flow_sys_id?: undefined;
            inputs?: undefined;
            execution_sysid?: undefined;
            status?: undefined;
            outputs?: undefined;
            script?: undefined;
            type?: undefined;
            test_inputs?: undefined;
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
                description: string;
            };
            inputs: {
                type: string;
                items: {
                    type: string;
                };
                description: string;
            };
            scope: {
                type: string;
                description: string;
            };
            query?: undefined;
            active?: undefined;
            category?: undefined;
            limit?: undefined;
            name_or_sysid?: undefined;
            flow_sys_id?: undefined;
            execution_sysid?: undefined;
            status?: undefined;
            trigger_type?: undefined;
            trigger_table?: undefined;
            outputs?: undefined;
            script?: undefined;
            type?: undefined;
            test_inputs?: undefined;
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
                description: string;
            };
            inputs: {
                type: string;
                items: {
                    type: string;
                };
                description: string;
            };
            outputs: {
                type: string;
                items: {
                    type: string;
                };
                description: string;
            };
            script: {
                type: string;
                description: string;
            };
            query?: undefined;
            active?: undefined;
            category?: undefined;
            limit?: undefined;
            name_or_sysid?: undefined;
            flow_sys_id?: undefined;
            execution_sysid?: undefined;
            status?: undefined;
            trigger_type?: undefined;
            trigger_table?: undefined;
            scope?: undefined;
            type?: undefined;
            test_inputs?: undefined;
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
            flow_sys_id: {
                type: string;
                description: string;
            };
            type: {
                type: string;
                description: string;
            };
            query?: undefined;
            active?: undefined;
            category?: undefined;
            limit?: undefined;
            name_or_sysid?: undefined;
            inputs?: undefined;
            execution_sysid?: undefined;
            status?: undefined;
            name?: undefined;
            description?: undefined;
            trigger_type?: undefined;
            trigger_table?: undefined;
            scope?: undefined;
            outputs?: undefined;
            script?: undefined;
            test_inputs?: undefined;
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
            flow_sys_id: {
                type: string;
                description: string;
            };
            test_inputs: {
                type: string;
                description: string;
            };
            query?: undefined;
            active?: undefined;
            category?: undefined;
            limit?: undefined;
            name_or_sysid?: undefined;
            inputs?: undefined;
            execution_sysid?: undefined;
            status?: undefined;
            name?: undefined;
            description?: undefined;
            trigger_type?: undefined;
            trigger_table?: undefined;
            scope?: undefined;
            outputs?: undefined;
            script?: undefined;
            type?: undefined;
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
            flow_sys_id: {
                type: string;
                description: string;
            };
            days: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            query?: undefined;
            active?: undefined;
            category?: undefined;
            name_or_sysid?: undefined;
            inputs?: undefined;
            execution_sysid?: undefined;
            status?: undefined;
            name?: undefined;
            description?: undefined;
            trigger_type?: undefined;
            trigger_table?: undefined;
            scope?: undefined;
            outputs?: undefined;
            script?: undefined;
            type?: undefined;
            test_inputs?: undefined;
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
            sys_id_or_name?: undefined;
            rest_message_sys_id?: undefined;
            name?: undefined;
            endpoint?: undefined;
            description?: undefined;
            use_mutual_auth?: undefined;
            authentication_type?: undefined;
            target_table?: undefined;
            transform_map_sys_id?: undefined;
            import_set_sys_id?: undefined;
            state?: undefined;
            sys_id?: undefined;
            staging_table?: undefined;
            data?: undefined;
            type?: undefined;
            name_or_sysid?: undefined;
            table?: undefined;
            event_name?: undefined;
            record_sys_id?: undefined;
            parm1?: undefined;
            parm2?: undefined;
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
            limit?: undefined;
            rest_message_sys_id?: undefined;
            name?: undefined;
            endpoint?: undefined;
            description?: undefined;
            use_mutual_auth?: undefined;
            authentication_type?: undefined;
            target_table?: undefined;
            transform_map_sys_id?: undefined;
            import_set_sys_id?: undefined;
            state?: undefined;
            sys_id?: undefined;
            staging_table?: undefined;
            data?: undefined;
            type?: undefined;
            name_or_sysid?: undefined;
            table?: undefined;
            event_name?: undefined;
            record_sys_id?: undefined;
            parm1?: undefined;
            parm2?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            rest_message_sys_id: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            query?: undefined;
            sys_id_or_name?: undefined;
            name?: undefined;
            endpoint?: undefined;
            description?: undefined;
            use_mutual_auth?: undefined;
            authentication_type?: undefined;
            target_table?: undefined;
            transform_map_sys_id?: undefined;
            import_set_sys_id?: undefined;
            state?: undefined;
            sys_id?: undefined;
            staging_table?: undefined;
            data?: undefined;
            type?: undefined;
            name_or_sysid?: undefined;
            table?: undefined;
            event_name?: undefined;
            record_sys_id?: undefined;
            parm1?: undefined;
            parm2?: undefined;
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
            endpoint: {
                type: string;
                description: string;
            };
            description: {
                type: string;
                description: string;
            };
            use_mutual_auth: {
                type: string;
                description: string;
            };
            authentication_type: {
                type: string;
                description: string;
            };
            query?: undefined;
            limit?: undefined;
            sys_id_or_name?: undefined;
            rest_message_sys_id?: undefined;
            target_table?: undefined;
            transform_map_sys_id?: undefined;
            import_set_sys_id?: undefined;
            state?: undefined;
            sys_id?: undefined;
            staging_table?: undefined;
            data?: undefined;
            type?: undefined;
            name_or_sysid?: undefined;
            table?: undefined;
            event_name?: undefined;
            record_sys_id?: undefined;
            parm1?: undefined;
            parm2?: undefined;
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
            target_table: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            sys_id_or_name?: undefined;
            rest_message_sys_id?: undefined;
            name?: undefined;
            endpoint?: undefined;
            description?: undefined;
            use_mutual_auth?: undefined;
            authentication_type?: undefined;
            transform_map_sys_id?: undefined;
            import_set_sys_id?: undefined;
            state?: undefined;
            sys_id?: undefined;
            staging_table?: undefined;
            data?: undefined;
            type?: undefined;
            name_or_sysid?: undefined;
            table?: undefined;
            event_name?: undefined;
            record_sys_id?: undefined;
            parm1?: undefined;
            parm2?: undefined;
        };
        required: never[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            transform_map_sys_id: {
                type: string;
                description: string;
            };
            import_set_sys_id: {
                type: string;
                description: string;
            };
            query?: undefined;
            limit?: undefined;
            sys_id_or_name?: undefined;
            rest_message_sys_id?: undefined;
            name?: undefined;
            endpoint?: undefined;
            description?: undefined;
            use_mutual_auth?: undefined;
            authentication_type?: undefined;
            target_table?: undefined;
            state?: undefined;
            sys_id?: undefined;
            staging_table?: undefined;
            data?: undefined;
            type?: undefined;
            name_or_sysid?: undefined;
            table?: undefined;
            event_name?: undefined;
            record_sys_id?: undefined;
            parm1?: undefined;
            parm2?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            transform_map_sys_id: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            query?: undefined;
            sys_id_or_name?: undefined;
            rest_message_sys_id?: undefined;
            name?: undefined;
            endpoint?: undefined;
            description?: undefined;
            use_mutual_auth?: undefined;
            authentication_type?: undefined;
            target_table?: undefined;
            import_set_sys_id?: undefined;
            state?: undefined;
            sys_id?: undefined;
            staging_table?: undefined;
            data?: undefined;
            type?: undefined;
            name_or_sysid?: undefined;
            table?: undefined;
            event_name?: undefined;
            record_sys_id?: undefined;
            parm1?: undefined;
            parm2?: undefined;
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
            query: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            sys_id_or_name?: undefined;
            rest_message_sys_id?: undefined;
            name?: undefined;
            endpoint?: undefined;
            description?: undefined;
            use_mutual_auth?: undefined;
            authentication_type?: undefined;
            target_table?: undefined;
            transform_map_sys_id?: undefined;
            import_set_sys_id?: undefined;
            sys_id?: undefined;
            staging_table?: undefined;
            data?: undefined;
            type?: undefined;
            name_or_sysid?: undefined;
            table?: undefined;
            event_name?: undefined;
            record_sys_id?: undefined;
            parm1?: undefined;
            parm2?: undefined;
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
            limit?: undefined;
            sys_id_or_name?: undefined;
            rest_message_sys_id?: undefined;
            name?: undefined;
            endpoint?: undefined;
            description?: undefined;
            use_mutual_auth?: undefined;
            authentication_type?: undefined;
            target_table?: undefined;
            transform_map_sys_id?: undefined;
            import_set_sys_id?: undefined;
            state?: undefined;
            staging_table?: undefined;
            data?: undefined;
            type?: undefined;
            name_or_sysid?: undefined;
            table?: undefined;
            event_name?: undefined;
            record_sys_id?: undefined;
            parm1?: undefined;
            parm2?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            staging_table: {
                type: string;
                description: string;
            };
            data: {
                type: string;
                description: string;
            };
            query?: undefined;
            limit?: undefined;
            sys_id_or_name?: undefined;
            rest_message_sys_id?: undefined;
            name?: undefined;
            endpoint?: undefined;
            description?: undefined;
            use_mutual_auth?: undefined;
            authentication_type?: undefined;
            target_table?: undefined;
            transform_map_sys_id?: undefined;
            import_set_sys_id?: undefined;
            state?: undefined;
            sys_id?: undefined;
            type?: undefined;
            name_or_sysid?: undefined;
            table?: undefined;
            event_name?: undefined;
            record_sys_id?: undefined;
            parm1?: undefined;
            parm2?: undefined;
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
            type: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            sys_id_or_name?: undefined;
            rest_message_sys_id?: undefined;
            name?: undefined;
            endpoint?: undefined;
            description?: undefined;
            use_mutual_auth?: undefined;
            authentication_type?: undefined;
            target_table?: undefined;
            transform_map_sys_id?: undefined;
            import_set_sys_id?: undefined;
            state?: undefined;
            sys_id?: undefined;
            staging_table?: undefined;
            data?: undefined;
            name_or_sysid?: undefined;
            table?: undefined;
            event_name?: undefined;
            record_sys_id?: undefined;
            parm1?: undefined;
            parm2?: undefined;
        };
        required: never[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            name_or_sysid: {
                type: string;
                description: string;
            };
            query?: undefined;
            limit?: undefined;
            sys_id_or_name?: undefined;
            rest_message_sys_id?: undefined;
            name?: undefined;
            endpoint?: undefined;
            description?: undefined;
            use_mutual_auth?: undefined;
            authentication_type?: undefined;
            target_table?: undefined;
            transform_map_sys_id?: undefined;
            import_set_sys_id?: undefined;
            state?: undefined;
            sys_id?: undefined;
            staging_table?: undefined;
            data?: undefined;
            type?: undefined;
            table?: undefined;
            event_name?: undefined;
            record_sys_id?: undefined;
            parm1?: undefined;
            parm2?: undefined;
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
            table: {
                type: string;
                description: string;
            };
            query?: undefined;
            limit?: undefined;
            sys_id_or_name?: undefined;
            rest_message_sys_id?: undefined;
            endpoint?: undefined;
            use_mutual_auth?: undefined;
            authentication_type?: undefined;
            target_table?: undefined;
            transform_map_sys_id?: undefined;
            import_set_sys_id?: undefined;
            state?: undefined;
            sys_id?: undefined;
            staging_table?: undefined;
            data?: undefined;
            type?: undefined;
            name_or_sysid?: undefined;
            event_name?: undefined;
            record_sys_id?: undefined;
            parm1?: undefined;
            parm2?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            event_name: {
                type: string;
                description: string;
            };
            table: {
                type: string;
                description: string;
            };
            record_sys_id: {
                type: string;
                description: string;
            };
            parm1: {
                type: string;
                description: string;
            };
            parm2: {
                type: string;
                description: string;
            };
            query?: undefined;
            limit?: undefined;
            sys_id_or_name?: undefined;
            rest_message_sys_id?: undefined;
            name?: undefined;
            endpoint?: undefined;
            description?: undefined;
            use_mutual_auth?: undefined;
            authentication_type?: undefined;
            target_table?: undefined;
            transform_map_sys_id?: undefined;
            import_set_sys_id?: undefined;
            state?: undefined;
            sys_id?: undefined;
            staging_table?: undefined;
            data?: undefined;
            type?: undefined;
            name_or_sysid?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            event_name: {
                type: string;
                description: string;
            };
            state: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            query?: undefined;
            sys_id_or_name?: undefined;
            rest_message_sys_id?: undefined;
            name?: undefined;
            endpoint?: undefined;
            description?: undefined;
            use_mutual_auth?: undefined;
            authentication_type?: undefined;
            target_table?: undefined;
            transform_map_sys_id?: undefined;
            import_set_sys_id?: undefined;
            sys_id?: undefined;
            staging_table?: undefined;
            data?: undefined;
            type?: undefined;
            name_or_sysid?: undefined;
            table?: undefined;
            record_sys_id?: undefined;
            parm1?: undefined;
            parm2?: undefined;
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
            category: {
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
            indicator_sys_id?: undefined;
            breakdown_sys_id?: undefined;
            period?: undefined;
            include_scores?: undefined;
            start_date?: undefined;
            end_date?: undefined;
            sys_id?: undefined;
            name?: undefined;
            description?: undefined;
            roles?: undefined;
            fields?: undefined;
            table?: undefined;
            sample_size?: undefined;
            tables?: undefined;
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
            category?: undefined;
            active?: undefined;
            limit?: undefined;
            indicator_sys_id?: undefined;
            breakdown_sys_id?: undefined;
            period?: undefined;
            include_scores?: undefined;
            start_date?: undefined;
            end_date?: undefined;
            sys_id?: undefined;
            name?: undefined;
            description?: undefined;
            roles?: undefined;
            fields?: undefined;
            table?: undefined;
            sample_size?: undefined;
            tables?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            indicator_sys_id: {
                type: string;
                description: string;
            };
            breakdown_sys_id: {
                type: string;
                description: string;
            };
            period: {
                type: string;
                description: string;
            };
            include_scores: {
                type: string;
                description: string;
            };
            query?: undefined;
            category?: undefined;
            active?: undefined;
            limit?: undefined;
            sys_id_or_name?: undefined;
            start_date?: undefined;
            end_date?: undefined;
            sys_id?: undefined;
            name?: undefined;
            description?: undefined;
            roles?: undefined;
            fields?: undefined;
            table?: undefined;
            sample_size?: undefined;
            tables?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            indicator_sys_id: {
                type: string;
                description: string;
            };
            start_date: {
                type: string;
                description: string;
            };
            end_date: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            query?: undefined;
            category?: undefined;
            active?: undefined;
            sys_id_or_name?: undefined;
            breakdown_sys_id?: undefined;
            period?: undefined;
            include_scores?: undefined;
            sys_id?: undefined;
            name?: undefined;
            description?: undefined;
            roles?: undefined;
            fields?: undefined;
            table?: undefined;
            sample_size?: undefined;
            tables?: undefined;
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
            category?: undefined;
            active?: undefined;
            sys_id_or_name?: undefined;
            indicator_sys_id?: undefined;
            breakdown_sys_id?: undefined;
            period?: undefined;
            include_scores?: undefined;
            start_date?: undefined;
            end_date?: undefined;
            sys_id?: undefined;
            name?: undefined;
            description?: undefined;
            roles?: undefined;
            fields?: undefined;
            table?: undefined;
            sample_size?: undefined;
            tables?: undefined;
        };
        required: never[];
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
            query: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            category?: undefined;
            sys_id_or_name?: undefined;
            indicator_sys_id?: undefined;
            breakdown_sys_id?: undefined;
            period?: undefined;
            include_scores?: undefined;
            start_date?: undefined;
            end_date?: undefined;
            sys_id?: undefined;
            name?: undefined;
            description?: undefined;
            roles?: undefined;
            fields?: undefined;
            table?: undefined;
            sample_size?: undefined;
            tables?: undefined;
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
            category?: undefined;
            active?: undefined;
            limit?: undefined;
            sys_id_or_name?: undefined;
            indicator_sys_id?: undefined;
            breakdown_sys_id?: undefined;
            period?: undefined;
            include_scores?: undefined;
            start_date?: undefined;
            end_date?: undefined;
            name?: undefined;
            description?: undefined;
            roles?: undefined;
            fields?: undefined;
            table?: undefined;
            sample_size?: undefined;
            tables?: undefined;
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
            roles: {
                type: string;
                description: string;
            };
            active: {
                type: string;
                description: string;
            };
            query?: undefined;
            category?: undefined;
            limit?: undefined;
            sys_id_or_name?: undefined;
            indicator_sys_id?: undefined;
            breakdown_sys_id?: undefined;
            period?: undefined;
            include_scores?: undefined;
            start_date?: undefined;
            end_date?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            table?: undefined;
            sample_size?: undefined;
            tables?: undefined;
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
            category?: undefined;
            active?: undefined;
            limit?: undefined;
            sys_id_or_name?: undefined;
            indicator_sys_id?: undefined;
            breakdown_sys_id?: undefined;
            period?: undefined;
            include_scores?: undefined;
            start_date?: undefined;
            end_date?: undefined;
            name?: undefined;
            description?: undefined;
            roles?: undefined;
            table?: undefined;
            sample_size?: undefined;
            tables?: undefined;
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
            fields: {
                type: string;
                description: string;
            };
            query: {
                type: string;
                description: string;
            };
            sample_size: {
                type: string;
                description: string;
            };
            category?: undefined;
            active?: undefined;
            limit?: undefined;
            sys_id_or_name?: undefined;
            indicator_sys_id?: undefined;
            breakdown_sys_id?: undefined;
            period?: undefined;
            include_scores?: undefined;
            start_date?: undefined;
            end_date?: undefined;
            sys_id?: undefined;
            name?: undefined;
            description?: undefined;
            roles?: undefined;
            tables?: undefined;
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
            category?: undefined;
            active?: undefined;
            limit?: undefined;
            sys_id_or_name?: undefined;
            indicator_sys_id?: undefined;
            breakdown_sys_id?: undefined;
            period?: undefined;
            include_scores?: undefined;
            start_date?: undefined;
            end_date?: undefined;
            sys_id?: undefined;
            name?: undefined;
            description?: undefined;
            roles?: undefined;
            fields?: undefined;
            sample_size?: undefined;
            tables?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            tables: {
                type: string;
                items: {
                    type: string;
                };
                description: string;
            };
            query: {
                type: string;
                description: string;
            };
            category?: undefined;
            active?: undefined;
            limit?: undefined;
            sys_id_or_name?: undefined;
            indicator_sys_id?: undefined;
            breakdown_sys_id?: undefined;
            period?: undefined;
            include_scores?: undefined;
            start_date?: undefined;
            end_date?: undefined;
            sys_id?: undefined;
            name?: undefined;
            description?: undefined;
            roles?: undefined;
            fields?: undefined;
            table?: undefined;
            sample_size?: undefined;
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
            value?: undefined;
            description?: undefined;
            type?: undefined;
            query?: undefined;
            category?: undefined;
            limit?: undefined;
            search?: undefined;
            names?: undefined;
            properties?: undefined;
            dry_run?: undefined;
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
            value: {
                type: string;
                description: string;
            };
            description: {
                type: string;
                description: string;
            };
            type: {
                type: string;
                description: string;
            };
            query?: undefined;
            category?: undefined;
            limit?: undefined;
            search?: undefined;
            names?: undefined;
            properties?: undefined;
            dry_run?: undefined;
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
            category: {
                type: string;
                description: string;
            };
            type: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            name?: undefined;
            value?: undefined;
            description?: undefined;
            search?: undefined;
            names?: undefined;
            properties?: undefined;
            dry_run?: undefined;
        };
        required: never[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            search: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            name?: undefined;
            value?: undefined;
            description?: undefined;
            type?: undefined;
            query?: undefined;
            category?: undefined;
            names?: undefined;
            properties?: undefined;
            dry_run?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            names: {
                type: string;
                items: {
                    type: string;
                };
                description: string;
            };
            name?: undefined;
            value?: undefined;
            description?: undefined;
            type?: undefined;
            query?: undefined;
            category?: undefined;
            limit?: undefined;
            search?: undefined;
            properties?: undefined;
            dry_run?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            properties: {
                type: string;
                description: string;
                items: {
                    type: string;
                    properties: {
                        name: {
                            type: string;
                        };
                        value: {
                            type: string;
                        };
                        description: {
                            type: string;
                        };
                    };
                    required: string[];
                };
            };
            name?: undefined;
            value?: undefined;
            description?: undefined;
            type?: undefined;
            query?: undefined;
            category?: undefined;
            limit?: undefined;
            search?: undefined;
            names?: undefined;
            dry_run?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            category: {
                type: string;
                description: string;
            };
            query: {
                type: string;
                description: string;
            };
            name?: undefined;
            value?: undefined;
            description?: undefined;
            type?: undefined;
            limit?: undefined;
            search?: undefined;
            names?: undefined;
            properties?: undefined;
            dry_run?: undefined;
        };
        required: never[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            properties: {
                type: string;
                description: string;
                items?: undefined;
            };
            dry_run: {
                type: string;
                description: string;
            };
            name?: undefined;
            value?: undefined;
            description?: undefined;
            type?: undefined;
            query?: undefined;
            category?: undefined;
            limit?: undefined;
            search?: undefined;
            names?: undefined;
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
            value: {
                type: string;
                description: string;
            };
            description?: undefined;
            type?: undefined;
            query?: undefined;
            category?: undefined;
            limit?: undefined;
            search?: undefined;
            names?: undefined;
            properties?: undefined;
            dry_run?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            name?: undefined;
            value?: undefined;
            description?: undefined;
            type?: undefined;
            query?: undefined;
            category?: undefined;
            limit?: undefined;
            search?: undefined;
            names?: undefined;
            properties?: undefined;
            dry_run?: undefined;
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
            limit: {
                type: string;
                description: string;
            };
            value?: undefined;
            description?: undefined;
            type?: undefined;
            query?: undefined;
            category?: undefined;
            search?: undefined;
            names?: undefined;
            properties?: undefined;
            dry_run?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            state?: undefined;
            query?: undefined;
            limit?: undefined;
            name?: undefined;
            description?: undefined;
            release?: undefined;
            switch_to?: undefined;
            sys_id?: undefined;
            default_name?: undefined;
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
            query: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            name?: undefined;
            description?: undefined;
            release?: undefined;
            switch_to?: undefined;
            sys_id?: undefined;
            default_name?: undefined;
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
                description: string;
            };
            release: {
                type: string;
                description: string;
            };
            switch_to: {
                type: string;
                description: string;
            };
            state?: undefined;
            query?: undefined;
            limit?: undefined;
            sys_id?: undefined;
            default_name?: undefined;
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
            state?: undefined;
            query?: undefined;
            limit?: undefined;
            name?: undefined;
            description?: undefined;
            release?: undefined;
            switch_to?: undefined;
            default_name?: undefined;
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
            limit: {
                type: string;
                description: string;
            };
            state?: undefined;
            query?: undefined;
            name?: undefined;
            description?: undefined;
            release?: undefined;
            switch_to?: undefined;
            default_name?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            default_name: {
                type: string;
                description: string;
            };
            state?: undefined;
            query?: undefined;
            limit?: undefined;
            name?: undefined;
            description?: undefined;
            release?: undefined;
            switch_to?: undefined;
            sys_id?: undefined;
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
                description: string;
            };
            category: {
                type: string;
                description: string;
            };
            active: {
                type: string;
                description: string;
            };
            fulfillment_type: {
                type: string;
                description: string;
            };
            sys_id?: undefined;
            fields?: undefined;
            query?: undefined;
            limit?: undefined;
            conversation_id?: undefined;
            topic_sys_id?: undefined;
            user_sys_id?: undefined;
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
            name?: undefined;
            description?: undefined;
            category?: undefined;
            active?: undefined;
            fulfillment_type?: undefined;
            query?: undefined;
            limit?: undefined;
            conversation_id?: undefined;
            topic_sys_id?: undefined;
            user_sys_id?: undefined;
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
            name?: undefined;
            description?: undefined;
            category?: undefined;
            active?: undefined;
            fulfillment_type?: undefined;
            fields?: undefined;
            query?: undefined;
            limit?: undefined;
            conversation_id?: undefined;
            topic_sys_id?: undefined;
            user_sys_id?: undefined;
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
            query: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            name?: undefined;
            description?: undefined;
            fulfillment_type?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            conversation_id?: undefined;
            topic_sys_id?: undefined;
            user_sys_id?: undefined;
        };
        required: never[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            conversation_id: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            name?: undefined;
            description?: undefined;
            category?: undefined;
            active?: undefined;
            fulfillment_type?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            query?: undefined;
            topic_sys_id?: undefined;
            user_sys_id?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            topic_sys_id: {
                type: string;
                description: string;
            };
            user_sys_id: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            name?: undefined;
            description?: undefined;
            category?: undefined;
            active?: undefined;
            fulfillment_type?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            query?: undefined;
            conversation_id?: undefined;
        };
        required: never[];
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
            category?: undefined;
            active?: undefined;
            fulfillment_type?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            query?: undefined;
            conversation_id?: undefined;
            topic_sys_id?: undefined;
            user_sys_id?: undefined;
        };
        required: never[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            asset_class: {
                type: string;
                description: string;
            };
            state: {
                type: string;
                description: string;
            };
            assigned_to: {
                type: string;
                description: string;
            };
            location: {
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
            sys_id?: undefined;
            display_name?: undefined;
            asset_tag?: undefined;
            model_category?: undefined;
            model?: undefined;
            serial_number?: undefined;
            cost?: undefined;
            cost_center?: undefined;
            purchase_date?: undefined;
            fields?: undefined;
            disposal_reason?: undefined;
            disposal_date?: undefined;
            license_sys_id?: undefined;
            asset_sys_id?: undefined;
            active?: undefined;
            asset_id?: undefined;
            new_stage?: undefined;
            notes?: undefined;
            software_name?: undefined;
            threshold_pct?: undefined;
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
            asset_class?: undefined;
            state?: undefined;
            assigned_to?: undefined;
            location?: undefined;
            query?: undefined;
            limit?: undefined;
            display_name?: undefined;
            asset_tag?: undefined;
            model_category?: undefined;
            model?: undefined;
            serial_number?: undefined;
            cost?: undefined;
            cost_center?: undefined;
            purchase_date?: undefined;
            fields?: undefined;
            disposal_reason?: undefined;
            disposal_date?: undefined;
            license_sys_id?: undefined;
            asset_sys_id?: undefined;
            active?: undefined;
            asset_id?: undefined;
            new_stage?: undefined;
            notes?: undefined;
            software_name?: undefined;
            threshold_pct?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            display_name: {
                type: string;
                description: string;
            };
            asset_tag: {
                type: string;
                description: string;
            };
            model_category: {
                type: string;
                description: string;
            };
            model: {
                type: string;
                description: string;
            };
            serial_number: {
                type: string;
                description: string;
            };
            assigned_to: {
                type: string;
                description: string;
            };
            location: {
                type: string;
                description: string;
            };
            cost: {
                type: string;
                description: string;
            };
            cost_center: {
                type: string;
                description: string;
            };
            purchase_date: {
                type: string;
                description: string;
            };
            asset_class?: undefined;
            state?: undefined;
            query?: undefined;
            limit?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            disposal_reason?: undefined;
            disposal_date?: undefined;
            license_sys_id?: undefined;
            asset_sys_id?: undefined;
            active?: undefined;
            asset_id?: undefined;
            new_stage?: undefined;
            notes?: undefined;
            software_name?: undefined;
            threshold_pct?: undefined;
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
            asset_class?: undefined;
            state?: undefined;
            assigned_to?: undefined;
            location?: undefined;
            query?: undefined;
            limit?: undefined;
            display_name?: undefined;
            asset_tag?: undefined;
            model_category?: undefined;
            model?: undefined;
            serial_number?: undefined;
            cost?: undefined;
            cost_center?: undefined;
            purchase_date?: undefined;
            disposal_reason?: undefined;
            disposal_date?: undefined;
            license_sys_id?: undefined;
            asset_sys_id?: undefined;
            active?: undefined;
            asset_id?: undefined;
            new_stage?: undefined;
            notes?: undefined;
            software_name?: undefined;
            threshold_pct?: undefined;
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
            disposal_reason: {
                type: string;
                description: string;
            };
            disposal_date: {
                type: string;
                description: string;
            };
            asset_class?: undefined;
            state?: undefined;
            assigned_to?: undefined;
            location?: undefined;
            query?: undefined;
            limit?: undefined;
            display_name?: undefined;
            asset_tag?: undefined;
            model_category?: undefined;
            model?: undefined;
            serial_number?: undefined;
            cost?: undefined;
            cost_center?: undefined;
            purchase_date?: undefined;
            fields?: undefined;
            license_sys_id?: undefined;
            asset_sys_id?: undefined;
            active?: undefined;
            asset_id?: undefined;
            new_stage?: undefined;
            notes?: undefined;
            software_name?: undefined;
            threshold_pct?: undefined;
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
            asset_class?: undefined;
            state?: undefined;
            assigned_to?: undefined;
            location?: undefined;
            sys_id?: undefined;
            display_name?: undefined;
            asset_tag?: undefined;
            model_category?: undefined;
            model?: undefined;
            serial_number?: undefined;
            cost?: undefined;
            cost_center?: undefined;
            purchase_date?: undefined;
            fields?: undefined;
            disposal_reason?: undefined;
            disposal_date?: undefined;
            license_sys_id?: undefined;
            asset_sys_id?: undefined;
            active?: undefined;
            asset_id?: undefined;
            new_stage?: undefined;
            notes?: undefined;
            software_name?: undefined;
            threshold_pct?: undefined;
        };
        required: never[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            license_sys_id: {
                type: string;
                description: string;
            };
            asset_class?: undefined;
            state?: undefined;
            assigned_to?: undefined;
            location?: undefined;
            query?: undefined;
            limit?: undefined;
            sys_id?: undefined;
            display_name?: undefined;
            asset_tag?: undefined;
            model_category?: undefined;
            model?: undefined;
            serial_number?: undefined;
            cost?: undefined;
            cost_center?: undefined;
            purchase_date?: undefined;
            fields?: undefined;
            disposal_reason?: undefined;
            disposal_date?: undefined;
            asset_sys_id?: undefined;
            active?: undefined;
            asset_id?: undefined;
            new_stage?: undefined;
            notes?: undefined;
            software_name?: undefined;
            threshold_pct?: undefined;
        };
        required: never[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            asset_sys_id: {
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
            asset_class?: undefined;
            state?: undefined;
            assigned_to?: undefined;
            location?: undefined;
            query?: undefined;
            sys_id?: undefined;
            display_name?: undefined;
            asset_tag?: undefined;
            model_category?: undefined;
            model?: undefined;
            serial_number?: undefined;
            cost?: undefined;
            cost_center?: undefined;
            purchase_date?: undefined;
            fields?: undefined;
            disposal_reason?: undefined;
            disposal_date?: undefined;
            license_sys_id?: undefined;
            asset_id?: undefined;
            new_stage?: undefined;
            notes?: undefined;
            software_name?: undefined;
            threshold_pct?: undefined;
        };
        required: never[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            asset_id: {
                type: string;
                description: string;
            };
            new_stage: {
                type: string;
                description: string;
            };
            notes: {
                type: string;
                description: string;
            };
            asset_class?: undefined;
            state?: undefined;
            assigned_to?: undefined;
            location?: undefined;
            query?: undefined;
            limit?: undefined;
            sys_id?: undefined;
            display_name?: undefined;
            asset_tag?: undefined;
            model_category?: undefined;
            model?: undefined;
            serial_number?: undefined;
            cost?: undefined;
            cost_center?: undefined;
            purchase_date?: undefined;
            fields?: undefined;
            disposal_reason?: undefined;
            disposal_date?: undefined;
            license_sys_id?: undefined;
            asset_sys_id?: undefined;
            active?: undefined;
            software_name?: undefined;
            threshold_pct?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            software_name: {
                type: string;
                description: string;
            };
            threshold_pct: {
                type: string;
                description: string;
            };
            asset_class?: undefined;
            state?: undefined;
            assigned_to?: undefined;
            location?: undefined;
            query?: undefined;
            limit?: undefined;
            sys_id?: undefined;
            display_name?: undefined;
            asset_tag?: undefined;
            model_category?: undefined;
            model?: undefined;
            serial_number?: undefined;
            cost?: undefined;
            cost_center?: undefined;
            purchase_date?: undefined;
            fields?: undefined;
            disposal_reason?: undefined;
            disposal_date?: undefined;
            license_sys_id?: undefined;
            asset_sys_id?: undefined;
            active?: undefined;
            asset_id?: undefined;
            new_stage?: undefined;
            notes?: undefined;
        };
        required: never[];
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
            sys_id?: undefined;
            pipeline_sys_id?: undefined;
            environment?: undefined;
            state?: undefined;
            short_description?: undefined;
            pipeline?: undefined;
            artifact?: undefined;
            type?: undefined;
            assigned_to?: undefined;
            assignment_group?: undefined;
            artifact_name?: undefined;
            artifact_version?: undefined;
            status?: undefined;
            notes?: undefined;
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
            pipeline_sys_id?: undefined;
            environment?: undefined;
            state?: undefined;
            short_description?: undefined;
            pipeline?: undefined;
            artifact?: undefined;
            type?: undefined;
            assigned_to?: undefined;
            assignment_group?: undefined;
            artifact_name?: undefined;
            artifact_version?: undefined;
            status?: undefined;
            notes?: undefined;
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
            pipeline_sys_id: {
                type: string;
                description: string;
            };
            environment: {
                type: string;
                description: string;
            };
            state: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            active?: undefined;
            sys_id?: undefined;
            short_description?: undefined;
            pipeline?: undefined;
            artifact?: undefined;
            type?: undefined;
            assigned_to?: undefined;
            assignment_group?: undefined;
            artifact_name?: undefined;
            artifact_version?: undefined;
            status?: undefined;
            notes?: undefined;
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
            short_description: {
                type: string;
                description: string;
            };
            pipeline: {
                type: string;
                description: string;
            };
            environment: {
                type: string;
                description: string;
            };
            artifact: {
                type: string;
                description: string;
            };
            type: {
                type: string;
                description: string;
            };
            assigned_to: {
                type: string;
                description: string;
            };
            assignment_group: {
                type: string;
                description: string;
            };
            active?: undefined;
            limit?: undefined;
            sys_id?: undefined;
            pipeline_sys_id?: undefined;
            state?: undefined;
            artifact_name?: undefined;
            artifact_version?: undefined;
            status?: undefined;
            notes?: undefined;
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
            pipeline: {
                type: string;
                description: string;
            };
            environment: {
                type: string;
                description: string;
            };
            artifact_name: {
                type: string;
                description: string;
            };
            artifact_version: {
                type: string;
                description: string;
            };
            status: {
                type: string;
                description: string;
            };
            notes: {
                type: string;
                description: string;
            };
            active?: undefined;
            limit?: undefined;
            sys_id?: undefined;
            pipeline_sys_id?: undefined;
            state?: undefined;
            short_description?: undefined;
            artifact?: undefined;
            type?: undefined;
            assigned_to?: undefined;
            assignment_group?: undefined;
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
            pipeline_sys_id: {
                type: string;
                description: string;
            };
            days: {
                type: string;
                description: string;
            };
            active?: undefined;
            limit?: undefined;
            sys_id?: undefined;
            environment?: undefined;
            state?: undefined;
            short_description?: undefined;
            pipeline?: undefined;
            artifact?: undefined;
            type?: undefined;
            assigned_to?: undefined;
            assignment_group?: undefined;
            artifact_name?: undefined;
            artifact_version?: undefined;
            status?: undefined;
            notes?: undefined;
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
            active: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            id?: undefined;
            name?: undefined;
            scope?: undefined;
            version?: undefined;
            short_description?: undefined;
            description?: undefined;
            vendor?: undefined;
            logo?: undefined;
            sys_id?: undefined;
            fields?: undefined;
        };
        required: never[];
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
            active?: undefined;
            limit?: undefined;
            name?: undefined;
            scope?: undefined;
            version?: undefined;
            short_description?: undefined;
            description?: undefined;
            vendor?: undefined;
            logo?: undefined;
            sys_id?: undefined;
            fields?: undefined;
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
            scope: {
                type: string;
                description: string;
            };
            version: {
                type: string;
                description: string;
            };
            short_description: {
                type: string;
                description: string;
            };
            description: {
                type: string;
                description: string;
            };
            vendor: {
                type: string;
                description: string;
            };
            active: {
                type: string;
                description: string;
            };
            logo: {
                type: string;
                description: string;
            };
            query?: undefined;
            limit?: undefined;
            id?: undefined;
            sys_id?: undefined;
            fields?: undefined;
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
            active?: undefined;
            limit?: undefined;
            id?: undefined;
            name?: undefined;
            scope?: undefined;
            version?: undefined;
            short_description?: undefined;
            description?: undefined;
            vendor?: undefined;
            logo?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            change_sys_id: {
                type: string;
                description: string;
            };
            type: {
                type: string;
                description: string;
            };
            category: {
                type: string;
                description: string;
            };
            table?: undefined;
            field?: undefined;
            days?: undefined;
            threshold?: undefined;
            days_ahead?: undefined;
            priority?: undefined;
            solution_name?: undefined;
            model_sys_id?: undefined;
            topic_sys_id?: undefined;
            incident_sys_id?: undefined;
            short_description?: undefined;
            limit?: undefined;
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
            table: {
                type: string;
                description: string;
            };
            field: {
                type: string;
                description: string;
            };
            days: {
                type: string;
                description: string;
            };
            threshold: {
                type: string;
                description: string;
            };
            change_sys_id?: undefined;
            type?: undefined;
            category?: undefined;
            days_ahead?: undefined;
            priority?: undefined;
            solution_name?: undefined;
            model_sys_id?: undefined;
            topic_sys_id?: undefined;
            incident_sys_id?: undefined;
            short_description?: undefined;
            limit?: undefined;
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
            days_ahead: {
                type: string;
                description: string;
            };
            category: {
                type: string;
                description: string;
            };
            priority: {
                type: string;
                description: string;
            };
            change_sys_id?: undefined;
            type?: undefined;
            table?: undefined;
            field?: undefined;
            days?: undefined;
            threshold?: undefined;
            solution_name?: undefined;
            model_sys_id?: undefined;
            topic_sys_id?: undefined;
            incident_sys_id?: undefined;
            short_description?: undefined;
            limit?: undefined;
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
            solution_name: {
                type: string;
                description: string;
            };
            change_sys_id?: undefined;
            type?: undefined;
            category?: undefined;
            table?: undefined;
            field?: undefined;
            days?: undefined;
            threshold?: undefined;
            days_ahead?: undefined;
            priority?: undefined;
            model_sys_id?: undefined;
            topic_sys_id?: undefined;
            incident_sys_id?: undefined;
            short_description?: undefined;
            limit?: undefined;
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
            table: {
                type: string;
                description: string;
            };
            field: {
                type: string;
                description: string;
            };
            change_sys_id?: undefined;
            type?: undefined;
            category?: undefined;
            days?: undefined;
            threshold?: undefined;
            days_ahead?: undefined;
            priority?: undefined;
            solution_name?: undefined;
            model_sys_id?: undefined;
            topic_sys_id?: undefined;
            incident_sys_id?: undefined;
            short_description?: undefined;
            limit?: undefined;
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
            model_sys_id: {
                type: string;
                description: string;
            };
            change_sys_id?: undefined;
            type?: undefined;
            category?: undefined;
            table?: undefined;
            field?: undefined;
            days?: undefined;
            threshold?: undefined;
            days_ahead?: undefined;
            priority?: undefined;
            solution_name?: undefined;
            topic_sys_id?: undefined;
            incident_sys_id?: undefined;
            short_description?: undefined;
            limit?: undefined;
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
            model_sys_id: {
                type: string;
                description: string;
            };
            days: {
                type: string;
                description: string;
            };
            change_sys_id?: undefined;
            type?: undefined;
            category?: undefined;
            table?: undefined;
            field?: undefined;
            threshold?: undefined;
            days_ahead?: undefined;
            priority?: undefined;
            solution_name?: undefined;
            topic_sys_id?: undefined;
            incident_sys_id?: undefined;
            short_description?: undefined;
            limit?: undefined;
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
            topic_sys_id: {
                type: string;
                description: string;
            };
            days: {
                type: string;
                description: string;
            };
            change_sys_id?: undefined;
            type?: undefined;
            category?: undefined;
            table?: undefined;
            field?: undefined;
            threshold?: undefined;
            days_ahead?: undefined;
            priority?: undefined;
            solution_name?: undefined;
            model_sys_id?: undefined;
            incident_sys_id?: undefined;
            short_description?: undefined;
            limit?: undefined;
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
            table: {
                type: string;
                description: string;
            };
            days: {
                type: string;
                description: string;
            };
            change_sys_id?: undefined;
            type?: undefined;
            category?: undefined;
            field?: undefined;
            threshold?: undefined;
            days_ahead?: undefined;
            priority?: undefined;
            solution_name?: undefined;
            model_sys_id?: undefined;
            topic_sys_id?: undefined;
            incident_sys_id?: undefined;
            short_description?: undefined;
            limit?: undefined;
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
            incident_sys_id: {
                type: string;
                description: string;
            };
            short_description: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            change_sys_id?: undefined;
            type?: undefined;
            category?: undefined;
            table?: undefined;
            field?: undefined;
            days?: undefined;
            threshold?: undefined;
            days_ahead?: undefined;
            priority?: undefined;
            solution_name?: undefined;
            model_sys_id?: undefined;
            topic_sys_id?: undefined;
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
            short_description: {
                type: string;
                description: string;
            };
            description: {
                type: string;
                description: string;
            };
            table: {
                type: string;
                description: string;
            };
            change_sys_id?: undefined;
            type?: undefined;
            category?: undefined;
            field?: undefined;
            days?: undefined;
            threshold?: undefined;
            days_ahead?: undefined;
            priority?: undefined;
            solution_name?: undefined;
            model_sys_id?: undefined;
            topic_sys_id?: undefined;
            incident_sys_id?: undefined;
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
            scope: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
            };
            table?: undefined;
            sys_id?: undefined;
            new_name?: undefined;
            target_scope?: undefined;
            update_set_sys_id?: undefined;
            app_sys_id?: undefined;
            reason?: undefined;
            days?: undefined;
            description?: undefined;
            update_sets?: undefined;
            script?: undefined;
            data?: undefined;
            required_fields?: undefined;
            days_stale?: undefined;
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
            name?: undefined;
            type?: undefined;
            scope?: undefined;
            limit?: undefined;
            new_name?: undefined;
            target_scope?: undefined;
            update_set_sys_id?: undefined;
            app_sys_id?: undefined;
            reason?: undefined;
            days?: undefined;
            description?: undefined;
            update_sets?: undefined;
            script?: undefined;
            data?: undefined;
            required_fields?: undefined;
            days_stale?: undefined;
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
            new_name: {
                type: string;
                description: string;
            };
            target_scope: {
                type: string;
                description: string;
            };
            name?: undefined;
            type?: undefined;
            scope?: undefined;
            limit?: undefined;
            update_set_sys_id?: undefined;
            app_sys_id?: undefined;
            reason?: undefined;
            days?: undefined;
            description?: undefined;
            update_sets?: undefined;
            script?: undefined;
            data?: undefined;
            required_fields?: undefined;
            days_stale?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            update_set_sys_id: {
                type: string;
                description: string;
            };
            app_sys_id: {
                type: string;
                description: string;
            };
            name?: undefined;
            type?: undefined;
            scope?: undefined;
            limit?: undefined;
            table?: undefined;
            sys_id?: undefined;
            new_name?: undefined;
            target_scope?: undefined;
            reason?: undefined;
            days?: undefined;
            description?: undefined;
            update_sets?: undefined;
            script?: undefined;
            data?: undefined;
            required_fields?: undefined;
            days_stale?: undefined;
        };
        required: never[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            update_set_sys_id: {
                type: string;
                description: string;
            };
            reason: {
                type: string;
                description: string;
            };
            name?: undefined;
            type?: undefined;
            scope?: undefined;
            limit?: undefined;
            table?: undefined;
            sys_id?: undefined;
            new_name?: undefined;
            target_scope?: undefined;
            app_sys_id?: undefined;
            days?: undefined;
            description?: undefined;
            update_sets?: undefined;
            script?: undefined;
            data?: undefined;
            required_fields?: undefined;
            days_stale?: undefined;
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
            limit: {
                type: string;
            };
            name?: undefined;
            type?: undefined;
            scope?: undefined;
            table?: undefined;
            sys_id?: undefined;
            new_name?: undefined;
            target_scope?: undefined;
            update_set_sys_id?: undefined;
            app_sys_id?: undefined;
            reason?: undefined;
            description?: undefined;
            update_sets?: undefined;
            script?: undefined;
            data?: undefined;
            required_fields?: undefined;
            days_stale?: undefined;
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
            update_sets: {
                type: string;
                items: {
                    type: string;
                };
                description: string;
            };
            type?: undefined;
            scope?: undefined;
            limit?: undefined;
            table?: undefined;
            sys_id?: undefined;
            new_name?: undefined;
            target_scope?: undefined;
            update_set_sys_id?: undefined;
            app_sys_id?: undefined;
            reason?: undefined;
            days?: undefined;
            script?: undefined;
            data?: undefined;
            required_fields?: undefined;
            days_stale?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            script: {
                type: string;
                description: string;
            };
            scope: {
                type: string;
                description: string;
            };
            name?: undefined;
            type?: undefined;
            limit?: undefined;
            table?: undefined;
            sys_id?: undefined;
            new_name?: undefined;
            target_scope?: undefined;
            update_set_sys_id?: undefined;
            app_sys_id?: undefined;
            reason?: undefined;
            days?: undefined;
            description?: undefined;
            update_sets?: undefined;
            data?: undefined;
            required_fields?: undefined;
            days_stale?: undefined;
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
            data: {
                type: string;
                items: {
                    type: string;
                };
                description: string;
            };
            name?: undefined;
            type?: undefined;
            scope?: undefined;
            limit?: undefined;
            sys_id?: undefined;
            new_name?: undefined;
            target_scope?: undefined;
            update_set_sys_id?: undefined;
            app_sys_id?: undefined;
            reason?: undefined;
            days?: undefined;
            description?: undefined;
            update_sets?: undefined;
            script?: undefined;
            required_fields?: undefined;
            days_stale?: undefined;
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
            required_fields: {
                type: string;
                description: string;
            };
            days_stale: {
                type: string;
                description: string;
            };
            name?: undefined;
            type?: undefined;
            scope?: undefined;
            limit?: undefined;
            sys_id?: undefined;
            new_name?: undefined;
            target_scope?: undefined;
            update_set_sys_id?: undefined;
            app_sys_id?: undefined;
            reason?: undefined;
            days?: undefined;
            description?: undefined;
            update_sets?: undefined;
            script?: undefined;
            data?: undefined;
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
            where: {
                type: string;
                description: string;
                items: {
                    type: string;
                    items: {};
                    minItems: number;
                    maxItems: number;
                };
            };
            orWhere: {
                type: string;
                description: string;
                items: {
                    type: string;
                    items: {};
                    minItems: number;
                    maxItems: number;
                };
            };
            select: {
                type: string;
                description: string;
                items: {
                    type: string;
                };
            };
            aggregate: {
                type: string;
                description: string;
                enum: string[];
            };
            aggregateField: {
                type: string;
                description: string;
            };
            groupBy: {
                type: string;
                description: string;
            };
            orderBy: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            displayValue: {
                type: string;
                description: string;
            };
            operations?: undefined;
            script?: undefined;
            scope?: undefined;
            topic?: undefined;
            name?: undefined;
            template?: undefined;
            directory?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            operations: {
                type: string;
                description: string;
                items: {
                    type: string;
                    properties: {
                        id: {
                            type: string;
                            description: string;
                        };
                        method: {
                            type: string;
                            description: string;
                            enum: string[];
                        };
                        url: {
                            type: string;
                            description: string;
                        };
                        body: {
                            type: string;
                            description: string;
                        };
                    };
                    required: string[];
                };
                minItems: number;
                maxItems: number;
            };
            table?: undefined;
            where?: undefined;
            orWhere?: undefined;
            select?: undefined;
            aggregate?: undefined;
            aggregateField?: undefined;
            groupBy?: undefined;
            orderBy?: undefined;
            limit?: undefined;
            displayValue?: undefined;
            script?: undefined;
            scope?: undefined;
            topic?: undefined;
            name?: undefined;
            template?: undefined;
            directory?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            script: {
                type: string;
                description: string;
            };
            scope: {
                type: string;
                description: string;
            };
            table?: undefined;
            where?: undefined;
            orWhere?: undefined;
            select?: undefined;
            aggregate?: undefined;
            aggregateField?: undefined;
            groupBy?: undefined;
            orderBy?: undefined;
            limit?: undefined;
            displayValue?: undefined;
            operations?: undefined;
            topic?: undefined;
            name?: undefined;
            template?: undefined;
            directory?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            topic: {
                type: string;
                description: string;
            };
            table?: undefined;
            where?: undefined;
            orWhere?: undefined;
            select?: undefined;
            aggregate?: undefined;
            aggregateField?: undefined;
            groupBy?: undefined;
            orderBy?: undefined;
            limit?: undefined;
            displayValue?: undefined;
            operations?: undefined;
            script?: undefined;
            scope?: undefined;
            name?: undefined;
            template?: undefined;
            directory?: undefined;
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
            template: {
                type: string;
                description: string;
            };
            directory: {
                type: string;
                description: string;
            };
            table?: undefined;
            where?: undefined;
            orWhere?: undefined;
            select?: undefined;
            aggregate?: undefined;
            aggregateField?: undefined;
            groupBy?: undefined;
            orderBy?: undefined;
            limit?: undefined;
            displayValue?: undefined;
            operations?: undefined;
            script?: undefined;
            scope?: undefined;
            topic?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            directory: {
                type: string;
                description: string;
            };
            table?: undefined;
            where?: undefined;
            orWhere?: undefined;
            select?: undefined;
            aggregate?: undefined;
            aggregateField?: undefined;
            groupBy?: undefined;
            orderBy?: undefined;
            limit?: undefined;
            displayValue?: undefined;
            operations?: undefined;
            script?: undefined;
            scope?: undefined;
            topic?: undefined;
            name?: undefined;
            template?: undefined;
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
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            ci_class: {
                type: string;
                description: string;
            };
            match_fields: {
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
            days_threshold?: undefined;
            action?: undefined;
            targets?: undefined;
            dry_run?: undefined;
        };
        required: never[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            ci_class: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            match_fields?: undefined;
            days_threshold?: undefined;
            action?: undefined;
            targets?: undefined;
            dry_run?: undefined;
        };
        required: never[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            ci_class: {
                type: string;
                description: string;
            };
            days_threshold: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            match_fields?: undefined;
            action?: undefined;
            targets?: undefined;
            dry_run?: undefined;
        };
        required: never[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            action: {
                type: string;
                enum: string[];
                description: string;
            };
            targets: {
                type: string;
                items: {
                    type: string;
                };
                description: string;
            };
            dry_run: {
                type: string;
                description: string;
            };
            ci_class?: undefined;
            match_fields?: undefined;
            limit?: undefined;
            days_threshold?: undefined;
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
} | import("./schema-cache.js").DynamicToolDefinition | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            table: {
                type: string;
                description: string;
            };
            operations: {
                type: string;
                description: string;
                items: {
                    type: string;
                    enum: string[];
                };
            };
        };
        required: string[];
    };
})[];
export declare function routeToolInvocation(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
//# sourceMappingURL=index.d.ts.map