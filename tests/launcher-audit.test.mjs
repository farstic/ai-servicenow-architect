/**
 * ARC-07-C35 — the launcher audit, and its three failure modes each driven.
 *
 * The audit runs in the gate through this file, so `npm test` and the release dry-run both carry it.
 *
 * WHY THE MISMATCH CASES PLANT THEIR OWN SOURCES. The repository has 45 asserted launchers and NONE of
 * them resolves to a single product line today — the sentence a test asserts is not distinctive enough
 * to pick one out, which is ARC-07-C35b's work. So the mismatch path has no natural occurrence to fire
 * on, and a case that waited for one would be a case that never ran. Planting a product line and a test
 * line that asserts against it exercises the same code with a sentence distinctive enough to resolve,
 * which is the difference between a tested capability and an untested one.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { audit, byKey, bySentence, testSources, UNRESOLVED_BASELINE } from '../scripts/ci/launcher-audit.mjs';
import { answeredBy, assertedLaunchers, LAUNCHER, MARK, productLines } from '../scripts/ci/launcher-extract.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** A sentence nothing in the tree carries, so it resolves to exactly the planted product line. */
const SENTENCE = 'the frobnicator is not aligned; realign it with';

const productThatDerives = [{ file: 'lib/planted.mjs',
  text: `export const line = (spell) => \`${SENTENCE} \${spell.cli} frobnicate\`;\n` }];
const productThatPins = [{ file: 'lib/planted.mjs',
  text: `export const line = '${SENTENCE} ./snowarch frobnicate';\n` }];

const testThatPins = [{ file: 'tests/planted.test.mjs',
  text: `assert.equal(r.text, '${SENTENCE} ./snowarch frobnicate');\n` }];
const testThatDerives = [{ file: 'tests/planted.test.mjs',
  text: `const SPELL = spellings();\nassert.equal(r.text, \`${SENTENCE} \${SPELL.cli} frobnicate\`);\n` }];

const EMPTY = new Map();

test('the repository passes: every resolved launcher agrees, and the baseline matches', () => {
  const r = audit();
  assert.deepEqual(r.mismatches, [],
    `${r.mismatches.length} asserted launcher(s) disagree with the product line that prints them:\n  `
    + r.mismatches.map((m) => `${m.site}: ${m.why} (product ${m.product})`).join('\n  '));
  // EQUAL, both directions: a new unresolved site fails, and one that C35b has resolved fails too, so
  // the baseline shrinks with the work instead of outliving it.
  assert.deepEqual(r.drift, [],
    `the unresolved baseline no longer matches the tree:\n  ${r.drift.join('\n  ')}`);
});

test('failure 1 — a PINNED expectation against a product line that DERIVES', () => {
  const r = audit({ tests: testThatPins, product: productThatDerives, baseline: EMPTY });
  assert.equal(r.ok, false);
  assert.equal(r.mismatches.length, 1, JSON.stringify(r, null, 2));
  assert.equal(r.mismatches[0].expectation, 'PINNED');
  assert.equal(r.mismatches[0].kind, 'DERIVED');
  assert.match(r.mismatches[0].why, /red on every Windows cell/);
});

test('failure 1, the other direction — a DERIVED expectation against a PINNED product line', () => {
  // BOTH DIRECTIONS, because ARC-07-C31 got the same pair wrong each way in one push: a pinned
  // expectation against `store-command.ts` (which derives) and a derived one against `store.mjs`
  // (which does not), two commands apart in the same test.
  const r = audit({ tests: testThatDerives, product: productThatPins, baseline: EMPTY });
  assert.equal(r.ok, false);
  assert.equal(r.mismatches.length, 1, JSON.stringify(r, null, 2));
  assert.equal(r.mismatches[0].expectation, 'DERIVED');
  assert.equal(r.mismatches[0].kind, 'PINNED');
});

test('...and agreement in both directions is NOT reported as a mismatch', () => {
  // The other half of the control: a check that fails on everything is not a check. Pinned against
  // pinned and derived against derived must both be silent.
  const pinned = audit({ tests: testThatPins, product: productThatPins, baseline: EMPTY });
  assert.deepEqual(pinned.mismatches, []);
  assert.equal(pinned.agreed, 1);

  const derived = audit({ tests: testThatDerives, product: productThatDerives, baseline: EMPTY });
  assert.deepEqual(derived.mismatches, []);
  assert.equal(derived.agreed, 1);
});

test('failure 2 — an unresolved site in a file the baseline does not list', () => {
  // THE ONE THAT EARNS THE FILE TODAY. A launcher asserted against a sentence no product line carries
  // is unresolved, and an unresolved site in an unlisted file fails — so a NEW asserted launcher cannot
  // reach CI without someone having looked at it.
  const orphan = [{ file: 'tests/planted.test.mjs',
    text: "assert.equal(r.text, 'a sentence the product has never printed anywhere ./snowarch x');\n" }];
  const r = audit({ tests: orphan, product: productThatDerives, baseline: EMPTY });
  assert.equal(r.ok, false);
  assert.equal(r.unresolved.length, 1, JSON.stringify(r.unresolved));
  assert.match(r.drift.join('\n'), /is not in the baseline/);
});

test('failure 3 — a baseline count that no longer matches, in either direction', () => {
  const orphan = [{ file: 'tests/planted.test.mjs',
    text: "assert.equal(r.text, 'a sentence the product has never printed anywhere ./snowarch x');\n" }];

  // Too low: the file is listed, but with fewer sites than the tree has.
  const low = audit({ tests: orphan, product: productThatDerives,
    baseline: new Map([['tests/planted.test.mjs', 0]]) });
  assert.equal(low.ok, false);
  assert.match(low.drift.join('\n'), /1 unresolved, the baseline says 0/);

  // Too high: the sweep resolved one and the baseline was not shrunk. This direction is the one that
  // keeps the list honest, and `<=` would have let it rot.
  const high = audit({ tests: orphan, product: productThatDerives,
    baseline: new Map([['tests/planted.test.mjs', 2]]) });
  assert.equal(high.ok, false);
  assert.match(high.drift.join('\n'), /1 unresolved, the baseline says 2/);
});

