import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SESSION_VARIABLES, childEnv } from '../lib/spawn-env.mjs';
import { serverCommand } from '../lib/server-command.mjs';
import { runProbes } from '../lib/steps/B08.mjs';
import { wizardAvailable } from '../lib/steps/B06.mjs';
import { npmSpawnOptions } from '../lib/steps/B04.mjs';
import { makeCheckout } from './helpers/workspace.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const BOGUS = '/nonexistent/some-other-repository';

/**
 * The rule: a variable Claude Code sets per session is never READ from the environment by our own
 * spawns — it is SET.
 *
 * `CLAUDE_PROJECT_DIR` is the project root of the session that spawned the process, and when the
 * bootstrap spawns something the bootstrap IS that session. Inherited, it made the handshake start
 * a server from whichever repository the surrounding Claude Code session was in, and it would have
 * made the server CLI read and write that repository's `.local/instances.json` — the server
 * resolves its store as `<CLAUDE_PROJECT_DIR ?? cwd>/.local/instances.json`.
 *
 * Invisible in a plain terminal and in CI, where the variable is unset. Hence a test that plants
 * one.
 */
test('childEnv pins the session variables to this checkout, over anything inherited', () => {
  const env = childEnv('/repo', { EXTRA: '1' }, { CLAUDE_PROJECT_DIR: BOGUS, KEEP: 'yes' });
  assert.equal(env.CLAUDE_PROJECT_DIR, '/repo');
  assert.equal(env.EXTRA, '1');
  assert.equal(env.KEEP, 'yes', 'the rest of the environment is passed through');

  // Even a caller that supplies it explicitly is overridden: that caller would be making the same
  // mistake one level up.
  assert.equal(childEnv('/repo', { CLAUDE_PROJECT_DIR: BOGUS }).CLAUDE_PROJECT_DIR, '/repo');
  assert.deepEqual([...SESSION_VARIABLES], ['CLAUDE_PROJECT_DIR']);
});

test('every child the bootstrap spawns is told which checkout it serves', () => {
  const root = makeCheckout();
  mkdirSync(join(root, 'packages/snowarch/dist/cli'), { recursive: true });
  writeFileSync(join(root, 'packages/snowarch/dist/cli/index.js'), '// placeholder\n');
  const seen = [];
  const record = (exec, args, options) => {
    seen.push({ args: args.join(' '), env: options?.env });
    return { status: 0, stdout: 'Usage: instance list|test', stderr: '' };
  };

  // B08's probes: `instance --help`, `instance list`, `instance test <label>`.
  runProbes(root, { run: (exec, args, options) => {
    seen.push({ args: args.join(' '), env: options?.env });
    if (args.includes('--help')) return { stdout: 'Usage: instance list|test', stderr: '' };
    if (args.includes('list')) return { stdout: '{"instances":[{"label":"pdi"}]}', stderr: '' };
    return { stdout: '{}', stderr: '' };
  } });
  // B06's wizard probe.
  wizardAvailable(root, { run: record });

  assert.ok(seen.length >= 4, `only ${seen.length} spawns observed`);
  for (const { args, env } of seen) {
    assert.equal(env?.CLAUDE_PROJECT_DIR, root, `${args} inherited the session variable`);
  }
});

test('...including npm, which does not need it — an exception kept by memory is one forgotten', () => {
  const options = npmSpawnOptions('/repo', { CLAUDE_PROJECT_DIR: BOGUS, PATH: '/usr/bin' });
  assert.equal(options.env.CLAUDE_PROJECT_DIR, '/repo');
  assert.equal(options.env.NODE_ENV, 'production');
  assert.equal(options.env.PATH, '/usr/bin', 'the caller\'s environment still reaches the child');
  assert.equal(options.cwd, '/repo');
});

test('the handshake spawn carries it too, asserted at the spawn seam', () => {
  const mcp = JSON.parse(readFileSync(join(repoRoot, '.mcp.json'), 'utf8'));
  const config = JSON.parse(readFileSync(join(repoRoot, 'engine.config.json'), 'utf8'));
  const cmd = serverCommand({ mcp, serverKey: config.mcp.serverKey, root: '/repo',
    env: { CLAUDE_PROJECT_DIR: BOGUS } });
  assert.equal(cmd.env.CLAUDE_PROJECT_DIR, '/repo');
  assert.deepEqual(cmd.args, ['/repo/packages/snowarch/dist/server.js'],
    'and the argument expansion ignores the inherited value as well');
});
