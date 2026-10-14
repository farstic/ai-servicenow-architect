// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-11-C6 — enforcement on every build, with no switch. The owner's decision, 2026-10-12: it ships in 2.0.13.
 *
 * The first decision is the one every other rests on: no value of `SNOW_LICENCE_ENFORCE`, and no absence of it,
 * turns enforcement off. The architect rejected an opt-out on 2026-10-12. One honoured "only without a verified
 * manifest", beside C7's "a modified build still starts and works", is a documented recipe for running without a
 * licence. So the variable decides nothing; with it set to anything, nothing changes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { licenceStatus, refusesCommand } from '../lib/licence/state.mjs';
import { tempDir } from './helpers/temp.mjs';

const VALUES = [undefined, '', 'true', 'false', '0', '1', 'TRUE', 'off', 'no'];
const envOf = (v) => (v === undefined ? {} : { SNOW_LICENCE_ENFORCE: v });

test('ARC-11-C6 — a checkout with no licence is enforced, whatever SNOW_LICENCE_ENFORCE says', (t) => {
  const root = tempDir('licence-unconditional-', t);
  for (const v of VALUES) {
    const s = licenceStatus(root, { env: envOf(v) });
    assert.equal(s.state, 'missing');
    assert.equal(s.enforced, true, `SNOW_LICENCE_ENFORCE=${JSON.stringify(v)} turned enforcement off`);
    assert.equal(refusesCommand('mode', s), true, `SNOW_LICENCE_ENFORCE=${JSON.stringify(v)} let \`mode\` run`);
  }
});
