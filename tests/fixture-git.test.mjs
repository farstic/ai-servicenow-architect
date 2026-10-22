// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C218 — no git process outlives the call that wrote a fixture repository.
//
// The 2.2.3 release run, attempt 1 (39660556131, verify ubuntu-latest), failed once in hook-gone.test.mjs:93: copyTree's
// cpSync met ENOENT under '<tmp>/snowarch-doctor-*/.git/objects', 38 ms into the test, right after greenTree's
// `git commit`. On the runners' git 2.55 that commit starts `git maintenance run --auto --quiet --detach`, automatic
// maintenance that goes on after the commit has returned; Apple git 2.39 starts it without --detach and waits for it.
// A probe on the runner reproduced the race only under load, at 2 of 3,008 pairs (the C218 row has the counts), so
// these cases hold the mechanism, deterministically: every repository a test helper creates goes through
// initFixtureRepo, which turns git's automatic maintenance and automatic gc off in it.
//
// ARC-09-C219 — and every repository a test FILE creates. The same detached maintenance makes the test's own removal
// fail: on node 24 `rmSync` reported success over a folder that was still there, at 402 of 3,008 pairs under load
// (temp.mjs's `ESURVIVED`), and at 0 with the two settings (the C219 row has every cell). The test files' calls also
// name their branch, which ARC-09-C14 checked for the raw `git init` they replace.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { greenTree } from './doctor/helpers/tree.mjs';
import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const posix = (p) => p.split(sep).join('/');
const SHARED = 'tools/snowarch/tests/helpers/fixture-git.mjs';
/** The repositories the helpers create, each through initFixtureRepo; a helper that adds one raises this number. */
const HELPER_REPOSITORIES = 10;
const AUTO_MAINTENANCE = /\b(maintenance run|gc)\b.*--auto/;

/** The git processes a call started, read from git's trace2 event stream. */
function childrenOf(fn) {
  const trace = join(tempDir('c218-trace-'), 'trace.json');
  process.env.GIT_TRACE2_EVENT = trace;
  try { fn(); } finally { delete process.env.GIT_TRACE2_EVENT; }
  if (!existsSync(trace)) return [];
  const events = readFileSync(trace, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  return events.filter((e) => e.event === 'child_start').map((e) => e.argv.join(' '));
}

test('ARC-09-C218 — greenTree\'s repository has automatic maintenance and automatic gc off', (t) => {
  const root = greenTree(t);
  const read = (key) => {
    try { return execFileSync('git', ['-C', root, 'config', '--get', key], { encoding: 'utf8' }).trim(); } catch { return '(unset)'; }
  };
  assert.equal(read('maintenance.auto'), 'false', 'maintenance.auto is not false in greenTree\'s repository');
  assert.equal(read('gc.auto'), '0', 'gc.auto is not 0 in greenTree\'s repository');
});

test('ARC-09-C218 — greenTree\'s commit starts no automatic maintenance, where a plain repository\'s does', (t) => {
  const started = childrenOf(() => greenTree(t));
  assert.deepEqual(started.filter((c) => AUTO_MAINTENANCE.test(c)), [],
    'greenTree\'s git calls started automatic maintenance, which can outlive them');
  // The control: the same trace sees the child in a repository without the settings, so a quiet result above is the
  // settings at work and not a trace that sees nothing.
  const plain = tempDir('c218-plain-', t);
  const git = (args) => execFileSync('git', args, { cwd: plain, stdio: 'pipe',
    env: { ...process.env, GIT_AUTHOR_NAME: 'f', GIT_AUTHOR_EMAIL: 'f@example.invalid',
      GIT_COMMITTER_NAME: 'f', GIT_COMMITTER_EMAIL: 'f@example.invalid' } });
  const control = childrenOf(() => {
    git(['init', '-q', '-b', 'main']);
    writeFileSync(join(plain, 'a.txt'), 'a\n');
    git(['add', 'a.txt']);
    git(['commit', '-qm', 'plain']);
  });
  assert.ok(control.some((c) => AUTO_MAINTENANCE.test(c)),
    `a plain repository's commit started no automatic maintenance (children: ${control.join(' | ') || 'none'})`);
  rmSync(plain, { recursive: true, force: true });
});

/** Every `.mjs` of the two test trees, as repository-relative POSIX paths. */
function treeFiles() {
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); } else if (/\.mjs$/.test(e.name)) out.push(posix(relative(ROOT, p)));
    }
  };
  for (const r of ['tests', 'tools/snowarch/tests']) walk(join(ROOT, r));
  return out.sort();
}

/** Helper files: everything under a `helpers/` directory of the two test trees, and the upgrade harness. */
function helperFiles() {
  return treeFiles().filter((f) => f.includes('/helpers/') || f === 'tests/upgrade/harness.mjs');
}

/** Test files: every `*.test.mjs` of the two test trees outside a `helpers/` directory. */
function testFiles() {
  return treeFiles().filter((f) => f.endsWith('.test.mjs') && !f.includes('/helpers/'));
}

