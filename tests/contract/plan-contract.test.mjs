// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C195 — `planSteps` is a contract between releases.
//
// From 2.2.5, U4 asks the TARGET's own runner for the plan: the installed release's helper
// (`tools/snowarch/lib/plan-at-target.mjs`) imports `planSteps` from a worktree of the tag, calls it with
// `{ ctx, state, manifestWritten }` and reads `{ steps, estimate }` back. So this release's planSteps is called by
// OLDER releases' helpers. Its export name, the options they pass and the shape they read must stay; a release that
// changes one keeps the old form beside the new, or every upgrade into it plans with the installed release's tables,
// which is safe but labelled. `npm run lint:contract` runs this file, so the contract gate holds every release to it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as upgrade from '../../tools/snowarch/lib/commands/upgrade.mjs';
import { loadConfig } from '../../tools/snowarch/lib/config.mjs';
import { initFixtureRepo } from '../../tools/snowarch/tests/helpers/fixture-git.mjs';
import { tempDir } from '../../tools/snowarch/tests/helpers/temp.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
/** A commit identity for the fixture's git, by environment rather than by a config write. */
const IDENTITY = { ...process.env, GIT_AUTHOR_NAME: 'fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
  GIT_COMMITTER_NAME: 'fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' };

/** The options a helper passes, as a call reads them: every key `fn` looks up on its third argument. */
function optionsRead(fn, root, tag, options) {
  const read = new Set();
  const watched = new Proxy(options, { get: (o, key) => { read.add(key); return o[key]; } });
  return { result: fn(root, tag, watched), read };
}

test('ARC-09-C195 — planSteps keeps its name, reads the options older helpers pass, and answers their shape', (t) => {
  const repo = tempDir('snowarch-c195-contract-', t);
  const git = (args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: 'pipe', env: IDENTITY });
  initFixtureRepo(git, repo, ['-q', '-b', 'main']);
  writeFileSync(join(repo, 'package.json'), '{"name":"fixture","version":"9.2.0"}\n');
  writeFileSync(join(repo, 'package-lock.json'), '{"lockfileVersion":3}\n');
  git(['add', '-A']);
  git(['commit', '-qm', 'one']);
  writeFileSync(join(repo, 'package-lock.json'), '{"lockfileVersion":3,"packages":{}}\n');
  git(['commit', '-qam', 'two']);
  git(['tag', 'v9.2.0']);
  git(['checkout', '-q', 'HEAD~1']);
  assert.notEqual(git(['rev-parse', 'HEAD']), git(['rev-parse', 'v9.2.0^{commit}']),
    'the checkout did not move off v9.2.0');

  assert.equal(typeof upgrade.planSteps, 'function', 'planSteps is no longer exported by commands/upgrade.mjs');
  const { result, read } = optionsRead(upgrade.planSteps, repo, 'v9.2.0',
    { ctx: { root: repo, config: loadConfig(ROOT) }, state: null, manifestWritten: true, keepWorktree: null });
  // ARC-09-C241 — a helper from C241 on also passes the worktree it runs in, so that the target plans in it.
  for (const name of ['ctx', 'state', 'manifestWritten', 'keepWorktree']) {
    assert.ok(read.has(name), `planSteps no longer reads the option ${name} (it read ${[...read].join(', ')})`);
  }
  assert.equal(typeof result.estimate, 'boolean');
  assert.ok(Array.isArray(result.steps) && result.steps.length > 0, 'the move planned no step, so a step went unread');
  for (const s of result.steps) {
    assert.deepEqual([typeof s.step, typeof s.title, typeof s.why, Array.isArray(s.files)],
      ['string', 'string', 'string', true], JSON.stringify(s));
  }
  // The control: the same reading sees a function that ignores an option as one.
  const { read: ignored } = optionsRead((root, tag, { ctx }) => ({ root, tag, ctx }), repo, 'v9.2.0',
    { ctx: null, state: null, manifestWritten: true });
  assert.deepEqual([...ignored], ['ctx']);
});
