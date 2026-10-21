// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C184 — a date-time the server stamps is sent in the instance's internal format, in UTC.
 *
 * The owner's ITSM sweep on a Brazil-family PDI (patch 0, 2026-10-19): `snow_inc_incident_resolve` at about 06:31 UTC
 * stored `resolved_at` as `2026-10-19 00:00:00`. The tool sent `new Date().toISOString()`, and the instance kept only
 * the date: `calendar_stc` came out negative. The Table API takes an actual value in GMT unless the call asks for
 * display values (`c_TableAPI.md`, sysparm_input_display_value), and the internal format is `yyyy-MM-dd HH:mm:ss`
 * (`c_GlideDateTimeScoped.md`). Every tool that stamps a date-time sends that.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatchIncidentAction } from '../../src/tools/incident.js';
import { dispatchProblemAction } from '../../src/tools/problem.js';
import { dispatchReportingAction } from '../../src/tools/reporting.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const NOW = '2026-10-19T06:31:05.123Z';
const STAMP = '2026-10-19 06:31:05';
const ID = 'a'.repeat(32);

function fakeClient() {
  const updateRecord = vi.fn(async (_table: string, sysId: string, data: Record<string, unknown>) => ({ ...data, sys_id: sysId }));
  return { client: { updateRecord } as unknown as ServiceNowClient, updateRecord };
}
const sent = (fn: ReturnType<typeof vi.fn>, field: string): unknown => (fn.mock.calls[0][2] as Record<string, unknown>)[field];

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(NOW)); });
afterEach(() => { vi.useRealTimers(); });

describe('ARC-09-C184 — a stamped date-time is `yyyy-MM-dd HH:mm:ss` in UTC, never a date alone or an ISO string', () => {
  it('snow_inc_incident_resolve sends resolved_at with the time, and the read-back carries it', async () => {
    const { client, updateRecord } = fakeClient();
    const result = await dispatchIncidentAction(client, 'snow_inc_incident_resolve',
      { sys_id: ID, resolution_code: 'Other', resolution_notes: 'sweep test' });
    expect(sent(updateRecord, 'resolved_at')).toBe(STAMP);
    expect((result as Record<string, unknown>).resolved_at).toBe(STAMP);
  });

  it('snow_prb_problem_resolve sends resolved_at the same way', async () => {
    const { client, updateRecord } = fakeClient();
    await dispatchProblemAction(client, 'snow_prb_problem_resolve',
      { sys_id: ID, root_cause: 'a cause', resolution_notes: 'a fix' });
    expect(sent(updateRecord, 'resolved_at')).toBe(STAMP);
  });

  it('control: snow_rpt_scheduled_job_trigger already sends next_action in that format', async () => {
    const { client, updateRecord } = fakeClient();
    await dispatchReportingAction(client, 'snow_rpt_scheduled_job_trigger', { sys_id: ID });
    expect(sent(updateRecord, 'next_action')).toBe(STAMP);
  });
});
