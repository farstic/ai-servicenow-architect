import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AddressInfo, Socket } from 'node:net';
import { proxyConfigured, resetHttpDispatcher, snFetch } from '../../src/servicenow/http.js';
import { sanitiseProxyEnv } from '../../src/env-sanitise.js';
import { classifyNetworkError } from '../../src/servicenow/net-errors.js';

/**
 * The proxy variables, end to end, against a CONNECT proxy running in this process.
 *
 * Node's global `fetch` ignores `HTTPS_PROXY` entirely — not a bug, WHATWG fetch says nothing
 * about proxy variables — so on a corporate laptop the client failed while `curl` to the same
 * URL worked. That reads as "the tool is broken", and it is the failure R-3 is about.
 *
 * The fixture is a real HTTP server that answers CONNECT and records what it was asked to
 * tunnel. Asserting on the RECORDED CONNECT line is the only way to tell "the request went via
 * the proxy" from "the request happened to fail the same way" — a test that only checked for an
 * error would pass whether or not the dispatcher was attached, which is the whole feature.
 */
let proxy: Server;
let port: number;
let connects: string[];
let resolved: string[];

/**
 * The host these tests aim at, and a resolver that always refuses it.
 *
 * The name used to be one under a reserved TLD, on the reasoning that such a name cannot resolve.
 * It can: a macOS CI runner answered for it, the "bypassed request fails at DNS" test got
 * PROXY_UNREACHABLE instead of DNS_FAILURE, and a suite that touches no network failed because of
 * the network. (The old name is not written out here — a file that spelled it would become a hit
 * for the very sweep that is meant to return nothing.) So the lookup is INJECTED — undici hands `connect` options to `net.connect`, which
 * honours `lookup` — and the hostname is now just a string that never leaves this process.
 *
 * `resolved` records every name the injected lookup was asked for, which is what turns "it failed
 * at DNS" from a hope into an assertion: a request that never reached the resolver would leave it
 * empty, and that is the shape the old test could not tell apart.
 */
const HOST = 'sn-fixture.test-only';
const URL_UNDER_TEST = `https://${HOST}/api/now/table/sys_user`;

// `hostname` is not on `NodeJS.ErrnoException` — it is what `dns.lookup` adds to a real
// getaddrinfo failure, and the shape is copied so the error reads like the one this replaces.
type LookupError = NodeJS.ErrnoException & { hostname?: string };

const failingLookup = (hostname: string, _options: unknown,
  cb: (e: LookupError) => void): void => {
  resolved.push(hostname);
  const e: LookupError = new Error(`getaddrinfo ENOTFOUND ${hostname}`);
  e.code = 'ENOTFOUND';
  e.syscall = 'getaddrinfo';
  e.hostname = hostname;
  cb(e);
};

beforeEach(async () => {
  connects = [];
  resolved = [];
  proxy = createServer((_req, res) => { res.writeHead(405).end(); });
  proxy.on('connect', (req, socket: Socket) => {
    connects.push(`CONNECT ${req.url}`);
    // Refuse the tunnel rather than opening one. The claim under test is "the client asked THIS
    // proxy for THAT host"; actually completing the tunnel would need a real TLS endpoint and
    // would turn a routing test into a network test.
    socket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
  });
  await new Promise<void>((done) => { proxy.listen(0, '127.0.0.1', done); });
  port = (proxy.address() as AddressInfo).port;
  resetHttpDispatcher();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  resetHttpDispatcher();
  await new Promise<void>((done) => { proxy.close(() => done()); });
});

const tryFetch = async (url: string = URL_UNDER_TEST): Promise<unknown> => {
  try { await snFetch(url); return null; } catch (e) { return e; }
};

/** Rebuild the agent with the injected resolver — for the tests whose request goes DIRECT. */
const useFailingResolver = (): void => { resetHttpDispatcher({ lookup: failingLookup }); };

describe('criterion 1 - HTTPS_PROXY routes the request through the proxy', () => {
  it('the proxy records CONNECT <host>:443', async () => {
    vi.stubEnv('HTTPS_PROXY', `http://127.0.0.1:${port}`);
    resetHttpDispatcher();   // the agent reads the environment when constructed

    await tryFetch();

    expect(connects).toEqual([`CONNECT ${HOST}:443`]);
  });

  it('NO_PROXY for that host bypasses it, and the proxy records nothing', async () => {
    vi.stubEnv('HTTPS_PROXY', `http://127.0.0.1:${port}`);
    vi.stubEnv('NO_PROXY', HOST);
    useFailingResolver();

    const err = await tryFetch();

    expect(connects).toEqual([]);
    // And it really tried: a bypassed request goes to the RESOLVER, which is the proof it went
    // direct rather than the proof that nothing happened. Both halves are asserted — the name
    // reached the resolver, and the failure was classified as DNS — because "no CONNECT was
    // recorded" alone is also true of a request that never happened.
    expect(resolved).toEqual([HOST]);
    expect(classifyNetworkError(err).code).toBe('DNS_FAILURE');
  });

  it('with no proxy variable at all, nothing reaches the fixture', async () => {
    // The control. Without it, "the proxy recorded nothing" above would also pass if the
    // dispatcher were broken in a way that never used any proxy.
    vi.stubEnv('HTTPS_PROXY', '');
    sanitiseProxyEnv();
    resetHttpDispatcher();

    await tryFetch();

    expect(connects).toEqual([]);
    expect(proxyConfigured()).toBe(false);
  });

  it('lowercase https_proxy works the same way', async () => {
    vi.stubEnv('https_proxy', `http://127.0.0.1:${port}`);
    resetHttpDispatcher();
    await tryFetch();
    expect(connects).toEqual([`CONNECT ${HOST}:443`]);
  });
});

