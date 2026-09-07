export type WriteMethod = 'json-mcpServers' | 'json-servers' | 'command' | 'env';
export interface DetectedClient {
    id: string;
    name: string;
    detected: boolean;
    configPath: string;
    /** JSON key inside the config that holds the server map */
    configKey: string;
    /** How the wizard writes the entry */
    writeMethod: WriteMethod;
    requiresRestart: boolean;
    /** Extra note shown to the user after writing */
    note?: string;
}
export declare function detectClients(): DetectedClient[];
//# sourceMappingURL=detect-clients.d.ts.map