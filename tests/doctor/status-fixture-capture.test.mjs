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
import { mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { capture, FIXED_RAN_AT, FIXTURE_STORE, HOST_FACTS, stampDay }
  from '../../scripts/make-status-fixtures.mjs';
import { validateReport } from '../../tools/snowarch/lib/doctor/report-json.mjs';
import { REAL_ROOT } from './helpers/tree.mjs';
import { tempDir } from '../../tools/snowarch/tests/helpers/temp.mjs';

const committed = (mode) => JSON.parse(readFileSync(
  join(REAL_ROOT, `tests/fixtures/doctor/status-${mode}.json`), 'utf8'));

/**
 * ARC-08-C20 — WHY THERE IS NO CORPUS PRECONDITION HERE, and why that is the stronger answer.
 *
 * A checkout without `vendor/ServiceNowDocs` used to capture `docs.present: false`, `head: null`,
 * `headMatchesPin: null`, and this test reported a six-line byte diff: every line true, none of
 * them the reason. The first fix was a precondition that named the missing submodule before
 * comparing bytes — which made the failure legible and left the bytes depending on it.
 *
 * That was the wrong half. CI proved it: the `test` job checks out WITHOUT the submodule and the
 * `bootstrap` job WITH it, so two correct jobs on one commit produced two byte streams, and a
 * precondition would have turned five green cells into five explained failures. By the rule the
 * pin table encodes — *if the value would differ between two correct captures on two correct
 * machines, it is the machine's* — the corpus's PRESENCE is the checkout's and belongs in
 * `HOST_FACTS`, which is where it now is. `docs.pin` and `docs.family` stay verbatim: those are
 * `engine.config.json`'s answer and they are the product's.
 *
 * So the fixture says `present: true` on a machine with no corpus for the same reason it says
 * `os: 'darwin'` on Linux. It is a sample, not a measurement of whoever ran the capture.
 */

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
    // Where the capture ran. On Windows the temp directory is under HOME, so this arrives as
    // `~/AppData/Local/Temp/snowarch-doctor-<random>` — home-relative AND per-run.
    assert.equal(byId.get('E-05').detail, HOST_FACTS.checkoutPath);
    assert.equal(byId.get('E-05').data.root, HOST_FACTS.checkoutPath);
    assert.equal(byId.get('E-05').data.toplevel, HOST_FACTS.checkoutPath);
    // `.local/`'s file mode: `700` on POSIX, `acl-inherited` on Windows — the filesystem's answer.
    assert.equal(byId.get('E-11').data.mode, HOST_FACTS.fileMode);
    assert.equal(/file modes:/i.test(byId.get('E-11').detail), false,
      'the Windows file-mode clause survived into the detail');
    // Whether the submodule is checked out: the `test` CI job has no corpus, the `bootstrap` job
    // does, and both are correct. The pin is what makes their bytes agree.
    assert.equal(r.engine.docs.present, HOST_FACTS.docsPresent);
    assert.equal(r.engine.docs.head, r.engine.docs.pin);
    assert.equal(r.engine.docs.headMatchesPin, true);
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
    // ARC-08-C31 — THE CLOCK RENDERED INTO A SENTENCE. `modeLine` ends `doctor <day> <n> ok`, and
    // the day came from `new Date(now())` rather than from the report's `ranAt` — so pinning every
    // timestamp FIELD still left the fixture agreeing with a capture only on the day it was taken.
    // `npm test` went red on develop and on v2.0.0-rc.9 three days after the capture, for nobody's
    // change at all.
    for (const line of [r.modeLine, r.modeLineDetailed]) {
      for (const stamped of String(line).matchAll(/doctor (\d{4}-\d{2}-\d{2})/g)) {
        assert.equal(stamped[1], FIXED_RAN_AT.slice(0, 10),
          `a rendered day is not the pinned instant's: ${line}`);
      }
    }
    // No machine path: the capture passes its root as `home`, so the shipped masker rewrites it.
    assert.equal(/\/var\/folders|\/tmp\/|C:\\/.test(JSON.stringify(r)), false,
      'a capture-machine path is in the committed fixture');
    // ARC-08-C27 — the version and the contract sha are SAMPLES now, and this comment used to say
    // the opposite: "real values, not placeholders: these move with a release and the sample block
    // moves with them". That was the defect stated as a virtue. Nothing regenerated them at
    // release time, so `release.mjs` rewriting the version — and the contract sha moving with it,
    // because `dist/contract.json` embeds the version — made every release tag fail this test by
    // construction. v2.0.0-rc.8's `verify` job found it on all three platforms.
    //
    // The docs PIN is still the product's: it moves when a maintainer moves the corpus, which is a
    // deliberate act on develop, not something a release rewrites underneath the fixture.
    assert.equal(r.version, HOST_FACTS.version);
    assert.equal(r.engine.version, HOST_FACTS.version);
    assert.equal(r.engine.contractSha, HOST_FACTS.contractSha);
    assert.match(r.engine.docs.pin, /^[0-9a-f]{40}$/);
  }
});

