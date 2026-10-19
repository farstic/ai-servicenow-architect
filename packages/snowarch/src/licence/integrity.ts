// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
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
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import {
  closeSync, copyFileSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, realpathSync, renameSync, rmdirSync,
  rmSync, statSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, posix, relative, sep } from 'node:path';

import { appendAudit, type IntegrityRestoreEntry } from '../audit/writer.js';
import { cliSpelling } from '../cli/tty.js';
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

/**
 * What a release ships, and so what its manifest covers (ARC-11-C7; ARC-09-C185a). One definition: the signer
 * (`licence sign-release`), the distribution export and its guard read it, and each manifest stores the copy it was
 * signed with, which is what the verifier reads. A path ending in `/` is a directory; anything else is one file.
 */
export const COVERAGE = Object.freeze({
  covers: Object.freeze([
    // What runs the Architect: the server build, the engine, the session's own files, the configuration.
    'packages/snowarch/dist/', 'tools/snowarch/', 'CLAUDE.md', '.claude/rules/', '.claude/skills/', '.claude/agents/',
    '.claude/settings.json', 'engine.config.json', 'package.json',
    // The server's workspace manifest: the root's `workspaces` and package-lock.json name it, so `npm ci` needs it.
    'packages/snowarch/package.json',
    // ARC-09-C185a — what the Architect reads at routing time and the templates its skills name.
    'governance/', 'templates/',
    // The contract library and lint the doctor imports, the pin it checks, and the retired names E-19 and E-20 read.
    'packages/contract/lib/', 'packages/contract/lint/', 'packages/contract/required-tools.json',
    'packages/contract/retired-names.json',
    // The install's own scaffolding. The two Windows launchers are named by their stems: a bare launcher name in source
    // reads as a spelled command to ARC-07-W17's sweep, and here it names a file the release ships.
    'bootstrap.sh', 'bootstrap.ps1', 'snowarch', ...['bootstrap', 'snowarch'].map((stem) => `${stem}.cmd`),
    'package-lock.json', '.mcp.json',
    'engine.config.schema.json', '.gitattributes', '.gitignore', '.editorconfig', '.gitmodules', 'vendor/docs-areas.txt',
    'LICENSE', 'NOTICE', 'LICENSING.md', 'TRADEMARKS.md', 'README.md',
    // The scripts the skills and the docs CLI run.
    'scripts/render-drawio.sh', 'scripts/render-diagrams.sh', 'scripts/render-diagrams.ps1', 'scripts/render-pdf.sh',
    'scripts/render-pdf-pages.ps1', 'scripts/md-to-docx.py', 'scripts/md-to-docx.ps1', 'scripts/mermaid-theme.json',
    'scripts/README.md', 'scripts/docs.mjs', 'scripts/gen-docs-areas.mjs',
    // The user's documentation, and the live-coverage ledger.
    'docs/INSTALL.md', 'docs/USER-GUIDE.md', 'docs/MODES-AND-PRESETS.md', 'docs/TROUBLESHOOTING.md', 'docs/MIGRATION.md',
    'docs/PLATFORM-NOTES.md', 'docs/CHANGELOG.md', 'docs/CLIENT-ONBOARDING.md', 'docs/KEY-COMPROMISE.md',
    'docs/RELICENSING.md', 'docs/ARCHITECTURE.md', 'docs/validation/LIVE-COVERAGE.md',
  ]),
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

// ── ARC-11-C141 — restore and continue ─────────────────────────────────────────────────────────────────────────────
//
// THE OWNER'S RULING (2026-10-14): a licensed user may not change the AI Architect's own files (the core files, and a
// skill, agent or rule added under .claude/), and he keeps using the product. So a change does not take effect: the
// signed files are put back from the release's tag, a file the release does not ship is moved aside, the replaced
// copies go with it to `.local/integrity-removed/<UTC stamp>/`, one line says so, and the run continues as verified.
// Only a tree that CANNOT be restored refuses: no manifest held, one that does not verify, another release's, no tag
// to restore from, or a restore that failed.
//
// ONE FUNCTION, four callers: the server at its start (a full hash), the launcher before any command and the
// SessionStart hook (a stat-keyed verdict, re-hashing only what moved), and `doctor --fix`.

/** The two lines, and nothing else, that every caller prints. The CLAUDE.md sentence keys on their first words. */
export const RESTORED_PREFIX = 'Integrity: restored — ';
export const CANNOT_RESTORE_PREFIX = 'Integrity: cannot restore — ';

export type Ensured =
  | { state: 'exempt'; why: 'dev' | 'no-version' | 'not-engine'; line: string; hashed: number }
  | { state: 'verified'; tag: string; hashed: number }
  | { state: 'restored'; tag: string; restored: string[]; moved: string[]; folder: string; staged: boolean;
    claudeChanged: boolean; line: string; hashed: number }
  | { state: 'refused'; tag: string | null; reason: string; remedy: string; line: string; hashed: number;
    status: IntegrityStatus | null };

export interface EnsureOptions {
  /** The checkout's `.local/`; the engine passes its own, which honours SNOWARCH_STATE_ROOT. */
  local?: string;
  keys?: readonly ProductKey[];
  /** Hash every covered file (the server's start, `doctor`, `status`), instead of only what the stat key says moved. */
  full?: boolean;
  /** The launcher as the reader's shell spells it, for the remedy; this process's shell when absent. */
  cli?: string;
  now?: () => Date;
  run?: typeof spawnSync;
  /** The project directory whose `.local/` holds the audit trail; the server's own when absent. */
  projectDir?: string;
  /** Whether to restore at all: false reports what a restore would do and changes nothing. */
  restore?: boolean;
}

/** An engine checkout: the package can also run where there is no engine tree to check (Q2, 2026-10-14). */
export const isEngineCheckout = (root: string): boolean =>
  existsSync(join(root, 'engine.config.json')) && existsSync(join(root, 'tools', 'snowarch'));

const VERDICT_FORMAT = 'snowarch-integrity-verdict/1';
export const verdictPath = (root: string, local?: string): string => join(localOf(root, local), 'integrity-verdict.json');
export const lockPath = (root: string, local?: string): string => join(localOf(root, local), 'integrity.lock');
export const LOCK_STALE_MS = 30_000;
export const LOCK_WAIT_MS = 2_000;

interface Verdict {
  format: string;
  tag: string;
  manifest: string;
  coverage: { covers: string[]; excludes: string[]; ignores: string[] };
  files: Record<string, string>;
}

/** `mtimeMs:size`, or `null` for a path that is not there. */
const stampOf = (p: string): string | null => {
  try { const s = statSync(p); return `${s.mtimeMs}:${s.size}`; } catch { return null; }
};

/** Every covered path on disk under `coverage`, as `/` paths: the covered directories walked, the covered files. */
function coveredOnDisk(root: string, coverage: Coverage): string[] {
  const out: string[] = [];
  for (const c of coverage.covers) {
    if (isDirEntry(c)) out.push(...walk(root, c).filter((p) => isCovered(p, coverage)));
    else if (existsSync(join(root, ...c.split('/')))) out.push(c);
  }
  return out.sort();
}

function readVerdict(root: string, local?: string): Verdict | null {
  try {
    const v = JSON.parse(readFileSync(verdictPath(root, local), 'utf8')) as Verdict;
    return v && v.format === VERDICT_FORMAT && typeof v.tag === 'string' && v.files && v.coverage ? v : null;
  } catch { return null; }
}

/** Record a verified tree's stamps, so the next hook or launcher run can say "verified" from `stat` alone. */
function writeVerdict(root: string, local: string | undefined, tag: string, manifest: ManifestBody): void {
  const coverage = { covers: [...manifest.covers], excludes: [...manifest.excludes], ignores: [...manifest.ignores] };
  const files: Record<string, string> = {};
  for (const p of coveredOnDisk(root, coverage)) files[p] = stampOf(join(root, ...p.split('/'))) ?? '';
  const path = verdictPath(root, local);
  try {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    const tmp = `${path}.tmp-${process.pid}`;
    writeFileSync(tmp, `${JSON.stringify({ format: VERDICT_FORMAT, tag, manifest: stampOf(manifestCachePath(root, local)) ?? '',
      coverage, files })}\n`, { mode: 0o600 });
    renameSync(tmp, path);
  } catch { /* a verdict that cannot be written costs the next run a hash, never a wrong answer */ }
}

/**
 * The stat key's answer: `verified` when the tree's covered paths and their stamps are what the last verified run
 * recorded, else the paths whose stamp moved, appeared or went. `null`: no usable verdict, so hash everything.
 */
function statDifferences(root: string, local: string | undefined, tag: string): { same: true } | { same: false; paths: string[] } | null {
  const v = readVerdict(root, local);
  if (!v || v.tag !== tag || v.manifest !== (stampOf(manifestCachePath(root, local)) ?? '')) return null;
  const now = coveredOnDisk(root, v.coverage);
  const moved = new Set<string>();
  for (const p of now) if (v.files[p] !== stampOf(join(root, ...p.split('/')))) moved.add(p);
  for (const p of Object.keys(v.files)) if (!now.includes(p)) moved.add(p);
  return moved.size === 0 ? { same: true } : { same: false, paths: [...moved].sort() };
}

/** Only `paths` against the manifest: the stat key's re-hash. */
function checkPaths(root: string, manifest: ManifestBody, paths: string[]): TreeDifference[] {
  const out: TreeDifference[] = [];
  for (const path of paths) {
    const want = manifest.files[path];
    let bytes: Buffer | null = null;
    try { bytes = readFileSync(join(root, ...path.split('/'))); } catch { bytes = null; }
    if (want === undefined) {
      if (bytes !== null && isCovered(path, manifest)) out.push({ path, why: 'extra' });
    } else if (bytes === null) out.push({ path, why: 'missing' });
    else if (hashBytes(bytes) !== want) out.push({ path, why: 'changed' });
  }
  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

const sleep = (ms: number): void => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); };

/** Take `.local/integrity.lock` (R1): one restore at a time; a lock older than 30 s is a dead holder's. */
function takeLock(root: string, local: string | undefined, now: () => Date): (() => void) | null {
  const path = lockPath(root, local);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try {
      const fd = openSync(path, 'wx', 0o600);
      writeFileSync(fd, `${JSON.stringify({ pid: process.pid, at: now().toISOString() })}\n`);
      closeSync(fd);
      return () => { try { unlinkSync(path); } catch { /* already gone */ } };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') return null;
    }
    let at = 0;
    try { at = Date.parse((JSON.parse(readFileSync(path, 'utf8')) as { at?: string }).at ?? ''); } catch { at = 0; }
    if (!Number.isFinite(at) || now().getTime() - at > LOCK_STALE_MS) {
      try { unlinkSync(path); } catch { /* another process took it over first */ }
      continue;
    }
    if (Date.now() >= deadline) return null;
    sleep(50);
  }
}

