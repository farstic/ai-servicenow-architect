// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { fetchListAsync, LIVE_BUDGET_MS } from '../../src/licence/refresh.js';
import {
  currentLicence, initLicence, refreshLicenceList, resetLicenceForTests, startLicence,
} from '../../src/licence/session.js';
import { checkout, fixtureDir, keysOf, licence, licenceText, listRepo, listText, pair, removeFixtureDirs } from './fixtures.js';
import { slowGitPath } from '../../../../tools/snowarch/tests/helpers/slow-git.mjs';

/**
 * ARC-11-C1 — the live server's refresh (the architect's ruling (b)): at a live start with the list
 * missing or a day old, it is fetched in the background on a 3-second budget, never blocking the first
 * tool and never failing; the state is recomputed when it lands and applies from the next call.
 * Offline, the cached list stands, or none.
 */
const primary = pair();
const KEYS = keysOf(primary, pair());
const ENFORCED = { SNOW_LICENCE_ENFORCE: 'true' };
const revocation = { id: 'LIC-2026-0002', revokedAt: '2026-10-09', reason: 'ended' };

/** A server that accepts and never answers: "no network" that takes its full time to say so. */
let silent: Server;
let silentUrl: string;
beforeAll(async () => {
  silent = createServer(() => { /* never answers */ });
  await new Promise<void>((resolve) => silent.listen(0, '127.0.0.1', resolve));
  silentUrl = `http://127.0.0.1:${(silent.address() as AddressInfo).port}/list.git`;
});
afterAll(async () => {
  silent.closeAllConnections();
  await new Promise<void>((resolve) => silent.close(() => resolve()));
});
afterEach(() => { resetLicenceForTests(); removeFixtureDirs(); });

/** No proxy: the silent server is local, and a proxy in the environment would answer for it. */
const quietEnv = (extra: Record<string, string> = {}): Record<string, string> => {
  const env = { ...process.env } as Record<string, string>;
  for (const k of ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 'ALL_PROXY', 'all_proxy']) delete env[k];
  return { ...env, ...extra };
};

/**
 * ARC-09-C133 — a git as slow as the one on the Windows node 22 cell of 2026-10-12, where these cases met the
 * live budget and got 'unreachable': about 1.3 s a call there, against 0.1 s on the cells beside it. Here the
 * first call, `ls-remote`, alone outlasts the whole live budget, on any machine. POSIX only, as the helper says;
 * on Windows the cases run on the real git.
 */
const slowEnv = (extra: Record<string, string> = {}): Record<string, string> => {
  const PATH = slowGitPath({ dir: fixtureDir('snowarch-slow-git-'), subcommand: 'ls-remote', seconds: 3.5 });
  return quietEnv(PATH === null ? extra : { ...extra, PATH });
};

/**
 * ARC-09-C133 — the budget every fixture fetch here runs on. The repository is on this machine's disk, so the
 * wait is the test's patience, not the product's. The live budget keeps its own cases: "has a three-second
 * budget", the no-network case, and the one that pins `main()`'s call.
 */
const FIXTURE_BUDGET_MS = 20_000;

function project(repo: string, { cache = null, licenceFile = licenceText(licence(), primary) }:
  { cache?: string | null; licenceFile?: string | null } = {}): string {
  const root = checkout();
  writeFileSync(join(root, 'engine.config.json'),
    JSON.stringify({ licence: { revocations: { repo, ref: 'main', path: 'revocations.json' } } }));
  if (licenceFile !== null) writeFileSync(join(root, '.local', 'licence.json'), licenceFile);
  if (cache !== null) writeFileSync(join(root, '.local', 'revocations.json'), cache);
  return root;
}

const staleCache = (list: string | null): string =>
  JSON.stringify({ checkedAt: '2020-01-01T00:00:00.000Z', source: 'fixture', list: list ? JSON.parse(list) : null });