test('a line that PASSES a spelling is not a target — the 106-false-target lesson', () => {
  // `formatResult(r, SPELL)` threads a spelling; it asserts nothing about a launcher. Treating the two
  // alike was the second design and it produced 106 false targets, which would have made the baseline
  // meaningless.
  const threading = [{ file: 'tests/planted.test.mjs',
    text: 'const SPELL = spellings();\nassert.equal(formatResult(r, SPELL).code, 0);\n' }];
  const r = audit({ tests: threading, product: productThatDerives, baseline: EMPTY });
  assert.deepEqual(r.unresolved, []);
  assert.deepEqual(r.mismatches, []);
  assert.equal(r.agreed, 0);
});

/* ── ARC-07-C35b — the exact extractor and command tracing ─────────────────────────────────────── */

test('C35b — the key is the asserted SENTENCE, never the expression it is asserted about', () => {
  // THE DEFECT ARC-07-C35 MEASURED. `expect(sv09.command).toBe(…)` keyed as `sv09.command`, because a
  // normaliser can strip `expect(` and `.toBe(` but cannot know where the expression between them ends.
  // The extractor takes the assertion's ARGUMENTS, so the expression is gone by construction.
  const text = [
    'const SERVER_CLI = cliSpelling();',
    'expect(sv09.command).toBe(`${SERVER_CLI} upgrade`);',
    "expect(status.configErrors[0]?.message).toContain(`${SERVER_CLI} store migrate`);",
  ].join('\n');
  const sites = assertedLaunchers('tests/planted.test.mjs', text);
  assert.equal(sites.length, 2, JSON.stringify(sites));
  for (const s of sites) {
    assert.doesNotMatch(s.sentence, /sv09|configErrors|expect|toBe|toContain/,
      `assertion scaffolding survived into the sentence: ${JSON.stringify(s.sentence)}`);
    assert.equal(s.expectation, 'DERIVED');
  }
  assert.match(sites[0].sentence, /upgrade$/);
  assert.match(sites[1].sentence, /store migrate$/);
});

test('C35b — a template, a `+` concatenation and a multi-line assertion extract; a regex is C35c', () => {
  // The shapes this row covers, each a way of writing the same sentence, and a line-based normaliser
  // handled none of them reliably — the multi-line one it could not see at all.
  const text = [
    "const CLI = spellings({ platform: 'linux', env: {} }).cli;",
    'assert.match(r.text, new RegExp(`usage: ${CLI} store <command>`));',
    "assert.equal(r.text, 'run ' + CLI + ' bootstrap --reset to start over');",
    'assert.equal(',
    '  r.text,',
    '  `the corpus is missing — ${CLI} docs sync`,',
    ');',
  ].join('\n');
  const sites = assertedLaunchers('tests/planted.test.mjs', text);
  assert.equal(sites.length, 3, JSON.stringify(sites.map((x) => x.sentence)));
  assert.match(sites[0].sentence, /^usage: .* store <command>$/);
  assert.match(sites[1].sentence, /^run .* bootstrap --reset to start over$/);
  assert.match(sites[2].sentence, /^the corpus is missing — .* docs sync$/,
    'a multi-line assertion was not extracted — the line-based version could not see these at all');

  // A LAUNCHER INSIDE A REGEX IS NOT A TARGET YET, and this asserts the SCOPE rather than a defect.
  // `/run \.\/snowarch doctor/` holds `\.\/snowarch`, so detecting it means unescaping first — which
  // finds 45 more sites and, measured, reported 13 correct tests as mismatches. Three pieces are missing
  // before that can be switched on, and they are ARC-07-C35c's. When it lands, this expectation flips to 1
  // in the same commit as the extractor change.
  const withRegex = assertedLaunchers('tests/planted.test.mjs',
    ["const CLI = spellings({ platform: 'linux', env: {} }).cli;",
      'assert.match(r.text, /run \\.\\/snowarch doctor --section legacy/);'].join('\n'));
  assert.equal(withRegex.length, 0,
    'a regex-borne launcher is being audited — if that is deliberate, ARC-07-C35c has landed and this '
    + 'case says 1 instead');
});

test('C35b — the launcher is marked on BOTH sides, so a pinned product line can be matched', () => {
  // The bug that made the architect's control pair fail its first direction: a pinned product line kept
  // `./snowarch` in its prose while the test had a MARK there, so the two could never match.
  const product = productLines('tools/snowarch/lib/planted.mjs',
    "export const USAGE = 'usage: ./snowarch store <command> [options]';\n");
  assert.equal(product.length, 1);
  assert.equal(product[0].kind, 'PINNED');
  assert.ok(product[0].sentence.includes(MARK),
    `the launcher was not marked in a pinned product line: ${JSON.stringify(product[0].sentence)}`);
  assert.match(product[0].sentence, /^usage: .* store <command> \[options\]$/);
});

test('C35b — command tracing routes by the argv the case RUNS, from the frame\'s own table', () => {
  // Piece (b). `COMMANDS.store.raw` is the frame saying everything after `store` is the server CLI's, and
  // only a bare `--help` is its own — so the route is read from the product rather than listed here.
  assert.equal(answeredBy(['store', '--help']), 'engine');
  assert.equal(answeredBy(['store', 'migrate', '--help']), 'server');
  assert.equal(answeredBy(['instance', '--help']), 'engine');
  assert.equal(answeredBy(['instance', 'add', 'pdi']), 'server');
  // A non-raw command is the frame's whatever follows it.
  assert.equal(answeredBy(['doctor', '--quick']), 'engine');
  assert.equal(answeredBy(['bootstrap', '--yes']), 'engine');
  // An argv that names no command this frame knows is NOT a guess.
  assert.equal(answeredBy(['--version']), null);
  assert.equal(answeredBy(null), null);
});

