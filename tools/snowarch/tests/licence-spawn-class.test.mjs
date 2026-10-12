// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-11-C6 steps 1 and 4b — every start of a CLI, the server or a launcher in the tests carries a licence.
 *
 * From 2.0.13 a product process with no valid licence refuses (C6). A test that starts one bare would test the
 * gate and not its subject, and would pass or fail by whether the machine running it happens to hold a licence.
 * So every such start goes through `licensedEnv()` (`helpers/licence-hook/index.mjs`): the test-only hook, which
 * makes the child trust this run's fixture key, and a fixture licence where the child reads one. A start that
 * must stay bare says why, on the line above it, as `// unlicensed start: <why>`.
 *
 * The reader is `helpers/licence-hook/starts.mjs`, and the planted cases below feed it the shapes it has to see,
 * and the ones it must not mistake for the product, through the same function the tree goes through.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { scanProductStarts } from './helpers/licence-hook/starts.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ROOTS = ['tools/snowarch/tests', 'packages/snowarch/tests', 'tests'].map((r) => join(ROOT, r));

test('ARC-11-C6 — every test that starts a CLI, the server or a launcher gives it a licence through licensedEnv', async () => {
  const { starts, unresolved, files } = await scanProductStarts({ roots: ROOTS, base: ROOT });
  // An instrument that read nothing, or found nothing, proves nothing: 314 files and 36 starts on 2026-10-12.
  assert.ok(files > 300, `the reader read ${files} files`);
  assert.ok(starts.length >= 30, `the reader found ${starts.length} starts`);
  assert.deepEqual(unresolved, [], 'files that reach child_process in a way the reader does not follow');
  const bare = starts.filter((s) => !s.licensed && !s.declared).map((s) => `${s.file}:${s.line} (${s.entry})`);
  assert.deepEqual(bare, [], `${bare.length} product start(s) with no licensedEnv and no "// unlicensed start:" reason`);
  for (const s of starts.filter((x) => x.declared)) {
    assert.ok(s.declared.length >= 20, `${s.file}:${s.line} declares a reason too short to review: "${s.declared}"`);
  }
});

/** Planted sources, by absolute path, fed to the reader instead of the disk. */
function plant(sources) {
  const at = (rel) => join('/planted', rel);
  const map = new Map(Object.entries(sources).map(([rel, text]) => [at(rel), text]));
  return {
    files: [...map.keys()].filter((f) => f.endsWith('.test.mjs')),
    read: (f) => {
      if (!map.has(f)) throw new Error(`not planted: ${f}`);
      return map.get(f);
    },
    exists: (f) => map.has(f),
    base: '/planted',
  };
}

const scan = async (sources) => (await scanProductStarts(plant(sources))).starts
  .map(({ file, line, entry, licensed, declared }) => ({ file, line, entry, licensed, declared }));

const CP = "import { spawnSync } from 'node:child_process';\nimport { join } from 'node:path';\n";

test('the reader — a CLI start is found, and is licensed only when licensedEnv is in its arguments', async () => {
  assert.deepEqual(await scan({
    'bare.test.mjs': `${CP}const CLI = join(ROOT, 'tools', 'snowarch', 'bin', 'snowarch.mjs');\nspawnSync(process.execPath, [CLI, 'mode']);\n`,
    'inline.test.mjs': `${CP}const CLI = 'tools/snowarch/bin/snowarch.mjs';\nspawnSync(process.execPath, [CLI], { env: licensedEnv(process.env) });\n`,
  }), [
    { file: 'bare.test.mjs', line: 4, entry: 'cli', licensed: false, declared: null },
    { file: 'inline.test.mjs', line: 4, entry: 'cli', licensed: true, declared: null },
  ]);
});

test('the reader — an environment built elsewhere is followed: a const, and a function that returns it', async () => {
  assert.deepEqual(await scan({
    'const.test.mjs': `${CP}const CLI = 'snowarch.mjs';\nconst env = licensedEnv(process.env, { root });\nspawnSync(process.execPath, [CLI], { env });\n`,
    'fn.test.mjs': `${CP}const CLI = 'snowarch.mjs';\nconst env = (x) => licensedEnv({ ...process.env, ...x });\nspawnSync(process.execPath, [CLI], { env: env({}) });\n`,
  }), [
    { file: 'const.test.mjs', line: 5, entry: 'cli', licensed: true, declared: null },
    { file: 'fn.test.mjs', line: 5, entry: 'cli', licensed: true, declared: null },
  ]);
});

test('the reader — a server through StdioClientTransport, its path imported from a helper module', async () => {
  assert.deepEqual(await scan({
    'paths.mjs': "export const SERVER = join(ROOT, 'packages', 'snowarch', 'dist', 'server.js');\n",
    'server.test.mjs': "import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';\n"
      + "import { SERVER } from './paths.mjs';\n"
      + 'new StdioClientTransport({ command: process.execPath, args: [SERVER], env: {} });\n',
  }), [{ file: 'server.test.mjs', line: 3, entry: 'server', licensed: false, declared: null }]);
});

