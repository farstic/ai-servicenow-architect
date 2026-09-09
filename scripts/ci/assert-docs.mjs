#!/usr/bin/env node
// ARC-03-S11 — what a real corpus must look like on a real runner, asserted once for all three OSes.
//
// One Node script rather than a bash branch and a PowerShell branch: the assertions are identical on
// every platform, and two shells would be two chances for them to drift. The only platform-specific
// part is the long-path check, which is meaningful on Windows and vacuous elsewhere — and it says so
// rather than silently passing.
import { existsSync, readdirSync, statSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative, resolve } from 'node:path';

const root = process.cwd();
const CORPUS = 'vendor/ServiceNowDocs';
const corpus = join(root, CORPUS);
const CAP_BYTES = 350 * 1000 * 1000;

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
  process.stdout.write(`::group::${label}\n`);
  const r = execFileSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
  process.stdout.write(r);
  process.stdout.write('::endgroup::\n');
  return r;
}

const started = Date.now();
try {
  step('docs sync', ['scripts/docs.mjs', 'sync']);
} catch {
  // One retry: a 300 MB fetch across the public internet fails occasionally for reasons that are
  // not this repository's, and a flake that reruns the whole matrix teaches nothing.
  process.stdout.write('::warning::first sync failed, retrying once\n');
  step('docs sync (retry)', ['scripts/docs.mjs', 'sync']);
}
const syncSeconds = (Date.now() - started) / 1000;

const statusJson = execFileSync(process.execPath, ['scripts/docs.mjs', 'status', '--json'],
  { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
step('docs verify', ['scripts/docs.mjs', 'verify']);

const status = JSON.parse(statusJson);
const fail = [];
const check = (ok, what) => { if (!ok) fail.push(what); };

/** Every file in the checkout, with its path length measured two ways. */
function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile()) out.push(p);
  }
  return out;
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
check(status.sparse === 'cone', `sparse mode is ${status.sparse}, expected cone`);
check(status.areasMissing.length === 0, `areas missing: ${status.areasMissing.join(', ')}`);
check(status.sizeBytes <= CAP_BYTES,
  `${Math.round(status.sizeBytes / 1e6)} MB exceeds the ${CAP_BYTES / 1e6} MB cap`);
// The NOTICE claim, on a real checkout on every OS — not only in a fixture.
for (const p of ['LICENSE', 'legal']) check(existsSync(join(corpus, p)), `${p} is missing from the checkout`);

const isWindows = process.platform === 'win32';
let longpaths = null;
if (isWindows) {
  try {
    longpaths = execFileSync('git', ['-C', CORPUS, 'config', '--get', 'core.longpaths'],
      { cwd: root, encoding: 'utf8' }).trim();
  } catch { longpaths = '(unset)'; }
  check(longpaths === 'true', `core.longpaths is "${longpaths}", expected true`);
  // The file has to be readable, not merely listed: a path over MAX_PATH can appear in a directory
  // listing and still fail to open, which is the failure this whole setting exists to prevent.
  check(statSync(longestAbsolute.f).size >= 0, `cannot stat the longest path (${longestAbsolute.n} chars)`);
}

const mb = Math.round(status.sizeBytes / 1e6);
const seconds = syncSeconds.toFixed(1);
const dead = status.citations ? status.citations.dead.length : 'not run';
const summary = `${process.platform} · sparse ${mb} MB · ${status.fileCount} files · ${seconds} s · `
  + `dead ${dead} · longest path ${longestInCorpus.n} in corpus / ${longestAbsolute.n} absolute`
  + (isWindows ? ` · core.longpaths ${longpaths}` : '');

process.stdout.write(`${summary}\n`);
process.stdout.write(`longest: ${relative(corpus, longestInCorpus.f)}\n`);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `- ${summary}\n`);
}

if (fail.length > 0) {
  for (const f of fail) process.stdout.write(`::error::assert-docs: ${f}\n`);
  process.exit(1);
}
process.stdout.write('assert-docs: all assertions hold\n');
