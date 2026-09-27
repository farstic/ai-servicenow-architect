// ARC-07-C35 — the launcher audit: every asserted launcher, resolved to the product line that prints
// it, checked for agreement, and failing in the gate instead of on three Windows cells.
//
// WHAT IT IS FOR. A test that asserts a launcher must derive it when the product line DERIVES, and pin
// POSIX when the product line is pinned. Nothing at the assertion says which, so the classification is
// made from memory — and across ARC-07-C31's slices 1 and 2 that cost four Windows rounds of roughly
// twenty-five minutes each. Two of them were the same pair got wrong in OPPOSITE directions in one
// push. This turns that into a local second.
//
// WHAT IT CAN AND CANNOT DO, measured rather than hoped, because the first three designs each failed a
// different way:
//   1. Probing with the words ADJACENT to the launcher is unusable: "docs sync" matches 29 product
//      lines spanning both kinds, and "doctor" and "upgrade" are worse.
//   2. Treating "the line mentions a spelling constant" as "the line asserts a launcher" produced 106
//      false targets — `formatResult(r, SPELL)` threads a spelling, it asserts nothing.
//   3. A TARGET is a line where the spelling is interpolated INTO A STRING, or a launcher literal
//      appears, on a line that also asserts. That detector is right: 45 real targets, no false ones.
//   4. Joining `+` continuations, which looked like the fix for the unresolved residue, changed
//      nothing. The residue is a KEY problem, not a line problem.
//
// AND THE NUMBERS, stated plainly because I first reported them ambiguously: of 45 targets, **3
// RESOLVE** and 42 do not. Two corrections got it there. Stripping trailing `));` from the key was
// right but made keys shorter and so more ambiguous; and the assertion's FIRST ARGUMENT was still
// in the key, so `assert.equal(r.text, 'corpus missing — run …')` looked for `r.text, corpus
// missing …` in the product, which nothing can carry. With both fixed the resolved set is small but
// real, and every resolved site agrees.
//
// So what this instrument actually buys today is the THIRD failure mode, and it is worth the file: a
// NEW asserted launcher in any test fails the gate locally, because it is an unresolved site the
// baseline does not list — which forces whoever wrote it to classify it deliberately instead of
// finding out from three Windows cells. The MISMATCH path is real and controlled by planting a product
// line and a test line that assert against it, but the repository has no resolvable site for it to fire
// on until ARC-07-C35b's extractor lands. That is a capability with no current occurrence, not a claim.
//
// So the resolvable set is checked exactly, and THE UNRESOLVED SET IS FROZEN PER FILE with exact
// counts asserted EQUAL — the discipline `tests/windows-spellings.test.mjs` uses for the sweep
// remainder, and for the same reason: a new unresolved site fails as loudly as a mismatch, and the
// baseline can only shrink. Resolving the residue needs a real extractor for template literals with
// interpolations, regex literals and concatenation, plus tracing which command a case runs; that is
// ARC-07-C35b, and these counts are its measurement.
//
// Usage: node scripts/ci/launcher-audit.mjs [--json]
// Exit 0 when every resolved target agrees and the baseline matches · 1 on any of the three failures.
import { readFileSync, writeSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertedLaunchers, MARK, productLines } from './launcher-extract.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const ls = (...paths) => execFileSync('git', ['ls-files', ...paths],
  { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).split('\n').filter(Boolean);

const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');

