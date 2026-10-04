/**
 * ARC-07-C34 — `scripts/ci/control.mjs`: the mechanism that holds a rule prose could not.
 *
 * THE PROVENANCE, because it is the argument for the script existing. A control degrades the product,
 * asserts the named test fails, and restores — and the restore was `git checkout HEAD -- <file>`, which
 * restores from the INDEX. Run while the fix is still uncommitted, it silently reverts the fix. In one
 * night of ARC-07-W17 that happened FIVE times, the last on the SessionStart hook fix, and every time
 * it was found only by reading the file back. `docs/CONTRIBUTING.md` has carried the rule since the
 * second occurrence and ARC-07-C26 restated it as an order; a rule read and broken five times is not
 * the instrument.
 *
 * EVERY CASE HERE RUNS IN A THROWAWAY GIT REPOSITORY, never in this checkout. A test for a tool whose
 * whole job is to refuse dirty files must not be the reason this tree is dirty — and ARC-07-C33 is open
 * on four test files that write into the checkout, so adding a fifth while that row is unfixed would be
 * the same defect with a newer date.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(HERE, '..', 'scripts', 'ci', 'control.mjs');

const EXIT = { ok: 0, inert: 1, refused: 2, restoreFailed: 3 };

/** A repository with one committed file, and nothing else. */
function repo(t, { content = 'export const answer = 42;\n', autocrlf = false } = {}) {
  const dir = tempDir('control-script-', t);
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  // `-b main` because `init.defaultBranch` is a MACHINE setting (ARC-09-C14): a fixture whose branch
  // name comes from the operator's git config is a fixture that behaves differently per machine, and
  // `precondition-asserts.test.mjs` scans for exactly this. It caught my first version.
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'test');
  git('config', 'commit.gpgsign', 'false');
  // `core.autocrlf` IS PINNED IN EVERY FIXTURE, false by default and true in the case that wants it.
  // Inheriting it is what made three of these cases red on the Windows runner and green here: the
  // runner's global config is `true`, so a checkout wrote CRLF and the byte assertions below compared
  // it with an LF literal. Same class as ARC-09-C14's `init.defaultBranch` — a test that inherits a
  // machine setting tests the machine.
  git('config', 'core.autocrlf', String(autocrlf));
  mkdirSync(join(dir, 'lib'), { recursive: true });
  writeFileSync(join(dir, 'lib', 'thing.mjs'), content);
  git('add', '-A');
  git('commit', '-q', '-m', 'the checkpoint');
  return { dir, git, file: 'lib/thing.mjs',
    /**
     * Does git consider the working tree's copy identical to `sha`? — the tool's own `sameAsCommit`
     * shape, for the same reason: `git diff` applies the filters git applied on the way in, so the
     * answer is the one git would give on any platform. Comparing bytes here made the assertion say
     * "the restore failed" about a restore git calls perfect.
     */
    matchesCommit: (sha, f = 'lib/thing.mjs') =>
      spawnSync('git', ['diff', '--quiet', sha, '--', f], { cwd: dir }).status === 0,
    read: () => readFileSync(join(dir, 'lib', 'thing.mjs'), 'utf8'),
    sha: () => git('rev-parse', 'HEAD').trim() };
}

