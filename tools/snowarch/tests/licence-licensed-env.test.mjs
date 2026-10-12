// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-11-C6 step 1 — `licensedEnv()`, the helper every start of the product in the tests goes through.
 *
 * What it promises, each case below one promise:
 * - a copy of the environment, every value a string, the input untouched;
 * - the test-only hook added to NODE_OPTIONS after what is already there, once;
 * - a fixture licence, live and perpetual, signed with this process's fixture key, under every root the child
 *   reads one from: `root`, SNOWARCH_STATE_ROOT and CLAUDE_PROJECT_DIR; with none, a new state root;
 * - the same licence is not written again, so a test that starts the CLI twice moves no input;
 * - `licence: false` writes none, and an object changes the licence;
 * - never a write inside this repository, where the owner's own licence lives;
 * - and the two ends that matter: a spawned CLI and a spawned server under enforcement trust what it wrote.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, utimesSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

import { checkLicence } from '../lib/licence/core.mjs';
import { FIXTURE_LICENCE, licenceFixture, licensedEnv } from './helpers/licence-hook/index.mjs';
import { tempDir } from './helpers/temp.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CLI = join(ROOT, 'tools', 'snowarch', 'bin', 'snowarch.mjs');
const SERVER = join(ROOT, 'packages', 'snowarch', 'dist', 'server.js');
const NOW = new Date('2026-10-12T12:00:00Z');

const licenceAt = (root) => join(root, '.local', 'licence.json');
const verdict = (root) => checkLicence(readFileSync(licenceAt(root), 'utf8'), { keys: licenceFixture().keys, now: NOW });

/** The inherited environment without anything that would decide where a child reads its licence or state. */
function cleanEnv(extra = {}) {
  const env = { ...process.env };
  for (const k of ['NODE_OPTIONS', 'SNOW_LICENCE_ENFORCE', 'SNOW_STORE', 'SNOW_ENV_FILE', 'SNOW_AUDIT_FILE',
    'CLAUDE_PROJECT_DIR', 'SNOWARCH_STATE_ROOT']) delete env[k];
  return { ...env, ...extra };
}

test('licensedEnv — a copy of the environment: the input untouched, every value a string', (t) => {
  const root = tempDir('snowarch-licensed-env-', t);
  const input = { A: 'a', GONE: undefined, SNOWARCH_STATE_ROOT: root };
  const out = licensedEnv(input);
  assert.notEqual(out, input);
  assert.deepEqual(input, { A: 'a', GONE: undefined, SNOWARCH_STATE_ROOT: root });
  assert.equal('GONE' in out, false);
  assert.ok(Object.values(out).every((v) => typeof v === 'string'));
});

test('licensedEnv — the hook goes after what NODE_OPTIONS already holds, and only once', (t) => {
  const root = tempDir('snowarch-licensed-env-', t);
  const { hook } = licenceFixture();
  const once = licensedEnv({ NODE_OPTIONS: '--max-old-space-size=4096', SNOWARCH_STATE_ROOT: root });
  assert.equal(once.NODE_OPTIONS, `--max-old-space-size=4096 ${hook.nodeOptions}`);
  assert.equal(licensedEnv(once).NODE_OPTIONS, once.NODE_OPTIONS);
});

test('licensedEnv — the licence goes under root, the state root and the project directory, live and perpetual', (t) => {
  const [a, b, c] = [1, 2, 3].map(() => tempDir('snowarch-licensed-env-', t));
  licensedEnv({ SNOWARCH_STATE_ROOT: b, CLAUDE_PROJECT_DIR: c }, { root: a });
  for (const r of [a, b, c]) {
    const v = verdict(r);
    assert.deepEqual([v.state, v.id, v.scope, v.perpetual], ['ok', FIXTURE_LICENCE.id, 'live', true], r);
  }
  // The .local/ it makes is private, as bootstrap makes it.
  if (process.platform !== 'win32') assert.equal(statSync(join(a, '.local')).mode & 0o777, 0o700);
});

