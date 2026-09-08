import { describe, expect, it } from 'vitest';
import { dispatchUpdateSetAction } from '../../src/tools/updateset.js';
import { FakeRestClient } from '../helpers/fake-rest.js';
import { withPreset } from '../helpers/preset.js';
import { runWithInstance, FLAG_NAMES, type Flags, type InstanceRuntime } from '../../src/servicenow/context.js';
import { expandPreset } from '../../src/utils/permissions.js';
import type { ServiceNowError } from '../../src/utils/errors.js';

withPreset('pdi-developer');

/**
 * §2.2, the four-step capture, asserted on the REQUEST SEQUENCE rather than the return value.
 *
 * The bug this closes (P-33) is instructive: `snow_us_active_update_set_ensure` took ANY set
 * with `state=in progress` and no user filter, so on a shared instance it returned whoever
 * had opened one last and the engagement's objects landed in a stranger's update set. It then
 * set `is_default: true`, which does nothing for REST capture at all — that is
 * `sys_user_preference` `name=sys_update_set` (platform field notes, section 1). Both halves
 * were wrong and neither was visible in a return value, which is why these tests read the
 * calls the tool made.
 */
const FIXTURE_USER = 'fixture.user';
const USER_SYS_ID = 'u1000000000000000000000000000001';
const SET_SYS_ID = 'a1000000000000000000000000000001';
const PREF_SYS_ID = 'p1000000000000000000000000000001';

const openSet = {
  sys_id: SET_SYS_ID, name: 'ENG-123 story 4', state: 'in progress', application: 'Global',
};

function base(over: Partial<ConstructorParameters<typeof FakeRestClient>[0]> = {}) {
  return new FakeRestClient({
    username: FIXTURE_USER,
    records: { [`sys_update_set/${SET_SYS_ID}`]: openSet },
    queries: { [`sys_user?user_name=${FIXTURE_USER}`]: [{ sys_id: USER_SYS_ID, user_name: FIXTURE_USER }] },
    ...over,
  });
}

const flags = (over: Partial<Flags> = {}): Flags =>
  Object.fromEntries(FLAG_NAMES.map((f) => [f, over[f] ?? 'false'])) as Flags;

async function call(client: FakeRestClient, name: string, args: Record<string, unknown>, f = expandPreset('pdi-developer'), preset = 'pdi-developer') {
  const rt: InstanceRuntime = {
    label: 'pdi', url: 'https://dev1.service-now.com', environment: 'pdi', preset,
    flags: f, effectiveFlags: f, toolPackage: 'full', maxRecords: 100, prodWriteAck: false,
    client: {} as InstanceRuntime['client'], warnings: [],
  };
  return runWithInstance(rt, () => dispatchUpdateSetAction(client.asClient(), name, args));
}

