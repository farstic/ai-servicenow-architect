import { afterEach, describe, expect, it } from 'vitest';
import { routeToolInvocation } from '../../src/tools/index.js';
import { initLicence, resetLicenceForTests } from '../../src/licence/session.js';
import { CORE_TOOLS_UNCONFIGURED } from '../../src/tools/status.js';
import { checkout, keysOf, pair } from './fixtures.js';

/**
 * ARC-11-C1, ruling R1 — "no licence = no access at all": under enforcement the refusal sits at the
 * router's entry, beside ARC-09-C121's argument check, so one place covers every call — reads, the
 * instance-free core tools, the capabilities read, reload and switch included.
 */
const KEYS = keysOf(pair(), pair());

afterEach(() => resetLicenceForTests());

const route = (name: string, args: Record<string, unknown> = {}) =>
  routeToolInvocation(null as never, name, args);

describe('ARC-11-C1 — the router refuses before anything else under enforcement', () => {
  it('refuses every instance-free core tool, and switch, with LICENCE_NOT_VALID', async () => {
    initLicence({ root: checkout(), env: { SNOW_LICENCE_ENFORCE: 'true' }, keys: KEYS });
    for (const name of [...CORE_TOOLS_UNCONFIGURED, 'snow_core_instance_switch', 'snow_core_records_query']) {
      await expect(route(name), name).rejects.toMatchObject({ code: 'LICENCE_NOT_VALID' });
    }
  });

  it('refuses before the argument check: a refused session learns nothing about a tool\'s arguments', async () => {
    initLicence({ root: checkout(), env: { SNOW_LICENCE_ENFORCE: 'true' }, keys: KEYS });
    await expect(route('snow_core_capabilities_read', { instance: 'other' })).rejects.toMatchObject({ code: 'LICENCE_NOT_VALID' });
  });

  it('refuses nothing when enforcement is off', async () => {
    initLicence({ root: checkout(), env: {}, keys: KEYS });
    await expect(route('snow_core_instances_index')).resolves.toBeDefined();
    await expect(route('snow_core_capabilities_read', { instance: 'other' })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
  });
});
