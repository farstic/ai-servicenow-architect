import type { PresetName } from '../../src/utils/permissions.js';

/**
 * Which preset this test FILE runs under. `tests/setup.ts` reads it.
 *
 * A module-level value rather than another `beforeEach`, because hook ordering between a
 * setup file and a test file is not something a suite should have to reason about — the
 * first attempt did exactly that and lost, silently, to the setup file's hook.
 *
 * Vitest gives each test file its own module registry, so this is per-file state.
 */
let suitePreset: PresetName = 'pdi-developer';

/** Call at the top of a suite whose tools need more than `pdi-developer` grants. */
export function withPreset(preset: PresetName): void {
  suitePreset = preset;
}

export function currentSuitePreset(): PresetName {
  return suitePreset;
}
