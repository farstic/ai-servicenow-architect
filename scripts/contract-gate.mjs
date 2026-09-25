#!/usr/bin/env node
/**
 * The contract gate: four steps, in the order a failure is cheapest to understand.
 *
 * Everything that can make the committed contract a lie, checked at once — and checked the same way
 * in CI, before a release tag, and on a developer's machine, because a gate that only exists in one
 * of those is a gate somebody will meet for the first time at the worst moment.
 *
 *   1  the committed dist/ is what the source builds   (rebuild, then `git diff --exit-code`)
 *   2  the server agrees with itself                   (the 14 invariants)
 *   3  the generated texts are what the generators produce
 *   4  the engine agrees with the server               (the pin, and the lint's required checks)
 *
 * The story numbered the last two the other way round. They are swapped because a stale generated
 * file is a CAUSE of engine disagreement — every generated header carries the contract sha, so L06
 * inside step 4 would fail on the same edit and report it as a pin problem, sending the reader to
 * `pin.mjs` for a file they only had to regenerate. Checking the cause first is the whole reason
 * the gate stops at its first failure.
 *
 * Stops at the FIRST failing step and prints its output. Later steps are almost always downstream
 * of an earlier failure — a stale `dist/` makes the pin wrong, which makes every generated header
 * wrong — so running them all would report one fault four times and bury the one that matters.
 *
 * Usage: node scripts/contract-gate.mjs [--skip-build] [--plan]
 *   --skip-build   skip step 1. For a caller that has just rebuilt (ARC-09-S01's release script),
 *                  where repeating it proves nothing and doubles the slowest step.
 *   --plan         print the step list and which one is skipped, and RUN NOTHING. Added by ARC-05
 *                  acceptance so the step SELECTION can be tested without executing the gate: step
 *                  1 rebuilds `packages/snowarch/dist`, and `scripts/build-dist.mjs` removes that
 *                  directory before it writes it. `node:test` runs files concurrently, so a unit
 *                  test that ran the real gate made `dist/` vanish for a few seconds underneath
 *                  every other test that reads it — an ENOENT in whichever file happened to look
 *                  during the window, on a different file on each machine. A test must not delete
 *                  and rebuild a committed directory of the tree it is running in. The gate's full
 *                  EXECUTION is still proven on every push by CI's `contract` cell.
 *
 * Exit 0 all four pass · 1 one failed.
 */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeSync } from 'node:fs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skipBuild = process.argv.includes('--skip-build');
const planOnly = process.argv.includes('--plan');

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

/** A step is a label, a command, and what its failure means. */
const STEPS = [
  {
    id: 'server',
    label: 'the committed dist/ is what the source builds',
    skip: skipBuild,
    run: () => {
      const build = spawnSync(process.execPath, [resolve(root, 'scripts/build-dist.mjs')],
        { cwd: root, encoding: 'utf8' });
      if (build.status !== 0) return build;
      // `--stat`, not the patch: a stale dist/ is thousands of lines, and the reader needs the file
      // names and the command rather than the bytes.
      const diff = spawnSync('git', ['diff', '--exit-code', '--stat', '--', 'packages/snowarch/dist'],
        { cwd: root, encoding: 'utf8' });
      return diff;
    },
    // THE REMEDY MUST NOT NAME THE COMMAND THIS STEP JUST RAN (ARC-09-C59). `run()` above spawns
    // `build-dist.mjs` itself and then diffs the result against what is COMMITTED, so "run
    // build-dist" asks the reader to repeat the thing that produced the diff they are looking at.
    // Measured during the 2.0.3-dev bump: the gate failed with a one-line `dist/contract.json`
    // diff, `build-dist` was re-run and changed nothing, and the actual cause was an uncommitted
    // version bump — HEAD carried 2.0.2-dev while the source built 2.0.3-dev. The gen-* scripts'
    // version of this sentence is right for them because they do NOT run the generator first.
    remedy: 'dist/ is not what the source builds — this step already rebuilt it, so COMMIT the '
      + 'change shown above rather than running build-dist again. Mid version bump, that commit is '
      + 'the bump itself.',
  },
  {
    id: 'dist',
    label: 'the server agrees with itself',
    run: () => spawnSync(npm, ['run', 'test:contract'], { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' }),
    remedy: 'a contract invariant broke — the failing test names which',
  },
  {
    id: 'generated',
    label: 'the generated texts are what the generators produce',
    run: () => spawnSync(npm, ['run', 'gen:check'], { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' }),
    remedy: 'a generated file is stale — run npm run gen and commit the result',
  },
  {
    id: 'engine',
    label: 'the engine agrees with the server',
    run: () => spawnSync(npm, ['run', 'lint:contract'], { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' }),
    remedy: 'the pin or a lint check disagrees — run node packages/contract/pin.mjs and read the proposal',
  },
];

if (planOnly) {
  // The same list, in the same order, with the same skip decision — printed rather than run. The
  // wording matches the summary line exactly so one test can assert both against one expectation.
  writeSync(1, `CONTRACT GATE PLAN: ${STEPS.map((s) => `${s.id} ${s.skip ? 'skipped' : 'would run'}`).join(' · ')}\n`);
  process.exit(0);
}

const done = [];
for (const step of STEPS) {
  if (step.skip) { done.push(`${step.id} skipped`); continue; }
  const r = step.run();
  if (r.status === 0) { done.push(`${step.id} ok`); continue; }

  writeSync(1, `CONTRACT GATE FAILED at step "${step.id}" — ${step.label}\n\n`);
  writeSync(1, `${r.stdout ?? ''}`);
  writeSync(2, `${r.stderr ?? ''}`);
  writeSync(1, `\n${step.remedy}\n`);
  process.exit(1);
}

writeSync(1, `CONTRACT GATE: ${done.join(' · ')}\n`);
