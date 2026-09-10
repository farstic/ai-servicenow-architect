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
export const EXIT_GATE = 1;

/**
 * `{ name, argv, cwd? }` — everything the runner needs, and nothing about how to run it.
 *
 * `./snowarch docs verify` is spelled as the launcher rather than as `node scripts/docs.mjs`
 * because that is the command a maintainer would run by hand, and a gate that passes through a path
 * users do not take is a gate that can pass while the product is broken.
 */
export function gatePlan({ noInstall = false, platform = process.platform } = {}) {
  const launcher = platform === 'win32' ? 'snowarch.cmd' : './snowarch';
  return [
    ...(noInstall ? [] : [{ name: 'install', argv: ['npm', 'ci', '--ignore-scripts'] }]),
    { name: 'dist', argv: ['node', 'scripts/build-dist.mjs'], then: 'dist-diff' },
    { name: 'lint', argv: ['npm', 'run', 'lint'] },
    { name: 'test', argv: ['npm', 'test'] },
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
export function runGates({ plan, run, diffDist, onStart = () => {} }) {
  for (const gate of plan) {
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
