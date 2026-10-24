// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C197 — a file U5's tree check would call extra is refused at U4, by name, before anything moves.
//
// U5 checks the moved tree against the target's signed manifest, and a file under a directory the manifest covers
// that it does not list stopped the upgrade after the move. U1 refuses a modified tracked file, so the move deletes
// what HEAD tracks and the target does not, overwrites an ignored file the target tracks, and leaves the rest of what
// HEAD does not track where it is (measured on git 2.39.5, for the checkout and the branch's fast-forward alike).
// These are the pure halves: which files U4 names, and the words it uses. The e2e cases in
// `tests/upgrade/upgrade-licence.e2e.test.mjs` drive the command. This file lives outside tests/upgrade/, as C120's
// pure halves do, so it runs in every `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { EXTRAS_REASON, extrasAfterMove, extrasRefusal } from '../tools/snowarch/lib/commands/upgrade.mjs';
import { hashBytes } from '../tools/snowarch/lib/licence/manifest.mjs';
import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';

/** A tree as the move finds it, and a target manifest that newly covers `notes/`. */
function world(t, { covers = ['tools/snowarch/', 'notes/'] } = {}) {
  const root = tempDir('snowarch-c197-', t);
  const put = (path, text) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  put('tools/snowarch/lib/a.mjs', 'shipped\n');      // the target ships it
  put('tools/snowarch/old.mjs', 'old\n');            // HEAD tracks it and the target does not: the move deletes it
  put('tools/snowarch/mine.mjs', 'mine\n');          // untracked, under a directory both releases cover
  put('notes/mine.md', 'mine\n');                    // untracked, under the directory the target newly covers
  put('notes/.DS_Store', 'os\n');                    // a basename the manifest ignores
  put('tools/snowarch/tests/x.test.mjs', 'test\n');  // under an excluded directory
  put('clients/acme/n.md', 'work\n');                // under nothing the manifest covers
  const manifest = {
    tag: 'v9.1.0', commit: '0'.repeat(40), covers, excludes: ['tools/snowarch/tests/'], ignores: ['.DS_Store'],
    files: { 'tools/snowarch/lib/a.mjs': hashBytes('shipped\n') },
  };
  return { root, manifest };
}

const HEAD = ['tools/snowarch/lib/a.mjs', 'tools/snowarch/old.mjs'];

test('ARC-09-C197 — U4 names what the move leaves under a covered directory that the manifest does not list', (t) => {
  const { root, manifest } = world(t);
  assert.deepEqual(extrasAfterMove(root, manifest, HEAD), ['notes/mine.md', 'tools/snowarch/mine.mjs']);
});

test('ARC-09-C197 — a file HEAD tracks is the move\'s to delete, not U4\'s to name', (t) => {
  const { root, manifest } = world(t);
  assert.deepEqual(extrasAfterMove(root, manifest, [...HEAD, 'tools/snowarch/mine.mjs']), ['notes/mine.md']);
});

test('ARC-09-C197 — it is the newly covered directory that brings a file under it in', (t) => {
  const { root, manifest } = world(t, { covers: ['tools/snowarch/'] });
  assert.deepEqual(extrasAfterMove(root, manifest, HEAD), ['tools/snowarch/mine.mjs']);
});

test('ARC-09-C197 — the refusal and its reason, word for word', () => {
  assert.equal(extrasRefusal(['notes/mine.md'], 'v9.1.0'),
    'upgrade: 1 file is in folders v9.1.0 manages but not in its signed file list: notes/mine.md — move it out of '
    + 'those folders; nothing was changed');
  assert.equal(extrasRefusal(['notes/mine.md', 'tools/snowarch/mine.mjs'], 'v9.1.0'),
    'upgrade: 2 files are in folders v9.1.0 manages but not in its signed file list: notes/mine.md, '
    + 'tools/snowarch/mine.mjs — move them out of those folders; nothing was changed');
  assert.equal(EXTRAS_REASON, 'after the upgrade those folders must hold exactly what the release signed, so a file '
    + 'it does not ship would stop the upgrade after the move; keep your own files outside them');
});
