/**
 * ARC-11-C1 — the licence, read and judged: the server's copy. Pure: no file, no clock, no environment.
 *
 * This package imports nothing from outside itself, so the CLI's `tools/snowarch/lib/licence/core.mjs`
 * cannot be shared and is copied here instead. `tools/snowarch/tests/licence-parity.test.mjs` runs
 * both copies over every case and holds them to the same verdict; a change to one that is not made
 * to the other fails there. The CLI's header explains the format; in short:
 *
 * - a licence file is `{ format, licence, signature }`, the signature a DETACHED Ed25519 signature
 *   over the canonical JSON of `licence` (keys sorted at every depth, no whitespace);
 * - a key the product does not ship signs nothing, whatever fingerprint the file claims, so a
 *   perpetual licence (no `valid_until`) from any other key is invalid like every other;
 * - the states are ok, expiring (30 days or fewer), expired, revoked, invalid and missing, and an
 *   id is reported only when the signature holds;
 * - a revocation list names a licence by id, date and a reason from a short list, and a list no
 *   newer than the one held is ignored.
 *
 * The server never signs anything: issuing and revoking are the CLI's.
 */
import { createHash, createPublicKey, verify } from 'node:crypto';

export const LICENCE_FORMAT = 'snowarch-licence/1';
export const LIST_FORMAT = 'snowarch-revocations/1';
export const SCOPES = Object.freeze(['design-only', 'live'] as const);
export const REASONS = Object.freeze(['ended', 'breach', 'lost', 'other'] as const);
export const EXPIRING_DAYS = 30;
export const ID_PATTERN = /^LIC-\d{4}-\d{4}$/;

export type LicenceState = 'ok' | 'expiring' | 'expired' | 'revoked' | 'invalid' | 'missing';
export type KeyRole = 'primary' | 'recovery';

export interface ProductKey {
  role: KeyRole;
  fingerprint: string;
  publicKey: string;
}

export interface RevocationEntry {
  id: string;
  revokedAt: string;
  reason: string;
}

export interface VerifiedList {
  ok: true;
  version: number;
  revoked: RevocationEntry[];
  key: KeyRole;
}

export interface RefusedList {
  ok: false;
  reason: string;
}