/*
 * THE LINE-BASED MACHINERY IS GONE — ARC-07-C35b, second head, and `codeOf` was not merely redundant.
 *
 * `codeOf` blanked comments with a regex BEFORE the parser saw the text, and a regex cannot tell a comment
 * from a string. On `tests/contract/gen-governance.test.mjs` the `/*` inside the line comment `rules/*.md`
 * paired with the `*` + `/` inside a regex literal 443 lines later, and 452 lines went blank: that file's
 * TWO asserted launchers became zero. Measured across all 223 tracked test files — raw parse 114 sites,
 * after `codeOf` 112 — and it is the only file where the count moves today, but 203 of those files contain
 * a `/*`, so the mechanism is general and the next one is a matter of where somebody puts a comment.
 *
 * A PARSER NEVER YIELDS COMMENT TEXT. Comments are trivia in a TypeScript AST and no walk of the nodes
 * visits them, so stripping them first could only ever subtract. The sweep in
 * `tests/windows-spellings.test.mjs` still blanks comments for a real reason — it reads LINES, and a lesson
 * written in a comment is not a launcher spelled in code — and that reason does not transfer to this file.
 *
 * `sentence`, `hasLauncher`, `LAUNCHER`, `DERIVED_CALL` and `INTERPOLATED` went with it: every one was the
 * old normaliser's, and the extractor replaced all of them. `LAUNCHER` in particular now has ONE definition,
 * exported from `launcher-extract.mjs` — two regexes for "what a launcher looks like" is exactly the drift
 * this audit exists to catch, and the two had already diverged: this file's carried the source-escaped form
 * and the extractor's the cooked one.
 */

/**
 * The distinctive run of prose beside the launcher: the longest stretch between markers.
 *
 * Kept for `byKey`, which is ARC-07-C35's matching rule — a case measures the two rules against each other,
 * so the older one has to still be runnable.
 *
 * TRAILING SCAFFOLDING IS STRIPPED, and measuring is how I know to: the key for the store-root-entry
 * pair came out as `store <command> ));`, which no product line can contain, so a resolvable site was
 * reported unresolved for a reason that had nothing to do with the launcher.
 */
const keyOf = (text) => text.split(MARK)
  .map((part) => part.replace(/[\s,;)(]+$/, '').replace(/^[\s,;)(]+/, '').trim())
  .filter((part) => part.length >= 12)
  .sort((a, b) => b.length - a.length)[0] ?? null;

const PRODUCT_PATHS = ['tools/snowarch/lib', 'tools/snowarch/bin', 'packages/snowarch/src', 'scripts'];
// THREE TEST TREES, and the third was found by three red Windows cells rather than by this file.
// ARC-07-C31 slice 3 made the SERVER's sentences derive, and seventeen expectations in
// `packages/snowarch/tests` still held the POSIX spelling — a tree neither my hand sweep nor this
// audit's original scope looked at. The lesson is the audit's own: a scope I choose is not a scope
// that is complete, so the list is the trees that EXIST rather than the ones I remembered.
const TEST_PATHS = ['tests', 'tools/snowarch/tests', 'packages/snowarch/tests'];

