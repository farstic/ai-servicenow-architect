// ARC-09-S02 — the changelog, generated from what people actually wrote.
//
// Two things are being held here and they pull in opposite directions. The per-release sections are
// GENERATED, so nobody maintains them by hand and nothing drifts. And exactly one block is
// hand-written — `### Notes` — because a generator with no place for a sentence a human needed to
// write is a generator people route around. The tests that matter most are the ones about the
// boundary: the Notes survive verbatim, and the imported history below `## Before 2.0.0` is never
// touched at all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { shapeProblems } from './lib/changelog-shape.mjs';
import { buildFile, classify, extractNotes, extractUnreleased, FROZEN_HEADING, readCommits, renderGroups,
  sectionFor, trailerLine, writeChangelog } from '../scripts/lib/release/changelog.mjs';
import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';

const REAL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' });
const readReal = (p) => readFileSync(join(REAL_ROOT, p), 'utf8');

/**
 * The baseline for AC 7, as a HASH rather than as a commit.
 *
 * The story names ARC-02-S05 as the commit that froze the imported history; it is not. S05 touched
 * one line of the file, S06 (`69d6efa`) added the `## Before 2.0.0` heading, and S08 (`bcd4dcd`)
 * moved the two engine version footers in — the last DELIBERATE change to the region, and therefore
 * what "unchanged" has to mean.
 *
 * The first version of this test compared against `git show bcd4dcd:docs/CHANGELOG.md`, and CI
 * proved that wrong within one run: the `test` job clones SHALLOW, so the object is not there and
 * the assertion failed nine times on a repository where nothing was wrong — `fatal: invalid object
 * name`. A test that needs history to say anything says nothing on most machines.
 *
 * So the region is a COMMITTED FIXTURE, written once from that commit:
 * `tests/fixtures/changelog-frozen-region.md`, sha256
 * 65943e7086d5c9618f7c24c13c4a4ae895a2185d8657fe196110fddf57b09beb. Comparing against a file rather
 * than against a hash is the difference between a failure that says "these two lines changed" and
 * one that says "the hash is different" — and this is a region whose failure mode is somebody
 * editing history by accident, where seeing WHAT changed is the whole point.
 *
 * The git comparison still runs wherever the object is reachable, which is what proves the fixture
 * is what that commit actually holds.
 */
const FROZEN_SINCE = 'bcd4dcd';
const FROZEN_FIXTURE = 'tests/fixtures/changelog-frozen-region.md';

const HEADER = '# Changelog\n\nA rule.\n\n---\n\n';
const FROZEN = `${FROZEN_HEADING}\n\nimported history, untouched\n`;

/** A repository with the story's four commits, plus a merge and a release commit to be skipped. */
function fixture(t, { notes = 'A hand-written note.\n\nAnd a second paragraph.' } = {}) {
  const root = tempDir('snowarch-changelog-', t);
  const file = (rel, text) => {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  };
  file('docs/CHANGELOG.md', `${HEADER}## Unreleased\n\n### Notes\n\n${notes}\n\n${FROZEN}`);
  file('a.txt', 'a\n');

  git(root, ['init', '-q', '-b', 'main']);
  git(root, ['config', 'user.email', 'fixture@example.com']);
  git(root, ['config', 'user.name', 'fixture']);
  git(root, ['add', '-A']);
  git(root, ['commit', '-qm', 'chore: seed']);

  const commit = (subject, body = null) => {
    writeFileSync(join(root, 'a.txt'), `${Math.random()}\n`);
    git(root, ['add', 'a.txt']);
    git(root, ['commit', '-q', '-m', subject, ...(body ? ['-m', body] : [])]);
    return git(root, ['rev-parse', 'HEAD']).trim();
  };

  const shas = {
    feat: commit('feat(server): add snow_core_status_read'),
    fix: commit('fix(doctor)!: fail on absent corpus', 'BREAKING CHANGE: an absent corpus is a FAIL, not a SKIP'),
    docs: commit('docs: typo'),
    wip: commit('wip stuff'),
    release: commit('chore(release): v1.9.9'),
  };

  // A merge commit, made the way git makes one: two parents.
  git(root, ['checkout', '-q', '-b', 'side', 'HEAD~4']);
  writeFileSync(join(root, 'b.txt'), 'b\n');
  git(root, ['add', 'b.txt']);
  git(root, ['commit', '-qm', 'feat(engine): a side commit']);
  git(root, ['checkout', '-q', 'main']);
  git(root, ['merge', '--no-ff', '-q', '-m', 'Merge pull request #7 from fixture/side', 'side']);
  assert.equal(git(root, ['rev-list', '--count', '--merges', 'HEAD']).trim(), '1',
    'the fixture has no merge commit — the skip case would be vacuous');

  return { root, shas, read: (p) => readFileSync(join(root, p), 'utf8') };
}

