// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-11-C6 step 2 — a licensed session for a test that calls the router in its own process.
 *
 * From 2.0.13 the router refuses every tool without a valid licence, whatever the environment says. A test
 * that calls `routeToolInvocation` in-process cannot take the hook `licensedEnv()` gives a spawned server:
 * the shipped keys module is already loaded in its process. It passes the keys instead, through
 * `initLicence`'s `keys` parameter, the way the licence suites do: a pair made here, the key list built from
 * it, and a live licence signed with it, in a checkout of its own.
 *
 * Enforcement takes no switch (ARC-11-C6), so a session that failed to license would refuse at once: the
 * helper checks the session it starts is ok, live and enforced.
 *
 * `useLicensedSession()` registers the hooks: the session starts before the file's first case, and is reset,
 * and its checkout removed, after the last. `afterAll` and not the exit handler, which a vitest worker does
 * not reliably reach (see `licence/fixtures.ts`).
 */
import { afterAll, beforeAll } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { initLicence, resetLicenceForTests } from '../../src/licence/session.js';
import { checkout, keysOf, licence, licenceText, pair, removeFixtureDirs } from '../licence/fixtures.js';

/** The fixture licence's id: the same as the spawned children's (`licensedEnv`), and no real licence's. */
export const SESSION_LICENCE_ID = 'LIC-2026-9000';

export function useLicensedSession(): void {
  beforeAll(() => {
    const primary = pair();
    const root = checkout('snowarch-licensed-session-');
    writeFileSync(join(root, '.local', 'licence.json'), licenceText(licence({ id: SESSION_LICENCE_ID }), primary));
    const status = initLicence({ root, keys: keysOf(primary, pair()) });
    if (status.state !== 'ok' || status.scope !== 'live' || !status.enforced) {
      throw new Error(`useLicensedSession: the fixture session is ${status.state}, ${status.scope}, enforced=${status.enforced}`);
    }
  });
  afterAll(() => {
    resetLicenceForTests();
    removeFixtureDirs();
  });
}
