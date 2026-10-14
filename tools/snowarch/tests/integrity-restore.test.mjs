// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-11-C141 — restore and continue (the owner's ruling, 2026-10-14; the architect's R1–R8).
 *
 * A licensed user may not change the AI Architect's own files, and keeps using it: the change does not take effect.
 * `ensureIntegrity` puts the signed files back from the release's tag, moves what the release does not ship to
 * `.local/integrity-removed/<UTC stamp>/` with the replaced copies, says so in one line, and continues as verified.
 * It refuses only when it cannot restore.
 *
 * Against a real repository with a real tag, signed with a key made for the run: every restore here is a real
 * `git checkout`, and every refusal a real git answer.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  chmodSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, unlinkSync, utimesSync, writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CANNOT_RESTORE_PREFIX, RESTORED_PREFIX, ensureIntegrity, lockPath, verdictPath,
} from '../../../packages/snowarch/dist/licence/integrity.js';
import { manifestFromArchive, signManifest, writeManifestCache } from '../lib/licence/manifest.mjs';
import { keyPair, productKeys } from './helpers/licence.mjs';
import { tempDir } from './helpers/temp.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const isWindows = process.platform === 'win32';
const signer = keyPair();
const KEYS = productKeys(signer, keyPair());
const TAG = 'v9.1.0';
const NOW = () => new Date('2026-10-14T12:05:01.000Z');
const STAMP = '20261014T120501Z';

const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' }).trim();
const read = (root, rel) => readFileSync(join(root, ...rel.split('/')), 'utf8');
const put = (root, rel, text) => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), text); };

/**
 * An engine checkout at release 9.1.0, tagged, its signed manifest held: what a user has after an install.
 * `signedBy` and `manifestOver` make the refusals: a key the product does not ship, another release's body.
 */
function release(t, { signedBy = signer, manifestOver = {}, cache = true } = {}) {
  const root = tempDir('snowarch-c141-', t);
  const files = {
    'package.json': `${JSON.stringify({ name: 'f', version: '9.1.0' }, null, 2)}\n`,
    'engine.config.json': '{}\n',
    'CLAUDE.md': '# The Architect\n',
    'tools/snowarch/bin/snowarch.mjs': 'export {};\n',
    '.claude/settings.json': '{}\n',
    '.claude/skills/itsm-specialist/SKILL.md': 'the signed skill\n',
    '.claude/agents/developer.md': 'the signed agent\n',
  };
  for (const [rel, text] of Object.entries(files)) put(root, rel, text);
  cpSync(join(REPO, '.gitattributes'), join(root, '.gitattributes'));
  git(root, ['init', '-q', '-b', 'main']);
  git(root, ['config', 'user.email', 'f@example.com']);
  git(root, ['config', 'user.name', 'f']);
  git(root, ['add', '-A']);
  git(root, ['commit', '-qm', 'the release']);
  git(root, ['tag', '-a', TAG, '-m', TAG]);
  git(root, ['checkout', '-q', TAG]);
  if (cache) {
    const manifest = { ...manifestFromArchive(root, TAG), ...manifestOver };
    writeManifestCache(root, { tag: TAG, doc: signManifest(manifest, signedBy.privateKey), checkedAt: NOW().toISOString(),
      source: 'fixture' });
  }
  return root;
}

/** The audit trail goes to a file of the case's own, never beside a store on this machine. */
function audited(t) {
  const file = join(tempDir('snowarch-c141-audit-', t), 'audit.jsonl');
  const was = process.env.SNOW_AUDIT_FILE;
  process.env.SNOW_AUDIT_FILE = file;
  t.after(() => { if (was === undefined) delete process.env.SNOW_AUDIT_FILE; else process.env.SNOW_AUDIT_FILE = was; });
  return () => (existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []);
}

const ensure = (root, over = {}) => ensureIntegrity(root, { keys: KEYS, now: NOW, cli: '<cli>', ...over });

// ── verified: nothing to do, and the stat key keeps it cheap ─────────────────────────────────────────────────────

