// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C303 — `ensureIntegrity` as root: it VERIFIES, and it never writes. The architect's ruling, 2026-11-19.
 *
 * A process that runs as root leaves root-owned files in the checkout and in the user's home folder, and the user's next run fails on them.
 * The integrity check is the one function the SessionStart hook, the MCP server, the package CLI and `./snowarch` all call, and it is the
 * one that writes the most: a verdict on a first verification, a lock, a restore from the tag (a `git checkout`), the replaced copies under
 * `.local/integrity-removed/`, an audit line. SKIPPING it as root would make `sudo claude` a way round the integrity door, so it is not
 * skipped. The rule is inside the function:
 *
 *   - a tree whose verdict is held, and whose covered files match it, is VERIFIED, and nothing is written;
 *   - whenever the function WOULD write — a first verdict, a verdict whose stamp moved, a restore, the lock, the audit line — it writes
 *     nothing and answers `refused`, whose reason says it runs as root and whose remedy is the root sentence
 *     (tools/snowarch/lib/root-guard.mjs). Every entrance turns that answer into its own refusal (the cases for them are in tests/integrity-elevated-entrances.test.mjs);
 *   - a development tree, a folder that is no checkout, a tree with no manifest: exactly what they were.
 *
 * The id is a seam on the options, `euid`, defaulting to the process's own; where there is no `geteuid` (Windows) nobody is root.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as integrity from '../../../packages/snowarch/dist/licence/integrity.js';
import { manifestFromArchive, signManifest, writeManifestCache } from '../lib/licence/manifest.mjs';
import { ELEVATED_REMEDY as ENGINE_REMEDY, elevatedSentence } from '../lib/root-guard.mjs';
import { changes, described, pretendRoot, snapshot } from '../../../tests/helpers/elevated.mjs';
import { keyPair, productKeys } from './helpers/licence.mjs';
import { tempDir } from './helpers/temp.mjs';
import { initFixtureRepo } from './helpers/fixture-git.mjs';

const { CANNOT_RESTORE_PREFIX, ensureIntegrity, lockPath, verdictPath } = integrity;

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const signer = keyPair();
const KEYS = productKeys(signer, keyPair());
const TAG = 'v9.1.0';
const NOW = () => new Date('2026-10-14T12:05:01.000Z');
const ROOT = 0;
const USER = 1000;

const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' }).trim();
const read = (root, rel) => readFileSync(join(root, ...rel.split('/')), 'utf8');
const put = (root, rel, text) => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), text); };

/** An engine checkout at release 9.1.0, tagged, its signed manifest held: what a user has after an install. */
function release(t, { cache = true } = {}) {
  const root = tempDir('snowarch-c303-', t);
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
  initFixtureRepo((args) => git(root, args), root, ['-q', '-b', 'main']);
  git(root, ['config', 'user.email', 'f@example.com']);
  git(root, ['config', 'user.name', 'f']);
  git(root, ['add', '-A']);
  git(root, ['commit', '-qm', 'the release']);
  git(root, ['tag', '-a', TAG, '-m', TAG]);
  git(root, ['checkout', '-q', TAG]);
  if (cache) {
    writeManifestCache(root, { tag: TAG, doc: signManifest(manifestFromArchive(root, TAG), signer.privateKey), checkedAt: NOW().toISOString(),
      source: 'fixture' });
  }
  return root;
}

/** The audit trail goes to a file of the case's own; a write to it would show as a new file in the case's folder. */
function audited(t) {
  const dir = tempDir('snowarch-c303-audit-', t);
  const was = process.env.SNOW_AUDIT_FILE;
  process.env.SNOW_AUDIT_FILE = join(dir, 'audit.jsonl');
  t.after(() => { if (was === undefined) delete process.env.SNOW_AUDIT_FILE; else process.env.SNOW_AUDIT_FILE = was; });
  return dir;
}

const ensure = (root, over = {}) => ensureIntegrity(root, { keys: KEYS, now: NOW, cli: '<cli>', ...over });

