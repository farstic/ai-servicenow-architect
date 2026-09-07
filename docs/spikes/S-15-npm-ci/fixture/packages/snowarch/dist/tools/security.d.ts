/**
 * Security Operations (SecOps) tools — security incidents, vulnerabilities, and GRC.
 * Read tools: Tier 0. Write tools: Tier 1 (WRITE_ENABLED=true).
 */
import type { ServiceNowClient } from '../servicenow/client.js';
export declare function securityToolManifest(): ({
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            short_description: {
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
            severity: {
                type: string;
                description: string;
            };
            description: {
                type: string;
                description: string;
            };
            affected_cis: {
                type: string;
                items: {
                    type: string;
                };
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
            ci_sysid?: undefined;
            risk_sysid?: undefined;
            type?: undefined;
            active?: undefined;
            playbook_sys_id?: undefined;
            incident_sys_id?: undefined;
            parameters?: undefined;
            days?: undefined;
            ci_sys_ids?: undefined;
            group?: undefined;
            scan_type?: undefined;
            name?: undefined;
            impact?: undefined;
            likelihood?: undefined;
            owner?: undefined;
            policy_sys_id?: undefined;
            control_sys_id?: undefined;
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
            category?: undefined;
            subcategory?: undefined;
            severity?: undefined;
            description?: undefined;
            affected_cis?: undefined;
            assignment_group?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            state?: undefined;
            limit?: undefined;
            query?: undefined;
            ci_sysid?: undefined;
            risk_sysid?: undefined;
            type?: undefined;
            active?: undefined;
            playbook_sys_id?: undefined;
            incident_sys_id?: undefined;
            parameters?: undefined;
            days?: undefined;
            ci_sys_ids?: undefined;
            group?: undefined;
            scan_type?: undefined;
            name?: undefined;
            impact?: undefined;
            likelihood?: undefined;
            owner?: undefined;
            policy_sys_id?: undefined;
            control_sys_id?: undefined;
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
            category?: undefined;
            subcategory?: undefined;
            severity?: undefined;
            description?: undefined;
            affected_cis?: undefined;
            assignment_group?: undefined;
            number_or_sysid?: undefined;
            state?: undefined;
            limit?: undefined;
            query?: undefined;
            ci_sysid?: undefined;
            risk_sysid?: undefined;
            type?: undefined;
            active?: undefined;
            playbook_sys_id?: undefined;
            incident_sys_id?: undefined;
            parameters?: undefined;
            days?: undefined;
            ci_sys_ids?: undefined;
            group?: undefined;
            scan_type?: undefined;
            name?: undefined;
            impact?: undefined;
            likelihood?: undefined;
            owner?: undefined;
            policy_sys_id?: undefined;
            control_sys_id?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            state: {
                type: string;
                description: string;
            };
            severity: {
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
            query: {
                type: string;
                description: string;
            };
            short_description?: undefined;
            subcategory?: undefined;
            description?: undefined;
            affected_cis?: undefined;
            assignment_group?: undefined;
            number_or_sysid?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            ci_sysid?: undefined;
            risk_sysid?: undefined;
            type?: undefined;
            active?: undefined;
            playbook_sys_id?: undefined;
            incident_sys_id?: undefined;
            parameters?: undefined;
            days?: undefined;
            ci_sys_ids?: undefined;
            group?: undefined;
            scan_type?: undefined;
            name?: undefined;
            impact?: undefined;
            likelihood?: undefined;
            owner?: undefined;
            policy_sys_id?: undefined;
            control_sys_id?: undefined;
        };
        required: never[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            state: {
                type: string;
                description: string;
            };
            severity: {
                type: string;
                description: string;
            };
            ci_sysid: {
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
            affected_cis?: undefined;
            assignment_group?: undefined;
            number_or_sysid?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            risk_sysid?: undefined;
            type?: undefined;
            active?: undefined;
            playbook_sys_id?: undefined;
            incident_sys_id?: undefined;
            parameters?: undefined;
            days?: undefined;
            ci_sys_ids?: undefined;
            group?: undefined;
            scan_type?: undefined;
            name?: undefined;
            impact?: undefined;
            likelihood?: undefined;
            owner?: undefined;
            policy_sys_id?: undefined;
            control_sys_id?: undefined;
        };
        required: never[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            state: {
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
            short_description?: undefined;
            subcategory?: undefined;
            severity?: undefined;
            description?: undefined;
            affected_cis?: undefined;
            assignment_group?: undefined;
            number_or_sysid?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            query?: undefined;
            ci_sysid?: undefined;
            risk_sysid?: undefined;
            type?: undefined;
            active?: undefined;
            playbook_sys_id?: undefined;
            incident_sys_id?: undefined;
            parameters?: undefined;
            days?: undefined;
            ci_sys_ids?: undefined;
            group?: undefined;
            scan_type?: undefined;
            name?: undefined;
            impact?: undefined;
            likelihood?: undefined;
            owner?: undefined;
            policy_sys_id?: undefined;
            control_sys_id?: undefined;
        };
        required: never[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            risk_sysid: {
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
            short_description?: undefined;
            category?: undefined;
            subcategory?: undefined;
            severity?: undefined;
            description?: undefined;
            affected_cis?: undefined;
            assignment_group?: undefined;
            number_or_sysid?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            query?: undefined;
            ci_sysid?: undefined;
            type?: undefined;
            active?: undefined;
            playbook_sys_id?: undefined;
            incident_sys_id?: undefined;
            parameters?: undefined;
            days?: undefined;
            ci_sys_ids?: undefined;
            group?: undefined;
            scan_type?: undefined;
            name?: undefined;
            impact?: undefined;
            likelihood?: undefined;
            owner?: undefined;
            policy_sys_id?: undefined;
            control_sys_id?: undefined;
        };
        required: never[];
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
            type: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            short_description?: undefined;
            category?: undefined;
            subcategory?: undefined;
            severity?: undefined;
            description?: undefined;
            affected_cis?: undefined;
            assignment_group?: undefined;
            number_or_sysid?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            state?: undefined;
            ci_sysid?: undefined;
            risk_sysid?: undefined;
            active?: undefined;
            playbook_sys_id?: undefined;
            incident_sys_id?: undefined;
            parameters?: undefined;
            days?: undefined;
            ci_sys_ids?: undefined;
            group?: undefined;
            scan_type?: undefined;
            name?: undefined;
            impact?: undefined;
            likelihood?: undefined;
            owner?: undefined;
            policy_sys_id?: undefined;
            control_sys_id?: undefined;
        };
        required: string[];
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
            category: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            short_description?: undefined;
            subcategory?: undefined;
            severity?: undefined;
            description?: undefined;
            affected_cis?: undefined;
            assignment_group?: undefined;
            number_or_sysid?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            state?: undefined;
            query?: undefined;
            ci_sysid?: undefined;
            risk_sysid?: undefined;
            type?: undefined;
            playbook_sys_id?: undefined;
            incident_sys_id?: undefined;
            parameters?: undefined;
            days?: undefined;
            ci_sys_ids?: undefined;
            group?: undefined;
            scan_type?: undefined;
            name?: undefined;
            impact?: undefined;
            likelihood?: undefined;
            owner?: undefined;
            policy_sys_id?: undefined;
            control_sys_id?: undefined;
        };
        required: never[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            playbook_sys_id: {
                type: string;
                description: string;
            };
            incident_sys_id: {
                type: string;
                description: string;
            };
            parameters: {
                type: string;
                description: string;
            };
            short_description?: undefined;
            category?: undefined;
            subcategory?: undefined;
            severity?: undefined;
            description?: undefined;
            affected_cis?: undefined;
            assignment_group?: undefined;
            number_or_sysid?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            state?: undefined;
            limit?: undefined;
            query?: undefined;
            ci_sysid?: undefined;
            risk_sysid?: undefined;
            type?: undefined;
            active?: undefined;
            days?: undefined;
            ci_sys_ids?: undefined;
            group?: undefined;
            scan_type?: undefined;
            name?: undefined;
            impact?: undefined;
            likelihood?: undefined;
            owner?: undefined;
            policy_sys_id?: undefined;
            control_sys_id?: undefined;
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
            short_description?: undefined;
            category?: undefined;
            subcategory?: undefined;
            severity?: undefined;
            description?: undefined;
            affected_cis?: undefined;
            assignment_group?: undefined;
            number_or_sysid?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            state?: undefined;
            limit?: undefined;
            query?: undefined;
            ci_sysid?: undefined;
            risk_sysid?: undefined;
            type?: undefined;
            active?: undefined;
            playbook_sys_id?: undefined;
            incident_sys_id?: undefined;
            parameters?: undefined;
            ci_sys_ids?: undefined;
            group?: undefined;
            scan_type?: undefined;
            name?: undefined;
            impact?: undefined;
            likelihood?: undefined;
            owner?: undefined;
            policy_sys_id?: undefined;
            control_sys_id?: undefined;
        };
        required: never[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            ci_sys_ids: {
                type: string;
                items: {
                    type: string;
                };
                description: string;
            };
            group: {
                type: string;
                description: string;
            };
            scan_type: {
                type: string;
                description: string;
            };
            short_description?: undefined;
            category?: undefined;
            subcategory?: undefined;
            severity?: undefined;
            description?: undefined;
            affected_cis?: undefined;
            assignment_group?: undefined;
            number_or_sysid?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            state?: undefined;
            limit?: undefined;
            query?: undefined;
            ci_sysid?: undefined;
            risk_sysid?: undefined;
            type?: undefined;
            active?: undefined;
            playbook_sys_id?: undefined;
            incident_sys_id?: undefined;
            parameters?: undefined;
            days?: undefined;
            name?: undefined;
            impact?: undefined;
            likelihood?: undefined;
            owner?: undefined;
            policy_sys_id?: undefined;
            control_sys_id?: undefined;
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
            category: {
                type: string;
                description: string;
            };
            description: {
                type: string;
                description: string;
            };
            impact: {
                type: string;
                description: string;
            };
            likelihood: {
                type: string;
                description: string;
            };
            owner: {
                type: string;
                description: string;
            };
            short_description?: undefined;
            subcategory?: undefined;
            severity?: undefined;
            affected_cis?: undefined;
            assignment_group?: undefined;
            number_or_sysid?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            state?: undefined;
            limit?: undefined;
            query?: undefined;
            ci_sysid?: undefined;
            risk_sysid?: undefined;
            type?: undefined;
            active?: undefined;
            playbook_sys_id?: undefined;
            incident_sys_id?: undefined;
            parameters?: undefined;
            days?: undefined;
            ci_sys_ids?: undefined;
            group?: undefined;
            scan_type?: undefined;
            policy_sys_id?: undefined;
            control_sys_id?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            state: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            short_description?: undefined;
            category?: undefined;
            subcategory?: undefined;
            severity?: undefined;
            description?: undefined;
            affected_cis?: undefined;
            assignment_group?: undefined;
            number_or_sysid?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            query?: undefined;
            ci_sysid?: undefined;
            risk_sysid?: undefined;
            type?: undefined;
            active?: undefined;
            playbook_sys_id?: undefined;
            incident_sys_id?: undefined;
            parameters?: undefined;
            days?: undefined;
            ci_sys_ids?: undefined;
            group?: undefined;
            scan_type?: undefined;
            name?: undefined;
            impact?: undefined;
            likelihood?: undefined;
            owner?: undefined;
            policy_sys_id?: undefined;
            control_sys_id?: undefined;
        };
        required: never[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            policy_sys_id: {
                type: string;
                description: string;
            };
            control_sys_id: {
                type: string;
                description: string;
            };
            short_description?: undefined;
            category?: undefined;
            subcategory?: undefined;
            severity?: undefined;
            description?: undefined;
            affected_cis?: undefined;
            assignment_group?: undefined;
            number_or_sysid?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            state?: undefined;
            limit?: undefined;
            query?: undefined;
            ci_sysid?: undefined;
            risk_sysid?: undefined;
            type?: undefined;
            active?: undefined;
            playbook_sys_id?: undefined;
            incident_sys_id?: undefined;
            parameters?: undefined;
            days?: undefined;
            ci_sys_ids?: undefined;
            group?: undefined;
            scan_type?: undefined;
            name?: undefined;
            impact?: undefined;
            likelihood?: undefined;
            owner?: undefined;
        };
        required: never[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            state: {
                type: string;
                description: string;
            };
            severity: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            short_description?: undefined;
            category?: undefined;
            subcategory?: undefined;
            description?: undefined;
            affected_cis?: undefined;
            assignment_group?: undefined;
            number_or_sysid?: undefined;
            sys_id?: undefined;
            fields?: undefined;
            query?: undefined;
            ci_sysid?: undefined;
            risk_sysid?: undefined;
            type?: undefined;
            active?: undefined;
            playbook_sys_id?: undefined;
            incident_sys_id?: undefined;
            parameters?: undefined;
            days?: undefined;
            ci_sys_ids?: undefined;
            group?: undefined;
            scan_type?: undefined;
            name?: undefined;
            impact?: undefined;
            likelihood?: undefined;
            owner?: undefined;
            policy_sys_id?: undefined;
            control_sys_id?: undefined;
        };
        required: never[];
    };
})[];
export declare function dispatchSecurityAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
//# sourceMappingURL=security.d.ts.map