test('C35b — THE ARCHITECT\'S CONTROL PAIR: store-root-entry resolves, and a swap fails either way', () => {
  // THE CONTROL THIS ROW EXISTS TO EARN. `store --help` reaches the ENGINE's frame, which spells the
  // launcher (it is generated, and still on ARC-07-C31's exemption list); `store migrate --help` reaches
  // the SERVER, which derives it. Two commands apart in one file, the same sentence — `store <command>` —
  // so nothing but the argv can tell them apart. ARC-07-C35 reported the pair ambiguous and said so.
  const file = 'tools/snowarch/tests/store-root-entry.test.mjs';
  const original = readFileSync(resolve(root, file), 'utf8');
  const ENGINE_SITE = 'assert.match(r.text, new RegExp(`usage: ${FRAME_CLI} store <command>`));';
  const SERVER_SITE = 'assert.match(r.text, new RegExp(`usage: ${SERVER_CLI} store <command>`));';
  assert.ok(original.includes(ENGINE_SITE) && original.includes(SERVER_SITE),
    'the pair has been rewritten — this case pins the two lines it is about, so update it deliberately');

  // As committed: both resolve, and neither is a mismatch.
  const asIs = audit({ tests: [{ file, text: original }] });
  assert.deepEqual(asIs.mismatches, [], JSON.stringify(asIs.mismatches));
  assert.deepEqual(asIs.unresolved, [], JSON.stringify(asIs.unresolved));
  assert.ok(asIs.agreed >= 2, `only ${asIs.agreed} of the pair resolved`);

  // DIRECTION 1 — the engine's help asserted with the server's DERIVING spelling. Red on every Windows
  // cell, because the engine prints POSIX there and the expectation would follow the runner.
  const one = audit({ tests: [{ file, text: original.replace(ENGINE_SITE, SERVER_SITE) }] });
  assert.equal(one.mismatches.length, 1, JSON.stringify(one));
  assert.equal(one.mismatches[0].expectation, 'DERIVED');
  assert.equal(one.mismatches[0].kind, 'PINNED');
  assert.match(one.mismatches[0].product, /tools\/snowarch\/lib\/store\.mjs/);
  assert.equal(one.mismatches[0].route, 'engine');

  // DIRECTION 2 — the server's help asserted with the frame's PINNED POSIX spelling. The other way round,
  // and the one a reader is likelier to write by copying the line above it.
  const two = audit({ tests: [{ file, text: original.replace(SERVER_SITE, ENGINE_SITE) }] });
  assert.equal(two.mismatches.length, 1, JSON.stringify(two));
  assert.equal(two.mismatches[0].expectation, 'PINNED');
  assert.equal(two.mismatches[0].kind, 'DERIVED');
  assert.match(two.mismatches[0].product, /packages\/snowarch\/src\/cli\/store-command\.ts/);
  assert.equal(two.mismatches[0].route, 'server');
});

test('C35b — matching by SENTENCE resolves what matching by KEY could not', () => {
  // The two designs, measured against each other rather than argued. `${CLI} upgrade` has eight
  // characters of prose, so C35's twelve-character key rule dropped it; the MARK-normalised sentence
  // keeps the launcher's POSITION, which is what makes a short sentence usable.
  const product = [{ file: 'tools/snowarch/lib/planted.mjs',
    text: 'export const remedy = (spell) => `${spell.cli} upgrade`;\n' }];
  const tests = [{ file: 'tests/planted.test.mjs',
    text: 'const CLI = spellings();\nassert.equal(r.remedy, `${CLI} upgrade`);\n' }];

  const byKeyRun = audit({ tests, product, baseline: EMPTY, match: byKey });
  assert.equal(byKeyRun.agreed, 0, 'the key rule resolved a sentence it cannot see');
  assert.equal(byKeyRun.unresolved.length, 1);

  const bySentenceRun = audit({ tests, product, baseline: EMPTY, match: bySentence });
  assert.equal(bySentenceRun.agreed, 1, JSON.stringify(bySentenceRun));
  assert.deepEqual(bySentenceRun.unresolved, []);

  // ...and it does not resolve everything: a sentence that is ONLY the launcher still cannot be placed,
  // which is the 21 sites the baseline records with that reason.
  const bare = audit({ baseline: EMPTY, product,
    tests: [{ file: 'tests/planted.test.mjs', text: "expect(out).not.toContain('./snowarch');\n" }] });
  assert.equal(bare.agreed, 0);
  assert.equal(bare.unresolved.length, 1);
  assert.match(bare.unresolved[0].why, /no sentence beside the launcher|no product line carries/);
});

test('C35b — every baseline reason EQUALS the reason the audit computed (item 12)', () => {
  // THE SECOND BAR THIS ROW MERGES ON. The third head's list said its reasons came from the audit's own
  // report and they did not: the audit emitted four shapes, 83 of 86 entries were the same one, and the split
  // beside them was hand-made with fifteen entries wrong on inspection. A reason nobody can check is a claim.
  // `audit()` computes one per file now, and this compares them character for character.
  const r = audit();
  for (const [file, why] of r.computed) {
    const entry = UNRESOLVED_BASELINE.get(file);
    assert.ok(entry, `${file} is unresolved and not in the baseline`);
    assert.equal(entry.why, why,
      `${file}: the baseline reason is not the one the audit computed\n  baseline: ${entry.why}\n  audit:    ${why}`);
  }
  for (const [file] of UNRESOLVED_BASELINE) {
    assert.ok(r.computed.has(file), `${file} is in the baseline with nothing unresolved in it any more`);
  }
});

test('C35b — every baseline entry carries a reason, which is what "done" means for this row', () => {
  // The row's own definition: done when the baseline is empty or every remaining entry has a reason
  // written beside it. A count with no reason is a site nobody looked at, and this is what stops one
  // being added.
  for (const [file, entry] of UNRESOLVED_BASELINE) {
    assert.equal(typeof entry, 'object', `${file}: the baseline entry is a bare count with no reason`);
    assert.equal(typeof entry.n, 'number', `${file}: no count`);
    assert.ok(typeof entry.why === 'string' && entry.why.length >= 12,
      `${file}: the reason is missing or too short to be one — "${entry.why}"`);
  }
  assert.ok(UNRESOLVED_BASELINE.size > 0,
    'the baseline is empty — delete this case with it, and say so in the row');
});

/* ── ARC-07-C35b, second head — two under-reports the architect measured ───────────────────────── */

test('C35b — a comment cannot delete code: a `/*` in a line comment and a `*/` in a later regex', () => {
  // DEFECT 1, as the architect's control specifies it. `codeOf` blanked comments with a REGEX before the
  // parser saw the text, and a regex cannot tell a comment from a string: on
  // `tests/contract/gen-governance.test.mjs` the `/*` inside the line comment `rules/*.md` paired with a
  // `*/` inside a regex literal 443 lines later and blanked 452 lines, taking that file's two asserted
  // launchers to zero. Measured over 223 tracked test files: raw parse 114 sites, after `codeOf` 112.
  const text = [
    "// the rules live in .claude/rules/*.md and are generated",
    "const CLI = spellings({ platform: 'linux', env: {} }).cli;",
    'assert.equal(r.text, `run ${CLI} docs sync to fetch the corpus`);',
    "const SPLIT = /^[^*]*\\*\\/[a-z]+$/;",
    'assert.ok(SPLIT.test(x));',
  ].join('\n');
  const sites = assertedLaunchers('tests/planted.test.mjs', text);
  assert.equal(sites.length, 1,
    `the asserted launcher between a "/*" in a comment and a "*/" in a regex was lost: ${
      JSON.stringify(sites)}`);
  assert.match(sites[0].sentence, /^run .* docs sync to fetch the corpus$/);
});

