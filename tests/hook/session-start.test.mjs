// ARC-08-S08 — the SessionStart banner: what it prints, how fast, and what it never does.
//
// Two shapes of case, deliberately. The SUBPROCESS ones spawn the hook exactly as Claude Code
// does, because three of its promises are process-level — exit 0, nothing on stderr, and a budget
// measured with Node's own start-up included — and none of those can be observed in-process. The
// IN-PROCESS ones inject the doctor runner, because a watchdog case must hang on purpose and a
// failure case must throw on purpose, and neither is something to arrange by breaking a checkout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { banner, MAX_AGE_MS, UPGRADE_MAX_AGE_MS, WATCHDOG_MS } from '../../tools/snowarch/hooks/session-start.mjs';
import { BANNER } from '../../tools/snowarch/lib/text.mjs';
import { cachePath, inputsPath } from '../../tools/snowarch/lib/doctor-cache.mjs';
import { doctorCommand } from '../../tools/snowarch/lib/doctor/index.mjs';
import { greenTree, linkInstall, readJson, REAL_ROOT, writeJson } from '../doctor/helpers/tree.mjs';
import { tempDir } from '../../tools/snowarch/tests/helpers/temp.mjs';

/**
 * The hook INSIDE the fixture, never the repository's own.
 *
 * It resolves the root from its own file location — deliberately, so that a session whose
 * `CLAUDE_PROJECT_DIR` points elsewhere still describes the checkout it lives in. Which means a
 * test that spawned the repository's copy would be testing the repository, and did: every
 * subprocess case here first reported "this checkout has not been bootstrapped" about THIS repo.
 */
const hookIn = (root) => join(root, 'tools/snowarch/hooks/session-start.mjs');
const STDIN = '{"hook_event_name":"SessionStart","source":"startup"}';

// Assembled, never spelled: a test file that writes a credential out becomes a hit in the sweep
// that reads this very file.
const FIXTURE_USER = ['someone', '@', 'corp.example.com'].join('');
const FIXTURE_PASS = ['hunter', '2', 'hunter', '2'].join('');

/** Every invocation's stdout, for the one grep AC 8 asks for. */
const seen = [];

