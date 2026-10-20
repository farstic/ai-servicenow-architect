// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C120 — an untracked file that would stop the upgrade at U5 is refused at U4, by name.
//
// The owner's rc.3 upgrade (v2.0.11-rc.1 → rc.3) printed the plan, then failed at U5 with "git could not check out
// v2.0.11-rc.3; nothing else was changed". `docs/validation/2.0.11-rc.1-live-sitting.md` was untracked in that
// checkout, rc.3 tracks it, and git refuses to overwrite an untracked file even when its content is identical.
// These are the pure halves: which paths are in the way, how they are named, and what git's own reason says. The
// e2e cases in `tests/upgrade/upgrade.e2e.test.mjs` drive the command. This file lives outside tests/upgrade/, which
// `npm test` leaves to its CI job: these cases are pure and fast, and belong in every run.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fastForwardFailureLine, gitReason, namePaths, splitZ, UNTRACKED_REASON, untrackedBlockers }
  from '../tools/snowarch/lib/commands/upgrade.mjs';

test('ARC-09-C120 — the blockers are the untracked paths the target tracks, and no others', () => {
  const untracked = ['docs/validation/2.0.11-rc.1-live-sitting.md', 'scratch.txt', 'clients/acme/notes.md'];
  const tracked = ['README.md', 'docs/validation/2.0.11-rc.1-live-sitting.md', 'tools/snowarch/lib/cli.mjs'];
  assert.deepEqual(untrackedBlockers(untracked, tracked), ['docs/validation/2.0.11-rc.1-live-sitting.md']);
  assert.deepEqual(untrackedBlockers(['scratch.txt'], tracked), []);
  assert.deepEqual(untrackedBlockers([], tracked), []);
});

test('ARC-09-C120 — on a case-insensitive checkout a path in another case is in the way too', () => {
  // Measured on APFS with core.ignorecase=true: an untracked Docs/new.md made `git checkout` refuse, naming
  // docs/new.md, while `git ls-files --others` printed Docs/new.md. An exact comparison would miss it.
  assert.deepEqual(untrackedBlockers(['Docs/new.md'], ['docs/new.md'], { ignoreCase: true }), ['Docs/new.md']);
  assert.deepEqual(untrackedBlockers(['Docs/new.md'], ['docs/new.md'], { ignoreCase: false }), []);
});

test('ARC-09-C120 — NUL-separated lists keep a space, a leading space and a non-ASCII name as git wrote them', () => {
  // `git()` trims its output, which would cut the leading space off the first path; these lists are read raw.
  assert.deepEqual(splitZ('a b.md\0 lead.md\0café/ñ.md\0'), ['a b.md', ' lead.md', 'café/ñ.md']);
  assert.deepEqual(splitZ(''), []);
  assert.deepEqual(splitZ(null), []);
});

test('ARC-09-C120 — at most ten paths are named, then how many more', () => {
  const paths = Array.from({ length: 13 }, (_, i) => `f${i}.md`);
  assert.equal(namePaths(paths.slice(0, 2)), 'f0.md, f1.md');
  assert.equal(namePaths(paths.slice(0, 10)), paths.slice(0, 10).join(', '));
  assert.equal(namePaths(paths), `${paths.slice(0, 10).join(', ')} and 3 more`);
});

test('ARC-09-C120 — the refusal says what git does, which is the reason the owner hit', () => {
  assert.equal(UNTRACKED_REASON,
    'git refuses to overwrite an untracked file the target tracks, even with identical content');
});

test('ARC-09-C120 — git\'s reason is its first line, and the next one when the first ends with a colon', () => {
  assert.equal(gitReason("fatal: Unable to create '/x/.git/index.lock': File exists.\n\nAnother git process seems to be running"),
    "fatal: Unable to create '/x/.git/index.lock': File exists.");
  assert.equal(gitReason('error: The following untracked working tree files would be overwritten by checkout:\n'
    + '\tdocs/new.md\nPlease move or remove them before you switch branches.\nAborting'),
  'error: The following untracked working tree files would be overwritten by checkout: docs/new.md');
  assert.equal(gitReason(''), null);
  assert.equal(gitReason(undefined), null);
});

test('ARC-09-C120 — a failed move is git\'s own reason, quoted, never a guessed divergence', () => {
  // ARC-09-C194: whether the branch can fast-forward to the tag is asked first, with `merge-base --is-ancestor`, and
  // refused with its own line; what reaches this one is everything else git can say.
  const at = { branch: 'main', target: 'v9.2.0' };
  const locked = fastForwardFailureLine("fatal: Unable to create '/x/.git/index.lock': File exists.", at);
  assert.equal(locked, "upgrade: git could not fast-forward main to v9.2.0 — fatal: Unable to create "
    + "'/x/.git/index.lock': File exists.; nothing else was changed");
  assert.doesNotMatch(locked, /diverged/);
  assert.equal(fastForwardFailureLine('', at), 'upgrade: git could not fast-forward main to v9.2.0 — git gave no reason; '
    + 'nothing else was changed');
});
