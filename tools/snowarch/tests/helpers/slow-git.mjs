// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * A git that is slow on one subcommand: the revocation-list fetch's deadline, reached on purpose.
 *
 * ARC-09-C133 and ARC-11-C11. Both copies of the fetch make three git calls (`ls-remote`, `clone`, `show`)
 * against one deadline. The cases that prove what happens when that deadline lands need a git that takes
 * longer than the budget on a chosen call, on any machine, rather than only on a runner that happens to be
 * slow. This writes a wrapper named `git` into a directory the caller owns. The wrapper sleeps when the
 * named subcommand is among its arguments, then runs the real git with the same arguments. The function
 * returns the PATH that puts the wrapper first; both copies look git up on the PATH they are given.
 *
 * POSIX ONLY, AND IT SAYS SO. On Windows, `execFile` and `spawnSync` run only `.com` and `.exe` files found
 * on PATH, so no script can stand in for git there. The function returns `null` on Windows, and a case that
 * needs a slow git says why it cannot run, rather than passing on a fast git.
 */
import { chmodSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { which } from '../../lib/which.mjs';

/** The PATH value with the slow wrapper first, or `null` where a script cannot stand in for git. */
export function slowGitPath({ dir, subcommand, seconds, env = process.env, platform = process.platform }) {
  if (platform === 'win32') return null;
  const real = which('git', { env, platform });
  if (!real) throw new Error('slowGitPath: there is no git on PATH to wrap');
  const wrapper = join(dir, 'git');
  writeFileSync(wrapper, [
    '#!/bin/sh',
    `# Written by tools/snowarch/tests/helpers/slow-git.mjs: \`${subcommand}\` sleeps ${seconds} s, then the real git runs.`,
    `for a in "$@"; do if [ "$a" = '${subcommand}' ]; then sleep ${seconds}; break; fi; done`,
    `exec '${real}' "$@"`,
    '',
  ].join('\n'));
  chmodSync(wrapper, 0o755);
  return `${dir}${delimiter}${env.PATH ?? ''}`;
}

/** Why a slow-git case cannot run here, for the skip message. */
export const SLOW_GIT_SKIP = 'a script cannot stand in for git on Windows, where only .com and .exe run from PATH';
