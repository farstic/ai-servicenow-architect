// ARC-09-S02 — the commit lint, and the range it checks.
//
// The changelog is generated from commit subjects, so a subject nobody checked is a changelog entry
// nobody wrote. The generator deliberately never refuses history — it records an unconventional
// subject and moves on — which makes this the only place the discipline is enforced, and the range
// is therefore the most important thing about it: a lint that silently checked the wrong commits
// would pass every pull request and nobody would find out until a release read strangely.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { allowedScopes, check, failLine, lint, resolveRange } from '../scripts/ci/commitlint.mjs';
import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';

const REAL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCOPES = allowedScopes(REAL_ROOT);
const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' });

test('the scopes come from the tree, not from a list in the lint', () => {
  for (const fixed of ['engine', 'server', 'contract', 'ci', 'release', 'docs']) {
    assert.ok(SCOPES.has(fixed), `${fixed} is not an allowed scope`);
  }
  // Every skill directory is nameable without an edit here — the same reason the roster is loaded
  // rather than spelled. `snowarch` is the utility skill and is the one this proves.
  assert.ok(SCOPES.has('snowarch'), 'a real skill directory is not an allowed scope');
  assert.ok(!SCOPES.has('not-a-real-scope'));
});

test('a conforming subject passes, and every part of the convention is checked', () => {
  assert.equal(check('feat(server): add a tool', SCOPES), null);
  assert.equal(check('fix: a fix with no scope', SCOPES), null);
  assert.equal(check('fix(doctor)!: a breaking fix', SCOPES), null);
  assert.equal(check('chore(deps): bump eslint', SCOPES), null);

  assert.equal(check('updated stuff', SCOPES), 'expected type(scope)?: subject');
  assert.equal(check('feature(server): wrong type', SCOPES), 'expected type(scope)?: subject');
  assert.equal(check('feat(nowhere): bad scope', SCOPES), 'scope "nowhere" is not one of the allowed scopes');
  assert.match(check(`feat(ci): ${'x'.repeat(120)}`, SCOPES), /^subject is \d+ characters, the limit is 100$/);
});

test('a merge subject is not somebody\'s message, and is skipped', () => {
  assert.equal(check('Merge pull request #7 from farstic/side', SCOPES), null);
  assert.equal(check('Merge branch \'develop\'', SCOPES), null);
  // ...and by parent count too, which is the check that survives a reworded merge.
  const { failures } = lint({
    commits: [{ sha: 'a'.repeat(40), subject: 'anything at all', parents: ['x', 'y'] }],
    scopes: SCOPES,
  });
  assert.deepEqual(failures, []);
});

test('the FAIL line is the exact sentence a contributor reads', () => {
  assert.equal(
    failLine('abcdef1234567890', 'updated stuff', 'expected type(scope)?: subject'),
    'commitlint: FAIL abcdef1 "updated stuff" — expected type(scope)?: subject; see docs/CONTRIBUTING.md#commits');
});

test('the range is resolved from the CI shape and from the local one', () => {
  assert.deepEqual(resolveRange({ GITHUB_BASE_REF: 'develop', GITHUB_SHA: 'deadbeef' }),
    { base: 'origin/develop', head: 'deadbeef', source: 'ci' });
  // GITHUB_SHA absent (a workflow that did not set it) still resolves to something runnable.
  assert.deepEqual(resolveRange({ GITHUB_BASE_REF: 'main' }),
    { base: 'origin/main', head: 'HEAD', source: 'ci' });
  assert.deepEqual(resolveRange({ GITHUB_BASE_REF: 'main' }, { base: 'x', head: 'y' }),
    { base: 'x', head: 'y', source: 'flags' });

  // LOCALLY the base is the branch's own upstream, or `origin/develop`. Not `origin/main`: in this
  // repository `main` lags `develop` by a whole milestone, so `origin/main..HEAD` on a develop-based
  // branch is thirty commits of somebody else's work — some of it written before this convention
  // existed. The lint was right about those commits and useless to the person running it.
  assert.deepEqual(resolveRange({}, {}, { upstream: 'origin/arc-09/release' }),
    { base: 'origin/arc-09/release', head: 'HEAD', source: 'upstream' });
  assert.deepEqual(resolveRange({}, {}, { exists: (r) => r === 'origin/develop' }),
    { base: 'origin/develop', head: 'HEAD', source: 'local' });
  assert.deepEqual(resolveRange({}, {}, { exists: () => false }),
    { base: 'origin/main', head: 'HEAD', source: 'local' });
});