/** The sentence as the integrity line prints it: the engine holds a fragment, the line a sentence. */
const SENTENCE = () => elevatedSentence();

/** A user's own start: it records the verdict, which is what a checkout has by the time a root process meets it. */
function recorded(t) {
  const root = release(t);
  const first = ensure(root, { euid: USER });
  assert.equal(first.state, 'verified', 'the user\'s own start verifies the fixture');
  assert.ok(existsSync(verdictPath(root)), 'and records its verdict');
  return root;
}

const nothingWritten = (before, root, what = 'the case') => {
  assert.deepEqual(described(changes(before, snapshot(root))), [], `${what} wrote into the checkout`);
};

// ── the fixture can write: the cases below are not silent because nothing could be written ───────────────────────────

test('C303 — not root, the same tree records its verdict, and a changed file is put back: the fixture is one that shows a write', (t) => {
  audited(t);
  const root = release(t);
  const before = snapshot(root);
  assert.equal(ensure(root, { euid: USER }).state, 'verified');
  assert.ok(changes(before, snapshot(root)).added.includes('.local/integrity-verdict.json'), 'a user\'s first start writes the verdict');
  put(root, 'CLAUDE.md', '# edited\n');
  const restored = ensure(root, { euid: USER });
  assert.equal(restored.state, 'restored');
  assert.equal(read(root, 'CLAUDE.md'), '# The Architect\n');
});

// ── root: verified, and nothing written ──────────────────────────────────────────────────────────────────────────────

test('C303 — as root, a tree whose verdict is held and whose files match is verified, and nothing is written', (t) => {
  audited(t);
  const root = recorded(t);
  const before = snapshot(root);
  const quick = ensure(root, { euid: ROOT });
  assert.deepEqual([quick.state, quick.hashed], ['verified', 0], quick.line);
  // The server's start hashes every covered file whatever the verdict says: it must not rewrite a verdict that already holds.
  const full = ensure(root, { euid: ROOT, full: true });
  assert.equal(full.state, 'verified', full.line);
  assert.ok(full.hashed > 0, 'a full check hashes');
  nothingWritten(before, root, 'a root check of a verified tree');
});

// ── root: when it would write, it writes nothing and says so ──────────────────────────────────────────────────────────

test('C303 — as root, a tree with no verdict is not verified: the root sentence, and no verdict written', (t) => {
  audited(t);
  const root = release(t);
  const before = snapshot(root);
  const r = ensure(root, { euid: ROOT });
  assert.equal(r.state, 'refused', 'a root process cannot record the verdict, so it cannot say verified');
  assert.ok(r.line.startsWith(CANNOT_RESTORE_PREFIX), r.line);
  assert.match(r.reason, /^running as root: /);
  assert.equal(r.remedy, SENTENCE());
  assert.ok(r.line.endsWith(r.remedy), r.line);
  nothingWritten(before, root, 'a root check with no verdict');
  assert.equal(existsSync(verdictPath(root)), false);
});

test('C303 — as root, a verdict whose stamp moved is not rewritten: the tree is not verified', (t) => {
  audited(t);
  const root = recorded(t);
  const later = new Date('2030-01-01T00:00:00Z');
  utimesSync(join(root, 'CLAUDE.md'), later, later);
  const before = snapshot(root);
  const r = ensure(root, { euid: ROOT });
  assert.equal(r.state, 'refused', 'the bytes match, but recording the new stamp would write');
  assert.match(r.reason, /^running as root: /);
  nothingWritten(before, root, 'a root check of a moved stamp');
});

