// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-11-C1 — keys and licences made by the test that uses them.
 *
 * Nothing here is ever a committed key. The shipped key list is the owner's two public keys and
 * nothing else (`licence-keys-guard.test.mjs`), so every test generates its own pairs and INJECTS
 * them as the product's list. A test that signed with a key from the repository would pass against
 * a product that trusted that key, which is the one product this must never be.
 *
 * A helper rather than exports from a test file: `node --test` runs every test a file registers, so
 * a test file that another test imports runs its own cases twice.
 */
import { execFileSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { fingerprint, signLicence, signList } from '../../lib/licence/core.mjs';
import { COVERAGE, signManifest } from '../../lib/licence/manifest.mjs';
import { tempDir } from './temp.mjs';
import { initFixtureRepo } from './fixture-git.mjs';

/** A fresh Ed25519 pair, as PEM, the shape `licence keygen` writes. */
export function keyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }),
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  };
}

/** The key list a release would ship, built from two pairs. */
export const productKeys = (primary, recovery) => [
  { role: 'primary', fingerprint: fingerprint(primary.publicKey), publicKey: primary.publicKey },
  { role: 'recovery', fingerprint: fingerprint(recovery.publicKey), publicKey: recovery.publicKey },
];

/** A licence payload with every field, `over` replacing any of them. */
export const licence = (over = {}) => ({
  id: 'LIC-2026-0002',
  licensee: 'Test Licensee',
  org: 'Test Org',
  scope: 'live',
  issued: '2026-01-15',
  valid_until: '2027-10-10',
  issuer: 'Test Issuer',
  notes: '',
  ...over,
});

/** A licence file's text, signed by `key`, exactly as `licence issue` writes it. */
export const licenceText = (payload, key) => `${JSON.stringify(signLicence(payload, key.privateKey), null, 2)}\n`;

/** A signed revocation list document. */
export const listDoc = (list, key) => signList(list, key.privateKey);

/**
 * A bare repository standing in for the public list repository, as a `file://` URL.
 *
 * `files` is what `main` holds — `null` for a repository with no branch at all, which is the state
 * the owner's freshly created repository is in until the first push. The commit identity is a
 * fixture's and lives only in a temp directory.
 */
export function listRepo(t, files) {
  const base = tempDir('snowarch-licence-repo-', t);
  const bare = join(base, 'list.git');
  const env = { ...process.env, GIT_AUTHOR_NAME: 'fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
    GIT_COMMITTER_NAME: 'fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' };
  const git = (args) => execFileSync('git', args, { env, stdio: 'pipe' });
  initFixtureRepo(git, bare, ['-q', '--bare', '--initial-branch=main']);
  if (files) {
    const work = join(base, 'work');
    initFixtureRepo(git, work, ['-q', '--initial-branch=main']);
    // A path may name a directory: a release manifest is `releases/<tag>.json` (ARC-11-C7).
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(work, path)), { recursive: true });
      writeFileSync(join(work, path), content);
    }
    git(['-C', work, 'add', '-A']);
    git(['-C', work, 'commit', '-q', '--allow-empty', '-m', 'list']);
    git(['-C', work, 'push', '-q', bare, 'main']);
  }
  return pathToFileURL(bare).href;
}

/**
 * ARC-11-C7 — a signed manifest document for `tag`, its body valid and small: the product's coverage and one covered
 * file. `over` replaces fields of the body. For the transport and the commands; a tree's own manifest comes from
 * `manifestFromArchive`.
 */
export const manifestDoc = (tag, key, over = {}) => signManifest({
  tag, commit: 'a'.repeat(40), covers: [...COVERAGE.covers], excludes: [...COVERAGE.excludes],
  ignores: [...COVERAGE.ignores], files: { 'CLAUDE.md': '0'.repeat(64) }, ...over,
}, key.privateKey);
