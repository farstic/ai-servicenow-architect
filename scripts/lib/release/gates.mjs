/**
 * The six gates, in order, through one injectable runner.
 *
 * ARC-09-S01. `01` §11: a release cannot be tagged unless every gate passes. The order is not
 * arbitrary — dependencies first, because nothing else can run without them; then the one gate that
 * is about the ARTEFACT rather than the source (`dist/` must already be what the source builds),
 * because a stale `dist/` makes the lint and the tests answer about a different program than the
 * one being released.
 *
 * The stale-`dist/` gate REFUSES; it never repairs. A release that quietly rebuilt and committed
 * `dist/` for the maintainer would be a release whose artefact nobody reviewed, and the whole point
 * of committing `dist/` is that a human sees the diff in a pull request (README acceptance 2). The
 * rebuild's output is deliberately left in the working tree so it can be inspected — and the
 * preflight's clean-tree check means the next attempt refuses until it has been dealt with.
 */
import { spawnSync } from 'node:child_process';
import { lstatSync } from 'node:fs';
import { spellings } from '../../../tools/snowarch/lib/text.mjs';
import { join } from 'node:path';
import { npmCommand, spawnFor } from '../../../tools/snowarch/lib/spawn-batch.mjs';

export const EXIT_GATE = 1;

/**
 * Is this tree's `node_modules` a link into somewhere else?
 *
 * ARC-09-C11. `npm ci` deletes and recreates `node_modules`, and it does so THROUGH a symlink: a
 * release run inside a fixture whose dependencies are linked to a developer's real checkout
 * empties the real one. That is not a hypothetical — the ARC-09-S11 walkthrough did exactly this,
 * taking a working checkout from 215 packages to 0. No tracked file was touched and `npm ci`
 * restored it, but the failure is silent, instant, and outside the tree the command was pointed at.
 *
 * `lstat`, never `stat`: `stat` follows the link and reports the directory at the far end, which is
 * a real directory, which is the whole problem.
 */
export function modulesAreLinked(root, lstat = lstatSync) {
  try {
    const st = lstat(join(root, 'node_modules'));
    // Junctions on Windows report as directories to `stat` and as symlinks to `lstat`, which is
    // why both are asked about here.
    return st.isSymbolicLink();
  } catch {
    return false;   // absent is not linked; the install gate is what creates it
  }
}

/**
 * `{ name, argv, cwd? }` — everything the runner needs, and nothing about how to run it.
 *
 * `./snowarch docs verify` is spelled as the launcher rather than as `node scripts/docs.mjs`
 * because that is the command a maintainer would run by hand, and a gate that passes through a path
 * users do not take is a gate that can pass while the product is broken.
 */
export function gatePlan({ noInstall = false, platform = process.platform,
  env = process.env } = {}) {
  // ARC-07-W17 — a maintainer's PowerShell refuses a bare `snowarch.cmd` exactly as a user's does, and
  // this line is one a maintainer pastes when a gate fails. `scripts/` may read `tools/snowarch/lib`;
  // that direction is allowed.
  // `env` IS THREADED, and omitting it is the trap `tests/windows-spellings.test.mjs` writes out at
  // length: `isWindowsShell` reads SHELL and MSYSTEM — so Git Bash on Windows keeps the POSIX
  // spelling — and `env` defaults to `process.env`. `spellings({ platform: 'win32' })` alone therefore
  // returns `./snowarch` on any machine with SHELL set, and a caller written that way asserts the
  // POSIX spelling while believing it asked about Windows. Measured here before it could mislead.
  const launcher = spellings({ platform, env }).cli;
  /*
   * ARC-09-C70 — `npm` IS `npm.cmd` ON WINDOWS, and the plan has to say so.
   *
   * These argv used to start with the literal `'npm'`, which worked only because the runner spawned
   * them with `shell: true` and the shell added the extension. C69 removed the shell — rightly, it is
   * DEP0190 with an args array — and a bare `npm` then reached `CreateProcess`, which appends `.exe`
   * and nothing else. The Windows `release-dryrun` cell failed on `gate lint (exit 1)` with no output
   * at all: `status` was `null` from a spawn that never happened, and `?? 1` turned that into an exit
   * code. The plan names the command for the platform it will run on, the way `launcher` above already
   * does — one expression, beside the other one that already had to know this.
   */
  const npm = npmCommand(platform);
  return [
    ...(noInstall ? [] : [{ name: 'install', argv: [npm, 'ci', '--ignore-scripts'] }]),
    { name: 'dist', argv: ['node', 'scripts/build-dist.mjs'], then: 'dist-diff' },
    { name: 'lint', argv: [npm, 'run', 'lint'] },
    { name: 'test', argv: [npm, 'test'] },
    { name: 'contract', argv: ['node', 'scripts/contract-gate.mjs', '--skip-build'] },
    { name: 'docs', argv: [launcher, 'docs', 'verify'] },
  ];
}

