/**
 * ARC-09-C64 — `npm test` runs BOTH halves and reports both, instead of `&&`.
 *
 * WHAT THE `&&` DID. `npm test` was `node tests/run.mjs && npm test --workspaces --if-present`. The first
 * half is the engine's suites (`tests/` and `tools/snowarch/tests/`); the second is `packages/snowarch`'s
 * 1463 vitest cases. On a machine where the first half fails — this one does, on S-13's skill-listing
 * budget, which is environment-bound — the second half NEVER RUNS, and nothing in the output says so. The
 * programme paid for that twice: once locally, where 1463 cases quietly left the gate, and once on the
 * Windows cells in ARC-07-W7, where three assertions were red and a fourth was latent behind this same
 * `&&`. A CI log is a list of what broke FIRST, not a list of what is broken.
 *
 * SO THE RULE HERE IS: every half runs, every half is named, and the exit code is non-zero if ANY of them
 * failed. Not `&&`, and not `;` either — a chain of shell operators cannot report which half a number came
 * from, and that is half of what was wrong.
 *
 * WHY A BANNER BEFORE EACH HALF AND A TABLE AFTER. Both halves stream their own output, so without a
 * banner the scrollback is two suites' numbers with nothing saying which is which — and "1295 pass" means
 * something different depending on the half. The table at the end is what a contributor reads: a half that
 * says `ok` RAN and passed, and a half that is missing from it did not run at all. That distinction is the
 * one the `&&` destroyed.
 *
 * THE COMMANDS ARE NOT RE-DECLARED HERE, and that is deliberate for the second half: it stays
 * `npm test --workspaces --if-present` rather than a direct `vitest` invocation, because each workspace's
 * `test` script is that workspace's to define — `packages/snowarch` runs `vitest run --coverage`, and a
 * copy of that string here would be a second declaration to drift from the first.
 *
 * `npm.cmd` with a shell on win32 is this repository's settled way to spawn npm (`scripts/contract-gate.mjs`
 * does the same, proven on the Windows cells). Node has refused to `spawnSync` a `.cmd` without a shell
 * since 18.20/20.12, and `scripts/build-dist.mjs` records the other half of that lesson — which is why the
 * FIRST half is `process.execPath` on a JS entry point and takes no shell at all.
 */
import { spawnSync } from 'node:child_process';
import { writeSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { npmCommand, spawnFor } from '../../tools/snowarch/lib/spawn-batch.mjs';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const npm = npmCommand();

/**
 * The halves, in the order a reader wants them: the fast one that fails most often, then the slow one.
 *
 * `label` is what the banner and the table print. It names the COMMAND rather than a nickname, so a
 * contributor can run one half by hand from what they just read.
 */
export const STEPS = Object.freeze([
  Object.freeze({
    id: 'engine',
    label: 'node tests/run.mjs',
    covers: 'tests/ and tools/snowarch/tests/',
    command: process.execPath,
    args: [resolve(root, 'tests', 'run.mjs')],
  }),
  Object.freeze({
    id: 'workspaces',
    label: 'npm test --workspaces --if-present',
    covers: 'packages/snowarch (vitest)',
    command: npm,
    args: ['test', '--workspaces', '--if-present'],
  }),
]);

/** `ok` · `FAIL (exit 1)` · `FAIL (could not run: …)` — never a blank cell. */
const outcome = (r) => {
  if (r.error) return `FAIL (could not run: ${r.error.message})`;
  if (r.signal) return `FAIL (killed by ${r.signal})`;
  return r.status === 0 ? 'ok' : `FAIL (exit ${r.status})`;
};

/**
 * Run every step, report every step, and fail if any did.
 *
 * `run` and `write` are injected so the cases can drive the combining rule — which is the whole of this
 * module's behaviour — without spending four minutes running two real suites. The defaults are the product.
 */
export function runSteps({ steps = STEPS, run = spawnSync, write = (s) => writeSync(1, s) } = {}) {
  const results = [];
  for (const [i, step] of steps.entries()) {
    write(`\n=== npm test [${i + 1}/${steps.length}] ${step.id}: ${step.label}`
      + `${step.covers ? `  (${step.covers})` : ''}\n`);
    // NO early exit on failure. That is the entire row: the next half runs whatever this one did.
    // ARC-09-C69 — `spawnFor`, not `shell: process.platform === 'win32'`. That shape is DEP0190 on
    // Node 24 with an args array, and this script printed one of the three warnings that survived
    // C67 — after both halves had finished, which is where a reader least expects a deprecation.
    const call = spawnFor(step.command, step.args);
    const r = run(call.file, call.args, { cwd: root, stdio: 'inherit', ...call.options });
    results.push({ ...step, status: r?.status ?? null, signal: r?.signal ?? null, error: r?.error ?? null,
      outcome: outcome(r ?? {}) });
  }

  const failed = results.filter((r) => r.outcome !== 'ok');
  const width = Math.max(...results.map((r) => r.id.length));
  write('\nnpm test — every half ran; here is what each one said\n');
  for (const r of results) write(`  ${r.id.padEnd(width)}  ${r.label}  →  ${r.outcome}\n`);
  write(failed.length === 0
    ? `all ${results.length} half(s) passed\n`
    : `FAIL: ${failed.length} of ${results.length} half(s) failed (${failed.map((r) => r.id).join(', ')})`
      + ' — a half shown as `ok` ran and passed, and a half missing from this table did not run\n');
  return { results, ok: failed.length === 0 };
}

/*
 * The CLI half. `import.meta.main` is not available on Node 20, which is this repository's floor.
 *
 * `writeSync(1, …)` above and `process.exitCode` here rather than `process.stdout.write` and
 * `process.exit()` — ARC-09-C6's rule, and `tests/entrypoint-exit.test.mjs` caught my first version of
 * this file breaking it. It is not a formality HERE of all places: `process.exit()` drops writes that are
 * still queued, a write to a PIPE queues, and CI captures this command through a pipe — so the summary
 * table, which is the entire point of this row, is exactly the thing that would have been dropped. Worse,
 * touching `process.stdout` at all makes libuv open fd 1 non-blocking, after which a large `writeSync` can
 * throw EAGAIN instead of waiting.
 */
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = runSteps().ok ? 0 : 1;
}