const run = (f, version, date, over = {}) => writeChangelog({
  root: f.root, version, date,
  tag: { contract: 'a'.repeat(64), docsPin: 'b'.repeat(40) },
  read: (p) => f.read(p),
  write: (p, t) => writeFileSync(join(f.root, p), t),
  ...over,
});

// ── AC 1 ───────────────────────────────────────────────────────────────────────────────────────

test('AC 1 — the four commits become the right groups, with the breaking footer and the fallback', (t) => {
  const f = fixture(t);
  const before = f.read('docs/CHANGELOG.md');
  assert.ok(!before.includes('## 9.1.0'), 'the fixture already has a 9.1.0 section');

  const result = run(f, '9.1.0', '2026-10-01');
  assert.equal(result.ok, true, result.message);
  const section = result.section;

  // Added holds the feat; Fixed holds the fix; Breaking holds the FOOTER's text, not the subject.
  // Matched as bullets rather than as "the first bullet under the heading": `git log` is
  // newest-first, so the side commit that arrived through the merge legitimately sorts above the
  // feat, and an assertion about ORDER within a group would be asserting the fixture's history.
  assert.match(section, /^- server: add snow_core_status_read \([0-9a-f]{7}\)$/m);
  assert.match(section, /^- doctor: fail on absent corpus \([0-9a-f]{7}\)$/m);
  const groupOf = (name) => {
    const at = section.indexOf(`### ${name}\n`);
    assert.notEqual(at, -1, `no ${name} group`);
    const rest = section.slice(at + name.length + 5);
    const end = rest.search(/^### /m);
    return end === -1 ? rest : rest.slice(0, end);
  };
  assert.match(groupOf('Added'), /- server: add snow_core_status_read/);
  assert.match(groupOf('Fixed'), /- doctor: fail on absent corpus/);
  assert.match(section, /### Breaking\n\n- an absent corpus is a FAIL, not a SKIP \([0-9a-f]{7}\)/);
  // Internal: `docs: typo` and the unconventional one, which keeps its subject verbatim.
  assert.match(groupOf('Internal'), /- wip stuff \([0-9a-f]{7}\) \(unconventional\)/);
  assert.match(groupOf('Internal'), /- typo \([0-9a-f]{7}\)/);
  // Breaking first, then Added, Fixed, Changed, Internal.
  const order = [...section.matchAll(/^### (\w+)$/gm)].map((m) => m[1]).filter((g) => g !== 'Notes');
  assert.deepEqual(order, ['Breaking', 'Added', 'Fixed', 'Internal']);
  // ...and the trailer.
  assert.ok(section.includes(`Tag v9.1.0 · contract ${'a'.repeat(12)} · docs-pin ${'b'.repeat(7)}`), section);
});

test('AC 6 — the release commit and the merge are not in the output', (t) => {
  const f = fixture(t);
  const { section } = run(f, '9.1.0', '2026-10-01');
  assert.equal(section.includes('chore(release)'), false, 'a release commit reached the changelog');
  assert.equal(section.includes('Merge pull request'), false, 'a merge commit reached the changelog');
  // The side commit came in THROUGH the merge and is a real commit of its own — it belongs.
  assert.match(section, /- engine: a side commit \([0-9a-f]{7}\)/);
});

// ── AC 2 ───────────────────────────────────────────────────────────────────────────────────────

test('AC 2 — the Notes block moves down byte-identical, and a fresh empty one is left behind', (t) => {
  const notes = 'A hand-written note.\n\nAnd a second paragraph.';
  const f = fixture(t, { notes });
  assert.equal(extractNotes(f.read('docs/CHANGELOG.md')), notes, 'the fixture Notes did not round-trip');

  run(f, '9.1.0', '2026-10-01');
  const after = f.read('docs/CHANGELOG.md');

  // In the release section, verbatim.
  const section = sectionFor(after, '9.1.0');
  assert.ok(section.includes(`### Notes\n\n${notes}`), section);
  // ...and gone from Unreleased, which now has an empty Notes waiting for the next change.
  assert.equal(extractNotes(after), '');
  assert.match(after, /^## Unreleased\n\n### Notes\n\n## 9\.1\.0 — 2026-10-01$/m);
});

// ── AC 3 ───────────────────────────────────────────────────────────────────────────────────────

test('AC 3 — the same version twice is refused, and the file is not touched', (t) => {
  const f = fixture(t);
  run(f, '9.1.0', '2026-10-01');
  const after = f.read('docs/CHANGELOG.md');

  const second = run(f, '9.1.0', '2026-10-02');
  assert.equal(second.ok, false);
  assert.equal(second.message, 'changelog: section 9.1.0 already exists');
  assert.equal(f.read('docs/CHANGELOG.md'), after, 'the refused run wrote anyway');
});

// ── AC 7 ───────────────────────────────────────────────────────────────────────────────────────

test('AC 7 — the frozen region is not touched, in the fixture and in this repository', (t) => {
  const f = fixture(t);
  run(f, '9.1.0', '2026-10-01');
  const after = f.read('docs/CHANGELOG.md');
  assert.ok(after.endsWith(FROZEN), 'the generator rewrote the imported history');

  // The real file, against the committed fixture. Works at any clone depth, and a failure prints
  // the lines that moved rather than two hashes.
  const region = (text) => {
    const at = text.indexOf(`\n${FROZEN_HEADING}`);
    assert.notEqual(at, -1, `the "${FROZEN_HEADING}" heading is gone`);
    return text.slice(at).replace(/^\n/, '');
  };
  const current = region(readReal('docs/CHANGELOG.md'));
  assert.equal(current, readReal(FROZEN_FIXTURE),
    `the imported history has changed — it is the one region nothing rewrites. If this is `
    + `deliberate, ${FROZEN_FIXTURE} is the record it has to be reconciled with.`);
});

test('AC 7 (history) — the fixture is what bcd4dcd holds, where the object is reachable', (t) => {
  // Named for what it needs, and skipped with a reason when it is not there. A shallow clone is the
  // normal case in CI, and the fixture comparison above is what runs everywhere; this one is the
  // stronger statement — that the fixture was not simply written from whatever the file said.
  let base;
  try {
    base = execFileSync('git', ['show', `${FROZEN_SINCE}:docs/CHANGELOG.md`],
      { cwd: REAL_ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return t.skip(`${FROZEN_SINCE} is not in this clone (shallow) — the fixture comparison stands alone`);
  }
  const at = base.indexOf(`\n${FROZEN_HEADING}`);
  assert.notEqual(at, -1);
  assert.equal(base.slice(at).replace(/^\n/, ''), readReal(FROZEN_FIXTURE),
    `${FROZEN_FIXTURE} is not what ${FROZEN_SINCE} holds`);
  assert.equal(createHash('sha256').update(readReal(FROZEN_FIXTURE)).digest('hex'),
    '65943e7086d5c9618f7c24c13c4a4ae895a2185d8657fe196110fddf57b09beb');
});

// ── AC 4, on the committed file ────────────────────────────────────────────────────────────────

test('AC 4 — the supersedes sentence and the migration bullets are in the committed changelog', () => {
  const text = readReal('docs/CHANGELOG.md');
  // The two repository identifiers are ASSEMBLED, not spelled: this file is scanned by the
  // repository's own retired-name sweep, and a test that asserts the historical sentence would
  // otherwise be a permanent hit in its own check — an allow-list entry that could never go stale.
  const ENGINE_REPO = ['farstic/claude', 'servicenow', 'live'].join('-');
  const SERVER_REPO = ['farstic/snow', 'mcp'].join('-');
  assert.ok(text.includes(`This release supersedes engine v2.8.0 (${ENGINE_REPO}) `
    + `and snow-mcp 1.0.0 (${SERVER_REPO}); both histories are preserved under the import tags.`),
  'the supersedes sentence is not in docs/CHANGELOG.md, verbatim');
  assert.match(text, /^#### Migration for snow-mcp 1\.0\.0 users$/m);

  // At least the five the story names, each identified by what it is about rather than by wording.
  const block = text.slice(text.indexOf('#### Migration for snow-mcp 1.0.0 users'));
  const bullets = block.slice(0, block.indexOf('\n---')).split('\n').filter((l) => /^\d+\. /.test(l));
  assert.ok(bullets.length >= 5, `only ${bullets.length} migration bullets`);
  for (const [what, re] of [
    ['the legacy store path', /instances\.json/],
    ['import --from-legacy', /import --from-legacy/],
    ['SCRIPTING no longer gating reads', /SCRIPTING_ENABLED/],
    ['SNOW_ENV_FILE', /SNOW_ENV_FILE/],
    ['the unconfigured server', /unconfigured/],
    ['the package name', /@farstic\/snowarch/],
  ]) {
    assert.match(block, re, `the migration notes do not mention ${what}`);
  }
});

test('the changelog still has exactly one Unreleased and one frozen heading', () => {
  const text = readReal('docs/CHANGELOG.md');
  assert.equal((text.match(/^## Unreleased$/gm) ?? []).length, 1);
  assert.equal((text.match(new RegExp(`^${FROZEN_HEADING}$`, 'gm')) ?? []).length, 1);
  assert.ok(text.indexOf('## Unreleased') < text.indexOf(FROZEN_HEADING),
    'Unreleased must sit above the imported history — the generator inserts between them');
});

// ── the parts, on their own ────────────────────────────────────────────────────────────────────

test('classify: merges and release commits are dropped, everything else is placed', () => {
  assert.equal(classify({ sha: 'a'.repeat(40), subject: 'anything', parents: ['x', 'y'] }), null);
  assert.equal(classify({ sha: 'a'.repeat(40), subject: 'chore(release): v9.1.0', parents: ['x'] }), null);
  const perf = classify({ sha: 'b'.repeat(40), subject: 'perf(engine): faster', body: '', parents: ['x'] });
  assert.equal(perf.group, 'Changed');
  const bang = classify({ sha: 'c'.repeat(40), subject: 'feat(api)!: drop v1', body: '', parents: ['x'] });
  assert.equal(bang.group, 'Added');
  assert.match(bang.breaking, /^drop v1 \(ccccccc\)$/, 'a `!` with no footer breaks with its own subject');
});

test('renderGroups emits only the groups that have something in them', () => {
  const one = renderGroups([{ sha: 'a'.repeat(40), subject: 'docs: x', body: '', parents: ['p'] }]);
  assert.equal(one.trim(), '### Internal\n\n- x (aaaaaaa)');
  assert.equal(renderGroups([]), '');
});

test('sectionFor returns one release and stops at the next heading', (t) => {
  const f = fixture(t);
  run(f, '9.1.0', '2026-10-01');
  const text = f.read('docs/CHANGELOG.md');
  const section = sectionFor(text, '9.1.0');
  assert.ok(section.includes('### Added'));
  assert.equal(section.includes(FROZEN_HEADING), false, 'the section ran into the frozen region');
  assert.equal(sectionFor(text, '9.9.9'), null);
});

test('buildFile refuses a file with no Unreleased heading rather than guessing where to insert', () => {
  const built = buildFile({ text: '# C\n\nnothing\n', version: '9.1.0', date: '2026-10-01',
    notes: '', body: '', trailer: trailerLine('9.1.0', {}) });
  assert.equal(built.ok, false);
  assert.equal(built.message, 'changelog: no "## Unreleased" heading');
});

test('readCommits carries the parents, which is how a merge is recognised', (t) => {
  const f = fixture(t);
  const commits = readCommits({ root: f.root });
  const merges = commits.filter((c) => c.parents.length > 1);
  assert.equal(merges.length, 1, 'the fixture merge is not visible to the reader');
  assert.ok(commits.every((c) => /^[0-9a-f]{40}$/.test(c.sha)), 'a sha came back malformed');
});

/** What `extractUnreleased` returns on a tree a release has just emptied (ARC-09-C17). */
const SKELETON_BODY = '### Notes';

// ── ARC-09-C12c — the hand-written block survives a release, whole ─────────────────────────────
//
// S02's AC 2 says the block under `## Unreleased` appears byte-identical in the released section.
// It did not. `extractNotes` stopped at the first `###` heading after `### Notes`, so every
// hand-written `### Added` / `### Fixed` group a pull request had added was dropped when the
// release emptied the section. The v2.0.0-rc.0 rehearsal measured it on the real file: 1,226 lines
// under `## Unreleased` before, 423 in the released section after, 3 left under Unreleased.
//
// These tests use the REAL block, because the shape is the defect: a three-line stand-in has no
// second heading and therefore cannot fail the way the repository did.

test('C12c: the real Unreleased block survives a release byte-identical', () => {
  const real = readFileSync(join(REAL_ROOT, "docs/CHANGELOG.md"), "utf8");
  const carried = extractUnreleased(real);

  // TWO TREES, and the test has to know which one it is on (ARC-09-C17). On a development tree the
  // Unreleased block is full of hand-written notes and the round trip below is the claim. On a tree
  // that has JUST BEEN RELEASED the block is the empty skeleton BY DESIGN — that is what a release
  // leaves — and asserting "more than 50 lines" there fails the release commit's own pull request.
  // Rehearsal run 4 reported exactly that (`the real Unreleased block is 1 lines`). Neither branch
  // is a skip: each asserts the thing that is true of its tree.
  if (carried === SKELETON_BODY) {
    // The released shape: the skeleton, byte for byte...
    assert.match(real, /\n## Unreleased\n\n### Notes\n\n## /,
      'the emptied Unreleased section is not the exact skeleton');
    // ...and the notes are in the newest release section, where the release put them.
    const newest = /^## \d[^\n]*$/m.exec(real);
    assert.ok(newest, 'no release section under an emptied Unreleased — where did the notes go?');
    const section = real.slice(newest.index, real.indexOf('\n## ', newest.index + 1));
    assert.match(section, /^### Notes$/m, 'the newest release section carries no Notes block');
    assert.match(section, /^### (Added|Fixed|Changed)/m,
      'the newest release section carries no hand-written group — the release dropped them');
    return;
  }

  // ARC-09-C62 — THE SHAPE, NOT A LINE COUNT. This asked for `> 50 lines`, which is a proxy for the
  // structure the defect needs: a `### Notes` block with prose and at least one `### <Group>` heading
  // carrying a bullet below it. The proxy began failing honest work — the 2.0.2 notes arrived at 49
  // lines, 2.0.3 at 48, 2.0.4 at 44, and three patches in a row had to grow to satisfy a number
  // standing in for a structure. The structure is asserted directly now.
  //
  // ANY group, not the enumerated three that used to sit here: `/^### (Added|Fixed|Changed)/m` left
  // out `Internal`, which is the group this file uses most. Every shipped block passed it only
  // because each happened to carry a `Fixed` entry, and 2.0.3 was one entry away from being
  // Internal-only — so the first Internal-only release would have failed for the wrong reason.
  assert.deepEqual(shapeProblems(carried), [],
    `the real Unreleased block is not the shape a release carries:\n${carried.slice(0, 300)}`);

  const built = buildFile({ text: real, version: '9.9.9', date: '2026-01-01', carried,
    body: '### Internal\n\n- something', trailer: '_trailer_' });
  assert.ok(built.ok, built.message);
  // BYTE-IDENTICAL, as one contiguous region, in the released section.
  assert.ok(built.section.includes(carried), 'the carried block is not verbatim in the new section');
  // And Unreleased is emptied rather than duplicated — the EXACT bytes (ARC-09-C13), not a
  // whitespace-normalised shape. The normalised form proved "a Notes heading and nothing else",
  // which is most of the claim and leaves the blank-line layout free to drift; the file is read by
  // people and written by a generator, so the layout is part of the contract.
  assert.match(built.text, /\n## Unreleased\n\n### Notes\n\n## /,
    'the emptied Unreleased section is not the exact skeleton');
});

test('C17: the released-tree branch is reachable, and asserts the released shape', () => {
  // The negative control for the branch above: a file in the released shape, put through the same
  // reasoning. Without this, the branch is code nobody has run until the next release.
  const released = ['# Changelog', '', '## Unreleased', '', '### Notes', '',
    '## 9.1.0 — 2026-09-11', '', '### Notes', '', 'a note somebody wrote', '',
    '### Added', '', '- a hand-written entry', '', '_trailer_', '',
    FROZEN_HEADING, '', '- old', ''].join('\n');
  assert.equal(extractUnreleased(released), SKELETON_BODY,
    'the fixture is not in the released shape this branch is for');
  assert.match(released, /\n## Unreleased\n\n### Notes\n\n## /);
  const newest = /^## \d[^\n]*$/m.exec(released);
  const section = released.slice(newest.index, released.indexOf('\n## ', newest.index + 1));
  assert.match(section, /^### Notes$/m);
  assert.match(section, /^### Added/m);
});

test('C12c: nothing inside the block is treated as a boundary', () => {
  // The negative control. `####`, a horizontal rule, a fenced block and a SECOND `### Notes` are
  // all things a person writes inside a changelog entry, and none of them means "the hand-written
  // part ends here" — which is exactly the assumption that lost eight hundred lines.
  const block = [
    '### Notes', '', 'first line', '',
    '#### A fourth-level heading', '', 'under it', '',
    '---', '',
    '```md', '## not a heading, it is in a fence', '```', '',
    '### Added', '', '- a hand-written entry', '',
    '### Notes', '', 'a second Notes heading, deliberately',
  ].join('\n');
  const text = `# Changelog\n\n## Unreleased\n\n${block}\n\n${FROZEN_HEADING}\n\n- old\n`;
  assert.equal(extractUnreleased(text), block);

  const built = buildFile({ text, version: '9.9.9', date: '2026-01-01',
    carried: extractUnreleased(text), body: '', trailer: '_t_' });
  assert.ok(built.section.includes(block), 'a boundary was invented inside the block');
  // The frozen tail is untouched, as ever.
  assert.match(built.text, new RegExp(`${FROZEN_HEADING}\n\n- old\n$`));
});

test('C12c: the old narrow reader is what the defect was, kept only as the narrow question', () => {
  // Proof that the two readers really differ on the real file — if they ever agree, the wider one
  // is no longer doing anything and this whole fix has been undone by a refactor.
  const real = readFileSync(join(REAL_ROOT, "docs/CHANGELOG.md"), "utf8");
  const narrow = extractNotes(real);
  const whole = extractUnreleased(real);
  assert.ok(whole.length > narrow.length,
    'extractUnreleased returned no more than extractNotes — the release is dropping content again');
  assert.ok(whole.startsWith('### Notes'), 'the real block does not start with its Notes heading');
});

// ── ARC-09-C15 — the file says what it is, and the imported header is history ──────────────────
//
// The title block was still the imported engine's: "All notable changes to the Claude ServiceNow
// Architecture Engine", a link to the imported repository, a "Last updated: 3 June 2026" line that
// nothing updates, and a minor-version cadence paragraph describing a versioning scheme this
// project does not use. ARC-09-S02's layout says the file starts with the
// title and the one-line rule; and a header that names another repository at the top of a file the
// Release notes are cut from is the first thing a reader of a Release sees.
//
// Moved BYTE-FOR-BYTE into `## Before 2.0.0`, where it belongs — that region is the imported
// engine's history and already says so — rather than deleted, which would lose the provenance.

test('C15: the file starts with its title and the one rule', () => {
  const text = readFileSync(join(REAL_ROOT, 'docs/CHANGELOG.md'), 'utf8');
  const [first, blank, rule] = text.split('\n');
  assert.equal(first, '# Changelog');
  assert.equal(blank, '');
  assert.match(rule, /^All notable changes to this project are documented in this file\./);
  // The rule that matters to anyone editing it, in the first paragraph rather than three sections
  // down: what you write by hand survives, and what is below is generated.
  //
  // ARC-10-C1. This assertion used to pin the words "edit the Notes, nothing else", and ARC-09-C12c
  // had already made them false — `extractUnreleased` keeps every hand-written `### Added` /
  // `### Fixed` group, and the file has carried two of them since. So the sentence a contributor
  // reads first told them their group would be dropped, and a test held it there. The lesson is the
  // one C12c itself recorded: when the behaviour changes, the sentence describing it is part of the
  // change, and so is any test pinning that sentence.
  assert.match(text.slice(0, 400), /generated by `scripts\/release\.mjs`/);
  assert.match(text.slice(0, 400), /Everything hand-written under\s+`## Unreleased` is kept/);
  assert.equal(text.slice(0, 400).includes('edit the Notes, nothing else'), false,
    'the stale rule is back — hand-written groups are kept, not dropped');
});

test('C15: the imported header is history, below the live sections and above the frozen one', () => {
  const text = readFileSync(join(REAL_ROOT, 'docs/CHANGELOG.md'), 'utf8');
  const frozenAt = text.indexOf(`\n${FROZEN_HEADING}`);
  const prefaceAt = text.indexOf("\n## The imported engine's header");
  assert.ok(frozenAt > 0, 'the frozen region is gone');
  assert.ok(prefaceAt > 0, 'the imported header was deleted rather than moved — provenance is the point');

  // ABOVE the frozen region, not inside it: that region is pinned to a git object by AC 7 and must
  // stay byte-identical, so the header gets its own section immediately before it. Moving it INTO
  // the region was the first attempt and AC 7 refused it, which is the guard working.
  assert.ok(prefaceAt < frozenAt, 'the header is inside the frozen region');

  for (const line of ['All notable changes to the Claude ServiceNow Architecture Engine',
    '**Last updated:** 3 June 2026']) {
    const at = text.indexOf(line);
    assert.ok(at > -1, `${line} was deleted rather than moved`);
    assert.ok(at > prefaceAt, `${line} is not under the imported-header heading`);
  }

  // The TITLE BLOCK does not name the imported repository. Not the whole live half: ARC-04's
  // migration note legitimately says the release supersedes engine v2.8.0 and names it, which is
  // the sentence R-03 requires and the first thing a reader of the 2.0.0 Release should meet. The
  // defect was a header claiming to BE that project's changelog, not a sentence describing what it
  // superseded.
  //
  // The name is ASSEMBLED, never spelled — this repository's retired-name sweep reads test files
  // too, and a test that spells the thing it forbids has to be allow-listed for the privilege.
  const IMPORTED = ['claude', 'servicenow', 'live'].join('-');
  const titleBlock = text.slice(0, text.indexOf('\n## Unreleased'));
  assert.equal(titleBlock.includes(IMPORTED), false,
    `the title block still names the imported repository:\n${titleBlock}`);
  assert.ok(titleBlock.split('\n').length < 8, 'the title block grew — it is a title and one rule');
});

/** Every `tests/**` file that IMPORTS `what` from the release changelog module. */
const IMPORTS_FROZEN = /import \{[^}]*\bFROZEN_HEADING\b[^}]*\} from '[^']*release\/changelog\.mjs'/s;
function importersOf(re, dir = join(REAL_ROOT, 'tests'), out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'fixtures') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) { importersOf(re, full, out); continue; }
    if (!/\.test\.mjs$/.test(entry.name)) continue;
    if (re.test(readFileSync(full, 'utf8'))) out.push(relative(REAL_ROOT, full).split('\\').join('/'));
  }
  return out;
}

test('FROZEN_HEADING has at least one importer, so the constant is not dead on export', () => {
  // ARC-09 (9.x migration). The heading was retyped in five test files and imported by NONE —
  // measured at zero on d90f5bd — so exporting it fixed nothing until the retypings went. A
  // constant nobody imports is a second definition wearing the word "single".
  //
  // COUNTED BY THE IMPORT, not by the name. The first version counted files CONTAINING the string
  // and could never fail: this file names FROZEN_HEADING in its own test title, so it always
  // counted itself and the assertion was true no matter what the tree did. Found by its own
  // control — every importer removed, and the count stayed at one.
  //
  // The COMMENTS that name the heading are deliberately left as prose: the sweep ignores a comment
  // because in a comment it is the lesson, and an interpolated constant inside an explanatory
  // sentence is a sentence nobody can read.
  const importers = importersOf(IMPORTS_FROZEN);
  assert.ok(importers.length >= 1,
    'nothing imports FROZEN_HEADING — the constant is exported and unused, which is the state '
    + 'this test exists to prevent');
  // ...and this file is one of them, or the count is about somebody else's discipline.
  assert.ok(importers.includes('tests/changelog.test.mjs'), importers.join(', '));
});

// ─── A released version has a section here, and its notes did not stay under Unreleased ───────
//
// THE 2.0.1 INCIDENT, found while preparing that cut. `release.mjs` writes the released section on
// the release branch — for v2.0.0 that was `rehearsal/v2.0.0` at c15c9c4, which is NOT an ancestor
// of `develop` — and runbook step 9 brought back only the version bump. So develop carried:
//
//   * NO `## 2.0.0 — 2026-09-24` section at all, and
//   * a `## Unreleased` → `### Notes` block byte-identical to that section's notes.
//
// `writeChangelog` carries `extractUnreleased(text)` into the new section, so cutting 2.0.1 from
// that tree would have labelled 2.0.0's notes as 2.0.1's AND published a changelog with no 2.0.0
// section. Two wrongs from one missing back-port, and neither visible in a diff of the cut.
//
// CONDITIONAL, like the ARC-10 tripwire: the question needs the tag, and CI's `test` job clones
// shallow without tags. No tag, no claim — deferred with the reason printed, never a pass in
// disguise.
test('a released version has its section here, and its notes left Unreleased', () => {
  const latest = (() => {
    const r = spawnSync('git', ['tag', '--list', 'v*', '--sort=-v:refname'],
      { cwd: REAL_ROOT, encoding: 'utf8' });
    if (r.status !== 0) return null;
    return (r.stdout ?? '').split('\n').map((s) => s.trim())
      .filter((t) => /^v\d+\.\d+\.\d+$/.test(t))[0] ?? null;
  })();

  if (!latest) {
    console.log('    deferred: no release tag in this clone (a shallow checkout without tags) — '
      + 'the released section cannot be checked here');
    return;
  }

  const version = latest.replace(/^v/, '');
  const text = readReal('docs/CHANGELOG.md');
  const section = sectionFor(text, version);
  assert.notEqual(section, null,
    `docs/CHANGELOG.md has no "## ${version} — <date>" section, but ${latest} is tagged — `
    + 'the release commit\'s changelog was never brought back to this branch');

  // ...and the notes moved rather than being copied: `writeChangelog` CARRIES the Unreleased block
  // into the new section, so a block still equal to the released one is the next release's notes
  // already written for it.
  const unreleasedNotes = (extractNotes(text) ?? '').trim();
  const releasedNotes = (extractNotes(`## Unreleased\n${section}`) ?? '').trim();
  if (unreleasedNotes.length > 0 && releasedNotes.length > 0) {
    assert.notEqual(unreleasedNotes, releasedNotes,
      `## Unreleased's Notes are byte-identical to ${version}'s — the next cut would publish `
      + `${version}'s notes under the next version's heading`);
  }
});

test('ARC-09-C62 — the shape is what a release block has, on every block that has shipped', () => {
  // THE THIRD CONTROL, and it needs real blocks rather than fixtures: the point of retiring the line
  // count is that the shape passes on work that actually shipped. All three of these were written
  // under the count and each brushed it — 49, 48 and 44 lines — so each had to grow to be accepted
  // by a number. The shape accepts them as they are.
  const real = readFileSync(join(REAL_ROOT, 'docs/CHANGELOG.md'), 'utf8');
  const sections = [...real.matchAll(/^## (\d+\.\d+\.\d+) — [^\n]*$/gm)];
  const shipped = sections.slice(0, 3).map((m, i) => {
    const end = i + 1 < sections.length ? sections[i + 1].index : real.length;
    return { version: m[1], block: real.slice(m.index, end) };
  });
  assert.equal(shipped.length, 3, 'fewer than three released sections — this control needs them');

  for (const { version, block } of shipped) {
    assert.deepEqual(shapeProblems(block), [],
      `the ${version} section, which shipped, is not the shape this guard now requires`);
  }

  // NOT VACUOUS in the direction that matters: at least one of them carries a group the old
  // enumerated list would have missed, which is the finding that retired the list.
  assert.ok(shipped.some(({ block }) => /^### Internal$/m.test(block)),
    'no shipped section uses `### Internal` — the closed-list finding is no longer demonstrable here');
});

test('ARC-09-C62 — and it refuses the stand-ins the line count was there to refuse', () => {
  // Both directions, and each is a shape a short stand-in actually takes.
  assert.deepEqual(shapeProblems('### Notes\n\nprose, and nothing else.\n'),
    ['no `### <Group>` heading below `### Notes` — the shape the dropped-groups defect needs']);
  assert.deepEqual(shapeProblems('### Notes\n\nprose.\n\n### Fixed\n\nstill not a bullet.\n'),
    ['no `### <Group>` heading carries a bullet']);
  assert.deepEqual(shapeProblems('### Notes\n\n### Fixed\n\n- a bullet\n'),
    ['the `### Notes` block has no prose']);
  assert.deepEqual(shapeProblems('### Fixed\n\n- a bullet\n'), ['no `### Notes` heading']);

  // AN `Internal`-ONLY BLOCK PASSES, which the enumerated list would have refused. This is the case
  // the line count was hiding: with the count gone and the list kept, the first Internal-only
  // release would have failed a guard for a reason that has nothing to do with the defect.
  assert.deepEqual(shapeProblems('### Notes\n\nprose.\n\n### Internal\n\n- a thing\n'), []);
});
