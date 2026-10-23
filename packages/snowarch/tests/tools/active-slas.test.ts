// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C229 — what `snow_cat_active_slas_index` asks the instance for. It sent `stage!=complete^has_breached=false`.
 * No row holds `complete` (PN-25 records the six an instance's choice list holds, `completed` among them), so the stage
 * half kept finished and cancelled SLAs, and the breach half dropped the ones a service desk needs most: under the
 * default 2011 engine a breached SLA keeps the stage In Progress and runs on until its stop conditions are met
 * (`t_MoveFromThe2010ToThe2011Engine.md`), while one that completes or is cancelled becomes inactive
 * (`c_SLAProcessing.md`).
 *
 * The tool now asks for the two stages an active SLA is in, breached or not. A caller's filter goes in front with `^`,
 * and IN keeps the two stages one condition, so no OR binds across the caller's part.
 *
 * Every case runs through the router, as a caller meets the tool. The fetch mock REPEATS a lone last queued answer
 * (tests/helpers/fetch-mock.ts); each case queues one answer after the reset in beforeEach.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { respond, resetFetchMock, snFetchMockModule, type SnFetchState } from '../helpers/fetch-mock.js';
import { useLicensedSession } from '../helpers/licensed-session.js';

const http = vi.hoisted<SnFetchState>(() => ({ calls: [], queue: [] }));
vi.mock('../../src/servicenow/http.js', async () => snFetchMockModule(http));

useLicensedSession();

function setEnv() {
  process.env.SERVICENOW_INSTANCE_URL = 'https://dummy.service-now.com';
  process.env.SERVICENOW_AUTH_METHOD = 'basic';
  process.env.SERVICENOW_BASIC_USERNAME = 'd';
  process.env.SERVICENOW_BASIC_PASSWORD = 'd';
  process.env.LOG_LEVEL = 'error';
  delete process.env.MAX_RECORDS;
}

/** A breached SLA that is still running: the one the old filter dropped. */
const SLA = { sys_id: 'c'.repeat(32), stage: 'in_progress', has_breached: 'true' };

/** One answer from the instance. */
function answer(result: unknown): void {
  const body = JSON.stringify({ result });
  respond(http, {
    ok: true, status: 200, json: async () => JSON.parse(body), text: async () => body, headers: { get: () => null },
  });
}

/** A tool through the router, as a caller meets it. */
async function tool(name: string, args: Record<string, unknown>): Promise<Record<string, any>> {
  const { instanceManager } = await import('../../src/servicenow/instances.js');
  const { routeToolInvocation } = await import('../../src/tools/index.js');
  return routeToolInvocation(instanceManager.getClient(), name, args) as Promise<Record<string, any>>;
}

/** The table and the encoded query of the last request, as the instance receives them. */
function lastRequest(): { table: string | undefined; query: string | null } {
  const url = new URL(http.calls.at(-1)!.url);
  return { table: url.pathname.split('/').at(-1), query: url.searchParams.get('sysparm_query') };
}

beforeEach(() => { setEnv(); resetFetchMock(http); });
afterEach(() => vi.restoreAllMocks());

describe('ARC-09-C229 — snow_cat_active_slas_index asks for the Task SLAs still running', () => {
  it('with no filter, it asks for stage In Progress or Paused, breached or not', async () => {
    answer([SLA]);
    const r = await tool('snow_cat_active_slas_index', {});
    expect(lastRequest()).toEqual({ table: 'task_sla', query: 'stageINin_progress,paused' });
    expect(r).toEqual({ count: 1, slas: [SLA] });
  });

  it('a caller\'s filter goes in front of the stages, joined with ^', async () => {
    answer([SLA]);
    await tool('snow_cat_active_slas_index', { query: 'task.sys_class_name=incident' });
    expect(lastRequest()).toEqual({ table: 'task_sla', query: 'task.sys_class_name=incident^stageINin_progress,paused' });
  });

  it('the description says which Task SLAs it lists', async () => {
    const { catalogToolManifest } = await import('../../src/tools/catalog.js');
    expect(catalogToolManifest().find((t) => t.name === 'snow_cat_active_slas_index')?.description).toBe(
      'List active Task SLAs — stage In Progress or Paused, breached or not (each record\'s has_breached says which) — '
      + 'with an optional encoded-query filter.');
  });
});