export interface LicenceStatus {
  state: LicenceState;
  id: string | null;
  licensee: string | null;
  org: string | null;
  scope: string | null;
  issued: string | null;
  validUntil: string | null;
  perpetual: boolean;
  daysLeft: number | null;
  key: KeyRole | null;
  signatureValid: boolean;
  reason: string | null;
  revocation: { revokedAt: string; reason: string } | null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const ENTRY_FIELDS = ['id', 'revokedAt', 'reason'];

/** The one byte string a signature covers: keys sorted at every depth, no whitespace. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('canonical JSON holds finite numbers only');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v === undefined ? null : v)).join(',')}]`;
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
  }
  throw new TypeError(`canonical JSON cannot hold a ${typeof value}`);
}

/** `sha256:` and the hex digest of the key's DER SubjectPublicKeyInfo. */
export function fingerprint(publicKeyPem: string): string {
  const der = createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' });
  return `sha256:${createHash('sha256').update(der).digest('hex')}`;
}

type Verified = { ok: true; role: KeyRole } | { ok: false; reason: string };

/** Which shipped key signed `body`, found by the fingerprint OF ITS PUBLIC KEY, or why none did. */
export function verifyBody(body: unknown, signature: unknown, keys: readonly ProductKey[]): Verified {
  const sig = signature as { alg?: unknown; key?: unknown; value?: unknown } | null;
  if (!sig || typeof sig !== 'object' || sig.alg !== 'Ed25519'
    || typeof sig.key !== 'string' || typeof sig.value !== 'string') {
    return { ok: false, reason: 'the signature is missing or not an Ed25519 signature' };
  }
  const key = keys.find((k) => fingerprint(k.publicKey) === sig.key);
  if (!key) return { ok: false, reason: 'not signed by a key this product ships' };
  let good = false;
  try {
    good = verify(null, Buffer.from(canonicalJson(body), 'utf8'), createPublicKey(key.publicKey),
      Buffer.from(sig.value, 'base64'));
  } catch { good = false; }
  return good ? { ok: true, role: key.role } : { ok: false, reason: 'the signature does not match the content' };
}

const isDate = (s: unknown): s is string => typeof s === 'string' && DATE.test(s)
  && !Number.isNaN(Date.parse(`${s}T00:00:00Z`))
  && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const nonEmpty = (s: unknown): boolean => typeof s === 'string' && s.trim() !== '';

/** Why this is not a licence, or `null` when every field is what the format says. */
export function licenceProblem(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'there is no licence in the file';
  const l = value as Record<string, unknown>;
  if (typeof l.id !== 'string' || !ID_PATTERN.test(l.id)) return 'the id is not LIC-YYYY-NNNN';
  for (const f of ['licensee', 'org', 'issuer']) if (!nonEmpty(l[f])) return `${f} is empty`;
  if (!(SCOPES as readonly unknown[]).includes(l.scope)) return `the scope is not one of ${SCOPES.join(', ')}`;
  if (!isDate(l.issued)) return 'issued is not a date (YYYY-MM-DD)';
  if (l.valid_until !== undefined && !isDate(l.valid_until)) return 'valid_until is not a date (YYYY-MM-DD)';
  if (l.valid_until !== undefined && (l.valid_until as string) < l.issued) return 'valid_until is before issued';
  if (l.notes !== undefined && typeof l.notes !== 'string') return 'notes is not text';
  return null;
}

/** The UTC calendar date of `now`, as YYYY-MM-DD. */
export const utcDate = (now: Date): string => now.toISOString().slice(0, 10);

/** Whole days from `from` to `to`, both YYYY-MM-DD. */
export const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

const verdict = (state: LicenceState, over: Partial<LicenceStatus> = {}): LicenceStatus => ({
  state, id: null, licensee: null, org: null, scope: null, issued: null, validUntil: null,
  perpetual: false, daysLeft: null, key: null, signatureValid: false, reason: null, revocation: null, ...over,
});

export interface CheckOptions {
  keys: readonly ProductKey[];
  list?: { revoked?: RevocationEntry[] } | null;
  now: Date;
}

/** The status of a licence file's TEXT — `null` for no file — against the keys, a list and a moment. */
export function checkLicence(text: string | null | undefined, { keys, list = null, now }: CheckOptions): LicenceStatus {
  if (text === null || text === undefined) return verdict('missing', { reason: 'no licence is installed' });
  let doc: { format?: unknown; licence?: unknown; signature?: unknown };
  try { doc = JSON.parse(text); } catch { return verdict('invalid', { reason: 'the file is not JSON' }); }
  if (!doc || typeof doc !== 'object' || doc.format !== LICENCE_FORMAT) {
    return verdict('invalid', { reason: `the file is not a ${LICENCE_FORMAT} licence` });
  }
  const problem = licenceProblem(doc.licence);
  if (problem) return verdict('invalid', { reason: problem });
  const signed = verifyBody(doc.licence, doc.signature, keys);
  if (!signed.ok) return verdict('invalid', { reason: signed.reason });

  const l = doc.licence as Record<string, string | undefined>;
  const perpetual = l.valid_until === undefined;
  const daysLeft = perpetual ? null : daysBetween(utcDate(now), l.valid_until as string);
  const known: Partial<LicenceStatus> = {
    id: l.id as string, licensee: l.licensee as string, org: l.org as string, scope: l.scope as string,
    issued: l.issued as string, validUntil: perpetual ? null : (l.valid_until as string), perpetual, daysLeft,
    key: signed.role, signatureValid: true,
  };
  const entry = list?.revoked?.find((e) => e.id === l.id);
  if (entry) {
    return verdict('revoked', { ...known, reason: `revoked on ${entry.revokedAt} (${entry.reason})`,
      revocation: { revokedAt: entry.revokedAt, reason: entry.reason } });
  }
  if (daysLeft !== null && daysLeft < 0) return verdict('expired', { ...known, reason: `expired on ${l.valid_until}` });
  if (daysLeft !== null && daysLeft <= EXPIRING_DAYS) return verdict('expiring', known);
  return verdict('ok', known);
}

function listProblem(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'there is no list in the file';
  const list = value as { version?: unknown; revoked?: unknown };
  if (!Number.isInteger(list.version) || (list.version as number) < 1) return 'the version is not a whole number from 1';
  if (!Array.isArray(list.revoked)) return 'revoked is not a list';
  const seen = new Set<string>();
  for (const raw of list.revoked as unknown[]) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 'an entry is not an object';
    const e = raw as Record<string, unknown>;
    const extra = Object.keys(e).filter((k) => !ENTRY_FIELDS.includes(k));
    if (extra.length > 0) return `an entry carries ${extra.join(', ')} — only id, revokedAt and reason belong in the list`;
    if (typeof e.id !== 'string' || !ID_PATTERN.test(e.id)) return 'an entry\'s id is not LIC-YYYY-NNNN';
    if (!isDate(e.revokedAt)) return `${e.id}: revokedAt is not a date (YYYY-MM-DD)`;
    if (!(REASONS as readonly unknown[]).includes(e.reason)) return `${e.id}: the reason is not one of ${REASONS.join(', ')}`;
    if (seen.has(e.id)) return `${e.id} is listed twice`;
    seen.add(e.id);
  }
  return null;
}

/** A revocation list — text or parsed document — verified, or the reason it is refused. */
export function readList(input: unknown, { keys }: { keys: readonly ProductKey[] }): VerifiedList | RefusedList {
  let doc = input as { format?: unknown; list?: unknown; signature?: unknown } | null;
  if (typeof input === 'string') {
    try { doc = JSON.parse(input); } catch { return { ok: false, reason: 'the list is not JSON' }; }
  }
  if (!doc || typeof doc !== 'object' || doc.format !== LIST_FORMAT) {
    return { ok: false, reason: `the file is not a ${LIST_FORMAT} list` };
  }
  const problem = listProblem(doc.list);
  if (problem) return { ok: false, reason: problem };
  const signed = verifyBody(doc.list, doc.signature, keys);
  if (!signed.ok) return { ok: false, reason: signed.reason };
  const list = doc.list as { version: number; revoked: RevocationEntry[] };
  return { ok: true, version: list.version, revoked: list.revoked, key: signed.role };
}

/** The list to keep: the held one, unless the other is a verified list with a HIGHER version. */
export function newerList(held: VerifiedList | null, fetched: VerifiedList | null): VerifiedList | null {
  if (!fetched) return held ?? null;
  if (!held) return fetched;
  return fetched.version > held.version ? fetched : held;
}
