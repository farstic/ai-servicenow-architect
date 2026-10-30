// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C218 — the one way a test helper creates a git repository. ARC-09-C219 — and the one way a test does.
//
// After it writes to a repository, git runs automatic maintenance, and newer git runs it DETACHED: on the CI runners'
// git 2.55 a fixture's `git commit` starts `git maintenance run --auto --quiet --detach`, which goes on after the commit
// has returned. A helper that then copies or walks .git can race it. The 2.2.3 release run failed once with ENOENT
// under .git/objects in greenTree→copyTree, and a probe on the runner reproduced it at 2 of 3,008 pairs under load,
// against 0 of 3,008 with the two settings below. So every repository a helper creates has git's automatic
// maintenance and automatic gc off, set in it right after `git init`.
//
// The removal at the end of a test races it too. On node 24 `rmSync` reported success over a folder that was still
// there, populated, at 402 of 3,008 pairs under load (temp.mjs's `ESURVIVED`), and on node 22 it threw ENOTEMPTY at 2;
// with the two settings, 0 on both (the C219 row has every cell). So the test files' repositories come here as well.
//
// `git` is the caller's own runner, so a harness that gives git an isolated home or a fixture identity keeps doing so,
// and `initArgs` are the caller's own `git init` flags, unchanged.

/** The settings every fixture repository carries. */
export const FIXTURE_GIT_CONFIG = Object.freeze([['maintenance.auto', 'false'], ['gc.auto', '0']]);

/** `git init <initArgs> <dir>` through `git(args)`, then the fixture settings in the new repository. */
export function initFixtureRepo(git, dir, initArgs) {
  git(['init', ...initArgs, dir]);
  for (const [key, value] of FIXTURE_GIT_CONFIG) git(['-C', dir, 'config', key, value]);
  return dir;
}
