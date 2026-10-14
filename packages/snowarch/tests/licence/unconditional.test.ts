// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
import { afterEach, describe, expect, it } from 'vitest';
import { licenceStatus } from '../../src/licence/state.js';
import { checkout, removeFixtureDirs } from './fixtures.js';

/**
 * ARC-11-C6 — the server enforces on every build, with no switch (the owner's decision, 2026-10-12: in 2.0.13).
 * The server's copy of the first decision: no value of `SNOW_LICENCE_ENFORCE`, and no absence of it, turns
 * enforcement off. The CLI's copy is `tools/snowarch/tests/licence-unconditional.test.mjs`.
 */
const VALUES = [undefined, '', 'true', 'false', '0', '1', 'TRUE', 'off', 'no'];

// The fixtures' own temp checkouts, removed after each case (ARC-09-C80).
afterEach(() => { removeFixtureDirs(); });

describe('ARC-11-C6 — a server with no licence is enforced, whatever SNOW_LICENCE_ENFORCE says', () => {
  it.each(VALUES)('SNOW_LICENCE_ENFORCE=%s', (v) => {
    const s = licenceStatus(checkout('snowarch-licence-unconditional-'), { env: v === undefined ? {} : { SNOW_LICENCE_ENFORCE: v } });
    expect(s.state).toBe('missing');
    expect(s.enforced).toBe(true);
  });
});