test('C35b — and the file that found it: gen-governance\'s two sites are in the audit\'s output', () => {
  // THE SAME DEFECT AGAINST THE REAL TREE, which is what the architect asked for. Two sites, from the file
  // whose comment and regex happened to pair up. A fixture proves the mechanism; this proves the repository.
  const file = 'tests/contract/gen-governance.test.mjs';
  const sites = assertedLaunchers(file, readFileSync(resolve(root, file), 'utf8'));
  assert.equal(sites.length, 2, `${file} has ${sites.length} asserted launcher(s), expected 2`);
});

test('C35b — a WINDOWS-spelled literal is a target: the cooked value, never the source text', () => {
  // DEFECT 2, the architect's fixture verbatim in shape. `'.\\snowarch.cmd'` is written with TWO backslashes
  // in source and IS one backslash once cooked; `LAUNCHER` describes the cooked form, and the target rule
  // was testing `getText()`. Every Windows-spelled literal in the repository was therefore invisible —
  // including the seven engine literals ARC-07-C31 slice 2 fixed and the seventeen server ones from slice 3,
  // so `EXPECTED_RENDERING`, whose entire purpose is the win32 cell, had only ever seen POSIX.
  const win = ['test("w", () => {',
    '  const out = render({ platform: "win32" });',
    '  assert.equal(out, ".\\\\snowarch.cmd doctor");',
    '});'].join('\n');
  const winSites = assertedLaunchers('tests/planted.test.mjs', win);
  assert.equal(winSites.length, 1, `the Windows spelling was not seen: ${JSON.stringify(winSites)}`);
  // ...and it is an EXPECTED RENDERING, because the case DROVE win32 — by a platform literal, which is how
  // this repository drives the other platform since forcing `process.platform` was measured unusable.
  assert.equal(winSites[0].expectation, 'EXPECTED_RENDERING');

  // The POSIX twin was always seen; it is asserted beside it so the two cannot drift apart again.
  const posix = ['test("p", () => {',
    '  const out = render({ platform: "linux" });',
    '  assert.equal(out, "./snowarch doctor");',
    '});'].join('\n');
  assert.equal(assertedLaunchers('tests/planted.test.mjs', posix).length, 1);

  // AND THE REAL TREE, STRICTLY COUNTED — ARC-07-C35b item 13. The first version of this assertion scanned a
  // FOUR-LINE NEIGHBOURHOOD and got 13 where the strict answer, counting only the assertion's OWN literals,
  // is 11 — and its floor of ten hid the difference. `site.spelled` is computed from the launcher-bearing
  // literals themselves, so these are numbers rather than estimates, and they must be updated deliberately.
  const spelledWindows = [];
  for (const { file, text } of testSources()) {
    for (const site of assertedLaunchers(file, text)) if (site.spelled.windows) spelledWindows.push(site);
  }
  assert.equal(spelledWindows.length, 11,
    `${spelledWindows.length} Windows-spelled asserted launcher(s), expected 11 — it was ZERO before the `
    + 'cooked-value fix, so a fall toward nothing is that defect returning and a rise is cases to look at');
  const rendering = spelledWindows.filter((s) => s.expectation === 'EXPECTED_RENDERING').length;
  assert.equal(rendering, 8,
    `${rendering} of the Windows sites are EXPECTED_RENDERING, expected 8 — the architect measured 4 on the `
    + 'third head, and items 7 and 8 (the receiver chain and the named platform ctx) are what moved it');
});

test('C35b — one definition of LAUNCHER, exported, because the two had already diverged', () => {
  // `launcher-audit.mjs` carried its own copy with the source-escaped form while the extractor's carried
  // the cooked one — two regexes for "what a launcher looks like", in the file whose job is catching exactly
  // that kind of drift. The audit's copy is gone; this asserts it cannot come back.
  const auditSource = readFileSync(resolve(root, 'scripts/ci/launcher-audit.mjs'), 'utf8');
  assert.doesNotMatch(auditSource, /^const LAUNCHER =/m,
    'launcher-audit.mjs has its own LAUNCHER again — import it from launcher-extract.mjs instead');
  assert.doesNotMatch(auditSource, /^const codeOf =/m,
    'codeOf is back in front of the parser — it can only subtract, and it deleted 452 lines once');
  assert.ok(LAUNCHER.test('./snowarch') && LAUNCHER.test('.\\snowarch.cmd'),
    'the one definition no longer covers both spellings of the cooked value');
});

/* ── ARC-07-C35b, third head — the architect's adversarial review ──────────────────────────────── */

test('C35b — a `//` inside a template cannot swallow the lines after it (item 1, second fixture)', () => {
  // The other half of the `codeOf` defect: the LINE strip truncated a template at
  // `tools/snowarch/tests/b00-checks.test.mjs:93`, the unterminated template swallowed ten lines, a PHANTOM
  // site was invented at :93 and the real one at :102 was misattributed — its baseline reason was an
  // artefact of the strip. The parser reads the template as a template.
  const text = [
    "const CLI = spellings({ platform: 'linux', env: {} }).cli;",
    'const note = stripComments(`// observed on git 2.39.5',
    '  and on 2.43.0`);',
    'assert.equal(note.hint, `run ${CLI} doctor --section prereqs for the detail`);',
  ].join('\n');
  const sites = assertedLaunchers('tests/planted.test.mjs', text);
  assert.equal(sites.length, 1, `a phantom or lost site: ${JSON.stringify(sites.map((s) => s.line))}`);
  assert.equal(sites[0].line, 4, 'the site was attributed to the wrong line');
  assert.match(sites[0].sentence, /^run .* doctor --section prereqs for the detail$/);
});

