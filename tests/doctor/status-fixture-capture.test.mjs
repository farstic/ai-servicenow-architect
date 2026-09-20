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
import { mkdirSync, readFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';

import { capture, FIXED_RAN_AT, FIXTURE_STORE, HOST_FACTS } from '../../scripts/make-status-fixtures.mjs';
import { validateReport } from '../../tools/snowarch/lib/doctor/report-json.mjs';
import { REAL_ROOT } from './helpers/tree.mjs';
import { tempDir } from '../../tools/snowarch/tests/helpers/temp.mjs';

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

test('every fact about the capturing machine is the sample value, not this machine\'s', () => {
  // THE REWORK, AND THE REASON FOR IT. The first version pinned the clock and the shell and nothing
  // else, so the drift test held only on the machine that wrote the file: CI's macOS node-20 and
  // node-22 cells failed on `2.55.0` vs `2.39.5` (git) and `22.23.2` vs `24.16.0` (node, in three
  // places), while the node-24 cells passed for the same reason.
  //
  // The rule: if the value would differ between two correct captures on two correct machines, it is
  // the machine's and it is pinned. Asserted here by NAME so that a field added to the report and
  // not to `HOST_FACTS` fails on the machine that would otherwise commit it.
  for (const mode of ['design', 'live']) {
    const r = committed(mode);
    assert.equal(r.prereqs.os, HOST_FACTS.os);
    assert.equal(r.prereqs.shell, HOST_FACTS.shell);
    assert.equal(r.prereqs.node.version, HOST_FACTS.node);
    assert.equal(r.prereqs.node.ok, HOST_FACTS.ok);
    assert.equal(r.engine.node, HOST_FACTS.node);
    const byId = new Map(r.checks.map((c) => [c.id, c]));
    assert.equal(byId.get('E-01').detail, HOST_FACTS.git);
    assert.equal(byId.get('E-02').data.version, HOST_FACTS.node);
    // …and the floor beside it is the PRODUCT's, captured verbatim — pinning that would freeze a
    // fact the fixture exists to show.
    assert.match(byId.get('E-02').detail, new RegExp(`^${HOST_FACTS.node} \\(floor \\d`));

    // The machine that ran this test is not in the file.
    const text = JSON.stringify(r);
    if (process.versions.node !== HOST_FACTS.node) {
      assert.equal(text.includes(process.versions.node), false,
        `${mode}: the running node version survived into the fixture`);
    }
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
    assert.equal(r.prereqs.shell, HOST_FACTS.shell);
    // No machine path: the capture passes its root as `home`, so the shipped masker rewrites it.
    assert.equal(/\/var\/folders|\/tmp\/|C:\\/.test(JSON.stringify(r)), false,
      'a capture-machine path is in the committed fixture');
    // Real values, not placeholders: these move with a release and the sample block moves with them.
    assert.match(r.engine.version, /^\d+\.\d+\.\d+/);
    assert.match(r.engine.contractSha, /^[0-9a-f]{64}$/);
    assert.match(r.engine.docs.pin, /^[0-9a-f]{40}$/);
  }
});

test('the capture is byte-identical under two different TMPDIRs, one behind a symlink',
  { timeout: 120_000 }, async (t) => {
    // THE CONTROL FOR THE SECOND FINDING. The committed fixture carried `toplevel: '/private~'`:
    // the capture had run in a checkout under macOS's default temp dir, whose realpath is
    // `/private/var/…` while `os.tmpdir()` says `/var/…`, and the redactor replaced the UNRESOLVED
    // prefix inside the RESOLVED path — leaving `/private` in front of the mask. A masker that only
    // works where it was written, which is the class `realpathOrSelf` exists for.
    //
    // `homeValues` masks both spellings now, longest first. This is what proves it, and it is
    // deliberately a test about the CAPTURE rather than about the masker: the masker's own unit
    // assertions can pass while the bytes that get committed still differ.
    //
    // `toplevel` is NOT on the pin list, and that is the choice this test defends: pinning it would
    // keep the fixture green if the masker broke again, and the value being `~` IS the assertion.
    const plain = tempDir('snowarch-tmp-plain-', t);
    const linked = join(tempDir('snowarch-tmp-real-', t), 'through-a-link');
    mkdirSync(join(linked, '..', 'target'), { recursive: true });
    symlinkSync(join(linked, '..', 'target'), linked);

    const before = process.env.TMPDIR;
    const captures = [];
    try {
      for (const dir of [plain, linked]) {
        process.env.TMPDIR = dir;
        captures.push(await capture('live'));
      }
    } finally {
      if (before === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = before;
    }

    assert.deepEqual(captures[0], captures[1],
      'the capture depends on where it ran — a machine path reached the fixture');
    // And the committed file agrees with both, which is the half that would otherwise be assumed.
    assert.deepEqual(captures[0], committed('live'));

    // The shape the bug produced, named so a reader recognises it if it returns.
    const text = JSON.stringify(captures[0]);
    assert.equal(text.includes('/private~'), false, 'the unresolved-prefix bug is back');
    assert.equal(/"[^"]*\/(?:private\/)?var\/folders/.test(text), false,
      'a temp path survived into the fixture');
  });
