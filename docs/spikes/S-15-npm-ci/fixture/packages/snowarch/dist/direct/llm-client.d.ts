/**
 * ServiceNow MCP Toolkit — BYOK LLM Client
 *
 * Supports multiple LLM providers for direct mode execution.
 * Users bring their own API key (BYOK) — no vendor lock-in.
 */
export type LlmProvider = 'anthropic' | 'openai' | 'ollama' | 'lmstudio';
export interface LlmConfig {
    provider: LlmProvider;
    apiKey?: string;
    model?: string;
    baseUrl?: string;
    maxTokens?: number;
    temperature?: number;
}
export interface LlmMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}
export interface LlmResponse {
    content: string;
    model: string;
    usage?: {
        input_tokens: number;
        output_tokens: number;
    };
}
/**
 * Send messages to the configured LLM provider and get a response.
 */
export declare function callLlm(config: LlmConfig, messages: LlmMessage[]): Promise<LlmResponse>;
//# sourceMappingURL=llm-client.d.ts.map