/** Raw `git init` calls and initFixtureRepo calls in one file's code, comments left out. */
export function initSites(text) {
  let raw = 0; let shared = 0;
  for (const line of text.split('\n')) {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
    if (/\[\s*'init'|\(\s*'init'/.test(line)) raw += 1;
    if (/\binitFixtureRepo\(/.test(line) && !/export function initFixtureRepo\(/.test(line)) shared += 1;
  }
  return { raw, shared };
}

test('ARC-09-C218 — every repository a test helper creates goes through initFixtureRepo', () => {
  const files = helperFiles();
  assert.ok(files.length >= 5, `${files.length} helper files found: the walk read nothing`);
  const raw = []; let shared = 0;
  for (const f of files) {
    if (f === SHARED) continue;
    const sites = initSites(readFileSync(join(ROOT, f), 'utf8'));
    if (sites.raw > 0) raw.push(`${f}: ${sites.raw}`);
    shared += sites.shared;
  }
  assert.deepEqual(raw, [], 'a helper runs git init itself, so its repository keeps automatic maintenance on');
  assert.equal(shared, HELPER_REPOSITORIES,
    `${shared} initFixtureRepo calls in the helpers, not ${HELPER_REPOSITORIES}: a helper that adds a repository raises the number`);
});

test('ARC-09-C218 — the count finds a raw init that a new helper would add', () => {
  // ASSEMBLED, never written out, as in precondition-asserts.test.mjs: a planted init spelled in full is a bare
  // `git init` in this file for ARC-09-C14's scan to find.
  const init = ['in', 'it'].join('');
  assert.deepEqual(initSites(`  git(root, ['${init}', '-q']);\n  // git(['${init}']) in a comment\n`), { raw: 1, shared: 0 });
  assert.deepEqual(initSites("  initFixtureRepo((a) => git(root, a), root, ['-q']);\n"), { raw: 0, shared: 1 });
});

// ── ARC-09-C219 — the test files' own repositories ─────────────────────────────────────────────────────────────

/** The repositories the test files create, each through initFixtureRepo; a test that adds one raises this number. */
const TEST_REPOSITORIES = 38;
const SELF = 'tests/fixture-git.test.mjs';

/** Test files that keep a raw `git init`, each with its reason. A file is exempt by name, never by pattern. */
const EXEMPT = new Map([
  [SELF, 'this guard plants its own samples, assembled'],
  ['tests/precondition-asserts.test.mjs', 'ARC-09-C14 plants a bare init and a named one as samples of what it scans for'],
  ['tests/architecture-history.test.mjs', 'its repository fetches one tag and never commits, and the case branches on '
    + 'init\'s own status; fetch-only repositories are not measured (ARC-09-C219)'],
]);

/** The initFixtureRepo calls in one file's code that name no branch, by line: neither `-b` nor `--initial-branch=`. */
export function unnamedCalls(text) {
  const out = [];
  text.split('\n').forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
    if (!/\binitFixtureRepo\(/.test(line) || /export function initFixtureRepo\(/.test(line)) return;
    if (!/'-b'|'--initial-branch=/.test(line)) out.push(i + 1);
  });
  return out;
}

test('ARC-09-C219 — every repository a test file creates goes through initFixtureRepo, and names its branch', () => {
  const files = testFiles();
  assert.ok(files.length > 50, `${files.length} test files found: the walk read nothing`);
  const raw = []; const unnamed = []; let shared = 0;
  for (const f of files) {
    if (EXEMPT.has(f)) continue;
    const text = readFileSync(join(ROOT, f), 'utf8');
    const sites = initSites(text);
    if (sites.raw > 0) raw.push(`${f}: ${sites.raw}`);
    shared += sites.shared;
    for (const n of unnamedCalls(text)) unnamed.push(`${f}:${n}`);
  }
  assert.deepEqual(raw, [], 'a test runs git init itself, so its repository keeps automatic maintenance on');
  assert.deepEqual(unnamed, [], 'an initFixtureRepo call names no branch, so its repository takes init.defaultBranch '
    + 'from the machine (ARC-09-C14)');
  assert.equal(shared, TEST_REPOSITORIES,
    `${shared} initFixtureRepo calls in the test files, not ${TEST_REPOSITORIES}: a test that adds a repository raises the number`);
});

test('ARC-09-C219 — the branch rule finds a call that names no branch, and takes either spelling', () => {
  const call = (flags) => `  initFixtureRepo((a) => git(root, a), root, [${flags}]);`;
  assert.deepEqual(unnamedCalls(`${call("'-q'")}\n`), [1]);
  assert.deepEqual(unnamedCalls(`${call("'-q', '-b', 'main'")}\n`), []);
  assert.deepEqual(unnamedCalls(`${call("'-q', '--initial-branch=main'")}\n`), []);
  assert.deepEqual(unnamedCalls(`  // ${call("'-q'").trim()}\n`), [], 'a comment is not a call');
});

test('ARC-09-C219 — each exempt file still holds what it is exempt for', () => {
  // An exemption whose reason has gone is a hole: the file would be skipped with nothing left to excuse.
  for (const f of [...EXEMPT.keys()].filter((k) => k !== SELF)) {
    assert.ok(initSites(readFileSync(join(ROOT, f), 'utf8')).raw > 0, `${f} has no raw init left: drop its exemption`);
  }
});