/**
 * Run the plan. `run(argv) -> exit code` and `diffDist() -> boolean` are injected.
 *
 * Returns `{ ok: true }` or `{ ok: false, message, gate }`. The message is the exact line the story
 * fixes, because a maintainer greps for it and CI matches on it.
 */
/**
 * The child-process runner the gates use — ARC-09-C70, and it is a FUNCTION here so it can be driven.
 *
 * It used to be a closure inside `release.mjs`, which meant the only way to exercise it was to run a
 * real release: every test injects `run` and therefore skipped the very code that failed on the Windows
 * cell. A defect in the one seam nobody could reach is a defect that waits for a release night.
 *
 * TWO THINGS IT OWES A READER, both learned from `release-dryrun (windows-latest)` printing
 * `release: gate failed: lint (exit 1) — nothing was written` and not one line of lint's own output:
 *
 *   1. The gate's OUTPUT. `stdio: 'inherit'` left nothing to print, and on a spawn that never started
 *      there was nothing to inherit either. Captured and written straight through, so a passing gate
 *      still puts its log on the record and a failing one cannot be silent.
 *   2. WHICH silence it was. A spawn that never happened carries an `error` and no output; a child that
 *      ran and said nothing before failing is rarer and reads identically unless it is named.
 *
 * `maxBuffer` is raised on purpose: the `test` gate can outrun the 1 MB default, and an ENOBUFS would
 * report a PASSING gate as failed — a worse defect than the one this fixes.
 */
export function makeGateRunner({ root, platform = process.platform, err,
  spawn = spawnSync, spawnForImpl = spawnFor }) {
  return (args) => {
    const [cmd, ...rest] = args;
    const call = spawnForImpl(cmd, rest, { platform });
    const r = spawn(call.file, call.args,
      { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26, ...call.options });
    const output = `${r?.stdout ?? ''}${r?.stderr ?? ''}`;
    if (output) err.write(output.endsWith('\n') ? output : `${output}\n`);
    const code = r?.status ?? 1;
    if (r?.error) {
      err.write(`release: ${cmd} could not be started: ${r.error.message}\n`);
    } else if (code !== 0 && !output.trim()) {
      err.write(`release: ${cmd} exited ${code} and printed nothing\n`);
    }
    return code;
  };
}

export function runGates({ plan, run, diffDist, onStart = () => {}, linked = () => false }) {
  for (const gate of plan) {
    // Before the install, not after: the damage is done by the command, and the check costs an
    // `lstat`. A release from a tree whose dependencies belong to another checkout is never what
    // anyone wants, whatever they meant to do.
    if (gate.name === 'install' && linked()) {
      return { ok: false, gate: 'install',
        message: 'release: node_modules is a symlink — `npm ci` would install THROUGH it and '
          + 'replace the dependencies of whatever it points at. Build the fixture with '
          + "buildWorld({ modules: 'copy' }), or pass --no-install" };
    }
    onStart(gate.name);
    const code = run(gate.argv, gate);
    if (code !== 0) {
      return { ok: false, gate: gate.name,
        message: `release: gate failed: ${gate.name} (exit ${code}) — nothing was written` };
    }
    // The build is only half of gate 2. Building successfully and producing something different
    // from what is committed is the failure this gate exists for, and it is not an exit code.
    if (gate.then === 'dist-diff' && diffDist()) {
      return { ok: false, gate: 'dist',
        message: 'release: dist/ is stale — run node scripts/build-dist.mjs and commit it in a normal PR, then release' };
    }
  }
  return { ok: true };
}
