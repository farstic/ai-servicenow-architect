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
 * PER SITE, as a MULTISET per file — ARC-07-C35c item 5, replacing a per-file count that could not see two
 * things. One site resolving while another appeared in the same file left the count unchanged, so the work and
 * the regression cancelled out silently; and a site listed as ambiguous could have its EXPECTATION flipped with
 * no drift at all, because ambiguity is filed before the expectation is compared and nothing else recorded it.
 *
 * An entry is `{ at, kind, n, why }`: the sentence that identifies the site, the expectation it carries, how
 * many sites in that file carry that exact triple, and the reason the audit computed. Three ways to drift, each
 * naming itself — a triple that is new, one that is resolved or gone, and one whose count moved.
 *
 * KEYED BY THE SENTENCE, NEVER BY `file:line`: a line number moves whenever anything above it is edited, so a
 * per-line baseline would churn on every unrelated change, and a list that churns is a list nobody reads. The
 * sentence moves when the ASSERTION changes, which is exactly when someone should look.
 *
 * AND A COUNT PER TRIPLE, because eight keys collided when there was one entry per distinct sentence:
 * `tools/snowarch/tests/text.test.mjs` has FOUR sites whose sentence is two launchers and nothing else, and two
 * other files have three each of a bare launcher. Without the count, one of those resolving would leave the
 * others matching and the drift would be silent — this item's own defect, one level down.
 *
 * EVERY ENTRY'S REASON IS THE ONE THE AUDIT COMPUTED, and a case asserts they are EQUAL — which is the
 * second bar this row merges on. The third head claimed as much and was wrong: the audit emitted four shapes,
 * 83 of 86 entries were the same `no product line carries "…"`, and the split beside them was hand-made with
 * fifteen entries wrong on inspection. A reason nobody can check is a claim, not an annotation.
 *
 * `reasonFor` above is the order of what can be DEMONSTRATED, and the counts here are its output on this head:
 *
 *   -  25  the product assembles this sentence, EACH NAMING the product line that shares four consecutive
 *          words with it. "Assembles" was 57 when it was a hand-made label and could be claimed of anything;
 *          it is 25 now, and every one of them points at a line a reader can open.
 *   -  20  the assertion is about the launcher alone — no prose to place it in, which is what a negative
 *          assertion like `expect(out).not.toContain('./snowarch')` is.
 *   -  17  no product line carries this sentence, said plainly instead of dressed as assembly.
 *   -   5  outside the product index: the case asserts a committed page (`docs/`, `.claude/`), which is POSIX
 *          by rule 3 and is not in the product index at all.
 *   -   5  regex syntax in the sentence: a template passed to `new RegExp` leaves `^`, `\.`, `.*` or `$` in
 *          the prose, and no product line can carry those. ARC-07-C35c's real blocker, now named per site
 *          rather than estimated at eight.
 *   -   2  a pinned and a deriving line both carry it, with no argv to route by.
 *   -   1  the case drives a pinned shell in another statement, so whether it reached this sentence needs
 *          dataflow this audit does not do.
 *
 * `tests/launcher-audit.test.mjs` IS IN THIS LIST at one site, and ARC-07-C35b item 14 was that the entry
 * called it a "planted fixture" while this file's own header and the row called it the real `LAUNCHER`
 * self-test. The row was right and the label was wrong — and the fix is not a better label, it is that the
 * audit COMPUTES the reason now: it says "the assertion is about the launcher alone", which is exactly what
 * `assert.ok(LAUNCHER.test('./snowarch') && LAUNCHER.test('.\\snowarch.cmd'))` is. Listing the file at all is
 * deliberate: excluding it by name would be an allow-list, which is the mistake this row exists to stop.
 */