/** The only lines that may follow the Mode line. Anything else is the banner inventing prose. */
const isNudge = (line) => [
  BANNER.firstRun, BANNER.staleRegistration,
].includes(line) || /^A newer release is available \(/.test(line) || /^Doctor: \d+ FAIL /.test(line);

/**
 * A run that is slower than the watchdog and still finishes.
 *
 * REF'D on purpose. An unref'd timer does not keep the loop alive, so on a fast runner the loop
 * drained before this settled and node:test reported "Promise resolution is still pending but the
 * event loop has already resolved" — cancelling every case after it. The cost of the ref is that
 * the file waits 300 ms once; the cost of the unref was six unrelated red cells.
 */
const hangs = (ms) => new Promise((resolve) => {
  setTimeout(() => resolve({ report: { modeLine: 'Mode: late' } }), ms);
});

/** The hook as Claude Code runs it: a child, with the event JSON on stdin. */
function runHook(root, { stdin = STDIN, env = {} } = {}) {
  const started = process.hrtime.bigint();
  const r = spawnSync(process.execPath, [hookIn(root)], {
    cwd: root, input: stdin, encoding: 'utf8', env: { ...process.env, ...env },
  });
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  seen.push(r.stdout ?? '');
  return { ...r, ms, lines: (r.stdout ?? '').trim().split('\n').filter(Boolean) };
}

/** A checkout with a doctor cache, written by the doctor itself — never hand-rolled. */
async function bootstrapped(t, { store = false } = {}) {
  const root = linkInstall(greenTree(t, { mode: store ? 'live' : 'design' }));
  if (store) {
    writeJson(root, '.local/instances.json', {
      version: 1,
      defaultInstance: 'pdi',
      instances: {
        pdi: {
          url: 'https://dev12345.service-now.com',
          environment: 'pdi',
          auth: { method: 'basic', username: FIXTURE_USER, password: FIXTURE_PASS },
          preset: 'custom',
          flags: {},
          toolPackage: 'full',
          maxRecords: 100,
          prodWriteAck: false,
        },
      },
    });
  }
  await doctorCommand({ flags: { quick: true, 'no-network': true, json: true },
    out: { write: () => {} }, cwd: root, input: { isTTY: false } });
  return root;
}

test('AC 1 — a fresh cache prints exactly one Mode line, fast', async (t) => {
  const root = await bootstrapped(t);
  assert.ok(existsSync(cachePath(root)), 'precondition: the doctor wrote a cache');
  assert.ok(existsSync(inputsPath(root)), 'precondition: and its inputs');

  const r = runHook(root);
  assert.equal(r.status, 0);
  assert.equal(r.stderr, '', 'the hook wrote to stderr');
  // The FIRST line is the Mode line, and every other line is a known nudge. Asserting "exactly
  // one" made this a test about the fixture's health: a runner without the docs submodule has a
  // failing corpus check, and the doctor-FAIL nudge is then correct output.
  assert.match(r.lines[0], /^Mode: /);
  for (const line of r.lines.slice(1)) assert.ok(isNudge(line), `unexpected banner line: ${line}`);

  // The budget, asserted where it is measurable: a developer laptop under a full suite is not the
  // machine the number describes.
  if (process.env.CI) assert.ok(r.ms < 1000, `the fast path took ${Math.round(r.ms)} ms`);
});

test('AC 1 — the fast path reads two files and imports no part of the doctor', async (t) => {
  const root = await bootstrapped(t);
  // `--trace-event`-free proof: the doctor's own modules print nothing, so the observable is the
  // TIME. What is asserted here instead is structural — the fast path returns `cache`, which is
  // the branch that never reaches the lazy import.
  const result = await banner({ root, run: () => { throw new Error('the doctor was imported'); } });
  assert.equal(result.path, 'cache');
  assert.match(result.lines[0], /^Mode: /);
  for (const line of result.lines.slice(1)) assert.ok(isNudge(line), `unexpected: ${line}`);
});

/**
 * ARC-09-S04's carry-over, closed here: the fast path SPAWNS NOTHING.
 *
 * S04's first version put `versionInfo()` in the doctor's header, which asks git four questions —
 * and one of them, `git status`, walks 35,000 corpus files. The banner went from 614 ms to 1188 ms
 * on macOS and over budget on Windows before `{ full: false }` cut it to 122 ms. The structural
 * rule that keeps it there: the cache path reads two JSON files and returns, and `versionInfo` is
 * reached only from the doctor, which only the re-run path imports.
 *
 * Proved by taking git AWAY. A PATH with no git is a machine where any spawn of it fails, so a
 * fast path that still prints its Mode line cannot have asked git anything — and a structural
 * assertion (the branch returns `cache`) could not tell the difference between "no spawn" and "a
 * spawn whose answer was ignored".
 */
test('AC 1 — the fast path spawns nothing: it prints from the cache with git off PATH', async (t) => {
  const root = await bootstrapped(t);
  assert.ok(existsSync(cachePath(root)), 'precondition: there is a cache to print from');

  // Rebuilt, never filtered: a filter that missed one entry would test the ordinary path again
  // and pass. `PATHEXT` stays so Windows can still find `node.exe` by the absolute path used.
  const empty = tempDir('snowarch-no-git-', t);
  const r = runHook(root, { env: { PATH: empty, Path: empty } });

  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '');
  assert.match(r.lines[0], /^Mode: /);
  for (const line of r.lines.slice(1)) assert.ok(isNudge(line), `unexpected banner line: ${line}`);
  // And the line is the CACHE's, not a fallback: a hook that had fallen back would say so.
  assert.equal(r.lines[0], readJson(root, '.local/doctor-last.json').modeLine);
});

// AC 2.
test('a changed input makes the next invocation re-run and rewrite the cache', async (t) => {
  const root = await bootstrapped(t);
  const before = statSync(cachePath(root)).mtimeMs;

  // Touch `.mcp.json` — one of the six recorded inputs.
  const future = new Date(Date.now() + 2000);
  utimesSync(join(root, '.mcp.json'), future, future);

  const r = runHook(root);
  assert.equal(r.status, 0);
  assert.match(r.lines[0], /^Mode: /);
  assert.notEqual(statSync(cachePath(root)).mtimeMs, before, 'the cache was not rewritten');
  assert.equal(readJson(root, '.local/doctor-last.inputs.json').mcpJsonMtime,
    Math.round(statSync(join(root, '.mcp.json')).mtimeMs), 'the inputs file kept the old mtime');
  if (process.env.CI) assert.ok(r.ms < 3000, `the re-run took ${Math.round(r.ms)} ms`);
});

test('a cache older than a day is stale however unchanged the inputs are', async (t) => {
  const root = await bootstrapped(t);
  const cache = readJson(root, '.local/doctor-last.json');
  writeJson(root, '.local/doctor-last.json',
    { ...cache, at: new Date(Date.now() - MAX_AGE_MS - 60_000).toISOString() });

  let ran = 0;
  const result = await banner({ root, run: async () => { ran += 1; return { report: cache.report }; } });
  assert.equal(ran, 1, 'a day-old cache was served from the fast path');
  assert.equal(result.path, 'rerun');
});

