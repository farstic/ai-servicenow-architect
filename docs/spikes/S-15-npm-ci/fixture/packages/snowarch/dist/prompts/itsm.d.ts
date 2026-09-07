/**
 * Built-in ITSM slash commands (MCP Prompts).
 *
 * These appear as "/" commands in Claude Desktop, Cursor, and other
 * MCP clients that support the Prompts capability.
 */
export interface PromptDefinition {
    name: string;
    description: string;
    /** Optional user-visible arguments the AI client will ask for */
    arguments?: Array<{
        name: string;
        description: string;
        required?: boolean;
    }>;
    /** Template to send as the user message */
    template: string;
}
export declare const itsmPrompts: PromptDefinition[];
//# sourceMappingURL=itsm.d.ts.map