export const UNRESOLVED_BASELINE = Object.freeze(new Map([
  ['packages/snowarch/tests/cli/import-legacy.test.ts', [
    { at: '~', kind: 'EXPECTED_RENDERING', n: 1, why: 'the assertion claims this sentence is absent' },
    { at: '~ instance add prod --url https://acme.service-now.com -', kind: 'DERIVED', n: 1, why: 'no product line carries this sentence' },
  ]],
  ['packages/snowarch/tests/cli/instance-manage.test.ts', [
    { at: '— = never probed. ~ instance test <label> probes one; --', kind: 'DERIVED', n: 1, why: 'the product assembles this sentence (packages/snowarch/src/cli/format.ts:151)' },
  ]],
  ['packages/snowarch/tests/cli/instance.test.ts', [
    { at: '~ instance add pdi', kind: 'DERIVED', n: 1, why: 'outside the product index' },
    { at: '~ instance add x --url https://h --env dev --auth oauth_', kind: 'DERIVED', n: 1, why: 'no product line carries this sentence' },
  ]],
  ['packages/snowarch/tests/cli/preset-ui.test.ts', [
    { at: 'WRITE is locked on production — raise it later with: ~ i', kind: 'DERIVED', n: 1, why: 'the product assembles this sentence (packages/snowarch/src/cli/preset-ui.ts:62)' },
  ]],
  ['packages/snowarch/tests/cli/store-command.test.ts', [
    { at: 'usage: ~ store', kind: 'DERIVED', n: 1, why: 'a pinned and a deriving line both carry it' },
  ]],
  ['packages/snowarch/tests/cli/tty.test.ts', [
    { at: 'On PowerShell/cmd use: ~ instance add … --password-stdin', kind: 'PINNED', n: 1, why: 'the case drives a pinned shell in another statement' },
    { at: '~ instance add', kind: 'EXPECTED_RENDERING', n: 1, why: 'a pinned and a deriving line both carry it' },
  ]],
  ['packages/snowarch/tests/servicenow/prod-ack.test.ts', [
    { at: '~ instance set-preset prod full --ack-prod', kind: 'DERIVED', n: 1, why: 'outside the product index' },
  ]],
  ['packages/snowarch/tests/tools/gate-split.test.ts', [
    { at: '~ instance set-preset pdi pdi-developer', kind: 'DERIVED', n: 1, why: 'outside the product index' },
  ]],
  ['packages/snowarch/tests/tools/permissions.test.ts', [
    { at: 'Write operations are disabled for instance "prod-lookali', kind: 'DERIVED', n: 1, why: 'the product assembles this sentence (packages/snowarch/src/utils/permissions.ts:257)' },
    { at: '~ instance set-preset prod <preset> --ack-prod', kind: 'DERIVED', n: 1, why: 'outside the product index' },
    { at: '~ instance set-preset prod full --ack-prod', kind: 'DERIVED', n: 1, why: 'outside the product index' },
  ]],
  ['tests/cli-help.test.mjs', [
    { at: '~', kind: 'EXPECTED_RENDERING', n: 1, why: 'the assertion claims this sentence is absent' },
  ]],
  ['tests/contract/gen-governance.test.mjs', [
    { at: 'Bash(~ doctor*)', kind: 'PINNED', n: 2, why: 'no product line carries this sentence' },
  ]],
  ['tests/contract/launcher-placeholder.test.mjs', [
    { at: '~', kind: 'EXPECTED_RENDERING', n: 2, why: 'the assertion is about the launcher alone' },
    { at: '~', kind: 'PINNED', n: 2, why: 'the assertion is about the launcher alone' },
  ]],
  ['tests/contract/runtime-errors.test.mjs', [
    { at: 'If two different runtime errors occur in one session, al', kind: 'PINNED', n: 1, why: 'no product line carries this sentence' },
    { at: '~', kind: 'PINNED', n: 1, why: 'the assertion is about the launcher alone' },
  ]],
  ['tests/docs-status.test.mjs', [
    { at: 'E-12 docs corpus: FAIL — corpus absent (docs mode "skip"', kind: 'DERIVED', n: 1, why: 'the product assembles this sentence (scripts/gen-doctor-docs.mjs:44)' },
  ]],
  ['tests/docs-upstream.test.mjs', [
    { at: '~', kind: 'DERIVED', n: 1, why: 'the assertion is about the launcher alone' },
  ]],
  ['tests/doctor/bootstrap-finished.test.mjs', [
    { at: '~', kind: 'DERIVED', n: 1, why: 'the assertion is about the launcher alone' },
  ]],
  ['tests/doctor/fix.test.mjs', [
    { at: 'SV-09 store schema v1 < server v2 ~ store migrate', kind: 'DERIVED', n: 1, why: 'no product line carries this sentence' },
    { at: 'SV-09.*run: ~ store migrate', kind: 'DERIVED', n: 1, why: 'regex syntax in the sentence' },
  ]],
  ['tests/doctor/framework.test.mjs', [
    { at: 'DOCTOR: 0 ok, 0 warn, 1 fail (E-00) (1 fixable — run ~ d', kind: 'DERIVED', n: 1, why: 'the product assembles this sentence (scripts/ci/doctor-snapshot.mjs:175)' },
    { at: 'DOCTOR: 1 ok, 0 warn, 1 fail (E-29) (1 fixable — run ~ d', kind: 'DERIVED', n: 1, why: 'the product assembles this sentence (scripts/ci/doctor-snapshot.mjs:175)' },
    { at: '~ x', kind: 'EXPECTED_RENDERING', n: 2, why: 'the assertion is about the launcher alone' },
  ]],
  ['tests/doctor/mode-and-cache.test.mjs', [
    { at: 'DOCTOR: 1 ok, 0 warn, 1 fail, 2 skipped (1 fixable — run', kind: 'DERIVED', n: 1, why: 'the product assembles this sentence (scripts/ci/doctor-snapshot.mjs:175)' },
    { at: 'Mode: design-only — ~', kind: 'DERIVED', n: 1, why: 'the product assembles this sentence (scripts/gen-doctor-docs.mjs:66)' },
  ]],
  ['tests/doctor/panel.test.mjs', [
    { at: 'Capability packs and the corpus branch are not probed on', kind: 'DERIVED', n: 1, why: 'the product assembles this sentence (tools/snowarch/lib/doctor/panel.mjs:190)' },
    { at: 'Capability packs, citation counts and the corpus branch ', kind: 'DERIVED', n: 2, why: 'the product assembles this sentence (tools/snowarch/lib/doctor/panel.mjs:190)' },
    { at: 'Docs: vendor/ServiceNowDocs @ ~ (australia) · sparse · c', kind: 'DERIVED', n: 1, why: 'the product assembles this sentence (tools/snowarch/lib/doctor/panel.mjs:109)' },
    { at: 'E-10 FAIL settings.local toggles match the recorded mode', kind: 'DERIVED', n: 1, why: 'no product line carries this sentence' },
    { at: 'Run ~ doctor --fix for the fixable ones (1).', kind: 'DERIVED', n: 1, why: 'the product assembles this sentence (tools/snowarch/lib/doctor/panel.mjs:276)' },
    { at: 'citation counts and the corpus branch are not probed on ', kind: 'DERIVED', n: 1, why: 'the product assembles this sentence (tools/snowarch/lib/doctor/panel.mjs:190)' },
    { at: '~ Engine: snowarch ~ · contract ~ Docs: vendor/ServiceNo', kind: 'DERIVED', n: 1, why: 'the product assembles this sentence (tools/snowarch/lib/doctor/panel.mjs:155)' },
  ]],
  ['tests/doctor/status-command.test.mjs', [
    { at: 'E-00 FAIL a check: it did not — ~ fix-it', kind: 'DERIVED', n: 1, why: 'no product line carries this sentence' },
    { at: 'Mode: unknown — doctor unavailable after it failed (Erro', kind: 'DERIVED', n: 1, why: 'the product assembles this sentence (tools/snowarch/lib/commands/status.mjs:75)' },
    { at: 'Run ~ doctor --fix for the fixable ones (1).', kind: 'DERIVED', n: 1, why: 'the product assembles this sentence (tools/snowarch/lib/doctor/panel.mjs:276)' },
  ]],
  ['tests/doctor/status-template.test.mjs', [
    { at: '**Do not run `~ doctor --quick --json`', kind: 'PINNED', n: 1, why: 'no product line carries this sentence' },
    { at: 'Mode: unverified — ~ status did not run', kind: 'PINNED', n: 1, why: 'no product line carries this sentence' },
    { at: 'On Windows without Git for Windows I cannot run ~ from h', kind: 'PINNED', n: 1, why: 'no product line carries this sentence' },
    { at: 'Run `~ status`.', kind: 'PINNED', n: 1, why: 'no product line carries this sentence' },
    { at: 'allowed-tools:.*Bash(~ status*)', kind: 'PINNED', n: 1, why: 'regex syntax in the sentence' },
  ]],
  ['tests/doctor/win32-remedies.test.mjs', [
    { at: '~', kind: 'EXPECTED_RENDERING', n: 3, why: 'the assertion is about the launcher alone' },
    { at: '~\\b', kind: 'PINNED', n: 2, why: 'the assertion claims this sentence is absent' },
  ]],
  ['tests/handoff-command.test.mjs', [
    { at: '~ instance add uat --url https://acme.service-now.com --', kind: 'PINNED', n: 1, why: 'no product line carries this sentence' },
    { at: '~ ~', kind: 'PINNED', n: 1, why: 'the assertion is about the launcher alone' },
  ]],
  ['tests/hook/session-start.test.mjs', [
    { at: '~~', kind: 'DERIVED', n: 1, why: 'the assertion is about the launcher alone' },
  ]],
  ['tests/launcher-audit.test.mjs', [
    { at: '~', kind: 'PINNED', n: 1, why: 'the assertion is about the launcher alone' },
  ]],
  ['tests/snowarch-skill.test.mjs', [
    { at: 'Bash(~ status*) Bash(node tools/snowarch/bin/snowarch.mj', kind: 'PINNED', n: 1, why: 'no product line carries this sentence' },
    { at: 'Mode: unverified — ~ status did not run (<cause>)', kind: 'PINNED', n: 1, why: 'no product line carries this sentence' },
  ]],
  ['tests/upgrade/upgrade-unit.test.mjs', [
    { at: 'E-27 FAIL Claude Code registration status: design-only i', kind: 'PINNED', n: 2, why: 'no product line carries this sentence' },
    { at: 'E-28 WARN release currency: v9.9.8 available — ~ upgrade', kind: 'PINNED', n: 1, why: 'no product line carries this sentence' },
    { at: 'SV-03 WARN instances: instances: pdi: flags explicit, pr', kind: 'PINNED', n: 1, why: 'no product line carries this sentence' },
    { at: 'SV-99 WARN: a check that no longer exists — ~ doctor', kind: 'PINNED', n: 1, why: 'no product line carries this sentence' },
    { at: '— ~ instance test pdi$', kind: 'PINNED', n: 1, why: 'regex syntax in the sentence' },
  ]],
  ['tests/upgrade/upgrade.e2e.test.mjs', [
    { at: 'A newer release is available (v9.2.0) — run ~ upgrade.', kind: 'PINNED', n: 1, why: 'the product assembles this sentence (tools/snowarch/lib/text.mjs:178)' },
  ]],
  ['tests/version-tag.test.mjs', [
    { at: 'gitlink bbbbbbb ≠ engine\\.config\\.json \\(run ~ docs veri', kind: 'DERIVED', n: 1, why: 'regex syntax in the sentence' },
  ]],
  ['tests/windows-spellings.test.mjs', [
    { at: '(?<!.\\snowarch)~', kind: 'PINNED', n: 1, why: 'the assertion claims this sentence is absent' },
    { at: 're-run ~ to resume at B04', kind: 'PINNED', n: 2, why: 'no product line carries this sentence' },
    { at: '~', kind: 'EXPECTED_RENDERING', n: 1, why: 'the assertion claims this sentence is absent' },
    { at: '~', kind: 'EXPECTED_RENDERING', n: 3, why: 'the assertion is about the launcher alone' },
    { at: '~', kind: 'PINNED', n: 1, why: 'the assertion is about the launcher alone' },
    { at: '~ upgrade', kind: 'PINNED', n: 1, why: 'the case drives a pinned shell in another statement' },
    { at: '~ upgrade.$', kind: 'EXPECTED_RENDERING', n: 1, why: 'regex syntax in the sentence' },
    { at: '~$', kind: 'EXPECTED_RENDERING', n: 1, why: 'the assertion is about the launcher alone' },
    { at: '~|~', kind: 'EXPECTED_RENDERING', n: 1, why: 'the assertion claims this sentence is absent' },
    { at: '~|~', kind: 'PINNED', n: 3, why: 'the assertion claims this sentence is absent' },
  ]],
  ['tests/workflows.test.mjs', [
    { at: 'call ~ --help', kind: 'PINNED', n: 2, why: 'no product line carries this sentence' },
  ]],
  ['tools/snowarch/tests/b00-checks.test.mjs', [
    { at: 'not at the repository root — run: cd "/repo" && ~', kind: 'EXPECTED_RENDERING', n: 1, why: 'no product line carries this sentence' },
    { at: 'not at the repository root — run: pushd "C:\\repo" ~', kind: 'EXPECTED_RENDERING', n: 1, why: 'no product line carries this sentence' },
  ]],
  ['tools/snowarch/tests/b02-docs.test.mjs', [
    { at: '[B02/09] docs … skipped (--docs skip) — the doctor will ', kind: 'DERIVED', n: 1, why: 'the product assembles this sentence (scripts/gen-doctor-docs.mjs:44)' },
    { at: '^\\d+ dead citation\\(s\\) — see ~ docs verify$', kind: 'DERIVED', n: 1, why: 'regex syntax in the sentence' },
    { at: 'area it-service-management missing — run ~ docs sync onc', kind: 'DERIVED', n: 1, why: 'the product assembles this sentence (scripts/gen-doctor-docs.mjs:44)' },
  ]],
  ['tools/snowarch/tests/b09-summary.test.mjs', [
    { at: 'E-10 FAIL settings.local toggles match the recorded mode', kind: 'PINNED', n: 1, why: 'no product line carries this sentence' },
    { at: 'Health check (quick): 14 ok · 1 warn (E-23) · 0 fail · 2', kind: 'EXPECTED_RENDERING', n: 1, why: 'the product assembles this sentence (tools/snowarch/lib/doctor/report-text.mjs:126)' },
    { at: 'this checkout is inside a cloud-synced folder (Dropbox) ', kind: 'PINNED', n: 1, why: 'the product assembles this sentence (tools/snowarch/lib/steps/B02.mjs:115)' },
  ]],
  ['tools/snowarch/tests/bootstrap-runner.test.mjs', [
    { at: 'FAIL B02: the corpus is empty Remedy: run ~ docs sync Re', kind: 'PINNED', n: 1, why: 'the product assembles this sentence (scripts/gen-doctor-docs.mjs:44)' },
    { at: 'Re-run ~ to resume at B02.', kind: 'PINNED', n: 2, why: 'no product line carries this sentence' },
    { at: 'interrupted during B04 — re-run ~ to resume at B04', kind: 'DERIVED', n: 1, why: 'no product line carries this sentence' },
    { at: '~ docs sync', kind: 'PINNED', n: 1, why: 'the case drives a pinned shell in another statement' },
    { at: '~|~', kind: 'PINNED', n: 1, why: 'the assertion claims this sentence is absent' },
  ]],
  ['tools/snowarch/tests/bootstrap-state.test.mjs', [
    { at: '~', kind: 'DERIVED', n: 1, why: 'the assertion is about the launcher alone' },
  ]],
  ['tools/snowarch/tests/cli.test.mjs', [
    { at: '^usage: ~ <command>', kind: 'EXPECTED_RENDERING', n: 2, why: 'regex syntax in the sentence' },
    { at: 'run ~ help', kind: 'PINNED', n: 1, why: 'the case drives a pinned shell in another statement' },
    { at: 'snowarch: unknown command "nope" — run ~ help', kind: 'DERIVED', n: 1, why: 'the product assembles this sentence (tools/snowarch/lib/cli.mjs:221)' },
    { at: '~', kind: 'EXPECTED_RENDERING', n: 2, why: 'the assertion claims this sentence is absent' },
    { at: '~', kind: 'PINNED', n: 1, why: 'the assertion claims this sentence is absent' },
  ]],
  ['tools/snowarch/tests/instance-root-entry.test.mjs', [
    { at: 'usage: ~ instance <command>', kind: 'PINNED', n: 1, why: 'the assertion claims this sentence is absent' },
  ]],
  ['tools/snowarch/tests/store-forwarder.test.mjs', [
    { at: 'usage: ~ store', kind: 'PINNED', n: 1, why: 'a pinned and a deriving line both carry it' },
  ]],
  ['tools/snowarch/tests/text.test.mjs', [
    { at: '2 more run with ~ doctor$', kind: 'EXPECTED_RENDERING', n: 1, why: 'regex syntax in the sentence' },
    { at: 'DOCTOR: 5 ok, 0 warn, 1 fail, 37 not in section (1 fixab', kind: 'DERIVED', n: 1, why: 'the product assembles this sentence (scripts/ci/doctor-snapshot.mjs:175)' },
    { at: 'Health check (quick): 13 ok · 1 warn (E-23) · 1 fail (E-', kind: 'DERIVED', n: 1, why: 'the product assembles this sentence (tools/snowarch/lib/doctor/report-text.mjs:126)' },
    { at: '~', kind: 'EXPECTED_RENDERING', n: 1, why: 'the assertion is about the launcher alone' },
    { at: '~ doctor$', kind: 'EXPECTED_RENDERING', n: 2, why: 'regex syntax in the sentence' },
    { at: '~ instance', kind: 'EXPECTED_RENDERING', n: 1, why: 'the assertion claims this sentence is absent' },
    { at: '~ instance set-preset pdi', kind: 'EXPECTED_RENDERING', n: 1, why: 'outside the product index' },
    { at: '~ mode live', kind: 'EXPECTED_RENDERING', n: 1, why: 'the assertion claims this sentence is absent' },
    { at: '~ ~', kind: 'EXPECTED_RENDERING', n: 4, why: 'the assertion is about the launcher alone' },
  ]],
]));

