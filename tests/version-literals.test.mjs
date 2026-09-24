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

/**
 * ...and the upgrade harness, which SPELLS its fixture releases by design (ARC-09-C13).
 *
 * `buildWorld` builds `v9.0.0 → v9.1.0 → v9.2.0`, and those strings are the fixture world's subject
 * — its releases — not an expectation about this repository. They are normally invisible to this
 * sweep, because `9.x` is not the current version here. But ARC-09-C13's guard runs this file
 * INSIDE the fixture, where the fixture's own version IS current, and the sweep then flags the
 * harness and its tests for describing the world they exist to describe.
 *
 * The whole DIRECTORY, because the harness's tests name the same releases the harness builds: a
 * file-by-file list would grow with every test added there and the reason would be identical each
 * time. This is the one place where "a version that can never be current" (ARC-09-C17b) cannot
 * apply, because the versions being named are the fixture's own.
 */
const HARNESS = 'tests/upgrade/';

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

/**
 * The offending lines of one file: the version, spelled AS A WHOLE VERSION, outside a comment.
 *
 * It used to be `line.includes(version)`, and a substring match is wrong in both directions once
 * the version of record is a release triple. Measured against `2.0.0` on the 2.0.0-final table:
 * **21 lines and four whole files** were flagged for naming `2.0.0-rc.6`, `2.0.0-dev` or
 * `2.0.0-test` — versions that are not the record and never will be — because each of them contains
 * `2.0.0`. Those are not what this sweep is for, and a guard that cries at 21 lines nobody can act
 * on is a guard people learn to wave through.
 *
 * The rule is a version boundary, not a word boundary, because `v` is part of how a version is
 * written and a digit is not:
 *
 *   NOT preceded by a digit or a dot — `12.0.0` does not contain the version `2.0.0`;
 *                                      `v2.0.0` does, and must still be caught.
 *   NOT followed by `-` or a digit   — `2.0.0-rc.6` is a different version, and so is `2.0.01`.
 *
 * A following dot is deliberately allowed: `…released in 2.0.0.` ends a sentence, and excluding it
 * would make the sweep MISS a real literal. Between over-flagging and under-flagging, this one
 * over-flags: a false positive is an argument, a false negative is a dead tag.
 *
 * The same rule holds when the record is itself a prerelease — `2.0.0-rc.11` does not match inside
 * `2.0.0-rc.110`.
 */
export function literalLines(text, version) {
  const escaped = String(version).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const whole = new RegExp(`(?<![\\d.])${escaped}(?![-\\d])`);
  const hits = [];
  text.split('\n').forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*|#)/.test(line)) return;      // in a comment it is the lesson
    if (whole.test(line)) hits.push(i + 1);
  });
  return hits;
}

test('no assertion spells the current version of record (ARC-09-C12a)', () => {
  const offenders = [];
  for (const rel of [...testFiles(join(root, 'tests')), ...testFiles(join(root, 'packages'))]) {
    if (rel in FIXTURE_FILES || rel === SELF || rel.startsWith(HARNESS)) continue;
    const lines = literalLines(readFileSync(join(root, rel), 'utf8'), rootVersion);
    if (lines.length > 0) offenders.push(`${rel}:${lines.join(',')}`);
  }
  assert.deepEqual(offenders, [], `these spell "${rootVersion}" — read it from package.json instead. `
    + 'The release script writes the new version before the post-write gates run, so a literal here '
    + 'fails on the release commit itself (ARC-09-C12, found by a release rehearsal)');
});

/**
 * The version the NEXT release will carry — `2.0.0-dev` → `2.0.0` — derived, never spelled.
 *
 * ARC-09-C12a's sweep asks about the version of record, which on a development checkout is
 * `<x.y.z>-dev`: a string no assertion would write by accident, so the sweep passed while the tree
 * was full of literals spelling the release it is heading for. Those cost nothing until the release
 * script writes the new version and runs the post-write gates — the exact moment the original
 * defect was found, and the one moment the fix must not need.
 *
 * So the same rule is asked one release EARLY. Measured on d90f5bd before this pass: 12 governed
 * files and 72 lines would have failed the 2.0.0 cut; 0 after it.
 */
export const releaseTarget = (version) => String(version).replace(/-.*$/, '');

test('no test file spells the version the NEXT release will carry (ARC-09-C12a)', () => {
  const target = releaseTarget(rootVersion);
  const offenders = [];
  for (const rel of [...testFiles(join(root, 'tests')), ...testFiles(join(root, 'packages'))]) {
    if (rel in FIXTURE_FILES || rel === SELF || rel.startsWith(HARNESS)) continue;
    const lines = literalLines(readFileSync(join(root, rel), 'utf8'), target);
    if (lines.length > 0) offenders.push(`${rel}:${lines.join(',')}`);
  }
  assert.deepEqual(offenders, [], `these spell "${target}", the version the next release writes — `
    + 'move fixture versions to the 9.x series, or read the version from package.json. A literal '
    + 'here passes today and fails the release commit, which is the one run that cannot be retried');

  // THE EXEMPTION LIST IS THE EXISTING ONE AND NOTHING MORE. A sweep that grew its own list would
  // be a sweep whose list is where inconvenient lines go; growth is a deliberate edit with a bound
  // reason, and there is nothing to bind today — `tests/predecessor-notice.test.mjs` was the only
  // candidate and its failure MESSAGE was reworded instead, because a message is not evidence.
  assert.equal(Object.keys(FIXTURE_FILES).length, 3, 'the fixture allow-list grew without a reason');
});

