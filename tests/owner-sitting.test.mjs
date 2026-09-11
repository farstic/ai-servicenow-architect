// The owner's sitting page — four sittings a person can run one at a time.
//
// Every `> **…**` row on that page is EVIDENCE: it was written by the story that raised it, and the
// restructure's one job was to move rows without touching them. So the test compares the sorted row
// text against what `origin/develop` holds — moving is invisible to a sort, and any edit is not.
//
// The other half is that nothing was lost or duplicated in the move: each D-id and each
// `(ARC-xx-Syy, date)` marker appears exactly once, and the four headings exist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REL = 'docs/spikes/OWNER-SITTING.md';
const text = readFileSync(join(root, REL), 'utf8');

/** The `> **…` lines, which are the rows. */
const rows = (t) => t.split('\n').filter((l) => l.startsWith('> **'));

const SITTINGS = [
  '## Sitting A — Install (a person who did not write the page)',
  '## Sitting B — Design-only in a real Claude session',
  '## Sitting C — Live with the owner\'s PDI (a test-only account)',
  '## Sitting D — Windows (when a machine exists)',
  '## Archive — answered rows',
];

test('the four sittings and the archive exist, in order', () => {
  let at = -1;
  for (const heading of SITTINGS) {
    const found = text.indexOf(`\n${heading}\n`);
    assert.notEqual(found, -1, `no heading: ${heading}`);
    assert.ok(found > at, `${heading} is out of order`);
    at = found;
  }
});

test('every sitting says what it needs and when it is done', () => {
  for (const heading of SITTINGS.slice(0, 4)) {
    const from = text.indexOf(heading);
    const rest = text.slice(from);
    const end = rest.indexOf('\n## ', 1);
    const section = end === -1 ? rest : rest.slice(0, end);
    assert.match(section, /\*\*Prerequisites\.\*\*/, `${heading} has no prerequisites`);
    assert.match(section, /\*\*Exit criterion\.\*\*/, `${heading} has no exit criterion`);
    assert.ok(rows(section).length > 0, `${heading} has no rows`);
  }
});

test('the index at the top names every sitting, with an exit criterion each', () => {
  const head = text.slice(0, text.indexOf('\n## Sitting A'));
  // ARC-09-S10 added E. The index is how a person finds a sitting at all, so a section that
  // exists and is not listed is a sitting nobody will run — which is why this counts rows rather
  // than only checking the names it knows about.
  const SITTINGS = ['A — Install', 'B — Design-only', 'C — Live with a PDI', 'D — Windows',
    'E — The optional npm channel', 'Archive'];
  for (const name of SITTINGS) {
    assert.ok(head.includes(name), `the index does not name ${name}`);
  }
  assert.equal((head.match(/^\| \[/gm) ?? []).length, SITTINGS.length);
  // ...and the reverse: every `## Sitting X` heading in the body is named in the index above.
  const headings = [...text.matchAll(/^## Sitting ([A-Z]) — /gm)].map((m) => m[1]);
  for (const letter of headings) {
    assert.ok(SITTINGS.some((s) => s.startsWith(`${letter} —`)), `Sitting ${letter} is not indexed`);
  }
});

test('every D-id and every story marker appears exactly once', () => {
  for (const id of ['D1.', 'D2.', 'D3.', 'D4.', 'D5.']) {
    const count = (text.match(new RegExp(`^## ${id.replace('.', '\\.')} `, 'gm')) ?? []).length;
    assert.equal(count, 1, `${id} appears ${count} times`);
  }
  // The ROW LINE is what is unique, not the story marker: ARC-06-S12 and ARC-06-S13 each raised
  // TWO rows on the same day — the registration sitting and the robustness candidate; Path B and
  // the install page's second reader. A first version of this asserted one marker per row and
  // failed on a page that was correct, which is the same mistake as pinning a machine's state.
  const seen = new Map();
  for (const line of rows(text)) seen.set(line, (seen.get(line) ?? 0) + 1);
  const duplicated = [...seen].filter(([, n]) => n > 1).map(([l]) => l.slice(0, 70));
  assert.deepEqual(duplicated, [], 'a row was copied rather than moved');

  // ...and every story that raised a row still has one.
  const markers = new Set([...text.matchAll(/\((?:added by |ruling \d, )?(ARC-\d\d-S\d\d), 20\d\d-\d\d-\d\d\)/g)]
    .map((m) => m[1]));
  for (const story of ['ARC-06-S09', 'ARC-06-S11', 'ARC-06-S12', 'ARC-06-S13', 'ARC-07-S01',
    'ARC-07-S02', 'ARC-07-S05', 'ARC-07-S06', 'ARC-07-S07', 'ARC-07-S08', 'ARC-07-S09',
    'ARC-07-S10', 'ARC-07-S11']) {
    assert.ok(markers.has(story), `${story}'s row went missing in the move`);
  }
});

test('not one row was reworded — the rows are evidence', () => {
  // Against `origin/develop`, sorted: MOVING a row is invisible to a sort, and EDITING one is not.
  // Skipped rather than failed when the ref is not there: a shallow clone cannot answer this, and a
  // test that needs history must say so instead of going red on a correct checkout.
  let before;
  try {
    before = execFileSync('git', ['show', `origin/develop:${REL}`],
      { cwd: root, encoding: 'utf8', maxBuffer: 1 << 24, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return;   // no origin/develop in this clone
  }

  const was = rows(before).sort();
  const now = rows(text).sort();
  const removed = was.filter((l) => !now.includes(l));
  assert.deepEqual(removed, [], 'these rows were changed or lost in the move');

  // New rows are allowed — the restructure adds pointer notes — but they must be few and must be
  // pointers, not evidence somebody invented.
  const added = now.filter((l) => !was.includes(l));
  assert.ok(added.length <= 4, `${added.length} new rows: ${added.map((l) => l.slice(0, 60)).join(' | ')}`);
});

test('the Windows section states the release-note sentence in advance', () => {
  // Written now so that shipping without a Windows machine is a decision taken beforehand rather
  // than an omission noticed at the end.
  assert.match(text, /Windows: proven in CI, not\n> by a person\./);
});