/**
 * THE UNRESOLVED BASELINE — ARC-07-C35b, measured 2026-09-27 on the parsed extractor.
 *
 * Exact per file, asserted EQUAL and never `<=`: a new unresolved site fails exactly as loudly as a
 * mismatch, and a count that has come DOWN fails too, so the list shrinks with the work instead of quietly
 * outliving it.
 *
 * EVERY ENTRY CARRIES ITS REASON, TAKEN FROM THE AUDIT'S OWN REPORT — not from a second classifier that
 * could disagree with it, which the first version of this list did. Where a file mixes reasons the entry
 * counts them (`5× … ; 2× …`), because "done" for this row is a TRUE annotation and a single label over a
 * mixed file is not one.
 *
 * The reasons, with the site counts measured on this head:
 *
 *   -  57  the product assembles this sentence. The test asserts a whole command —
 *          `instance set-preset prod full --ack-prod` — that the product never writes as one literal: it
 *          comes from a remedy table filled at runtime. Resolving these needs the audit to evaluate the
 *          assembly, which is a bigger instrument than this row.
 *   -  19  the assertion is about the launcher alone. `expect(windows).not.toContain('./snowarch')` asserts
 *          an ABSENCE; there is no sentence to place it in, and a negative assertion is exactly the shape
 *          that should not be resolved by guessing. This count FELL from 21 as `proseOf` learned to read
 *          containers — ten of those were the extractor dropping a sentence it could see, which made the
 *          reason itself false.
 *   -   4  the product spells a placeholder the fixture fills: `instance test <label>` against
 *          `instance test pdi`.
 *   -   2  the contract holds it with `<cli>` — ARC-07-C32's design, where no launcher-bearing product line
 *          exists because the reader substitutes.
 *   -   1  a pinned and a deriving line both carry it, with no argv to route by.
 *   -   1  the case drives a pinned shell in a different statement from the one asserted, so whether it
 *          reached this sentence needs dataflow this audit does not do. Reported as an UNKNOWN rather than
 *          as agreement or a mismatch — it is the honest answer, and calling it a pinned expectation
 *          reported `tty.test.ts:188`, which is correct code, as a defect.
 *   -   1  the routed package carries no such sentence.
 *   -   1  planted fixture.
 *
 * `tests/launcher-audit.test.mjs` IS BACK IN THIS LIST, at one site rather than the three C35 recorded, and
 * the movement is worth reading. The parser correctly stopped counting its planted fixtures — launchers
 * inside string literals that are DATA, which a line-based detector read as assertions. What it does count
 * is a real one: `assert.ok(LAUNCHER.test('./snowarch') && LAUNCHER.test('.\\snowarch.cmd'))`, the case that
 * holds the single definition of the regex, where the launcher genuinely is inside an assertion. Listing it
 * is deliberate: excluding this file by name would be an allow-list, which is the mistake this whole row
 * exists to stop making, and a change to that case should fail here and be looked at.
 */
