// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { enterInstance } from '../src/servicenow/context.js';
import { resetColumnLimits, setDataPolicyCheckForTests } from '../src/servicenow/stored-values.js';
import { expandPreset } from '../src/utils/permissions.js';
import { currentSuitePreset } from './helpers/preset.js';
import { releaseLicenceFixture } from '../../../tools/snowarch/tests/helpers/licence-hook/index.mjs';

beforeAll(() => {
  process.env.SERVICENOW_INSTANCE_URL = 'https://test.service-now.com';
});

// ARC-11-C6 — the licence fixture a file's licensedEnv calls made (the hook, any state root), removed after the
// file. A vitest worker does not reliably reach the exit sweep that removes them under node:test.
afterAll(() => { releaseLicenceFixture(); });

/**
 * A FIXED runtime for every test — `pdi-developer`, not a live view of `process.env`.
 *
 * ARC-04-S03 needed the env-view because seven dispatcher suites set `process.env
 * .WRITE_ENABLED` in their own hooks to reach a write path. ARC-04-S06 removed those
 * assertions: `tests/contract.test.ts` (a) now asserts the same property for every tool
 * with explicit runtimes, instead of nine hand-picked ones through the environment.
 *
 * So the glue is gone, and with it the last place a test could make a gate answer to an
 * environment variable — which is the behaviour this ARC spent three stories removing.
 * A suite that needs different flags builds its own runtime, as contract.test.ts,
 * gate-split.test.ts and permissions.test.ts all do.
 */
beforeEach(() => {
  // The preset a suite declared with withPreset(), or pdi-developer. Read HERE rather than
  // entered by the suite itself, so there is exactly one place that enters a runtime and no
  // hook-ordering question between this file and a test file.
  const preset = currentSuitePreset();
  const flags = expandPreset(preset);
  enterInstance({
    label: 'test',
    url: 'https://test.service-now.com',
    environment: 'dev',
    preset,
    flags,
    effectiveFlags: flags,
    toolPackage: 'full',
    maxRecords: 100,
    prodWriteAck: false,
    client: {} as never,
    warnings: [],
  });
  // ARC-09-C97 remembers each instance's column limits, and every test runs on this one runtime: forget
  // them, so no test reads a limit that another test's fake answered.
  resetColumnLimits();
  // ARC-09-C183's data-policy reads are off for suites that count a write's requests; its own suite turns them on.
  setDataPolicyCheckForTests(false);
});