test('licensedEnv — the same licence is not written again, so an input a doctor cache keys on does not move', (t) => {
  const root = tempDir('snowarch-licensed-env-', t);
  licensedEnv({ CLAUDE_PROJECT_DIR: root });
  // Back-dated, so a rewrite shows whatever the file system's time resolution is.
  const past = new Date('2026-01-01T00:00:00Z');
  utimesSync(licenceAt(root), past, past);
  licensedEnv({ CLAUDE_PROJECT_DIR: root });
  assert.equal(statSync(licenceAt(root)).mtimeMs, past.getTime(), 'an identical licence was written again');
  // A different licence is.
  licensedEnv({ CLAUDE_PROJECT_DIR: root }, { licence: { scope: 'design-only' } });
  assert.equal(verdict(root).scope, 'design-only');
});

test('licensedEnv — with no root anywhere, a new state root holds the licence, and the environment names it', () => {
  const out = licensedEnv({ PATH: process.env.PATH ?? '' });
  assert.ok(out.SNOWARCH_STATE_ROOT, 'no state root was made');
  assert.equal(verdict(out.SNOWARCH_STATE_ROOT).state, 'ok');
});

test('licensedEnv — licence: false writes none and makes no state root; an object changes the licence', (t) => {
  const root = tempDir('snowarch-licensed-env-', t);
  const none = licensedEnv({ CLAUDE_PROJECT_DIR: root }, { licence: false });
  assert.equal(existsSync(licenceAt(root)), false);
  assert.equal(none.SNOWARCH_STATE_ROOT, undefined);
  assert.equal(none.NODE_OPTIONS, licenceFixture().hook.nodeOptions);
  licensedEnv({ CLAUDE_PROJECT_DIR: root }, { licence: { scope: 'design-only' } });
  assert.equal(verdict(root).scope, 'design-only');
});

test('licensedEnv — it never writes inside this repository, where the owner\'s licence lives', (t) => {
  const own = licenceAt(ROOT);
  const before = existsSync(own) ? readFileSync(own, 'utf8') : null;
  const fine = tempDir('snowarch-licensed-env-', t);
  for (const call of [() => licensedEnv({}, { root: ROOT }), () => licensedEnv({ CLAUDE_PROJECT_DIR: ROOT }),
    () => licensedEnv({ SNOWARCH_STATE_ROOT: fine }, { root: join(ROOT, 'tools') })]) {
    assert.throws(call, /inside this repository/);
  }
  assert.equal(existsSync(own) ? readFileSync(own, 'utf8') : null, before, 'the checkout\'s own licence changed');
  assert.equal(existsSync(join(ROOT, 'tools', '.local')), false);
  // Refused before anything was written: the good root beside the bad one got nothing either.
  assert.equal(existsSync(licenceAt(fine)), false);
});

test('licensedEnv — a spawned CLI trusts the fixture licence it finds in the state root', () => {
  const r = spawnSync(process.execPath, [CLI, 'licence', 'check'], { encoding: 'utf8', env: licensedEnv(cleanEnv()) });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, new RegExp(`Licence: ok · ${FIXTURE_LICENCE.id} · perpetual`), r.stdout);
});

test('licensedEnv — a spawned server under enforcement answers with the fixture licence in its project', async (t) => {
  const project = tempDir('snowarch-licensed-env-server-', t);
  const env = licensedEnv(cleanEnv({ HOME: project, APPDATA: project, CLAUDE_PROJECT_DIR: project,
    SNOW_LICENCE_ENFORCE: 'true', SNOW_LOG_LEVEL: 'error' }));
  const client = new Client({ name: 'licensed-env', version: '0' }, { capabilities: {} });
  const transport = new StdioClientTransport({ command: process.execPath, args: [SERVER], env, cwd: project, stderr: 'ignore' });
  try {
    await client.connect(transport);
    const r = await client.callTool({ name: 'snow_core_capabilities_read', arguments: {} });
    const text = r.content.map((c) => c.text ?? '').join('\n');
    assert.doesNotMatch(text, /LICENCE_NOT_VALID/, text.slice(0, 300));
  } finally {
    await client.close();
  }
});