test('C12a — the next-release sweep is not vacuous, and the target is derived', () => {
  // Both halves of the derivation, including the one that matters at the cut: once the release
  // script has written `2.0.0`, the target is that same string and the sweep keeps its meaning.
  assert.equal(releaseTarget('2.0.0-dev'), '2.0.0');
  assert.equal(releaseTarget('2.0.0-rc.11'), '2.0.0');
  assert.equal(releaseTarget('2.0.0'), '2.0.0');

  // ON A PRERELEASE TREE the two sweeps ask about different versions. ON A FINAL ONE they coincide
  // BY DEFINITION, and that is not a duplicate to be fixed — it is one guard reaching one answer.
  //
  // The first version of this line asserted they ALWAYS differ. That is green on `develop` and on
  // every rc, and red on the single commit that matters: the release commit, where `release.mjs`
  // writes the final version and then runs this suite (C49) and would refuse to cut. A test that
  // passes every day and fails the one run that cannot be retried is the exact defect ARC-09-C12a
  // exists to prevent — written into the test that prevents it. Found by running the tree at the
  // 2.0.0 final shape, which is now a standing control for anything touching a version test.
  const target = releaseTarget(rootVersion);
  if (rootVersion.includes('-')) {
    assert.notEqual(target, rootVersion,
      'a prerelease tree must ask about a version other than the one it carries');
  } else {
    assert.equal(target, rootVersion,
      'at a final version the two sweeps legitimately coincide — same guard, same answer');
  }

  // The negative control: a fixture reverted to the 2.x series is caught, and the 9.x convention
  // that replaced it is not.
  assert.deepEqual(literalLines(`  const block = engineBlock(r, { version: '${target}' });`, target), [1],
    'a fixture spelling the next release is no longer caught');
  assert.deepEqual(literalLines("  const block = engineBlock(r, { version: '9.9.9' });", target), []);
});

test('the sweep would catch a planted literal, and ignores one in a comment (ARC-09-C12a)', () => {
  // The negative control. Without it this file passes for ever the moment the scan stops finding
  // anything — including if `rootVersion` were read wrongly and became an empty string.
  const planted = `it('x', () => { expect(CONTRACT.version).toBe('${rootVersion}'); });`;
  assert.deepEqual(literalLines(planted, rootVersion), [1]);
  assert.deepEqual(literalLines(`// the version was ${rootVersion} when this was written`, rootVersion), []);
  assert.ok(rootVersion.length > 0 && /\d/.test(rootVersion), 'the version being searched for is not a version');
});

test('ARC-09-C50 — the sweep matches a version, not a substring of one', () => {
  // The 2.0.0-final table measured what a substring match costs at a RELEASE TRIPLE: 172 flagged
  // lines, of which 21 — and four whole files — named only `2.0.0-rc.6`, `2.0.0-dev` or
  // `2.0.0-test`. `v2.0.0-rc.6` contains `2.0.0`, so every one of them would have failed the
  // release for mentioning a version that is not the record and never will be.
  //
  // Asserted at `2.0.0` specifically, because that is the record version this fails at and the one
  // no run has had yet. The cases are both directions: the prerelease is NOT flagged, the bare
  // triple IS.
  assert.deepEqual(literalLines("  const tags = ['v2.0.0-rc.6'];", '2.0.0'), [],
    'a prerelease of the record version is not the record version');
  assert.deepEqual(literalLines("  version: '2.0.0-dev',", '2.0.0'), []);
  assert.deepEqual(literalLines("  assert.equal(v, '2.0.0');", '2.0.0'), [1],
    'the record version itself must still be caught');
  assert.deepEqual(literalLines("  annotate(root, 'v2.0.0', msg);", '2.0.0'), [1],
    'a `v` prefix is how a version is written, not a different token');

  // A digit before is a DIFFERENT version; a dot before is a longer one.
  assert.deepEqual(literalLines("  const v = '12.0.0';", '2.0.0'), []);
  assert.deepEqual(literalLines("  const v = '2.0.01';", '2.0.0'), []);

  // A trailing dot is a SENTENCE, and excluding it would make the sweep miss a real literal.
  // Between over-flagging and under-flagging this errs toward over: a false positive is an
  // argument, a false negative is a dead tag.
  assert.deepEqual(literalLines("  const note = 'released in 2.0.0.';", '2.0.0'), [1]);

  // And the rule holds when the record is itself a prerelease — the case that killed rc.10.
  assert.deepEqual(literalLines("  const t = '2.0.0-rc.110';", '2.0.0-rc.11'), []);
  assert.deepEqual(literalLines("  const t = '2.0.0-rc.11';", '2.0.0-rc.11'), [1]);
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
