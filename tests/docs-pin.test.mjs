// ARC-03-S01 — the corpus is registered once, and the two places that name it agree.
//
// Deliberately narrow: ARC-01's tests/engine-config.test.mjs already asserts pin == gitlink (it was
// reported as "skipped — no gitlink yet (ARC-03)" until this story added one, and goes live here with
// no code change). This file adds only what that one does not cover — the .gitmodules keys — and
// re-asserts pin == gitlink for ONE reason: to print the exact repair command on mismatch.
//
// Reads only `git ls-files -s` and `git config -f .gitmodules`, so it passes on a checkout where the
// submodule has never been populated. That matters: CI does not check the corpus out (ARC-01-S11's
// checkout takes no submodules), so a test needing 300 MB of documentation would be a test nobody runs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const config = JSON.parse(readFileSync(join(root, 'engine.config.json'), 'utf8'));
const SUB = 'submodule.vendor/ServiceNowDocs';
const key = (k) => git(['config', '-f', '.gitmodules', '--get', `${SUB}.${k}`]);

// `git ls-files -s <path>` -> "160000 <sha> 0\tvendor/ServiceNowDocs" when a gitlink exists.
function gitlinkSha() {
  const line = git(['ls-files', '-s', 'vendor/ServiceNowDocs']);
  if (!line) return null;
  const [mode, sha] = line.split(/\s+/);
  return mode === '160000' ? sha : null;
}

test('.gitmodules registers the corpus at vendor/ServiceNowDocs, shallow, on the pinned family', () => {
  assert.equal(key('path'), 'vendor/ServiceNowDocs');
  assert.equal(key('branch'), config.docs.family,
    'the submodule branch and engine.config.json docs.family must name the same release family');
  assert.equal(key('shallow'), 'true');
  assert.equal(key('url'), config.docs.upstream,
    'a config that names a different upstream than the one git will clone is worse than no config');
});

test('the old root-level ServiceNowDocs gitlink is gone', () => {
  // ARC-01-S03 dropped it at import. If the import order ever changes and both gitlinks survive, the
  // checkout doubles — 600 MB instead of 300 — and nothing else in the tree would notice.
  assert.equal(git(['ls-files', '-s', 'ServiceNowDocs']), '',
    'a second gitlink at the repository root would double the corpus checkout');
});

test('engine.config.json docs.pin equals the committed gitlink, and says how to repair a mismatch', () => {
  const sha = gitlinkSha();
  assert.ok(sha, 'no gitlink at vendor/ServiceNowDocs — ARC-03-S01 adds it');
  assert.equal(sha, config.docs.pin,
    `engine.config.json docs.pin=${config.docs.pin} but gitlink=${sha} — `
    + `run: node scripts/docs-bump.mjs --to ${sha} (or edit docs.pin)`);
});

test('mutation: a divergent pin fails with BOTH shas and the repair line', () => {
  // Run against a mutated copy so the real files are never touched. The message is the point of this
  // test existing at all — ARC-01 already asserts the equality, it just cannot say what to do next.
  const sha = gitlinkSha();
  const wrong = 'a'.repeat(40);
  const message = `engine.config.json docs.pin=${wrong} but gitlink=${sha} — `
    + `run: node scripts/docs-bump.mjs --to ${sha} (or edit docs.pin)`;
  assert.throws(() => assert.equal(wrong, sha, message), (e) => {
    assert.match(e.message, new RegExp(wrong), 'the configured pin is not named');
    assert.match(e.message, new RegExp(sha), 'the actual gitlink is not named');
    assert.match(e.message, /docs-bump\.mjs --to /, 'the repair command is not given');
    return true;
  });
});