test('the capture is byte-identical under three TMPDIR layouts, including one under HOME',
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
    // `toplevel` IS pinned — on Windows the temp directory lives under HOME, so it arrives
    // home-relative and per-run, and three Windows cells failed on it. The masker is held instead
    // by `json-boundary`'s C1 and by the RAW-capture assertions at the bottom of this test: the
    // pinned bytes cannot carry a masking bug, so looking for one in them would be a check that
    // cannot fail.
    const plain = tempDir('snowarch-tmp-plain-', t);
    const linked = join(tempDir('snowarch-tmp-real-', t), 'through-a-link');
    mkdirSync(join(linked, '..', 'target'), { recursive: true });
    symlinkSync(join(linked, '..', 'target'), linked);
    // THE THIRD ONE IS THE WINDOWS SHAPE, run on every platform. There the temp directory lives
    // under HOME, so E-05's `toplevel` comes back `~/AppData/Local/Temp/snowarch-doctor-<random>`
    // — home-relative and different every run. Three Windows cells failed on exactly that, and a
    // test with only the two POSIX layouts could not have seen it from here.
    const underHome = join(homedir(), '.snowarch-capture-probe');
    mkdirSync(underHome, { recursive: true });
    t.after(() => rmSync(underHome, { recursive: true, force: true }));

    const before = process.env.TMPDIR;
    const captures = [];
    try {
      for (const dir of [plain, linked, underHome]) {
        process.env.TMPDIR = dir;
        captures.push(await capture('live'));
      }
    } finally {
      if (before === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = before;
    }

    for (const [n, other] of captures.slice(1).entries()) {
      assert.deepEqual(captures[0], other,
        `the capture depends on where it ran — TMPDIR #${n + 2} produced different bytes`);
    }
    // And the committed file agrees with both, which is the half that would otherwise be assumed.
    assert.deepEqual(captures[0], committed('live'));

    // THE MASKER, CHECKED ON THE RAW CAPTURE — before the pin table can hide the evidence.
    //
    // These four assertions name the three defects this row found, and each one is checked where
    // the value would actually carry it: the pinned report has `toplevel` and `data.root` replaced
    // outright, so a masking bug is invisible in it by construction.
    const raw = [];
    try {
      for (const dir of [plain, linked, underHome]) {
        process.env.TMPDIR = dir;
        // Resolved INSIDE the callback: `capture` removes the checkout in its `finally`, and a
        // `realpathSync` afterwards fails with ENOENT on the very path being asserted about.
        let roots = [];
        const report = await capture('live', {
          pin: false,
          onCheckout: (r) => {
            roots = [...new Set([r, realpathSync(r)].flatMap((v) => [v, v.replace(/\\/g, '/')]))];
          },
        });
        raw.push({ text: JSON.stringify(report), report, roots });
      }
    } finally {
      if (before === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = before;
    }

    for (const [n, { text, report, roots }] of raw.entries()) {
      const where = `layout #${n + 1}`;
      // (b) the unresolved prefix left in front of the mask: `/var/…` replaced inside
      // `/private/var/…`.
      assert.equal(text.includes('/private~'), false, `${where}: the unresolved-prefix bug is back`);
      // …and no temp path survived under either spelling.
      assert.equal(/"[^"]*\/(?:private\/)?var\/folders/.test(text), false,
        `${where}: a temp path survived the masker`);
      // (c2) THE POSITIVE FORM, and the negative one it replaced was wrong in principle.
      //
      // That assertion read `/"~[\\/][^"]*(?:AppData|Temp|snowarch-doctor)/` and called a
      // home-relative path a masking failure. On a raw Windows capture under the default TMPDIR,
      // `toplevel` is legitimately `~/AppData/Local/Temp/snowarch-doctor-<random>`: the home WAS
      // replaced by `~`, which is the mask working. The masker's contract is *the home never
      // appears in any spelling*, not *no path under the home is ever shown*. Three Windows cells
      // failed on it, and it passed here only because macOS's layout #3 path happens to contain
      // none of those three words — a Windows string used as a bug signature, which is the mirror
      // of the mistake it was written to catch.
      //
      // So: the path is rooted at the mask…
      const toplevel = report.checks.find((c) => c.id === 'E-05')?.data?.toplevel;
      assert.match(String(toplevel), /^~([\\/]|$)/,
        `${where}: the capture root is not masked at all (${toplevel})`);
      // …and the absolute home appears in NO spelling: as given, as resolved, and each with the
      // separator git prints. That is the contract, stated as what must be true.
      assert.ok(roots.length >= 1, `${where}: the capture did not report its checkout`);
      for (const spelling of roots) {
        assert.equal(text.includes(spelling), false,
          `${where}: the capture root survived the masker as ${spelling}`);
      }
      // …and no backslash spelling of the capture root escaped either.
      assert.equal(/"[^"]*\\\\(?:Users|AppData)\\\\/.test(text), false,
        `${where}: a backslash-spelled home path survived the masker`);
    }
  });

