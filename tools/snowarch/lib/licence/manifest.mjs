// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-11-C7 — the build-integrity manifest: what a release ships, signed, and a tree checked against it.
 *
 * A MANIFEST FILE is `{ format, manifest, signature }`, signed as a licence is: an Ed25519 signature over the
 * canonical JSON of `manifest` alone, by a key the product ships (`core.mjs`). The body is
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
 * THE BYTES ARE A CHECKOUT'S, never git's blobs. `.gitattributes` makes every covered text file LF on every platform
 * and `*.ps1` CRLF, so a checkout on any of the three writes the same bytes, and those are the bytes `git archive`
 * writes too. The signer reads them from `git archive <tag>`, parsed here, with no temporary tree. The content is
 * all that is hashed: a mode bit is not, because Windows has none (the architect's rulings, 2026-10-13).
 *
 * MODIFIED is any difference: a covered file whose bytes differ, a covered file that is gone, and a file under a
 * covered directory that the manifest does not list. `.claude/skills` and `.claude/agents` are the product's roster,
 * and a user's own work lives under `clients/` and in project rules, never in the roster.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';

import { signBody, verifyBody } from './core.mjs';
import { PRODUCT_KEYS } from './keys.mjs';

export const MANIFEST_FORMAT = 'snowarch-manifest/1';

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
export const hashBytes = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** A path the manifest may hold: relative, `/`-separated, with no empty, `.` or `..` part. */
const safePath = (p) => typeof p === 'string' && p !== '' && !p.startsWith('/') && !p.includes('\\')
  && p.split('/').every((part) => part !== '' && part !== '.' && part !== '..');

const isDirEntry = (c) => c.endsWith('/');

/** Is `path` covered by `{ covers, excludes, ignores }`? */
export function isCovered(path, { covers, excludes = [], ignores = [] }) {
  if (ignores.includes(posix.basename(path))) return false;
  if (excludes.some((dir) => path.startsWith(dir))) return false;
  return covers.some((c) => (isDirEntry(c) ? path.startsWith(c) : path === c));
}

/** Why this is not a manifest body, or `null`. */
function manifestProblem(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return 'there is no manifest in the file';
  if (typeof m.tag !== 'string' || !TAG.test(m.tag)) return 'the tag is not v<major>.<minor>.<patch>';
  if (typeof m.commit !== 'string' || !COMMIT.test(m.commit)) return 'the commit is not a full sha';
  for (const key of ['covers', 'excludes', 'ignores']) {
    if (!Array.isArray(m[key]) || !m[key].every((p) => typeof p === 'string' && p !== '')) return `${key} is not a list of paths`;
  }
  if (m.covers.length === 0) return 'covers is empty';
  if (![...m.covers, ...m.excludes].every((p) => safePath(isDirEntry(p) ? p.slice(0, -1) : p))) {
    return 'covers or excludes holds a path that is not relative';
  }
  if (!m.files || typeof m.files !== 'object' || Array.isArray(m.files)) return 'files is not a map';
  const paths = Object.keys(m.files);
  if (paths.length === 0) return 'files is empty';
  for (const p of paths) {
    if (!safePath(p)) return `${JSON.stringify(p)} is not a relative path`;
    if (!isCovered(p, m)) return `${p} is not under what the manifest covers`;
    if (typeof m.files[p] !== 'string' || !SHA256.test(m.files[p])) return `${p}: the hash is not sha256 hex`;
  }
  return null;
}

/** A manifest file's content: the format, the manifest, and its signature. */
export const signManifest = (manifest, privateKeyPem) => ({
  format: MANIFEST_FORMAT, manifest, signature: signBody(manifest, privateKeyPem),
});

/**
 * A manifest — its text or its parsed document — verified: `{ ok, manifest, key }`, or `{ ok: false, reason }`.
 * A manifest that does not verify is never used to judge a tree.
 */
export function readManifest(input, { keys = PRODUCT_KEYS } = {}) {
  let doc = input;
  if (typeof input === 'string') {
    try { doc = JSON.parse(input); } catch { return { ok: false, reason: 'the manifest is not JSON' }; }
  }
  if (!doc || typeof doc !== 'object' || doc.format !== MANIFEST_FORMAT) {
    return { ok: false, reason: `the file is not a ${MANIFEST_FORMAT} manifest` };
  }
  const problem = manifestProblem(doc.manifest);
  if (problem) return { ok: false, reason: problem };
  const signed = verifyBody(doc.manifest, doc.signature, keys);
  if (!signed.ok) return { ok: false, reason: signed.reason };
  return { ok: true, manifest: doc.manifest, key: signed.role };
}

// ── The signer's side: `git archive <tag>`, read without a temporary tree ─────────────────────────────────────────

const field = (block, start, length) => {
  const raw = block.subarray(start, start + length);
  const end = raw.indexOf(0);
  return raw.subarray(0, end === -1 ? raw.length : end).toString('utf8');
};

/** `key=value` records from a pax header's data: `<length> <key>=<value>\n`, repeated. */
function paxRecords(data) {
  const out = {};
  let at = 0;
  while (at < data.length) {
    const space = data.indexOf(0x20, at);
    if (space === -1) break;
    const length = Number(data.subarray(at, space).toString('utf8'));
    if (!Number.isInteger(length) || length <= 0) break;
    const record = data.subarray(space + 1, at + length - 1).toString('utf8');
    const eq = record.indexOf('=');
    if (eq !== -1) out[record.slice(0, eq)] = record.slice(eq + 1);
    at += length;
  }
  return out;
}

/**
 * Every entry of a tar stream, as `{ path, type, data }`: what `git archive --format=tar` writes, a pax global
 * header, ustar entries, and a pax extended header where a path does not fit.
 */
export function tarEntries(buffer) {
  const entries = [];
  let at = 0;
  let pending = {};
  while (at + 512 <= buffer.length) {
    const block = buffer.subarray(at, at + 512);
    if (block.every((b) => b === 0)) break;
    const size = Number.parseInt(field(block, 124, 12).trim() || '0', 8);
    const type = String.fromCharCode(block[156] || 0x30);
    const data = buffer.subarray(at + 512, at + 512 + size);
    at += 512 + Math.ceil(size / 512) * 512;
    if (type === 'g') continue;
    if (type === 'x') { pending = paxRecords(data); continue; }
    const prefix = field(block, 345, 155);
    const name = field(block, 0, 100);
    const path = pending.path ?? (prefix ? `${prefix}/${name}` : name);
    pending = {};
    entries.push({ path, type, data });
  }
  return entries;
}

/**
 * The manifest body for `tag`, from `git archive` in `root`: the bytes a checkout of the tag writes. Throws when
 * git cannot read the tag, and when a covered path is anything but a regular file — a link would hash as its
 * target's text in the archive and as its target's bytes in a checkout, so no one manifest could hold it.
 */
export function manifestFromArchive(root, tag, { coverage = COVERAGE, run = spawnSync } = {}) {
  const git = (args, opts = {}) => run('git', args, { cwd: root, maxBuffer: 1 << 28, ...opts });
  const commit = String(git(['rev-parse', '--verify', '--quiet', `${tag}^{commit}`], { encoding: 'utf8' }).stdout ?? '').trim();
  if (!COMMIT.test(commit)) throw new Error(`no commit named ${tag} here`);
  const archive = git(['archive', '--format=tar', commit, '--', ...coverage.covers.map((c) => c.replace(/\/$/, ''))]);
  if (archive.status !== 0) throw new Error(`git archive ${tag} failed: ${String(archive.stderr ?? '').trim()}`);
  const files = {};
  for (const entry of tarEntries(archive.stdout)) {
    if (entry.type === '5' || !isCovered(entry.path, coverage)) continue;
    if (entry.type !== '0') throw new Error(`${entry.path} is not a regular file in ${tag}`);
    files[entry.path] = hashBytes(entry.data);
  }
  return { tag, commit, covers: [...coverage.covers], excludes: [...coverage.excludes], ignores: [...coverage.ignores],
    files };
}

// ── The user's side: a tree on disk, against a verified manifest ───────────────────────────────────────────────────

/** Every file and link under `dir` (relative to `root`), as `/` paths; a linked directory is listed, not entered. */
function walk(root, dir) {
  let entries;
  try { entries = readdirSync(join(root, dir), { withFileTypes: true }); } catch { return []; }
  return entries.flatMap((e) => {
    const rel = `${dir}${e.name}`;
    return e.isDirectory() ? walk(root, `${rel}/`) : [rel];
  });
}

/**
 * The tree at `root` against a VERIFIED manifest body: `{ ok, checked, modified }`, `modified` sorted, each
 * `{ path, why }` with `why` one of `changed`, `missing` or `extra`.
 */
export function checkTree(root, manifest) {
  const modified = [];
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
