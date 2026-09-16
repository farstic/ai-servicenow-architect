/**
 * ARC-00 — the owner's initials landed on 2026-09-16, and no cell may quietly go back to waiting.
 *
 * `PENDING OWNER` was the marker for a decision only the owner can make. Dates are evidence and
 * initials are consent, and this repository's own rule is that it may not manufacture one from the
 * other — so for nine days the ADRs carried the dates with the cells left open, on purpose.
 *
 * A test enforcing that was REFUSED at the time, and rightly: it would have been red from the day
 * it was written until the sitting happened, for a reason that was not a defect — "a test that is
 * red by design on eight files is noise" (`docs/spikes/OWNER-SITTING.md`). This one is the opposite
 * shape. It is green because the initials arrived, and it fails only if somebody removes them or
 * adds a new uninitialled cell. A ratchet after the fact is not the red-by-design test that was
 * refused, and that distinction is written into the sitting record beside the original ruling.
 *
 * Built as a SEARCH with an allowlist rather than a list of known files, for the reason ARC-08-C7
 * records: an enumeration can only see what its author already saw.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MARKER = 'PENDING OWNER';

/**
 * The mentions that may stay, each with the reason. Every one is HISTORY: either struck-through
 * text inside an immutable ADR, or a record quoting the old marker in a sentence that says it
 * closed. No live decision hides behind this marker any more.
 *
 * Keyed by file and a fragment of the line rather than `file:line`: a line number is a fact about
 * everything above it, so an unrelated edit higher in the file would fail this test and teach the
 * next person to re-number the allowlist instead of reading it.
 */
const ALLOWED = [
  // KIND 1 — struck-through or quoted HISTORY inside an immutable ADR. These are not cells.
  { file: 'docs/decisions/ADR-0002-licence.md', needle: 'RECEIVED 2026-09-07', kind: 'history' },
  { file: 'docs/decisions/ADR-0007-post-decision-rulings.md', needle: "R-4's obligation 2", kind: 'history' },

  // KIND 2 — a record QUOTING the old marker while stating that it is closed. The sentence around
  // each of these says the initials landed on 2026-09-16; the marker is the thing being quoted.
  { file: 'docs/decisions/README.md', needle: 'for eight days after', kind: 'quoted while closing' },
  { file: 'docs/decisions/README.md', needle: 'MET, with one intended exception', kind: 'dated historical record' },
  { file: 'docs/spikes/OWNER-SITTING.md', needle: 'Decision owner: initials', kind: 'quoted while closing' },
  { file: 'docs/plans/06-ACCEPTANCE-PLAN.md', needle: 'Closed 2026-09-16', kind: 'quoted while closing' },
  { file: 'docs/plans/06-ACCEPTANCE-PLAN.md', needle: 'No expect-fail test, as ruled', kind: 'quoted while closing' },
  { file: 'docs/plans/06-ACCEPTANCE-PLAN.md', needle: 'initialled at Sitting A', kind: 'quoted while closing' },
  // B00-08's COVERAGE-PATH cell, which prescribed leaving the cell open and putting the initialling
  // into the sitting. That is what was prescribed, it is what happened, and the Vetting cell in the
  // same row records the outcome — so the prescription is history, not an instruction still standing.
  { file: 'docs/plans/06-ACCEPTANCE-PLAN.md', needle: 'leave `initials: PENDING OWNER`', kind: 'history' },
];

const walk = (dir) => readdirSync(dir).flatMap((entry) => {
  const full = join(dir, entry);
  if (statSync(full).isDirectory()) return walk(full);
  return /\.(md|mjs|ts|json|yml|yaml)$/.test(entry) ? [full] : [];
});

function mentions() {
  const found = [];
  for (const file of walk(join(root, 'docs'))) {
    // Forward slashes always: `relative()` answers in the platform's separator, and an allowlist
    // keyed with `/` misses every entry on Windows (ARC-08, learned the expensive way).
    const rel = relative(root, file).split(sep).join('/');
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (line.includes(MARKER)) found.push({ rel, line: i + 1, text: line.trim() });
    });
  }
  return found;
}

