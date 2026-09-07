/**
 * Customer Service Management (CSM) tools — cases, consumers, accounts, and contacts.
 * Read tools: Tier 0. Write tools: Tier 1 (WRITE_ENABLED=true).
 */
import type { ServiceNowClient } from '../servicenow/client.js';
export declare function csmToolManifest(): ({
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
})[];
export declare function dispatchCsmAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
//# sourceMappingURL=csm.d.ts.map