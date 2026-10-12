// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-11-C6 — `scripts/ci/licence-fixture.mjs`, the licence for the CI steps that run the product outside the
 * allowed set (`docs sync`, `instance add`, `store migrate`).
 *
 * What it promises, one case each:
 * - a hook and a licence under the directory it is given, named in GITHUB_OUTPUT as `node_options` and `root`,
 *   which a step passes as NODE_OPTIONS, SNOWARCH_STATE_ROOT and CLAUDE_PROJECT_DIR;
 * - a CLI started with those trusts the licence; started without the hook it does not, because the key that
 *   signed it is this run's own and no build ships it;
 * - never a write inside this checkout.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT, 'scripts', 'ci', 'licence-fixture.mjs');
const CLI = join(ROOT, 'tools', 'snowarch', 'bin', 'snowarch.mjs');

/** The environment without anything that would decide where a child reads its licence. */
function cleanEnv(extra = {}) {
  const env = { ...process.env };
  for (const k of ['NODE_OPTIONS', 'SNOWARCH_STATE_ROOT', 'CLAUDE_PROJECT_DIR', 'GITHUB_OUTPUT']) delete env[k];
  return { ...env, ...extra };
}

/** Run the script into `dir`, and read back what it put in GITHUB_OUTPUT. */
function fixture(t) {
  const base = tempDir('snowarch-ci-licence-', t);
  const out = join(base, 'github-output');
  writeFileSync(out, '');
  const r = spawnSync(process.execPath, [SCRIPT, join(base, 'fixture')], { encoding: 'utf8', env: cleanEnv({ GITHUB_OUTPUT: out }) });
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
  const o = Object.fromEntries(readFileSync(out, 'utf8').trim().split('\n').map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
  return { base, o };
}

test('licence-fixture writes a hook and a licence under its directory, and names them in GITHUB_OUTPUT', (t) => {
  const { base, o } = fixture(t);
  assert.deepEqual(Object.keys(o).sort(), ['node_options', 'root']);
  assert.match(o.node_options, /^--import=file:\/\//);
  assert.equal(o.root, join(base, 'fixture', 'root'));
  assert.ok(existsSync(join(o.root, '.local', 'licence.json')));
});

test('a CLI step with those outputs trusts the licence; without the hook it reads invalid', (t) => {
  const { o } = fixture(t);
  const check = (env) => {
    // unlicensed start: this case tests the CI fixture's own environment, which is what the CI steps start with
    const r = spawnSync(process.execPath, [CLI, 'licence', 'check'], { encoding: 'utf8', env: cleanEnv(env) });
    return `${r.stdout}${r.stderr}`;
  };
  assert.match(check({ NODE_OPTIONS: o.node_options, SNOWARCH_STATE_ROOT: o.root, CLAUDE_PROJECT_DIR: o.root }),
    /Licence: ok · LIC-2026-9000 · perpetual/);
  // The control: the same licence, read by a build that trusts only the keys it ships.
  assert.match(check({ SNOWARCH_STATE_ROOT: o.root, CLAUDE_PROJECT_DIR: o.root }), /Licence: invalid/);
});

test('it refuses a directory inside this checkout, and writes nothing there', () => {
  const inside = join(ROOT, '.licence-fixture-refused');
  const r = spawnSync(process.execPath, [SCRIPT, inside], { encoding: 'utf8', env: cleanEnv() });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /inside this checkout/);
  assert.equal(existsSync(inside), false);
});
