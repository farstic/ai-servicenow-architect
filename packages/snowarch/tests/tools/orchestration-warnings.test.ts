import { describe, expect, it } from 'vitest';
import { routeToolInvocation } from '../../src/tools/index.js';
import { FakeRestClient } from '../helpers/fake-rest.js';
import { withPreset } from '../helpers/preset.js';
import { runWithInstance, type Flags, type InstanceRuntime } from '../../src/servicenow/context.js';
import { ServiceNowError } from '../../src/utils/errors.js';
import { expandPreset } from '../../src/utils/permissions.js';

withPreset('full');

/**
 * ARC-09-C100 - what `snow_orch_playbook_exec` does with a write that stored a cut value.
 *
 * Before: a step that wrote a cut value was `executed` with nothing on it. The warning went to the
 * PLAYBOOK's result, with no sign of which step wrote it, and `on_error: 'stop'` (the default) ran on
 * to the next step, which typically builds on the record that was just written cut.
 *
 * The ruling (stated in the plan row and the PR): a step whose writes stored a cut value, or whose
 * result carries a warning of its own, HALTS the playbook under `on_error: 'stop'`. `stop` means
 * "do not go on past a step that did not do what was asked"; a write that stored less than it was sent
 * did not, and nothing in the playbook can take it back. `continue` and `skip` go on, with the warning
 * on the step. Both are in the test names so a reader can see what was decided.
 */
const LONG = 'abcdefghij';

function runtime(): InstanceRuntime {
  const flags: Flags = expandPreset('full');
  return {
    label: 'pdi', url: 'https://dev1.service-now.com', environment: 'pdi', preset: 'full',
    flags, effectiveFlags: flags, toolPackage: 'full', maxRecords: 100, prodWriteAck: false,
    client: {} as InstanceRuntime['client'], warnings: [],
  };
}

const add = (table: string, name: string, on_error?: string) => ({
  tool_name: 'snow_core_record_add', args_template: { table, fields: { name } }, ...(on_error ? { on_error } : {}),
});

/** u_cut stores 5 characters of what it is sent; u_whole stores what it is sent. */
const created = { u_cut: { sys_id: 'c1', name: 'abcde' }, u_whole: { sys_id: 'w1', name: 'ok' } };

/** The writes only: settling a step reads the dictionary, which is a query and not what is being counted. */
const writes = (fake: FakeRestClient): string[] => fake.sequence.filter((x) => x.startsWith('create'));

async function run(steps: unknown[], fake = new FakeRestClient({ created })) {
  const result = await runWithInstance(runtime(), () => routeToolInvocation(fake.asClient(), 'snow_orch_playbook_exec',
    { playbook: { name: 'p', steps }, dry_run: false }));
  return { result: result as Record<string, any>, fake };
}

