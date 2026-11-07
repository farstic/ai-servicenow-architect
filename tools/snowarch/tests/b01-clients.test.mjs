// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C265 — `clients/` exists after the first bootstrap.
 *
 * The user types `Status` in a fresh install and the Architect looks for the engagement. A listing of a folder that is not there
 * prints `ls: clients: No such file or directory` before any engagement exists; an empty folder reads as "no engagement folder yet".
 * B01 (workspace) makes it, empty, only when nothing is there, and never touches what is. This fixes the visible error, not the
 * wording of the Status steps in CLAUDE.md, which waits for R6.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CLIENTS_DIR, ensureClientsDir, run as runB01 } from '../lib/steps/B01.mjs';
import { tempDir } from './helpers/temp.mjs';
import { makeCheckout } from './helpers/workspace.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const isWindows = process.platform === 'win32';

const ctxFor = (root, over = {}) => ({
  root, config: JSON.parse(readFileSync(join(root, 'engine.config.json'), 'utf8')), mode: 'design-only',
  node: { present: true, version: '22.11.0' },
  state: { steps: {}, registration: 'project', hooksDisabledByBootstrap: false },
  line: () => {}, ...over,
});

/** Every file under `dir`: its relative path and its sha256, sorted — and the mtime of every directory, because a touched folder is a changed folder. */
function digestOf(dir) {
  const out = [];
  const walk = (d, rel) => {
    out.push(`${rel || '.'}/ ${statSync(d).mtimeMs}`);
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p, `${rel}/${e.name}`);
      else out.push(`${rel}/${e.name} ${createHash('sha256').update(readFileSync(p)).digest('hex')}`);
    }
  };
  walk(dir, '');
  return out;
}

test('ARC-09-C265 — a fresh install: B01 makes clients/ empty, `ls clients` exits 0 with no output, and the step says so', async (t) => {
  const root = makeCheckout({}, t);
  assert.equal(existsSync(join(root, CLIENTS_DIR)), false, 'a fresh checkout has none');
  // Before: the error the user saw.
  if (!isWindows) {
    const before = spawnSync('ls', [CLIENTS_DIR], { cwd: root, encoding: 'utf8' });
    assert.notEqual(before.status, 0);
    assert.match(before.stderr, /clients.*No such file or directory/);
  }

  const r = await runB01(ctxFor(root));
  assert.equal(r.status, 'ok', r.detail);
  assert.equal(r.data.clientsDir, 'created');
  assert.match(r.detail, /· clients\/ created/);
  assert.deepEqual(readdirSync(join(root, CLIENTS_DIR)), [], 'empty');

  if (!isWindows) {
    const after = spawnSync('ls', [CLIENTS_DIR], { cwd: root, encoding: 'utf8' });
    assert.equal(after.status, 0, after.stderr);
    assert.equal(after.stdout, '');
    assert.equal(after.stderr, '');
  }
  // Untracked and invisible to git: an empty directory is not a change, and the repository ignores the folder anyway.
  assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).includes('clients'), false);

  // The second run finds it and says nothing more about it.
  const again = await runB01(ctxFor(root));
  assert.equal(again.data.clientsDir, 'present');
  assert.doesNotMatch(again.detail, /clients/);
});

test('ARC-09-C265 — the repository ignores clients/: what is in it is a client\'s work and stays on the machine', () => {
  const r = spawnSync('git', ['check-ignore', '-q', `${CLIENTS_DIR}/acme/notes.md`], { cwd: REPO });
  assert.equal(r.status, 0, 'git does not ignore clients/');
});

test('ARC-09-C265 — an existing clients/ with content is left byte-identical, its folders\' mtimes included', async (t) => {
  const root = makeCheckout({}, t);
  const dir = join(root, CLIENTS_DIR);
  mkdirSync(join(dir, 'acme', 'designs'), { recursive: true });
  writeFileSync(join(dir, 'acme', 'acme-engagement-state.md'), '# acme\n');
  writeFileSync(join(dir, 'acme', 'designs', 'hld.md'), 'line one\r\nline two\n');
  writeFileSync(join(dir, 'acme', 'designs', 'blob.bin'), Buffer.from([0, 255, 10, 13, 128]));
  const before = digestOf(dir);

  const r = await runB01(ctxFor(root));
  assert.equal(r.status, 'ok', r.detail);
  assert.equal(r.data.clientsDir, 'present');
  assert.doesNotMatch(r.detail, /clients/);
  assert.deepEqual(digestOf(dir), before);
});

test('ARC-09-C265 — what the user put there instead is theirs: a file, a link, a link that leads nowhere', async (t) => {
  // A file called clients: left alone, and the step does not fail.
  const withFile = makeCheckout({}, t);
  writeFileSync(join(withFile, CLIENTS_DIR), 'mine\n');
  const f = await runB01(ctxFor(withFile));
  assert.equal(f.status, 'ok', f.detail);
  assert.equal(readFileSync(join(withFile, CLIENTS_DIR), 'utf8'), 'mine\n');

  if (isWindows) return;   // a symbolic link needs a privilege there, and what is proved above does not depend on it
  const elsewhere = tempDir('snowarch-clients-elsewhere-', t);
  const withLink = makeCheckout({}, t);
  symlinkSync(elsewhere, join(withLink, CLIENTS_DIR));
  await runB01(ctxFor(withLink));
  assert.equal(lstatSync(join(withLink, CLIENTS_DIR)).isSymbolicLink(), true);
  assert.deepEqual(readdirSync(elsewhere), [], 'nothing was written through the link');

  const dangling = makeCheckout({}, t);
  symlinkSync(join(elsewhere, 'gone'), join(dangling, CLIENTS_DIR));
  const d = await runB01(ctxFor(dangling));
  assert.equal(d.status, 'ok', d.detail);
  assert.equal(lstatSync(join(dangling, CLIENTS_DIR)).isSymbolicLink(), true, 'a dangling link is left as it was');
  assert.equal(existsSync(join(elsewhere, 'gone')), false);
});

test('ARC-09-C265 — a folder that cannot be made is reported with its reason by ensureClientsDir', () => {
  // The root is a FILE, so nothing can be made under it, on every platform and whoever runs the test.
  const dir = tempDir('snowarch-clients-root-');
  const notADirectory = join(dir, 'file');
  writeFileSync(notADirectory, 'x');
  const r = ensureClientsDir(notADirectory);
  assert.equal(r.existed, false);
  assert.match(String(r.error), /ENOTDIR|ENOENT|EEXIST/);
});

test('ARC-09-C265 — and by the step: a warning that names the reason, never a failed bootstrap', async (t) => {
  // A directory the user may not write into: POSIX, and not as root (which can write anywhere).
  if (isWindows || (process.getuid && process.getuid() === 0)) { t.skip('needs a non-root POSIX user'); return; }
  const root = makeCheckout({}, t);
  mkdirSync(join(root, '.local', 'logs'), { recursive: true, mode: 0o700 });
  chmodSync(root, 0o555);
  try {
    const r = await runB01(ctxFor(root));
    assert.equal(r.status, 'warn', r.detail);
    assert.match(r.detail, /clients\/ could not be made \(EACCES\)/);
    assert.equal(r.data.clientsDir, 'not made');
  } finally {
    chmodSync(root, 0o755);
  }
});