/** The tracked files, as `{ file, text }` — the default sources for both halves. */
export const productSources = (paths = PRODUCT_PATHS) => ls(...paths)
  .filter((f) => /\.(mjs|ts|js)$/.test(f) && !/\.test\./.test(f) && !/\.d\.ts$/.test(f))
  .map((file) => ({ file, text: read(file) }));

/**
 * ARC-07-C35c, piece 2 — THE COMMITTED ARTEFACTS, indexed as product lines of their own package.
 *
 * `tests/install-page.test.mjs:346` asserts that `README.md` and `docs/INSTALL.md` tell a reader to run
 * `./snowarch mode design`. That page is POSIX by rule 3 — it is committed, so its bytes are the same on every
 * runner — while its runtime twin in `engine-repo.mjs` derives, and BOTH are right. With only the source trees
 * indexed, the pinned expectation could only be compared against the deriving line, so a correct case was
 * reported as a defect. The artefact is the thing the case is about, so the artefact is in the index.
 *
 * `tools/snowarch/lib/text.json` is here for the same reason and is not a page: `text.test.mjs:146` asserts its
 * POSIX block, which is generated and committed exactly like a page.
 *
 * LINE-BASED, because these are not JavaScript: there is no AST, so a line carrying a launcher IS the product
 * line, and its kind is PINNED by construction — a committed file cannot derive anything at read time.
 */
