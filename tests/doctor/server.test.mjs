// ARC-08-S04 — the engine side of the server section: what is available, and what is adopted.
//
// Nothing here re-implements a server check, and nothing here spawns a server: the module is
// INJECTED. What is being proved is the seam — that an absent `dist/`, absent dependencies and a
// working module produce three different reports, that a design-only checkout's skips are not
// failures, and that a result crossing the boundary keeps every field a reader acts on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  adopt, availability, DEPS_MISSING, DESIGN_ONLY_HEADER, DIST_MISSING, DOCTOR_ENTRY,
  SERVER_CHECK_IDS, serverChecks,
} from '../../tools/snowarch/lib/doctor/checks/server.mjs';
import { serverBlock } from '../../tools/snowarch/lib/doctor/checks/index.mjs';
import { renderText, sectionNote } from '../../tools/snowarch/lib/doctor/report-text.mjs';
import { contextFor, greenTree, REAL_ROOT, runById } from './helpers/tree.mjs';

const checks = serverChecks();

/** A server report with one result per id, so adoption is exercised for every check. */
const report = (over = {}) => ({
  product: 'snowarch',
  version: '2.0.0-test',
  mode: 'configured',
  checks: SERVER_CHECK_IDS.map((id) => ({ id, title: `t-${id}`, status: 'ok',
    detail: `${id} answered`, fixable: false })),
  summary: { ok: SERVER_CHECK_IDS.length, warn: 0, fail: 0, skip: 0 },
  instances: [{ label: 'pdi', environment: 'pdi', preset: 'pdi-developer', status: 'loaded',
    username: 's***@corp.example.com' }],
  ...over,
});

/** A context whose server module is a stub: no dependency on this machine's `node_modules`. */
const withModule = (root, runServerDoctor, over = {}) => contextFor(root, {
  serverAvailability: { state: 'ready', entry: join(root, 'x'), packageDir: 'packages/snowarch' },
  importServer: async () => ({ runServerDoctor }),
  ...over,
});

test('the availability matrix has three states, decided before anything is imported', async (t) => {
  const root = greenTree(t);
  const config = contextFor(root).config;

  const noDist = availability(root, config, { exists: () => false, deps: () => true });
  assert.equal(noDist.state, 'no-dist');
  const noDeps = availability(root, config, { exists: () => true, deps: () => false });
  assert.equal(noDeps.state, 'no-deps');
  const ready = availability(root, config, { exists: () => true, deps: () => true });
  assert.equal(ready.state, 'ready');
  // The path it looks at is the packageDir the config names, plus the module's own location.
  assert.equal(ready.entry, join(root, config.mcp.packageDir, ...DOCTOR_ENTRY));
});

// AC 2 — a design-only checkout before `npm ci`.
test('with no dependencies every SV check skips, nothing fails, and the header says why', async (t) => {
  const root = greenTree(t, { mode: 'design' });
  const ctx = contextFor(root, {
    serverAvailability: { state: 'no-deps', entry: join(root, 'x'), packageDir: 'packages/snowarch' },
  });
  const results = [];
  for (const id of SERVER_CHECK_IDS) results.push({ id, ...(await adopt(ctx, id)) });

  assert.deepEqual([...new Set(results.map((r) => r.status))], ['skip']);
  assert.deepEqual([...new Set(results.map((r) => r.detail))], [DEPS_MISSING]);
  assert.equal(sectionNote('server', DEPS_MISSING), DESIGN_ONLY_HEADER);

  const text = renderText({
    report: { checks: results.map((r) => ({ ...r, section: 'server', title: 'x' })),
      summary: { ok: 0, warn: 0, fail: 0, skip: results.length }, options: {}, ranAt: '', version: '0' },
    checks,
  });
  assert.match(text, /server \(skipped — design-only\)/);
});

// AC 3 — a live checkout with the dependencies removed.
test('in live mode the missing dependencies are SV-01\'s failure, and fixable', async (t) => {
  const root = greenTree(t, { mode: 'live' });
  const ctx = contextFor(root, {
    mode: 'live',
    serverAvailability: { state: 'no-deps', entry: join(root, 'x'), packageDir: 'packages/snowarch' },
  });
  const sv01 = await adopt(ctx, 'SV-01');
  assert.equal(sv01.status, 'fail');
  assert.match(sv01.detail, new RegExp(DEPS_MISSING));
  assert.equal(sv01.command, './snowarch doctor --fix');
  assert.deepEqual(sv01.data.fix, { kind: 'deps-missing' });
  assert.equal(checks.find((c) => c.id === 'SV-01').fixable, true);

  for (const id of SERVER_CHECK_IDS.filter((x) => x !== 'SV-01')) {
    assert.equal((await adopt(ctx, id)).status, 'skip', `${id} did not skip`);
  }
});

