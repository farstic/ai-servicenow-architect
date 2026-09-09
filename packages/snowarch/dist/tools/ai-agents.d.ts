/**
 * AI Agents tools — create and manage AI agents and agentic workflows.
 * Write tools require NOW_ASSIST_ENABLED + WRITE_ENABLED.
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import type { ToolDefinition } from './types.js';
export declare function aiAgentsToolManifest(): ToolDefinition[];
export declare function dispatchAiAgentsAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