const ARTEFACT_PATHS = ['docs', '.claude/rules', 'README.md', 'tools/snowarch/lib/text.json'];

export const artefactSources = (paths = ARTEFACT_PATHS) => ls(...paths)
  .filter((f) => /\.(md|json)$/.test(f) && !f.startsWith('docs/plans/'))
  .map((file) => ({ file, text: read(file) }));

/** Every line of a committed artefact that spells a launcher. */
export function artefactLines(sources = artefactSources()) {
  const out = [];
  for (const { file, text } of sources) {
    text.split('\n').forEach((line, i) => {
      if (!LAUNCHER_TEXT.test(line)) return;
      out.push({ file, line: i + 1, sentence: markLaunchersIn(squash(line)), kind: 'PINNED',
        package: 'artefact' });
    });
  }
  return out;
}

// NO BARE `snowarch.cmd` ALTERNATIVE, and the sweep in `tests/windows-spellings.test.mjs` refused my first
// version for having one: PowerShell does not resolve a command from the current directory, so a bare
// spelling is the defect ARC-07-W17 exists to stop — in a page as much as in a remedy. An artefact that
// carried one would be a finding, not a product line to match against.
const LAUNCHER_TEXT = /\.\/snowarch|\.\/bootstrap\.sh|\.\\snowarch\.cmd|\.\\bootstrap\.cmd/;
const markLaunchersIn = (text) => text.replace(new RegExp(LAUNCHER_TEXT.source, 'g'), MARK);

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
  /*
   * THE ARTEFACTS ARE NOT IN HERE, and measuring is why. Adding all 377 of their lines to the general candidate
   * pool took agreements from 44 to 11 and mismatches from 2 to 9: every artefact line is PINNED, so a sentence
   * that legitimately resolved against a deriving source line suddenly matched a committed page as well and
   * came out ambiguous — or matched only the page and was reported a defect. A page is the right candidate ONLY
   * for a case that reads a page, which is what the route below decides.
   */
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

  /*
   * AT WORD BOUNDARIES — ARC-07-C35c item 6.
   *
   * A bare `includes` matches mid-word: `doctor now` is inside `run the doctor nowhere near this`, which is a
   * different sentence about a different thing. Measured on the tree today: ZERO matches land mid-word, so this
   * changes nothing here and is a guard rather than a repair — the same shape as C35c's other items.
   *
   * WHAT THIS DELIBERATELY DOES NOT DO IS NARROW RESOLUTION, and the measurement is why. 40 sites resolve
   * today, 31 of them against FOUR OR MORE product lines and 30 on two words of prose or fewer — `~ doctor`
   * against 17 lines, `~ docs sync` against 29 — which looks like agreement by coincidence and is not: in every
   * one of the 40, EVERY matching line shares a kind, so whichever line prints the sentence the answer is the
   * same. That is universal quantification, and requiring three words of prose would have discarded 30 true
   * agreements for a theory. The residual limit is real and stays recorded on the row: the line under test may
   * be outside the hit set altogether, which the argv route narrows and C35c's remaining pieces narrow further.
   */
  const hay = squash(productProse);
  const isWord = (ch) => /[A-Za-z0-9]/.test(ch);
  for (let at = hay.indexOf(t); at !== -1; at = hay.indexOf(t, at + 1)) {
    const before = at === 0 ? '' : hay[at - 1];
    const after = at + t.length >= hay.length ? '' : hay[at + t.length];
    const opens = before === '' || !isWord(before) || !isWord(t[0]);
    const closes = after === '' || !isWord(after) || !isWord(t.at(-1));
    if (opens && closes) return true;
  }
  return false;
};

