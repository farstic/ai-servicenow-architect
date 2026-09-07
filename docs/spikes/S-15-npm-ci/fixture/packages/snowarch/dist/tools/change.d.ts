/**
 * Change Request Management tools.
 * Read tools: Tier 0. Write tools: Tier 1 (WRITE_ENABLED=true).
 */
import type { ServiceNowClient } from '../servicenow/client.js';
export declare function changeToolManifest(): ({
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
            number_or_sysid: {
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
            fields: {
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
            close_code?: undefined;
            close_notes?: undefined;
            change_id?: undefined;
            date?: undefined;
            duration_minutes?: undefined;
            attendees?: undefined;
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
            sys_id: {
                type: string;
                description: string;
            };
            close_code: {
                type: string;
                description: string;
            };
            close_notes: {
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
})[];
export declare function dispatchChangeAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
//# sourceMappingURL=change.d.ts.map