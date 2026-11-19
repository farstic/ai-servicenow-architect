// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C303 — what the cases of "a process that runs as root writes nothing" share.
 *
 * - `asRoot(env)`: the environment for a CHILD that believes it runs as root (tools/snowarch/tests/helpers/fake-root.mjs).
 * - `pretendRoot(t)`: the same for THIS process, for the length of one case, by the one door the product has — `process.geteuid`.
 * - `snapshot(dir)` and `changes(before, after)`: a tree down to the byte, its modes and its modification times, with links not
 *   followed. "Nothing was written" is a statement about the checkout, `.local/` and `.git/` as much as about any one file, and a file
 *   rewritten with the same bytes is a write too, so the modification time is part of what a file is here.
 * - `signedRelease(t)`: a release tree at v9.1.0 whose manifest is signed by the fixture key, linked so its hook, server and CLIs run.
 * - `cliCheckout(t)`: a checkout the engine's CLI really runs in. The CLI takes its root from where its library sits, and a linked
 *   library is the real repository's, so here the library and the entry are COPIES, and the CLI works on the folder it is in.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import { COVERAGE, isCovered, manifestFromArchive, signManifest, writeManifestCache } from '../../tools/snowarch/lib/licence/manifest.mjs';
import { licenceFixture } from '../../tools/snowarch/tests/helpers/licence-hook/index.mjs';
import { LINKED, REAL_ROOT, greenTree, linkInstall, releaseTree } from '../doctor/helpers/tree.mjs';

export { REAL_ROOT };

/** `--import` takes a file: URL on every platform; a bare path is refused on Windows. */
const FAKE_ROOT_URL = pathToFileURL(join(REAL_ROOT, 'tools/snowarch/tests/helpers/fake-root.mjs')).href;

/** `env` with the preload that makes a node child believe it runs as root. Anything already in NODE_OPTIONS stays. */
export function asRoot(env) {
  const out = { ...env };
  out.NODE_OPTIONS = `${out.NODE_OPTIONS ?? ''} --import=${FAKE_ROOT_URL}`.trim();
  return out;
}

/** What `process.geteuid` was when this module loaded, before any case patched it: every restore goes back to this, however many cases patched. */
const ORIGINAL_GETEUID = Object.getOwnPropertyDescriptor(process, 'geteuid');

/** This process answers `geteuid` with `uid` until the case ends. `uid: null` takes the function away, as Windows has none. */
export function pretendRoot(t, uid = 0) {
  if (uid === null) delete process.geteuid; else process.geteuid = () => uid;
  t.after(() => {
    if (ORIGINAL_GETEUID) Object.defineProperty(process, 'geteuid', ORIGINAL_GETEUID); else delete process.geteuid;
  });
}

const sha = (bytes) => createHash('sha1').update(bytes).digest('hex').slice(0, 16);

/** A folder as a map from a `/`-separated path to what is there: its kind, mode, size, time and a digest of its bytes. Links are not followed. */
export function snapshot(dir) {
  const out = new Map();
  const walk = (abs) => {
    for (const name of readdirSync(abs).sort()) {
      const p = join(abs, name);
      const st = lstatSync(p);
      const rel = relative(dir, p).split(sep).join('/');
      if (st.isSymbolicLink()) out.set(rel, `link:${readlinkSync(p)}`);
      else if (st.isDirectory()) { out.set(rel, 'dir'); walk(p); }
      else out.set(rel, `file:${(st.mode & 0o777).toString(8)}:${st.size}:${Math.round(st.mtimeMs)}:${sha(readFileSync(p))}`);
    }
  };
  walk(dir);
  return out;
}

/** What differs between two snapshots, as three lists of paths. All three empty means nothing was written. */
export function changes(before, after) {
  return {
    added: [...after.keys()].filter((k) => !before.has(k)),
    removed: [...before.keys()].filter((k) => !after.has(k)),
    changed: [...after.keys()].filter((k) => before.has(k) && before.get(k) !== after.get(k)),
  };
}

/** `changes`, flattened into the lines a failing case should show. */
export const described = (c) => [...c.added.map((p) => `+ ${p}`), ...c.changed.map((p) => `~ ${p}`), ...c.removed.map((p) => `- ${p}`)];

/** The files under `rel` in the real repository, as `{ path: text }`, for a fixture that commits a copy of them. */
function textTree(rel) {
  const out = {};
  const walk = (dir) => {
    for (const name of readdirSync(join(REAL_ROOT, dir)).sort()) {
      const p = `${dir}/${name}`;
      if (lstatSync(join(REAL_ROOT, p)).isDirectory()) walk(p); else out[p] = readFileSync(join(REAL_ROOT, p), 'utf8');
    }
  };
  walk(rel);
  return out;
}

/** The coverage a fixture's manifest signs: the product's, less the directories the fixture links to the real repository. */
function coverageWithout(linked) {
  return { ...COVERAGE,
    excludes: [...COVERAGE.excludes, ...linked.map((p) => `${p}/`)
      .filter((p) => isCovered(`${p}x`, COVERAGE) || COVERAGE.covers.some((c) => c.startsWith(p)))] };
}

const TAG = 'v9.1.0';

function sign(root, coverage) {
  const manifest = manifestFromArchive(root, TAG, { coverage });
  writeManifestCache(root, { tag: TAG, doc: signManifest(manifest, licenceFixture().primary.privateKey),
    checkedAt: '2026-10-13T12:00:00.000Z', source: 'a fixture' });
  return manifest;
}

/** A release tree, v9.1.0, linked so its hook, server and CLIs run, with its manifest signed by the fixture key. */
export function signedRelease(t, { files = {} } = {}) {
  const root = releaseTree(t, '9.1.0', { files });
  const manifest = sign(root, coverageWithout(LINKED));
  linkInstall(root);
  return { root, manifest };
}

/**
 * A checkout the engine's CLI runs in, as a copy: the library and the entry are committed into it, the heavy read-only parts are linked.
 * `release: true` makes it a signed v9.1.0 (the integrity check has something to verify); otherwise it is a development version, which
 * the integrity check leaves alone, as on a contributor's machine.
 */
export function cliCheckout(t, { release = false, files = {} } = {}) {
  const copied = { ...textTree('tools/snowarch/lib'), ...textTree('tools/snowarch/bin'), ...files };
  const links = LINKED.filter((p) => p !== 'tools/snowarch/lib');
  if (!release) {
    const root = greenTree(t, { mode: 'design' });
    linkInstall(root, { links });
    for (const [rel, text] of Object.entries(copied)) {
      mkdirSync(dirname(join(root, rel)), { recursive: true });
      writeFileSync(join(root, rel), text);
    }
    return { root };
  }
  const root = releaseTree(t, '9.1.0', { files: copied });
  const manifest = sign(root, coverageWithout(links));
  linkInstall(root, { links });
  return { root, manifest };
}

/**
 * Let git settle a checkout it has just been given. Entries written in the same second as the index are "racily clean": the next command
 * that looks re-checks them and REWRITES the index, with the same bytes and a new time, whatever it is asked. A case that compares the
 * index before and after a run must not meet that, so it waits out the second and lets git look once. (A checkout whose stat data is
 * STALE on purpose is made after this, by touching files: that is the case the guard exists for.)
 */
export function settleIndex(root) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1200);
  execFileSync('git', ['-C', root, 'status', '--porcelain'], { stdio: 'ignore' });
}
