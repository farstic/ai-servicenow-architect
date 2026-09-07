/**
 * Deployment & Artifact lifecycle tools — artifact validation, push/pull,
 * deployment tracking, rollback, and solution packaging.
 *
 * NOTE: Does NOT duplicate existing devops.ts (pipelines, deployments) or
 * updateset.ts (update set CRUD). These tools add artifact-level management
 * and deployment orchestration.
 *
 * ServiceNow tables: sys_update_xml, sys_remote_update_set, sys_app,
 *   sys_store_app, sn_devops_artifact
 */
import type { ServiceNowClient } from '../servicenow/client.js';
export declare function deploymentToolManifest(): ({
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
})[];
export declare function dispatchDeploymentAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
//# sourceMappingURL=deployment.d.ts.map