describe('criterion 2 - a proxy that is not listening', () => {
  it('classifies as PROXY_UNREACHABLE and names the proxy in the message', async () => {
    // 49151, not 1: Node rejects the low well-known ports as "bad port" BEFORE the request
    // layer, so a test pointed at 127.0.0.1:1 never reaches the proxy code path at all while
    // appearing to. (ARC-04-S10 found this; the story text still says :1.)
    const dead = 'http://127.0.0.1:49151';
    vi.stubEnv('HTTPS_PROXY', dead);
    resetHttpDispatcher();

    const err = await tryFetch();
    const d = classifyNetworkError(err);

    expect(d.code).toBe('PROXY_UNREACHABLE');
    expect(d.remedy).toContain(`HTTPS_PROXY=${dead} is set but not reachable`);
  });
});

describe('criterion 5 - an empty variable means unset', () => {
  it('sanitiseProxyEnv deletes empty values and reports what it cleared', () => {
    // ARC-06 forwards these as `${HTTPS_PROXY:-}`, which expands to an empty string rather than
    // omitting the entry. Undici reads `HTTPS_PROXY=""` as a proxy URL and fails to parse it, so
    // without this a laptop with NO proxy would stop reaching ServiceNow the moment the
    // forwarding was added - broken by the mechanism meant to help.
    const env: NodeJS.ProcessEnv = {
      HTTPS_PROXY: '', NO_PROXY: '', NODE_EXTRA_CA_CERTS: '', HTTP_PROXY: 'http://keep:3128',
    };
    expect(sanitiseProxyEnv(env).sort()).toEqual(['HTTPS_PROXY', 'NODE_EXTRA_CA_CERTS', 'NO_PROXY']);
    expect('HTTPS_PROXY' in env).toBe(false);
    expect(env.HTTP_PROXY).toBe('http://keep:3128');
  });

  it('a whitespace value is NOT cleared', () => {
    // `" "` is a real, if broken, setting. Deleting it would hide the user's mistake behind
    // silence; leaving it means the parse error names the variable they actually set.
    const env: NodeJS.ProcessEnv = { HTTPS_PROXY: ' ' };
    expect(sanitiseProxyEnv(env)).toEqual([]);
    expect(env.HTTPS_PROXY).toBe(' ');
  });

  it('an empty HTTPS_PROXY leaves requests direct rather than failing to parse', async () => {
    vi.stubEnv('HTTPS_PROXY', '');
    sanitiseProxyEnv();
    useFailingResolver();
    const err = await tryFetch();
    // DNS, not a proxy parse error: the request went direct, exactly as if nothing were set.
    expect(resolved).toEqual([HOST]);
    expect(classifyNetworkError(err).code).toBe('DNS_FAILURE');
  });
});

describe('criterion 7 - one HTTP call site', () => {
  const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../../src');

  function walk(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory()
      ? walk(join(dir, e.name))
      : (e.name.endsWith('.ts') ? [join(dir, e.name)] : [])));
  }

  const files = walk(SRC);

  /**
   * Repo-relative, with forward slashes on every platform.
   *
   * Windows `readdirSync`+`join` yields `servicenow\\http.ts`, so the first version of this
   * assertion passed on macOS and Linux and failed on all three Windows cells — a
   * platform-specific failure in a test whose subject has nothing to do with platforms.
   */
  const rel = (f: string): string => f.slice(SRC.length + 1).split(sep).join('/');

  it('there are source files to scan', () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it('only http.ts imports undici', () => {
    // Asserted as a test, not left to a grep in a report: a second call site is a second place
    // where proxy support silently does not apply, and it would fail only on the machines least
    // able to debug it.
    const importers = files
      .filter((f) => /from\s+'undici'/.test(readFileSync(f, 'utf8')))
      .map(rel);
    expect(importers).toEqual(['servicenow/http.ts']);
  });

  it('nothing calls the global fetch', () => {
    const callers = files
      .filter((f) => /(?<![\w.])fetch\s*\(/.test(readFileSync(f, 'utf8')))
      .map(rel);
    expect(callers).toEqual([]);
  });
});
