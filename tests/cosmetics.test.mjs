/**
 * ARC-08-C23 — four lines that told a reader something untrue, or nothing at all.
 *
 * None of them breaks an install, which is why they were still there: each was found by somebody
 * reading output during a sitting rather than by a test. What they have in common is the defect
 * class this arc has spent itself on — a line that states more than it measured, or omits what it
 * did — so they are fixed together and each one is pinned by the assertion that fails on the old
 * behaviour.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { skipReason, storeLine } from '../packages/snowarch/dist/cli/instance.js';
import { presetNote, renderReviewScreen } from '../packages/snowarch/dist/cli/preset-ui.js';
import { expandPreset } from '../packages/snowarch/dist/utils/permissions.js';
import { installSizeHint } from '../tools/snowarch/lib/steps/B04.mjs';

test('[3/6] says what it used and why, instead of leaving a gap in the numbering', () => {
  // The wizard prints six numbered steps. With `--auth` or `--yes` the third printed NOTHING, so a
  // run went `[2/6] … [4/6]` and the reader had to decide whether a step had failed, been dropped,
  // or scrolled past. The numbering is a promise that all six are accounted for.
  //
  // And the two reasons are told apart: one is what the user typed, the other is what a flag chose
  // for them, and a reader deciding whether the answer is theirs needs to know which.
  assert.equal(skipReason({ auth: 'basic' }), 'from --auth');
  assert.equal(skipReason({ yes: true }), 'default; --yes asked nothing');
  // Not "skipped" alone: that says something did not happen without saying what was used instead.
  assert.match(skipReason({ auth: 'oauth_ropc' }), /--auth/);
  // The WRITER is asserted in `packages/snowarch/tests/cli/instance.test.ts`, where the wizard's
  // own harness lives: `skipReason` returning the right words proves nothing about whether the
  // line reaches the screen, and the defect WAS a line that was never written.
});

test('the Store line is masked, like every other path this CLI prints', () => {
  // `precedenceNote` masks its two store paths, `listJson` masks the store it reports, the audit
  // writer masks the file it could not open — and this line, in the block a user pastes when an
  // install goes wrong, printed the absolute path with the account name in it.
  const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
  if (home.length >= 4) {
    const line = storeLine(`${home}/checkout/.local/instances.json`, 'darwin');
    assert.equal(line.includes(home), false, 'the home directory survived into the Store line');
    assert.match(line, /^Store: ~/);
  }
  // The mode half is untouched: it is a fact about the file, not about who owns it.
  assert.match(storeLine('/tmp/x/instances.json', 'darwin'), /\(mode 0600, dir 0700\)$/);
  assert.match(storeLine('/tmp/x/instances.json', 'win32'), /ACL-inherited \(Windows\)\)$/);
});

test('the review screen describes the preset it is proposing, not the environment', () => {
  // `set-preset pdi read-only` printed `read-only  — non-production: everything on`: a header
  // contradicting the word beside it, on the screen whose whole job is to show what is about to be
  // turned on. The phrase described the ENVIRONMENT and read as a description of the PRESET.
  // `non-production:` stays — it is the environment half, and it is WHY everything may be on.
  // What follows it is the proposal's own description, so the `full` screen is byte-identical to
  // the snapshot three documents quote and only the contradicting cases move.
  assert.equal(presetNote(expandPreset('read-only')), 'nothing on');
  assert.equal(presetNote(expandPreset('full')), 'everything on');
  assert.equal(presetNote(expandPreset('pdi-developer')), '4 of 6 on');
  // Read from the FLAGS, so `custom` gets an honest sentence and a preset whose expansion changes
  // cannot leave this line behind.
  assert.equal(presetNote(expandPreset('custom', { WRITE_ENABLED: 'true' })), '1 of 6 on');

  // …AND THE HEADER ITSELF, which is what a user reads. The first version of this test asserted
  // only `presetNote`, so reverting the render left it green — the helper proved, the line
  // unproved, which is the reader-vs-writer split this arc keeps finding. `renderReviewScreen` is
  // the writer.
  const header = (preset) => renderReviewScreen({
    label: 'pdi', environment: 'pdi', preset, flags: expandPreset(preset),
  }).split('\n')[0];

  assert.equal(header('read-only'),
    'Proposed preset for "pdi" (pdi): read-only  — non-production: nothing on');
  assert.equal(header('pdi-developer'),
    'Proposed preset for "pdi" (pdi): pdi-developer  — non-production: 4 of 6 on');
  // `full` is byte-identical to the snapshot three documents quote: only the contradicting cases
  // moved, which is what keeps this a fix rather than a rewording.
  assert.equal(header('full'),
    'Proposed preset for "pdi" (pdi): full  — non-production: everything on');
});

test('B04 quotes a size it measured, or none at all', () => {
  // The line said `~72 MB`, hand-typed — the `du` figure from ARC-01-S05, while the step itself
  // reports summed content two screens later; the two differ by 15 MB on the same tree, which is
  // why the footprint gate names the metric it uses.
  assert.equal(installSizeHint({ steps: { B04: { data: { sizeBytes: 71_000_000 } } } }),
    ', ~68 MB last time');
  // A first install has nothing to quote and says nothing. A made-up magnitude is worse than none:
  // a user watching a download is deciding whether to wait, and a wrong number is what makes them
  // stop at the wrong moment.
  assert.equal(installSizeHint({}), '');
  assert.equal(installSizeHint({ steps: { B04: {} } }), '');
  // …and a nonsense measurement is treated as no measurement rather than printed.
  for (const bytes of [0, -1, Number.NaN, 'lots', null]) {
    assert.equal(installSizeHint({ steps: { B04: { data: { sizeBytes: bytes } } } }), '',
      `sizeBytes ${String(bytes)} reached the line`);
  }
});
