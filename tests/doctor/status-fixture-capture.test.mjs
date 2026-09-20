/**
 * ARC-08-C20 — the status fixtures are captured, and the capture is checked.
 *
 * `status-template.test.mjs` says of the two fixtures: *"written by `--quick --json` on fixture
 * checkouts, never by hand"*. That sentence was the only thing standing behind them, and by
 * 2026-09-19 it had stopped being true of the PRODUCT rather than of the files: `status-live.json`
 * carried a `server` block from a `--quick` run, and ARC-09-C8 had taken the server section out of
 * the quick subset, so no quick run this product makes could produce it. Nothing failed. A fixture
 * the product cannot produce is a guarantee about a product that no longer exists, and every test
 * reading it was measuring a fortnight ago.
 *
 * `scripts/make-status-fixtures.mjs` is the capture, and this is what stops it going quiet again:
 * it re-runs the capture and compares it to what is committed. The whole class of "the fixture and
 * the product have drifted apart and no test can tell" is closed by making the fixture a
 * reproducible output rather than a remembered one.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { capture, FIXED_RAN_AT, FIXTURE_STORE } from '../../scripts/make-status-fixtures.mjs';
import { validateReport } from '../../tools/snowarch/lib/doctor/report-json.mjs';
import { REAL_ROOT } from './helpers/tree.mjs';

const committed = (mode) => JSON.parse(readFileSync(
  join(REAL_ROOT, `tests/fixtures/doctor/status-${mode}.json`), 'utf8'));

test('the committed fixtures are what the capture produces, today', { timeout: 120_000 }, async () => {
  // THE WHOLE POINT. Not "the fixture parses" or "the fixture has these keys" — those were true of
  // the pre-C8 fixture for a fortnight after the product stopped being able to produce it.
  for (const mode of ['design', 'live']) {
    assert.deepEqual(await capture(mode), committed(mode),
      `status-${mode}.json has drifted from what the product produces`
      + ' — run `node scripts/make-status-fixtures.mjs` and commit the result');
  }
});

test('both are valid schema-v1 reports, every key present', () => {
  // No exclusions. ARC-08-C19 had to excuse the `instances` key by name because the fixtures
  // predated it; a captured fixture has every key its own product writes, so the excuse is gone
  // and this assertion is whole again.
  for (const mode of ['design', 'live']) {
    assert.deepEqual(validateReport(committed(mode)), [], `status-${mode}.json`);
  }
});

test('the live capture is a quick run with a store, and no server block', () => {
  const live = committed('live');
  assert.equal(live.mode, 'live');
  assert.equal(live.options.quick, true);
  // The sentence that retires the old fixture: a `--quick` run does not spawn the server, so a
  // `server` block in one is a report no current run can produce. The instances come from the
  // store instead, and say so.
  assert.equal(live.server, null);
  assert.equal(live.instances.source, 'store');
  assert.deepEqual(live.instances.entries,
    [{ label: 'pdi', environment: 'pdi', preset: 'custom' }]);

  const design = committed('design');
  assert.equal(design.mode, 'design-only');
  assert.equal(design.instances, null, 'the design capture found a store');
});

test('neither fixture carries a credential, a host or an account name', () => {
  // The fixture store holds a username and a password; the report must hold neither. Asserted on
  // the BYTES, because this file is committed and read by strangers.
  for (const mode of ['design', 'live']) {
    const text = readFileSync(
      join(REAL_ROOT, `tests/fixtures/doctor/status-${mode}.json`), 'utf8');
    assert.equal(text.includes(FIXTURE_STORE.instances.pdi.auth.password), false,
      `${mode}: the fixture credential survived`);
    assert.equal(text.includes('instance.example.test'), false, `${mode}: the fixture host survived`);
    assert.equal(/[A-Za-z0-9._-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(text), false,
      `${mode}: an address-shaped string survived`);
  }
});

test('the clock and the capturing process are pinned, and nothing else is', () => {
  // A capture that changed on every run could not be compared to anything — and a capture that
  // normalised the version or the docs pin would be a fixture that never ages when the product
  // does, which is the failure this file exists to prevent, wearing the opposite coat.
  //
  // `prereqs.shell` is pinned because `guessShell` walks the PARENT process: it answers `zsh` from
  // a terminal and `unknown` under `node --test`, which is a fact about who typed the command.
  for (const mode of ['design', 'live']) {
    const r = committed(mode);
    assert.equal(r.ranAt, FIXED_RAN_AT);
    assert.equal(r.durationMs, 0);
    assert.deepEqual([...new Set(r.checks.map((c) => c.durationMs))], [0]);
    assert.equal(r.prereqs.shell, 'unknown');
    // No machine path: the capture passes its root as `home`, so the shipped masker rewrites it.
    assert.equal(/\/var\/folders|\/tmp\/|C:\\/.test(JSON.stringify(r)), false,
      'a capture-machine path is in the committed fixture');
    // Real values, not placeholders: these move with a release and the sample block moves with them.
    assert.match(r.engine.version, /^\d+\.\d+\.\d+/);
    assert.match(r.engine.contractSha, /^[0-9a-f]{64}$/);
    assert.match(r.engine.docs.pin, /^[0-9a-f]{40}$/);
  }
});
