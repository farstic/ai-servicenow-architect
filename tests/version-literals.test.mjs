/**
 * ARC-09-C12a — no test spells the version of record.
 *
 * The release script writes the new version into the manifests and THEN runs the post-write gates,
 * so any assertion that hard-codes today's version fails on the release commit itself. That is not
 * hypothetical: the v2.0.0-rc.0 rehearsal got through the preflight, all six gates and the writes,
 * and then stopped at
 *
 *     release: version-consistency failed after the writes — rolled back, nothing was committed
 *
 * because `tests/version-consistency.test.mjs` asserted the literal `root 2.0.0-dev`. The rollback
 * worked and nothing was committed, but the real 2.0.0 cut would have failed identically — and
 * `release-dryrun` could never have caught it, because `--dry-run` stops before the writes.
 *
 * Two more were found the same way (`CONTRACT.version` and the handshake's `serverInfo.version`).
 * This file is what stops the next one being found by a release.
 *
 * THE RULE FOR FIXTURES (ARC-09-C17b): a test that needs a version in its DATA uses one no release
 * will ever carry — `9.9.9`, or the `v9.x` the upgrade harness uses. A plausible one is a trap: a
 * fixture spelling `2.0.0-rc.0` was invisible until the rehearsal cut `v2.0.0-rc.0`, at which point
 * the sweep flagged it and was right to. The sweep cannot tell a fixture's version from an
 * assertion's, and it should not have to.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;

/**
 * Files where the version string is INPUT rather than an expectation.
 *
 * Each one builds a fixture that carries a version — a fake manifest, a fake tag, a planted
 * `CLAUDE.md` marker — and the string is what the fixture is made of. They are listed by name with
 * the reason, never matched by a pattern, so adding one is a decision somebody wrote down.
 */
/**
 * Files where a version string is INPUT rather than an expectation, and THE LITERAL EACH CARRIES.
 *
 * ARC-09-C17. The list used to be keyed to "the current version", which is a moving target: after a
 * release writes `2.0.0-rc.0` into the manifests, these fixtures still say `2.0.0-dev` — they are
 * fixtures, they are supposed to — and the stale check called every one of them stale on the
 * release commit. Rehearsal run 4 reported exactly that, on the pull request that has to merge.
 *
 * So each entry records the literal it actually contains. The stale check asks whether THAT string
 * is still there, which is a question about the file rather than about what day it is.
 */
const FIXTURE_FILES = {
  'tests/claude-md.test.mjs': { literal: '2.0.0-dev',
    why: 'plants marker lines in a synthetic CLAUDE.md to prove the counter' },
  'tests/release.test.mjs': { literal: '2.0.0-dev',
    why: 'builds release fixtures whose manifests carry a starting version' },
  'tests/release-workflow.test.mjs': { literal: '2.0.0-dev',
    why: 'builds a tagged fixture tree' },
};

/**
 * ...and this file itself, by name and with the reason (ARC-09-C17): its failure MESSAGE has to
 * describe the thing it is looking for, and during the rehearsal that message named a version which
 * had just become the current one — so the sweep flagged itself. The message is version-free now
 * and this exemption is the belt to that braces: a test that fails on its own explanation is a test
 * nobody can act on.
 */
const SELF = 'tests/version-literals.test.mjs';

// NOT this file: it reads the version and interpolates it, so it never spells one — and its own
// stale-entry check caught the exemption I wrote for it out of habit.
function testFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'fixtures' || entry.name === 'dist') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) { testFiles(full, out); continue; }
    if (/\.test\.(mjs|ts)$/.test(entry.name)) out.push(relative(root, full).split('\\').join('/'));
  }
  return out;
}

/** The offending lines of one file: the version, spelled, outside a comment. */
export function literalLines(text, version) {
  const hits = [];
  text.split('\n').forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*|#)/.test(line)) return;      // in a comment it is the lesson
    if (line.includes(version)) hits.push(i + 1);
  });
  return hits;
}

test('no assertion spells the current version of record (ARC-09-C12a)', () => {
  const offenders = [];
  for (const rel of [...testFiles(join(root, 'tests')), ...testFiles(join(root, 'packages'))]) {
    if (rel in FIXTURE_FILES || rel === SELF) continue;
    const lines = literalLines(readFileSync(join(root, rel), 'utf8'), rootVersion);
    if (lines.length > 0) offenders.push(`${rel}:${lines.join(',')}`);
  }
  assert.deepEqual(offenders, [], `these spell "${rootVersion}" — read it from package.json instead. `
    + 'The release script writes the new version before the post-write gates run, so a literal here '
    + 'fails on the release commit itself (ARC-09-C12, found by a release rehearsal)');
});

test('the sweep would catch a planted literal, and ignores one in a comment (ARC-09-C12a)', () => {
  // The negative control. Without it this file passes for ever the moment the scan stops finding
  // anything — including if `rootVersion` were read wrongly and became an empty string.
  const planted = `it('x', () => { expect(CONTRACT.version).toBe('${rootVersion}'); });`;
  assert.deepEqual(literalLines(planted, rootVersion), [1]);
  assert.deepEqual(literalLines(`// the version was ${rootVersion} when this was written`, rootVersion), []);
  assert.ok(rootVersion.length > 0 && /\d/.test(rootVersion), 'the version being searched for is not a version');
});

test('every allow-listed fixture file still contains the literal it is listed for (ARC-09-C12a)', () => {
  // An exemption that outlives its reason is how a list stops meaning anything — but the question
  // is about the LITERAL the file carries, not about the current version (ARC-09-C17). Asking the
  // second made every fixture look stale the moment a release moved the manifests, on the very
  // pull request that has to merge.
  const stale = Object.entries(FIXTURE_FILES)
    .filter(([rel, { literal }]) => literalLines(readFileSync(join(root, rel), 'utf8'), literal).length === 0)
    .map(([rel, { literal }]) => `${rel} (no longer spells "${literal}")`);
  assert.deepEqual(stale, [], 'update or remove these entries in FIXTURE_FILES');
});

test('C17: the allow-list survives a release, because it is not keyed to the version', () => {
  // The negative control for the fix. On a released tree the root version is the new number while
  // the fixtures still carry theirs; the OLD rule — "does this file spell the CURRENT version?" —
  // calls every entry stale, and the new one does not.
  const released = '9.9.9-rc.1';
  const oldRule = Object.keys(FIXTURE_FILES).filter((rel) =>
    literalLines(readFileSync(join(root, rel), 'utf8'), released).length === 0);
  assert.deepEqual(oldRule, Object.keys(FIXTURE_FILES),
    'the old rule would have called every fixture stale — that is the defect being fixed');
  const newRule = Object.entries(FIXTURE_FILES)
    .filter(([rel, { literal }]) => literalLines(readFileSync(join(root, rel), 'utf8'), literal).length === 0);
  assert.deepEqual(newRule, [], 'the new rule still calls a fixture stale on a released tree');
});


test('C17b: a fixture spelling the current version is caught, even in a heading', () => {
  // The negative control for that rule. The line that slipped through was a markdown `##` heading
  // inside a fixture array — not an `expect(...)` — so the control uses that shape rather than an
  // assertion's, which is the shape the earlier control already covered.
  const planted = `  const released = ['## ${rootVersion} — 2026-01-01', '', 'text'];`;
  assert.deepEqual(literalLines(planted, rootVersion), [1]);
  // And the convention passes: a fixture version no release will carry.
  assert.deepEqual(literalLines(`  const released = ['## 9.9.9 — 2026-01-01'];`, rootVersion), []);
});
