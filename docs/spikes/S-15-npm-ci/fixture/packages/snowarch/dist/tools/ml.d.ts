/**
 * Machine Learning tools — anomaly detection, change risk prediction,
 * incident forecasting, model training, NLU analysis, process optimization.
 *
 * NOTE: Does NOT duplicate existing Now Assist tools (categorize_incident,
 * suggest_resolution, ai_search, get_pi_models). These ML tools focus on
 * ServiceNow Predictive Intelligence and ML Workbench capabilities.
 *
 * ServiceNow tables: ml_solution, ml_solution_version, sys_cs_conversation
 */
import type { ServiceNowClient } from '../servicenow/client.js';
export declare function mlToolManifest(): ({
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
})[];
export declare function dispatchMlAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
//# sourceMappingURL=ml.d.ts.map