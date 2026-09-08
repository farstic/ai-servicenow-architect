import { describe, expect, it } from 'vitest';
import { collectToolCatalog, routeToolInvocation } from '../../src/tools/index.js';
import { runWithInstance, FLAG_NAMES, type Flags, type InstanceRuntime } from '../../src/servicenow/context.js';
import { expandPreset } from '../../src/utils/permissions.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

/**
 * The SCRIPTING gate split: SCRIPTING means *writing* those objects, not reading them.
 *
 * The families are derived from the REGISTERED CATALOGUE rather than from a list written
 * here. A hand-written list would pass forever while a new `snow_scr_*` tool quietly shipped
 * ungated — the test would not be wrong, it would simply not be looking. Every registered
 * name in the two families must be classified below, and an unclassified one FAILS.
 */
const MOCK_CLIENT_CALL = 'MOCK_CLIENT_CALL';

/** Every client method throws a sentinel, so "reached the client" is observable. */
const throwingClient = new Proxy({}, {
  get: () => () => { throw Object.assign(new Error('client reached'), { code: MOCK_CLIENT_CALL }); },
}) as unknown as ServiceNowClient;

/** Mutating: needs SCRIPTING. Everything else in the two families is a read. */
const WRITES = new Set([
  'snow_scr_business_rule_add', 'snow_scr_business_rule_modify',
  'snow_scr_script_include_add', 'snow_scr_script_include_modify',
  'snow_scr_client_script_add', 'snow_scr_client_script_modify',
  'snow_scr_changeset_commit', 'snow_scr_changeset_publish',
  'snow_scr_ui_policy_add',
  'snow_scr_ui_action_add', 'snow_scr_ui_action_modify',
  'snow_scr_acl_add', 'snow_scr_acl_modify',
  'snow_us_update_set_add', 'snow_us_update_set_switch', 'snow_us_update_set_complete',
  'snow_us_active_update_set_ensure',
]);

const READS = new Set([
  'snow_scr_business_rules_index', 'snow_scr_business_rule_read',
  'snow_scr_script_includes_index', 'snow_scr_script_include_read',
  'snow_scr_client_scripts_index', 'snow_scr_client_script_read',
  'snow_scr_changesets_index', 'snow_scr_changeset_read',
  'snow_scr_ui_policies_index', 'snow_scr_ui_policy_read',
  'snow_scr_ui_actions_index', 'snow_scr_ui_action_read',
  'snow_scr_acls_index', 'snow_scr_acl_read',
  'snow_us_current_update_set_read', 'snow_us_update_sets_index',
  'snow_us_update_set_preview',
  // Reads sys_update_set / sys_update_xml and returns a summary. It used to require
  // SCRIPTING, which made exporting an update set for review need a write flag.
  'snow_us_update_set_export',
]);

const family = (n: string) => n.startsWith('snow_scr_') || n.startsWith('snow_us_');
const registered = collectToolCatalog().map((t) => t.name).filter(family).sort();

function runtime(flags: Flags, preset = 'custom'): InstanceRuntime {
  return {
    label: 'pdi', url: 'https://dev1.service-now.com', environment: 'pdi', preset,
    flags, effectiveFlags: flags, toolPackage: 'full', maxRecords: 100, prodWriteAck: false,
    client: {} as InstanceRuntime['client'], warnings: [],
  };
}

const allFalse = Object.fromEntries(FLAG_NAMES.map((f) => [f, 'false'])) as Flags;
const writeOnly = { ...allFalse, WRITE_ENABLED: 'true' } as Flags;

/** The code a call produces: a gate code, the sentinel, or whatever validation threw. */
async function codeFor(name: string, flags: Flags, preset = 'custom'): Promise<string> {
  return runWithInstance(runtime(flags, preset), async () => {
    try {
      await routeToolInvocation(throwingClient, name, {});
      return 'RETURNED';
    } catch (e) {
      return String((e as { code?: string }).code ?? 'NO_CODE');
    }
  });
}

/**
 * A tool that validates its arguments before touching the client reports INVALID_REQUEST
 * rather than the sentinel. Both mean the same thing here — the gate let it through — and
 * conflating them is safe precisely because a gate failure has its own distinct code.
 */
const PASSED_THE_GATE = [MOCK_CLIENT_CALL, 'INVALID_REQUEST', 'RETURNED', 'NO_CODE'];

