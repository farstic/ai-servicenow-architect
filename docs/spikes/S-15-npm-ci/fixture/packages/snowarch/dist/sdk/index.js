/**
 * ServiceNow MCP Toolkit SDK — Direct TypeScript integration.
 *
 * Use this entry point to programmatically interact with ServiceNow
 * without the MCP layer. Ideal for scripts, pipelines, and custom apps.
 *
 * @example
 * ```ts
 * import { ServiceNowClient } from 'servicenow-mcp/sdk';
 *
 * const client = new ServiceNowClient({
 *   instanceUrl: 'https://myinstance.service-now.com',
 *   authMethod: 'basic',
 *   basic: { username: 'admin', password: 'secret' },
 * });
 *
 * const incidents = await client.queryRecords({
 *   table: 'incident',
 *   query: 'state=1^priority=1',
 *   limit: 10,
 * });
 * ```
 *
 * @example Direct mode (gather data + LLM analysis)
 * ```ts
 * import { executeDirectly } from 'servicenow-mcp/sdk';
 *
 * const result = await executeDirectly({
 *   capability: 'scan-health',
 *   llmConfig: { provider: 'anthropic', apiKey: 'sk-...' },
 * });
 * console.log(result.content);
 * ```
 */
// ─── Core Client ─────────────────────────────────────────────────────────────
export { ServiceNowClient } from '../servicenow/client.js';
// ─── Direct Execution Engine ─────────────────────────────────────────────────
export { executeDirectly } from '../direct/executor.js';
// ─── LLM Client (BYOK) ──────────────────────────────────────────────────────
export { callLlm } from '../direct/llm-client.js';
// ─── Tool Router ─────────────────────────────────────────────────────────────
export { collectToolCatalog, routeToolInvocation } from '../tools/index.js';
// ─── Prompts & Capabilities ──────────────────────────────────────────────────
export { getPrompts, resolvePromptAsync, getCapabilityMeta, getCapabilities, } from '../prompts/index.js';
// ─── Config Store ────────────────────────────────────────────────────────────
export { loadConfig, saveConfig, addInstance, listInstances, getDefaultInstance, removeInstance, } from '../cli/config-store.js';
// ─── Instance Manager ────────────────────────────────────────────────────────
export { instanceManager } from '../servicenow/instances.js';
// ─── Report Generation ──────────────────────────────────────────────────────
export { generateReport, parseMarkdown } from '../reports/index.js';
// ─── Error Types ─────────────────────────────────────────────────────────────
export { ServiceNowError } from '../utils/errors.js';
// ─── Logging ─────────────────────────────────────────────────────────────────
export { logger } from '../utils/logging.js';
//# sourceMappingURL=index.js.map