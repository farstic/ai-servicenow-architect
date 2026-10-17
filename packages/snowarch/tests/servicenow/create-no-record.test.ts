// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C179 — an insert the instance answers with no record is reported as that, never as "created".
 *
 * Measured while the v2.2.0-rc.2 refusal was traced (2026-10-17): a create answered 200 with no record in its body
 * came back from `snow_core_record_add` as `{"action":"created"}` with no sys_id, and from the AI agent build as
 * "answered the create … with no sys_id", without the status or the body. A `null` body surfaced as a JavaScript
 * TypeError. The client now refuses such an answer itself, with the status and the body (cut), as CREATE_FAILED,
 * whose remedy is that the message carries the instance's response.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetFetchMock, respond, snFetchMockModule, type SnFetchState } from '../helpers/fetch-mock.js';
import { withPreset } from '../helpers/preset.js';

const http = vi.hoisted<SnFetchState>(() => ({ calls: [], queue: [] }));
vi.mock('../../src/servicenow/http.js', async () => snFetchMockModule(http));

import { ServiceNowClient } from '../../src/servicenow/client.js';
import { dispatchCoreAction } from '../../src/tools/core.js';
import { dispatchAiAgentsAction } from '../../src/tools/ai-agents.js';
import { toolErrorText } from '../../src/utils/tool-error.js';

withPreset('full');

const TOOL = 'a'.repeat(32);
const AGENT = 'b'.repeat(32);
const client = () => new ServiceNowClient({
  instanceUrl: 'https://test.service-now.com', authMethod: 'basic', basic: { username: 'u', password: 'p' },
  maxRetries: 0, retryDelayMs: 0,
});
const answer = (status: number, text: string) => ({
  ok: status >= 200 && status < 300, status, statusText: '', headers: { get: () => null },
  text: async () => text, json: async () => JSON.parse(text),
});
const add = () => dispatchCoreAction(client(), 'snow_core_record_add',
  { table: 'sn_aia_agent_tool_m2m', fields: { agent: AGENT, tool: TOOL, active: true } });
async function failureText(run: () => Promise<unknown>): Promise<string> {
  const outcome = await run().then((value) => ({ value }), (error: unknown) => ({ error }));
  expect(outcome).toHaveProperty('error');
  return toolErrorText((outcome as { error: unknown }).error);
}

beforeEach(() => { resetFetchMock(http); process.env.LOG_LEVEL = 'error'; });

describe('ARC-09-C179 — a create answered with no record is never "created"', () => {
  it('200 with an empty result: CREATE_FAILED, naming the status and showing the body', async () => {
    respond(http, answer(200, '{"result":{}}'));
    const text = await failureText(add);
    expect(text).toMatch(/^Error: No record returned for the create on sn_aia_agent_tool_m2m \(HTTP 200\); body: \{"result":\{\}\}\./);
    expect(text).toMatch(/\(Code: CREATE_FAILED\)$/);
  });

  it('200 with ten bytes of cut JSON: the bytes are shown as they came', async () => {
    respond(http, answer(200, '{"result":'));
    expect(await failureText(add)).toContain('(HTTP 200); body: {"result":.');
  });

  it('200 with null, and 201 with nothing: no TypeError, the same refusal', async () => {
    respond(http, answer(200, 'null'));
    const nullText = await failureText(add);
    expect(nullText).toContain('(HTTP 200); body: null.');
    expect(nullText).not.toMatch(/Cannot read properties/);
    resetFetchMock(http);
    respond(http, answer(201, ''));
    expect(await failureText(add)).toContain('(HTTP 201); body: (empty).');
  });

  it('control: a create answered with its record is created, sys_id and all', async () => {
    respond(http, answer(201, JSON.stringify({ result: { sys_id: 'c'.repeat(32), agent: AGENT, tool: TOOL } })));
    const result = await add();
    expect(result).toMatchObject({ action: 'created', table: 'sn_aia_agent_tool_m2m', sys_id: 'c'.repeat(32) });
  });

  it('the AI agent build: the link step names the status and the body, after the step', async () => {
    const agent = JSON.stringify({ result: { sys_id: AGENT, name: 'Group reader' } });
    respond(http, answer(200, JSON.stringify({ result: { sys_id: TOOL, name: 'Read groups' } })));   // the tool exists
    respond(http, answer(201, agent));                                                            // the agent's insert
    respond(http, answer(200, agent));                                                            // its read-back
    respond(http, answer(200, '{"result":{}}'));                                                  // the link
    const text = await failureText(() => dispatchAiAgentsAction(client(), 'snow_ai_ai_agent_add', {
      name: 'Group reader', description: 'd', role: 'r', instructions: 'i', tools: [{ tool_sys_id: TOOL }],
    }));
    expect(text).toMatch(/^Error: No record returned for the create on sn_aia_agent_tool_m2m \(HTTP 200\); body: \{"result":\{\}\}\..* — while creating sn_aia_agent_tool_m2m; sn_aia_agent b{32} was created/);
  });
});
