/**
 * Performance Analytics & Dashboards tools — PA indicators, scorecards, KPIs, and dashboards.
 * All read-only tools: Tier 0.
 * Inspired by snow-flow's "Analysis" category: KPI management, Performance Analytics, dashboards.
 */
import type { ServiceNowClient } from '../servicenow/client.js';
export declare function performanceToolManifest(): ({
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
})[];
export declare function dispatchPerformanceAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
//# sourceMappingURL=performance.d.ts.map