export const UNRESOLVED_BASELINE = Object.freeze(new Map([
  ['packages/snowarch/tests/cli/import-legacy.test.ts', { n: 2, why: '1× the product assembles this sentence; 1× the assertion is about the launcher alone' }],
  ['packages/snowarch/tests/cli/instance-manage.test.ts', { n: 1, why: 'the product spells a placeholder the fixture fills' }],
  ['packages/snowarch/tests/cli/instance.test.ts', { n: 2, why: 'the product assembles this sentence' }],
  ['packages/snowarch/tests/cli/preset-ui.test.ts', { n: 1, why: 'the product assembles this sentence' }],
  ['packages/snowarch/tests/cli/store-command.test.ts', { n: 1, why: 'a pinned and a deriving line both carry it' }],
  ['packages/snowarch/tests/cli/tty.test.ts', { n: 1, why: 'the case drives a pinned shell in another statement' }],
  ['packages/snowarch/tests/servicenow/prod-ack.test.ts', { n: 1, why: 'the product assembles this sentence' }],
  ['packages/snowarch/tests/tools/gate-split.test.ts', { n: 1, why: 'the product assembles this sentence' }],
  ['packages/snowarch/tests/tools/permissions.test.ts', { n: 3, why: '2× the product assembles this sentence; 1× the product spells a placeholder the fixture fills' }],
  ['tests/cli-help.test.mjs', { n: 2, why: 'the product assembles this sentence' }],
  ['tests/contract/gen-governance.test.mjs', { n: 2, why: 'the product assembles this sentence' }],
  ['tests/docs-status.test.mjs', { n: 1, why: 'the product assembles this sentence' }],
  ['tests/docs-upstream.test.mjs', { n: 1, why: 'the assertion is about the launcher alone' }],
  ['tests/doctor/bootstrap-finished.test.mjs', { n: 2, why: '1× the product assembles this sentence; 1× the assertion is about the launcher alone' }],
  ['tests/doctor/fix.test.mjs', { n: 2, why: '1× the product assembles this sentence; 1× the contract holds it with <cli>' }],
  ['tests/doctor/framework.test.mjs', { n: 4, why: '2× the assertion is about the launcher alone; 2× the product assembles this sentence' }],
  ['tests/doctor/legacy.test.mjs', { n: 1, why: 'the product assembles this sentence' }],
  ['tests/doctor/mode-and-cache.test.mjs', { n: 1, why: 'the product assembles this sentence' }],
  ['tests/doctor/panel.test.mjs', { n: 8, why: 'the product assembles this sentence' }],
  ['tests/doctor/release-currency.test.mjs', { n: 2, why: 'the product assembles this sentence' }],
  ['tests/doctor/status-command.test.mjs', { n: 3, why: 'the product assembles this sentence' }],
  ['tests/doctor/win32-remedies.test.mjs', { n: 4, why: '1× the product assembles this sentence; 3× the assertion is about the launcher alone' }],
  ['tests/handoff-command.test.mjs', { n: 2, why: '1× the assertion is about the launcher alone; 1× the product assembles this sentence' }],
  ['tests/hook/session-start.test.mjs', { n: 1, why: 'the assertion is about the launcher alone' }],
  ['tests/launcher-audit.test.mjs', { n: 1, why: 'planted fixture' }],
  ['tests/snowarch-skill.test.mjs', { n: 1, why: 'the product assembles this sentence' }],
  ['tests/upgrade/upgrade-unit.test.mjs', { n: 4, why: 'the product assembles this sentence' }],
  ['tests/upgrade/upgrade.e2e.test.mjs', { n: 1, why: 'the routed package carries no such sentence' }],
  ['tests/version-tag.test.mjs', { n: 1, why: 'the product assembles this sentence' }],
  ['tests/windows-spellings.test.mjs', { n: 4, why: '3× the assertion is about the launcher alone; 1× the contract holds it with <cli>' }],
  ['tools/snowarch/tests/b00-checks.test.mjs', { n: 2, why: 'the product assembles this sentence' }],
  ['tools/snowarch/tests/b02-docs.test.mjs', { n: 3, why: 'the product assembles this sentence' }],
  ['tools/snowarch/tests/b09-summary.test.mjs', { n: 3, why: 'the product assembles this sentence' }],
  ['tools/snowarch/tests/bootstrap-plan.test.mjs', { n: 3, why: 'the product assembles this sentence' }],
  ['tools/snowarch/tests/bootstrap-runner.test.mjs', { n: 2, why: 'the product assembles this sentence' }],
  ['tools/snowarch/tests/bootstrap-state.test.mjs', { n: 1, why: 'the assertion is about the launcher alone' }],
  ['tools/snowarch/tests/cli.test.mjs', { n: 3, why: '1× the product assembles this sentence; 2× the product spells a placeholder the fixture fills' }],
  ['tools/snowarch/tests/store-forwarder.test.mjs', { n: 1, why: 'the product assembles this sentence' }],
  ['tools/snowarch/tests/text.test.mjs', { n: 7, why: '5× the assertion is about the launcher alone; 2× the product assembles this sentence' }],
]));

/** The tracked files, as `{ file, text }` — the default sources for both halves. */
export const productSources = (paths = PRODUCT_PATHS) => ls(...paths)
  .filter((f) => /\.(mjs|ts|js)$/.test(f) && !/\.test\./.test(f) && !/\.d\.ts$/.test(f))
  .map((file) => ({ file, text: read(file) }));

export const testSources = (paths = TEST_PATHS) => ls(...paths)
  // `.ts` AS WELL AS `.mjs`, and this was the THIRD layer of the same fake widening: I added the
  // server's test path, then taught the detector to see `expect(` as well as `assert`, and the file
  // filter still said `.test.mjs` — so the audit reported success over a tree it was not reading. Each
  // layer looked like the fix and the measurement is what said otherwise.
  .filter((f) => /\.test\.(mjs|ts)$/.test(f))
  .map((file) => ({ file, text: read(file) }));

/**
 * Every product line that spells or derives a launcher, as a sentence with its kind.
 *
 * SOURCES RATHER THAN PATHS, so a control can plant a product line and a test line that assert against
 * it and audit the pair without adding files to the repository — which matters because the repository
 * has NO resolvable site today, so the mismatch path would otherwise be untestable.
 */
