// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-11-C6, the spike — measure the test-only key hook on every CI cell before C6's code starts.
 *
 * The architect's condition 2 (2026-10-12): shape A, the `--import` module hook that substitutes the
 * keys module for a spawned process's run, is measured on all three OS cells, Windows on node 24
 * included, before any C6 code. This file is that measurement, and adds no product code:
 * - the CLI, started directly with `--import`, through `NODE_OPTIONS`, and through the launcher
 *   (`./snowarch`, or `snowarch.cmd` through `cmd.exe`), trusts a fixture key with the hook and does
 *   not without it;
 * - the server, spawned over stdio (it enforces on every build, from ARC-11-C6), answers with the hook and
 *   refuses `LICENCE_NOT_VALID` without it;
 * - each spawn's time, with and without the hook, is printed as a diagnostic for the record.
 *
 * Each case is a pair, so the hook is never the only thing that could have made it pass: the same
 * spawn without the hook must read the fixture licence as signed by an unknown key.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

import { keyPair, licence, licenceText, productKeys } from './helpers/licence.mjs';
import { fixtureKeysHook } from './helpers/licence-hook/index.mjs';
import { tempDir } from './helpers/temp.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CLI = join(ROOT, 'tools', 'snowarch', 'bin', 'snowarch.mjs');
const SERVER = join(ROOT, 'packages', 'snowarch', 'dist', 'server.js');
const WIN = process.platform === 'win32';

/** The run's fixture: two pairs, the hook files, and a licence signed by the fixture primary. */
function fixture(t) {
  const dir = tempDir('snowarch-hook-spike-', t);
  const primary = keyPair();
  const hook = fixtureKeysHook(dir, productKeys(primary, keyPair()));
  const file = join(dir, 'licence.json');
  writeFileSync(file, licenceText(licence({ id: 'LIC-2026-9001' }), primary));
  return { dir, hook, file };
}

/** The inherited environment without anything that could decide the answer for us. */
function cleanEnv(dir, extra = {}) {
  const env = { ...process.env };
  for (const k of ['NODE_OPTIONS', 'SNOW_LICENCE_ENFORCE', 'SNOW_STORE', 'SNOW_ENV_FILE', 'SNOW_AUDIT_FILE',
    'CLAUDE_PROJECT_DIR']) delete env[k];
  return { ...env, HOME: dir, APPDATA: dir, ...extra };
}

/** `licence verify <file>`, started one of three ways: what it printed, and how long it took. It has no JSON form. */
function verify({ how, file, env }) {
  const args = ['licence', 'verify', file];
  const [cmd, argv] = how === 'launcher'
    ? (WIN ? [process.env.COMSPEC || 'cmd.exe', ['/c', join(ROOT, 'snowarch.cmd'), ...args]] : [join(ROOT, 'snowarch'), args])
    : [process.execPath, [...(how.importArgs ?? []), CLI, ...args]];
  const t0 = performance.now();
  // unlicensed start: the spike measures the hook itself, each case once with it and once without it
  const r = spawnSync(cmd, argv, { encoding: 'utf8', env, cwd: ROOT, timeout: 60_000 });
  const ms = Math.round(performance.now() - t0);
  assert.equal(r.error, undefined, `${cmd} did not start: ${r.error}`);
  return { text: `${r.stdout}${r.stderr}`, ms, stderr: r.stderr };
}

test('ARC-11-C6 spike — the CLI started directly with --import trusts the fixture key, and without the hook does not', (t) => {
  const { dir, hook, file } = fixture(t);
  const withHook = verify({ how: { importArgs: hook.importArgs }, file, env: cleanEnv(dir) });
  const without = verify({ how: {}, file, env: cleanEnv(dir) });
  assert.match(withHook.text, /Licence: ok · LIC-2026-9001/, withHook.text);
  assert.match(withHook.text, /signature:\s+valid — primary key/, withHook.text);
  assert.match(without.text, /Licence: invalid/, `without the hook a fixture key must not verify: ${without.text}`);
  t.diagnostic(`${process.platform} node ${process.versions.node} · CLI --import: hook ${withHook.ms} ms, plain ${without.ms} ms`
    + (withHook.stderr.trim() ? ` · stderr: ${withHook.stderr.trim().split('\n')[0].slice(0, 120)}` : ''));
});

test('ARC-11-C6 spike — the CLI reached through NODE_OPTIONS trusts the fixture key, and without the hook does not', (t) => {
  const { dir, hook, file } = fixture(t);
  const withHook = verify({ how: {}, file, env: cleanEnv(dir, { NODE_OPTIONS: hook.nodeOptions }) });
  const without = verify({ how: {}, file, env: cleanEnv(dir) });
  assert.match(withHook.text, /signature:\s+valid — primary key/, withHook.text);
  assert.match(without.text, /Licence: invalid/, without.text);
  t.diagnostic(`${process.platform} node ${process.versions.node} · CLI NODE_OPTIONS: hook ${withHook.ms} ms, plain ${without.ms} ms`);
});

