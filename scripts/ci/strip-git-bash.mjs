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
 * SCOPE IS THE CALLER'S CHOICE, and getting it wrong is not subtle. Writing `PATH` to
 * `GITHUB_ENV` applies it to every LATER step in the job — including steps that say
 * `shell: bash`, which then resolve to `C:\Windows\System32\bash.exe`, the WSL stub, and fail
 * with "Windows Subsystem for Linux has no installed distributions". Measured exactly that way on
 * ARC-06-S14's cell, whose later assertions legitimately want Git Bash. So:
 *
 *   --print    one line, the PATH, and nothing written. The caller applies it to ITS OWN step
 *              (`for /f "delims=" %%p in ('node …--print') do set "PATH=%%p"`), which is what a
 *              cell wants when only one step must be Git-Bash-free.
 *   --export   write `GITHUB_ENV`, job-wide. Only for a job where EVERY later step is meant to
 *              run without it — `windows-native`, whose default shell is `cmd`.
 *
 * `GITHUB_PATH` is deliberately not used at all: it PREPENDS, and nothing prepended can remove a
 * directory already on the PATH. A recipe that cannot remove is no use to a cell whose whole
 * subject is an absence.
 *
 * Usage: node scripts/ci/strip-git-bash.mjs [--with-node] (--print | --export)
 * Exit 0 ok · 1 Git Bash still reachable · 2 not Windows.
 */
import { appendFileSync, existsSync, writeSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const argv = process.argv.slice(2);
const WITH_NODE = argv.includes('--with-node');
const EXPORT = argv.includes('--export');
const PRINT_ONLY = argv.includes('--print') || !EXPORT;

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

// The DIAGNOSTIC goes to stderr, so `--print`'s stdout is one line a `for /f` can consume whole.
writeSync(2, `strip-git-bash: ${present.length} director${present.length === 1 ? 'y' : 'ies'}, `
  + `no Git Bash${WITH_NODE ? ', Node included' : ', and no Node'}\n`);

if (PRINT_ONLY) {
  writeSync(1, `${PATH}\n`);
} else {
  const { GITHUB_ENV } = process.env;
  if (!GITHUB_ENV) {
    writeSync(2, 'strip-git-bash: --export outside a runner — there is no GITHUB_ENV to write\n');
    process.exit(1);
  }
  appendFileSync(GITHUB_ENV, `PATH=${PATH}\n`);
  writeSync(2, 'strip-git-bash: exported job-wide — every later step in this job loses Git Bash, '
    + 'including any that says `shell: bash`\n');
}
