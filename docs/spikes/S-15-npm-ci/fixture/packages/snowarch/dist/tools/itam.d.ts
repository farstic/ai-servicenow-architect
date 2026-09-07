/**
 * IT Asset Management (ITAM) tools — hardware/software asset lifecycle.
 *
 * Tier 0 (Read):  list_assets, get_asset, list_software_licenses, get_license_compliance,
 *                  list_asset_contracts
 * Tier 1 (Write): create_asset, update_asset, retire_asset
 *
 * ServiceNow tables: alm_asset, alm_hardware, alm_license, ast_contract
 */
import type { ServiceNowClient } from '../servicenow/client.js';
export declare function itamToolManifest(): ({
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
})[];
export declare function dispatchItamAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
//# sourceMappingURL=itam.d.ts.map