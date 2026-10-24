#!/usr/bin/env node
// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-03-S11 — what a real corpus must look like on a real runner, asserted once for all three OSes.
//
// One Node script rather than a bash branch and a PowerShell branch: the assertions are identical on
// every platform, and two shells would be two chances for them to drift. The only platform-specific
// part is the long-path check, which is meaningful on Windows and vacuous elsewhere — and it says so
// rather than silently passing.
//
// ARC-09-C244 — the workflow names the docs mode in `DOCS_MODE`, and each mode is asserted for what it
// must be. `full` is the whole corpus, with every file of the pinned tree on disk. `sparse` is the cone
// of cited areas. `switch` syncs sparse and then full, which is what an upgrade does once to an install
// that was sparse, and it reports what the second sync added.
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync, writeSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative, resolve, sep } from 'node:path';

const root = process.cwd();
const CORPUS = 'vendor/ServiceNowDocs';
const corpus = join(root, CORPUS);

const MODES = ['full', 'sparse', 'switch'];
const MODE = process.env.DOCS_MODE;
if (!MODES.includes(MODE)) {
  writeSync(1, `::error::assert-docs: DOCS_MODE is "${MODE ?? ''}", expected one of ${MODES.join(', ')}\n`);
  process.exit(2);
}
/** `full` and `switch` both end with the whole corpus; only `sparse` ends with the cone. */
const WHOLE = MODE !== 'sparse';
// The sparse cap is ARC-03-S11's: 350 MB over a cone of about 195 MB. The whole corpus is about 293 MB
// of files at aa447ce, and its cap leaves room of the same kind, so a corpus that doubled upstream
// would fail here rather than pass unnoticed.
const CAP_BYTES = (WHOLE ? 500 : 350) * 1000 * 1000;

/**
 * Sync, describe, verify, assert — all of it, in Node.
 *
 * Every step used to be `shell: bash`, which on Windows means Git Bash. That made acceptance
 * criterion 5 VACUOUS: the cell that strips Git Bash from PATH still ran its steps under bash,
 * because `shell: bash` resolves independently of PATH. (And the runner has a second bash in
 * System32 regardless — `bash still reachable: True` even after both Git directories were removed.)
 *
 * So the workflow now invokes this file and nothing else, with the platform's default shell. There
 * is no shell logic left to depend on: the retry, the timing and the assertions are all here.
 */
function step(label, args) {
  writeSync(1, `::group::${label}\n`);
  const r = execFileSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
  writeSync(1, r);
  writeSync(1, '::endgroup::\n');
  return r;
}

/** One sync in `mode`, retried once, and the seconds it took. */
function sync(mode) {
  const label = `docs sync --mode ${mode}`;
  const started = Date.now();
  try {
    step(label, ['scripts/docs.mjs', 'sync', '--mode', mode]);
  } catch {
    // One retry: a fetch of a few hundred MB across the public internet fails occasionally for reasons
    // that are not this repository's, and a flake that reruns the whole matrix teaches nothing.
    writeSync(1, `::warning::${label} failed, retrying once\n`);
    step(`${label} (retry)`, ['scripts/docs.mjs', 'sync', '--mode', mode]);
  }
  return (Date.now() - started) / 1000;
}

const describe = () => JSON.parse(execFileSync(process.execPath, ['scripts/docs.mjs', 'status', '--json'],
  { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));

/** Every file under `dir`, with any `.git` entry left out. */
function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile()) out.push(p);
  }
  return out;
}

/**
 * The bytes `paths` hold, and the bytes the disk gives them. `allocated` is null where the platform
 * reports no blocks (Windows), rather than a guess that would read as a measurement.
 */
function usage(paths) {
  let size = 0, allocated = 0, blocks = true;
  for (const p of paths) {
    const s = statSync(p);
    size += s.size;
    if (typeof s.blocks === 'number') allocated += s.blocks * 512; else blocks = false;
  }
  return { size, allocated: blocks ? allocated : null };
}

/** The corpus's git directory, wherever the sync put it (absorbed into the superproject's). */
const gitDir = () => execFileSync('git', ['-C', CORPUS, 'rev-parse', '--absolute-git-dir'],
  { cwd: root, encoding: 'utf8' }).trim();

