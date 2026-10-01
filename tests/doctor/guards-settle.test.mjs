import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tempDir } from '../../tools/snowarch/tests/helpers/temp.mjs';
import { REAL_ROOT } from './helpers/tree.mjs';

/**
 * ARC-09-C77 — the doctor runner's per-check budget and the SessionStart hook's watchdog fire, and
 * neither holds a process whose work has answered.
 *
 * Both were `unref()`'d timers bounding an awaited race. Measured with the instrument that found
 * ARC-09-C76 — a child process, a top-level await, watched work that is a promise pending on nothing
 * — each ended its process in exit 13 before the timer fired: the doctor with no report, the hook with
 * no banner and an exit code that is the one thing Claude Code reads from it. Both are ref'd now, and
 * both were already cleared in `finally` — so the second case of each pair is the load-bearing one: it
 * proves a ref'd timer does not keep a finished process alive.
 *
 * Every case runs in a CHILD process. Under `node:test` the runner holds the event loop, so an awaited
 * unref'd timer completes in-process and an in-process case passes with the defect present.
 */
const RUNNER = pathToFileURL(join(REAL_ROOT, 'tools/snowarch/lib/doctor/runner.mjs')).href;
const HOOK = pathToFileURL(join(REAL_ROOT, 'tools/snowarch/hooks/session-start.mjs')).href;

/** `script` as an ES module in a fresh Node, timed from the outside. */
function child(script, env = process.env) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', env });
  return { ...r, out: `${r.stdout}${r.stderr}`, ms: Date.now() - t0 };
}

/** One check in the doctor's own shape, with the `run` given as source. */
const oneCheck = (run) => `[{ id: 'E-99', title: 'the case', section: 'engine', quick: true, run: ${run} }]`;

test('the doctor\'s per-check budget fires when the check holds nothing open', () => {
  const r = child([
    `const { runChecks } = await import(${JSON.stringify(RUNNER)});`,
    `const { results: [res] } = await runChecks(${oneCheck('() => new Promise(() => {})')}, {}, { timeoutFor: () => 1000 });`,
    'console.log(JSON.stringify({ status: res.status, detail: res.detail }));',
  ].join('\n'));

  assert.equal(/unsettled top-level await/.test(r.out), false, `the doctor ended before its budget fired:\n${r.out}`);
  assert.equal(r.status, 0, r.out);
  assert.deepEqual(JSON.parse(r.stdout.trim()), { status: 'fail', detail: 'timed out after 1 s' });
});

test('a check that answers at once leaves no budget holding the doctor', () => {
  // The DEFAULT budget — 15 s, the one a real run carries. A timer left running would hold the child
  // that long after its only check had answered.
  const r = child([
    `const { runChecks } = await import(${JSON.stringify(RUNNER)});`,
    `const { results: [res] } = await runChecks(${oneCheck("() => ({ status: 'ok', detail: 'fine' })")}, {}, {});`,
    'console.log(res.status);',
  ].join('\n'));

  assert.equal(r.status, 0, r.out);
  assert.equal(r.stdout.trim(), 'ok');
  assert.ok(r.ms < 10_000, `the doctor outlived its only check by ${r.ms} ms — a budget timer is holding it`);
});

/** A checkout the hook re-runs the doctor for: bootstrapped, and no doctor cache. */
function staleRoot(t) {
  const root = tempDir('snowarch-c77-', t);
  for (const f of ['engine.config.json', 'package.json']) copyFileSync(join(REAL_ROOT, f), join(root, f));
  mkdirSync(join(root, '.local'), { recursive: true });
  writeFileSync(join(root, '.local', 'bootstrap-state.json'), '{}\n');
  return root;
}

/** No state-root redirect in the child, so the fixture's own `.local/` is the one the hook reads. */
const hookEnv = () => {
  const { SNOWARCH_STATE_ROOT: _redirect, ...env } = process.env;
  return env;
};

test('the SessionStart watchdog fires when the re-run holds nothing open', (t) => {
  const r = child([
    `const { banner } = await import(${JSON.stringify(HOOK)});`,
    `const res = await banner({ root: ${JSON.stringify(staleRoot(t))}, watchdogMs: 300,`,
    '  run: () => new Promise(() => {}) });',
    'console.log(res.path);',
  ].join('\n'), hookEnv());

  assert.equal(/unsettled top-level await/.test(r.out), false, `the hook ended before its watchdog fired:\n${r.out}`);
  assert.equal(r.status, 0, r.out);
  assert.equal(r.stdout.trim(), 'timeout');
});

test('a re-run that answers at once leaves no watchdog holding the hook', (t) => {
  const r = child([
    `const { banner } = await import(${JSON.stringify(HOOK)});`,
    `const res = await banner({ root: ${JSON.stringify(staleRoot(t))}, watchdogMs: 8000,`,
    "  run: async () => ({ report: { modeLine: 'Mode: design-only', mode: 'design' } }) });",
    'console.log(res.path);',
  ].join('\n'), hookEnv());

  assert.equal(r.status, 0, r.out);
  assert.equal(r.stdout.trim(), 'rerun');
  assert.ok(r.ms < 5_000, `the hook outlived its re-run by ${r.ms} ms — the watchdog is holding it`);
});
