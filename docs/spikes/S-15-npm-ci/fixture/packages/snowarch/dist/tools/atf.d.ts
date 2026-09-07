/**
 * ATF (Automated Test Framework) tools — latest release.
 * Read tools: Tier 0. Execution tools require ATF_ENABLED=true.
 * Latest release added: Failure Insight (get_atf_failure_insight) showing metadata diffs.
 */
import type { ServiceNowClient } from '../servicenow/client.js';
export declare function atfToolManifest(): ({
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
})[];
export declare function dispatchAtfAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
//# sourceMappingURL=atf.d.ts.map