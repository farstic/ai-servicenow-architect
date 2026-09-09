import { beforeAll, beforeEach } from 'vitest';
import { enterInstance } from '../src/servicenow/context.js';
import { expandPreset } from '../src/utils/permissions.js';
import { currentSuitePreset } from './helpers/preset.js';

beforeAll(() => {
  process.env.SERVICENOW_INSTANCE_URL = 'https://test.service-now.com';
});

/**
 * A FIXED runtime for every test — `pdi-developer`, not a live view of `process.env`.
 *
 * ARC-04-S03 needed the env-view because seven dispatcher suites set `process.env
 * .WRITE_ENABLED` in their own hooks to reach a write path. ARC-04-S06 removed those
 * assertions: `tests/contract.test.ts` (a) now asserts the same property for all 397 tools
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
});