// AC 3.
test('with no cache the hook re-runs, and the first-run nudge is printed once', async (t) => {
  const root = await bootstrapped(t);
  rmSync(cachePath(root));
  rmSync(inputsPath(root));

  const first = runHook(root);
  assert.equal(first.status, 0);
  assert.match(first.lines[0], /^Mode: /);
  assert.ok(first.lines.includes(BANNER.firstRun), first.stdout);

  const second = runHook(root);
  assert.equal(second.lines.includes(BANNER.firstRun), false,
    'the first-run nudge was printed on a second session');
});

// AC 4.
test('the upgrade nudge names the tag, and an absent file is no nudge', async (t) => {
  const root = await bootstrapped(t);
  assert.equal(runHook(root).lines.some((l) => /newer release/.test(l)), false,
    'an upgrade nudge with no upgrade-check.json');

  writeJson(root, '.local/upgrade-check.json',
    { behind: true, latestTag: 'v2.1.0', checkedAt: new Date().toISOString() });
  const r = runHook(root);
  assert.ok(r.lines.includes(BANNER.upgrade('v2.1.0')), r.stdout);

  writeJson(root, '.local/upgrade-check.json',
    { behind: false, latestTag: 'v2.1.0', checkedAt: new Date().toISOString() });
  assert.equal(runHook(root).lines.some((l) => /newer release/.test(l)), false,
    'a nudge for a checkout that is not behind');
});

test('the stale-registration nudge fires for THIS folder only', async (t) => {
  const root = await bootstrapped(t);
  const cache = readJson(root, '.local/doctor-last.json');

  const withOther = { ...cache.report, stale: { claudeJsonEntries: [
    { scope: 'other', project: '~/old', name: 'x', command: 'claude mcp remove x -s local' }] } };
  writeJson(root, '.local/doctor-last.json', { ...cache, report: withOther });
  const other = await banner({ root });
  assert.equal(other.lines.includes(BANNER.staleRegistration), false,
    'another project\'s leftovers nudged this session');

  const withThis = { ...cache.report, stale: { claudeJsonEntries: [
    { scope: 'this-folder', project: '~/here', name: 'x', command: 'claude mcp remove x -s local' }] } };
  writeJson(root, '.local/doctor-last.json', { ...cache, report: withThis });
  const here = await banner({ root });
  assert.ok(here.lines.includes(BANNER.staleRegistration), here.lines.join('\n'));
});

test('the doctor-FAIL nudge counts the failures the cache recorded', async (t) => {
  const root = await bootstrapped(t);
  const cache = readJson(root, '.local/doctor-last.json');
  writeJson(root, '.local/doctor-last.json',
    { ...cache, summary: { ...cache.summary, fail: 3 } });
  const r = await banner({ root });
  assert.ok(r.lines.includes(BANNER.doctorFail(3)), r.lines.join('\n'));
});

// AC 5.
test('a doctor that throws becomes one honest line, and the session still starts', async (t) => {
  const root = await bootstrapped(t);
  rmSync(cachePath(root));
  rmSync(inputsPath(root));
  await assert.rejects(() => banner({ root, run: async () => { throw new TypeError('boom'); } }),
    /boom/, 'the in-process form rethrows; the CLI wrapper is what turns it into a line');

  // The CLI wrapper's promise, in a child, provoked by a REAL fault rather than a test-only seam:
  // an `engine.config.json` that does not parse makes the re-run branch throw where the config is
  // loaded. What is asserted is the promise — one line, exit 0, nothing on stderr.
  writeFileSync(join(root, 'engine.config.json'), '{ not json');
  const r = runHook(root);
  assert.equal(r.status, 0);
  assert.equal(r.stderr, '');
  assert.equal(r.lines.length, 1, r.stdout);
  assert.match(r.lines[0], /^Mode: unknown — session banner failed \([A-Za-z]*Error\); run \.\/snowarch doctor$/);
});

test('a doctor that hangs hits the watchdog, and the old line is marked old', async (t) => {
  const root = await bootstrapped(t);
  const cache = readJson(root, '.local/doctor-last.json');
  // Stale by age, so the fast path does not answer.
  writeJson(root, '.local/doctor-last.json',
    { ...cache, at: new Date(Date.now() - MAX_AGE_MS - 60_000).toISOString() });

  // The hang SETTLES eventually — 400 ms against a 50 ms watchdog. A promise that never resolves
  // leaves node:test with pending work when the file ends, and it cancels every case after it:
  // on CI that took four unrelated tests down with it. The watchdog still wins by 350 ms, which
  // is the whole claim.
  const started = Date.now();
  const r = await banner({ root, watchdogMs: 50, run: () => hangs(300) });
  assert.ok(Date.now() - started < 2000, 'the watchdog did not fire');
  assert.equal(r.path, 'timeout');
  assert.equal(r.lines[0], `${cache.modeLine}${BANNER.staleSuffix}`);
});

