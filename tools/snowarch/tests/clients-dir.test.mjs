// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C265 — `clients/` exists after a bootstrap.
 *
 * The user types `Status` in a fresh install and the Architect looks for the engagement. A listing of a folder that is not there
 * prints `ls: clients: No such file or directory` before any engagement exists; an empty folder reads as "no engagement folder yet".
 * The bootstrap COMMAND makes it (clients-dir.mjs says why not a step), empty, only when nothing is there, and never touches what is.
 * This fixes the visible error, not the wording of the Status steps in CLAUDE.md, which waits for R6.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { bootstrapCommand } from '../lib/bootstrap.mjs';
import { CLIENTS_DIR, ensureClientsDir } from '../lib/clients-dir.mjs';
import { tempDir } from './helpers/temp.mjs';
import { initFixtureRepo } from './helpers/fixture-git.mjs';
import { makeCheckout, recorder } from './helpers/workspace.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const isWindows = process.platform === 'win32';
const sink = () => { const s = []; return { write: (x) => s.push(x), text: () => s.join('') }; };

/** A checkout that is a real git repository, because the bootstrap's root check asks git where the top is. */
function gitCheckout(t) {
  const root = makeCheckout({}, t);
  initFixtureRepo((args) => execFileSync('git', args, { cwd: root }), root, ['-q', '-b', 'main']);
  return root;
}

/** The probe stubbed at the command's seam, so nothing here opens a socket; `--docs skip`, because these fixtures have no upstream. */
const noNetwork = { probe: async () => ({ ok: true, status: 200, proxy: null }) };
const args = (root) => ({
  flags: { mode: 'design', yes: true, 'skip-claude-check': true, docs: 'skip' },
  log: recorder(), root, out: sink(), err: sink(),
});
const bootstrap = async (root) => {
  const a = args(root);
  const code = await bootstrapCommand({ ...a, cwd: root, ...noNetwork });
  return { code, lines: a.log.lines };
};

/** Every file under `dir`: its relative path and sha256, and the mtime of every directory, because a touched folder is a changed folder. */
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

test('ARC-09-C265 — a fresh install: the bootstrap makes clients/ empty, `ls clients` exits 0 with no output, and the run says so', async (t) => {
  const root = gitCheckout(t);
  assert.equal(existsSync(join(root, CLIENTS_DIR)), false, 'a fresh checkout has none');
  if (!isWindows) {
    // Before: the error the user saw.
    const before = spawnSync('ls', [CLIENTS_DIR], { cwd: root, encoding: 'utf8' });
    assert.notEqual(before.status, 0);
    assert.match(before.stderr, /clients.*No such file or directory/);
  }

  const { code, lines } = await bootstrap(root);
  assert.equal(code, 0, lines.join('\n'));
  assert.deepEqual(lines.filter((l) => l.startsWith('clients/')), ['clients/ made, empty: it is yours, and git ignores it']);
  assert.deepEqual(readdirSync(join(root, CLIENTS_DIR)), [], 'empty');
  if (!isWindows) {
    const after = spawnSync('ls', [CLIENTS_DIR], { cwd: root, encoding: 'utf8' });
    assert.equal(after.status, 0, after.stderr);
    assert.equal(after.stdout, '');
    assert.equal(after.stderr, '');
  }
  assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).includes('clients'), false,
    'an empty folder is no change for git');

  // The second run finds it and says nothing more about it.
  const again = await bootstrap(root);
  assert.equal(again.code, 0, again.lines.join('\n'));
  assert.deepEqual(again.lines.filter((l) => l.startsWith('clients/')), []);
});

test("ARC-09-C265 — the repository ignores clients/: what is in it is a client's work and stays on the machine", () => {
  const r = spawnSync('git', ['check-ignore', '-q', `${CLIENTS_DIR}/acme/notes.md`], { cwd: REPO });
  assert.equal(r.status, 0, 'git does not ignore clients/');
});

test('ARC-09-C265 — an existing clients/ with content is left byte-identical by a whole bootstrap, its folders\' mtimes included', async (t) => {
  const root = gitCheckout(t);
  const dir = join(root, CLIENTS_DIR);
  mkdirSync(join(dir, 'acme', 'designs'), { recursive: true });
  writeFileSync(join(dir, 'acme', 'acme-engagement-state.md'), '# acme\n');
  writeFileSync(join(dir, 'acme', 'designs', 'hld.md'), 'line one\r\nline two\n');
  writeFileSync(join(dir, 'acme', 'designs', 'blob.bin'), Buffer.from([0, 255, 10, 13, 128]));
  const before = digestOf(dir);

  const { code, lines } = await bootstrap(root);
  assert.equal(code, 0, lines.join('\n'));
  assert.deepEqual(lines.filter((l) => l.startsWith('clients/')), [], 'nothing was made, so nothing is said');
  assert.deepEqual(digestOf(dir), before);
});

