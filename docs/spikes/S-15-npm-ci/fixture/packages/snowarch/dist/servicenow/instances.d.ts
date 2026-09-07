import { ServiceNowClient } from './client.js';
declare class InstanceManager {
    private instances;
    private currentName;
    constructor();
    private loadInstances;
    private buildConfig;
    private register;
    /** Return client for named instance (or current instance if no name given). */
    getClient(name?: string): ServiceNowClient;
    /** Reload instances from config files (call after config is updated). */
    reload(): void;
    /** Switch the active instance for the session. */
    switch(name: string): void;
    getCurrentName(): string;
    getCurrentUrl(): string;
    listNames(): string[];
    listAll(): Array<{
        name: string;
        url: string;
        active: boolean;
        group: string;
        environment: string;
    }>;
}
export declare const instanceManager: InstanceManager;
export {};
//# sourceMappingURL=instances.d.ts.map