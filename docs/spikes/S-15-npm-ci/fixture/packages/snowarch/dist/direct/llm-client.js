/**
 * ServiceNow MCP Toolkit — BYOK LLM Client
 *
 * Supports multiple LLM providers for direct mode execution.
 * Users bring their own API key (BYOK) — no vendor lock-in.
 */
const DEFAULT_MODELS = {
    anthropic: 'claude-sonnet-4-7',
    openai: 'gpt-5.5',
    ollama: 'llama3.3',
    lmstudio: 'auto',
};
const PROVIDER_URLS = {
    anthropic: 'https://api.anthropic.com/v1/messages',
    openai: 'https://api.openai.com/v1/chat/completions',
    ollama: 'http://localhost:11434/api/chat',
    lmstudio: 'http://localhost:1234/v1/chat/completions',
};
function resolveConfig(config) {
    const provider = config.provider;
    const url = config.baseUrl || PROVIDER_URLS[provider];
    const model = config.model || DEFAULT_MODELS[provider];
    const apiKey = config.apiKey || process.env[`${provider.toUpperCase()}_API_KEY`] || '';
    const localProviders = ['ollama', 'lmstudio'];
    if (!localProviders.includes(provider) && !apiKey) {
        throw new Error(`API key required for ${provider}. Set ${provider.toUpperCase()}_API_KEY or pass --api-key`);
    }
    return { url, model, apiKey };
}
async function callAnthropic(url, model, apiKey, messages, maxTokens) {
    const systemMsg = messages.find(m => m.role === 'system');
    const chatMsgs = messages.filter(m => m.role !== 'system');
    const body = {
        model,
        max_tokens: maxTokens,
        ...(systemMsg ? { system: systemMsg.content } : {}),
        messages: chatMsgs.map(m => ({ role: m.role, content: m.content })),
    };
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Anthropic API error (${response.status}): ${text}`);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await response.json();
    return {
        content: data.content?.[0]?.text || '',
        model: data.model || model,
        usage: data.usage ? { input_tokens: data.usage.input_tokens, output_tokens: data.usage.output_tokens } : undefined,
    };
}
async function callOpenAI(url, model, apiKey, messages, maxTokens) {
    const body = {
        model,
        max_tokens: maxTokens,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
    };
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`OpenAI API error (${response.status}): ${text}`);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await response.json();
    return {
        content: data.choices?.[0]?.message?.content || '',
        model: data.model || model,
        usage: data.usage ? { input_tokens: data.usage.prompt_tokens, output_tokens: data.usage.completion_tokens } : undefined,
    };
}
async function callOllama(url, model, _apiKey, messages) {
    const body = {
        model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        stream: false,
    };
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Ollama API error (${response.status}): ${text}`);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await response.json();
    return {
        content: data.message?.content || '',
        model: data.model || model,
    };
}
/**
 * Send messages to the configured LLM provider and get a response.
 */
export async function callLlm(config, messages) {
    const { url, model, apiKey } = resolveConfig(config);
    const maxTokens = config.maxTokens || 8192;
    switch (config.provider) {
        case 'anthropic':
            return callAnthropic(url, model, apiKey, messages, maxTokens);
        case 'openai':
            return callOpenAI(url, model, apiKey, messages, maxTokens);
        case 'ollama':
            return callOllama(url, model, apiKey, messages);
        case 'lmstudio':
            return callOpenAI(url, model, apiKey, messages, maxTokens);
        default:
            throw new Error(`Unsupported provider: ${config.provider}`);
    }
}
//# sourceMappingURL=llm-client.js.map