// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C177 — an ACL refusal of a delete is DELETE_ACL_DENIED, not DELETE_CONSTRAINT.
 *
 * The instance words an ACL refusal "ACL Exception Delete Failed due to security constraints"
 * (docs/validation/2.0.11-rc.3-live-sitting.md, the teardown; PN-16). The classifier tested its constraint pattern,
 * whose last alternative was the bare word `constraint`, before the ACL one, so that text was reported as a reference
 * block, with the remedy "Remove or reassign the dependent records first". The status alone does not decide it: the
 * classifier's own note says the instance answers 403 for both causes. The ACL wording now decides first.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetFetchMock, respond, snFetchMockModule, type SnFetchState } from '../helpers/fetch-mock.js';

const http = vi.hoisted<SnFetchState>(() => ({ calls: [], queue: [] }));
vi.mock('../../src/servicenow/http.js', async () => snFetchMockModule(http));

import { ServiceNowClient } from '../../src/servicenow/client.js';

const ACL_DELETE = 'ACL Exception Delete Failed due to security constraints';
const client = () => new ServiceNowClient({
  instanceUrl: 'https://test.service-now.com', authMethod: 'basic', basic: { username: 'u', password: 'p' },
  maxRetries: 0, retryDelayMs: 0,
});
const refusal = (status: number, message: string, detail: string) => ({
  ok: false, status, statusText: '', headers: { get: () => null },
  text: async () => JSON.stringify({ error: { message, detail }, status: 'failure' }),
});
async function deleteRefused(status: number, message: string, detail: string): Promise<{ code?: string; message?: string }> {
  respond(http, refusal(status, message, detail));
  return client().deleteRecord('sys_variable_value', 'a'.repeat(32)).then(() => ({}), (e: { code?: string; message?: string }) => e);
}

beforeEach(() => { resetFetchMock(http); process.env.LOG_LEVEL = 'error'; });

describe('ARC-09-C177 — the ACL wording decides before the constraint pattern', () => {
  it('the rc.3 text on a 403 is DELETE_ACL_DENIED, with the ACL remedy and the detail', async () => {
    const error = await deleteRefused(403, 'Operation Failed', ACL_DELETE);
    expect(error.code).toBe('DELETE_ACL_DENIED');
    expect(error.message).toMatch(/permission denied by ServiceNow access control \(ACL\)/);
    expect(error.message).toContain(ACL_DELETE);
    expect(error.message).not.toMatch(/dependent records/);
  });

  it('the same text on a 400 is still DELETE_ACL_DENIED: the wording decides, not the status', async () => {
    const error = await deleteRefused(400, 'Operation Failed', ACL_DELETE);
    expect(error.code).toBe('DELETE_ACL_DENIED');
  });

  it('control: a reference block on a 403 stays DELETE_CONSTRAINT', async () => {
    const error = await deleteRefused(403, 'Operation Failed', 'Record is referenced by task.cmdb_ci and cannot be deleted');
    expect(error.code).toBe('DELETE_CONSTRAINT');
    expect(error.message).toMatch(/dependent records/);
  });

  it('control: a cascade rule is still a constraint', async () => {
    const error = await deleteRefused(403, 'Operation Failed', 'Delete blocked by a cascade rule on a child record');
    expect(error.code).toBe('DELETE_CONSTRAINT');
  });
});
