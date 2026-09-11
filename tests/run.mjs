// Engine-side test launcher. Deliberately a Node file list rather than a shell glob:
// on Windows npm runs scripts through cmd.exe, which does no glob expansion, and whether
// `node --test` expands a glob argument itself varies by Node line. Computing the list here is
// the one form that behaves identically on all nine CI cells (01 section 13: shipped tooling is
// Node; nothing assumes a POSIX shell).
import { existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, sep } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * RECURSIVE, as of ARC-05-S01.
 *
 * It used to read only the top level, so `tests/contract/required-tools.test.mjs` would have
 * been written, committed, green when run by hand — and never once run by `npm test`. A check
 * that is not wired to a command is documentation, and the failure mode is silent: the file
 * exists, so nobody goes looking for why it never fails.
 */
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory()
    ? walk(join(dir, e.name))
    : (e.name.endsWith('.test.mjs') ? [join(dir, e.name)] : [])));
}

// TWO roots, as of ARC-06-S02: the engine's own tests and the CLI's. The CLI ships as part of the
// repository and runs on all three OSes, so its tests belong in the same `npm test` — a suite that
// only runs when someone remembers to point `node --test` at it is a suite that stops running.
const cliTests = resolve(here, '..', 'tools', 'snowarch', 'tests');

/**
 * `tests/upgrade/` is NOT in `npm test`, and it is the one exclusion.
 *
 * ARC-09-S07's harness builds a bare origin, two fixture releases and a user's clone per case, and
 * compiles a server for one of them — minutes, and it needs a full-depth checkout with tags and a
 * git identity that the ordinary `test` job has neither of. It has a job of its own
 * (`upgrade-e2e`, three OSes) for exactly that reason, and running it in both would pay for it
 * nine times over to answer the same question.
 *
 * An exclusion is a thing that rots, so it is a LIST of one with the job that covers it named:
 * anything added here that no job runs is documentation, which is what the recursive walk above
 * exists to prevent.
 */
const RUN_ELSEWHERE = [resolve(here, 'upgrade')];
const elsewhere = (f) => RUN_ELSEWHERE.some((dir) => f.startsWith(`${dir}${sep}`));

const files = [...walk(here), ...(existsSync(cliTests) ? walk(cliTests) : [])]
  .filter((f) => !elsewhere(f))
  .sort();
if (files.length === 0) {
  console.error('tests/run.mjs: no *.test.mjs found in', here);
  process.exit(1);
}
const { status } = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(status ?? 1);
