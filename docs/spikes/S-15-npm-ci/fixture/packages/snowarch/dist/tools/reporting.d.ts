/**
 * Reporting & Analytics tools — ServiceNow Reporting API + branded report generation.
 * All tools are Tier 0 (read-only) unless noted.
 * ServiceNow API: GET /api/now/reporting, /api/now/stats/{table}, /api/now/pa/widget/{sys_id}
 */
import type { ServiceNowClient } from '../servicenow/client.js';
export declare function reportingToolManifest(): ({
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
})[];
export declare function dispatchReportingAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
//# sourceMappingURL=reporting.d.ts.map