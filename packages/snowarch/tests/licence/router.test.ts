// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
import { afterEach, describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { routeToolInvocation } from '../../src/tools/index.js';
import { initLicence, resetLicenceForTests } from '../../src/licence/session.js';
import { CORE_TOOLS_UNCONFIGURED } from '../../src/tools/status.js';
import { checkout, keysOf, licence, licenceText, pair, removeFixtureDirs } from './fixtures.js';

/**
 * ARC-11-C1, ruling R1 — "no licence = no access at all", on every build (ARC-11-C6): the refusal sits at the
 * router's entry, beside ARC-09-C121's argument check, so one place covers every call — reads, the
 * instance-free core tools, the capabilities read, reload and switch included.
 */
const primary = pair();
const KEYS = keysOf(primary, pair());

afterEach(() => { resetLicenceForTests(); removeFixtureDirs(); });

const route = (name: string, args: Record<string, unknown> = {}) =>
  routeToolInvocation(null as never, name, args);

describe('ARC-11-C1 and C6 — the router refuses before anything else, on every build', () => {
  it('refuses every instance-free core tool, and switch, with LICENCE_NOT_VALID', async () => {
    initLicence({ root: checkout(), keys: KEYS });
    for (const name of [...CORE_TOOLS_UNCONFIGURED, 'snow_core_instance_switch', 'snow_core_records_query']) {
      await expect(route(name), name).rejects.toMatchObject({ code: 'LICENCE_NOT_VALID' });
    }
  });

  it('refuses before the argument check: a refused session learns nothing about a tool\'s arguments', async () => {
    initLicence({ root: checkout(), keys: KEYS });
    await expect(route('snow_core_capabilities_read', { instance: 'other' })).rejects.toMatchObject({ code: 'LICENCE_NOT_VALID' });
  });

  it('answers under a live licence in force, and the argument check comes next', async () => {
    const root = checkout();
    writeFileSync(join(root, '.local', 'licence.json'), licenceText(licence(), primary));
    initLicence({ root, keys: KEYS });
    await expect(route('snow_core_instances_index')).resolves.toBeDefined();
    await expect(route('snow_core_capabilities_read', { instance: 'other' })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
  });
});