/** `20261014T120501Z`: a folder name every file system takes. */
const stampFolder = (d: Date): string => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

/** A path as the line shows it: relative to the checkout when inside it. */
const shown = (root: string, p: string): string => {
  const rel = relative(root, p).split(sep).join('/');
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel) ? rel : p.split(sep).join('/');
};

/** Move `from` to `to`, across file systems if it must: a state root elsewhere is a test seam, and is still honoured. */
function moveFile(from: string, to: string): void {
  mkdirSync(dirname(to), { recursive: true });
  try { renameSync(from, to); } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EXDEV') throw e;
    copyFileSync(from, to);
    unlinkSync(from);
  }
}

/** The empty directories a move left, up to (not including) the covered directory it was found in. */
function pruneEmpty(root: string, path: string, covers: readonly string[]): void {
  const top = covers.filter(isDirEntry).find((c) => path.startsWith(c));
  if (!top) return;
  let dir = posix.dirname(path);
  while (`${dir}/` !== top && dir.startsWith(top.slice(0, -1))) {
    try { rmdirSync(join(root, ...dir.split('/'))); } catch { return; }
    dir = posix.dirname(dir);
  }
}

/**
 * Is `rel` reached through a link that leaves `root`? The real path of its nearest existing parent must be inside the
 * root's. A restore writes and moves files, and through a linked directory those would be another tree's files: a
 * test fixture's links to the repository it came from, or a user's skills folder linked from elsewhere. Such a path
 * is never touched; the tree cannot be restored.
 */