/** Run the script inside that repository. */
const control = ({ dir, files, degrade, test: testCmd }) => {
  const argv = [SCRIPT];
  for (const f of files) argv.push('--file', f);
  argv.push('--degrade', degrade, '--test', testCmd);
  const r = spawnSync(process.execPath, argv, { cwd: dir, encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};

test('ARC-07-C34 — it REFUSES a file with uncommitted changes, which is the loss it exists for', (t) => {
  const r = repo(t);
  writeFileSync(join(r.dir, 'lib', 'thing.mjs'), 'const uncommitted = true;\n');

  const got = control({ dir: r.dir, files: [r.file], degrade: 'true', test: 'true' });
  assert.equal(got.code, EXIT.refused, got.out);
  assert.match(got.out, /REFUSED/);
  assert.match(got.out, /uncommitted changes/);
  // ...and it says what to do, because the answer is not obvious under time pressure — a `wip:` commit
  // folded in afterwards is enough, and that is the sentence CONTRIBUTING.md already carries.
  assert.match(got.out, /Commit first/);

  // THE FILE IS UNTOUCHED, which is the whole point: refusing must not itself destroy the work.
  assert.equal(r.read(), 'const uncommitted = true;\n',
    'the refusal restored the file — it must leave the uncommitted work exactly where it was');
});

test('ARC-07-C34 — ...and a file staged but not committed is refused too', (t) => {
  const r = repo(t);
  writeFileSync(join(r.dir, 'lib', 'thing.mjs'), 'const staged = true;\n');
  r.git('add', 'lib/thing.mjs');

  // `git status --porcelain` reports a staged change, so the first refusal catches this — the point of
  // asserting it separately is that "clean" in the operator's head often means "I staged it".
  const got = control({ dir: r.dir, files: [r.file], degrade: 'true', test: 'true' });
  assert.equal(got.code, EXIT.refused, got.out);
  assert.equal(r.read(), 'const staged = true;\n');
});

test('ARC-07-C34 — a VALID control: it prints the checkpoint sha, and restores by it', (t) => {
  const r = repo(t);
  const sha = r.sha();

  const got = control({ dir: r.dir,
    files: [r.file],
    // A degradation that really changes the file, and a test that really reads it.
    degrade: `node -e "const f='lib/thing.mjs';const {readFileSync,writeFileSync}=require('fs');`
      + `writeFileSync(f, readFileSync(f,'utf8').replace('42','0'))"`,
    test: `node -e "const s=require('fs').readFileSync('lib/thing.mjs','utf8');`
      + `process.exit(s.includes('42') ? 0 : 1)"` });

  assert.equal(got.code, EXIT.ok, got.out);
  assert.match(got.out, /VALID/);
  // THE SHA IS IN THE OUTPUT, BEFORE THE CHANGE. `git checkout HEAD --` never said what HEAD was, so a
  // restore to the wrong commit looked exactly like a restore to the right one.
  assert.ok(got.out.includes(sha.slice(0, 12)),
    `the checkpoint sha is not in the output:\n${got.out}`);
  // ...and the file is back — ASKED OF GIT, not compared as bytes. The runner's `autocrlf=true`
  // checkout writes CRLF, so an LF literal here fails on a restore git considers perfect. That is the
  // same defect as the tool's own, one layer up, and it took three Windows cells twice.
  assert.ok(r.matchesCommit(sha), 'git says the restored file differs from the checkpoint');
});

test('ARC-07-C34 — an INERT control is reported as a failure of the control, not a pass', (t) => {
  // THE DEFECT THIS PROGRAMME KEEPS MEETING: a control whose test passes while the product is degraded
  // proves nothing about the test it names, and it looks identical to a control that worked. ARC-07-W7's
  // went inert, ARC-07-W9's first sequence case derived on both sides, and W17's usage case could not
  // fail until it was driven through `cli.mjs`. Exit 1 and the word INERT, so it cannot be mistaken.
  const r = repo(t);
  const got = control({ dir: r.dir, files: [r.file],
    degrade: 'true',        // changes nothing
    test: 'true' });        // and passes anyway
  assert.equal(got.code, EXIT.inert, got.out);
  assert.match(got.out, /INERT/);
  assert.match(got.out, /does not\s+see that degradation|does not see that degradation/);
  // ...and it still restored and verified, so an inert result costs nothing but the knowledge.
  assert.ok(r.matchesCommit(r.sha()), 'the inert path left the file changed');
});

test('ARC-07-C34 — it restores by the SHA, so a commit made mid-run cannot move the target', (t) => {
  // WHY NOT `HEAD`: `git checkout HEAD -- <file>` resolves HEAD at restore time. Anything that commits
  // while the control runs — a watcher, a parallel agent, the operator in another terminal — moves it,
  // and the restore then lands on a tree nobody chose. The sha is read once, printed, and used.
  const r = repo(t);
  const checkpoint = r.sha();

  const got = control({ dir: r.dir, files: [r.file],
    // The degradation changes the file AND commits a different content, moving HEAD.
    degrade: `node -e "const {writeFileSync}=require('fs');writeFileSync('lib/thing.mjs','const moved = 1;\\n')"`
      + ' && git add -A && git -c user.email=t@e.invalid -c user.name=t commit -q -m "moved HEAD"',
    test: 'false' });

  assert.equal(got.code, EXIT.ok, got.out);
  assert.notEqual(r.sha(), checkpoint, 'the fixture did not actually move HEAD');
  // Restored to the CHECKPOINT's content, not to the new HEAD's — and the DIFFERENCE between the two
  // is the claim, so this one compares against each sha rather than against a literal.
  assert.ok(r.matchesCommit(checkpoint),
    'the restore followed HEAD instead of the checkpoint sha');
  assert.equal(r.matchesCommit(r.sha()), false,
    'the file matches the NEW head too, so this case could not tell the two apart');
});

test('ARC-07-C34 — it refuses without --file, --degrade or --test rather than guessing', (t) => {
  const r = repo(t);
  const cases = [
    [['--degrade', 'true', '--test', 'true'], /--file is required/],
    [['--file', r.file, '--test', 'true'], /--degrade/],
    [['--file', r.file, '--degrade', 'true'], /--test/],
    [['--file', r.file, '--degrade', 'true', '--test', 'true', '--wat'], /unknown argument/],
  ];
  for (const [argv, message] of cases) {
    const got = spawnSync(process.execPath, [SCRIPT, ...argv], { cwd: r.dir, encoding: 'utf8' });
    assert.equal(got.status, EXIT.refused, `${argv.join(' ')}:\n${got.stdout}${got.stderr}`);
    assert.match(`${got.stdout}${got.stderr}`, message);
  }
});

test('ARC-07-C34 — several files are one checkpoint, and all of them are verified', (t) => {
  // ARC-07-W12's loss was TWO files in one control, and only one of them was noticed at first.
  const r = repo(t);
  writeFileSync(join(r.dir, 'lib', 'other.mjs'), 'export const second = 1;\n');
  r.git('add', '-A');
  r.git('commit', '-q', '-m', 'two files');

  const got = control({ dir: r.dir,
    files: ['lib/thing.mjs', 'lib/other.mjs'],
    degrade: `node -e "const {writeFileSync}=require('fs');`
      + `writeFileSync('lib/thing.mjs','x\\n');writeFileSync('lib/other.mjs','y\\n')"`,
    test: 'false' });

  assert.equal(got.code, EXIT.ok, got.out);
  const sha = r.sha();
  assert.ok(r.matchesCommit(sha, 'lib/thing.mjs'));
  assert.ok(r.matchesCommit(sha, 'lib/other.mjs'), 'the second file was not restored');
  assert.match(got.out, /2 file\(s\)/);
});

test('ARC-07-C34 — a CRLF-converting checkout still verifies, which the Windows cells proved it must', (t) => {
  // THE WINDOWS CELLS FOUND THIS AND A MAC COULD NOT, until this case. `core.autocrlf=true` is the
  // runner's default: the blob stays LF and `git checkout <sha> -- <file>` writes CRLF to the working
  // tree. The first version of this tool compared `git show <sha>:<file>` against
  // `readFileSync(file, 'utf8')` — BYTES — so a restore git considers perfect looked like a failure,
  // and three of this file's own VALID-path cases exited 3 on all three Windows cells while passing
  // here.
  //
  // The fix is to ask GIT whether the file matches the commit, because git applies the same filters on
  // the way out that it applied on the way in. The fixture sets autocrlf explicitly rather than
  // inheriting it, which is ARC-09-C14's rule for `init.defaultBranch` applied to the same class of
  // machine setting: a test that depends on the operator's git config tests the operator.
  const r = repo(t, { autocrlf: true });

  const got = control({ dir: r.dir, files: [r.file],
    // `\\n` and not `\n`: this is a template literal, so a single backslash-n becomes a REAL newline
    // inside the JS string the child parses, which is a SyntaxError. The degradation then never applied
    // and this case passed while proving nothing — and the tool SAID SO, in a line I did not read:
    // "the --degrade command exited non-zero; running --test anyway". Its own warning caught it.
    degrade: `node -e "const {writeFileSync}=require('fs');writeFileSync('lib/thing.mjs','x\\n')"`,
    test: 'false' });

  assert.equal(got.code, EXIT.ok, got.out);
  assert.match(got.out, /VALID/);
  assert.doesNotMatch(got.out, /RESTORE FAILED/,
    'the verify compared bytes instead of asking git, so a CRLF checkout read as a failed restore');

  // ...and git agrees the file is back, which is the claim that matters rather than the byte count.
  const diff = spawnSync('git', ['diff', '--quiet', r.sha(), '--', r.file], { cwd: r.dir });
  assert.equal(diff.status, 0, 'git says the restored file differs from the checkpoint');
});
