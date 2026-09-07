import type { CapabilityDefinition, CapabilityCategory } from './types.js';
export type { CapabilityDefinition, CapabilityCategory } from './types.js';
export interface McpPrompt {
    name: string;
    description: string;
    arguments?: Array<{
        name: string;
        description: string;
        required?: boolean;
    }>;
}
export interface McpPromptMessage {
    role: 'user' | 'assistant';
    content: {
        type: 'text';
        text: string;
    };
}
export interface GetPromptResult {
    description: string;
    messages: McpPromptMessage[];
}
interface CapabilityMeta {
    name: string;
    title: string;
    description: string;
    category: CapabilityCategory;
    file: string;
    arguments?: Array<{
        name: string;
        description: string;
        required?: boolean;
    }>;
}
/** All prompts merged (ITSM + user-defined + capabilities). Lightweight — no capability module loading. */
export declare function getPrompts(): McpPrompt[];
/** Resolve a prompt by name. Lazy-loads capability modules only when needed. */
export declare function resolvePromptAsync(name: string, args?: Record<string, string>): Promise<GetPromptResult | null>;
/** Synchronous resolve — for backward compatibility. Only resolves ITSM/user prompts. */
export declare function resolvePrompt(name: string, args?: Record<string, string>): GetPromptResult | null;
/** Get capability metadata for CLI listing. Lightweight — no module loading. */
export declare function getCapabilityMeta(): CapabilityMeta[];
/** Get full capability definitions (loads all modules). For direct execution. */
export declare function getCapabilities(): Promise<CapabilityDefinition[]>;
/** Initialize registry — loads pro extensions if configured. */
export declare function initializeRegistry(): Promise<void>;
//# sourceMappingURL=index.d.ts.map