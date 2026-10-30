// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C146 — the suite on a release-versioned tree. A release writes its version, then runs `npm test` before it
 * commits; from C141 every launcher start on that tree asked for a signed manifest no state root held, and the rc.2
 * cut refused 34 cases. `licensedEnv` now seeds the state root it makes with a manifest of the checkout, so these cases
 * run the class on every push, on a scratch copy at 0.0.0-rc.1, rather than waiting for the next cut (one tagged copy
 * per process, and a clone of it per case, ARC-09-C147):
 * - the seeded state root lets the launcher run, and `status` reads the tree as verified; the control, in the same
 *   case, is the same start with the seeded manifest removed, refused;
 * - with a commit past the tag, the copy still verifies: the manifest names the tag's commit, as the product compares;
 * - a manifest gone stale restores the scratch copy it was made from, never the real checkout;
 * - the test file's `useStateRoot()` directory, where 31 of the 34 ran, is seeded, and a case's own root beside it is not;
 * - `checkout` hashes another tree and never seeds a root of the caller's, and a development tree named as one throws.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { COVERAGE } from '../lib/licence/manifest.mjs';
import { licensedEnv } from './helpers/licence-hook/index.mjs';
import { useStateRoot } from './helpers/state-root.mjs';
import { tempDir } from './helpers/temp.mjs';
import { initFixtureRepo } from './helpers/fixture-git.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const VERSION = '0.0.0-rc.1';
const BIN = join('tools', 'snowarch', 'bin', 'snowarch.mjs');

const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' }).trim();
const by = ['-c', 'user.email=f@example.com', '-c', 'user.name=f'];

/** The inherited environment without anything that decides where a child reads its licence, state or audit. */
function cleanEnv(t) {
  const env = { ...process.env };
  for (const k of ['NODE_OPTIONS', 'SNOW_LICENCE_ENFORCE', 'SNOW_STORE', 'SNOW_ENV_FILE', 'CLAUDE_PROJECT_DIR',
    'SNOWARCH_STATE_ROOT']) delete env[k];
  // A restore writes one audit line: to a file of the case's own, never a global one on this machine.
  return { ...env, SNOW_AUDIT_FILE: join(tempDir('snowarch-c146-audit-', t), 'audit.jsonl') };
}

/** What the copy leaves out: the corpus, the documentation, and what the coverage itself leaves out. */
const LEFT_OUT = ['vendor/ServiceNowDocs', 'docs/', ...COVERAGE.excludes];

let base = null;

/**
 * The scratch engine checkout at 0.0.0-rc.1, committed and tagged, made once per process: this checkout's files as
 * they are on disk, tracked and not ignored (the engine reads well beyond what the manifest covers), less LEFT_OUT.
 * ARC-09-C147: copying and committing some 1,100 files once per case cost 60 to 110 seconds a Windows cell.
 */
