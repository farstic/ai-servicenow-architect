import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fetchListAsync, LIVE_BUDGET_MS } from '../../src/licence/refresh.js';
import {
  currentLicence, initLicence, refreshLicenceList, resetLicenceForTests, startLicence,
} from '../../src/licence/session.js';
import { trackTempDir } from '../helpers/server-child.js';
import { checkout, keysOf, licence, licenceText, listRepo, listText, pair } from './fixtures.js';

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
afterEach(() => resetLicenceForTests());

/** No proxy: the silent server is local, and a proxy in the environment would answer for it. */
const quietEnv = (extra: Record<string, string> = {}): Record<string, string> => {
  const env = { ...process.env } as Record<string, string>;
  for (const k of ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 'ALL_PROXY', 'all_proxy']) delete env[k];
  return { ...env, ...extra };
};

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
    expect(await fetchListAsync({ url: listRepo({ 'revocations.json': text }), ref: 'main', path: 'revocations.json', budgetMs: 10_000, env: quietEnv() }))
      .toEqual({ status: 'fetched', text });
    expect((await fetchListAsync({ url: listRepo(null), ref: 'main', path: 'revocations.json', budgetMs: 10_000, env: quietEnv() })).status).toBe('none');
    expect((await fetchListAsync({ url: listRepo({ 'README.md': 'x\n' }), ref: 'main', path: 'revocations.json', budgetMs: 10_000, env: quietEnv() })).status).toBe('none');
    const gone = pathToFileURL(join(trackTempDir(mkdtempSync(join(tmpdir(), 'snowarch-gone-'))), 'nothing.git')).href;
    expect((await fetchListAsync({ url: gone, ref: 'main', path: 'revocations.json', budgetMs: 10_000, env: quietEnv() })).status).toBe('unreachable');
  });

  it('has a three-second budget', () => {
    expect(LIVE_BUDGET_MS).toBe(3_000);
  });
});

describe('ARC-11-C1 — the live start\'s background refresh', () => {
  it('a stale cache and a reachable list: revoked once the refresh lands, from the next call', async () => {
    const root = project(listRepo({ 'revocations.json': listText(2, [revocation], primary) }), { cache: staleCache(null) });
    initLicence({ root, env: quietEnv(ENFORCED), keys: KEYS });
    expect(currentLicence().state).toBe('ok');
    const r = await refreshLicenceList();
    expect(r.outcome).toBe('updated');
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
    expect(Date.now() - started).toBeLessThan(100);
    const r = await pending;
    expect(Date.now() - started).toBeLessThan(LIVE_BUDGET_MS + 1_000);
    expect(r.outcome).toBe('unreachable');
    expect(currentLicence().state).toBe('revoked');
  }, 15_000);

  it('a list older than the one held is ignored (rollback protection)', async () => {
    const held = listText(5, [revocation], primary);
    const root = project(listRepo({ 'revocations.json': listText(4, [], primary) }), { cache: staleCache(held) });
    initLicence({ root, env: quietEnv(), keys: KEYS });
    expect((await refreshLicenceList()).outcome).toBe('older');
    expect(currentLicence().state).toBe('revoked');
  });

  it('starts only for a live server with a licence installed and a list missing or a day old', async () => {
    const repo = listRepo({ 'revocations.json': listText(1, [], primary) });
    const opts = { env: quietEnv(), keys: KEYS };
    expect(startLicence({ ...opts, root: project(repo), live: false })).toBeNull();
    resetLicenceForTests();
    expect(startLicence({ ...opts, root: project(repo, { licenceFile: null }), live: true })).toBeNull();
    resetLicenceForTests();
    const fresh = JSON.stringify({ checkedAt: new Date().toISOString(), source: 'fixture', list: null });
    expect(startLicence({ ...opts, root: project(repo, { cache: fresh }), live: true })).toBeNull();
    resetLicenceForTests();
    const started = startLicence({ ...opts, root: project(repo), live: true });
    expect(started).not.toBeNull();
    expect((await started)?.outcome).toBe('updated');
  });
});
