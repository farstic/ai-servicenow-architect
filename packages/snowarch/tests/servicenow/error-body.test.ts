// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C176 — a refusal carries the instance's own error text.
 *
 * The instance answers a refused request with `{ "error": { "message", "detail" } }`
 * (`markdown/api-reference/rest-apis/editor-api.md`, the error object), and the detail is where a 403
 * says what refused it: an ACL, a Business Rule, a scope. The client kept the detail in `details` and
 * the error text showed only the message, so the owner's v2.2.0-rc.2 refusal read "Operation Failed"
 * with nothing to place it by. A body that is not JSON was dropped for "HTTP 403: Forbidden".
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetFetchMock, respond, snFetchMockModule, type SnFetchState } from '../helpers/fetch-mock.js';
import { withPreset } from '../helpers/preset.js';

const http = vi.hoisted<SnFetchState>(() => ({ calls: [], queue: [] }));
vi.mock('../../src/servicenow/http.js', async () => snFetchMockModule(http));

import { ServiceNowClient } from '../../src/servicenow/client.js';
import { dispatchAiAgentsAction } from '../../src/tools/ai-agents.js';
import { toolErrorText } from '../../src/utils/tool-error.js';

withPreset('full');

const ACL = 'ACL Exception Insert Failed due to security constraints';
const client = () => new ServiceNowClient({
  instanceUrl: 'https://test.service-now.com', authMethod: 'basic', basic: { username: 'u', password: 'p' },
  maxRetries: 0, retryDelayMs: 0,
});
const answer = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300, status, statusText: status === 403 ? 'Forbidden' : '',
  headers: { get: () => null },
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  json: async () => body,
});
const refusal = (status: number, message: string, detail?: string) =>
  answer(status, { error: { message, ...(detail === undefined ? {} : { detail }) }, status: 'failure' });

/** The text a session reads for the failed call: the server's own rendering. */
async function failureText(run: () => Promise<unknown>): Promise<string> {
  const error = await run().then(() => undefined, (e: unknown) => e);
  expect(error).toBeDefined();
  return toolErrorText(error);
}

beforeEach(() => { resetFetchMock(http); process.env.LOG_LEVEL = 'error'; });

describe('ARC-09-C176 — a refusal carries the instance\'s own error text', () => {
  it('a 403 with a detail: the text names the detail, and the code stays last', async () => {
    respond(http, refusal(403, 'Operation Failed', ACL));
    const text = await failureText(() => client().createRecord('sn_aia_agent_tool_m2m', { agent: 'a' }));
    expect(text).toBe(`Error: Operation Failed: ${ACL} (Code: INSUFFICIENT_PRIVILEGES)`);
  });

  it('a 403 a Business Rule aborted: the rule the instance named reaches the text', async () => {
    const detail = "Operation against file 'sn_aia_agent_tool_m2m' was aborted by Business Rule 'Example'";
    respond(http, refusal(403, 'Operation Failed', detail));
    const text = await failureText(() => client().createRecord('sn_aia_agent_tool_m2m', { agent: 'a' }));
    expect(text).toContain(detail);
    expect(text).toMatch(/\(Code: INSUFFICIENT_PRIVILEGES\)$/);
  });

  it('a 400 with a detail: the same', async () => {
    respond(http, refusal(400, 'Invalid request', 'Field x is read-only'));
    const text = await failureText(() => client().updateRecord('incident', 'a'.repeat(32), { x: '1' }));
    expect(text).toBe('Error: Invalid request: Field x is read-only (Code: INVALID_REQUEST)');
  });

  it('a body that is not JSON: its text is shown, whitespace collapsed and cut at 200 characters', async () => {
    const page = `<html>\n  <body>Forbidden by the gateway</body>\n</html>${' filler'.repeat(60)}`;
    respond(http, answer(403, page));
    const text = await failureText(() => client().createRecord('incident', { short_description: 'x' }));
    const shown = page.replace(/\s+/g, ' ').trim().slice(0, 200);
    expect(text).toContain(`HTTP 403: Forbidden: ${shown}`);
    expect(text).not.toContain(page.replace(/\s+/g, ' ').trim());
    expect(text).toMatch(/\(Code: INSUFFICIENT_PRIVILEGES\)$/);
  });

  it('control: a detail the message already holds is not repeated, and no detail leaves the message as it was', async () => {
    respond(http, refusal(403, `Operation Failed: ${ACL}`, ACL));
    const repeated = await failureText(() => client().createRecord('incident', { short_description: 'x' }));
    expect(repeated).toBe(`Error: Operation Failed: ${ACL} (Code: INSUFFICIENT_PRIVILEGES)`);
    resetFetchMock(http);
    respond(http, refusal(403, 'Operation Failed'));
    const bare = await failureText(() => client().createRecord('incident', { short_description: 'x' }));
    expect(bare).toBe('Error: Operation Failed (Code: INSUFFICIENT_PRIVILEGES)');
  });

  it('the ARC-09-C174 rethrow carries it: the detail, then the step, then what was created', async () => {
    const TOOL = 'a'.repeat(32);
    const AGENT = 'b'.repeat(32);
    const agent = { sys_id: AGENT, name: 'Group reader', description: 'Reads the user groups', role: 'You list user groups.',
      instructions: 'Run the tool.' };
    respond(http, answer(200, { result: { sys_id: TOOL, name: 'Read groups' } }));   // the tool exists
    respond(http, answer(201, { result: agent }));                                     // the agent's insert
    respond(http, answer(200, { result: agent }));                                     // its read-back
    respond(http, refusal(403, 'Operation Failed', ACL));                              // the tool link
    const text = await failureText(() => dispatchAiAgentsAction(client(), 'snow_ai_ai_agent_add', {
      name: agent.name, description: agent.description, role: agent.role, instructions: agent.instructions,
      tools: [{ tool_sys_id: TOOL }],
    }));
    expect(text).toMatch(new RegExp(`^Error: Operation Failed: ${ACL} — while creating sn_aia_agent_tool_m2m; `
      + `sn_aia_agent ${AGENT} was created, but the call did not finish\\.`));
    expect(text).toMatch(/\(Code: INSUFFICIENT_PRIVILEGES\)$/);
  });
});