export function productIndex(sources = productSources()) {
  // ARC-07-C35b — PARSED, not normalised. The line-based version could not tell a launcher inside a
  // string from one inside an expression, and it carried whatever else was on the line into the key.
  // `productLines` returns the prose of each literal, with a MARK where the spelling goes, and the
  // PACKAGE the file belongs to — which is what command tracing compares a routed site against.
  return sources.flatMap(({ file: rel, text }) => productLines(rel, text));
}

/**
 * Every asserted launcher in the tests, with what the EXPECTATION is and what the product does.
 *
 * `extraTestPaths` and `extraProductPaths` exist for the control: a planted file under a temp root has
 * to be auditable without moving it into the repository.
 */
/**
 * ARC-07-C35b — TWO MATCHING RULES, and the row's answer is measured rather than argued.
 *
 * `byKey` is ARC-07-C35's: take the longest prose run between MARKs and require 12 characters of it. It
 * cannot resolve a sentence that IS a command — `${CLI} upgrade` has eight characters of prose — and that
 * was 29 of the 43 unresolved files.
 *
 * `bySentence` compares the MARK-NORMALISED SENTENCES: the test asserts `usage: MARK store <command>` and
 * the product prints `usage: MARK store <command> [options]`, so the test's sentence is contained in the
 * product's. The launcher's position is part of the comparison rather than thrown away, which is what makes
 * a short sentence usable — and a sentence that is short enough to match several product lines is reported
 * ambiguous, which is honest, instead of being dropped for having no long run.
 */
export const byKey = (testProse, productProse) => {
  const key = keyOf(testProse);
  return key ? productProse.includes(key) : false;
};

const squash = (text) => text.replace(/\s+/g, ' ').trim();

export const bySentence = (testProse, productProse) => {
  const t = squash(testProse);
  // A sentence of nothing but the launcher resolves nothing: `expect(x).not.toContain('./snowarch')` is an
  // assertion ABOUT the launcher with no sentence to place it in.
  if (t.replace(new RegExp(MARK, 'g'), '').trim().length < 3) return false;
  return squash(productProse).includes(t);
};

/**
 * EVERY hit, not `hits[0]` — the product lines are path-sorted, so citing the first named whichever of
 * several same-kind lines happened to sort earliest (`packages/` before `tools/`), and a reader then went to
 * a line that was not the one under test. The sentence is shared by all of them; the reader needs the list.
 */
const sites = (hits) => hits.map((h) => `${h.file}:${h.line}`);
const cite = (hits) => sites(hits).join(', ');