function releaseBase() {
  if (base) return base;
  const root = tempDir('snowarch-c146-base-');
  const files = git(REPO, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']).split('\0').filter(Boolean);
  for (const rel of new Set(files)) {
    if (rel === 'package.json' || LEFT_OUT.some((p) => rel === p || rel.startsWith(p))) continue;
    const from = join(REPO, ...rel.split('/'));
    if (!existsSync(from)) continue;
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    copyFileSync(from, join(root, ...rel.split('/')));
  }
  const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'));
  writeFileSync(join(root, 'package.json'), `${JSON.stringify({ ...pkg, version: VERSION }, null, 2)}\n`);
  initFixtureRepo((args) => git(root, args), root, ['-q', '-b', 'main']);
  git(root, [...by, 'add', '-A']);
  git(root, [...by, 'commit', '-qm', 'release']);
  git(root, [...by, 'tag', '-a', `v${VERSION}`, '-m', `v${VERSION}`]);
  // A clone carries only what is committed, so every copied file must be: none left untracked or ignored. This guard is
  // the only witness: a clone that lacks a covered file still verifies, because its manifest is hashed from that clone.
  assert.equal(git(root, ['status', '--porcelain', '--ignored']), '', 'a copied file is not committed, so a clone lacks it');
  base = root;
  return base;
}

/**
 * A case's own scratch checkout: a local clone of the base, its objects linked, its working tree fresh, its tag with
 * it. What one case changes, no other case sees.
 */
function releaseCopy(t) {
  const root = tempDir('snowarch-c146-', t);
  execFileSync('git', ['clone', '--local', '--quiet', releaseBase(), root], { stdio: 'pipe' });
  return root;
}

const launch = (root, args, env) => spawnSync(process.execPath, [join(root, BIN), ...args],
  { encoding: 'utf8', cwd: root, env, timeout: 120_000 });
const RECIPE = ['docs', 'sync', '--print-recipe', '--mode', 'sparse'];

/** `git status` of what a restore could touch: the paths the manifest covers. Another file's churn is not this case's. */
const covered = (root) => git(root, ['status', '--porcelain', '--', ...COVERAGE.covers]);

/** What `.local/integrity-removed/` holds under `root`, or nothing. */
function removedAt(root) {
  const dir = join(root, '.local', 'integrity-removed');
  return existsSync(dir) ? readdirSync(dir).sort() : [];
}

test('ARC-09-C146 — a release-versioned copy runs under the state root licensedEnv seeds, and refuses without its manifest', (t) => {
  const root = releaseCopy(t);
  const env = licensedEnv(cleanEnv(t), { checkout: root });

  const docs = launch(root, RECIPE, env);
  assert.equal(docs.status, 0, `${docs.stdout}${docs.stderr}`);
  const status = launch(root, ['status'], env);
  assert.match(`${status.stdout}`, new RegExp(`Integrity: verified · v${VERSION.replace(/\./g, '\\.')} · \\d+ files`),
    `${status.stdout}${status.stderr}`);

  // The control: the same start, the seeded manifest removed. What made it run was the manifest, not the tree.
  rmSync(join(env.SNOWARCH_STATE_ROOT, '.local', 'release-manifest.json'));
  const refused = launch(root, RECIPE, env);
  assert.equal(refused.status, 3, `${refused.stdout}${refused.stderr}`);
  assert.match(refused.stderr, new RegExp(`^Integrity: cannot restore — no signed manifest for v${VERSION.replace(/\./g, '\\.')} — `, 'm'));
});

test('ARC-09-C146 — with a commit past the tag, the manifest names the tag\'s commit, which is what the product compares', (t) => {
  // The product compares the manifest's commit to the tag's, never to HEAD (integrity.ts:282-285). Everywhere else
  // in this file HEAD is the tag, so only this case sees a fixture that named HEAD instead.
  const root = releaseCopy(t);
  writeFileSync(join(root, 'tests', 'after-the-tag.txt'), 'a commit past the tag, outside what the manifest covers\n');
  git(root, [...by, 'add', '-A']);
  git(root, [...by, 'commit', '-qm', 'after the tag']);
  assert.notEqual(git(root, ['rev-parse', 'HEAD']), git(root, ['rev-parse', `v${VERSION}^{commit}`]));
  const env = licensedEnv(cleanEnv(t), { checkout: root });

  const docs = launch(root, RECIPE, env);
  assert.equal(docs.status, 0, `${docs.stdout}${docs.stderr}`);
  const status = launch(root, ['status'], env);
  assert.match(`${status.stdout}`, new RegExp(`Integrity: verified · v${VERSION.replace(/\./g, '\\.')} · \\d+ files`),
    `${status.stdout}${status.stderr}`);
});

test('ARC-09-C146 — a manifest made before a change restores the copy it was made from, never the real checkout', (t) => {
  const before = { status: covered(REPO), removed: removedAt(REPO) };
  const root = releaseCopy(t);
  const skill = join(root, '.claude', 'skills', 'itsm-specialist', 'SKILL.md');
  const signed = readFileSync(skill);
  licensedEnv(cleanEnv(t), { checkout: root });
  // Changed after the fixture was made: the next state root is seeded with the manifest made before the change.
  appendFileSync(skill, 'changed after the fixture was made\n');
  const env = licensedEnv(cleanEnv(t), { checkout: root });

  const r = launch(root, RECIPE, env);
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
  assert.match(r.stderr, new RegExp(`^Integrity: restored — .*1 file restored from v${VERSION.replace(/\./g, '\\.')}`, 'm'));
  assert.deepEqual(readFileSync(skill), signed, 'the scratch copy was not put back');
  assert.ok(removedAt(env.SNOWARCH_STATE_ROOT).length > 0, 'the replaced copy was not kept under the state root');
  assert.deepEqual({ status: covered(REPO), removed: removedAt(REPO) }, before,
    'a test restored or moved something in the real checkout');
});

test('ARC-09-C146 — the test file\'s useStateRoot() directory is seeded, and a case\'s own root beside it never is', (t) => {
  const root = releaseCopy(t);
  // The suites that run the launcher set it at import (ARC-07-C43), and their cases pass process.env on.
  const suite = useStateRoot();
  const env = licensedEnv({ ...cleanEnv(t), SNOWARCH_STATE_ROOT: suite }, { checkout: root });
  const r = launch(root, RECIPE, env);
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
  assert.equal(existsSync(join(suite, '.local', 'release-manifest.json')), true);

  // A root that merely differs from it, while it is in use, is a case's own: never seeded.
  const own = tempDir('snowarch-c146-own-', t);
  assert.throws(() => licensedEnv({ ...cleanEnv(t), SNOWARCH_STATE_ROOT: own }, { checkout: root }),
    /a root of the caller's is never seeded/);
  assert.equal(existsSync(join(own, '.local', 'release-manifest.json')), false);
});

test('ARC-09-C146 — checkout hashes another tree, never seeds a root of the caller\'s, and refuses a development one', (t) => {
  const release = tempDir('snowarch-c146-bound-', t);
  writeFileSync(join(release, 'package.json'), `${JSON.stringify({ name: 'f', version: VERSION })}\n`);
  const own = tempDir('snowarch-c146-own-', t);
  assert.throws(() => licensedEnv(cleanEnv(t), { checkout: release, root: own }), /a root of the caller's is never seeded/);
  assert.throws(() => licensedEnv({ ...cleanEnv(t), SNOWARCH_STATE_ROOT: own }, { checkout: release }),
    /a root of the caller's is never seeded/);
  assert.throws(() => licensedEnv({ ...cleanEnv(t), CLAUDE_PROJECT_DIR: own }, { checkout: release }),
    /a root of the caller's is never seeded/);
  assert.throws(() => licensedEnv(cleanEnv(t), { checkout: release, licence: false }), /licence: false makes none/);
  assert.equal(existsSync(join(own, '.local', 'release-manifest.json')), false);

  const dev = tempDir('snowarch-c146-dev-', t);
  writeFileSync(join(dev, 'package.json'), `${JSON.stringify({ name: 'f', version: '0.0.0-dev' })}\n`);
  assert.throws(() => licensedEnv(cleanEnv(t), { checkout: dev }), /is not a release version/);
});
