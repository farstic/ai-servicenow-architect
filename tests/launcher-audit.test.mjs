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

import { audit, byKey, bySentence, UNRESOLVED_BASELINE } from '../scripts/ci/launcher-audit.mjs';
import { answeredBy, assertedLaunchers, MARK, productLines } from '../scripts/ci/launcher-extract.mjs';

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
