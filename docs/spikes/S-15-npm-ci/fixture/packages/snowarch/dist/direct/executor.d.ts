import type { LlmConfig } from './llm-client.js';
export interface DirectExecutionOptions {
    capability: string;
    args?: Record<string, string>;
    instance?: string;
    llmConfig: LlmConfig;
    output?: string;
}
export interface DirectExecutionResult {
    content: string;
    model: string;
    usage?: {
        input_tokens: number;
        output_tokens: number;
    };
    dataGathered: number;
}
/**
 * Execute a capability in direct mode (no MCP).
 *
 * Flow:
 * 1. Load capability prompt
 * 2. Gather data from ServiceNow via client
 * 3. Build LLM messages: capability prompt + gathered data
 * 4. Send to LLM and return response
 */
export declare function executeDirectly(options: DirectExecutionOptions): Promise<DirectExecutionResult>;
//# sourceMappingURL=executor.d.ts.map