function leavesRoot(root: string, rel: string): boolean {
  const real = (p: string): string | null => { try { return realpathSync.native(p); } catch { return null; } };
  const top = real(root) ?? root;
  let dir = dirname(join(root, ...rel.split('/')));
  let at = real(dir);
  while (at === null && dir !== dirname(dir)) { dir = dirname(dir); at = real(dir); }
  if (at === null) return true;
  const r = relative(top, at);
  return r.startsWith('..') || isAbsolute(r);
}

const gitReason = (r: SpawnSyncReturns<string>): string =>
  String(r.stderr || r.error?.message || `git exited ${r.status ?? 'abnormally'}`).trim().split('\n')[0];

/** Run an audit append with the project directory the trail belongs to (one writer, the server's own). */
function auditUnder(projectDir: string | undefined, entry: IntegrityRestoreEntry): void {
  if (projectDir === undefined) { appendAudit(entry); return; }
  const was = process.env.CLAUDE_PROJECT_DIR;
  process.env.CLAUDE_PROJECT_DIR = projectDir;
  try { appendAudit(entry); } finally {
    if (was === undefined) delete process.env.CLAUDE_PROJECT_DIR; else process.env.CLAUDE_PROJECT_DIR = was;
  }
}

const reinstall = 'Reinstall from a signed release tag.';
const refetch = (cli: string): string =>
  `Run ${cli} licence check --refresh to fetch it; if it says none is published, reinstall from a signed release tag.`;
