import { beforeAll, beforeEach } from 'vitest';
import { enterEnvInstance } from './helpers/instance.js';

beforeAll(() => {
  process.env.SERVICENOW_INSTANCE_URL = 'https://test.service-now.com';
});

/**
 * Enter an instance before every test, built from the environment as it stands at that
 * moment. ARC-04-S03 moved the permission flags from `process.env` to the addressed
 * instance, so a dispatcher test that sets `process.env.WRITE_ENABLED` inside its own
 * `beforeEach` needs a runtime carrying that value — otherwise every gate throws
 * NO_INSTANCE_CONFIGURED and the test is measuring the harness, not the tool.
 *
 * Ordering: this file's hook runs before a suite's own `beforeEach`, so a test that sets
 * the variable in its body re-enters explicitly via `enterEnvInstance()`.
 */
beforeEach(() => {
  enterEnvInstance();
});
