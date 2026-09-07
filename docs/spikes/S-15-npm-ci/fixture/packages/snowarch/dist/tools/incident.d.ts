/**
 * Incident Management tools — full ITSM incident lifecycle.
 * Read tools: Tier 0. Write tools: Tier 1 (WRITE_ENABLED=true).
 */
import type { ServiceNowClient } from '../servicenow/client.js';
export declare function incidentToolManifest(): ({
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            short_description: {
                type: string;
                description: string;
            };
            urgency: {
                type: string;
                description: string;
            };
            impact: {
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
            assignment_group: {
                type: string;
                description: string;
            };
            caller_id: {
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
            number_or_sysid?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            resolution_code?: undefined;
            resolution_notes?: undefined;
            table?: undefined;
            note?: undefined;
            comment?: undefined;
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
            urgency?: undefined;
            impact?: undefined;
            priority?: undefined;
            description?: undefined;
            assignment_group?: undefined;
            caller_id?: undefined;
            category?: undefined;
            subcategory?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            resolution_code?: undefined;
            resolution_notes?: undefined;
            table?: undefined;
            note?: undefined;
            comment?: undefined;
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
            urgency?: undefined;
            impact?: undefined;
            priority?: undefined;
            description?: undefined;
            assignment_group?: undefined;
            caller_id?: undefined;
            category?: undefined;
            subcategory?: undefined;
            number_or_sysid?: undefined;
            resolution_code?: undefined;
            resolution_notes?: undefined;
            table?: undefined;
            note?: undefined;
            comment?: undefined;
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
            resolution_code: {
                type: string;
                description: string;
            };
            resolution_notes: {
                type: string;
                description: string;
            };
            short_description?: undefined;
            urgency?: undefined;
            impact?: undefined;
            priority?: undefined;
            description?: undefined;
            assignment_group?: undefined;
            caller_id?: undefined;
            category?: undefined;
            subcategory?: undefined;
            number_or_sysid?: undefined;
            fields?: undefined;
            table?: undefined;
            note?: undefined;
            comment?: undefined;
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
            short_description?: undefined;
            urgency?: undefined;
            impact?: undefined;
            priority?: undefined;
            description?: undefined;
            assignment_group?: undefined;
            caller_id?: undefined;
            category?: undefined;
            subcategory?: undefined;
            number_or_sysid?: undefined;
            fields?: undefined;
            resolution_code?: undefined;
            resolution_notes?: undefined;
            table?: undefined;
            note?: undefined;
            comment?: undefined;
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
            note: {
                type: string;
                description: string;
            };
            short_description?: undefined;
            urgency?: undefined;
            impact?: undefined;
            priority?: undefined;
            description?: undefined;
            assignment_group?: undefined;
            caller_id?: undefined;
            category?: undefined;
            subcategory?: undefined;
            number_or_sysid?: undefined;
            fields?: undefined;
            resolution_code?: undefined;
            resolution_notes?: undefined;
            comment?: undefined;
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
            comment: {
                type: string;
                description: string;
            };
            short_description?: undefined;
            urgency?: undefined;
            impact?: undefined;
            priority?: undefined;
            description?: undefined;
            assignment_group?: undefined;
            caller_id?: undefined;
            category?: undefined;
            subcategory?: undefined;
            number_or_sysid?: undefined;
            fields?: undefined;
            resolution_code?: undefined;
            resolution_notes?: undefined;
            note?: undefined;
        };
        required: string[];
    };
})[];
export declare function dispatchIncidentAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
//# sourceMappingURL=incident.d.ts.map