test('a hang with no cache at all still says something true', async (t) => {
  const root = await bootstrapped(t);
  rmSync(cachePath(root));
  rmSync(inputsPath(root));
  const r = await banner({ root, watchdogMs: 50, run: () => hangs(300) });
  assert.equal(r.lines[0], BANNER.timedOut);
  assert.ok(WATCHDOG_MS < 10_000, 'the watchdog must fire before the hook timeout');
});

test('a checkout that was never bootstrapped says so, and runs no doctor', async (t) => {
  const root = greenTree(t, { mode: 'design' });
  rmSync(join(root, '.local'), { recursive: true, force: true });
  let ran = 0;
  const r = await banner({ root, run: async () => { ran += 1; return { report: {} }; } });
  assert.equal(ran, 0, 'a doctor ran on a checkout with no state');
  assert.equal(r.path, 'unbootstrapped');
  assert.match(r.lines[0], /^Mode: unknown — this checkout has not been bootstrapped/);
});

test('the hook prints with no stdin at all', async (t) => {
  const root = await bootstrapped(t);
  const r = runHook(root, { stdin: '' });
  assert.equal(r.status, 0);
  assert.match(r.lines[0], /^Mode: /);
});

// AC 8 — every invocation this file made, in one grep.
test('nothing the hook printed carries the fixture credentials', async (t) => {
  const root = await bootstrapped(t, { store: true });
  runHook(root);
  assert.ok(seen.length > 6, `only ${seen.length} invocations were captured`);
  const all = seen.join('\n');
  assert.equal(all.includes(FIXTURE_PASS), false, 'a password reached the banner');
  assert.equal(all.includes(FIXTURE_USER), false, 'a username reached the banner');
  assert.equal(/https?:\/\/[a-z0-9-]+\.service-now\.com/i.test(all), false);
});

test('the nudge strings the hook prints are the ones text.json exports', () => {
  const text = JSON.parse(readFileSync(join(REAL_ROOT, 'tools/snowarch/lib/text.json'), 'utf8'));
  assert.equal(text.banner.firstRun, BANNER.firstRun);
  assert.equal(text.banner.staleRegistration, BANNER.staleRegistration);
  assert.equal(text.banner.upgrade, BANNER.upgrade('v2.1.0'));
  assert.equal(text.banner.doctorFail, BANNER.doctorFail(2));
  assert.equal(text.banner.timedOut, BANNER.timedOut);
});

// ARC-09-S07 — the freshness rule, and the one number it depends on.
test('an upgrade check older than a week is silence, not a hedged nudge', async (t) => {
  const root = await bootstrapped(t);
  const days = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

  writeJson(root, '.local/upgrade-check.json',
    { behind: true, latestTag: 'v2.1.0', checkedAt: days(6) });
  assert.ok(runHook(root).lines.includes(BANNER.upgrade('v2.1.0')), 'six days old is still fresh');

  writeJson(root, '.local/upgrade-check.json',
    { behind: true, latestTag: 'v2.1.0', checkedAt: days(8) });
  assert.equal(runHook(root).lines.some((l) => /newer release/.test(l)), false,
    'eight days old must produce NO line — a nudge nobody has rechecked is one a reader learns to skip');

  // A clock that went backwards, which is a real state on a laptop that has just synced time.
  writeJson(root, '.local/upgrade-check.json',
    { behind: true, latestTag: 'v2.1.0', checkedAt: days(-3) });
  assert.equal(runHook(root).lines.some((l) => /newer release/.test(l)), false,
    'a check from the future is not fresh');

  // And a file with no `checkedAt` at all — the shape ARC-08-S08 fixed has three keys, and a
  // writer that omitted one must not pin the nudge on for ever.
  writeJson(root, '.local/upgrade-check.json', { behind: true, latestTag: 'v2.1.0' });
  assert.equal(runHook(root).lines.some((l) => /newer release/.test(l)), false);
});

test('the hook and the library agree on how old a check may be', async () => {
  // The hook inlines the constant on purpose — its budget is 300 ms and it imports nothing on the
  // fast path — so the two are compared here rather than trusted to stay equal.
  const { MAX_AGE_MS: LIB_MAX_AGE } = await import('../../tools/snowarch/lib/upgrade-check.mjs');
  assert.equal(UPGRADE_MAX_AGE_MS, LIB_MAX_AGE);
  assert.equal(UPGRADE_MAX_AGE_MS, 7 * 24 * 60 * 60 * 1000);
});