/**
 * EVERY hit, not `hits[0]` — the product lines are path-sorted, so citing the first named whichever of
 * several same-kind lines happened to sort earliest (`packages/` before `tools/`), and a reader then went to
 * a line that was not the one under test. The sentence is shared by all of them; the reader needs the list.
 */
const sites = (hits) => hits.map((h) => `${h.file}:${h.line}`);
const cite = (hits) => sites(hits).join(', ');

/**
 * THE REASON THE AUDIT CAN PROVE — ARC-07-C35b, fourth head, and the second bar this PR merges on.
 *
 * The third head's baseline said its reasons were "taken from the audit's own report", and that was FALSE:
 * the audit emitted four shapes (83 of 86 entries were the same `no product line carries "…"`), and the
 * 57/19/4/2 split beside them was hand-made — fifteen entries were wrong on inspection. A hand-made reason is
 * a claim nobody checks, which is the shape of defect this whole arc keeps finding.
 *
 * So the reason is COMPUTED, in the order of what can be demonstrated, and the baseline must equal it:
 *
 *   1. no prose at all                      → the assertion is about the launcher alone
 *   2. regex syntax in the sentence          → a template passed to `new RegExp` leaves `^`, `\.`, `.*`, `$`
 *                                              in the prose, and no product line can carry those
 *   3. a product line matches once its       → the product spells a placeholder the fixture fills, NAMING
 *      `<…>` placeholders are wildcarded        that line
 *   4. a product line shares four or more    → the product assembles this sentence, NAMING that line. This
 *      consecutive words                        is the ONLY way "assembles" may be claimed now
 *   5. a committed page carries it           → outside the product index (`docs/`, `.claude/`): the case
 *                                              asserts an artefact, not a product line
 *   6. the argv routed it                    → the routed package carries no such sentence
 *   7. otherwise                             → no product line carries this sentence
 */
