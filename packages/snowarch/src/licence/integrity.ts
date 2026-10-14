// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-11-C7, moved here by C141 — the build-integrity manifest's READING half: a manifest verified, a tree checked
 * against it, and this checkout's verdict.
 *
 * ONE VERIFIER (the architect's ruling Q1, 2026-10-14). The server, both CLIs, the SessionStart hook and the doctor's
 * E-32 ask the same functions, and the engine imports this module's build as it imports `gate.js`: two verifiers would
 * be two answers to "may this tree run". The SIGNER's half — `git archive` read without a temporary tree, the
 * manifest made from it, the signature — stays in the engine (`tools/snowarch/lib/licence/manifest.mjs`), because only
 * a release makes one.
 *
 * A MANIFEST FILE is `{ format, manifest, signature }`, signed as a licence is: an Ed25519 signature over the canonical
 * JSON of `manifest` alone, by a key the product ships. The body is
 *
 *   tag       the release tag, `v<version>`;
 *   commit    the commit the tag names;
 *   covers    what is covered: a path ending in `/` is a directory and everything under it, any other is one file;
 *   excludes  directories under a covered one that are not covered (`tools/snowarch/tests/`);
 *   ignores   basenames that are never the product's, written by an operating system rather than by anyone
 *             changing the product (`.DS_Store`);
 *   files     every covered file, its path relative to the root with `/` separators, mapped to the sha256 of its
 *             bytes as hex.
 *
 * THE COVERAGE IS SIGNED. A tree is checked against the `covers`, `excludes` and `ignores` its manifest carries, not
 * against what this file says today, so a later release can change the coverage without making an older one fail.
 *
 * MODIFIED is any difference: a covered file whose bytes differ, a covered file that is gone, and a file under a
 * covered directory that the manifest does not list. `.claude/skills` and `.claude/agents` are the product's roster,
 * and a user's own work lives under `clients/` and in project rules, never in the roster.
 *
 * `.local/` is a parameter (`local`), not a rule of this module: the engine redirects it under
 * `SNOWARCH_STATE_ROOT` (`tools/snowarch/lib/local-paths.mjs`), and one place keeps that rule.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';

import { verifyBody, type KeyRole, type ProductKey } from './core.js';
import { PRODUCT_KEYS } from './keys.js';

export const MANIFEST_FORMAT = 'snowarch-manifest/1';

export interface Coverage {
  covers: readonly string[];
  excludes?: readonly string[];
  ignores?: readonly string[];
}

/** A verified manifest's body. */
export interface ManifestBody {
  tag: string;
  commit: string;
  covers: string[];
  excludes: string[];
  ignores: string[];
  files: Record<string, string>;
}

/** What a release's manifest covers (ARC-11-C7). */
export const COVERAGE = Object.freeze({
  covers: Object.freeze(['packages/snowarch/dist/', 'tools/snowarch/', 'CLAUDE.md', '.claude/rules/', '.claude/skills/',
    '.claude/agents/', '.claude/settings.json', 'engine.config.json', 'package.json']),
  excludes: Object.freeze(['tools/snowarch/tests/']),
  ignores: Object.freeze(['.DS_Store', 'Thumbs.db', 'desktop.ini']),
});

const SHA256 = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const TAG = /^v\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

/** The sha256 of `bytes`, as hex. */
export const hashBytes = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex');

/** A path the manifest may hold: relative, `/`-separated, with no empty, `.` or `..` part. */
const safePath = (p: unknown): boolean => typeof p === 'string' && p !== '' && !p.startsWith('/') && !p.includes('\\')
  && p.split('/').every((part) => part !== '' && part !== '.' && part !== '..');

const isDirEntry = (c: string): boolean => c.endsWith('/');

/**
 * Is `path` covered by `{ covers, excludes, ignores }`? An entry named exactly as an excluded directory is excluded
 * with it, so a link standing where that directory was is not an extra file.
 */
export function isCovered(path: string, { covers, excludes = [], ignores = [] }: Coverage): boolean {
  if (ignores.includes(posix.basename(path))) return false;
  if (excludes.some((dir) => path.startsWith(dir) || `${path}/` === dir)) return false;
  return covers.some((c) => (isDirEntry(c) ? path.startsWith(c) : path === c));
}

/** Why this is not a manifest body, or `null`. */
function manifestProblem(m: unknown): string | null {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return 'there is no manifest in the file';
  const b = m as Record<string, unknown>;
  if (typeof b.tag !== 'string' || !TAG.test(b.tag)) return 'the tag is not v<major>.<minor>.<patch>';
  if (typeof b.commit !== 'string' || !COMMIT.test(b.commit)) return 'the commit is not a full sha';
  for (const key of ['covers', 'excludes', 'ignores']) {
    const list = b[key];
    if (!Array.isArray(list) || !list.every((p) => typeof p === 'string' && p !== '')) return `${key} is not a list of paths`;
  }
  const covers = b.covers as string[];
  const excludes = b.excludes as string[];
  if (covers.length === 0) return 'covers is empty';
  if (![...covers, ...excludes].every((p) => safePath(isDirEntry(p) ? p.slice(0, -1) : p))) {
    return 'covers or excludes holds a path that is not relative';
  }
  if (!b.files || typeof b.files !== 'object' || Array.isArray(b.files)) return 'files is not a map';
  const files = b.files as Record<string, unknown>;
  const paths = Object.keys(files);
  if (paths.length === 0) return 'files is empty';
  for (const p of paths) {
    if (!safePath(p)) return `${JSON.stringify(p)} is not a relative path`;
    if (!isCovered(p, { covers, excludes, ignores: b.ignores as string[] })) return `${p} is not under what the manifest covers`;
    const hash = files[p];
    if (typeof hash !== 'string' || !SHA256.test(hash)) return `${p}: the hash is not sha256 hex`;
  }
  return null;
}

export type ReadManifest = { ok: true; manifest: ManifestBody; key: KeyRole } | { ok: false; reason: string };

/**
 * A manifest — its text or its parsed document — verified: `{ ok, manifest, key }`, or `{ ok: false, reason }`.
 * A manifest that does not verify is never used to judge a tree.
 */
export function readManifest(input: unknown, { keys = PRODUCT_KEYS }: { keys?: readonly ProductKey[] } = {}): ReadManifest {
  let doc = input;
  if (typeof input === 'string') {
    try { doc = JSON.parse(input); } catch { return { ok: false, reason: 'the manifest is not JSON' }; }
  }
  const d = doc as { format?: unknown; manifest?: unknown; signature?: unknown } | null;
  if (!d || typeof d !== 'object' || d.format !== MANIFEST_FORMAT) {
    return { ok: false, reason: `the file is not a ${MANIFEST_FORMAT} manifest` };
  }
  const problem = manifestProblem(d.manifest);
  if (problem) return { ok: false, reason: problem };
  const signed = verifyBody(d.manifest, d.signature, keys);
  if (!signed.ok) return { ok: false, reason: signed.reason };
  return { ok: true, manifest: d.manifest as ManifestBody, key: signed.role };
}

// ── The user's side: a tree on disk, against a verified manifest ───────────────────────────────────────────────────

/** Every file and link under `dir` (relative to `root`), as `/` paths; a linked directory is listed, not entered. */
function walk(root: string, dir: string): string[] {
  let entries;
  try { entries = readdirSync(join(root, dir), { withFileTypes: true }); } catch { return []; }
  return entries.flatMap((e) => {
    const rel = `${dir}${e.name}`;
    return e.isDirectory() ? walk(root, `${rel}/`) : [rel];
  });
}

export interface TreeDifference { path: string; why: 'changed' | 'missing' | 'extra' }
export interface TreeCheck { ok: boolean; checked: number; modified: TreeDifference[] }

/**
 * The tree at `root` against a VERIFIED manifest body: `{ ok, checked, modified }`, `modified` sorted, each
 * `{ path, why }` with `why` one of `changed`, `missing` or `extra`.
 */
export function checkTree(root: string, manifest: ManifestBody): TreeCheck {
  const modified: TreeDifference[] = [];
  for (const [path, hash] of Object.entries(manifest.files)) {
    let bytes;
    try { bytes = readFileSync(join(root, ...path.split('/'))); } catch { modified.push({ path, why: 'missing' }); continue; }
    if (hashBytes(bytes) !== hash) modified.push({ path, why: 'changed' });
  }
  for (const dir of manifest.covers.filter(isDirEntry)) {
    for (const path of walk(root, dir)) {
      if (isCovered(path, manifest) && !(path in manifest.files)) modified.push({ path, why: 'extra' });
    }
  }
  modified.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { ok: modified.length === 0, checked: Object.keys(manifest.files).length, modified };
}

// ── This checkout: the cached manifest, and the verdict E-32 reports ───────────────────────────────────────────────

/** Where a checkout's `.local/` is, when the caller does not say: beside the root. The engine always says. */
const localOf = (root: string, local?: string): string => local ?? join(root, '.local');

/** `.local/release-manifest.json` — this release's signed manifest, as last fetched, and when. */
export const manifestCachePath = (root: string, local?: string): string => join(localOf(root, local), 'release-manifest.json');

export interface ManifestCache { tag?: string; checkedAt: string; source?: string; doc: unknown }

/** The cache, `{ tag, checkedAt, source, doc }`, or `null`. A malformed file is an absent one. */
export function readManifestCache(root: string, { local }: { local?: string } = {}): ManifestCache | null {
  try {
    const raw = JSON.parse(readFileSync(manifestCachePath(root, local), 'utf8')) as ManifestCache | null;
    return raw && typeof raw === 'object' && raw.doc && typeof raw.checkedAt === 'string' ? raw : null;
  } catch { return null; }
}

export type Held =
  | { state: 'missing' }
  | { state: 'invalid'; reason: string }
  | { state: 'other'; manifestTag: string }
  | { state: 'held'; manifest: ManifestBody };

/**
 * What the cache holds for `tag`, the one reading of it (ARC-09-C140): E-32's verdict starts here, and B01's
 * `outputMissing` asks the same question, so the two cannot disagree about a cache. Offline; nothing is fetched.
 *
 *   missing   no cache, or a file that is not one;
 *   invalid   the cached manifest does not verify (`reason`);
 *   other     it verifies and is another release's (`manifestTag`);
 *   held      it verifies and is `tag`'s (`manifest`).
 */
export function cachedManifest(root: string, tag: string,
  { keys = PRODUCT_KEYS, local }: { keys?: readonly ProductKey[]; local?: string } = {}): Held {
  const cache = readManifestCache(root, { local });
  if (!cache) return { state: 'missing' };
  const read = readManifest(cache.doc, { keys });
  if (!read.ok) return { state: 'invalid', reason: read.reason };
  if (read.manifest.tag !== tag) return { state: 'other', manifestTag: read.manifest.tag };
  return { state: 'held', manifest: read.manifest };
}

/** A development version: `2.1.0-dev`, and `2.1.0-dev.1` should one ever be cut. */
export const isDevVersion = (version: string): boolean => /-dev(\.\d+)?$/.test(version);

/** The commit this checkout's own `tag` names, or `null`: no git, no repository, or no such tag (a download). */
export function tagCommit(root: string, tag: string, { run = spawnSync }: { run?: typeof spawnSync } = {}): string | null {
  const r = run('git', ['rev-parse', '--verify', '--quiet', `refs/tags/${tag}^{commit}`],
    { cwd: root, encoding: 'utf8', timeout: 5_000, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
  const sha = String(r.stdout ?? '').trim();
  return r.status === 0 && COMMIT.test(sha) ? sha : null;
}

const versionOf = (root: string): string | null => {
  try {
    const v = (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version?: unknown }).version;
    return typeof v === 'string' ? v : null;
  } catch { return null; }
};

/** This checkout's release tag, `v<version>`, or `null` for a development version or none. */
export function releaseTagOf(root: string): string | null {
  const version = versionOf(root);
  return typeof version === 'string' && version !== '' && !isDevVersion(version) ? `v${version}` : null;
}

export type IntegrityStatus =
  | { state: 'dev'; version: string }
  | { state: 'verified'; version: string; tag: string; checked: number; modified: TreeDifference[] }
  | { state: 'modified'; version: string; tag: string; checked: number; modified: TreeDifference[] }
  | { state: 'missing'; version: string; tag: string }
  | { state: 'invalid'; version: string | null; tag?: string; reason: string }
  | { state: 'other'; version: string; tag: string; manifestTag: string; manifestCommit?: string; localCommit?: string };

/**
 * This checkout against its release's signed manifest, read from the cache: `{ state, version, tag, … }`.
 *
 *   dev       a development version, which no manifest is signed for;
 *   verified  the manifest is this release's, and every covered file is as signed;
 *   modified  the manifest is this release's, and `modified` lists what differs;
 *   missing   no manifest is held: none was fetched, or the cache was deleted;
 *   invalid   the cached manifest does not verify, or `package.json` names no version;
 *   other     the manifest is another release's (`manifestTag`), or another commit's than this checkout's own tag.
 *
 * Every state but `dev` and `verified` is a FAIL (the architect's ruling, 2026-10-13): a deleted or swapped manifest
 * is the cheapest tamper, and must read as one. One bounded `git` call, for the tag's commit; nothing is fetched.
 */
export function integrityStatus(root: string, { keys = PRODUCT_KEYS, commitOf = tagCommit, local }:
  { keys?: readonly ProductKey[]; commitOf?: (root: string, tag: string) => string | null; local?: string } = {}): IntegrityStatus {
  const version = versionOf(root);
  if (typeof version !== 'string' || version === '') return { state: 'invalid', version: null, reason: 'package.json names no version' };
  if (isDevVersion(version)) return { state: 'dev', version };
  const tag = `v${version}`;
  const held = cachedManifest(root, tag, { keys, local });
  if (held.state === 'missing') return { state: 'missing', version, tag };
  if (held.state === 'invalid') return { state: 'invalid', version, tag, reason: held.reason };
  if (held.state === 'other') return { state: 'other', version, tag, manifestTag: held.manifestTag };
  const m = held.manifest;
  const localCommit = commitOf(root, tag);
  if (localCommit !== null && localCommit !== m.commit) {
    return { state: 'other', version, tag, manifestTag: m.tag, manifestCommit: m.commit, localCommit };
  }
  const tree = checkTree(root, m);
  return { state: tree.ok ? 'verified' : 'modified', version, tag, checked: tree.checked, modified: tree.modified };
}

/** The `Integrity:` line a status names, for every state; E-32 reports it, `status` and the banner print it. */
export function integrityLine(s: IntegrityStatus): string {
  const short = (sha: string): string => sha.slice(0, 7);
  switch (s.state) {
    case 'dev': return 'Integrity: not checked — a development tree has no signed manifest';
    case 'verified': return `Integrity: verified · ${s.tag} · ${s.checked} file${s.checked === 1 ? '' : 's'}`;
    case 'modified': {
      const n = s.modified.length;
      const first = s.modified[0].path;
      return n === 1
        ? `Integrity: modified — 1 file differs from the signed manifest for ${s.tag}: ${first}`
        : `Integrity: modified — ${n} files differ from the signed manifest for ${s.tag}, the first ${first}`;
    }
    case 'missing': return `Integrity: no signed manifest for ${s.tag} — reinstall from a signed release tag`;
    case 'other': return s.localCommit && s.manifestCommit
      ? `Integrity: the signed manifest for ${s.tag} names commit ${short(s.manifestCommit)}, and this checkout's ${s.tag} names ${short(s.localCommit)}`
      : `Integrity: the signed manifest is for ${s.manifestTag}, this checkout is ${s.tag}`;
    default: return s.tag
      ? `Integrity: the signed manifest for ${s.tag} does not verify — ${s.reason}`
      : `Integrity: ${s.reason}`;
  }
}

/** The remedy for a state that is not `verified`, spelled for `cli`; `null` for `dev` and `verified`. */
export function integrityRemedy(s: IntegrityStatus, cli: string): string | null {
  if (s.state === 'dev' || s.state === 'verified') return null;
  if (s.state === 'modified') {
    return `Restore the files from ${s.tag}, or reinstall from a signed release tag; ${cli} doctor --json lists every one.`;
  }
  return `Run ${cli} licence check --refresh to fetch it; if it says none is published, reinstall from a signed release tag.`;
}
