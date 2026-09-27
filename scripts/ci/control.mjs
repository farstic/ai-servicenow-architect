// ARC-07-C34 — run a control without being able to destroy the work it is testing.
//
// A CONTROL degrades the product, asserts that the named test fails, and restores. The restore was
// `git checkout HEAD -- <file>`, which restores from the INDEX — so a control run while the fix is
// still uncommitted silently reverts the fix. In one night of ARC-07-W17 that happened FIVE times:
// W12's two source files, the SessionStart hook fix, the `writeInstallTag` prerelease skip, and once
// more besides. Each time the loss was found only by reading the file back afterwards.
//
// `docs/CONTRIBUTING.md` has carried the rule since the second occurrence and ARC-07-C26 restated it
// as an order. Prose read and broken five times is not the instrument: the failure mode is not
// forgetting the rule, it is running a control on work that felt too unfinished to commit, under time
// pressure, when there is no index to restore to. So the tool refuses that situation instead of
// trusting the operator to notice it.
//
// WHAT IT GUARANTEES, and each clause is one of the five losses:
//   1. It refuses a file `git status --porcelain` reports as dirty — the loss itself.
//   2. It refuses a file that differs from the checkpoint commit even when git calls it clean, which
//      catches a restore already half-done and a file staged but not committed.
//   3. It PRINTS the checkpoint sha before it changes anything, so the restore target is in the
//      record rather than assumed — `git checkout HEAD --` never said what HEAD was.
//   4. It restores BY THAT SHA, not by `HEAD`, so a commit made by anything else mid-run cannot move
//      the target under it.
//   5. It VERIFIES the restore, because a restore that silently failed is the same loss again.
//
// Usage:
//   node scripts/ci/control.mjs --file <path> [--file <path>…] \
//     --degrade "<command that edits those files>" \
//     --test "<command that must FAIL while degraded>"
//
// Exit 0 when the control is VALID: the degradation applied, the test failed, the files were restored
// and verified. Exit 1 when the control is INERT — the test passed while degraded, which is the
// result worth knowing, because a control that cannot fail proves nothing. Exit 2 when it refused to
// start, and 3 when the restore did not verify (the only outcome that leaves work to do by hand).
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeSync } from 'node:fs';

const EXIT_OK = 0;
const EXIT_INERT = 1;
const EXIT_REFUSED = 2;
const EXIT_RESTORE_FAILED = 3;

const say = (text) => writeSync(1, `${text}\n`);
const warn = (text) => writeSync(2, `${text}\n`);

const git = (args) => execFileSync('git', args, { encoding: 'utf8' });

/** `--file a --file b --degrade "…" --test "…"` — no positional arguments, so nothing is guessed. */
function parse(argv) {
  const files = [];
  let degrade = null;
  let test = null;
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--file') { files.push(value); i += 1; continue; }
    if (flag === '--degrade') { degrade = value; i += 1; continue; }
    if (flag === '--test') { test = value; i += 1; continue; }
    return { error: `control: unknown argument "${flag}"` };
  }
  if (files.length === 0) return { error: 'control: --file is required (repeat it for several)' };
  if (!degrade) return { error: 'control: --degrade "<command>" is required' };
  if (!test) return { error: 'control: --test "<command>" is required' };
  return { files, degrade, test };
}

/**
 * The checkpoint: the commit this run will restore to, and the refusals that make it meaningful.
 *
 * BOTH CHECKS, because they catch different things. `git status --porcelain` names a file with
 * uncommitted changes — the loss this script exists for. Comparing the file to the commit catches the
 * case git calls clean but is not what the checkpoint holds: a file already restored halfway, or one
 * whose staged content differs from the commit. The second has never bitten, and it costs one `git
 * show` per file; the first bit five times.
 */
function checkpoint(files) {
  const sha = git(['rev-parse', 'HEAD']).trim();
  const dirty = git(['status', '--porcelain', '--', ...files]).trim();
  if (dirty) {
    return { error: 'control: REFUSED — these files have uncommitted changes, and a control restores '
      + `from a commit:\n${dirty}\n\nCommit first (a wip: commit folded in afterwards with `
      + '`git reset --soft` is enough), then run the control.' };
  }
  const drifted = [];
  for (const file of files) {
    let committed;
    try { committed = git(['show', `${sha}:${file}`]); }
    catch { return { error: `control: REFUSED — ${file} is not in ${sha.slice(0, 12)}` }; }
    let onDisk;
    try { onDisk = readFileSync(file, 'utf8'); }
    catch (e) { return { error: `control: REFUSED — cannot read ${file}: ${e.message}` }; }
    if (committed !== onDisk) drifted.push(file);
  }
  if (drifted.length > 0) {
    return { error: 'control: REFUSED — these files differ from the checkpoint although git calls '
      + `them clean:\n  ${drifted.join('\n  ')}` };
  }
  return { sha };
}

/** Run a shell command, inheriting output, and report only whether it succeeded. */
const run = (command) => spawnSync(command, { shell: true, stdio: 'inherit' }).status === 0;

const args = parse(process.argv.slice(2));
if (args.error) {
  warn(args.error);
  process.exitCode = EXIT_REFUSED;
} else {
  const { files, degrade, test } = args;
  const cp = checkpoint(files);
  if (cp.error) {
    warn(cp.error);
    process.exitCode = EXIT_REFUSED;
  } else {
    // THE SHA, SAID OUT LOUD, BEFORE ANYTHING CHANGES. `git checkout HEAD --` never told anyone what
    // HEAD was, so a restore to the wrong commit looked exactly like a restore to the right one.
    say(`control: checkpoint ${cp.sha.slice(0, 12)} — ${files.length} file(s) will be restored to it`);
    for (const file of files) say(`control:   ${file}`);

    const degraded = run(degrade);
    if (!degraded) warn('control: the --degrade command exited non-zero; running --test anyway, '
      + 'because a degradation that did not apply is exactly what makes a control inert');

    const testPassed = run(test);

    // RESTORE BY THE SHA, never by HEAD: anything that committed mid-run would move HEAD, and then
    // the restore would be to a tree nobody chose.
    let restoreError = null;
    try { git(['checkout', cp.sha, '--', ...files]); }
    catch (e) { restoreError = e.message; }

    // ...AND VERIFY IT, because a restore that silently failed is the loss this script prevents.
    const stillWrong = [];
    for (const file of files) {
      try {
        if (git(['show', `${cp.sha}:${file}`]) !== readFileSync(file, 'utf8')) stillWrong.push(file);
      } catch { stillWrong.push(file); }
    }

    if (restoreError || stillWrong.length > 0) {
      warn(`control: RESTORE FAILED — these files are NOT back at ${cp.sha.slice(0, 12)}:\n  `
        + `${stillWrong.join('\n  ')}${restoreError ? `\n${restoreError}` : ''}\n`
        + `Restore them by hand: git checkout ${cp.sha} -- ${files.join(' ')}`);
      process.exitCode = EXIT_RESTORE_FAILED;
    } else if (testPassed) {
      // THE INERT RESULT IS A FAILURE OF THE CONTROL, and it is the one this programme keeps meeting:
      // a control that passes while the product is degraded proves nothing about the test it names.
      warn(`control: INERT — the test PASSED while ${files.join(', ')} was degraded, so it does not `
        + 'see that degradation. Files restored and verified.');
      process.exitCode = EXIT_INERT;
    } else {
      say(`control: VALID — the test failed while degraded, and ${files.length} file(s) are back at `
        + `${cp.sha.slice(0, 12)}, verified.`);
    }
  }
}