describe('ARC-09-C100 - a cut write in a playbook step', () => {
  it('under the default on_error the playbook HALTS after that step, and says where and why', async () => {
    const { result, fake } = await run([add('u_cut', LONG), add('u_whole', 'ok')]);
    expect(result.steps).toHaveLength(1);
    expect(result.halted_at_step).toBe(0);
    expect(result.halt_reason).toMatch(/stored a cut value|warning/i);
    expect(writes(fake)).toEqual(['create u_cut']);              // the second step never ran
  });

  it('the step carries the warning, and it names the step', async () => {
    const { result } = await run([add('u_cut', LONG)]);
    const step = result.steps[0];
    expect(step.status).toBe('executed');                         // the write happened; the step says so
    expect(step.warnings).toHaveLength(1);
    expect(step.warnings[0]).toMatchObject({ code: 'VALUE_TRUNCATED', table: 'u_cut', field: 'name', step: 0, tool: 'snow_core_record_add' });
  });

  it('the playbook result still carries the warnings once, tagged with their step (the audit trail reads this key)', async () => {
    const { result } = await run([add('u_cut', LONG)]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatchObject({ table: 'u_cut', step: 0 });
  });

  it('on_error "continue" goes on, with the warning on the step that wrote it and not on the next', async () => {
    const { result, fake } = await run([add('u_cut', LONG, 'continue'), add('u_whole', 'ok')]);
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].warnings).toHaveLength(1);
    expect(result.steps[1].warnings).toBeUndefined();
    expect(result.halted_at_step).toBeUndefined();
    expect(writes(fake)).toEqual(['create u_cut', 'create u_whole']);
    expect(result.warnings).toHaveLength(1);
  });

  it('on_error "skip" goes on as well', async () => {
    const { result } = await run([add('u_cut', LONG, 'skip'), add('u_whole', 'ok')]);
    expect(result.steps).toHaveLength(2);
    expect(result.halted_at_step).toBeUndefined();
  });

  it('a playbook with no cut write has no warnings anywhere and does not halt (the control)', async () => {
    const { result } = await run([add('u_whole', 'ok'), add('u_whole', 'ok')]);
    expect(result.steps).toHaveLength(2);
    expect(result.steps.every((s: Record<string, unknown>) => s.warnings === undefined)).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(result, 'warnings')).toBe(false);
    expect(result.halted_at_step).toBeUndefined();
    expect(result.halt_reason).toBeUndefined();
  });

  it('a later step\'s cut is attributed to THAT step, after an earlier clean one', async () => {
    const { result } = await run([add('u_whole', 'ok'), add('u_cut', LONG, 'continue'), add('u_whole', 'ok')]);
    expect(result.steps.map((s: Record<string, unknown>) => s.warnings === undefined)).toEqual([true, false, true]);
    expect(result.steps[1].warnings[0]).toMatchObject({ step: 1 });
    expect(result.warnings[0]).toMatchObject({ step: 1, table: 'u_cut' });
  });

  it('a step that wrote a cut value and then FAILED is an error step that still carries the warning', async () => {
    class AclRefuses extends FakeRestClient {
      override async createRecord(table: string, data: Record<string, unknown>) {
        if (table === 'sys_security_acl') throw new ServiceNowError('User Not Authorized', 'INSUFFICIENT_PRIVILEGES');
        return super.createRecord(table, data);
      }
    }
    const fake = new AclRefuses({ created: { sys_ai_agent: { sys_id: 'ag1', name: 'x'.repeat(40) } } });
    const { result } = await run([
      { tool_name: 'snow_ai_ai_agent_add', args_template: { name: 'x'.repeat(44), description: 'd', capabilities: ['a'] }, on_error: 'continue' },
    ], fake);
    expect(result.steps[0].status).toBe('error');
    expect(result.steps[0].warnings).toHaveLength(1);
    expect(result.steps[0].warnings[0]).toMatchObject({ table: 'sys_ai_agent', field: 'name', step: 0 });
  });

  it('a warning the TOOL put on its own result halts a stop playbook too, and goes on under continue', async () => {
    // The platform answered without echoing `filter_condition`, so the Business Rule tool says so
    // (FIELD_NOT_STORED, ARC-09-C92). That is not a cut value; it is the same kind of "did not do
    // what was asked", and `stop` treats it the same way.
    const rule = (on_error?: string) => ({
      tool_name: 'snow_scr_business_rule_add',
      args_template: { name: 'Rule', table: 'incident', when: 'before', script: 'gs.info(1);', filter_condition: 'active=true' },
      ...(on_error ? { on_error } : {}),
    });
    const created2 = { ...created, sys_script: { sys_id: 'b1', name: 'Rule', advanced: 'true' } };
    const stopped = await run([rule(), add('u_whole', 'ok')], new FakeRestClient({ created: created2 }));
    expect(stopped.result.steps[0].result.warnings[0]).toMatchObject({ code: 'FIELD_NOT_STORED' });
    expect(stopped.result.steps[0].warnings).toBeUndefined();             // not a cut: it stays where the tool put it
    expect(stopped.result.halted_at_step).toBe(0);
    expect(stopped.result.halt_reason).toMatch(/returned a warning/);
    expect(stopped.result.steps).toHaveLength(1);

    const went = await run([rule('continue'), add('u_whole', 'ok')], new FakeRestClient({ created: created2 }));
    expect(went.result.steps).toHaveLength(2);
    expect(went.result.halted_at_step).toBeUndefined();
  });

  it('a dry run is unchanged: nothing is written, nothing warns', async () => {
    const fake = new FakeRestClient({ created });
    const result = await runWithInstance(runtime(), () => routeToolInvocation(fake.asClient(), 'snow_orch_playbook_exec',
      { playbook: { name: 'p', steps: [add('u_cut', LONG)] }, dry_run: true })) as Record<string, any>;
    expect(result.steps[0].status).toBe('dry_run');
    expect(fake.sequenceWithoutPrecheck).toEqual([]);
  });
});

describe('ARC-09-C100 - the bulk path (`snow_deploy_cmdb_data_import` writes up to 50 records)', () => {
  it('fifty cut records come back as nine whole warnings and a roll-up of the other forty-one, from ONE dictionary read', async () => {
    const fake = new FakeRestClient({ created: { u_bulk: { sys_id: 'r1', name: 'abcde' } } });
    const result = await runWithInstance(runtime(), () => routeToolInvocation(fake.asClient(), 'snow_deploy_cmdb_data_import',
      { table: 'u_bulk', data: Array.from({ length: 50 }, () => ({ name: LONG })) })) as Record<string, any>;
    expect(result.processed).toBe(50);
    expect(result.warnings).toHaveLength(10);
    expect(result.warnings[9]).toMatchObject({ rollup: true, count: 41, table: 'u_bulk', fields: ['name'] });
    expect(fake.sequenceWithoutPrecheck.filter((x) => x.startsWith('query sys_dictionary'))).toHaveLength(1);
    // the records the caller asked for are still there, after the warnings
    expect(result.results).toHaveLength(50);
    expect(JSON.stringify(result).length - JSON.stringify(result.results).length).toBeLessThan(12000);
  });
});
