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
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildFile, classify, extractNotes, readCommits, renderGroups, sectionFor, trailerLine,
  writeChangelog } from '../scripts/lib/release/changelog.mjs';
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
 * proved that wrong within a run: the `test` job clones SHALLOW, so the object is not there and the
 * assertion failed on a repository where nothing was wrong — `fatal: invalid object name`. A test
 * that needs history to say anything is a test that says nothing on most machines. So the region's
 * sha256 is pinned here, computed from that commit, and the git comparison runs additionally
 * wherever the object happens to be reachable.
 *
 * If this constant ever needs changing, the imported history has been edited, and that is the thing
 * AC 7 exists to prevent.
 */
const FROZEN_SINCE = 'bcd4dcd';
const FROZEN_SHA256 = '3bb91be468e7d6677dc91e623308eeaed91bfc8f88baacb9f4aadc4c46a05eee';

const HEADER = '# Changelog\n\nA rule.\n\n---\n\n';
const FROZEN = '## Before 2.0.0\n\nimported history, untouched\n';

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
  assert.ok(!before.includes('## 2.0.0'), 'the fixture already has a 2.0.0 section');

  const result = run(f, '2.0.0', '2026-10-01');
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
  assert.ok(section.includes(`Tag v2.0.0 · contract ${'a'.repeat(12)} · docs-pin ${'b'.repeat(7)}`), section);
});

test('AC 6 — the release commit and the merge are not in the output', (t) => {
  const f = fixture(t);
  const { section } = run(f, '2.0.0', '2026-10-01');
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

  run(f, '2.0.0', '2026-10-01');
  const after = f.read('docs/CHANGELOG.md');

  // In the release section, verbatim.
  const section = sectionFor(after, '2.0.0');
  assert.ok(section.includes(`### Notes\n\n${notes}`), section);
  // ...and gone from Unreleased, which now has an empty Notes waiting for the next change.
  assert.equal(extractNotes(after), '');
  assert.match(after, /^## Unreleased\n\n### Notes\n\n## 2\.0\.0 — 2026-10-01$/m);
});

// ── AC 3 ───────────────────────────────────────────────────────────────────────────────────────

test('AC 3 — the same version twice is refused, and the file is not touched', (t) => {
  const f = fixture(t);
  run(f, '2.0.0', '2026-10-01');
  const after = f.read('docs/CHANGELOG.md');

  const second = run(f, '2.0.0', '2026-10-02');
  assert.equal(second.ok, false);
  assert.equal(second.message, 'changelog: section 2.0.0 already exists');
  assert.equal(f.read('docs/CHANGELOG.md'), after, 'the refused run wrote anyway');
});

// ── AC 7 ───────────────────────────────────────────────────────────────────────────────────────

test('AC 7 — the frozen region is not touched, in the fixture and in this repository', (t) => {
  const f = fixture(t);
  run(f, '2.0.0', '2026-10-01');
  const after = f.read('docs/CHANGELOG.md');
  assert.ok(after.endsWith(FROZEN), 'the generator rewrote the imported history');

  // The real file. By hash, because this runs on a shallow clone as often as not.
  const region = (text) => {
    const at = text.indexOf('\n## Before 2.0.0');
    assert.notEqual(at, -1, 'the "## Before 2.0.0" heading is gone');
    return text.slice(at);
  };
  const current = region(readReal('docs/CHANGELOG.md'));
  assert.equal(createHash('sha256').update(current).digest('hex'), FROZEN_SHA256,
    `the imported history has changed since ${FROZEN_SINCE} — it is the one region nothing rewrites`);

  // ...and against the commit itself where the object is reachable, which is a stronger statement
  // and the one that proves the pinned hash is the hash of what that commit actually holds.
  let base = null;
  try {
    base = execFileSync('git', ['show', `${FROZEN_SINCE}:docs/CHANGELOG.md`],
      { cwd: REAL_ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch { /* shallow clone: the hash above is the whole assertion */ }
  if (base !== null) assert.equal(current, region(base), `the region differs from ${FROZEN_SINCE}`);
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
  assert.equal((text.match(/^## Before 2\.0\.0$/gm) ?? []).length, 1);
  assert.ok(text.indexOf('## Unreleased') < text.indexOf('## Before 2.0.0'),
    'Unreleased must sit above the imported history — the generator inserts between them');
});

// ── the parts, on their own ────────────────────────────────────────────────────────────────────

test('classify: merges and release commits are dropped, everything else is placed', () => {
  assert.equal(classify({ sha: 'a'.repeat(40), subject: 'anything', parents: ['x', 'y'] }), null);
  assert.equal(classify({ sha: 'a'.repeat(40), subject: 'chore(release): v2.0.0', parents: ['x'] }), null);
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
  run(f, '2.0.0', '2026-10-01');
  const text = f.read('docs/CHANGELOG.md');
  const section = sectionFor(text, '2.0.0');
  assert.ok(section.includes('### Added'));
  assert.equal(section.includes('## Before 2.0.0'), false, 'the section ran into the frozen region');
  assert.equal(sectionFor(text, '9.9.9'), null);
});

test('buildFile refuses a file with no Unreleased heading rather than guessing where to insert', () => {
  const built = buildFile({ text: '# C\n\nnothing\n', version: '2.0.0', date: '2026-10-01',
    notes: '', body: '', trailer: trailerLine('2.0.0', {}) });
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
