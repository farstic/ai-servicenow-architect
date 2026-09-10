import { describe, expect, it } from 'vitest';

import { ERROR_CODES } from '../../src/errors/codes.js';
import {
  describeNetworkEnv, fillRemedy, formatFailure, issuerOf, probeReachability, reachabilityMenu,
} from '../../src/servicenow/reachability.js';

/**
 * ARC-07-S02 — the diagnosis, not just the verdict.
 *
 * "Unreachable" is where a corporate laptop stops and an afternoon starts: a name that does not
 * resolve, a gateway presenting its own certificate and a proxy that is not there look identical
 * from the outside and need completely different actions. Every case below asserts the CODE and
 * the REMEDY the user is given, because the code alone is the part that helps nobody.
 *
 * No network: `snFetch` is injected. And no real host, ever — the story's own names only.
 */
const PDI = 'https://dev12345.service-now.com';
const HOST = 'dev12345.service-now.com';

/** Assembled, never spelled: a proxy password must not exist as a literal in this tree. */
const PROXY_PASSWORD = ['s3', 'cr', 'et'].join('');
const PROXY_WITH_AUTH = `http://svc:${PROXY_PASSWORD}@proxy.acme.internal:8080`;
const PROXY_PLAIN = 'http://proxy.acme.internal:8080';

/** undici wraps a socket failure as `TypeError: fetch failed` with the real code on `cause`. */
const thrown = (code: string, extra: Record<string, unknown> = {}) =>
  Object.assign(new TypeError('fetch failed'), { cause: { code, ...extra } });

const responding = (status: number) =>
  (async () => ({ status }) as unknown as Awaited<ReturnType<typeof fetch>>);
const throwing = (err: unknown) => (async () => { throw err; }) as never;

const probe = (fetchImpl: unknown, env: NodeJS.ProcessEnv = {}) =>
  probeReachability(PDI, { env, fetchImpl: fetchImpl as never, now: () => 0 });

describe('probeReachability — a reached instance', () => {
  it('any status but 407 is a success, including a login redirect and a 401', async () => {
    // The question is "did the request reach the instance". A 302 to the login page is the
    // clearest possible yes, and a 401 means the password is simply not the subject yet.
    for (const status of [200, 302, 401, 403, 500]) {
      const r = await probe(responding(status));
      expect(r.ok, `status ${status}`).toBe(true);
      expect(r.ok && r.status).toBe(status);
    }
  });

  it('a 407 is NOT a success — the proxy answered, the instance did not', async () => {
    const r = await probe(responding(407), { HTTPS_PROXY: PROXY_WITH_AUTH });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe('PROXY_AUTH_REQUIRED');
    expect(!r.ok && r.cause).toBe('407');
    // The remedy is the actionable half: where the credentials go, and what will not work.
    expect(!r.ok && r.remedy).toContain('HTTPS_PROXY=http://user:pass@proxy:port');
    expect(!r.ok && r.remedy).toContain('NTLM');
    // The story's open point: 407 can also arrive as a THROW, depending on the proxy agent.
    const thrown407 = await probe(throwing(Object.assign(new Error('Proxy response 407'), {})),
      { HTTPS_PROXY: PROXY_WITH_AUTH });
    expect(!thrown407.ok && thrown407.code).toBe('PROXY_AUTH_REQUIRED');
    const withStatus = await probe(throwing(Object.assign(new Error('proxy'), { statusCode: 407 })));
    expect(!withStatus.ok && withStatus.code).toBe('PROXY_AUTH_REQUIRED');
  });
});