const repair = (cli: string): string => `Fix what it names, then run ${cli} doctor --fix; or reinstall from a signed release tag.`;

const refused = (tag: string | null, reason: string, remedy: string, hashed: number, status: IntegrityStatus | null): Ensured =>
  ({ state: 'refused', tag, reason, remedy, line: `${CANNOT_RESTORE_PREFIX}${reason} — ${remedy}`, hashed, status });

/** Why a state the restore cannot act on refuses, worded for the line; E-32 reports the same two halves. */
export function refusalOf(s: IntegrityStatus, cli: string): { reason: string; remedy: string } {
  const short = (sha: string): string => sha.slice(0, 7);
  switch (s.state) {
    case 'missing': return { reason: `no signed manifest for ${s.tag}`, remedy: refetch(cli) };
    // Another release's manifest is fetched again for this one; a tag moved to another commit is not this release.
    case 'other': return s.localCommit && s.manifestCommit
      ? { reason: `the signed manifest for ${s.tag} names commit ${short(s.manifestCommit)}, and this checkout's ${s.tag} names ${short(s.localCommit)}`, remedy: reinstall }
      : { reason: `the signed manifest is for ${s.manifestTag}, this checkout is ${s.tag}`, remedy: refetch(cli) };
    case 'invalid': return s.tag
      ? { reason: `the signed manifest for ${s.tag} does not verify (${s.reason})`, remedy: refetch(cli) }
      : { reason: s.reason, remedy: reinstall };
    default: return { reason: integrityLine(s), remedy: reinstall };
  }
}