test('C35b — the real file: b00-checks has no phantom site at :93 (item 1)', () => {
  const file = 'tools/snowarch/tests/b00-checks.test.mjs';
  const lines = assertedLaunchers(file, readFileSync(resolve(root, file), 'utf8')).map((s) => s.line);
  assert.deepEqual(lines, [102, 111],
    `the phantom at :93 is back or a real site moved: ${JSON.stringify(lines)}`);
});

test('C35b — an inline pinned spelling call is a PINNED expectation (item 3)', () => {
  // `${spellings({ platform: 'linux', env: {} }).cli}` states its kind INLINE, and the kind used to be read
  // only from a NAMED constant — so ARC-07-C35's own named control site,
  // `tools/snowarch/tests/store-forwarder.test.mjs:73`, was reported DERIVED against its own
  // "PINNED POSIX" comment.
  const file = 'tools/snowarch/tests/store-forwarder.test.mjs';
  const sites = assertedLaunchers(file, readFileSync(resolve(root, file), 'utf8'));
  const site = sites.find((s) => s.line === 73);
  assert.ok(site, `the site at :73 is gone: ${JSON.stringify(sites.map((s) => s.line))}`);
  assert.equal(site.expectation, 'PINNED');

  // ...and inline DERIVED is still derived, so this is reading the argument rather than assuming.
  const derived = assertedLaunchers('tests/planted.test.mjs',
    'assert.equal(r.text, `run ${spellings().cli} doctor --section legacy now`);');
  assert.equal(derived[0].expectation, 'DERIVED');
});

test('C35b — EXPECTED_RENDERING is the SHAPE, not a mention anywhere in the case (item 4)', () => {
  // THE ARCHITECT'S MUTATION, which the wide rule hid: a FRAME_CLI (pinned POSIX) assertion added to the
  // `migrate --help` case, against the SERVER's result. The case mentions a pinned constant elsewhere, so
  // "does the enclosing function mention one" answered yes and the site was called an expected rendering —
  // `agreed=4`, 0 mismatches, with the Windows-red class hidden inside it.
  const file = 'tools/snowarch/tests/store-root-entry.test.mjs';
  const original = readFileSync(resolve(root, file), 'utf8');
  const SERVER_SITE = 'assert.match(r.text, new RegExp(`usage: ${SERVER_CLI} store <command>`));';
  const mutated = original.replace(SERVER_SITE,
    `${SERVER_SITE}\n    assert.match(r.text, new RegExp(\`usage: \${FRAME_CLI} store <command>\`));`);
  assert.notEqual(mutated, original, 'the mutation did not apply — the pair has been rewritten');

  const r = audit({ tests: [{ file, text: mutated }] });
  assert.equal(r.mismatches.length, 1, JSON.stringify(r.mismatches));
  assert.equal(r.mismatches[0].expectation, 'PINNED');
  assert.equal(r.mismatches[0].kind, 'DERIVED');
  assert.equal(r.mismatches[0].route, 'server');

  // A SPAWN-SHAPED CASE DRIVES NOTHING BY ARGUMENT, which is the half that unhid it: every assertion in
  // that file has an argv, so none of them can be an expected rendering however much the case mentions.
  for (const s of assertedLaunchers(file, original)) {
    assert.notEqual(s.expectation, 'EXPECTED_RENDERING',
      `a spawn-shaped case at :${s.line} was called an expected rendering`);
  }

  // ...and the narrow shape IS recognised: a pinned ctx driven into the call whose value is asserted.
  const narrow = ['test("w", () => {',
    '  const out = render({ platform: "win32", env: {} });',
    '  assert.equal(out, "run .\\\\snowarch.cmd doctor --section legacy");',
    '});'].join('\n');
  const [site] = assertedLaunchers('tests/planted.test.mjs', narrow);
  assert.equal(site.expectation, 'EXPECTED_RENDERING');
  assert.equal(site.argv, null);

  // ...and it RESOLVES through bySentence, which the architect asked to be shown rather than assumed: the
  // branch is reachable, not decoration.
  const product = [{ file: 'tools/snowarch/lib/planted.mjs',
    text: 'export const line = (spell) => `run ${spell.cli} doctor --section legacy`;\n' }];
  const r2 = audit({ tests: [{ file: 'tests/planted.test.mjs', text: narrow }], product, baseline: EMPTY });
  assert.equal(r2.agreed, 1, JSON.stringify(r2));
  assert.deepEqual(r2.mismatches, []);
});

test('C35b — "pinned" is what the argument says, and a constant is read in its own scope (item 4)', () => {
  // `spellings({ platform: process.platform, env: process.env })` has an argument and derives from the
  // process anyway — counting arguments called it pinned.
  const fromProcess = assertedLaunchers('tests/planted.test.mjs', [
    'const S = spellings({ platform: process.platform, env: process.env });',
    'assert.equal(out, `run ${S.cli} doctor now`);',
  ].join('\n'));
  assert.equal(fromProcess[0].expectation, 'DERIVED');

  // Two cases, the same constant NAME, different kinds: a file-wide table collapsed them to the later one,
  // so the derived case could have hard-coded a launcher and passed.
  const dup = assertedLaunchers('tests/planted.test.mjs', [
    "test('a', () => { const cli = spellings().cli; assert.equal(x, `run ${cli} doctor here`); });",
    "test('b', () => { const cli = spellings({ platform: 'linux', env: {} }).cli;",
    '  assert.equal(y, `run ${cli} docs sync now`); });',
  ].join('\n'));
  assert.deepEqual(dup.map((s) => s.expectation), ['DERIVED', 'PINNED'],
    'the two cases collapsed to one kind — the constants table is file-wide again');
});

