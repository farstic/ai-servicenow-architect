/**
 * DevOps integration tools — CI/CD pipelines, deployment tracking, and velocity metrics.
 *
 * Tier 0 (Read):  list_devops_pipelines, get_devops_pipeline, list_deployments,
 *                  get_deployment, get_devops_insights
 * Tier 1 (Write): create_devops_change, track_deployment
 *
 * ServiceNow tables: sn_devops_pipeline, sn_devops_artifact, sn_devops_deploy_task,
 *                    sn_devops_change_request
 */
import type { ServiceNowClient } from '../servicenow/client.js';
export declare function devopsToolManifest(): ({
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
})[];
export declare function dispatchDevopsAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
//# sourceMappingURL=devops.d.ts.map