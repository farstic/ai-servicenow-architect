// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-11-C6 step 4b — the engine translates its own state-root seam for the children that ARE the product.
 *
 * The engine keeps this checkout's `.local/` under `stateRoot(root)`: the checkout itself, unless SNOWARCH_STATE_ROOT
 * (a test and CI seam) moves it. The package CLI and the server read theirs under CLAUDE_PROJECT_DIR, and know no
 * seam (ARC-07-C43). `childEnv` pins CLAUDE_PROJECT_DIR to the checkout, which is right for git, npm and `claude
 * mcp`. For a product child it split the doors under the seam: ./snowarch passed on the state root's licence, and
 * the package CLI it forwarded to looked in the checkout's `.local/` and refused. `productEnv` and `productDir` tell
 * a product child the directory whose `.local/` the engine reads. With the seam unset, that is the checkout, and
 * the environment is byte for byte `childEnv`'s.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { childEnv, productDir, productEnv } from '../lib/spawn-env.mjs';
import { root as ENGINE_ROOT } from '../lib/config.mjs';
import { licensedEnv } from './helpers/licence-hook/index.mjs';
import { tempDir } from './helpers/temp.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CLI = join(ROOT, 'tools', 'snowarch', 'bin', 'snowarch.mjs');

test('ARC-11-C6 — with the seam unset, a product child\'s environment is childEnv\'s, byte for byte', () => {
  const base = { PATH: '/usr/bin', HOME: '/home/someone', CLAUDE_PROJECT_DIR: '/elsewhere' };
  assert.deepEqual(productEnv(ENGINE_ROOT, {}, base), childEnv(ENGINE_ROOT, {}, base));
  assert.deepEqual(productEnv(ENGINE_ROOT, { NODE_ENV: 'production' }, base),
    childEnv(ENGINE_ROOT, { NODE_ENV: 'production' }, base));
  assert.equal(productDir(ENGINE_ROOT, base), ENGINE_ROOT);
});

test('ARC-11-C6 — under the seam a product child is told the state root, and a git child still the checkout', (t) => {
  const state = tempDir('snowarch-product-env-', t);
  const base = { PATH: '/usr/bin', SNOWARCH_STATE_ROOT: state };
  assert.equal(productEnv(ENGINE_ROOT, {}, base).CLAUDE_PROJECT_DIR, resolve(state));
  assert.equal(childEnv(ENGINE_ROOT, {}, base).CLAUDE_PROJECT_DIR, ENGINE_ROOT);
  // The seam moves only this checkout's state (`stateRoot`): another root is told itself.
  const other = tempDir('snowarch-product-env-other-', t);
  assert.equal(productEnv(other, {}, base).CLAUDE_PROJECT_DIR, other);
});

test('ARC-11-C6 — ./snowarch instance list under a temp state root that holds the only licence runs', () => {
  // licensedEnv with no root of its own puts the fixture licence under a temp SNOWARCH_STATE_ROOT and nowhere else,
  // so the forwarded package CLI is licensed only if it is told that root.
  const r = spawnSync(process.execPath, [CLI, 'instance', 'list'],
    { encoding: 'utf8', cwd: ROOT, env: licensedEnv({ ...process.env, SNOW_STORE: '' }) });
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
  assert.doesNotMatch(`${r.stdout}${r.stderr}`, /LICENCE_NOT_VALID|licence missing/);
});

test('ARC-11-C6 — productEnv is told only to product children, and never to git, npm, claude or the engine', () => {
  const lib = join(ROOT, 'tools', 'snowarch', 'lib');
  const count = (rel, name) => readFileSync(join(lib, rel), 'utf8').split(`${name}(`).length - 1;
  // The forwarder, B06's probe, migration and wizard, B08's probes, and the server checks' in-process run.
  assert.deepEqual(
    { instance: count('instance.mjs', 'productEnv'), b06: count('steps/B06.mjs', 'productEnv'),
      b08: count('steps/B08.mjs', 'productEnv'), server: count('doctor/checks/server.mjs', 'productDir') },
    { instance: 1, b06: 3, b08: 1, server: 1 });
  for (const rel of ['commands/upgrade.mjs', 'git.mjs', 'registration-claude.mjs', 'steps/B04.mjs', 'steps/B09.mjs',
    'doctor/index.mjs']) {
    assert.equal(count(rel, 'productEnv') + count(rel, 'productDir'), 0, `${rel} tells a non-product child the state root`);
  }
});
