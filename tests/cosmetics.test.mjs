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

import { join } from 'node:path';

import { skipReason, storeLine } from '../packages/snowarch/dist/cli/instance.js';
import { underPrefix } from '../packages/snowarch/dist/store/paths.js';
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
    // BOTH SPELLINGS. The first version built only the forward-slash one, which on Windows is
    // `C:\\Users\\someone/checkout/…` — a path `maskPath` compared with the platform separator
    // alone and therefore did not mask at all, so `test (windows-latest, node 24)` failed with the
    // account name in the line. That spelling is not the test being clever: #229 measured that
    // `git rev-parse --show-toplevel` answers with forward slashes on Windows, and a HOME set by a
    // bash shell arrives the same way.
    for (const path of [
      join(home, 'checkout', '.local', 'instances.json'),
      `${home}/checkout/.local/instances.json`,
    ]) {
      const line = storeLine(path);
      assert.equal(line.includes(home), false,
        `the home directory survived into the Store line for ${path}`);
      // ARC-07-W16 — THE MASKING PROPERTY IS UNCHANGED and is the whole point of this case; what
      // moved is where the path sits. A path cannot be folded, so a store that is not this
      // checkout's now gets the sentence on one line and the path, whole and masked, on the next —
      // found by that row's budget case, which measured 119 columns for a deep client path.
      const [sentence, shown] = line.split('\n');
      assert.match(sentence, /^Saved to this file — /);
      assert.match(shown, /^~[/\\]/, `the path line is not masked: ${shown}`);
    }
  }
  // WHAT THIS TEST CANNOT SEE, said rather than left for the next reader to discover. A masker can
  // only mask the home it actually has, so a `C:\\Users\\someone` path is unmasked on a POSIX
  // runner for the right reason — it is not under this machine's home. The two spellings of the
  // REAL home above are identical on POSIX, so the separator defect is invisible from here: the
  // Windows cell is the end-to-end judge, and `underPrefix` below is what makes the rule itself
  // checkable on every platform, with the separator injected.
  //
  // The mode half is untouched: it is a fact about the file, not about who owns it.
  // ...and the mode half still states each platform's own truth and never the other's — the words
  // changed (`mode 0600, dir 0700` was two numbers a reader has no reason to know), the property did
  // not: POSIX names the mode, Windows refuses to claim a chmod it does not have.
  assert.match(storeLine('/tmp/x/instances.json', 'darwin'), /readable only by you \(0600\)/);
  assert.doesNotMatch(storeLine('/tmp/x/instances.json', 'darwin'), /Windows/);
  assert.match(storeLine('/tmp/x/instances.json', 'win32'),
    /permissions are inherited from the folder \(Windows\)/);
  assert.doesNotMatch(storeLine('/tmp/x/instances.json', 'win32'), /0600/);
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
  // ARC-07-W16 — THE PROPOSAL IS THE SECOND LINE NOW. The header became two statements — what the
  // screen is, then what it proposes — because one line of 115 columns folded inside
  // `full (everything on)`. This case's property is untouched and still the one that matters: the
  // sentence beside the preset describes THE PRESET, not the environment. Line 1 is where that
  // sentence lives, and line 0 is asserted too so a future edit cannot quietly swap them.
  const lines = (preset) => renderReviewScreen({
    label: 'pdi', environment: 'pdi', preset, flags: expandPreset(preset),
  }).split('\n');
  assert.equal(lines('full')[0],
    'Permissions for instance "pdi" (environment pdi) — what Claude\'s tools may do there.');
  assert.equal(lines('read-only')[1], 'Proposed: read-only (nothing on)');
  assert.equal(lines('pdi-developer')[1], 'Proposed: pdi-developer (4 of 6 on)');
  // `full` is byte-identical to the snapshot three documents quote.
  assert.equal(lines('full')[1], 'Proposed: full (everything on)');
});

/**
 * WHICH OF THESE FOUR NEEDED A WRITER TEST, and why it is not all of them.
 *
 * `storeLine` and `presetNote`/`renderReviewScreen` ARE the line-producers: the defect was inside
 * the function, so calling it is driving the writer, and reverting either fails the assertion
 * below. `skipReason` and `installSizeHint` are helpers that a CALL SITE has to use — and in both
 * cases the defect lived at that call site, as a line that was never printed and a literal that
 * was printed instead. A helper assertion cannot see either.
 *
 * So those two are asserted where their writers live and can be driven:
 * `[3/6]` in `packages/snowarch/tests/cli/instance.test.ts` (the wizard's harness) and the B04
 * line in `tools/snowarch/tests/b04-deps.test.mjs` (the step's). The helper assertions here are
 * kept because the rounding and the refusals are worth pinning on their own — but they are not the
 * assertion that fails on the defect.
 */
test('B04 quotes a size it measured, or none at all — the helper half', () => {
  // The line said `~72 MB`, hand-typed — the `du` figure from ARC-01-S05, while the step itself
  // reports summed content two screens later; the two differ by 15 MB on the same tree, which is
  // why the footprint gate names the metric it uses.
  //
  // THE LINE is asserted in `tools/snowarch/tests/b04-deps.test.mjs`. This file's first version
  // had only the assertions below, and restoring the literal left it green: a test that never
  // reads the line cannot fail on a literal printed into it.
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

test('ARC-08-C23 — both maskers match a prefix under either separator', () => {
  // THE SECOND MASKER WITH THIS DEFECT. #229 taught `homeValues` in `doctor/json-boundary.mjs`
  // that a path can be spelled with the other separator; I fixed that one and did not look for
  // another. `maskPath` had the same single-separator assumption one file over, and the Windows
  // cell found it — through a test of a different item entirely.
  //
  // Driven with an injected separator so every platform exercises the Windows behaviour, the way
  // `homeValues` is driven with an injected `realpath`. A defect that only one of three CI
  // platforms can see is a defect that waits for that platform.
  const WIN_HOME = 'C:\\Users\\someone';

  // Windows: both spellings are separators, and the remainder comes back exactly as given.
  assert.equal(underPrefix(`${WIN_HOME}\\checkout\\x`, WIN_HOME, '\\'), '\\checkout\\x');
  assert.equal(underPrefix(`${WIN_HOME}/checkout/x`, WIN_HOME, '\\'), '/checkout/x');
  assert.equal(underPrefix(WIN_HOME, WIN_HOME, '\\'), '', 'the home itself is the whole match');
  assert.equal(underPrefix('D:/elsewhere/x', WIN_HOME, '\\'), null);
  // A trailing separator on the prefix, in either spelling, is not a different prefix.
  assert.equal(underPrefix(`${WIN_HOME}/x`, `${WIN_HOME}\\`, '\\'), '/x');

  // POSIX: `\` is a legal FILENAME character, so the two are not interchangeable here. One
  // direction only, as in #229 — the reverse would match paths that do not exist.
  assert.equal(underPrefix('/home/a/b', '/home/a', '/'), '/b');
  assert.equal(underPrefix('/home/a\\b', '/home/a', '/'), null,
    'a backslash in a POSIX filename was treated as a separator');

  // A neighbour whose name merely starts with the prefix is not under it.
  assert.equal(underPrefix('/home/alice-backup/x', '/home/alice', '/'), null);
});
