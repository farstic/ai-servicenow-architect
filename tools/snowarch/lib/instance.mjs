// ARC-07-S05 — the `instance` forwarder: check, hand over, propagate.
//
// This file runs the wizard by SPAWNING the server CLI with inherited stdio, and does nothing
// else. Three reasons it is a forwarder rather than an implementation:
//
//   THE TTY. S01's masked prompt needs the real terminal; `stdio: 'inherit'` hands it over whole.
//   A pipe here would turn "type your password" into "read a pipe", which is the one thing that
//   module refuses to do.
//
//   THE STORE. The server owns it. A second writer would be a second opinion about the schema,
//   the file mode and the atomic rename — and this process never reads or writes it at all.
//
//   THE ENVIRONMENT. `childEnv` (ARC-06-S08) pins `CLAUDE_PROJECT_DIR` to THIS checkout, so a
//   wizard started inside a Claude Code session pointed at another repository writes here rather
//   than there.
//
// The argv it builds is exactly what the user typed. A test asserts there is no code path that
// adds one — a secret cannot reach `ps` through a forwarder that only forwards.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { EXIT_OK, EXIT_PREREQ } from './exit.mjs';
import { loadConfig, root as defaultRoot } from './config.mjs';
import { childEnv } from './spawn-env.mjs';
import { meetsFloor } from './versions.mjs';

export const CLI_PATH = join('packages', 'snowarch', 'dist', 'cli', 'index.js');

/**
 * Are the server's runtime dependencies reachable FROM the server package?
 *
 * RESOLVED, not looked for at a fixed path. `npm ci` in this workspace HOISTS
 * `@modelcontextprotocol/sdk` to the repository root, so the nested tree under the server
 * package the brief named is absent on a correctly installed checkout (S-15 measured it absent
 * on every runner) — the forwarder refused to run on a machine where everything was fine, which
 * is how this was found. `createRequire` from the package's own manifest asks the question Node
 * will ask when the CLI starts, so hoisted and nested trees both answer correctly.
 */
export function serverDepsInstalled(root, { requireFrom = createRequire } = {}) {
  try {
    requireFrom(join(root, 'packages', 'snowarch', 'package.json'))
      .resolve('@modelcontextprotocol/sdk/package.json');
    return true;
  } catch {
    return false;
  }
}

/** The one sentence a checkout that cannot run the wizard yet should print. */
export const NOT_INSTALLED =
  'Live mode is not installed yet — run ./snowarch mode live (installs the server dependencies '
  + 'and starts the instance wizard).';

export const USAGE = [
  'usage: ./snowarch instance <command> [options]',
  '',
  '  add <label> …             add an instance (the wizard)',
  '',
  '  Everything after `instance` is passed to the server CLI unchanged.',
].join('\n');

/**
 * Can the server CLI run here?
 *
 * Three separate questions, because they have three different remedies and a single "not ready"
 * would send a user to the wrong one. Node's floor comes from `engine.config.json`, never a
 * literal — the bootstrap enforces the same number.
 */
export function preconditions({ root = defaultRoot, nodeVersion = process.versions.node,
  exists = existsSync, config = null, depsInstalled = serverDepsInstalled } = {}) {
  const floors = (config ?? loadConfig(root)).floors;
  const problems = [];
  // `.ok`, not the return value: `meetsFloor` answers with an OBJECT (`{ ok, found, want }`), so
  // `if (!meetsFloor(...))` is never true and the Node floor was never enforced. The test that
  // passes 18.20.0 is what found it.
  if (!meetsFloor(`${nodeVersion}`, floors.node).ok) {
    problems.push(`Node ${nodeVersion} is below the floor ${floors.node}`);
  }
  if (!exists(join(root, CLI_PATH))) problems.push(`${CLI_PATH} is missing`);
  if (!depsInstalled(root)) problems.push('the server dependencies are not installed');
  return { ok: problems.length === 0, problems };
}

/**
 * The argv handed to the server CLI: `instance` and whatever the user typed.
 *
 * Nothing is added. Not a default, not a flag, and above all not a secret — the credential
 * boundary is the server CLI's prompt, and an argument invented here would appear in `ps` for
 * every user on the machine.
 */
export const buildArgv = (cliPath, args, command = 'instance') => [cliPath, command, ...args];

/**
 * Hand one sub-command over to the server CLI.
 *
 * ARC-09-S06 lifted this out of `instanceCommand` when `store` needed the same three checks and
 * the same spawn. It is the one place that decides whether this checkout can run the server at
 * all, so `instance` and `store` cannot come to different conclusions about it — and the argv is
 * still exactly what the user typed, with the sub-command's name in front.
 */
export async function forwardToServerCli(command, { log, argv = [], root = defaultRoot,
  run = spawnSync, exists = existsSync, nodeVersion = process.versions.node,
  depsInstalled = serverDepsInstalled } = {}) {
  const check = preconditions({ root, nodeVersion, exists, depsInstalled });
  if (!check.ok) {
    log.fail(NOT_INSTALLED);
    // The specific reasons go to the log rather than the sentence: the sentence is the action,
    // and three of them at once would bury it.
    for (const problem of check.problems) log.debug(problem);
    return EXIT_PREREQ;
  }

  const result = run(process.execPath, buildArgv(join(root, CLI_PATH), argv, command),
    { stdio: 'inherit', cwd: root, env: childEnv(root) });
  return result.status ?? EXIT_PREREQ;
}

export async function instanceCommand({ log, argv = [], ...rest } = {}) {
  if (argv.includes('--help') && argv.length === 1) {
    log.step(USAGE);
    return EXIT_OK;
  }
  return forwardToServerCli('instance', { log, argv, ...rest });
}