const RX_SYNTAX = /\\[.\/\\]|\.\*|\[\^|\(\?:|\$$|^\^/;

const squashOne = (text) => text.replace(/\s+/g, ' ').trim();

/** The product sentence with its `<label>`-shaped placeholders treated as wildcards. */
const placeholderMatch = (productProse, testProse) => {
  if (!/<[a-z][a-z-]*>/i.test(productProse)) return false;
  const parts = squashOne(productProse).split(/<[a-z][a-z-]*>/i).map((x) => x.trim()).filter((x) => x.length >= 3);
  if (parts.length === 0) return false;
  let at = 0;
  const hay = squashOne(testProse);
  for (const part of parts) {
    const found = hay.indexOf(part, at);
    if (found === -1) return false;
    at = found + part.length;
  }
  return true;
};

/** Four consecutive words in common — enough to say the product builds this sentence from parts. */
const sharesAnchor = (productProse, testProse) => {
  const words = squashOne(productProse).split(' ').filter((w) => w.length > 0);
  const hay = ` ${squashOne(testProse)} `;
  for (let i = 0; i + 4 <= words.length; i += 1) {
    if (hay.includes(` ${words.slice(i, i + 4).join(' ')} `)) return true;
  }
  return false;
};

/** The committed pages a case may be asserting instead of a product line. */
let pagesCache = null;
const committedPages = () => {
  if (pagesCache) return pagesCache;
  pagesCache = ls('docs', '.claude', 'README.md')
    .filter((f) => /\.(md|json)$/.test(f))
    .map((file) => ({ file, text: read(file) }));
  return pagesCache;
};

export function reasonFor({ prose, route }, product) {
  const bare = prose.replaceAll(MARK, '').trim();
  if (bare.length < 3) return 'the assertion is about the launcher alone';
  if (RX_SYNTAX.test(prose)) return 'regex syntax in the sentence';

  const byPlaceholder = product.find((line) => placeholderMatch(line.sentence, prose));
  if (byPlaceholder) {
    return `the product spells a placeholder the fixture fills (${byPlaceholder.file}:${byPlaceholder.line})`;
  }
  const byAnchor = product.find((line) => sharesAnchor(line.sentence, prose));
  if (byAnchor) return `the product assembles this sentence (${byAnchor.file}:${byAnchor.line})`;

  // A sentence a committed page carries is a sentence about an ARTEFACT — `docs/INSTALL.md` is POSIX by
  // rule 3 — and the product index does not contain pages, so no product line ever could.
  const needle = bare.split(MARK)[0].trim();
  if (needle.length >= 8 && committedPages().some(({ text }) => text.includes(needle))) {
    return 'outside the product index';
  }
  if (route) return `the routed ${route} package carries no such sentence`;
  return 'no product line carries this sentence';
}

export function audit({ tests = testSources(), product: productFiles = productSources(),
  baseline = UNRESOLVED_BASELINE, match = bySentence, artefacts: artefactFiles = null } = {}) {
  const product = productIndex(productFiles);
  // Injected for the cases, exactly as `tests`/`product` are: a planted page has to be auditable
  // without committing one.
  const artefacts = artefactFiles ? artefactLines(artefactFiles) : artefactLines();
  const mismatches = [];
  const unresolved = [];
  let agreed = 0;
  const agreedOver = { one: 0, few: 0, many: 0 };

  for (const { file: rel, text } of tests) {
    // ARC-07-C35b — the extractor finds the assertions and their prose; this decides what that means.
    for (const found_site of assertedLaunchers(rel, text)) {
      const { line, expectation, sentence: prose, argv, answeredBy: route,
        caseDrivesPinned, negative, readsArtefact } = found_site;
      const site = `${rel}:${line}`;
      // `continue`, not `return`: this loop is a `for...of` now, and the `return` the `forEach` version
      // used would have returned from `audit()` — measured, it made the whole result `undefined` on the
      // first site with no distinctive sentence.
      const shown = keyOf(prose) ?? squash(prose);
      /*
       * A STABLE IDENTITY PER SITE — ARC-07-C35c item 5, and NOT the line number.
       *
       * The baseline was a per-file COUNT, so one site resolving while another appeared in the same file was
       * silent, and a flipped expectation on a site already listed as ambiguous never drifted at all: the
       * count was the same either way. Both need per-site identity.
       *
       * Keyed by the SENTENCE rather than `file:line`, because a line number moves whenever anything above it
       * is edited: a per-line baseline would churn on every unrelated change, and a list that churns is a list
       * nobody reads. The sentence moves when the ASSERTION changes, which is exactly when someone should look.
       */
      /*
       * THE BARE SPELLING IS MASKED IN THE KEY TOO, and the sweep is what asked for it: a site key is a
       * SENTENCE, and `tests/windows-spellings.test.mjs` asserts against its own `BARE_INVOCATION` pattern, so
       * the key came out holding the text `snowarch.cmd` — which `ARC-07-W17` forbids in any shipped file,
       * including this one, because PowerShell does not resolve a command from the current directory. Masking
       * every spelling of the launcher, bare included, keeps the key an identity and keeps this file honest.
       */
      const at = squash(prose)
        .replaceAll(MARK, '~')
        .replace(/(?<![.\\/])\b(snowarch|bootstrap)\.cmd\b/g, '~')
        .slice(0, 56);
      if (!shown) {
        unresolved.push({ site, file: rel, at, kind: expectation,
          why: 'no sentence beside the launcher at all',
          reason: 'the assertion is about the launcher alone' });
        continue;
      }

      // COMMAND TRACING, the row's piece (b): when the case SPAWNS a command, only the package that
      // answers it can be the line under test. `store <command>` matches a pinned engine line and a
      // deriving server one, and the argv is what says which — `['store','--help']` is the frame's own
      // answer, `['store','migrate','--help']` is forwarded. Without this the pair is ambiguous and the
      // architect's named control cannot fire at all, which is why this row exists.
      /*
       * A NEGATIVE assertion is RECORDED, never compared — ARC-07-C35c's regex arm.
       *
       * `assert.doesNotMatch(r.text, /usage: \.\/snowarch instance <command>/)` claims the engine's usage is
       * NOT in that output. No product line can settle that: the case is not saying the product prints this
       * sentence, it is saying this output does not. Comparing kinds reported `instance-root-entry.test.mjs:88`
       * as a defect for asserting an absence.
       */
      if (negative) {
        unresolved.push({ site, file: rel, at, kind: expectation,
          reason: 'the assertion claims this sentence is absent',
          why: `"${shown.slice(0, 48)}" is asserted ABSENT, which no product line can settle` });
        continue;
      }

      /*
       * ARC-07-C35c, piece 3 — ROUTE BY WHAT THE SUBJECT READS.
       *
       * `assert.match(read('README.md'), /\.\/snowarch mode design/)` is a claim about a committed page, and
       * the page is POSIX by rule 3 while its runtime twin derives — both right. The argv route answers "which
       * package runs this"; this answers the same question for a case that runs nothing and reads a file
       * instead, and it is what lets the artefacts be candidates without flooding every other site.
       */
      const routed = readsArtefact
        ? [...artefacts, ...product.filter((p) => p.package === 'artefact')]
        : (route ? product.filter((p) => p.package === route)
          : product.filter((p) => p.package !== 'artefact'));
      const hits = routed.filter((p) => match(prose, p.sentence));
      const kinds = [...new Set(hits.map((h) => h.kind))];
      if (hits.length === 0) {
        unresolved.push({ site, file: rel, at, kind: expectation,
          reason: reasonFor({ prose, route }, product),
          why: route
            ? `no ${route} line carries "${shown.slice(0, 48)}" (argv ${JSON.stringify(argv)})`
            : `no product line carries "${shown.slice(0, 48)}"` });
      } else if (kinds.length > 1) {
        unresolved.push({ site, file: rel, at, kind: expectation,
          reason: 'a pinned and a deriving line both carry it',
          why: `"${shown.slice(0, 48)}" matches both a PINNED and a DERIVED product line` });
      } else if (expectation === 'DERIVED_ON_PINNED_SUBJECT') {
        // Item 2: the case drove a pinned shell and then asserted the RUNNER's spelling against it. Red on
        // any machine whose shell differs from the one driven, whatever the product line does.
        mismatches.push({ site, expectation, product: cite(hits), products: sites(hits), kind: kinds[0],
          route: route ?? null,
          why: 'the case drove a pinned shell and asserted a DERIVED spelling against it — the expectation '
            + 'follows the runner while the value follows the ctx, so the two part company off this machine' });
      } else if (expectation === 'EXPECTED_RENDERING') {
        // The case supplied a pinned shell and asserted that shell's rendering — ARC-07-C31's own pattern.
        // A DERIVING product line is what should be there; a PINNED one means the product spells a
        // launcher the case thought it was driving, which is a real disagreement.
        if (kinds[0] === 'DERIVED') {
          agreed += 1;
          // Counted in the same histogram, so it totals the agreements rather than most of them.
          agreedOver[hits.length === 1 ? 'one' : hits.length <= 3 ? 'few' : 'many'] += 1;
        }
        else {
          mismatches.push({ site, expectation, product: cite(hits), products: sites(hits), kind: kinds[0],
            route: route ?? null,
            why: 'the case drove a pinned shell and asserted its rendering, but the product line SPELLS '
              + 'the launcher — the shell it was given changes nothing' });
        }
      } else if (kinds[0] !== expectation && caseDrivesPinned) {
        // The case drove a pinned shell, just not into the call it asserts — so whether that shell reached
        // this sentence is unknown here, and an unknown is recorded rather than reported either way.
        unresolved.push({ site, file: rel, at, kind: expectation,
          reason: 'the case drives a pinned shell in another statement',
          why: 'the case drives a pinned shell in a different statement from the one asserted, so whether '
            + 'it reached this sentence needs dataflow this audit does not do' });
      } else if (kinds[0] !== expectation) {
        mismatches.push({ site, expectation, product: cite(hits), products: sites(hits), kind: kinds[0],
          route: route ?? null,
          why: expectation === 'PINNED'
            ? 'a pinned expectation against a product line that DERIVES — red on every Windows cell'
            : 'a derived expectation against a product line that is PINNED — red on every Windows cell' });
      } else {
        agreed += 1;
        // ARC-07-C35c item 6 — HOW MANY LINES an agreement rests on, so its strength is visible in the report
        // rather than implied by a single number. One line is a resolution; twenty-nine lines that all share a
        // kind is a universal answer, which is sound and weaker, and a reader deserves to see which it was.
        const bucket = hits.length === 1 ? 'one' : hits.length <= 3 ? 'few' : 'many';
        agreedOver[bucket] += 1;
      }
    }
  }

  /*
   * THE BASELINE, PER SITE AND BOTH DIRECTIONS — ARC-07-C35c item 5.
   *
   * A per-file count could not see two things. One site resolving while another appeared in the same file left
   * the count unchanged, so the work and the regression cancelled out silently. And a site listed as ambiguous
   * could have its EXPECTATION flipped — a pinned expectation made deriving, or the reverse — with no drift at
   * all, because ambiguity is filed before the expectation is compared and nothing else recorded it.
   *
   * So an entry is `{ at, why, kind }` per site: the sentence that identifies it, the reason the audit
   * computed, and the expectation it carries. Three ways to drift now — a site that is new, a site that is
   * gone, and a site whose reason or expectation changed — and each names itself.
   */
  /*
   * A MULTISET PER FILE, not a list of unique sentences — measured, because eight keys collided.
   *
   * `tools/snowarch/tests/text.test.mjs` has FOUR sites whose sentence is two launchers and nothing else, and
   * `win32-remedies` and `windows-spellings` have three each of a bare launcher. With one entry per distinct
   * sentence, one of those resolving would leave the others matching and the drift would be silent — the very
   * defect this item is about, moved one level down. So each distinct `{ at, kind, why }` carries a COUNT, and
   * the comparison is between multisets: three becoming two is drift, and it says which triple moved.
   *
   * The count is per triple rather than per file, which is what makes it different from what it replaces: a
   * file's total can stay the same while one sentence resolves and another appears, and that now shows as one
   * `resolved` line and one `new` line.
   */
  const tally = (list) => {
    const out = new Map();
    for (const e of list) {
      const key = `${e.at}\u0000${e.kind}\u0000${e.why}`;
      const at = out.get(key) ?? { at: e.at, kind: e.kind, why: e.why, n: 0 };
      at.n += 1;
      out.set(key, at);
    }
    return out;
  };

  const perFile = new Map();
  for (const u of unresolved) {
    if (!perFile.has(u.file)) perFile.set(u.file, []);
    perFile.get(u.file).push({ at: u.at, kind: u.kind, why: u.reason });
  }
  const found = new Map([...perFile].map(([file, list]) => [file, tally(list)]));

  const drift = [];
  const describe = (e) => `${e.n}× ${e.at} [${e.kind}] — ${e.why}`;
  const keyed = (e) => `${e.at}\u0000${e.kind}\u0000${e.why}`;

  for (const [file, entry] of baseline) {
    const expected = tally(Array.isArray(entry) ? entry.flatMap((e) => Array(e.n ?? 1).fill(e)) : []);
    const actual = found.get(file) ?? new Map();
    for (const [key, want] of expected) {
      const have = actual.get(key);
      if (!have) drift.push(`${file}: resolved or gone — ${describe(want)}`);
      else if (have.n !== want.n) {
        drift.push(`${file}: ${have.n} now, the baseline says ${want.n} — ${want.at} [${want.kind}]`);
      }
    }
    for (const [key, have] of actual) {
      if (!expected.has(key)) drift.push(`${file}: new — ${describe(have)}`);
    }
  }
  for (const [file, actual] of found) {
    if (!baseline.has(file)) {
      const n = [...actual.values()].reduce((sum, e) => sum + e.n, 0);
      drift.push(`${file}: ${n} unresolved site(s), and the file is not in the baseline`);
    }
  }

  /*
   * THE RECORDS PER FILE, computed here so the baseline can be compared to them rather than trusted. The case
   * that asserts the two are equal is the second bar this row merges on.
   */
  const computed = new Map([...found].map(([file, counts]) => [file,
    [...counts.values()].sort((a, b) => (keyed(a) < keyed(b) ? -1 : keyed(a) > keyed(b) ? 1 : 0))]));

  return { agreed, agreedOver, mismatches, unresolved, drift, computed,
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