test('C35b — a container contributes its prose (item 5)', () => {
  // `['a', `run ${CLI} docs sync`].join('\n')` contributed only the SEPARATOR, because a call's receiver was
  // never read — and the site was then filed as "about the launcher alone", a reason that was false because
  // `carriesLauncher` had walked into the array and declared the site.
  const join = assertedLaunchers('tests/planted.test.mjs', [
    "const CLI = spellings({ platform: 'linux', env: {} }).cli;",
    "assert.equal(out, ['the corpus is missing', `run ${CLI} docs sync`].join('\\n'));",
  ].join('\n'));
  assert.equal(join.length, 1);
  assert.match(join[0].sentence, /the corpus is missing/);
  assert.match(join[0].sentence, /run .* docs sync/);

  // A BARE ARRAY LITERAL, and an inert control is why this assertion exists: `.join(sep)` takes its own path
  // in `proseOf` (the separator is part of the sentence), so degrading the array arm left the `.join` case
  // above passing and the control reported INERT. The arm is reached by an array asserted directly.
  const bare = assertedLaunchers('tests/planted.test.mjs', [
    "const CLI = spellings({ platform: 'linux', env: {} }).cli;",
    "assert.deepEqual(lines, ['the corpus is missing', `run ${CLI} docs sync`]);",
  ].join('\n'));
  assert.equal(bare.length, 1);
  assert.match(bare[0].sentence, /the corpus is missing/);
  assert.match(bare[0].sentence, /run .* docs sync/);

  // An object's property values, and an arrow's expression body, for the same reason.
  const obj = assertedLaunchers('tests/planted.test.mjs', [
    "const CLI = spellings({ platform: 'linux', env: {} }).cli;",
    'assert.deepEqual(r, { remedy: `run ${CLI} bootstrap --reset to start over` });',
  ].join('\n'));
  assert.match(obj[0].sentence, /^run .* bootstrap --reset to start over$/);
});

test('C35b — the route follows the subject, not the last spawn (item 6)', () => {
  // A case that runs two commands and asserts the FIRST was routed to the second package, so a correct
  // assertion became a mismatch against a product line it never reached.
  const two = ['test("t", () => {',
    "  const first = run(entry, ['store', '--help']);",
    "  const second = run(entry, ['store', 'migrate', '--help']);",
    '  assert.match(first.text, new RegExp(`usage: ${FRAME_CLI} store <command>`));',
    '  assert.match(second.text, new RegExp(`usage: ${SERVER_CLI} store <command>`));',
    '});',
    "const FRAME_CLI = spellings({ platform: 'linux', env: {} }).cli;",
    'const SERVER_CLI = spellings();',
  ].join('\n');
  const sites = assertedLaunchers('tests/planted.test.mjs', two);
  assert.deepEqual(sites.map((s) => s.answeredBy), ['engine', 'server'],
    `the route did not follow the subject: ${JSON.stringify(sites.map((s) => [s.line, s.argv]))}`);
});

test('C35b — a mismatch cites every product line that carries the sentence (item 7)', () => {
  // `hits[0]` on a path-sorted list named whichever same-kind line sorted first — `packages/` before
  // `tools/` — and a reader went to a line that was not the one under test.
  const product = [
    { file: 'packages/snowarch/src/a.ts', text: 'export const a = (s) => `run ${s.cli} doctor --section x`;\n' },
    { file: 'packages/snowarch/src/b.ts', text: 'export const b = (s) => `run ${s.cli} doctor --section x`;\n' },
  ];
  const tests = [{ file: 'packages/snowarch/tests/p.test.ts',
    text: "assert.equal(r.text, 'run ./snowarch doctor --section x');\n" }];
  const r = audit({ tests, product, baseline: EMPTY });
  assert.equal(r.mismatches.length, 1, JSON.stringify(r));
  assert.deepEqual(r.mismatches[0].products,
    ['packages/snowarch/src/a.ts:1', 'packages/snowarch/src/b.ts:1']);
  assert.match(r.mismatches[0].product, /a\.ts:1, packages\/snowarch\/src\/b\.ts:1/);
});

/* ── ARC-07-C35b, fourth head — the three false negatives, each with a case that sees it ─────────── */

/** A deriving product line to compare a hard-coded launcher against. */
const DERIVING_PRODUCT = [{ file: 'tools/snowarch/lib/planted.mjs',
  text: 'export const line = (spell) => `run ${spell.cli} doctor --section legacy now`;\n' }];

test('C35b — a later case cannot vouch for an earlier one (item 1, false negative)', () => {
  // THE FILE-WIDE PINNED SET. `spellingConstants` is keyed by NAME and last-wins, so a DERIVED case that
  // hard-codes POSIX was granted EXPECTED_RENDERING as soon as a LATER case declared the same name pinned —
  // and an expected rendering agrees with a deriving product line. A hard-coded launcher then passed the
  // audit because of a constant in a different test. `kindInScope` had fixed the expectation side only.
  const text = [
    "test('derives', () => {",
    '  const cli = spellings();',
    "  assert.equal(render(cli), 'run ./snowarch doctor --section legacy now');",
    '});',
    "test('pins', () => {",
    "  const cli = spellings({ platform: 'linux', env: {} });",
    '  assert.equal(render(cli), `run ${cli.cli} doctor --section legacy now`);',
    '});',
  ].join('\n');
  const sites = assertedLaunchers('tests/planted.test.mjs', text);
  assert.equal(sites.length, 2, JSON.stringify(sites.map((s) => s.line)));
  assert.notEqual(sites[0].expectation, 'EXPECTED_RENDERING',
    'the first case was vouched for by the second case\'s constant — a hard-coded launcher hidden');
  assert.equal(sites[0].expectation, 'PINNED');

  // ...and the audit reports it, which is the half that matters: a false negative is a mismatch that never
  // arrives, so the case asserts the arrival rather than the label alone.
  const r = audit({ tests: [{ file: 'tests/planted.test.mjs', text }],
    product: DERIVING_PRODUCT, baseline: EMPTY });
  assert.equal(r.mismatches.length, 1, JSON.stringify(r));
  assert.equal(r.mismatches[0].expectation, 'PINNED');
});

test('C35b — a pinned ctx with a DERIVED expectation is reported (item 2, false negative)', () => {
  // The ctx pins `linux` and the expectation reads the RUNNER's spelling. They agree on this machine and part
  // company on any other — which is what a Windows cell is — and the third head called it an expected
  // rendering, so the audit said nothing at all.
  const text = [
    "test('mixed', () => {",
    "  const out = render({ platform: 'linux', env: {} });",
    '  assert.equal(out, `run ${spellings().cli} doctor --section legacy now`);',
    '});',
  ].join('\n');
  const [site] = assertedLaunchers('tests/planted.test.mjs', text);
  assert.equal(site.expectation, 'DERIVED_ON_PINNED_SUBJECT');

  const r = audit({ tests: [{ file: 'tests/planted.test.mjs', text }],
    product: DERIVING_PRODUCT, baseline: EMPTY });
  assert.equal(r.mismatches.length, 1, JSON.stringify(r));
  assert.match(r.mismatches[0].why, /the expectation follows the runner while the value follows the ctx/);

  // ...and the same shape with a PINNED expectation is the legitimate one, so this is not a check that fires
  // on every driven case.
  const ok = assertedLaunchers('tests/planted.test.mjs', [
    "test('pinned both ends', () => {",
    "  const out = render({ platform: 'linux', env: {} });",
    "  assert.equal(out, 'run ./snowarch doctor --section legacy now');",
    '});',
  ].join('\n'));
  assert.equal(ok[0].expectation, 'EXPECTED_RENDERING');
});

