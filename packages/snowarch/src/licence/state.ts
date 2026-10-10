/**
 * ARC-11-C1 — the licence as the checkout holds it, and the one line that says so: the server's copy.
 *
 * The CLI's `tools/snowarch/lib/licence/state.mjs` is the other copy, and
 * `tools/snowarch/tests/licence-parity.test.mjs` holds `licenceLine` and `listSource` to the CLI's
 * output on every case. Two files under the project's `.local/`: `licence.json`, copied in by hand,
 * and `revocations.json`, the last list a fetch brought back and when it was checked. Enforcement is
 * on only for the exact string "true", like every flag.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkLicence, readList, type LicenceStatus, type ProductKey, type VerifiedList } from './core.js';
import { PRODUCT_KEYS } from './keys.js';

export const ENFORCE_VAR = 'SNOW_LICENCE_ENFORCE';

/** The states enforcement refuses. `expiring` is not one: a licence in its last month is in force. */
export const REFUSED: readonly string[] = Object.freeze(['missing', 'invalid', 'expired', 'revoked']);

export const isEnforced = (env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): boolean =>
  env?.[ENFORCE_VAR] === 'true';

export const licencePath = (root: string): string => join(root, '.local', 'licence.json');
export const revocationsPath = (root: string): string => join(root, '.local', 'revocations.json');

export interface ListCache {
  checkedAt: string;
  source?: string;
  list: unknown;
}

export interface CheckoutStatus extends LicenceStatus {
  enforced: boolean;
  list: { version: number; checkedAt: string } | null;
}

export interface ListSource { url: string; ref: string; path: string }

export function readLicenceText(root: string): string | null {
  const path = licencePath(root);
  try { return existsSync(path) ? readFileSync(path, 'utf8') : null; } catch { return null; }
}

/** The cache, or `null`. A malformed file is an absent one. */
export function readListCache(root: string): ListCache | null {
  try {
    const raw = JSON.parse(readFileSync(revocationsPath(root), 'utf8')) as ListCache | null;
    return raw && typeof raw === 'object' && typeof raw.checkedAt === 'string' ? raw : null;
  } catch { return null; }
}

/** Written whole, atomically, 0600 — the discipline of every `.local/` file. */
export function writeListCache(root: string, { list, checkedAt, source }: { list: unknown; checkedAt: string; source: string }): void {
  const path = revocationsPath(root);
  mkdirSync(join(root, '.local'), { recursive: true, mode: 0o700 });
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify({ checkedAt, source, list }, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, path);
  if (process.platform !== 'win32') chmodSync(path, 0o600);
}

/** The cached list, verified — or `null`, which is what an unverifiable one is. */
export function heldList(cache: ListCache | null, keys: readonly ProductKey[] = PRODUCT_KEYS): VerifiedList | null {
  if (!cache?.list) return null;
  const list = readList(cache.list, { keys });
  return list.ok ? list : null;
}

export function licenceStatus(root: string, { keys = PRODUCT_KEYS, now = new Date(), env = process.env }:
  { keys?: readonly ProductKey[]; now?: Date; env?: NodeJS.ProcessEnv | Record<string, string | undefined> } = {}): CheckoutStatus {
  const cache = readListCache(root);
  const list = heldList(cache, keys);
  const status = checkLicence(readLicenceText(root), { keys, list, now });
  return { ...status, enforced: isEnforced(env), list: list && cache ? { version: list.version, checkedAt: cache.checkedAt } : null };
}

/** The line: the same words as the CLI's banner (the parity test holds them). */
export function licenceLine(s: Pick<LicenceStatus, 'state' | 'id' | 'scope' | 'perpetual' | 'validUntil'>,
  { enforced }: { enforced: boolean }): string {
  const parts = [`Licence: ${s.state}`];
  if (s.state === 'ok' || s.state === 'expiring') {
    parts.push(String(s.id));
    if (s.scope === 'design-only') parts.push('design-only');
    parts.push(s.perpetual ? 'perpetual' : `until ${s.validUntil}`);
  }
  if (s.state !== 'ok') parts.push(enforced ? 'enforced' : 'warn only');
  return parts.join(' · ');
}

const OWNER_NAME = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

/** `owner/name` is GitHub over HTTPS; anything else is a URL or path, used as written. */
export const repoUrl = (repo: string): string => (OWNER_NAME.test(repo) ? `https://github.com/${repo}.git` : repo);

/** `{ url, ref, path }` from `engine.config.json`'s `licence.revocations`, or `null` when none is configured. */
export function listSource(config: unknown): ListSource | null {
  const r = (config as { licence?: { revocations?: { repo?: unknown; ref?: unknown; path?: unknown } } } | null)
    ?.licence?.revocations;
  if (!r || typeof r !== 'object' || typeof r.repo !== 'string' || r.repo === '') return null;
  return {
    url: repoUrl(r.repo),
    ref: typeof r.ref === 'string' && r.ref !== '' ? r.ref : 'main',
    path: typeof r.path === 'string' && r.path !== '' ? r.path : 'revocations.json',
  };
}