test('C303 — as root, a changed covered file is not restored: nothing is moved, locked, logged or checked out', (t) => {
  const dir = audited(t);
  const root = recorded(t);
  put(root, 'CLAUDE.md', '# edited\n');
  const before = snapshot(root);
  const r = ensure(root, { euid: ROOT });
  assert.equal(r.state, 'refused');
  assert.match(r.reason, /^running as root: 1 file differs from the signed manifest for v9\.1\.0, the first CLAUDE\.md/);
  assert.equal(r.remedy, SENTENCE());
  assert.equal(read(root, 'CLAUDE.md'), '# edited\n', 'the file was put back by a root process');
  nothingWritten(before, root, 'a root check of a changed file');
  assert.equal(existsSync(lockPath(root)), false, 'a lock was taken');
  assert.equal(existsSync(join(root, '.local', 'integrity-removed')), false, 'replaced copies were moved aside');
  assert.equal(existsSync(join(dir, 'audit.jsonl')), false, 'an audit line was written');
});

test('C303 — as root, a deleted covered file and a file the release does not ship are not put back or moved aside either', (t) => {
  audited(t);
  const root = recorded(t);
  rmSync(join(root, '.claude/agents/developer.md'));
  put(root, '.claude/skills/own/SKILL.md', 'a skill of the user\'s own\n');
  const before = snapshot(root);
  const r = ensure(root, { euid: ROOT });
  assert.equal(r.state, 'refused');
  assert.match(r.reason, /^running as root: 2 files differ from the signed manifest for v9\.1\.0/);
  assert.equal(existsSync(join(root, '.claude/agents/developer.md')), false);
  assert.equal(existsSync(join(root, '.claude/skills/own/SKILL.md')), true);
  nothingWritten(before, root, 'a root check of a deleted and an added file');
});

// ── root changes nothing about what is refused for another reason, or exempt ──────────────────────────────────────────

test('C303 — as root, a tree with no manifest is refused for that reason, as it is for anyone', (t) => {
  const root = release(t, { cache: false });
  const asUser = ensure(root, { euid: USER });
  const asRoot = ensure(root, { euid: ROOT });
  assert.equal(asRoot.state, 'refused');
  assert.equal(asRoot.reason, asUser.reason);
  assert.equal(asRoot.line, asUser.line);
});

test('C303 — as root, a development tree and a folder that is no checkout are exempt, as they are for anyone', (t) => {
  const dev = tempDir('snowarch-c303-dev-', t);
  put(dev, 'package.json', `${JSON.stringify({ name: 'f', version: '9.2.0-dev' })}\n`);
  put(dev, 'engine.config.json', '{}\n');
  put(dev, 'tools/snowarch/bin/snowarch.mjs', 'export {};\n');
  const none = tempDir('snowarch-c303-none-', t);
  const before = [snapshot(dev), snapshot(none)];
  assert.deepEqual([ensure(dev, { euid: ROOT }).state, ensure(dev, { euid: ROOT }).why], ['exempt', 'dev']);
  assert.deepEqual([ensure(none, { euid: ROOT }).state, ensure(none, { euid: ROOT }).why], ['exempt', 'not-engine']);
  nothingWritten(before[0], dev, 'a root check of a development tree');
  nothingWritten(before[1], none, 'a root check of a folder');
});

// ── the id ────────────────────────────────────────────────────────────────────────────────────────────────────────────

test('C303 — with no id passed, the check takes the process\'s own: root where geteuid says 0, nobody where there is no geteuid', (t) => {
  audited(t);
  const root = release(t);
  pretendRoot(t, ROOT);
  const before = snapshot(root);
  assert.equal(ensure(root).state, 'refused', 'a process that geteuid calls root is root');
  nothingWritten(before, root, 'a check by a process that says it is root');
  pretendRoot(t, null);
  assert.equal(ensure(root).state, 'verified', 'where geteuid does not exist (Windows) nobody is root, and the verdict is recorded');
  assert.ok(existsSync(verdictPath(root)));
});

test('C303 — the sentence the refusal ends with is the engine\'s: the package holds the same words as tools/snowarch/lib/root-guard.mjs', () => {
  assert.equal(typeof integrity.ELEVATED_REMEDY, 'string', 'the package exports the sentence');
  assert.ok(integrity.ELEVATED_REMEDY.length > 20, 'and it is a sentence');
  assert.equal(integrity.ELEVATED_REMEDY, ENGINE_REMEDY);
});
