// Engine-side test launcher. Deliberately a Node file list rather than a shell glob:
// on Windows npm runs scripts through cmd.exe, which does no glob expansion, and whether
// `node --test` expands a glob argument itself varies by Node line. Computing the list here is
// the one form that behaves identically on all nine CI cells (01 section 13: shipped tooling is
// Node; nothing assumes a POSIX shell).
import { existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

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
const files = [...walk(here), ...(existsSync(cliTests) ? walk(cliTests) : [])].sort();
if (files.length === 0) {
  console.error('tests/run.mjs: no *.test.mjs found in', here);
  process.exit(1);
}
const { status } = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(status ?? 1);