test('C141 — a tree as signed is verified, and the next run says so from stat alone, hashing nothing', (t) => {
  const root = release(t);
  const first = ensure(root);
  assert.equal(first.state, 'verified');
  assert.ok(first.hashed > 0, 'the first run had no verdict, so it hashed');
  assert.ok(existsSync(verdictPath(root)), 'a verified tree records its verdict');
  const second = ensure(root);
  assert.deepEqual([second.state, second.hashed], ['verified', 0]);
  // A full check (the server's start, doctor, status) hashes everything whatever the verdict says.
  assert.ok(ensure(root, { full: true }).hashed > 0);
});

test('C141 — a stamp that moved with the bytes unchanged re-hashes that one file, and stays verified', (t) => {
  const root = release(t);
  ensure(root);
  const p = join(root, 'CLAUDE.md');
  utimesSync(p, new Date('2030-01-01T00:00:00Z'), new Date('2030-01-01T00:00:00Z'));
  const r = ensure(root);
  assert.deepEqual([r.state, r.hashed], ['verified', 1]);
});

// ── restored: the change does not take effect, and the run continues ──────────────────────────────────────────────

test('C141 — an edited skill and an added one: the signed skill is restored, the extra moved, both kept, one line', (t) => {
  const trail = audited(t);
  const root = release(t);
  ensure(root);
  put(root, '.claude/skills/itsm-specialist/SKILL.md', 'my edit\n');
  put(root, '.claude/skills/my-skill/SKILL.md', 'my own skill\n');
  const r = ensure(root, { projectDir: root });
  assert.equal(r.state, 'restored', r.line);
  assert.deepEqual([r.restored, r.moved], [['.claude/skills/itsm-specialist/SKILL.md'], ['.claude/skills/my-skill/SKILL.md']]);
  assert.equal(r.line, `${RESTORED_PREFIX}The AI Architect's own files are not yours to change under this licence: `
    + `1 file restored from ${TAG}, 1 moved to .local/integrity-removed/${STAMP}/ (.claude/skills/itsm-specialist/SKILL.md). `
    + 'Your own material belongs under clients/<name>/.');
  assert.equal(r.claudeChanged, true);
  // The signed bytes are back; the user's edit and the user's skill are kept, not deleted.
  assert.equal(read(root, '.claude/skills/itsm-specialist/SKILL.md'), 'the signed skill\n');
  assert.equal(existsSync(join(root, '.claude/skills/my-skill')), false, 'the emptied skill folder was left behind');
  const kept = join(root, '.local', 'integrity-removed', STAMP);
  assert.equal(read(kept, '.claude/skills/itsm-specialist/SKILL.md'), 'my edit\n');
  assert.equal(read(kept, '.claude/skills/my-skill/SKILL.md'), 'my own skill\n');
  // Verified now, from the stat key, and the work tree is clean: the checkout is at the tag.
  assert.deepEqual([ensure(root).state, ensure(root).hashed], ['verified', 0]);
  assert.equal(git(root, ['status', '--porcelain', '--', '.claude']), '');
  // One audit line, paths only.
  assert.deepEqual(trail().map(({ ts, ...rest }) => rest), [{ gate: 'integrity', action: 'restored', tag: TAG,
    files: ['.claude/skills/itsm-specialist/SKILL.md'], moved: ['.claude/skills/my-skill/SKILL.md'],
    folder: `.local/integrity-removed/${STAMP}` }]);
});

test('C141 — a deleted core file is put back; nothing is moved', (t) => {
  audited(t);
  const root = release(t);
  unlinkSync(join(root, 'CLAUDE.md'));
  const r = ensure(root);
  assert.equal(r.state, 'restored', r.line);
  assert.deepEqual([r.restored, r.moved], [['CLAUDE.md'], []]);
  assert.equal(read(root, 'CLAUDE.md'), '# The Architect\n');
});

test('C141 — a change the user committed is overruled all the same, and the line says the restore is staged (R2)', (t) => {
  audited(t);
  const root = release(t);
  git(root, ['checkout', '-q', '-b', 'mine']);
  put(root, '.claude/agents/developer.md', 'my committed agent\n');
  git(root, ['commit', '-qam', 'my change']);
  const r = ensure(root);
  assert.equal(r.state, 'restored', r.line);
  assert.equal(r.staged, true);
  assert.match(r.line, /1 file restored from v9\.1\.0 \(staged\), 0 moved to/);
  assert.equal(read(root, '.claude/agents/developer.md'), 'the signed agent\n');
});

