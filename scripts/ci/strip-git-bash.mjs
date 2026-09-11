#!/usr/bin/env node
/**
 * A Windows PATH with no Git Bash on it, written where the next step will read it.
 *
 * ARC-09-S08. Two jobs need this — ARC-06-S14's `bootstrap (no-gitbash, windows-latest)` cell and
 * this story's `windows-native` matrix — and they had it as a literal PATH typed into a `run:`
 * block. Two copies of a machine's directory layout is one copy too many: the day a runner image
 * moves `nodejs`, one of them is corrected and the other silently starts testing a machine with no
 * Node at all, which passes for the wrong reason.
 *
 * REBUILT, never filtered. A filter that missed one entry would leave `bash.exe` reachable and the
 * job would prove nothing while going green — so the PATH is composed from the directories the
 * cell actually needs, and the absence is then ASSERTED rather than assumed.
 *
 * `C:\\Windows\\System32\\bash.exe` is the WSL stub and is on every Windows machine; it is not Git
 * Bash and is not what `bootstrap.sh` needs. What must be gone is the `\\Git\\` one. `Git\\cmd`
 * stays, because git itself is a prerequisite of everything the cell does.
 *
 * Usage: node scripts/ci/strip-git-bash.mjs [--with-node] [--check]
 *   --with-node   include the Node directory (the `no-node` variants leave it out)
 *   --check       assert the result and print it, without writing GITHUB_PATH/GITHUB_ENV
 * Exit 0 written · 1 Git Bash still reachable · 2 not Windows.
 */
import { appendFileSync, existsSync, writeSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const argv = process.argv.slice(2);
const WITH_NODE = argv.includes('--with-node');
const CHECK = argv.includes('--check');

if (process.platform !== 'win32') {
  writeSync(2, 'strip-git-bash: Windows only — this recipe is about cmd.exe and Git for Windows\n');
  process.exit(2);
}

/**
 * The directories, in the order `cmd.exe` searches them. ARC-00-S13's recipe.
 *
 * `Git\\cmd` rather than `Git\\bin`: the former holds `git.exe` and nothing else, the latter holds
 * `bash.exe` — which is the whole point of this file.
 */
const DIRS = [
  'C:\\Windows\\system32',
  'C:\\Windows',
  'C:\\Windows\\System32\\WindowsPowerShell\\v1.0',
  'C:\\Program Files\\Git\\cmd',
  ...(WITH_NODE ? ['C:\\Program Files\\nodejs'] : []),
];

const present = DIRS.filter((d) => existsSync(d));
const missing = DIRS.filter((d) => !existsSync(d));
if (missing.length > 0) {
  // Named, not silently dropped: a runner image that moved one of these changes what the cell
  // proves, and the log should say so on the day it happens rather than a week later.
  writeSync(2, `strip-git-bash: not on this image, skipped: ${missing.join(' · ')}\n`);
}

const PATH = present.join(';');

/** Is a Git Bash reachable from this PATH? Asked of the PATH, not of the machine. */
function gitBashOn(path) {
  try {
    const out = execFileSync('where.exe', ['bash'],
      { encoding: 'utf8', env: { ...process.env, PATH, Path: PATH }, stdio: 'pipe' });
    return out.split('\n').map((l) => l.trim()).filter((l) => /\\Git\\/i.test(l));
  } catch {
    return [];                                    // `where` exits 1 when it finds nothing at all
  }
}

const found = gitBashOn(PATH);
if (found.length > 0) {
  writeSync(2, `strip-git-bash: Git Bash is still reachable: ${found.join(' · ')}\n`);
  process.exit(1);
}

writeSync(1, `strip-git-bash: ${present.length} director${present.length === 1 ? 'y' : 'ies'}, `
  + `no Git Bash${WITH_NODE ? ', Node included' : ', and no Node'}\n`);
writeSync(1, `${PATH}\n`);

if (!CHECK) {
  // GITHUB_PATH prepends; the runner rebuilds PATH from it for every LATER step. `GITHUB_ENV` is
  // what a step reads as `$env:PATH` in the same job, so both are written — a cell that set only
  // one would behave differently depending on which shell the next step used.
  const { GITHUB_PATH, GITHUB_ENV } = process.env;
  if (GITHUB_PATH) for (const dir of present) appendFileSync(GITHUB_PATH, `${dir}\n`);
  if (GITHUB_ENV) appendFileSync(GITHUB_ENV, `PATH=${PATH}\n`);
  if (!GITHUB_PATH && !GITHUB_ENV) {
    writeSync(2, 'strip-git-bash: no GITHUB_PATH or GITHUB_ENV — nothing was written\n');
    process.exit(1);
  }
}
