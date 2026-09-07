import type { ServiceNowClient } from '../servicenow/client.js';
export declare function fluentToolManifest(): ({
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            table: {
                type: string;
                description: string;
            };
            where: {
                type: string;
                description: string;
                items: {
                    type: string;
                    items: {};
                    minItems: number;
                    maxItems: number;
                };
            };
            orWhere: {
                type: string;
                description: string;
                items: {
                    type: string;
                    items: {};
                    minItems: number;
                    maxItems: number;
                };
            };
            select: {
                type: string;
                description: string;
                items: {
                    type: string;
                };
            };
            aggregate: {
                type: string;
                description: string;
                enum: string[];
            };
            aggregateField: {
                type: string;
                description: string;
            };
            groupBy: {
                type: string;
                description: string;
            };
            orderBy: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            displayValue: {
                type: string;
                description: string;
            };
            operations?: undefined;
            script?: undefined;
            scope?: undefined;
            topic?: undefined;
            name?: undefined;
            template?: undefined;
            directory?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            operations: {
                type: string;
                description: string;
                items: {
                    type: string;
                    properties: {
                        id: {
                            type: string;
                            description: string;
                        };
                        method: {
                            type: string;
                            description: string;
                            enum: string[];
                        };
                        url: {
                            type: string;
                            description: string;
                        };
                        body: {
                            type: string;
                            description: string;
                        };
                    };
                    required: string[];
                };
                minItems: number;
                maxItems: number;
            };
            table?: undefined;
            where?: undefined;
            orWhere?: undefined;
            select?: undefined;
            aggregate?: undefined;
            aggregateField?: undefined;
            groupBy?: undefined;
            orderBy?: undefined;
            limit?: undefined;
            displayValue?: undefined;
            script?: undefined;
            scope?: undefined;
            topic?: undefined;
            name?: undefined;
            template?: undefined;
            directory?: undefined;
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
            table?: undefined;
            where?: undefined;
            orWhere?: undefined;
            select?: undefined;
            aggregate?: undefined;
            aggregateField?: undefined;
            groupBy?: undefined;
            orderBy?: undefined;
            limit?: undefined;
            displayValue?: undefined;
            operations?: undefined;
            topic?: undefined;
            name?: undefined;
            template?: undefined;
            directory?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            topic: {
                type: string;
                description: string;
            };
            table?: undefined;
            where?: undefined;
            orWhere?: undefined;
            select?: undefined;
            aggregate?: undefined;
            aggregateField?: undefined;
            groupBy?: undefined;
            orderBy?: undefined;
            limit?: undefined;
            displayValue?: undefined;
            operations?: undefined;
            script?: undefined;
            scope?: undefined;
            name?: undefined;
            template?: undefined;
            directory?: undefined;
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
            template: {
                type: string;
                description: string;
            };
            directory: {
                type: string;
                description: string;
            };
            table?: undefined;
            where?: undefined;
            orWhere?: undefined;
            select?: undefined;
            aggregate?: undefined;
            aggregateField?: undefined;
            groupBy?: undefined;
            orderBy?: undefined;
            limit?: undefined;
            displayValue?: undefined;
            operations?: undefined;
            script?: undefined;
            scope?: undefined;
            topic?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            directory: {
                type: string;
                description: string;
            };
            table?: undefined;
            where?: undefined;
            orWhere?: undefined;
            select?: undefined;
            aggregate?: undefined;
            aggregateField?: undefined;
            groupBy?: undefined;
            orderBy?: undefined;
            limit?: undefined;
            displayValue?: undefined;
            operations?: undefined;
            script?: undefined;
            scope?: undefined;
            topic?: undefined;
            name?: undefined;
            template?: undefined;
        };
        required: never[];
    };
})[];
export declare function dispatchFluentAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
//# sourceMappingURL=fluent.d.ts.map