test('C141 — with restore off (a report), the change is named and nothing is touched', (t) => {
  const root = release(t);
  put(root, 'CLAUDE.md', 'edited\n');
  const r = ensure(root, { restore: false });
  assert.equal(r.state, 'refused');
  assert.equal(read(root, 'CLAUDE.md'), 'edited\n');
});

// ── refused: only when it cannot be restored ─────────────────────────────────────────────────────────────────────

test('C141 — no manifest held, one that does not verify, or another release\'s: refused with the remedy, nothing touched', (t) => {
  const missing = release(t, { cache: false });
  const forged = release(t, { signedBy: keyPair() });
  const other = release(t, { manifestOver: { tag: 'v9.0.0' } });
  for (const root of [missing, forged, other]) put(root, 'CLAUDE.md', 'edited\n');
  const [m, f, o] = [missing, forged, other].map((root) => ensure(root));
  assert.equal(m.line, `${CANNOT_RESTORE_PREFIX}no signed manifest for ${TAG} — Run <cli> licence check --refresh to fetch it; `
    + 'if it says none is published, reinstall from a signed release tag.');
  assert.equal(f.line, `${CANNOT_RESTORE_PREFIX}the signed manifest for ${TAG} does not verify (not signed by a key this product ships) — `
    + 'Run <cli> licence check --refresh to fetch it; if it says none is published, reinstall from a signed release tag.');
  assert.equal(o.line, `${CANNOT_RESTORE_PREFIX}the signed manifest is for v9.0.0, this checkout is ${TAG} — Reinstall from a signed release tag.`);
  for (const root of [missing, forged, other]) assert.equal(read(root, 'CLAUDE.md'), 'edited\n');
});

test('C141 — no tag to restore from (a download): refused, nothing moved', (t) => {
  const root = release(t);
  git(root, ['checkout', '-q', '--detach']);
  git(root, ['tag', '-d', TAG]);
  put(root, '.claude/skills/my-skill/SKILL.md', 'mine\n');
  const r = ensure(root);
  assert.equal(r.line, `${CANNOT_RESTORE_PREFIX}this checkout holds no ${TAG} tag to restore from — Reinstall from a signed release tag.`);
  assert.equal(read(root, '.claude/skills/my-skill/SKILL.md'), 'mine\n');
  assert.equal(existsSync(join(root, '.local', 'integrity-removed')), false);
});

