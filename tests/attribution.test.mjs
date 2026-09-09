import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALWAYS_DIRS, ATTRIBUTION } from '../tools/snowarch/lib/docs/sync.mjs';

/**
 * Attribution and the figures that go with it.
 *
 * The corpus is somebody else's work under their licence. Three places say so — the end of every
 * `docs sync`, the last line of the launcher recipe, and `README.md` — and three copies of a licence
 * statement is three chances for one of them to be wrong. This is what compares them, and what stops
 * a placeholder figure reaching a reader.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

test('the attribution string is one constant, and the README repeats it exactly', () => {
  assert.equal(ATTRIBUTION,
    'docs: ServiceNow product documentation © 2026 ServiceNow, Apache-2.0 — vendor/ServiceNowDocs/LICENSE');
  assert.ok(read('README.md').includes(ATTRIBUTION), 'the README does not carry the exact line');
});

test('sync prints it on success, --quiet suppresses it, --json never carries it', () => {
  const src = read('tools/snowarch/lib/docs/sync.mjs');
  // Printed through `say`, which `--quiet` short-circuits: one mechanism, so the suppression cannot
  // be true of the phase lines and false of this one.
  assert.match(src, /const attribute = \(\) => say\(ATTRIBUTION\);/);
  // The dispatch moved to the library at ARC-06-S02 when `./snowarch docs` mounted it;
  // `scripts/docs.mjs` is a shim over the same function. Reading the shim would assert nothing.
  const cli = read('tools/snowarch/lib/docs/cli.mjs');
  // `--json` runs the sync quiet, so the object a caller parses never has prose in front of it.
  assert.match(cli, /quiet: quiet \|\| asJson/);
});

test('no placeholder figure ever merges', () => {
  for (const rel of ['README.md', 'NOTICE', 'docs/ARCHITECTURE.md']) {
    const hits = read(rel).match(/<SIZE>|<TIME>|<FULL_SIZE>|TBD|TODO/g) ?? [];
    assert.deepEqual(hits, [], `${rel} carries a placeholder`);
  }
});

test('the install figures are attributed to a measurement, not asserted from nowhere', () => {
  // ARC-06-S13 moved the sentences to `docs/INSTALL.md` and made the README a copy of it. Asserted
  // on BOTH: the page is where a person edits, the README is what a person reads first, and the
  // generator is what keeps them the same — a test on only one of them would pass while the other
  // said something else.
  const readme = `${read('README.md')}\n${read('docs/INSTALL.md')}`;
  // Every number in the install sentences carries where it came from. S-07 measured sparse; it did
  // not measure full mode, and the README says so rather than borrowing the figure.
  assert.match(readme, /302 MB/);
  assert.match(readme, /measured\s+2026-09-06, ARC-00 S-07/);
  // S11 added the job's own numbers beside S-07's, because they count different things — the tree
  // you read against the tree plus `.git` the disk loses. Both carry their measurement.
  assert.match(readme, /179 MB on Linux and macOS/);
  assert.match(readme, /measured 2026-09-09 by `docs-real\.yml`/);
  assert.match(readme, /447 MB and 48,997 files/);
  assert.match(readme, /measured 2026-09-09 on the reference\s+macOS machine — ARC-00 S-07 did not measure full mode/);
});

test('NOTICE claims only what the checkout enforces', () => {
  const notice = read('NOTICE');
  assert.match(notice, /preserved in every checkout, sparse or full/);
  // The claim names LICENSE and legal/. `legal/` is a root DIRECTORY, which cone mode does not
  // materialise — so the claim is only true because the recipe carries it and the completeness
  // check fails without it. That is what makes this assertion worth having.
  assert.ok(ALWAYS_DIRS.includes('legal'), 'legal/ is not carried, so the NOTICE claim is false');
  assert.match(read('tools/snowarch/lib/docs/sync.mjs'), /const missingRoot = \[\.\.\.ROOT_FILES, \.\.\.ALWAYS_DIRS\]/);
});

test('the consolidated corpus section is one heading and stays under the cap', () => {
  const arch = read('docs/ARCHITECTURE.md').split('\n');
  const start = arch.findIndex((l) => l.startsWith('## Docs corpus: how the pin, the areas file and the gate relate'));
  assert.ok(start !== -1, 'the consolidated heading is missing');
  const end = arch.findIndex((l, i) => i > start && l.startsWith('## '));
  // Generator markers and the blank lines that isolate them are not prose: they were added by the
  // ARC-06 fix that made the recipe block generated, and counting them against a readability cap
  // would push out a paragraph to make room for two HTML comments.
  const isMarker = (l) => /^<!-- [A-Z-]+:(BEGIN|END)/.test(l);
  const body = arch.slice(start, end);
  const length = body.filter((l, i) => !isMarker(l)
    && !(l === '' && (isMarker(body[i - 1] ?? '') || isMarker(body[i + 1] ?? '')))).length;
  console.log(`    corpus section: ${length} lines`);
  // 100, ruled at ARC-03-S11: the plan guessed 80 before the byte-identical recipe block and the
  // shared exit table existed, and cutting either would hide what ARC-06 and the tests point at.
  // The cap stays so the section cannot grow back silently.
  assert.ok(length <= 100, `${length} lines — the section is meant to be read, not skimmed past`);

  // And it is ONE section: the six that S05–S09 each added are folded in, not left beside it.
  const strays = arch.filter((l) => /^## (The git-only corpus recipe|The maintainer refresh|`docs status`)/.test(l));
  assert.deepEqual(strays, [], 'a corpus section is still at the top level');
});

test('the ARC-06 anchors are consumed, not left behind', () => {
  // They were "move this to docs/INSTALL.md" notes, and ARC-06-S13 moved them. An anchor that
  // outlived its move is an instruction to do something already done — so the assertion inverts:
  // no anchor, and the sentences are on the page it named.
  const readme = read('README.md');
  assert.equal(/<!-- ARC-06(-S13)?: move to docs\/INSTALL\.md/.test(readme), false,
    'a move-me anchor survived the move');
  const install = read('docs/INSTALL.md');
  assert.match(install, /302 MB/);
  assert.match(install, /--instance-file/, 'the Operators paragraph did not arrive');
  assert.match(install, /mode live/, 'the live-mode sentence did not arrive');
});