describe('ARC-11-C1 — the server fetches the list as the CLI does', () => {
  it('fetched, none for an empty repository or a branch with no file, unreachable for nothing there', async () => {
    const text = listText(1, [], primary);
    expect(await fetchListAsync({ url: listRepo({ 'revocations.json': text }), ref: 'main', path: 'revocations.json', budgetMs: FIXTURE_BUDGET_MS, env: quietEnv() }))
      .toEqual({ status: 'fetched', text });
    expect((await fetchListAsync({ url: listRepo(null), ref: 'main', path: 'revocations.json', budgetMs: FIXTURE_BUDGET_MS, env: quietEnv() })).status).toBe('none');
    expect((await fetchListAsync({ url: listRepo({ 'README.md': 'x\n' }), ref: 'main', path: 'revocations.json', budgetMs: FIXTURE_BUDGET_MS, env: quietEnv() })).status).toBe('none');
    const gone = pathToFileURL(join(fixtureDir('snowarch-gone-'), 'nothing.git')).href;
    expect((await fetchListAsync({ url: gone, ref: 'main', path: 'revocations.json', budgetMs: FIXTURE_BUDGET_MS, env: quietEnv() })).status).toBe('unreachable');
  });

  it('has a three-second budget', () => {
    expect(LIVE_BUDGET_MS).toBe(3_000);
  });
});

describe('ARC-11-C1 — the live start\'s background refresh', () => {
  it('a stale cache and a reachable list: revoked once the refresh lands, from the next call', async () => {
    const root = project(listRepo({ 'revocations.json': listText(2, [revocation], primary) }), { cache: staleCache(null) });
    initLicence({ root, env: slowEnv(ENFORCED), keys: KEYS });
    expect(currentLicence().state).toBe('ok');
    // The whole result, so a mismatch prints the product's `detail`: the reason the cell's log never carried.
    const r = await refreshLicenceList({ budgetMs: FIXTURE_BUDGET_MS });
    expect(r).toEqual({ outcome: 'updated', version: 2, previous: null });
    expect(currentLicence().state).toBe('revoked');
    expect(JSON.parse(readFileSync(join(root, '.local', 'revocations.json'), 'utf8')).list.list.version).toBe(2);
  });

  it('a stale cache and no network: the cached state stands, within the three seconds', async () => {
    const cached = listText(1, [revocation], primary);
    const root = project(silentUrl, { cache: staleCache(cached) });
    initLicence({ root, env: quietEnv(ENFORCED), keys: KEYS });
    expect(currentLicence().state).toBe('revoked');
    const started = Date.now();
    const pending = refreshLicenceList();
    // ARC-09-C136 — the refresh must not hold the start: it returns before the network does. The silent URL never
    // answers, so a refresh that waited would take the whole live budget; half of it separates the two whatever the
    // load. 100 ms was a wall-clock budget, and a full suite on a busy machine took 214 for a return that waited on
    // nothing (the v2.1.0-rc.1 rehearsal).
    expect(Date.now() - started).toBeLessThan(LIVE_BUDGET_MS / 2);
    const r = await pending;
    expect(Date.now() - started).toBeLessThan(LIVE_BUDGET_MS + 1_000);
    expect(r.outcome).toBe('unreachable');
    expect(currentLicence().state).toBe('revoked');
  }, 15_000);

  it('main() passes no budget, and a start without one waits the live three seconds (ARC-09-C133)', async () => {
    // The widened budget is the tests' alone: the server's one call to startLicence names none...
    const file = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'server.ts');
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const calls: ts.CallExpression[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'startLicence') {
        calls.push(node);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    expect(calls, 'the server no longer calls startLicence exactly once').toHaveLength(1);
    const [arg] = calls[0].arguments;
    expect(arg !== undefined && ts.isObjectLiteralExpression(arg), 'main() passes startLicence no object literal').toBe(true);
    const names = (arg as ts.ObjectLiteralExpression).properties.map((p) => p.name?.getText(source));
    expect(names, 'main() passes startLicence a budget').not.toContain('budgetMs');
    // ...and without one, a live start against a list that never answers gives up within the live budget.
    const root = project(silentUrl, { cache: staleCache(listText(1, [revocation], primary)) });
    const started = Date.now();
    const r = await startLicence({ root, env: quietEnv(), keys: KEYS, live: true });
    expect(Date.now() - started).toBeLessThan(LIVE_BUDGET_MS + 1_000);
    expect(r).toEqual({ outcome: 'unreachable', version: 1, detail: expect.any(String) });
  }, 15_000);

  it('a list older than the one held is ignored (rollback protection)', async () => {
    const held = listText(5, [revocation], primary);
    const root = project(listRepo({ 'revocations.json': listText(4, [], primary) }), { cache: staleCache(held) });
    initLicence({ root, env: slowEnv(), keys: KEYS });
    const r = await refreshLicenceList({ budgetMs: FIXTURE_BUDGET_MS });
    expect(r).toEqual({ outcome: 'older', version: 5, fetchedVersion: 4 });
    expect(currentLicence().state).toBe('revoked');
  });

  it('starts for every live server with a licence installed, and for nothing else (the architect\'s ruling (a))', async () => {
    const repo = listRepo({ 'revocations.json': listText(1, [], primary) });
    const opts = { env: slowEnv(), keys: KEYS, budgetMs: FIXTURE_BUDGET_MS };
    expect(startLicence({ ...opts, root: project(repo), live: false })).toBeNull();
    resetLicenceForTests();
    // No licence, nothing to revoke: a checkout without one makes no fetch at all, the class case.
    expect(startLicence({ ...opts, root: project(repo, { licenceFile: null }), live: true })).toBeNull();
    resetLicenceForTests();
    const started = startLicence({ ...opts, root: project(repo), live: true });
    expect(started).not.toBeNull();
    expect(await started).toEqual({ outcome: 'updated', version: 1, previous: null });
  });

  it('"revoke → it stops at the next start": a FRESH cache and a list that now revokes → revoked after the start\'s refresh', async () => {
    const fresh = JSON.stringify({ checkedAt: new Date().toISOString(), source: 'fixture',
      list: JSON.parse(listText(1, [], primary)) });
    const root = project(listRepo({ 'revocations.json': listText(2, [revocation], primary) }), { cache: fresh });
    const started = startLicence({ root, env: slowEnv(ENFORCED), keys: KEYS, live: true,
      budgetMs: FIXTURE_BUDGET_MS });
    expect(currentLicence().state).toBe('ok');
    expect(started).not.toBeNull();
    expect(await started).toEqual({ outcome: 'updated', version: 2, previous: 1 });
    expect(currentLicence().state).toBe('revoked');
  });
});