test('the reader — child_process under any local name: a namespace, an alias, a dynamic import, promisify', async () => {
  const CLI = "const CLI = 'snowarch.mjs';\n";
  assert.deepEqual(await scan({
    'ns.test.mjs': `import * as cp from 'node:child_process';\n${CLI}cp.spawnSync(process.execPath, [CLI]);\n`,
    'alias.test.mjs': `import { execFileSync as run } from 'node:child_process';\n${CLI}run(process.execPath, [CLI]);\n`,
    'dyn.test.mjs': `${CLI}const { spawnSync: go } = await import('node:child_process');\ngo(process.execPath, [CLI]);\n`,
    'prom.test.mjs': `import { execFile } from 'node:child_process';\nimport { promisify } from 'node:util';\n${CLI}`
      + 'const run = promisify(execFile);\nawait run(process.execPath, [CLI]);\n',
  }).then((s) => s.map((x) => `${x.file}:${x.line}:${x.entry}`)),
  ['ns.test.mjs:3:cli', 'alias.test.mjs:3:cli', 'dyn.test.mjs:3:cli', 'prom.test.mjs:5:cli']);
});

test('the reader — the package CLI is a start: a resolved path, a join of its segments, a path imported from a module', async () => {
  assert.deepEqual(await scan({
    'resolved.test.mjs': `${CP}const CLI = resolve(here, '../../dist/cli/index.js');\nspawnSync(process.execPath, [CLI, 'instance', 'list']);\n`,
    'joined.test.mjs': `${CP}const CLI = join(ROOT, 'packages', 'snowarch', 'dist', 'cli', 'index.js');\n`
      + "spawnSync(process.execPath, [CLI, 'store', 'migrate'], { env: licensedEnv(process.env) });\n",
    'paths.mjs': "export const CLI_PATH = join('packages', 'snowarch', 'dist', 'cli', 'index.js');\n",
    'imported.test.mjs': `${CP}import { CLI_PATH } from './paths.mjs';\nspawnSync(process.execPath, [join(root, CLI_PATH), 'instance', '--help']);\n`,
    'other.test.mjs': `${CP}spawnSync(process.execPath, [join(ROOT, 'node_modules', 'pkg', 'index.js')]);\n`,
  }), [
    { file: 'resolved.test.mjs', line: 4, entry: 'package-cli', licensed: false, declared: null },
    { file: 'joined.test.mjs', line: 4, entry: 'package-cli', licensed: true, declared: null },
    { file: 'imported.test.mjs', line: 4, entry: 'package-cli', licensed: false, declared: null },
  ]);
});

test('the reader — the launcher by either spelling, and a seam whose program is a parameter is presumed', async () => {
  assert.deepEqual(await scan({
    'launcher.test.mjs': `${CP}const launcher = join(ROOT, WIN ? 'snowarch.cmd' : 'snowarch');\nspawnSync(launcher, ['version']);\n`,
    'seam.test.mjs': `${CP}const CLI = 'tools/snowarch/bin/snowarch.mjs';\nconst run = (cmd, args) => spawnSync(cmd, args);\n`,
  }), [
    { file: 'launcher.test.mjs', line: 4, entry: 'launcher', licensed: false, declared: null },
    { file: 'seam.test.mjs', line: 4, entry: 'presumed', licensed: false, declared: null },
  ]);
});

test('the reader — what is not the product is not a start: git, a script, the hook, -e code, a directory named snowarch', async () => {
  assert.deepEqual(await scan({
    'not.test.mjs': `${CP}const CLI = 'tools/snowarch/bin/snowarch.mjs';\n`
      + "spawnSync('git', ['ls-files', 'snowarch.cmd', CLI]);\n"
      + "spawnSync(process.execPath, [join(ROOT, 'scripts/docs.mjs'), 'status']);\n"
      + "spawnSync(process.execPath, [join(ROOT, 'tools', 'snowarch', 'hooks', 'session-start.mjs')]);\n"
      + "spawnSync(process.execPath, ['-e', 'process.exit(7)']);\n"
      + "spawnSync(process.execPath, ['--test', join(ROOT, 'tools', 'snowarch', 'tests')], { cwd: join(tmp, 'snowarch') });\n",
  }), []);
});

test('the reader — -e code that imports the CLI is a start; a declared start carries its reason', async () => {
  assert.deepEqual(await scan({
    'code.test.mjs': `${CP}spawnSync(process.execPath, ['--input-type=module', '-e', "await import('./tools/snowarch/bin/snowarch.mjs')"]);\n`,
    'declared.test.mjs': `${CP}const SERVER = 'dist/server.js';\n// unlicensed start: the spike measures the hook itself, with and without it\n`
      + 'spawnSync(process.execPath, [SERVER]);\n',
  }), [
    { file: 'code.test.mjs', line: 3, entry: 'cli', licensed: false, declared: null },
    { file: 'declared.test.mjs', line: 5, entry: 'server', licensed: false,
      declared: 'the spike measures the hook itself, with and without it' },
  ]);
});

test('the reader — a child_process it cannot follow is reported, never passed', async () => {
  const { unresolved } = await scanProductStarts(plant({
    'req.test.mjs': "require('node:child_process').spawnSync(process.execPath, ['snowarch.mjs']);\n",
  }));
  assert.deepEqual(unresolved, ['req.test.mjs: a require of child_process']);
});