test('C141 — a tag moved to another commit is another release: refused, nothing restored from it', (t) => {
  const root = release(t);
  git(root, ['checkout', '-q', '-b', 'mine']);
  put(root, 'CLAUDE.md', 'my architect\n');
  git(root, ['commit', '-qam', 'mine']);
  git(root, ['tag', '-f', '-a', TAG, '-m', 'moved']);
  const r = ensure(root);
  assert.equal(r.state, 'refused');
  assert.match(r.line, /^Integrity: cannot restore — the signed manifest for v9\.1\.0 names commit [0-9a-f]{7}, and this checkout's v9\.1\.0 names [0-9a-f]{7} — Reinstall from a signed release tag\.$/);
  assert.equal(read(root, 'CLAUDE.md'), 'my architect\n');
});

test('C141 — git cannot restore (its index is locked): refused with git\'s reason, nothing moved, no folder left (R3)', (t) => {
  const root = release(t);
  put(root, 'CLAUDE.md', 'edited\n');
  put(root, '.claude/skills/my-skill/SKILL.md', 'mine\n');
  writeFileSync(join(root, '.git', 'index.lock'), '');
  const r = ensure(root);
  assert.equal(r.state, 'refused');
  assert.match(r.line, /^Integrity: cannot restore — git could not restore 1 file: .*index\.lock.* — Fix what it names, then run <cli> doctor --fix; or reinstall from a signed release tag\.$/);
  assert.equal(read(root, 'CLAUDE.md'), 'edited\n');
  assert.equal(read(root, '.claude/skills/my-skill/SKILL.md'), 'mine\n');
  assert.equal(existsSync(join(root, '.local', 'integrity-removed', STAMP)), false);
});

test('C141 — an extra that cannot be moved refuses with the reason', { skip: isWindows ? 'POSIX modes make the unmovable file here' : false }, (t) => {
  const root = release(t);
  put(root, '.claude/skills/my-skill/SKILL.md', 'mine\n');
  const dir = join(root, '.claude/skills/my-skill');
  chmodSync(dir, 0o555);
  t.after(() => chmodSync(dir, 0o755));
  const r = ensure(root);
  assert.equal(r.state, 'refused');
  assert.match(r.line, /^Integrity: cannot restore — \.claude\/skills\/my-skill\/SKILL\.md could not be moved to \.local\/integrity-removed\/20261014T120501Z\/ \(EACCES\) — /);
});

test('C141 — a covered folder linked from outside the checkout is never written through: refused, the outside untouched', { skip: isWindows ? 'a directory link needs privileges on Windows' : false }, (t) => {
  const root = release(t);
  const outside = tempDir('snowarch-c141-outside-', t);
  put(outside, 'their-skill/SKILL.md', 'not this checkout\'s\n');
  rmSync(join(root, '.claude', 'skills'), { recursive: true, force: true });
  symlinkSync(outside, join(root, '.claude', 'skills'), 'dir');
  const r = ensure(root);
  assert.equal(r.state, 'refused', r.line);
  assert.match(r.line, /^Integrity: cannot restore — \.claude\/skills\/\S+ is reached through a link that leaves this checkout, so nothing was restored — /);
  assert.equal(read(outside, 'their-skill/SKILL.md'), 'not this checkout\'s\n');
  assert.equal(existsSync(join(root, '.local', 'integrity-removed')), false);
});

// ── the lock (R1) ────────────────────────────────────────────────────────────────────────────────────────────────

test('C141 — a live lock: the second process waits, finds no restore done, and refuses naming the lock', (t) => {
  const root = release(t);
  put(root, 'CLAUDE.md', 'edited\n');
  mkdirSync(join(root, '.local'), { recursive: true });
  writeFileSync(lockPath(root), `${JSON.stringify({ pid: 1, at: NOW().toISOString() })}\n`);
  const started = Date.now();
  const r = ensure(root);
  assert.ok(Date.now() - started >= 1_900, 'it did not wait for the holder');
  assert.equal(r.line, `${CANNOT_RESTORE_PREFIX}another snowarch process is restoring this checkout (.local/integrity.lock) — `
    + 'Fix what it names, then run <cli> doctor --fix; or reinstall from a signed release tag.');
  assert.equal(read(root, 'CLAUDE.md'), 'edited\n');
});

test('C141 — a stale lock (older than 30 s) is a dead holder\'s: taken over, and the restore goes ahead', (t) => {
  audited(t);
  const root = release(t);
  put(root, 'CLAUDE.md', 'edited\n');
  mkdirSync(join(root, '.local'), { recursive: true });
  writeFileSync(lockPath(root), `${JSON.stringify({ pid: 1, at: '2026-10-14T12:04:00.000Z' })}\n`);
  const r = ensure(root);
  assert.equal(r.state, 'restored', r.line);
  assert.equal(existsSync(lockPath(root)), false, 'the lock was not released');
});

// ── exempt ───────────────────────────────────────────────────────────────────────────────────────────────────────

test('C141 — a development tree, or a folder that is not an engine checkout, is not checked', (t) => {
  const dev = release(t);
  put(dev, 'package.json', `${JSON.stringify({ name: 'f', version: '9.1.0-dev' })}\n`);
  assert.deepEqual([ensure(dev).state, ensure(dev).why], ['exempt', 'dev']);
  const elsewhere = tempDir('snowarch-c141-not-engine-', t);
  const r = ensure(elsewhere);
  assert.deepEqual([r.state, r.why, r.line], ['exempt', 'not-engine', 'Integrity: not checked — not an engine checkout']);
  assert.deepEqual(readdirSync(elsewhere), [], 'it wrote into a folder that is not a checkout');
  rmSync(elsewhere, { recursive: true, force: true });
});
