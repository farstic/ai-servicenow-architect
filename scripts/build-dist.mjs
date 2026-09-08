#!/usr/bin/env node
/**
 * Build the COMMITTED `packages/snowarch/dist/`.
 *
 * `dist/` is in the tree so that a clone plus `npm ci` is a runnable live install — no
 * TypeScript, no build step, nothing for a first-time user to get wrong (P-20, `01` §2
 * principle 2). The cost of that is a build artefact under version control, and the only way
 * that is honest is if CI can rebuild it and prove the committed bytes match the source. Hence
 * this script rather than `tsc` in a package script: one entry point, one set of options, the
 * same on a laptop and on a runner.
 *
 * `rm -rf` first, deliberately. An incremental build leaves the output of deleted source files
 * behind, and a stale `dist/x.js` with no `src/x.ts` is exactly the drift the diff exists to
 * catch — except it would be committed once and then match forever.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// `fileURLToPath`, never `new URL(...).pathname`: on Windows the latter is `/C:/…`, a leading
// slash before the drive letter, which is not a filesystem path (ARC-04-S12 found that the
// hard way, on three red Windows cells).
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = join(root, 'packages', 'snowarch');
const dist = join(pkg, 'dist');

const run = (args, cwd) => {
  // Always `node <script>`, never a shell and never `npx`.
  //
  // `npx` on Windows is `npx.cmd`, and Node refuses to `spawnSync` a `.cmd` without a shell —
  // `EINVAL`, which is what the first version of this script did on all three Windows cells
  // while passing on macOS and Linux. Adding `shell: true` would have fixed the spawn and
  // introduced cmd.exe quoting rules for the arguments, which is the other half of the same
  // problem. Running the compiler's own JS entry point with `process.execPath` has neither:
  // no shell, no `.cmd`, and it is unambiguously the pinned local TypeScript rather than
  // whatever `npx` would resolve.
  execFileSync(process.execPath, args, { cwd, stdio: 'inherit', shell: false });
};

const tsc = join(root, 'node_modules', 'typescript', 'bin', 'tsc');

process.stdout.write(`build-dist: removing ${dist}\n`);
rmSync(dist, { recursive: true, force: true });

process.stdout.write('build-dist: tsc -p tsconfig.build.json\n');
run([tsc, '-p', 'tsconfig.build.json'], pkg);

process.stdout.write('build-dist: extract-tools\n');
run([join(pkg, 'scripts', 'extract-tools.mjs')], pkg);

const contract = readFileSync(join(dist, 'contract.json'), 'utf8');
const sha = createHash('sha256').update(contract).digest('hex');
const { toolCount, contractVersion } = JSON.parse(contract);

// The sha is the point of the last line: ARC-05-S01 pins `contractSha256` against it, and a
// maintainer committing dist/ needs the value without running a second command.
process.stdout.write(`build-dist: contract ${contractVersion}, ${toolCount} tools\n`);
process.stdout.write(`build-dist: sha256 ${sha}\n`);
