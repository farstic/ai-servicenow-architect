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

import { audit } from '../scripts/ci/launcher-audit.mjs';

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