describe('the classification is complete — a new tool cannot escape the split', () => {
  it('every registered snow_scr_* / snow_us_* name is classified as a read or a write', () => {
    const unclassified = registered.filter((n) => !WRITES.has(n) && !READS.has(n));
    expect(unclassified).toEqual([]);
    expect(registered.length).toBe(WRITES.size + READS.size);
  });

  it('no classified name has disappeared from the catalogue', () => {
    // The other direction: a rename would otherwise leave a stale entry asserting nothing.
    const known = new Set(registered);
    expect([...WRITES, ...READS].filter((n) => !known.has(n))).toEqual([]);
  });

  it('prints the derived table', () => {
    const rows = registered.map((n) => `${WRITES.has(n) ? 'write' : 'read '}  ${n}`);
    console.log(`\n    ${registered.length} tools in the two families:\n    ${rows.join('\n    ')}\n`);
    expect(rows.length).toBeGreaterThan(30);
  });
});

describe('criterion 2 - all flags false', () => {
  it.each([...READS].sort())('read %s reaches the client', async (name) => {
    expect(PASSED_THE_GATE).toContain(await codeFor(name, allFalse, 'read-only'));
  });

  it.each([...WRITES].sort())('write %s is refused with SCRIPTING_NOT_ENABLED', async (name) => {
    // WRITE is false too, and the composite gate reports WRITE first when WRITE is missing —
    // the pre-existing ordering, kept so an existing client parsing codes sees no change.
    expect(await codeFor(name, allFalse, 'read-only')).toBe('WRITE_NOT_ENABLED');
  });
});

describe('criterion 2 - WRITE_ENABLED alone', () => {
  it.each([...WRITES].sort())('write %s is still refused, now naming SCRIPTING', async (name) => {
    expect(await codeFor(name, writeOnly)).toBe('SCRIPTING_NOT_ENABLED');
  });

  it.each([...READS].sort())('read %s is unaffected', async (name) => {
    expect(PASSED_THE_GATE).toContain(await codeFor(name, writeOnly));
  });
});

describe('criterion 2 - pdi-developer', () => {
  const pdi = expandPreset('pdi-developer');

  it.each(registered)('%s reaches the client', async (name) => {
    expect(PASSED_THE_GATE).toContain(await codeFor(name, pdi, 'pdi-developer'));
  });
});

describe('criterion 1 - the refusal names the instance and a preset that would work', () => {
  it('script_include_add under read-only', async () => {
    await runWithInstance(runtime(expandPreset('read-only'), 'read-only'), async () => {
      try {
        await routeToolInvocation(throwingClient, 'snow_scr_script_include_add', {});
        throw new Error('expected a refusal');
      } catch (e) {
        const err = e as { code?: string; message?: string };
        expect(err.code).toBe('WRITE_NOT_ENABLED');
        expect(err.message).toContain('for instance "pdi" (preset read-only)');
        expect(err.message).toContain('./snowarch instance set-preset pdi pdi-developer');
      }
    });
  });

  it('and the same tool passes the gate under pdi-developer', async () => {
    expect(PASSED_THE_GATE).toContain(
      await codeFor('snow_scr_script_include_add', expandPreset('pdi-developer'), 'pdi-developer'),
    );
  });
});

describe('criterion 3 - ATF is exec-gated only (unchanged, asserted)', () => {
  const atfTools = collectToolCatalog().map((t) => t.name).filter((n) => n.startsWith('snow_atf_'));
  const EXEC = ['snow_atf_atf_test_exec', 'snow_atf_atf_suite_exec'];
  const noAtf = { ...expandPreset('pdi-developer'), ATF_ENABLED: 'false' } as Flags;

  it.each(EXEC)('%s is refused without ATF', async (name) => {
    expect(await codeFor(name, noAtf, 'custom')).toBe('ATF_NOT_ENABLED');
  });

  it.each(EXEC)('%s passes with ATF', async (name) => {
    expect(PASSED_THE_GATE).toContain(await codeFor(name, expandPreset('pdi-developer'), 'pdi-developer'));
  });

  it.each(atfTools.filter((n) => !EXEC.includes(n)))('%s is ungated', async (name) => {
    expect(PASSED_THE_GATE).toContain(await codeFor(name, noAtf, 'custom'));
  });
});

describe('criterion 4 - every snow_na_* tool is licence-gated (unchanged, asserted)', () => {
  const naTools = collectToolCatalog().map((t) => t.name).filter((n) => n.startsWith('snow_na_'));

  it('there are some to assert about', () => { expect(naTools.length).toBeGreaterThan(0); });

  it.each(naTools)('%s is refused under pdi-developer', async (name) => {
    expect(await codeFor(name, expandPreset('pdi-developer'), 'pdi-developer')).toBe('NOW_ASSIST_NOT_ENABLED');
  });
});
