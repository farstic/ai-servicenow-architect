/**
 * ARC-09-S06 — the `store` forwarder, and the one thing it must not become.
 *
 * `store` is `instance`'s twin: the same three preconditions, the same `childEnv`, the same
 * inherited stdio, the same "the argv is exactly what the user typed". It is the same CODE for
 * that reason — a second copy would be a second opinion about when this checkout can run the
 * server, and the two would disagree the first time either was corrected.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CLI_PATH, NOT_INSTALLED, buildArgv, forwardToServerCli } from '../lib/instance.mjs';
import { USAGE, storeCommand } from '../lib/store.mjs';
import { COMMANDS } from '../lib/cli.mjs';
import { EXIT_OK, EXIT_PREREQ } from '../lib/exit.mjs';
import { recorder } from './helpers/workspace.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const fakeRoot = () => {
  const dir = mkdtempSync(join(tmpdir(), 'store-forwarder-'));
  writeFileSync(join(dir, 'engine.config.json'), JSON.stringify({
    docs: { pin: 'a'.repeat(40), family: 'australia', areasFile: 'vendor/docs-areas.txt', upstream: 'x' },
    mcp: { serverKey: 'servicenow', packageDir: 'packages/snowarch' },
    floors: { node: '20.0.0', claudeCode: '2.1.214', git: '2.34.1' },
  }));
  return dir;
};

test('the argv is the sub-command and exactly what the user typed', () => {
  assert.deepEqual(buildArgv('/cli.js', ['migrate', '--yes'], 'store'),
    ['/cli.js', 'store', 'migrate', '--yes']);
  // The default is still `instance`, so ARC-07's callers are untouched by the generalisation.
  assert.deepEqual(buildArgv('/cli.js', ['list']), ['/cli.js', 'instance', 'list']);
});

test('`store` is RAW: the frame never parses the server CLI\'s flags', () => {
  // `store restore <file> --yes` reaches the server whole. Without `raw`, the engine's parser
  // answers `--yes needs a value` — which is the bug ARC-07-S05 fixed for `instance`, and it
  // would have arrived again here.
  assert.equal(COMMANDS.store.raw, true);
  assert.equal(COMMANDS.instance.raw, true);
});

test('a checkout that cannot run the server says so once, with the reasons in the log', async () => {
  const dir = fakeRoot();
  try {
    const log = recorder();
    const code = await storeCommand({ log, argv: ['migrate'], root: dir,
      exists: () => false, depsInstalled: () => false, run: () => { throw new Error('spawned'); } });
    assert.equal(code, EXIT_PREREQ);
    assert.equal(log.lines.filter((l) => l.includes(NOT_INSTALLED)).length, 1);
    assert.ok(log.lines.some((l) => l.includes(CLI_PATH)));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a bare --help is this frame\'s, and everything else is the server\'s', async () => {
  const dir = fakeRoot();
  try {
    const log = recorder();
    let spawned = null;
    assert.equal(await storeCommand({ log, argv: ['--help'], root: dir }), EXIT_OK);
    assert.ok(log.lines.join('\n').includes('usage: ./snowarch store'));

    // `migrate --help` is NOT: the server CLI prints the exit-code table with it.
    await forwardToServerCli('store', { log, argv: ['migrate', '--help'], root: dir,
      exists: () => true, depsInstalled: () => true,
      run: (...args) => { spawned = args; return { status: 0 }; } });
    assert.deepEqual(spawned[1].slice(1), ['store', 'migrate', '--help']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the child gets this checkout\'s CLAUDE_PROJECT_DIR, not the session\'s', async () => {
  const dir = fakeRoot();
  try {
    const log = recorder();
    let opts = null;
    await forwardToServerCli('store', { log, argv: ['backups'], root: dir,
      exists: () => true, depsInstalled: () => true,
      run: (_exec, _argv, o) => { opts = o; return { status: 0 }; } });
    assert.equal(opts.env.CLAUDE_PROJECT_DIR, dir);
    assert.equal(opts.cwd, dir);
    assert.equal(opts.stdio, 'inherit');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('this file cannot invent an argument, because it does not spawn anything', () => {
  const source = readFileSync(join(repo, 'tools/snowarch/lib/store.mjs'), 'utf8');
  // The strongest available form of "the argv is what the user typed": there is no spawn here to
  // add to. The one spawn is `forwardToServerCli`, whose argv is `buildArgv`'s and is asserted
  // above — so a flag invented for the child would have to be added in a file two tests watch.
  for (const forbidden of ['spawnSync', 'spawn(', 'execFile', 'child_process']) {
    assert.equal(source.includes(forbidden), false, `store.mjs reaches for ${forbidden}`);
  }
  // And the only argv it passes on is the one it was given, unmodified.
  assert.match(source, /forwardToServerCli\('store', \{ log, argv, root, \.\.\.rest \}\)/);
});

test('the usage lists the three sub-commands the server actually has', () => {
  for (const word of ['migrate', 'backups', 'restore']) assert.ok(USAGE.includes(word), word);
  assert.ok(USAGE.includes('passed to the server CLI unchanged'));
});