test('ARC-08-C27 — a release commit produces the same bytes as develop',
  { timeout: 120_000 }, async () => {
    // THE SHAPE THAT NEEDED A TAG TO SEE. The drift this row is about was invisible on develop for
    // one reason: the version never changes here, so every capture agreed with every other and the
    // pin table looked complete. It took a release tag to produce a second correct commit of the
    // same product — and by then the tag was red on three platforms, its publish skipped.
    //
    // The version is injected, the way the clock and the separator are, so the condition is tested
    // in this world rather than waited for in the next one.
    for (const version of ['9.9.9-rc.1', '2.0.0', '0.0.1-alpha.0']) {
      assert.deepEqual(await capture('live', { asVersion: version }), committed('live'),
        `a checkout whose package version reads ${version} produced different bytes`);
    }

    // …and the guard refuses to WRITE a fixture that carries the checkout's own version, so the
    // next field of this kind is caught here rather than on the next tag.
    const pkg = JSON.parse(readFileSync(join(REAL_ROOT, 'package.json'), 'utf8'));
    const text = readFileSync(
      join(REAL_ROOT, 'tests/fixtures/doctor/status-live.json'), 'utf8');
    if (pkg.version !== HOST_FACTS.version) {
      assert.equal(text.includes(pkg.version), false,
        `this checkout's version (${pkg.version}) is in the committed fixture`);
    }
  });

test('ARC-08-C31 — the day rendered into the mode line is pinned, not today\'s', () => {
  // The substitution is NARROW on purpose: it rewrites a date that follows the word `doctor` and
  // nothing else. A blanket date replacement would also rewrite a docs pin or an instance label
  // that happened to look like one, and this runs over a sentence the product composed rather than
  // over a field it owns.
  const at = '2026-09-20T09:00:00.000Z';
  assert.equal(stampDay('Mode: live — pdi — doctor 2026-01-02 14 ok', at),
    'Mode: live — pdi — doctor 2026-09-20 14 ok');
  assert.equal(stampDay('doctor 2026-01-02 3 FAIL', at), 'doctor 2026-09-20 3 FAIL');
  assert.equal(stampDay('corpus pinned 2026-01-02', at), 'corpus pinned 2026-01-02');
  assert.equal(stampDay(null, at), null);

  for (const mode of ['design', 'live']) {
    const line = String(committed(mode).modeLine);
    if (/doctor \d{4}-\d{2}-\d{2}/.test(line)) {
      assert.match(line, new RegExp(`doctor ${FIXED_RAN_AT.slice(0, 10)}`), `${mode}: ${line}`);
    }
  }
});
