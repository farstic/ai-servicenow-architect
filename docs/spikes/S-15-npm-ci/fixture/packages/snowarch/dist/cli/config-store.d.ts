import type { LlmProvider } from '../direct/llm-client.js';
/** Integration mode — how ServiceNow MCP Toolkit is consumed. */
export type IntegrationMode = 'mcp' | 'sdk' | 'both';
export interface InstanceConfig {
    name: string;
    instanceUrl: string;
    authMethod: 'basic' | 'oauth';
    username?: string;
    password?: string;
    clientId?: string;
    clientSecret?: string;
    authMode?: 'service-account' | 'per-user' | 'impersonation';
    writeEnabled?: boolean;
    scriptingEnabled?: boolean;
    cmdbWriteEnabled?: boolean;
    atfEnabled?: boolean;
    toolPackage?: string;
    nowAssistEnabled?: boolean;
    /**
     * Integration mode: mcp (default), sdk, or both.
     * @deprecated Use mcpEnabled / sdkEnabled booleans instead.
     *             Kept for backward compatibility — computed from booleans when present.
     */
    integrationMode?: IntegrationMode;
    /** MCP Server enabled — AI clients discover and call tools automatically */
    mcpEnabled?: boolean;
    /** TypeScript SDK enabled — import ServiceNow MCP Toolkit in your code */
    sdkEnabled?: boolean;
    /** Apex AI Skills: enable 26 scan/review/build/ops/docs capabilities */
    apexEnabled?: boolean;
    /** AI provider for direct mode capabilities */
    aiProvider?: LlmProvider;
    /** AI model name (e.g. 'claude-sonnet-4-6', 'llama3.3') */
    aiModel?: string;
    /** API key for cloud providers (Anthropic/OpenAI) */
    aiApiKey?: string;
    /** Custom base URL override for the AI provider endpoint */
    aiBaseUrl?: string;
    group?: string;
    environment?: string;
    addedAt: string;
}
/**
 * Migrate a loaded InstanceConfig that may have only `integrationMode` set to
 * also include the new granular boolean fields.  Runs in place.
 */
export declare function migrateInstanceConfig(instance: InstanceConfig): InstanceConfig;
export interface SnMcpConfig {
    version: number;
    defaultInstance: string;
    instances: Record<string, InstanceConfig>;
}
export declare function loadConfig(): SnMcpConfig;
export declare function saveConfig(config: SnMcpConfig): void;
export declare function addInstance(instance: InstanceConfig): void;
export declare function listInstances(): InstanceConfig[];
export declare function getDefaultInstance(): InstanceConfig | undefined;
export declare function removeInstance(name: string): boolean;
//# sourceMappingURL=config-store.d.ts.map