test('ARC-11-C6 spike — the launcher passes NODE_OPTIONS on: the CLI behind it trusts the fixture key only with the hook', (t) => {
  const { dir, hook, file } = fixture(t);
  const withHook = verify({ how: 'launcher', file, env: cleanEnv(dir, { NODE_OPTIONS: hook.nodeOptions }) });
  const without = verify({ how: 'launcher', file, env: cleanEnv(dir) });
  assert.match(withHook.text, /signature:\s+valid — primary key/, withHook.text);
  assert.match(without.text, /Licence: invalid/, without.text);
  // The POSIX launcher's own `node -p` version check loads the hook too, so the launcher's stderr is the
  // one to compare: the hook must add nothing to it (the architect's measurement (a), 2026-10-12).
  assert.equal(withHook.stderr, without.stderr, 'the hook changed what the launcher prints on stderr');
  t.diagnostic(`${process.platform} node ${process.versions.node} · launcher ${WIN ? 'snowarch.cmd' : './snowarch'}: hook ${withHook.ms} ms, plain ${without.ms} ms`);
});

test('ARC-11-C6 spike — the server under enforcement answers with the hook, and refuses LICENCE_NOT_VALID without it', async (t) => {
  const dir = tempDir('snowarch-hook-spike-', t);
  const checkout = join(dir, 'checkout');
  mkdirSync(join(checkout, '.local'), { recursive: true });
  const primary = keyPair();
  const hook = fixtureKeysHook(dir, productKeys(primary, keyPair()));
  writeFileSync(join(checkout, '.local', 'licence.json'), licenceText(licence({ id: 'LIC-2026-9002' }), primary));

  const ask = async (extra) => {
    const env = cleanEnv(dir, { CLAUDE_PROJECT_DIR: checkout, SNOW_LOG_LEVEL: 'error', ...extra });
    const client = new Client({ name: 'hook-spike', version: '0' }, { capabilities: {} });
    // unlicensed start: the spike measures the hook itself, each case once with it and once without it
    const transport = new StdioClientTransport({ command: process.execPath, args: [SERVER], env, cwd: checkout, stderr: 'pipe' });
    let err = '';
    transport.stderr?.on('data', (b) => { err += b; });
    const t0 = performance.now();
    try {
      await client.connect(transport).catch((e) => { throw new Error(`${e.message} · server stderr: ${err.slice(0, 600)}`); });
      const r = await client.callTool({ name: 'snow_core_capabilities_read', arguments: {} });
      const text = r.content.map((c) => c.text ?? '').join('\n');
      const ms = Math.round(performance.now() - t0);
      await client.close();
      return { text, ms, stderr: err };
    } catch (e) {
      await client.close();
      throw e;
    }
  };
  const withHook = await ask({ NODE_OPTIONS: hook.nodeOptions });
  const without = await ask({});
  // Measurement (a), that the hook adds nothing to an answering server's stderr, was taken byte for byte on
  // every CI cell before enforcement took no switch (#416, 2026-10-12). Its baseline was a plain server that
  // answered with enforcement off. After ARC-11-C6's flip no unhooked server answers, so that baseline
  // cannot exist, and comparing with `without`, the refused control, would fail for a reason that is not the
  // hook (the architect's ruling on #416). What stays, by the architect's ruling of 2026-10-12: the hooked
  // server's stderr names neither the hook's files nor the fixture keys module.
  assert.doesNotMatch(withHook.text, /LICENCE_NOT_VALID/, `the hooked server refused: ${withHook.text.slice(0, 300)}`);
  assert.match(without.text, /licence invalid[\s\S]*\(Code: LICENCE_NOT_VALID\)/, `the plain server did not refuse: ${without.text.slice(0, 300)}`);
  for (const name of ['register-hook.mjs', 'hooks.mjs', 'fixture-keys.mjs']) {
    assert.equal(withHook.stderr.includes(name), false, `the hooked server's stderr names ${name}: ${withHook.stderr.slice(0, 300)}`);
  }
  t.diagnostic(`${process.platform} node ${process.versions.node} · server stdio: hook ${withHook.ms} ms, plain ${without.ms} ms`);
});

test('ARC-11-C6 spike — a child that never loads a keys module is untouched: exit 7, nothing on stdout or stderr', (t) => {
  // The architect's measurement (b), 2026-10-12. NODE_OPTIONS reaches every node a launcher starts; the hook
  // must change nothing for one that never imports a keys module.
  const { dir, hook } = fixture(t);
  const inert = (extra) => spawnSync(process.execPath, ['-e', 'process.exit(7)'], { encoding: 'utf8', env: cleanEnv(dir, extra), timeout: 60_000 });
  const withHook = inert({ NODE_OPTIONS: hook.nodeOptions });
  const without = inert({});
  assert.equal(withHook.status, 7, `exit ${withHook.status}: ${withHook.stderr.slice(0, 300)}`);
  assert.equal(withHook.stdout, '');
  assert.equal(withHook.stderr, '');
  assert.deepEqual([without.status, without.stdout, without.stderr], [7, '', ''], 'the control child is not inert');
});
