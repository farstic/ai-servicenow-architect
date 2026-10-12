// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-11-C6 (ruling R1) — with no licence in force, the bootstrap skips the two steps that start the package CLI.
 *
 * `bootstrap` runs without a licence (ruling A: it installs and registers, and gives no use). B06 starts the
 * package CLI's `store migrate` and its `instance add` wizard, and B08 its `instance` probes. The package CLI
 * refuses both commands with no licence in force, by the gate ./snowarch uses (step 4b), so the steps ask that
 * gate first and skip, instead of meeting the refusal and calling it a failed migration or a missing probe. A
 * skipped step is never-run, so the next bootstrap after a licence is installed runs it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NO_LICENCE_IN_FORCE } from '../lib/doctor/checks/licence.mjs';
import { runSteps, stepById } from '../lib/steps/index.mjs';
import { stepContext } from '../lib/bootstrap.mjs';
import { emptyState } from '../lib/state.mjs';
import { REMEDY } from '../lib/licence/state.mjs';
import { spellings } from '../lib/text.mjs';
import { makeCheckout } from './helpers/workspace.mjs';

const STEPS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'steps');
const SPELL = spellings({ platform: 'linux', env: {} });
const LINE = (id, title) => `[${id}/09] ${title} … skipped (${NO_LICENCE_IN_FORCE}) — ${REMEDY(SPELL.cli)}`;
const live = (root, licence) => ({ root, mode: 'live', docs: 'sparse', env: {}, platform: 'linux', licence,
  node: { present: true, version: '22.11.0', major: 22 } });

test('ARC-11-C6 — under a refused state, B06 and B08 skip with the reason and E-31\'s remedy, and run nothing', async () => {
  for (const state of ['missing', 'invalid', 'expired', 'revoked']) {
    const root = makeCheckout();
    const s = emptyState({ engineVersion: '2.0.0-test', platform: 'linux' });
    const lines = [];
    const r = await runSteps({ root, ctx: live(root, { state }), state: s, steps: [stepById('B06'), stepById('B08')],
      last: 'B09', save: () => {}, onLine: (l) => lines.push(l) });
    assert.deepEqual(lines, [LINE('B06', 'instance'), LINE('B08', 'verify')], `licence ${state}`);
    assert.equal(r.summary.skipped, 2);
    for (const id of ['B06', 'B08']) {
      assert.equal(s.steps[id].status, 'skipped', `${id} under ${state}`);
      assert.equal(s.steps[id].detail, NO_LICENCE_IN_FORCE);
    }
  }
});

test('ARC-11-C6 — a licence in force, expiring included, leaves B06 and B08 to run in live mode', () => {
  const root = makeCheckout();
  for (const state of ['ok', 'expiring']) {
    assert.equal(stepById('B06').runsWhen(live(root, { state })), true, `B06 under ${state}`);
    assert.equal(stepById('B08').runsWhen(live(root, { state })), true, `B08 under ${state}`);
  }
});

test('ARC-11-C6 — design-only is still the reason a design-only checkout skips them, licence or not', () => {
  const root = makeCheckout();
  const ctx = { ...live(root, { state: 'missing' }), mode: 'design-only' };
  for (const id of ['B06', 'B08']) {
    const step = stepById(id);
    assert.equal(step.runsWhen(ctx), false);
    const reason = typeof step.skipReason === 'function' ? step.skipReason(ctx) : step.skipReason;
    assert.equal(reason, 'design-only', id);
  }
});

test('ARC-11-C6 — the reason is E-31\'s own constant, in the approved words, and no step spells it out', () => {
  assert.equal(NO_LICENCE_IN_FORCE, 'no licence in force (see E-31)');
  const root = makeCheckout();
  for (const id of ['B06', 'B08']) {
    assert.equal(stepById(id).skipReason(live(root, { state: 'missing' })), NO_LICENCE_IN_FORCE, id);
    assert.doesNotMatch(readFileSync(join(STEPS_DIR, `${id}.mjs`), 'utf8'), /no licence in force/,
      `${id} copies the reason's text instead of importing E-31's constant`);
  }
});

test('ARC-11-C6 — the run reads the licence once: stepContext carries it, for every step that asks', () => {
  // Without it each step would read the files again, and a step asked with no root could not tell at all.
  const root = makeCheckout();
  const ctx = stepContext({ root, config: { docs: { areasFile: 'docs/areas.txt' } },
    node: { present: true, version: '22.11.0', major: 22 } });
  assert.equal(ctx.licence?.state, 'missing', 'a checkout with no licence');
  assert.equal(stepById('B06').runsWhen({ ...ctx, mode: 'live' }), false);
});
