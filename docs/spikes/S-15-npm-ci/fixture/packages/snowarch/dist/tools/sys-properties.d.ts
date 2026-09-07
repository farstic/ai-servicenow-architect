/**
 * System Properties tools — read and manage ServiceNow sys_properties records.
 *
 * Tier 0 (Read): list, get, search, bulk_get, categories
 * Tier 1 (Write): set, delete, bulk_set, import
 * Tier 0 (Audit): history (read-only)
 *
 * ServiceNow table: sys_properties, sys_audit_sys_properties
 */
import type { ServiceNowClient } from '../servicenow/client.js';
export declare function sysPropertiesToolManifest(): ({
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            name: {
                type: string;
                description: string;
            };
            value?: undefined;
            description?: undefined;
            type?: undefined;
            query?: undefined;
            category?: undefined;
            limit?: undefined;
            search?: undefined;
            names?: undefined;
            properties?: undefined;
            dry_run?: undefined;
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
            value: {
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
            query?: undefined;
            category?: undefined;
            limit?: undefined;
            search?: undefined;
            names?: undefined;
            properties?: undefined;
            dry_run?: undefined;
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
            category: {
                type: string;
                description: string;
            };
            type: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            name?: undefined;
            value?: undefined;
            description?: undefined;
            search?: undefined;
            names?: undefined;
            properties?: undefined;
            dry_run?: undefined;
        };
        required: never[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            search: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            name?: undefined;
            value?: undefined;
            description?: undefined;
            type?: undefined;
            query?: undefined;
            category?: undefined;
            names?: undefined;
            properties?: undefined;
            dry_run?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            names: {
                type: string;
                items: {
                    type: string;
                };
                description: string;
            };
            name?: undefined;
            value?: undefined;
            description?: undefined;
            type?: undefined;
            query?: undefined;
            category?: undefined;
            limit?: undefined;
            search?: undefined;
            properties?: undefined;
            dry_run?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            properties: {
                type: string;
                description: string;
                items: {
                    type: string;
                    properties: {
                        name: {
                            type: string;
                        };
                        value: {
                            type: string;
                        };
                        description: {
                            type: string;
                        };
                    };
                    required: string[];
                };
            };
            name?: undefined;
            value?: undefined;
            description?: undefined;
            type?: undefined;
            query?: undefined;
            category?: undefined;
            limit?: undefined;
            search?: undefined;
            names?: undefined;
            dry_run?: undefined;
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
            query: {
                type: string;
                description: string;
            };
            name?: undefined;
            value?: undefined;
            description?: undefined;
            type?: undefined;
            limit?: undefined;
            search?: undefined;
            names?: undefined;
            properties?: undefined;
            dry_run?: undefined;
        };
        required: never[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            properties: {
                type: string;
                description: string;
                items?: undefined;
            };
            dry_run: {
                type: string;
                description: string;
            };
            name?: undefined;
            value?: undefined;
            description?: undefined;
            type?: undefined;
            query?: undefined;
            category?: undefined;
            limit?: undefined;
            search?: undefined;
            names?: undefined;
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
            value: {
                type: string;
                description: string;
            };
            description?: undefined;
            type?: undefined;
            query?: undefined;
            category?: undefined;
            limit?: undefined;
            search?: undefined;
            names?: undefined;
            properties?: undefined;
            dry_run?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            name?: undefined;
            value?: undefined;
            description?: undefined;
            type?: undefined;
            query?: undefined;
            category?: undefined;
            limit?: undefined;
            search?: undefined;
            names?: undefined;
            properties?: undefined;
            dry_run?: undefined;
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
            limit: {
                type: string;
                description: string;
            };
            value?: undefined;
            description?: undefined;
            type?: undefined;
            query?: undefined;
            category?: undefined;
            search?: undefined;
            names?: undefined;
            properties?: undefined;
            dry_run?: undefined;
        };
        required: string[];
    };
})[];
export declare function dispatchSysPropertiesAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
//# sourceMappingURL=sys-properties.d.ts.map