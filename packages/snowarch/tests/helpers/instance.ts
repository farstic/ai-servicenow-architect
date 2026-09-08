import { enterInstance, FLAG_NAMES, type Flags, type InstanceRuntime } from '../../src/servicenow/context.js';

/**
 * A runtime for the dispatcher tests.
 *
 * Those tests exercise TOOLS, not the flag source: they want "a session where write is
 * allowed" and used to get it by setting `process.env.WRITE_ENABLED`. Flags are now
 * per-instance, so this glue reads the same environment variables and builds a runtime from
 * them — the tests keep saying what they meant, and production keeps reading the store.
 *
 * The flag SOURCE is tested elsewhere and deliberately not here: `tests/tools/permissions
 * .test.ts` builds runtimes explicitly and asserts that `process.env` cannot reach a
 * store-defined instance, and the spawned-server probes assert it end to end.
 */
export function runtimeFromEnv(over: Partial<InstanceRuntime> = {}): InstanceRuntime {
  // A LIVE view of the environment, via getters, rather than a snapshot. Many dispatcher
  // tests set `process.env.WRITE_ENABLED` inside their own `beforeEach` or in the test
  // body — after this file's hook has already run — so a snapshot would be stale exactly
  // when it mattered, and the test would fail for a reason that has nothing to do with the
  // tool it is exercising.
  //
  // This is test glue and could not be production behaviour: reading the environment at
  // gate time is the process-global evaluation ARC-04-S03 removes. Production builds its
  // flags once, from the store, in InstanceManager.
  const flags = Object.defineProperties({} as Flags, Object.fromEntries(
    FLAG_NAMES.map((f) => [f, {
      enumerable: true,
      get: () => (process.env[f] === 'true' ? 'true' : 'false'),
    }]),
  ));
  return {
    label: 'test',
    url: process.env.SERVICENOW_INSTANCE_URL ?? 'https://test.service-now.com',
    environment: 'dev',
    preset: 'custom',
    flags,
    effectiveFlags: flags,
    toolPackage: 'full',
    maxRecords: 100,
    prodWriteAck: false,
    client: {} as InstanceRuntime['client'],
    warnings: [],
    ...over,
  };
}

/** Enter a runtime built from the current environment. Called per test by tests/setup.ts. */
export function enterEnvInstance(over: Partial<InstanceRuntime> = {}): InstanceRuntime {
  const rt = runtimeFromEnv(over);
  enterInstance(rt);
  return rt;
}