test('a commit already on the base is not this branch\'s to answer for', (t) => {
  // The property the range exists for, proved with the shape that actually bit: a base carrying a
  // non-conventional commit, and a branch that did not write it.
  //
  // Two-dot, not three. `A..B` is "reachable from B, not from A" — the commits this branch adds.
  // `A...B` is the SYMMETRIC difference and would drag the base's own commits in, which is the
  // opposite of what a lint of "your commits" means.
  const root = tempDir('snowarch-range-', t);
  writeFileSync(join(root, 'f.txt'), '1\n');
  git(root, ['init', '-q', '-b', 'main']);
  git(root, ['config', 'user.email', 'fixture@example.com']);
  git(root, ['config', 'user.name', 'fixture']);
  assert.equal(git(root, ['config', 'user.name']).trim(), 'fixture', 'the fixture identity did not take');
  git(root, ['add', '-A']);
  git(root, ['commit', '-qm', 'chore: base']);

  git(root, ['checkout', '-qb', 'feature']);
  assert.equal(git(root, ['rev-parse', '--abbrev-ref', 'HEAD']).trim(), 'feature',
    'the fixture did not move off main');
  writeFileSync(join(root, 'f.txt'), '2\n');
  git(root, ['commit', '-qam', 'feat(engine): mine, and conventional']);

  // ...and now the BASE grows a commit nobody on this branch wrote — S01's real subject, which is
  // not conventional because it predates the convention.
  git(root, ['checkout', '-q', 'main']);
  assert.equal(git(root, ['rev-parse', '--abbrev-ref', 'HEAD']).trim(), 'main',
    'the fixture did not move back to the base — the commit below would land on the branch');
  writeFileSync(join(root, 'f.txt'), '3\n');
  git(root, ['commit', '-qam', 'ARC-09-S01: one command cuts a release, and refuses to cut a bad one']);
  git(root, ['checkout', '-q', 'feature']);
  assert.equal(git(root, ['rev-parse', '--abbrev-ref', 'HEAD']).trim(), 'feature');

  const script = join(REAL_ROOT, 'scripts/ci/commitlint.mjs');
  const spawn = (args) => {
    try {
      return { code: 0, out: execFileSync(process.execPath, [script, ...args],
        { cwd: root, encoding: 'utf8', stdio: 'pipe' }) };
    } catch (e) {
      return { code: e.status, out: String(e.stdout ?? ''), err: String(e.stderr ?? '') };
    }
  };

  const r = spawn(['--base', 'main', '--head', 'HEAD']);
  assert.equal(r.code, 0, `${r.out}${r.err ?? ''}`);
  assert.match(r.out, /^commitlint: 1 commits ok$/m);
  assert.equal((r.err ?? '').includes('ARC-09-S01'), false,
    'the base\'s own commit was linted — the range is wrong');

  // The proof that the negative is not vacuous: the same commit IS seen from the other direction.
  const reversed = spawn(['--base', 'feature', '--head', 'main']);
  assert.equal(reversed.code, 1);
  assert.match(reversed.err, /FAIL [0-9a-f]{7} "ARC-09-S01: one command cuts a release/);
});

test('lint counts what it checked, and names each failure once', () => {
  const commits = [
    { sha: '1'.repeat(40), subject: 'feat(engine): fine', parents: ['p'] },
    { sha: '2'.repeat(40), subject: 'updated stuff', parents: ['p'] },
    { sha: '3'.repeat(40), subject: 'Merge pull request #1 from x/y', parents: ['p', 'q'] },
    { sha: '4'.repeat(40), subject: 'docs: also fine', parents: ['p'] },
  ];
  const { checked, failures } = lint({ commits, scopes: SCOPES });
  assert.equal(checked, 2, 'the merge should not be counted as checked either');
  assert.deepEqual(failures, [failLine('2'.repeat(40), 'updated stuff', 'expected type(scope)?: subject')]);
});

test('the real script, on a real range, in a real repository', (t) => {
  const root = tempDir('snowarch-commitlint-', t);
  const file = (rel, text) => {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  };
  file('a.txt', 'a\n');
  git(root, ['init', '-q', '-b', 'main']);
  git(root, ['config', 'user.email', 'fixture@example.com']);
  git(root, ['config', 'user.name', 'fixture']);
  assert.equal(git(root, ['config', 'user.name']).trim(), 'fixture',
    'the fixture identity did not take — a --global or worktree config outranks it');
  git(root, ['add', '-A']);
  git(root, ['commit', '-qm', 'chore: base']);
  const base = git(root, ['rev-parse', 'HEAD']).trim();

  const add = (subject) => {
    writeFileSync(join(root, 'a.txt'), `${Math.random()}\n`);
    git(root, ['add', 'a.txt']);
    git(root, ['commit', '-q', '-m', subject]);
  };
  add('feat(engine): a good one');
  add('updated stuff');
  assert.equal(git(root, ['rev-list', '--count', `${base}..HEAD`]).trim(), '2',
    'the fixture range is not two commits — the case would be testing nothing');

  const script = join(REAL_ROOT, 'scripts/ci/commitlint.mjs');
  const spawn = (args) => {
    try {
      return { code: 0, out: execFileSync(process.execPath, [script, ...args],
        { cwd: root, encoding: 'utf8', stdio: 'pipe' }) };
    } catch (e) {
      return { code: e.status, out: String(e.stdout ?? ''), err: String(e.stderr ?? '') };
    }
  };

  const bad = spawn(['--base', base, '--head', 'HEAD']);
  assert.equal(bad.code, 1);
  assert.match(bad.err, /^commitlint: FAIL [0-9a-f]{7} "updated stuff" — expected type\(scope\)\?: subject; see docs\/CONTRIBUTING\.md#commits$/m);

  // The same range with the subject reworded — the second half of AC 5.
  git(root, ['commit', '-q', '--amend', '-m', 'chore(ci): update matrix']);
  const good = spawn(['--base', base, '--head', 'HEAD']);
  assert.equal(good.code, 0, good.err);
  assert.match(good.out, /^commitlint: 2 commits ok$/m);

  // A range git cannot resolve is exit 2 with the fetch-depth hint, not a stack trace.
  const broken = spawn(['--base', 'origin/nowhere', '--head', 'HEAD']);
  assert.equal(broken.code, 2);
  assert.match(broken.err, /the job needs fetch-depth: 0/);
});
