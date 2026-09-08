import { describe, expect, it } from 'vitest';
import { collectToolCatalog, routeToolInvocation } from '../../src/tools/index.js';
import { FakeRestClient } from '../helpers/fake-rest.js';
import { runWithInstance, FLAG_NAMES, type Flags, type InstanceRuntime } from '../../src/servicenow/context.js';
import { expandPreset } from '../../src/utils/permissions.js';
import { ERROR_CODES } from '../../src/errors/codes.js';
import type { ServiceNowError } from '../../src/utils/errors.js';

/**
 * The two retired script-execution tools.
 *
 * `snow_deploy_background_script_exec` POSTed to `/api/now/sp/background_script`, which 404s;
 * `snow_fluent_script_exec` wrapped the same absence through `/api/now/v1/batch`. Neither has a
 * supported REST endpoint on any instance, so neither can be fixed — only answered honestly.
 *
 * The recording fake is the point of this suite rather than a throwing proxy: the claim is not
 * "it threw" but "it threw WITHOUT contacting the instance". A stub that refused after firing a
 * request would leave a 404 in the instance's logs for every attempt, and a throwing proxy
 * cannot tell the two apart.
 */
const STUBS = ['snow_deploy_background_script_exec', 'snow_fluent_script_exec'] as const;

const flags = (over: Partial<Flags> = {}): Flags =>
  Object.fromEntries(FLAG_NAMES.map((f) => [f, over[f] ?? 'false'])) as Flags;

function runtime(f: Flags, preset: string): InstanceRuntime {
  return {
    label: 'pdi', url: 'https://dev1.service-now.com', environment: 'pdi', preset,
    flags: f, effectiveFlags: f, toolPackage: 'full', maxRecords: 100, prodWriteAck: false,
    client: {} as InstanceRuntime['client'], warnings: [],
  };
}

async function call(name: string, f: Flags, preset: string) {
  const client = new FakeRestClient({ username: 'fixture.user' });
  let code = 'RETURNED';
  let message = '';
  await runWithInstance(runtime(f, preset), async () => {
    try {
      await routeToolInvocation(client.asClient(), name, { script: 'gs.info("hi");' });
    } catch (e) {
      code = String((e as ServiceNowError).code ?? 'NO_CODE');
      message = String((e as ServiceNowError).message ?? '');
    }
  });
  return { code, message, sequence: client.sequence };
}

describe('criterion 1 - under full, both refuse without touching the instance', () => {
  it.each(STUBS)('%s returns UNSUPPORTED_ON_THIS_INSTANCE and records zero requests', async (name) => {
    const r = await call(name, expandPreset('full'), 'full');
    expect(r.code).toBe('UNSUPPORTED_ON_THIS_INSTANCE');
    expect(r.sequence).toEqual([]);
  });

  it.each(STUBS)('%s names the route that does work', async (name) => {
    const r = await call(name, expandPreset('full'), 'full');
    // A refusal with no alternative sends the user looking for a flag that does not exist.
    expect(r.message).toContain('Scripts - Background');
    expect(r.message).toContain('sys_script_fix');
  });
});

describe('criterion 1 - under read-only, the GATE refuses first', () => {
  it.each(STUBS)('%s reports a gate code, not the capability code', async (name) => {
    // Order matters. Reporting UNSUPPORTED first would tell a read-only user that the operation
    // is impossible, when what is actually true is that their preset forbids it — two different
    // things to do next.
    const r = await call(name, expandPreset('read-only'), 'read-only');
    expect(r.code).toMatch(/^(WRITE|SCRIPTING|FLUENT)_NOT_ENABLED$/);
    expect(r.sequence).toEqual([]);
  });

  it('background_script_exec specifically reports the SCRIPTING chain', async () => {
    expect((await call(STUBS[0], flags({ WRITE_ENABLED: 'true' }), 'custom')).code)
      .toBe('SCRIPTING_NOT_ENABLED');
  });
});

describe('they are still registered, and declared', () => {
  it.each(STUBS)('%s is in the catalogue', (name) => {
    // Removing the names would turn a clear refusal into UNKNOWN_TOOL, which reads as "you
    // spelled it wrong" and sends the caller looking for a typo that is not there.
    expect(collectToolCatalog().map((t) => t.name)).toContain(name);
  });

  it.each(STUBS)('%s says [Unsupported] in its description', (name) => {
    const tool = collectToolCatalog().find((t) => t.name === name)!;
    expect(tool.description).toContain('[Unsupported]');
  });

  it('the error code is in the registry with a remedy', () => {
    const entry = ERROR_CODES.find((c) => c.code === 'UNSUPPORTED_ON_THIS_INSTANCE');
    expect(entry).toBeDefined();
    expect(entry!.remedy.length).toBeGreaterThan(0);
  });
});
