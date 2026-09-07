// Engine-side test launcher. Deliberately a Node file list rather than a shell glob:
// on Windows npm runs scripts through cmd.exe, which does no glob expansion, and whether
// `node --test` expands a glob argument itself varies by Node line. Computing the list here is
// the one form that behaves identically on all nine CI cells (01 section 13: shipped tooling is
// Node; nothing assumes a POSIX shell).
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(here).filter((f) => f.endsWith('.test.mjs')).sort().map((f) => join(here, f));
if (files.length === 0) {
  console.error('tests/run.mjs: no *.test.mjs found in', here);
  process.exit(1);
}
const { status } = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(status ?? 1);
