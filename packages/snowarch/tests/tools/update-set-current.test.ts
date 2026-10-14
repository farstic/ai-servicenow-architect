// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
import { describe, expect, it } from 'vitest';
import { dispatchUpdateSetAction } from '../../src/tools/updateset.js';
import { FakeRestClient } from '../helpers/fake-rest.js';
import { withPreset } from '../helpers/preset.js';
import { runWithInstance, type InstanceRuntime } from '../../src/servicenow/context.js';
import { expandPreset } from '../../src/utils/permissions.js';
import { ServiceNowError } from '../../src/utils/errors.js';

withPreset('pdi-developer');

/**
 * ARC-09-C128 — `snow_us_current_update_set_read` said it got "the currently active Update Set for the session",
 * and listed up to five update sets in progress on the whole instance, whoever opened them. The session's update
 * set is the authenticated user's `sys_user_preference` `name=sys_update_set`: what `snow_us_capture_target_set`
 * writes and what REST capture honours. The 2.0.12-rc.2 sitting had to read it by hand (R0). The tool now reads
 * it, and lists the in-progress sets as a separate field.
 */
const SESSION_SET = 'a1000000000000000000000000000001';
const OTHER_SET = 'c1000000000000000000000000000003';
const PREF_SYS_ID = 'd1000000000000000000000000000004';
const PREF_QUERY = 'sys_user_preference?user=javascript:gs.getUserID()^name=sys_update_set';
const IN_PROGRESS = 'sys_update_set?state=in progress';

async function read(client: FakeRestClient): Promise<Record<string, any>> {
  const f = expandPreset('pdi-developer');
  const rt: InstanceRuntime = {
    label: 'pdi', url: 'https://dev1.service-now.com', environment: 'pdi', preset: 'pdi-developer',
    flags: f, effectiveFlags: f, toolPackage: 'full', maxRecords: 100, prodWriteAck: false,
    client: {} as InstanceRuntime['client'], warnings: [],
  };
  return runWithInstance(rt, () => dispatchUpdateSetAction(client.asClient(), 'snow_us_current_update_set_read', {})) as
    Promise<Record<string, any>>;
}

describe('ARC-09-C128 - current_update_set_read reads the session\'s preference, not the first set in progress', () => {
  it('session_update_set is the set the preference names; the in-progress sets are a separate list', async () => {
    const client = new FakeRestClient({
      records: {
        [`sys_update_set/${SESSION_SET}`]: { sys_id: SESSION_SET, name: 'ENG-123 story 4', state: 'in progress', application: 'Global' },
      },
      queries: {
        [PREF_QUERY]: [{ sys_id: PREF_SYS_ID, value: SESSION_SET }],
        // Another user's set comes first in the instance's list: the session's is not the first in progress.
        [IN_PROGRESS]: [
          { sys_id: OTHER_SET, name: 'another user\'s set', state: 'in progress' },
          { sys_id: SESSION_SET, name: 'ENG-123 story 4', state: 'in progress' },
        ],
      },
    });
    const r = await read(client);
    expect(r.session_update_set).toEqual({
      sys_id: SESSION_SET, name: 'ENG-123 story 4', state: 'in progress', application: 'Global', found: true,
    });
    expect(r.preference_sys_id).toBe(PREF_SYS_ID);
    expect(r.in_progress_update_sets.map((s: Record<string, unknown>) => s.sys_id)).toEqual([OTHER_SET, SESSION_SET]);
    expect(r.in_progress_count).toBe(2);
  });

  it('with no preference, session_update_set is null and the in-progress list still comes back', async () => {
    const client = new FakeRestClient({ queries: { [IN_PROGRESS]: [{ sys_id: OTHER_SET, state: 'in progress' }] } });
    const r = await read(client);
    expect(r.session_update_set).toBeNull();
    expect(r.preference_sys_id).toBeNull();
    expect(r.in_progress_count).toBe(1);
  });

  it('a preference naming a set that does not exist says so, and the read does not fail', async () => {
    const client = new FakeRestClient({ queries: { [PREF_QUERY]: [{ sys_id: PREF_SYS_ID, value: OTHER_SET }] } });
    const r = await read(client);
    expect(r.session_update_set).toEqual({ sys_id: OTHER_SET, found: false });
    expect(r.in_progress_update_sets).toEqual([]);
  });

  it('the instance\'s NOT_FOUND for that set reads as found: false; any other error still fails the read', async () => {
    // The fake answers a missing record with an empty object; the real client turns a 404 into NOT_FOUND.
    class Answers extends FakeRestClient {
      constructor(private readonly code: ConstructorParameters<typeof ServiceNowError>[1]) {
        super({ queries: { [PREF_QUERY]: [{ sys_id: PREF_SYS_ID, value: OTHER_SET }] } });
      }
      override async getRecord(): Promise<Record<string, unknown>> {
        throw new ServiceNowError(`get failed (${this.code})`, this.code);
      }
    }
    expect((await read(new Answers('NOT_FOUND'))).session_update_set).toEqual({ sys_id: OTHER_SET, found: false });
    await expect(read(new Answers('INSUFFICIENT_PRIVILEGES'))).rejects.toMatchObject({ code: 'INSUFFICIENT_PRIVILEGES' });
  });

  it('a preference that names no sys_id, such as a hand-set "Default", reads as found: false, with no request for it', async () => {
    const client = new FakeRestClient({ queries: { [PREF_QUERY]: [{ sys_id: PREF_SYS_ID, value: 'Default' }] } });
    const r = await read(client);
    expect(r.session_update_set).toEqual({ sys_id: 'Default', found: false });
    // The real client's getRecord refuses a value that is not a sys_id with VALIDATION_ERROR, which is not NOT_FOUND
    // and would fail the whole read, so the tool must not ask for it at all (the architect's control on #414).
    expect(client.sequence).toEqual([
      'query sys_user_preference:user=javascript:gs.getUserID()^name=sys_update_set',
      'query sys_update_set:state=in progress',
    ]);
  });
});
