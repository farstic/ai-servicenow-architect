/**
 * ARC-09-S12 — the upgrade resolves rc.10 as newer than rc.9.
 *
 * The release preflight's refusal (`2.0.0-rc.10 is not greater than the latest tag v2.0.0-rc.9`)
 * was the loud half of the string-comparison defect. This is the quiet half, and the worse one:
 * `releaseTags` sorts with `sortTags`, `upgrade` takes `tags[0]` as the target, so **a checkout on
 * rc.9 would have been told it was already newest** and never offered rc.10. `E-28` reads the same
 * order, so the doctor would have agreed with it — two instruments, one wrong answer, no
 * disagreement to notice.
 *
 * It lives here rather than beside `semver.test.mjs` because the claim is about the COMMAND, not
 * the comparator: that the resolution path uses the fixed rule. The comparator's own table is in
 * `tests/semver.test.mjs`.
 *
 * It does NOT build a harness world. The world's fixture releases are 9.0.0 → 9.1.0 → 9.2.0 with no
 * prerelease among them, and adding one to a shared fixture that three OS cells pay for, to assert
 * an ordering, would be the expensive way to answer a cheap question. A clone with two annotated
 * tags carrying real release messages is enough, and it is enough precisely because `readTag` is
 * what makes a tag a release tag — the same function the command uses.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildTagMessage } from '../../scripts/lib/release/tag.mjs';
import { releaseTags, upgradeCommand } from '../../tools/snowarch/lib/commands/upgrade.mjs';
import { git } from './harness.mjs';
import { tempDir, trackTempDir } from '../../tools/snowarch/tests/helpers/temp.mjs';
import { REAL_ROOT } from '../doctor/helpers/tree.mjs';

/** A real release message, so `readTag` returns a `contract` and the tag counts as ours. */
function tagRelease(root, version, { commit = true } = {}) {
  // Each release gets its OWN commit. With both tags on one commit `git describe --exact-match`
  // answers with whichever git prefers, and the second test — which has to START on rc.9 — would
  // silently begin on rc.10 and assert nothing. It did exactly that before this line existed.
  if (commit) git(root, ['commit', '-q', '--allow-empty', '-m', `release ${version}`]);
  const config = JSON.parse(readFileSync(join(root, 'engine.config.json'), 'utf8'));
  const message = buildTagMessage({
    version,
    contract: 'a'.repeat(64),
    docsPin: 'b'.repeat(40),
    floors: config.floors ?? { claudeCode: '1.0.0', node: '20.0.0', git: '2.34.1' },
  });
  git(root, ['tag', '-a', `v${version}`, '-m', message]);
}

function clone(t) {
  const dir = tempDir('snowarch-tagorder-', t);
  // `--no-tags`: the real repository already carries `v2.0.0-rc.9`, and a clone that inherited it
  // could not create the fixture's own. It also makes the tag set in here exactly the two this test
  // is about, so nothing below has to filter the product's real history out of its assertions.
  git(REAL_ROOT, ['clone', '--quiet', '--no-hardlinks', '--no-tags', REAL_ROOT, dir]);
  git(dir, ['config', 'user.email', 'fixture@example.com']);
  git(dir, ['config', 'user.name', 'fixture']);
  git(dir, ['checkout', '--quiet', '-B', 'base']);
  // The order they are CREATED in is rc.9 then rc.10, so a sort that did nothing at all would also
  // put rc.10 last. The assertions below read position 0 of a descending list, which creation order
  // cannot satisfy by accident.
  tagRelease(dir, '2.0.0-rc.9');
  tagRelease(dir, '2.0.0-rc.10');
  // Back to the branch head so the clone is not left on a detached tag.
  git(dir, ['checkout', '--quiet', 'base']);

  // U2 ALWAYS fetches from `origin`, and there is no flag that skips it — `--check` decides what to
  // do after the fetch, not whether to make one. With origin still pointing at the real repository
  // that fetch pulls the product's own history back in, and the real `v2.0.0-rc.9` arrives as
  // `! [rejected] … (would clobber existing tag)`, which fails U2 and ends the run before the
  // ordering is ever consulted. So the fixture gets its own origin, carrying exactly its two tags.
  const origin = `${dir}-origin.git`;
  git(dir, ['clone', '--quiet', '--bare', dir, origin]);
  trackTempDir(origin, t);
  git(dir, ['remote', 'set-url', 'origin', origin]);
  return dir;
}

test('a checkout on rc.9 resolves rc.10 as the newest prerelease', { timeout: 120_000 }, (t) => {
  const root = clone(t);
  const tags = releaseTags(root, { pre: true }).map((x) => x.tag);
  assert.deepEqual(tags, ['v2.0.0-rc.10', 'v2.0.0-rc.9'],
    `the upgrade would offer ${tags[0]} to a checkout on rc.9`);
  // Without `--pre` a prerelease is not a target at all — a different rule, and still true. This
  // fixture has no release tag, so the honest assertion is that the list is empty rather than that
  // it happens to contain nothing matching a pattern.
  assert.deepEqual(releaseTags(root, { pre: false }), [],
    'a prerelease was offered as a release');
});

test('upgrade --check from rc.9 reports rc.10 as available', { timeout: 180_000 }, async (t) => {
  const root = clone(t);
  git(root, ['checkout', '--quiet', 'v2.0.0-rc.9']);
  const head = git(root, ['describe', '--tags', '--exact-match']).trim();
  assert.equal(head, 'v2.0.0-rc.9', 'the checkout is not on rc.9, so this proves nothing');

  const lines = [];
  const log = { step: (l) => lines.push(l), fail: (l) => lines.push(`FAIL ${l}`),
    warn: (l) => lines.push(`WARN ${l}`), ok: (l) => lines.push(String(l)) };
  await upgradeCommand({ flags: { check: true, pre: true, offline: true }, log, root,
    env: process.env, cwd: root });
  const text = lines.join('\n');

  assert.match(text, /rc\.10/, `--check never mentioned rc.10:\n${text}`);
  // The sentence the defect would have produced instead. Asserted by name because "already newest"
  // is a SUCCESSFUL-looking output — the failure mode here is a calm, wrong answer, not an error.
  assert.doesNotMatch(text, /newest release/,
    `--check reported rc.9 as the newest while rc.10 existed:\n${text}`);
});
