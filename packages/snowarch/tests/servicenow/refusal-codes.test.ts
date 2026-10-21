// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C182 — a 403 the instance's own rule gave is INSTANCE_REFUSED, not INSUFFICIENT_PRIVILEGES.
 *
 * The owner's v2.2.0-rc.3 check on a PDI (2026-10-17): an unnamed tool link was refused with "Operation Failed:
 * Data Policy Exception: The following fields are mandatory: Name (Code: INSUFFICIENT_PRIVILEGES)", and the Architect
 * then printed that code's remedy — the account lacks a role — against the instance's own words. Every 403 was that
 * code. Now the detail decides: the ACL wording stays INSUFFICIENT_PRIVILEGES; a data policy or a business rule is
 * INSTANCE_REFUSED, whose remedy is to correct the record, not the roles; anything else stays as it was.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetFetchMock, respond, snFetchMockModule, type SnFetchState } from '../helpers/fetch-mock.js';
import { withPreset } from '../helpers/preset.js';

const http = vi.hoisted<SnFetchState>(() => ({ calls: [], queue: [] }));
vi.mock('../../src/servicenow/http.js', async () => snFetchMockModule(http));

import { ServiceNowClient } from '../../src/servicenow/client.js';
import { dispatchAiAgentsAction } from '../../src/tools/ai-agents.js';
import { ERROR_CODES } from '../../src/errors/codes.js';
import { toolErrorText } from '../../src/utils/tool-error.js';

withPreset('full');

const DATA_POLICY = 'Data Policy Exception: The following fields are mandatory: Name';
const BUSINESS_RULE = "Operation against file 'sn_aia_agent_tool_m2m' was aborted by Business Rule 'Example'";
const ACL = 'ACL Exception Insert Failed due to security constraints';

const client = (maxRetries = 0) => new ServiceNowClient({
  instanceUrl: 'https://test.service-now.com', authMethod: 'basic', basic: { username: 'u', password: 'p' },
  maxRetries, retryDelayMs: 0,
});
const answer = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300, status, statusText: '', headers: { get: () => null },
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)), json: async () => body,
});
const refused = (detail?: string) =>
  answer(403, { error: { message: 'Operation Failed', ...(detail === undefined ? {} : { detail }) }, status: 'failure' });
async function failureText(run: () => Promise<unknown>): Promise<string> {
  const outcome = await run().then((value) => ({ value }), (error: unknown) => ({ error }));
  expect(outcome).toHaveProperty('error');
  return toolErrorText((outcome as { error: unknown }).error);
}
const add = (c = client()) => failureText(() => c.createRecord('sn_aia_agent_tool_m2m', { agent: 'a', tool: 't' }));

beforeEach(() => { resetFetchMock(http); process.env.LOG_LEVEL = 'error'; });

describe('ARC-09-C182 — the detail decides what a 403 is', () => {
  it('the exact rc.3 data policy is INSTANCE_REFUSED, its text unchanged', async () => {
    respond(http, refused(DATA_POLICY));
    expect(await add()).toBe(`Error: Operation Failed: ${DATA_POLICY} (Code: INSTANCE_REFUSED)`);
  });

  it('a business rule abort is INSTANCE_REFUSED', async () => {
    respond(http, refused(BUSINESS_RULE));
    expect(await add()).toMatch(/\(Code: INSTANCE_REFUSED\)$/);
  });

  it('the ACL wording stays INSUFFICIENT_PRIVILEGES', async () => {
    respond(http, refused(ACL));
    expect(await add()).toBe(`Error: Operation Failed: ${ACL} (Code: INSUFFICIENT_PRIVILEGES)`);
  });

  it('control: a 403 with no detail stays INSUFFICIENT_PRIVILEGES', async () => {
    respond(http, refused());
    expect(await add()).toBe('Error: Operation Failed (Code: INSUFFICIENT_PRIVILEGES)');
  });

  it('the ACL wording decides first, when both appear', async () => {
    respond(http, refused(`${ACL}; ${DATA_POLICY}`));
    expect(await add()).toMatch(/\(Code: INSUFFICIENT_PRIVILEGES\)$/);
  });

  it('INSTANCE_REFUSED is not retried: the same record gets the same answer', async () => {
    respond(http, refused(DATA_POLICY));
    expect(await add(client(3))).toMatch(/\(Code: INSTANCE_REFUSED\)$/);
    expect(http.calls).toHaveLength(1);
  });

  it('the ARC-09-C174 rethrow keeps INSTANCE_REFUSED', async () => {
    const TOOL = 'a'.repeat(32);
    const agent = JSON.stringify({ result: { sys_id: 'b'.repeat(32), name: 'Group reader' } });
    respond(http, answer(200, { result: { sys_id: TOOL, name: 'Read groups' } }));   // the tool exists
    respond(http, answer(201, agent));                                                // the agent's insert
    respond(http, answer(200, agent));                                                // its read-back
    respond(http, refused(DATA_POLICY));                                              // the link
    const text = await failureText(() => dispatchAiAgentsAction(client(), 'snow_ai_ai_agent_add', {
      name: 'Group reader', description: 'd', role: 'r', instructions: 'i', tools: [{ tool_sys_id: TOOL }],
    }));
    expect(text).toMatch(/^Error: Operation Failed: Data Policy Exception: .* — while creating sn_aia_agent_tool_m2m; /);
    expect(text).toMatch(/\(Code: INSTANCE_REFUSED\)$/);
  });

  it('the registry carries it, rule-visible, with the record-not-roles remedy', () => {
    const entry = ERROR_CODES.find((e) => (e.code as string) === 'INSTANCE_REFUSED');
    expect(entry).toMatchObject({
      showInRule: true,
      remedy: 'the instance\'s own rule refused the record — read the message, correct the fields it names and send the '
        + 'write again, as a new write with its own approval; do not change roles',
    });
  });
});