test('ARC-00 — no Decision-owner cell is waiting on the owner again', () => {
  const unlisted = mentions().filter(({ rel, text }) =>
    !ALLOWED.some((a) => a.file === rel && text.includes(a.needle)));

  assert.deepEqual(unlisted.map((u) => `${u.rel}:${u.line}: ${u.text.slice(0, 96)}`), [],
    `${unlisted.length} place(s) still say "${MARKER}".\n`
    + 'If a cell lost its initials, restore them. If this is a NEW owner decision, add an ALLOWED '
    + 'entry saying which kind it is — and do not describe an open decision as closed.');

  // NON-VACUITY: the scan must be finding things, or an empty result proves nothing. EIGHT are
  // allowlisted today, down from thirteen — five were the RELICENSING markers, which turned out to
  // be stale text in a record that closed on 2026-09-07 rather than a decision still waiting, and
  // correcting them removed them from the tree. The floor moved with that count, deliberately: a
  // floor left at ten would have failed for the honest reason that the tree got better, and the
  // next person would have learned to lower it without reading why.
  assert.ok(mentions().length >= 6,
    `the scan found only ${mentions().length} — the tree or the marker moved`);
});

test('ARC-00 — every ADR with a Decision-owner cell is initialled', () => {
  // The positive half, both directions: the test above proves the marker is gone, which a mass
  // deletion would also satisfy. This proves the initials are actually THERE.
  const adrs = readdirSync(join(root, 'docs/decisions'))
    .filter((f) => /^ADR-\d{4}.*\.md$/.test(f));
  assert.ok(adrs.length >= 9, `only ${adrs.length} ADRs found`);

  const cells = [];
  for (const f of adrs) {
    const line = readFileSync(join(root, 'docs/decisions', f), 'utf8').split('\n')
      .find((l) => l.startsWith('| **Decision owner**'));
    if (line) cells.push({ f, line });
  }
  // NINE carry the cell, and they are not all the same shape: ADR-0009's records consent as
  // "ratified by merging ARC-05-S11" — the owner's merge WAS the signature, so it has no initials
  // marker and never had one. Asserting a flat count of eight was my own error, caught here.
  assert.equal(cells.length, 9, `${cells.length} ADRs carry a Decision-owner cell`);

  const initialled = cells.filter(({ line }) => line.includes('initials'));
  assert.equal(initialled.length, 8, 'eight cells are the initials kind');
  for (const { f, line } of initialled) {
    assert.match(line, /initials `CG, 2026-09-16`/, `${f} is not initialled: ${line}`);
  }

  const ratified = cells.filter(({ line }) => !line.includes('initials'));
  assert.equal(ratified.length, 1);
  assert.match(ratified[0].line, /ratified by merging/,
    'a Decision-owner cell with no initials must say how consent was given instead');
});

test('ARC-00 — the allowlist has no dead entries, and every entry says which kind it is', () => {
  // An allowlist that keeps excusing something which no longer exists is how a list stops
  // describing the tree, and the next person trusts it anyway.
  const found = mentions();
  const kinds = new Set(['history', 'quoted while closing', 'dated historical record']);
  for (const entry of ALLOWED) {
    assert.ok(found.some((f) => f.rel === entry.file && f.text.includes(entry.needle)),
      `allowlist entry no longer matches anything: ${entry.file} — "${entry.needle}"`);
    assert.ok(kinds.has(entry.kind), `unknown kind on ${entry.file}: ${entry.kind}`);
    assert.doesNotMatch(entry.file, /\\/, 'allowlist keys are written with forward slashes');
  }

  // EVERY entry is history now. There is no live owner decision hiding behind this marker, and an
  // allowlist entry claiming otherwise would be a false fact asserted by a guard — which is what the
  // first version of this file did: it excused the RELICENSING markers as an "open decision" when
  // the same file said, at line 3, that the decision closed on 2026-09-07. Reading one sentence and
  // not the file around it is the defect this repository keeps finding; encoding it in a test is
  // worse, because a guard makes it look checked.
  assert.equal(ALLOWED.filter((a) => a.kind !== 'history'
    && a.kind !== 'quoted while closing' && a.kind !== 'dated historical record').length, 0,
  'no allowlist entry may describe a live owner decision — close it in the record instead');
});