test('C35b — a platform WORD in the case does not excuse a hard-coded launcher (item 3)', () => {
  // `caseDrivesPinned` asked whether the case MENTIONED 'win32'/'linux'/'darwin' anywhere — a skip condition
  // or a fixture value answered yes — and an UNKNOWN is a mismatch that never arrives. It now requires a
  // platform-bearing ctx passed as an ARGUMENT to a call: evidence that a shell was driven somewhere.
  const word = [
    "test('mentions a platform in a skip', () => {",
    "  if (process.platform === 'win32') return;",
    "  assert.equal(render(ctx).line, 'run ./snowarch doctor --section legacy now');",
    '});',
  ].join('\n');
  const r = audit({ tests: [{ file: 'tests/planted.test.mjs', text: word }],
    product: DERIVING_PRODUCT, baseline: EMPTY });
  assert.equal(r.mismatches.length, 1,
    `a hard-coded launcher was excused by the word "win32" in a skip condition: ${JSON.stringify(r)}`);
  assert.deepEqual(r.unresolved, []);

  // ...and the architect's ruling stands for the shape it was made for: a ctx DRIVEN into another call in the
  // same case keeps the site an UNKNOWN rather than a mismatch, because dataflow is what would settle it.
  const driven = [
    "test('drives a shell elsewhere', () => {",
    "  promptSecret('Password:', { io, platform: 'win32', env: {} });",
    "  assert.ok(stdout.written.includes('run ./snowarch doctor --section legacy now'));",
    '});',
  ].join('\n');
  const r2 = audit({ tests: [{ file: 'tests/planted.test.mjs', text: driven }],
    product: DERIVING_PRODUCT, baseline: EMPTY });
  assert.deepEqual(r2.mismatches, [], JSON.stringify(r2.mismatches));
  assert.equal(r2.unresolved.length, 1);
  assert.match(r2.unresolved[0].why, /needs dataflow this audit does not do/);
});

/* ── ARC-07-C35c — the smallest of the recorded shapes ─────────────────────────────────────────── */

test('C35c — a pinned shell is one whose PLATFORM is named, not one that avoids the word `process`', () => {
  // `pinsShell` asked "does this call have an argument, and does that argument avoid mentioning `process`",
  // which is a proxy for the question, and it broke BOTH ways. Measured on planted cases:
  //
  //   - `const plat = process.platform; const S = spellings({ platform: plat, env: {} })` with a hard-coded
  //     `./snowarch` asserted against `render(S)` came back EXPECTED_RENDERING — the audit vouching for a
  //     POSIX literal that follows the RUNNER's shell, which is red on any Windows cell. A FALSE NEGATIVE.
  //   - the same spelling asserted as `${S.cli}` came back PINNED, so a deriving expectation against a
  //     deriving product line would have been reported as a disagreement. A FALSE POSITIVE, same breath.
  //
  // Both directions are asserted, because a rule that fixed one and not the other would look right from
  // whichever side was measured first.
  const kindOf = (lines) => assertedLaunchers('tests/planted.test.mjs', lines.join('\n'))[0]?.expectation;

  // THE FALSE NEGATIVE. The shell is the runner's, so the literal is a pinned expectation to be compared.
  assert.equal(kindOf([
    'const plat = process.platform;',
    'const S = spellings({ platform: plat, env: {} });',
    "assert.equal(render(S), 'run ./snowarch doctor now please');",
  ]), 'PINNED');

  // THE FALSE POSITIVE. The expectation follows the runner, exactly as the product does.
  assert.equal(kindOf([
    'const plat = process.platform;',
    'const S = spellings({ platform: plat, env: {} });',
    'assert.equal(out, `run ${S.cli} doctor now please`);',
  ]), 'DERIVED');

  // ...and everything that WAS pinned stays pinned: a platform named directly, named one hop away, a named
  // ctx (the idiom in four test files), and a positional platform.
  assert.equal(kindOf([
    "const S = spellings({ platform: 'linux', env: {} });",
    'assert.equal(out, `run ${S.cli} doctor now please`);',
  ]), 'PINNED');
  assert.equal(kindOf([
    "const PLAT = 'win32';",
    'const S = spellings({ platform: PLAT, env: {} });',
    'assert.equal(out, `run ${S.cli} doctor now please`);',
  ]), 'PINNED');
  assert.equal(kindOf([
    "const WIN = { platform: 'win32', env: {} };",
    'const S = spellings(WIN);',
    'assert.equal(out, `run ${S.cli} doctor now please`);',
  ]), 'PINNED');
  assert.equal(kindOf([
    "const S = cliSpelling('win32', {});",
    'assert.equal(out, `run ${S} doctor now please`);',
  ]), 'PINNED');

  // ...and the two that must stay DERIVED: the process spelled out longhand, and no argument at all.
  assert.equal(kindOf([
    'const S = spellings({ platform: process.platform, env: process.env });',
    'assert.equal(out, `run ${S.cli} doctor now please`);',
  ]), 'DERIVED');
  assert.equal(kindOf([
    'const S = spellings();',
    'assert.equal(out, `run ${S.cli} doctor now please`);',
  ]), 'DERIVED');
});