/**
 * ARC-11-C11 — a `show` the deadline ends is unreachable, not "no file", and the cache keeps its date: the
 * repository never answered, so nothing was checked. These need a git that is slow on one call, which only POSIX
 * can stand in for (`tools/snowarch/tests/helpers/slow-git.mjs`), so they skip on Windows. The CLI's case for the
 * spent budget runs everywhere, and the two copies are compared in `tools/snowarch/tests/licence-parity.test.mjs`.
 */
describe('ARC-11-C11 — the deadline in the third call', () => {
  const posix = it.skipIf(process.platform === 'win32');

  posix('a show the deadline kills is unreachable, and the cache keeps its date', async () => {
    const PATH = slowGitPath({ dir: fixtureDir('snowarch-slow-git-'), subcommand: 'show', seconds: 4 }) as string;
    const root = project(listRepo({ 'revocations.json': listText(2, [revocation], primary) }),
      { cache: staleCache(listText(1, [], primary)) });
    initLicence({ root, env: quietEnv({ PATH }), keys: KEYS });
    const r = await refreshLicenceList({ budgetMs: 1_500 });
    expect(r).toEqual({ outcome: 'unreachable', version: 1, detail: expect.any(String) });
    const cache = JSON.parse(readFileSync(join(root, '.local', 'revocations.json'), 'utf8'));
    expect(cache.checkedAt, 'a check that timed out wrote a date').toBe('2020-01-01T00:00:00.000Z');
  });

  posix('the budget spent before show runs is unreachable too', async () => {
    // The clone sleeps a second. Half a second in, the clock moves past the deadline, so `show` finds none left.
    const PATH = slowGitPath({ dir: fixtureDir('snowarch-slow-git-'), subcommand: 'clone', seconds: 1 }) as string;
    const url = listRepo({ 'revocations.json': listText(1, [], primary) });
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const pending = fetchListAsync({ url, ref: 'main', path: 'revocations.json', budgetMs: 5_000, env: quietEnv({ PATH }) });
      await new Promise((resolve) => setTimeout(resolve, 500));
      vi.setSystemTime(Date.now() + 10_000);
      expect(await pending).toEqual({ status: 'unreachable', detail: 'the time budget was spent' });
    } finally {
      vi.useRealTimers();
    }
  });
});