/** The line a restore prints, worded by the owner's ruling (R5): the same everywhere, the hook adding its restart. */
export function restoredLine({ restored, moved, tag, folder, staged, first }:
  { restored: string[]; moved: string[]; tag: string; folder: string; staged: boolean; first: string }): string {
  const n = restored.length;
  return `${RESTORED_PREFIX}The AI Architect's own files are not yours to change under this licence: `
    + `${n} file${n === 1 ? '' : 's'} restored from ${tag}${staged ? ' (staged)' : ''}, ${moved.length} moved to ${folder}/ `
    + `(${first}). Your own material belongs under clients/<name>/.`;
}

/**
 * ARC-09-C149 — why the signed files of a modified tree cannot be put back, found before anything is tried, or `null`:
 * git cannot run, this checkout holds no `tag`, the tag names another commit than the manifest (`manifestCommit`, when
 * the caller has it), or a changed path is reached through a link that leaves the checkout. `restoreTree` asks it
 * first, and E-32 asks it before it offers `doctor --fix`, so the repair a user is offered is the one that runs.
 */
export function restoreBlocker(root: string, tag: string, modified: readonly TreeDifference[],
  { manifestCommit = null, run = spawnSync, cli = cliSpelling() }:
  { manifestCommit?: string | null; run?: typeof spawnSync; cli?: string } = {}): { reason: string; remedy: string } | null {
  const head = run('git', ['rev-parse', '--verify', '--quiet', `refs/tags/${tag}^{commit}`],
    { cwd: root, encoding: 'utf8', timeout: 60_000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  if (head.error) return { reason: `git could not run (${head.error.message})`, remedy: reinstall };
  const tagged = String(head.stdout ?? '').trim();
  if (head.status !== 0 || !COMMIT.test(tagged)) return { reason: `this checkout holds no ${tag} tag to restore from`, remedy: reinstall };
  if (manifestCommit !== null && tagged !== manifestCommit) {
    return { reason: `the signed manifest for ${tag} names commit ${manifestCommit.slice(0, 7)}, and this checkout's ${tag} `
      + `names ${tagged.slice(0, 7)}`, remedy: reinstall };
  }
  const outside = modified.find((d) => leavesRoot(root, d.path));
  if (outside) {
    return { reason: `${outside.path} is reached through a link that leaves this checkout, so nothing was restored`, remedy: repair(cli) };
  }
  return null;
}

/**
 * Put the signed files back, all or nothing (R3): copy each replaced file aside, `git checkout <tag>` the changed and
 * missing ones, re-hash them, and only then move the extras. Any failure is a refusal with its reason, and nothing is
 * moved; the folder made for it is removed again.
 */
function restoreTree(root: string, tag: string, manifest: ManifestBody, modified: TreeDifference[],
  { local, now, run, cli, projectDir }: { local?: string; now: () => Date; run: typeof spawnSync; cli: string; projectDir?: string },
  hashed: number): Ensured {
  const git = (args: string[], input?: string): SpawnSyncReturns<string> => run('git', args,
    { cwd: root, encoding: 'utf8', input, timeout: 60_000, windowsHide: true,
      stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'] });
  const local0 = localOf(root, local);
  const blocked = restoreBlocker(root, tag, modified, { manifestCommit: manifest.commit, run, cli });
  if (blocked) return refused(tag, blocked.reason, blocked.remedy, hashed, null);
  const stamp = stampFolder(now());
  const folder = join(local0, 'integrity-removed', stamp);
  const put = modified.filter((d) => d.why !== 'extra').map((d) => d.path);
  const extras = modified.filter((d) => d.why === 'extra').map((d) => d.path);
  try {
    mkdirSync(folder, { recursive: true, mode: 0o700 });
    for (const d of modified.filter((x) => x.why === 'changed')) {
      const to = join(folder, ...d.path.split('/'));
      mkdirSync(dirname(to), { recursive: true });
      copyFileSync(join(root, ...d.path.split('/')), to);
    }
  } catch (e) {
    rmSync(folder, { recursive: true, force: true });
    return refused(tag, `the replaced files could not be kept in ${shown(root, folder)}/ (${(e as NodeJS.ErrnoException).code ?? (e as Error).message})`,
      repair(cli), hashed, null);
  }
  if (put.length > 0) {
    const out = git(['--literal-pathspecs', 'checkout', tag, '--pathspec-from-file=-', '--pathspec-file-nul'], `${put.join('\0')}\0`);
    if (out.status !== 0) {
      rmSync(folder, { recursive: true, force: true });
      return refused(tag, `git could not restore ${put.length} file${put.length === 1 ? '' : 's'}: ${gitReason(out)}`, repair(cli), hashed, null);
    }
    const still = checkPaths(root, manifest, put);
    if (still.length > 0) {
      return refused(tag, `${still[0].path} still differs from the signed manifest after git restored it`, reinstall,
        hashed + put.length, null);
    }
  }
  for (const path of extras) {
    try { moveFile(join(root, ...path.split('/')), join(folder, ...path.split('/'))); } catch (e) {
      return refused(tag, `${path} could not be moved to ${shown(root, folder)}/ (${(e as NodeJS.ErrnoException).code ?? (e as Error).message})`,
        repair(cli), hashed, null);
    }
    pruneEmpty(root, path, manifest.covers);
  }
  const headNow = String(git(['rev-parse', '--verify', '--quiet', 'HEAD^{commit}']).stdout ?? '').trim();
  const staged = put.length > 0 && headNow !== manifest.commit;
  const shownFolder = shown(root, folder);
  auditUnder(projectDir, { ts: now().toISOString(), gate: 'integrity', action: 'restored', tag, files: put, moved: extras,
    folder: shownFolder });
  writeVerdict(root, local, tag, manifest);
  const all = [...put, ...extras];
  return {
    state: 'restored', tag, restored: put, moved: extras, folder: shownFolder, staged,
    claudeChanged: all.some((p) => p === 'CLAUDE.md' || p.startsWith('.claude/')),
    line: restoredLine({ restored: put, moved: extras, tag, folder: shownFolder, staged, first: modified[0].path }),
    hashed: hashed + put.length,
  };
}

/**
 * THE ONE FUNCTION (C141): this checkout's integrity, restored when it can be, refused when it cannot.
 *
 *   exempt    a development tree, or no engine checkout here: nothing to check (Q2);
 *   verified  every covered file is as signed — from the stat key alone when nothing moved;
 *   restored  it was not, and now is: the line names what was put back and moved;
 *   refused   it is not, and cannot be: no manifest, one that does not verify or is another release's, no tag, or a
 *             restore that failed. Callers refuse as a refused licence does.
 */
export function ensureIntegrity(root: string, { local, keys = PRODUCT_KEYS, full = false, cli = cliSpelling(),
  now = () => new Date(), run = spawnSync, projectDir, restore = true }: EnsureOptions = {}): Ensured {
  if (!isEngineCheckout(root)) {
    return { state: 'exempt', why: 'not-engine', line: 'Integrity: not checked — not an engine checkout', hashed: 0 };
  }
  const version = versionOf(root);
  if (typeof version === 'string' && isDevVersion(version)) {
    return { state: 'exempt', why: 'dev', line: 'Integrity: not checked — a development tree has no signed manifest', hashed: 0 };
  }
  // No version of record: no release to name, so no tag to check against. The same class as the development tree,
  // and the same bound: whoever edits the version escapes the check, and the manual-clone bound says so. E-32 still
  // FAILs it (ARC-11-C7), from `integrityStatus`.
  if (typeof version !== 'string' || version === '') {
    return { state: 'exempt', why: 'no-version', line: 'Integrity: not checked — package.json names no version', hashed: 0 };
  }
  const tag = `v${version}`;

  // The stat key (the hook and the launcher): nothing moved since the last verified run, so nothing is read.
  let quick = null;
  if (!full && tag) {
    quick = statDifferences(root, local, tag);
    if (quick?.same) return { state: 'verified', tag, hashed: 0 };
  }

  const status = integrityStatusFor(root, { keys, local, full, quick, run });
  if (status.s.state === 'verified') {
    writeVerdict(root, local, status.s.tag, status.manifest as ManifestBody);
    return { state: 'verified', tag: status.s.tag, hashed: status.hashed };
  }
  if (status.s.state !== 'modified') {
    const { reason, remedy } = refusalOf(status.s, cli);
    return refused(tag, reason, remedy, status.hashed, status.s);
  }
  if (!restore) {
    return refused(status.s.tag, `${status.s.modified.length} file${status.s.modified.length === 1 ? '' : 's'} differ from the `
      + `signed manifest for ${status.s.tag}, the first ${status.s.modified[0].path}`, repair(cli), status.hashed, status.s);
  }
  const release = takeLock(root, local, now);
  if (release === null) {
    return refused(status.s.tag, `another snowarch process is restoring this checkout (${shown(root, lockPath(root, local))})`,
      repair(cli), status.hashed, status.s);
  }
  try {
    // Under the lock, again, and the same question: the process that held it may have restored the tree already (R1),
    // and then it rewrote the stat key, which answers here without a read. A stat-keyed caller re-reads only what moved.
    const requick = !full && tag ? statDifferences(root, local, tag) : null;
    if (requick?.same) return { state: 'verified', tag: tag as string, hashed: status.hashed };
    const again = integrityStatusFor(root, { keys, local, full, quick: requick, run });
    const hashed = status.hashed + again.hashed;
    if (again.s.state === 'verified') {
      writeVerdict(root, local, again.s.tag, again.manifest as ManifestBody);
      return { state: 'verified', tag: again.s.tag, hashed };
    }
    if (again.s.state !== 'modified') {
      const { reason, remedy } = refusalOf(again.s, cli);
      return refused(tag, reason, remedy, hashed, again.s);
    }
    return restoreTree(root, again.s.tag, again.manifest as ManifestBody, again.s.modified,
      { local, now, run, cli, projectDir }, hashed);
  } finally {
    release();
  }
}

/**
 * The status the restore acts on, with the manifest it was judged against and how many files were hashed. The stat
 * key re-hashes only the paths it names; a full check, or no usable verdict, hashes them all.
 */
function integrityStatusFor(root: string, { keys, local, full, quick, run }: { keys: readonly ProductKey[]; local?: string;
  full: boolean; quick: { same: true } | { same: false; paths: string[] } | null; run: typeof spawnSync }):
  { s: IntegrityStatus; manifest: ManifestBody | null; hashed: number } {
  if (!full && quick && !quick.same) {
    const version = versionOf(root) as string;
    const tag = `v${version}`;
    const held = cachedManifest(root, tag, { keys, local });
    if (held.state === 'held') {
      const modified = checkPaths(root, held.manifest, quick.paths);
      const checked = Object.keys(held.manifest.files).length;
      return { s: { state: modified.length === 0 ? 'verified' : 'modified', version, tag, checked, modified },
        manifest: held.manifest, hashed: quick.paths.length };
    }
  }
  const s = integrityStatus(root, { keys, local, commitOf: (r, t) => tagCommit(r, t, { run }) });
  const held = s.state === 'verified' || s.state === 'modified' ? cachedManifest(root, s.tag, { keys, local }) : null;
  return { s, manifest: held && held.state === 'held' ? held.manifest : null,
    hashed: s.state === 'verified' || s.state === 'modified' ? s.checked : 0 };
}
