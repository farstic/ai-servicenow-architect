/**
 * ARC-02-S04 AC 4 — "a dispatched Developer sub-agent produces the same artefact structure as
 * before", with a fixture that says what that means.
 *
 * The criterion referenced a `*.structure.baseline.txt` under the regression fixtures, which does
 * not exist: the baseline and post-change captures were committed to a pull request and never to
 * the tree, so the criterion pointed at a file no clone has (acceptance item B02-03). The path is
 * described rather than spelled here — L05 refuses a dead path, and it cannot tell a citation from
 * an explanation of why the citation is dead.
 *
 * AND A LITERAL BASELINE WOULD HAVE BEEN THE WRONG FIXTURE ANYWAY, which the harness had already
 * worked out and written down: "two captures of the SAME unchanged tree differ by whole H2
 * sections, because heading wording is model output and varies run to run". A byte-comparison
 * against a captured artefact would fail on every run for reasons that are not regressions — the
 * worst kind of check, because it trains its reader to ignore it.
 *
 * What does not vary is the OUTPUT CONTRACT: seven elements the agent body requires. That is what
 * `T-01-contract.json` holds, and it is GENERATED FROM THE HARNESS so the two cannot drift — the
 * harness is where the contract is enforced against a real capture, this is where it is recorded.
 *
 * The run itself needs `claude` and a live session, so it is not a unit test; it is the harness,
 * and its record goes under `docs/spikes/validation-runs/`. What CAN be asserted without a session
 * is that the fixture and the harness still agree, and that is what this does.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const FIXTURE = 'tests/fixtures/regression/T-01-contract.json';
const HARNESS = 'scripts/validation/t01-regression.mjs';

/** The harness's own list, parsed from its source — the one definition. */
export function contractInHarness(src) {
  const m = /const CONTRACT = \[([\s\S]*?)\n {2}\];/.exec(src);
  if (!m) return null;
  return [...m[1].matchAll(/\['([^']+)', (\/.*\/[a-z]*)\],/g)].map((x) => ({ key: x[1], pattern: x[2] }));
}

test('AC 4 — the recorded contract is the harness\'s contract, element for element', () => {
  const fixture = JSON.parse(read(FIXTURE));
  const harness = contractInHarness(read(HARNESS));

  assert.ok(harness, `could not parse the CONTRACT list out of ${HARNESS}`);
  assert.equal(harness.length, 7, `the harness lists ${harness.length} elements, not seven`);
  assert.deepEqual(fixture.elements, harness,
    `${FIXTURE} and ${HARNESS} disagree — regenerate the fixture from the harness`);
});

test('AC 4 — every element is a usable check, not a label', () => {
  // A contract entry whose pattern does not compile, or matches everything, would pass the
  // agreement test above while asserting nothing about a capture.
  const fixture = JSON.parse(read(FIXTURE));
  for (const { key, pattern } of fixture.elements) {
    const m = /^\/(.*)\/([a-z]*)$/s.exec(pattern);
    assert.ok(m, `${key}: "${pattern}" is not a regular expression literal`);
    const re = new RegExp(m[1], m[2]);
    assert.equal(re.test(''), false, `${key} matches the empty string — it would pass on no artefact`);
    assert.equal(re.test('an artefact about nothing in particular'), false,
      `${key} matches unrelated prose — it would pass on any answer`);
  }

  // The verbatim manifest sentence is the one element that is quoted rather than shaped, so it is
  // checked against the sentence CLAUDE.md actually requires — two copies that could drift.
  const verbatim = fixture.elements.find((e) => e.key === 'manifest-verbatim');
  assert.ok(verbatim, 'the verbatim manifest element is gone');
  assert.ok(read('CLAUDE.md').includes('Code artefact produced. Proposing a Code Reviewer pass'),
    'CLAUDE.md no longer carries the sentence the contract quotes');
});