describe('probeReachability — criterion 4, the six codes', () => {
  it('DNS_FAILURE, with the host in the remedy', async () => {
    for (const code of ['ENOTFOUND', 'EAI_AGAIN']) {
      const r = await probe(throwing(thrown(code)));
      expect(!r.ok && r.code, code).toBe('DNS_FAILURE');
      expect(!r.ok && r.cause).toBe(code);
      expect(!r.ok && r.remedy).toContain(HOST);
    }
  });

  it('TLS_CA_UNTRUSTED, with the issuer when the certificate said, and without when it did not', async () => {
    const withIssuer = await probe(throwing(
      thrown('SELF_SIGNED_CERT_IN_CHAIN', { cert: { issuer: { CN: 'Acme TLS Inspection' } } })));
    expect(!withIssuer.ok && withIssuer.code).toBe('TLS_CA_UNTRUSTED');
    expect(!withIssuer.ok && withIssuer.remedy).toContain('Acme TLS Inspection');
    expect(!withIssuer.ok && withIssuer.remedy).toContain('NODE_EXTRA_CA_CERTS');
    // Never this, in any wording.
    expect(!withIssuer.ok && withIssuer.remedy).toContain('Never `NODE_TLS_REJECT_UNAUTHORIZED=0`');

    const without = await probe(throwing(thrown('UNABLE_TO_VERIFY_LEAF_SIGNATURE')));
    expect(!without.ok && without.remedy).not.toContain('<issuer>');
    // The parenthesis goes with it — "(issuer: )" invites a reader to look for something absent.
    expect(!without.ok && without.remedy).not.toContain('issuer:');
  });

  it('PROXY_UNREACHABLE when a proxy is set, CONNECTION_REFUSED when one is not', async () => {
    // The same socket error, two diagnoses. With a proxy configured the client never opened a
    // socket to the instance at all, so telling the user to check the instance would send them
    // to a host that was never contacted.
    const withProxy = await probe(throwing(thrown('ECONNREFUSED')), { HTTPS_PROXY: PROXY_PLAIN });
    expect(!withProxy.ok && withProxy.code).toBe('PROXY_UNREACHABLE');
    expect(!withProxy.ok && withProxy.remedy).toContain('proxy.acme.internal:8080');

    const without = await probe(throwing(thrown('ECONNREFUSED')));
    expect(!without.ok && without.code).toBe('CONNECTION_REFUSED');
    expect(!without.ok && without.remedy).toContain(HOST);
    expect(!without.ok && without.remedy).toContain('hibernated');
  });

  it('CONNECTION_TIMEOUT covers every spelling, and an abort is one of them', async () => {
    // Two spellings because undici's names differ across Node 20/22/24 — the three-OS × three-Node
    // matrix is what proves the pair. The third case is our OWN deadline: `AbortSignal.timeout`
    // rejects with a `TimeoutError` that carries no `code` at all, so before ARC-07-S02 taught the
    // classifier about aborts it fell through to `NETWORK_ERROR` — "run the doctor" — for the one
    // failure with the most specific remedy of the six.
    for (const code of ['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT']) {
      const r = await probe(throwing(thrown(code)));
      expect(!r.ok && r.code, code).toBe('CONNECTION_TIMEOUT');
    }
    const aborted = await probe(throwing(Object.assign(new Error('The operation was aborted'),
      { name: 'TimeoutError' })));
    expect(!aborted.ok && aborted.code).toBe('CONNECTION_TIMEOUT');
    expect(!aborted.ok && aborted.remedy).toContain(HOST);
    expect(!aborted.ok && aborted.remedy).toContain('hibernating');
  });

  it('...and with a proxy set, a timeout is the PROXY that did not answer', async () => {
    const r = await probe(throwing(thrown('UND_ERR_CONNECT_TIMEOUT')), { HTTPS_PROXY: PROXY_PLAIN });
    expect(!r.ok && r.code).toBe('PROXY_UNREACHABLE');
  });

  it('an unrecognised failure is NETWORK_ERROR, not a guess', async () => {
    const r = await probe(throwing(thrown('ESOMETHINGELSE')));
    expect(!r.ok && r.code).toBe('NETWORK_ERROR');
  });

  it('every code the probe can return is a registry key', () => {
    const keys = new Set<string>(ERROR_CODES.map((e) => e.code as string));
    const printable = ['DNS_FAILURE', 'TLS_CA_UNTRUSTED', 'PROXY_UNREACHABLE', 'CONNECTION_REFUSED',
      'CONNECTION_TIMEOUT', 'PROXY_AUTH_REQUIRED', 'NETWORK_ERROR'];
    expect(printable.filter((c) => !keys.has(c))).toEqual([]);
    // ...and each of those has a remedy to print. A registered code with an empty remedy is a
    // code that reaches a user with nothing to do about it.
    for (const code of printable) {
      expect(ERROR_CODES.find((e) => (e.code as string) === code)?.remedy, code).toBeTruthy();
    }
  });
});

