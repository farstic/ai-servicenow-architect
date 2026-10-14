// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
import { execFileSync } from 'node:child_process';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { canonicalJson, fingerprint, LICENCE_FORMAT, LIST_FORMAT, type ProductKey } from '../../src/licence/core.js';
import { removeTempDir, trackTempDir } from '../helpers/server-child.js';
import { COVERAGE, MANIFEST_FORMAT } from '../../src/licence/integrity.js';

/**
 * ARC-11-C1 — keys, licences and lists made by the test that uses them. None is ever committed: the
 * shipped key list is the owner's two public keys, and a test injects its own.
 */
export interface Pair { publicKey: string; privateKey: string }

export function pair(): Pair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  };
}

export const keysOf = (primary: Pair, recovery: Pair): ProductKey[] => [
  { role: 'primary', fingerprint: fingerprint(primary.publicKey), publicKey: primary.publicKey },
  { role: 'recovery', fingerprint: fingerprint(recovery.publicKey), publicKey: recovery.publicKey },
];

/** A UTC date `days` from now, as YYYY-MM-DD. */
export const fromToday = (days: number, now = new Date()): string =>
  new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 10);

export const licence = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'LIC-2026-0002', licensee: 'Test Licensee', org: 'Test Org', scope: 'live', issued: '2026-01-15',
  valid_until: fromToday(365), issuer: 'Test Issuer', notes: '', ...over,
});

function signed(format: string, field: 'licence' | 'list' | 'manifest', body: unknown, key: Pair): string {
  const value = sign(null, Buffer.from(canonicalJson(body), 'utf8'), key.privateKey).toString('base64');
  return `${JSON.stringify({ format, [field]: body, signature: { alg: 'Ed25519', key: fingerprint(key.publicKey), value } }, null, 2)}\n`;
}

export const licenceText = (body: Record<string, unknown>, key: Pair): string => signed(LICENCE_FORMAT, 'licence', body, key);
export const listText = (version: number, revoked: unknown[], key: Pair): string =>
  signed(LIST_FORMAT, 'list', { version, revoked }, key);

/**
 * Every directory these fixtures make, until `removeFixtureDirs` removes it.
 *
 * `trackTempDir`'s exit handler is a backstop that a vitest worker does not reliably reach: the architect's
 * gate on #403 found 26 `snowarch-licence-*`, `snowarch-licence-repo-*` and `snowarch-gone-*` directories
 * left in the run's TMPDIR, where every PR since ARC-07-C43 had measured 0. So each suite that uses these
 * fixtures removes them in its own `afterEach`, which runs whether the case passed or failed.
 */
const made: string[] = [];

/** A temp directory with this product's prefix, removed by the next `removeFixtureDirs`. */
export function fixtureDir(prefix: string): string {
  const dir = trackTempDir(mkdtempSync(join(tmpdir(), prefix)));
  made.push(dir);
  return dir;
}

/** Remove every directory made since the last call. For `afterEach`. */
export function removeFixtureDirs(): void {
  for (const dir of made.splice(0)) removeTempDir(dir);
}

/** A checkout: a project directory with a `.local/`. */
export function checkout(prefix = 'snowarch-licence-'): string {
  const root = fixtureDir(prefix);
  mkdirSync(join(root, '.local'), { recursive: true });
  return root;
}

/** A bare repository standing in for the list repository; `files` null is a repository with no branch. */
export function listRepo(files: Record<string, string> | null): string {
  const base = fixtureDir('snowarch-licence-repo-');
  const bare = join(base, 'list.git');
  const env = { ...process.env, GIT_AUTHOR_NAME: 'fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
    GIT_COMMITTER_NAME: 'fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' };
  const git = (args: string[]): void => { execFileSync('git', args, { env, stdio: 'pipe' }); };
  git(['init', '-q', '--bare', '--initial-branch=main', bare]);
  if (files) {
    const work = join(base, 'work');
    git(['init', '-q', '--initial-branch=main', work]);
    for (const [path, content] of Object.entries(files)) writeFileSync(join(work, path), content);
    git(['-C', work, 'add', '-A']);
    git(['-C', work, 'commit', '-q', '--allow-empty', '-m', 'list']);
    git(['-C', work, 'push', '-q', bare, 'main']);
  }
  return pathToFileURL(bare).href;
}

/**
 * ARC-11-C141 — an engine checkout at a release, tagged, its signed manifest held: what a user has after an install.
 * The manifest hashes the bytes written here, which are the bytes the tag holds (`.gitattributes` is the repository's
 * own), so a fresh checkout verifies. `cache: false` leaves no manifest held; `key` signs it.
 */
export function releaseCheckout({ version = '9.1.0', key, cache = true }: { version?: string; key: Pair; cache?: boolean }): string {
  const root = fixtureDir('snowarch-integrity-');
  const files: Record<string, string> = {
    'package.json': `${JSON.stringify({ name: 'f', version })}\n`,
    'engine.config.json': '{}\n',
    'CLAUDE.md': '# signed\n',
    'tools/snowarch/bin/snowarch.mjs': 'export {};\n',
    '.claude/skills/s/SKILL.md': 'signed skill\n',
  };
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
  cpSync(join(repo, '.gitattributes'), join(root, '.gitattributes'));
  const git = (args: string[]): string => execFileSync('git', ['-c', 'user.email=f@example.invalid', '-c', 'user.name=f', ...args],
    { cwd: root, encoding: 'utf8', stdio: 'pipe' }).trim();
  const tag = `v${version}`;
  git(['init', '-q', '-b', 'main']);
  git(['add', '-A']);
  git(['commit', '-qm', 'the release']);
  git(['tag', '-a', tag, '-m', tag]);
  if (cache) {
    const covered = Object.keys(files).filter((p) => p !== 'package.json' || COVERAGE.covers.includes('package.json'));
    const manifest = {
      tag, commit: git(['rev-parse', 'HEAD']), covers: [...COVERAGE.covers], excludes: [...COVERAGE.excludes],
      ignores: [...COVERAGE.ignores],
      files: Object.fromEntries(covered.map((p) => [p, createHash('sha256').update(files[p]).digest('hex')])),
    };
    mkdirSync(join(root, '.local'), { recursive: true });
    writeFileSync(join(root, '.local', 'release-manifest.json'), `${JSON.stringify({ tag, checkedAt: '2026-10-14T12:00:00.000Z',
      source: 'fixture', doc: JSON.parse(signed(MANIFEST_FORMAT, 'manifest', manifest, key)) }, null, 2)}\n`);
  }
  return root;
}