export function audit({ tests = testSources(), product: productFiles = productSources(),
  baseline = UNRESOLVED_BASELINE, match = bySentence } = {}) {
  const product = productIndex(productFiles);
  const mismatches = [];
  const unresolved = [];
  let agreed = 0;

  for (const { file: rel, text } of tests) {
    // ARC-07-C35b — the extractor finds the assertions and their prose; this decides what that means.
    for (const found_site of assertedLaunchers(rel, text)) {
      const { line, expectation, sentence: prose, argv, answeredBy: route,
        caseDrivesPinned } = found_site;
      const site = `${rel}:${line}`;
      // `continue`, not `return`: this loop is a `for...of` now, and the `return` the `forEach` version
      // used would have returned from `audit()` — measured, it made the whole result `undefined` on the
      // first site with no distinctive sentence.
      const shown = keyOf(prose) ?? squash(prose);
      if (!shown) {
        unresolved.push({ site, file: rel, why: 'no sentence beside the launcher at all' });
        continue;
      }

      // COMMAND TRACING, the row's piece (b): when the case SPAWNS a command, only the package that
      // answers it can be the line under test. `store <command>` matches a pinned engine line and a
      // deriving server one, and the argv is what says which — `['store','--help']` is the frame's own
      // answer, `['store','migrate','--help']` is forwarded. Without this the pair is ambiguous and the
      // architect's named control cannot fire at all, which is why this row exists.
      const routed = route ? product.filter((p) => p.package === route) : product;
      const hits = routed.filter((p) => match(prose, p.sentence));
      const kinds = [...new Set(hits.map((h) => h.kind))];
      if (hits.length === 0) {
        unresolved.push({ site, file: rel, why: route
          ? `no ${route} line carries "${shown.slice(0, 48)}" (argv ${JSON.stringify(argv)})`
          : `no product line carries "${shown.slice(0, 48)}"` });
      } else if (kinds.length > 1) {
        unresolved.push({ site, file: rel,
          why: `"${shown.slice(0, 48)}" matches both a PINNED and a DERIVED product line` });
      } else if (expectation === 'EXPECTED_RENDERING') {
        // The case supplied a pinned shell and asserted that shell's rendering — ARC-07-C31's own pattern.
        // A DERIVING product line is what should be there; a PINNED one means the product spells a
        // launcher the case thought it was driving, which is a real disagreement.
        if (kinds[0] === 'DERIVED') agreed += 1;
        else {
          mismatches.push({ site, expectation, product: cite(hits), products: sites(hits), kind: kinds[0],
            route: route ?? null,
            why: 'the case drove a pinned shell and asserted its rendering, but the product line SPELLS '
              + 'the launcher — the shell it was given changes nothing' });
        }
      } else if (kinds[0] !== expectation && caseDrivesPinned) {
        // The case drove a pinned shell, just not into the call it asserts — so whether that shell reached
        // this sentence is unknown here, and an unknown is recorded rather than reported either way.
        unresolved.push({ site, file: rel,
          why: 'the case drives a pinned shell in a different statement from the one asserted, so whether '
            + 'it reached this sentence needs dataflow this audit does not do' });
      } else if (kinds[0] !== expectation) {
        mismatches.push({ site, expectation, product: cite(hits), products: sites(hits), kind: kinds[0],
          route: route ?? null,
          why: expectation === 'PINNED'
            ? 'a pinned expectation against a product line that DERIVES — red on every Windows cell'
            : 'a derived expectation against a product line that is PINNED — red on every Windows cell' });
      } else agreed += 1;
    }
  }

  // The baseline, both directions.
  const counted = new Map();
  for (const u of unresolved) counted.set(u.file, (counted.get(u.file) ?? 0) + 1);
  const drift = [];
  for (const [file, entry] of baseline) {
    // The entry is `{ n, why }` now — ARC-07-C35b — but a bare number still works, because the audit's own
    // cases plant tiny baselines and should not have to carry prose to do it.
    const expected = typeof entry === 'number' ? entry : entry.n;
    const actual = counted.get(file) ?? 0;
    if (actual !== expected) drift.push(`${file}: ${actual} unresolved, the baseline says ${expected}`);
  }
  for (const [file, actual] of counted) {
    if (!baseline.has(file)) drift.push(`${file}: ${actual} unresolved site(s), and the file is not in the baseline`);
  }

  return { agreed, mismatches, unresolved, drift,
    ok: mismatches.length === 0 && drift.length === 0 };
}

const INVOKED_DIRECTLY = process.argv[1]
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (INVOKED_DIRECTLY) {
  const r = audit();
  if (process.argv.includes('--json')) {
    writeSync(1, `${JSON.stringify(r, null, 2)}\n`);
  } else {
    for (const m of r.mismatches) {
      writeSync(2, `launcher-audit: MISMATCH ${m.site} — ${m.expectation} expectation, `
        + `${m.kind} product at ${m.product}\n  ${m.why}\n`);
    }
    for (const d of r.drift) writeSync(2, `launcher-audit: BASELINE ${d}\n`);
    writeSync(1, `launcher-audit: ${r.agreed} asserted launcher(s) agree with the product line that `
      + `prints them; ${r.unresolved.length} unresolved (ARC-07-C35b)\n`);
  }
  if (!r.ok) process.exitCode = 1;
}