test('C35c — and the audit REPORTS the false negative, which is what the bar is about', () => {
  // A false negative is a mismatch that never arrives, so the label alone proves nothing: the hard-coded
  // POSIX literal must reach `mismatches` against a product line that derives.
  const text = [
    "test('runner shell', () => {",
    '  const plat = process.platform;',
    '  const S = spellings({ platform: plat, env: {} });',
    "  assert.equal(render(S), 'run ./snowarch doctor now please');",
    '});',
  ].join('\n');
  // The product line carries THIS sentence — `DERIVING_PRODUCT` above says something else, and a sentence
  // that matches nothing resolves to nothing, which would have passed for the wrong reason.
  const product = [{ file: 'tools/snowarch/lib/planted.mjs',
    text: 'export const render = (spell) => `run ${spell.cli} doctor now please`;\n' }];
  const r = audit({ tests: [{ file: 'tests/planted.test.mjs', text }], product, baseline: EMPTY });
  assert.equal(r.mismatches.length, 1, JSON.stringify(r));
  assert.equal(r.mismatches[0].expectation, 'PINNED');
  assert.equal(r.mismatches[0].kind, 'DERIVED');
});

test('C35c — a search call\'s sentence is its argument, not the haystack it looks in', () => {
  // `proseOf` folded BOTH sides of a method call, so a prose receiver searched for its own needle contributed
  // the needle twice. Measured: `\`prefix run ${CLI} docs sync suffix\`.includes(\`run ${CLI} docs sync\`)` and
  // the same with `startsWith` each put it in 2×. A sentence with its own middle repeated matches no product
  // line, and `bySentence` is a containment test — so the site was unresolvable for a reason that had nothing
  // to do with the launcher.
  const HEAD = "const CLI = spellings({ platform: 'linux', env: {} }).cli;";
  const prose = (line) => assertedLaunchers('tests/planted.test.mjs', `${HEAD}\n${line}`)[0]?.sentence ?? '';
  const needle = `run ${MARK} docs sync`;
  const times = (text) => text.split(needle).length - 1;

  // The two shapes that doubled.
  assert.equal(times(prose(
    'assert.ok(`prefix run ${CLI} docs sync suffix`.includes(`run ${CLI} docs sync`));')), 1);
  assert.equal(times(prose(
    'assert.ok(`run ${CLI} docs sync now`.startsWith(`run ${CLI} docs sync`));')), 1);

  // ...and the one that never did, so the fix is not "drop the receiver everywhere".
  assert.equal(times(prose('assert.ok(text.includes(`run ${CLI} docs sync`));')), 1);

  // THE OTHER SIDE, which is why this is a LIST and not a rule about receivers: `.join(sep)` BUILDS the
  // expectation out of its receiver, and dropping that would lose the sentence entirely.
  const built = prose("assert.equal(out, ['the corpus is missing', `run ${CLI} docs sync`].join('\\n'));");
  assert.match(built, /the corpus is missing/);
  assert.equal(times(built), 1);

  // ...and a NON-search method keeps its receiver, which is the other half of "this is a list, not a rule
  // about receivers". `/re/.test(line)` is the sharper example of the same thing and cannot be used here: a
  // launcher inside a regex is not a target until ARC-07-C35c's regex arm lands, so it would assert nothing.
  const trimmed = prose('assert.equal(out, `run ${CLI} docs sync `.trim());');
  assert.match(trimmed, /^run .* docs sync\s*$/,
    'a non-search method lost its receiver — the expectation is the receiver in that shape');
  // THE TRAILING SPACE IS THE TEMPLATE'S OWN, and it stays: this extracts literals, it does not EVALUATE the
  // call, so `.trim()`'s effect is not applied. It does not matter because `bySentence` squashes whitespace
  // before comparing — and saying so here is cheaper than the next reader discovering it from a diff.
  assert.equal(trimmed.endsWith(' '), true);
});

test('C35c — a destructured or inline spawn subject routes to its OWN spawn (item 3)', () => {
  // Two shapes that both fell back to the LAST spawn in the case, so an assertion about the ENGINE's answer
  // was checked against the SERVER's product line — a mismatch attributed to a line the case never reached.
  //
  // Measured before the fix: the destructured one routed to `['store','migrate','--help']`; the inline one got
  // argv `null` and NO route when the other spawn came later, and that other spawn's route when it came first.
  const TAIL = "const FRAME_CLI = spellings({ platform: 'linux', env: {} }).cli;";
  const routeOf = (lines) => {
    const site = assertedLaunchers('tests/planted.test.mjs', `${lines.join('\n')}\n${TAIL}`)
      .find((s) => s.sentence.includes('store'));
    assert.ok(site, `no site was found at all:\n${lines.join('\n')}`);
    return { argv: site.argv, route: site.answeredBy };
  };

  // `const { text } = run(…)` — the binding is a pattern, not an identifier.
  assert.deepEqual(routeOf([
    "test('t', () => {",
    "  const { text } = run(entry, ['store', '--help']);",
    "  const second = run(entry, ['store', 'migrate', '--help']);",
    '  assert.match(text, new RegExp(`usage: ${FRAME_CLI} store <command>`));',
    '});',
  ]), { argv: ['store', '--help'], route: 'engine' });

  // An INLINE spawn, with the other one after it...
  assert.deepEqual(routeOf([
    "test('t', () => {",
    "  assert.match(run(entry, ['store', '--help']).text, new RegExp(`usage: ${FRAME_CLI} store <command>`));",
    "  const second = run(entry, ['store', 'migrate', '--help']);",
    '});',
  ]), { argv: ['store', '--help'], route: 'engine' });

  // ...and before it, which is the direction that silently routed to the wrong package.
  assert.deepEqual(routeOf([
    "test('t', () => {",
    "  const setup = run(entry, ['store', 'migrate', '--help']);",
    "  assert.match(run(entry, ['store', '--help']).text, new RegExp(`usage: ${FRAME_CLI} store <command>`));",
    '});',
  ]), { argv: ['store', '--help'], route: 'engine' });

  // `const [first] = …` is the same statement written differently, so the pattern arm covers both.
  assert.deepEqual(routeOf([
    "test('t', () => {",
    "  const [first] = [run(entry, ['store', '--help'])];",
    "  const second = run(entry, ['store', 'migrate', '--help']);",
    '  assert.match(first.text, new RegExp(`usage: ${FRAME_CLI} store <command>`));',
    '});',
  ]).route, 'engine');

  // ...and the shape that already worked keeps working, so this is not "always take the first spawn".
  assert.deepEqual(routeOf([
    "test('t', () => {",
    "  const first = run(entry, ['store', '--help']);",
    "  const second = run(entry, ['store', 'migrate', '--help']);",
    '  assert.match(second.text, new RegExp(`usage: ${FRAME_CLI} store <command>`));',
    '});',
  ]), { argv: ['store', 'migrate', '--help'], route: 'server' });
});
