// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C303 — `./bootstrap.sh` refuses to run as root. The architect's ruling, 2026-11-19.
 *
 * `sudo ./bootstrap.sh` leaves a root-owned tree, a root-owned `.local/` and a root-owned settings file, and the user's own next run fails on
 * them. The launcher asks `id -u` first: before `--reset` removes a file, before it hands over to Node, before any preflight check. The sentence
 * is the one the CLI and the integrity check end their refusals with (tools/snowarch/lib/root-guard.mjs), generated into the launcher. The
 * Windows launchers are untouched: Windows has no root, and bootstrap.ps1 does not declare the sentence.
 *
 * The case stubs `id` with a script that prints 0, first on PATH, in a COPY of the launcher: `--reset` is the destructive form, and the case
 * asserts that its file survives.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ELEVATED_REMEDY } from '../tools/snowarch/lib/root-guard.mjs';
import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const posix = process.platform !== 'win32';

/** The launcher, copied with what it sources and reads before it decides anything, into a folder the case can lose. */
function copy(t) {
  const dir = tempDir('snowarch-c303-launcher-', t);
  cpSync(join(ROOT, 'bootstrap.sh'), join(dir, 'bootstrap.sh'));
  cpSync(join(ROOT, 'engine.config.json'), join(dir, 'engine.config.json'));
  cpSync(join(ROOT, 'tools/snowarch/launcher'), join(dir, 'tools/snowarch/launcher'), { recursive: true });
  mkdirSync(join(dir, '.local'));
  writeFileSync(join(dir, '.local', 'bootstrap-state.json'), '{"state":"kept"}\n');
  return dir;
}

/** `id` printing the number it is told, first on PATH. */
function stubbed(t, uid) {
  const bin = tempDir('snowarch-c303-id-', t);
  writeFileSync(join(bin, 'id'), `#!/bin/sh\necho ${uid}\n`);
  chmodSync(join(bin, 'id'), 0o755);
  return { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}` };
}

const run = (dir, args, env) => spawnSync('bash', [join(dir, 'bootstrap.sh'), ...args], { cwd: dir, encoding: 'utf8', env, timeout: 60000 });

test('C303 — the launcher\'s sentence is the engine\'s, and the Windows launcher does not declare it', () => {
  const sh = readFileSync(join(ROOT, 'bootstrap.sh'), 'utf8');
  const m = /^MSG_ELEVATED='((?:[^']|'\\'')*)'$/m.exec(sh);
  assert.ok(m, 'MSG_ELEVATED is not assigned in bootstrap.sh');
  assert.equal(m[1].replace(/'\\''/g, "'"), ELEVATED_REMEDY);
  assert.doesNotMatch(readFileSync(join(ROOT, 'bootstrap.ps1'), 'utf8'), /MSG_ELEVATED/, 'a Windows launcher declares a sentence it never prints');
});

test('C303 — as root, ./bootstrap.sh refuses first: exit 3, the sentence, and --reset removes nothing', { skip: !posix && 'bash is not the Windows launcher' }, (t) => {
  const dir = copy(t);
  for (const args of [['--reset'], [], ['--yes'], ['--mode', 'live']]) {
    const r = run(dir, args, stubbed(t, 0));
    assert.equal(r.status, 3, `${args.join(' ')}: ${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /^FAIL B00: .*root/m, r.stdout);
    assert.ok(r.stdout.includes(ELEVATED_REMEDY), r.stdout);
    assert.ok(existsSync(join(dir, '.local', 'bootstrap-state.json')), `${args.join(' ')} removed the state file`);
  }
});

test('C303 — not root, the same launcher gets past that line: --reset clears the state (the case can tell the two apart)', { skip: !posix && 'bash is not the Windows launcher' }, (t) => {
  const dir = copy(t);
  const r = run(dir, ['--reset'], stubbed(t, 1000));
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
  assert.equal(existsSync(join(dir, '.local', 'bootstrap-state.json')), false);
});

test('C303 — its help is answered as root: it writes nothing', { skip: !posix && 'bash is not the Windows launcher' }, (t) => {
  const r = run(copy(t), ['--help'], stubbed(t, 0));
  assert.equal(r.status, 0);
  assert.match(r.stdout, /usage: \.\/bootstrap\.sh/);
});