/** Every path the pinned tree holds, read from the clone's own trees: no blob is fetched for it. */
const treeFiles = () => execFileSync('git', ['-C', CORPUS, 'ls-tree', '-r', '--name-only', '-z', 'HEAD'],
  { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\0').filter(Boolean);

let before = null;
if (MODE === 'switch') {
  const seconds = sync('sparse');
  const s = describe();
  before = { seconds, files: s.fileCount, tree: usage(walk(corpus)), git: usage(walk(gitDir())) };
}
const syncSeconds = sync(WHOLE ? 'full' : 'sparse');

const status = describe();

const fail = [];
const check = (ok, what) => { if (!ok) fail.push(what); };

// `docs verify` is one assertion among the others: a failure is recorded with what it printed, and the cell goes
// on measuring. C244's first run lost every full cell's bytes, files and longest-path read to a verify that threw.
try {
  step('docs verify', ['scripts/docs.mjs', 'verify']);
} catch (e) {
  writeSync(1, `${e.stdout ?? ''}${e.stderr ?? ''}::endgroup::\n`);
  check(false, `docs verify exited ${e.status ?? 'abnormally'} — its output is in the group above`);
}

const files = walk(corpus);
// Two lengths, because they answer different questions and S-07 was misread once over exactly this:
// the length INSIDE the corpus is a property of what ServiceNow publishes; the length on disk is
// what MAX_PATH actually sees, and it grows with wherever the checkout happens to live.
const longestInCorpus = files.reduce((a, f) => {
  const n = relative(corpus, f).length;
  return n > a.n ? { n, f } : a;
}, { n: 0, f: '' });
const longestAbsolute = files.reduce((a, f) => (resolve(f).length > a.n ? { n: resolve(f).length, f } : a),
  { n: 0, f: '' });

check(status.present === true, 'the corpus is absent');
check(status.headMatchesPin === true, `HEAD ${status.head} != pin ${status.pin}`);
check(status.pinMatchesGitlink !== false, 'the pin and the gitlink disagree');
check(status.familyMatches === true, `branch ${status.branch} != family ${status.family}`);
const shape = WHOLE ? 'full' : 'cone';
check(status.sparse === shape, `sparse mode is ${status.sparse}, expected ${shape}`);
check(status.areasMissing.length === 0, `areas missing: ${status.areasMissing.join(', ')}`);
check(status.sizeBytes <= CAP_BYTES,
  `${Math.round(status.sizeBytes / 1e6)} MB exceeds the ${CAP_BYTES / 1e6} MB cap`);
// The NOTICE claim, on a real checkout on every OS — not only in a fixture.
for (const p of ['LICENSE', 'legal']) check(existsSync(join(corpus, p)), `${p} is missing from the checkout`);

let tree = null;
if (WHOLE) {
  // The whole corpus means every file of the pinned tree, not a count that happens to look right: a
  // file that did not land (a path past MAX_PATH, a name the file system refused) is named here.
  tree = treeFiles();
  const onDisk = new Set(files.map((f) => relative(corpus, f).split(sep).join('/')));
  const missing = tree.filter((p) => !onDisk.has(p));
  check(missing.length === 0,
    `${missing.length} of the tree's ${tree.length} files are not on disk, first: ${missing.slice(0, 3).join(', ')}`);
  check(files.length === tree.length, `${files.length} files on disk, the pinned tree holds ${tree.length}`);
}

// The longest file has to be READ, not merely listed: a path over MAX_PATH can appear in a directory
// listing and still fail to open, which is the failure the long-path setting exists to prevent.
let longestRead = false;
try { longestRead = readFileSync(longestAbsolute.f, 'utf8').length > 0; } catch { /* reported below */ }
check(longestRead, `cannot read the longest path (${longestAbsolute.n} chars)`);

const isWindows = process.platform === 'win32';
let longpaths = null;
if (isWindows) {
  try {
    longpaths = execFileSync('git', ['-C', CORPUS, 'config', '--get', 'core.longpaths'],
      { cwd: root, encoding: 'utf8' }).trim();
  } catch { longpaths = '(unset)'; }
  check(longpaths === 'true', `core.longpaths is "${longpaths}", expected true`);
}

const mb = (b) => (b === null ? '—' : String(Math.round(b / 1e6)));
const treeUse = usage(files);
const gitUse = usage(walk(gitDir()));
const seconds = syncSeconds.toFixed(1);
const dead = status.citations ? status.citations.dead.length : 'not run';
const allocated = (t, g) => (t.allocated === null || g.allocated === null ? null : t.allocated + g.allocated);
const onDiskMb = mb(allocated(treeUse, gitUse));
const addedOnDisk = before && allocated(treeUse, gitUse) !== null && allocated(before.tree, before.git) !== null
  ? allocated(treeUse, gitUse) - allocated(before.tree, before.git) : null;
const summary = `${process.platform} · ${MODE} ${mb(status.sizeBytes)} MB · ${status.fileCount} files · `
  + `${seconds} s · git dir ${mb(gitUse.size)} MB · on disk ${onDiskMb} MB · dead ${dead} · `
  + `longest path ${longestInCorpus.n} in corpus / ${longestAbsolute.n} absolute`
  + (tree ? ` · tree ${tree.length} files` : '')
  + (isWindows ? ` · core.longpaths ${longpaths}` : '')
  + (before ? ` · the switch added ${mb(treeUse.size - before.tree.size)} MB of files, `
    + `${status.fileCount - before.files} files and ${mb(gitUse.size - before.git.size)} MB of git dir `
    + `(${mb(addedOnDisk)} MB on disk) in ${seconds} s, after a sparse sync of ${before.seconds.toFixed(1)} s` : '');

writeSync(1, `${summary}\n`);
writeSync(1, `longest: ${relative(corpus, longestInCorpus.f)}\n`);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `- ${summary}\n`);
}

if (fail.length > 0) {
  for (const f of fail) writeSync(1, `::error::assert-docs: ${f}\n`);
  process.exit(1);
}
writeSync(1, 'assert-docs: all assertions hold\n');
