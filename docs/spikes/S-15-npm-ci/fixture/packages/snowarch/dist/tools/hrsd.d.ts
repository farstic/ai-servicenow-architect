/**
 * HR Service Delivery (HRSD) tools — full lifecycle for HR cases, services, and profiles.
 * Read tools: Tier 0. Write tools: Tier 1 (WRITE_ENABLED=true).
 */
import type { ServiceNowClient } from '../servicenow/client.js';
export declare function hrsdToolManifest(): ({
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
            number_or_sysid: {
                type: string;
                description: string;
            };
            short_description?: undefined;
            hr_service?: undefined;
            subject_person?: undefined;
            description?: undefined;
            assignment_group?: undefined;
            priority?: undefined;
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
            sys_id: {
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
            state: {
                type: string;
                description: string;
            };
            subject_person: {
                type: string;
                description: string;
            };
            hr_service: {
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
            description?: undefined;
            assignment_group?: undefined;
            priority?: undefined;
            number_or_sysid?: undefined;
            sys_id?: undefined;
            fields?: undefined;
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
            close_code: {
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
            fields?: undefined;
            state?: undefined;
            limit?: undefined;
            query?: undefined;
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
            close_notes?: undefined;
            close_code?: undefined;
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
        };
        required: never[];
    };
})[];
export declare function dispatchHrsdAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
//# sourceMappingURL=hrsd.d.ts.map