describe('criterion 1 - snow_us_capture_target_set issues exactly four requests', () => {
  it('with an existing preference: GET set, GET user, GET preference, PATCH preference', async () => {
    const client = base({
      queries: {
        [`sys_user?user_name=${FIXTURE_USER}`]: [{ sys_id: USER_SYS_ID, user_name: FIXTURE_USER }],
        [`sys_user_preference?user=${USER_SYS_ID}^name=sys_update_set`]: [{ sys_id: PREF_SYS_ID, value: 'old' }],
      },
    });
    const r = await call(client, 'snow_us_capture_target_set', { update_set_sys_id: SET_SYS_ID }) as Record<string, unknown>;

    expect(client.sequence).toEqual([
      `get sys_update_set:${SET_SYS_ID}`,
      `query sys_user:user_name=${FIXTURE_USER}`,
      `query sys_user_preference:user=${USER_SYS_ID}^name=sys_update_set`,
      `update sys_user_preference:${PREF_SYS_ID}`,
    ]);
    expect(client.calls[3].data).toEqual({ value: SET_SYS_ID });
    expect(r.action).toBe('updated');
    expect(r.preference_sys_id).toBe(PREF_SYS_ID);
    expect(r.verify_with).toBe('snow_us_update_set_preview');
  });

  it('with no preference: the fourth call is a POST carrying name, value and type', async () => {
    const client = base({
      queries: {
        [`sys_user?user_name=${FIXTURE_USER}`]: [{ sys_id: USER_SYS_ID, user_name: FIXTURE_USER }],
        // no preference row
      },
      created: { sys_user_preference: { sys_id: PREF_SYS_ID } },
    });
    const r = await call(client, 'snow_us_capture_target_set', { update_set_sys_id: SET_SYS_ID }) as Record<string, unknown>;

    expect(client.sequence[3]).toBe('create sys_user_preference');
    expect(client.calls[3].data).toEqual({
      user: USER_SYS_ID, name: 'sys_update_set', value: SET_SYS_ID, type: 'string',
    });
    expect(r.action).toBe('created');
  });

  it('a missing update_set_sys_id is refused before any request', async () => {
    const client = base();
    await expect(call(client, 'snow_us_capture_target_set', {})).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(client.sequence).toEqual([]);
  });

  it('an update set that does not exist is NOT_FOUND after one request', async () => {
    const client = base({ records: {} });
    await expect(call(client, 'snow_us_capture_target_set', { update_set_sys_id: SET_SYS_ID }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(client.sequence).toEqual([`get sys_update_set:${SET_SYS_ID}`]);
  });

  it('an account that cannot be resolved in sys_user is INSUFFICIENT_PRIVILEGES, not a flag problem', async () => {
    const client = base({ queries: {} });
    await expect(call(client, 'snow_us_capture_target_set', { update_set_sys_id: SET_SYS_ID }))
      .rejects.toMatchObject({ code: 'INSUFFICIENT_PRIVILEGES' });
    // It stopped at the user lookup: no preference was touched.
    expect(client.sequence.some((c) => c.includes('sys_user_preference'))).toBe(false);
  });
});

describe('criterion 2 - a completed update set is refused, and no preference is written', () => {
  it('INVALID_REQUEST naming the state, after exactly one request', async () => {
    const client = base({
      records: { [`sys_update_set/${SET_SYS_ID}`]: { ...openSet, state: 'complete' } },
    });
    try {
      await call(client, 'snow_us_capture_target_set', { update_set_sys_id: SET_SYS_ID });
      throw new Error('expected a refusal');
    } catch (e) {
      expect((e as ServiceNowError).code).toBe('INVALID_REQUEST');
      expect((e as ServiceNowError).message).toContain('is not in progress (state=complete)');
    }
    expect(client.sequence).toEqual([`get sys_update_set:${SET_SYS_ID}`]);
  });
});

describe('criterion 3 - ensure requires a name and scopes to the caller', () => {
  it('without a name it refuses, and names what to pass', async () => {
    const client = base();
    try {
      await call(client, 'snow_us_active_update_set_ensure', {});
      throw new Error('expected a refusal');
    } catch (e) {
      expect((e as ServiceNowError).code).toBe('INVALID_REQUEST');
      expect((e as ServiceNowError).message).toContain('the update set name the engagement uses');
    }
    expect(client.sequence).toEqual([]);
  });

  it('the query carries both the name and sys_created_by=<username>', async () => {
    const client = base({ queries: {} });
    await call(client, 'snow_us_active_update_set_ensure', { name: 'ENG-123 story 4' });
    const q = client.calls[0].arg ?? '';
    expect(q).toContain('name=ENG-123 story 4');
    expect(q).toContain('state=in progress');
    expect(q).toContain(`sys_created_by=${FIXTURE_USER}`);
  });

  it("another user's in-progress set with the SAME name is not returned", async () => {
    // Two rows exist on the instance; only the caller's is addressable, because the query
    // includes sys_created_by. The fixture keys on the exact query, so a tool that dropped
    // the user filter would look up a key that does not exist and find nothing — which would
    // pass a weaker assertion. Hence the explicit check on the query string above, and the
    // foreign row keyed under the unfiltered query here.
    const client = base({
      queries: {
        'sys_update_set?name=ENG-123 story 4^state=in progress': [
          { sys_id: 'foreign', name: 'ENG-123 story 4' },
        ],
        [`sys_update_set?name=ENG-123 story 4^state=in progress^sys_created_by=${FIXTURE_USER}`]: [],
      },
    });
    const r = await call(client, 'snow_us_active_update_set_ensure', { name: 'ENG-123 story 4' }) as Record<string, unknown>;
    expect(r.action).toBe('created');
    expect(JSON.stringify(r)).not.toContain('foreign');
  });

  it('an existing set of the caller is returned, and points at the next step', async () => {
    const client = base({
      queries: {
        [`sys_update_set?name=ENG-123 story 4^state=in progress^sys_created_by=${FIXTURE_USER}`]:
          [{ sys_id: SET_SYS_ID, name: 'ENG-123 story 4' }],
      },
    });
    const r = await call(client, 'snow_us_active_update_set_ensure', { name: 'ENG-123 story 4' }) as Record<string, unknown>;
    expect(r.action).toBe('existing_found');
    expect(r.next).toBe('snow_us_capture_target_set { update_set_sys_id }');
    expect(client.sequence).toEqual([
      `query sys_update_set:name=ENG-123 story 4^state=in progress^sys_created_by=${FIXTURE_USER}`,
    ]);
  });

  it('a created set carries NO is_default — it is a UI flag and does not affect REST capture', async () => {
    const client = base({ queries: {} });
    await call(client, 'snow_us_active_update_set_ensure', { name: 'ENG-123 story 4', description: 'd' });
    const created = client.calls.find((c) => c.op === 'create');
    expect(created?.data).toEqual({ name: 'ENG-123 story 4', description: 'd', state: 'in progress' });
    expect(Object.keys(created?.data ?? {})).not.toContain('is_default');
  });
});

describe('criterion 5 - neither response carries the username', () => {
  it('capture_target_set', async () => {
    const client = base({
      queries: {
        [`sys_user?user_name=${FIXTURE_USER}`]: [{ sys_id: USER_SYS_ID, user_name: FIXTURE_USER }],
        [`sys_user_preference?user=${USER_SYS_ID}^name=sys_update_set`]: [{ sys_id: PREF_SYS_ID }],
      },
    });
    const r = await call(client, 'snow_us_capture_target_set', { update_set_sys_id: SET_SYS_ID });
    const json = JSON.stringify(r);
    expect(json).not.toContain(FIXTURE_USER);
    // Not empty: a grep that passes because the tool returned nothing proves nothing.
    expect(JSON.parse(json).user_sys_id).toBe(USER_SYS_ID);
  });

  it('ensure', async () => {
    const client = base({ queries: {} });
    const r = await call(client, 'snow_us_active_update_set_ensure', { name: 'ENG-123 story 4' });
    const json = JSON.stringify(r);
    expect(json).not.toContain(FIXTURE_USER);
    expect(JSON.parse(json).action).toBe('created');
  });
});

describe('criterion 6 - the gates', () => {
  it('capture_target_set under read-only is WRITE_NOT_ENABLED', async () => {
    const client = base();
    await expect(call(client, 'snow_us_capture_target_set', { update_set_sys_id: SET_SYS_ID },
      expandPreset('read-only'), 'read-only')).rejects.toMatchObject({ code: 'WRITE_NOT_ENABLED' });
    expect(client.sequence).toEqual([]);
  });

  it('ensure under WRITE-only is SCRIPTING_NOT_ENABLED', async () => {
    const client = base();
    await expect(call(client, 'snow_us_active_update_set_ensure', { name: 'x' },
      flags({ WRITE_ENABLED: 'true' }))).rejects.toMatchObject({ code: 'SCRIPTING_NOT_ENABLED' });
    expect(client.sequence).toEqual([]);
  });

  it('capture_target_set passes the gate under pdi-developer', async () => {
    const client = base({
      queries: {
        [`sys_user?user_name=${FIXTURE_USER}`]: [{ sys_id: USER_SYS_ID, user_name: FIXTURE_USER }],
        [`sys_user_preference?user=${USER_SYS_ID}^name=sys_update_set`]: [{ sys_id: PREF_SYS_ID }],
      },
    });
    await call(client, 'snow_us_capture_target_set', { update_set_sys_id: SET_SYS_ID });
    expect(client.sequence.length).toBe(4);
  });
});