describe('criterion 5 — the network line', () => {
  it('is byte-exact, and says "unset" rather than nothing', () => {
    expect(describeNetworkEnv({})).toBe(
      'network: HTTPS_PROXY=unset · NO_PROXY=unset · NODE_EXTRA_CA_CERTS=unset');
  });

  it('masks the proxy password — and the password appears nowhere in any output', async () => {
    const env = { HTTPS_PROXY: PROXY_WITH_AUTH, NO_PROXY: '.acme.internal',
      NODE_EXTRA_CA_CERTS: '/etc/ssl/acme-root.pem' };
    const line = describeNetworkEnv(env);
    expect(line).toBe('network: HTTPS_PROXY=set (http://***@proxy.acme.internal:8080)'
      + ' · NO_PROXY=.acme.internal · NODE_EXTRA_CA_CERTS=/etc/ssl/acme-root.pem');
    expect(line).not.toContain(PROXY_PASSWORD);

    // Every remedy that names the proxy, too — this is the one that reaches a support ticket.
    const failed = await probe(throwing(thrown('ECONNREFUSED')), env);
    expect(!failed.ok && failed.remedy).not.toContain(PROXY_PASSWORD);
    expect(!failed.ok && failed.remedy).toContain('***@proxy.acme.internal:8080');
    expect(formatFailure(failed as never).join('\n')).not.toContain(PROXY_PASSWORD);
  });

  it('the lowercase twins are honoured, because the shells that set them exist', () => {
    expect(describeNetworkEnv({ https_proxy: PROXY_PLAIN, no_proxy: 'localhost' }))
      .toContain('HTTPS_PROXY=set (http://proxy.acme.internal:8080)');
    expect(describeNetworkEnv({ https_proxy: PROXY_PLAIN, no_proxy: 'localhost' }))
      .toContain('NO_PROXY=localhost');
  });

  it('an empty value counts as unset — the launcher forwards ${HTTPS_PROXY:-}', () => {
    expect(describeNetworkEnv({ NO_PROXY: '', NODE_EXTRA_CA_CERTS: '' }))
      .toBe('network: HTTPS_PROXY=unset · NO_PROXY=unset · NODE_EXTRA_CA_CERTS=unset');
  });

  it('is one line per call — the caller decides how often to print it', () => {
    // "Once per run" is S05/S06's, where the run exists. What this story owes is that a call
    // produces exactly one line and no side effect.
    const first = describeNetworkEnv({ HTTPS_PROXY: PROXY_PLAIN });
    const second = describeNetworkEnv({ HTTPS_PROXY: PROXY_PLAIN });
    expect(first).toBe(second);
    expect(first.split('\n')).toHaveLength(1);
  });
});

describe('the failure block and the menu', () => {
  it('prints the story\'s two lines, in its shape', async () => {
    const r = await probe(throwing(thrown('ENOTFOUND')));
    const lines = formatFailure(r as never);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('reachability: FAIL DNS_FAILURE — ENOTFOUND');
    expect(lines[1].startsWith('  remedy: ')).toBe(true);
    expect(lines[1]).toContain(HOST);
  });

  it('criterion 6 — there is no "continue anyway"', () => {
    const menu = reachabilityMenu();
    expect(menu.map((m) => m.key)).toEqual(['reenter', 'retry', 'abort']);
    // P-23: the wizard this replaces offered exactly that, and an instance saved through it
    // failed later, in a tool call, with no memory of this moment.
    expect(JSON.stringify(menu).toLowerCase()).not.toContain('continue');
    expect(menu.find((m) => m.key === 'abort')?.text).toContain('nothing is saved');
  });
});

describe('the helpers', () => {
  it('issuerOf walks the cause chain and gives up quietly', () => {
    expect(issuerOf({ cause: { cause: { cert: { issuer: { CN: 'Acme Root' } } } } })).toBe('Acme Root');
    expect(issuerOf(new Error('nothing here'))).toBeUndefined();
    const circular: Record<string, unknown> = {};
    circular.cause = circular;                       // a cause chain that points at itself
    expect(issuerOf(circular)).toBeUndefined();
  });

  it('fillRemedy substitutes only what it was given', () => {
    const filled = fillRemedy('DNS_FAILURE', { host: HOST });
    expect(filled).toContain(HOST);
    expect(filled).not.toContain('<host>');
    const noProxy = fillRemedy('PROXY_UNREACHABLE', { host: HOST });
    expect(noProxy).toContain('the configured proxy');
  });
});