test('an absent dist is SV-01\'s failure with the checkout command, whatever the mode', async (t) => {
  const root = greenTree(t, { mode: 'live' });
  const ctx = contextFor(root, {
    mode: 'live',
    serverAvailability: { state: 'no-dist', entry: join(root, 'x'), packageDir: 'packages/snowarch' },
  });
  const sv01 = await adopt(ctx, 'SV-01');
  assert.equal(sv01.status, 'fail');
  assert.match(sv01.detail, new RegExp(DIST_MISSING));
  assert.match(sv01.command, /git checkout -- packages\/snowarch\/dist/);
  assert.equal((await adopt(ctx, 'SV-05')).status, 'skip');
});

test('a dependency that is missing deeper than the SDK reads as no-deps, not as a crash', async (t) => {
  const root = greenTree(t, { mode: 'design' });
  const ctx = withModule(root, () => { throw new Error("Cannot find package 'undici'"); });
  const r = await adopt(ctx, 'SV-00');
  assert.equal(r.status, 'skip');
  assert.equal(r.detail, DEPS_MISSING);
  assert.equal(ctx._server.state, 'no-deps');
});

test('the module runs ONCE for all nine checks', async (t) => {
  const root = greenTree(t);
  let runs = 0;
  const ctx = withModule(root, async () => { runs += 1; return report(); });
  for (const id of SERVER_CHECK_IDS) await adopt(ctx, id);
  assert.equal(runs, 1, `the server module ran ${runs} times for one report`);
});

test('an adopted result keeps every field a reader acts on', async (t) => {
  const root = greenTree(t);
  const ctx = withModule(root, async () => report({
    checks: [{ id: 'SV-03', title: 'instances', status: 'warn', detail: 'pdi: FLAGS_INCOMPLETE',
      remedy: 'set every flag explicitly', fixable: true, data: { fix: { kind: 'flags-incomplete' } } }],
  }));
  const r = await adopt(ctx, 'SV-03');
  assert.equal(r.status, 'warn');
  assert.equal(r.detail, 'pdi: FLAGS_INCOMPLETE');
  assert.equal(r.remedy, 'set every flag explicitly');
  assert.equal(r.fixable, true);
  assert.deepEqual(r.data.fix, { kind: 'flags-incomplete' });
  assert.equal(r.data.adopted, true);
});

test('an id the server did not report is a skip naming the skew, never a pass', async (t) => {
  const root = greenTree(t);
  const ctx = withModule(root, async () => report({ checks: [] }));
  const r = await adopt(ctx, 'SV-07');
  assert.equal(r.status, 'skip');
  assert.match(r.detail, /was not in the server's report \(version skew\)/);
});

test('the JSON server block carries the instances --resume reads, already masked', async (t) => {
  const root = greenTree(t);
  const ctx = withModule(root, async () => report());
  await adopt(ctx, 'SV-00');
  const block = serverBlock(ctx._server);
  assert.equal(block.available, true);
  assert.equal(block.version, '2.0.0-test');
  assert.deepEqual(block.instances[0], { label: 'pdi', environment: 'pdi', preset: 'pdi-developer',
    status: 'loaded', username: 's***@corp.example.com' });
  assert.equal(JSON.stringify(block).includes('@corp.example.com'), true);
  assert.equal(/[^*]@corp\.example\.com/.test(JSON.stringify(block).replace('s***@', 's***X')), false);
});

test('the JSON server block says which half is absent when nothing could run', () => {
  const block = serverBlock({ state: 'no-deps', report: null, error: 'Cannot find package x' });
  assert.deepEqual(block, { available: false, state: 'no-deps', version: null, mode: null,
    instances: [], error: 'Cannot find package x' });
  assert.equal(serverBlock(undefined), null);
});

test('the flags are declared as the runner reads them: SV-04 network, SV-05/06 spawn', () => {
  const by = new Map(checks.map((c) => [c.id, c]));
  assert.equal(by.get('SV-04').network, true);
  assert.equal(by.get('SV-04').quick, false);
  for (const id of ['SV-05', 'SV-06']) assert.equal(by.get(id).spawns, true, `${id}`);
  for (const id of ['SV-00', 'SV-01', 'SV-02', 'SV-03', 'SV-07', 'SV-08']) {
    assert.equal(by.get(id).quick, true, `${id} is not quick`);
  }
  assert.deepEqual(checks.filter((c) => c.network).map((c) => c.id), ['SV-04']);
});

// The second declaration, checked against the first wherever the module can be loaded.
test('SERVER_CHECK_IDS is the server module\'s own CHECK_IDS', async (t) => {
  const entry = join(REAL_ROOT, 'packages/snowarch/dist/doctor/types.js');
  if (!existsSync(entry)) return t.skip('the built server module is not here');
  const module = await import(pathToFileURL(entry).href);
  assert.deepEqual([...SERVER_CHECK_IDS], [...module.CHECK_IDS],
    'the engine and the server disagree about which checks exist');
});
