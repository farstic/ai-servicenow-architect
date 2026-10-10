import { execFileSync } from 'node:child_process';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalJson, fingerprint, LICENCE_FORMAT, LIST_FORMAT, type ProductKey } from '../../src/licence/core.js';
import { trackTempDir } from '../helpers/server-child.js';

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

function signed(format: string, field: 'licence' | 'list', body: unknown, key: Pair): string {
  const value = sign(null, Buffer.from(canonicalJson(body), 'utf8'), key.privateKey).toString('base64');
  return `${JSON.stringify({ format, [field]: body, signature: { alg: 'Ed25519', key: fingerprint(key.publicKey), value } }, null, 2)}\n`;
}

export const licenceText = (body: Record<string, unknown>, key: Pair): string => signed(LICENCE_FORMAT, 'licence', body, key);
export const listText = (version: number, revoked: unknown[], key: Pair): string =>
  signed(LIST_FORMAT, 'list', { version, revoked }, key);

/** A checkout: a project directory with a `.local/`. */
export function checkout(prefix = 'snowarch-licence-'): string {
  const root = trackTempDir(mkdtempSync(join(tmpdir(), prefix)));
  mkdirSync(join(root, '.local'), { recursive: true });
  return root;
}

/** A bare repository standing in for the list repository; `files` null is a repository with no branch. */
export function listRepo(files: Record<string, string> | null): string {
  const base = trackTempDir(mkdtempSync(join(tmpdir(), 'snowarch-licence-repo-')));
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