test('ARC-09-C265 — an install made before this release gets the folder at its next bootstrap, and no step goes stale for it', async (t) => {
  const root = gitCheckout(t);
  assert.equal((await bootstrap(root)).code, 0);
  // The install as an older release left it: every step recorded, no clients/.
  rmSync(join(root, CLIENTS_DIR), { recursive: true, force: true });
  assert.equal(existsSync(join(root, CLIENTS_DIR)), false);

  const next = await bootstrap(root);
  assert.equal(next.code, 0, next.lines.join('\n'));
  assert.ok(existsSync(join(root, CLIENTS_DIR)), 'the next bootstrap made it');
  assert.deepEqual(readdirSync(join(root, CLIENTS_DIR)), []);
  // ...and nothing was re-run to get there: B01 fetches the release manifest when it runs, so a step made stale for this folder would
  // send every older install to the network once more (the upgrade-licence case "a held manifest is not fetched again" holds it).
  assert.ok(next.lines.some((l) => /\[B01\/09\] workspace … ok \(cached\)/.test(l)), next.lines.join('\n'));
  assert.ok(next.lines.some((l) => /\[B07\/09\] Claude settings … ok \(cached\)/.test(l)), next.lines.join('\n'));
});

test('ARC-09-C265 — what the user put there instead is theirs: a file, a link, a link that leads nowhere', (t) => {
  // A file called clients: left alone.
  const withFile = makeCheckout({}, t);
  writeFileSync(join(withFile, CLIENTS_DIR), 'mine\n');
  assert.deepEqual(ensureClientsDir(withFile), { existed: true, error: null });
  assert.equal(readFileSync(join(withFile, CLIENTS_DIR), 'utf8'), 'mine\n');

  if (isWindows) return;   // a symbolic link needs a privilege there, and what is proved above does not depend on it
  const elsewhere = tempDir('snowarch-clients-elsewhere-', t);
  const withLink = makeCheckout({}, t);
  symlinkSync(elsewhere, join(withLink, CLIENTS_DIR));
  assert.deepEqual(ensureClientsDir(withLink), { existed: true, error: null });
  assert.equal(lstatSync(join(withLink, CLIENTS_DIR)).isSymbolicLink(), true);
  assert.deepEqual(readdirSync(elsewhere), [], 'nothing was written through the link');

  const dangling = makeCheckout({}, t);
  symlinkSync(join(elsewhere, 'gone'), join(dangling, CLIENTS_DIR));
  assert.deepEqual(ensureClientsDir(dangling), { existed: true, error: null });
  assert.equal(lstatSync(join(dangling, CLIENTS_DIR)).isSymbolicLink(), true, 'a dangling link is left as it was');
  assert.equal(existsSync(join(elsewhere, 'gone')), false);
});

test('ARC-09-C265 — a folder that cannot be made is reported with its reason, and the bootstrap goes on', async (t) => {
  // By the function: the root is a FILE, so nothing can be made under it, on every platform and whoever runs the test.
  const dir = tempDir('snowarch-clients-root-', t);
  const notADirectory = join(dir, 'file');
  writeFileSync(notADirectory, 'x');
  const r = ensureClientsDir(notADirectory);
  assert.equal(r.existed, false);
  assert.match(String(r.error), /ENOTDIR|ENOENT|EEXIST/);

  // By the command: a directory the user may not write into (POSIX, and not as root, which can write anywhere), after `.local/` exists.
  if (isWindows || (process.getuid && process.getuid() === 0)) { t.skip('needs a non-root POSIX user'); return; }
  const root = gitCheckout(t);
  mkdirSync(join(root, '.local', 'logs'), { recursive: true, mode: 0o700 });
  chmodSync(root, 0o555);
  try {
    const { lines } = await bootstrap(root);
    assert.ok(lines.some((l) => /^WARN clients\/ could not be made \(EACCES\)/.test(l)), lines.join('\n'));
  } finally {
    chmodSync(root, 0o755);
  }
});
