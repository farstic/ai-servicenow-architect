import { describe, expect, it } from 'vitest';
import { classifyNetworkError, maskProxyUrl } from '../../src/servicenow/net-errors.js';
import { ERROR_CODES } from '../../src/errors/codes.js';

/**
 * R-3: `TypeError: fetch failed` is the same message for three unrelated problems with three
 * different remedies — a wrong host name, a TLS-intercepting gateway, and a proxy that is not
 * listening. The one people check first, their credentials, is the one that is fine.
 *
 * The errors below are shaped the way undici actually throws them: a `TypeError` whose `cause`
 * carries the system code. A fixture that put `code` on the top-level error would let a
 * classifier that never walked `cause` pass every test here — which is precisely the bug this
 * classifier exists to avoid.
 */
const fetchFailed = (code: string, depth = 1): Error => {
  let cause: unknown = Object.assign(new Error(`${code} raised`), { code });
  for (let i = 1; i < depth; i += 1) cause = Object.assign(new Error('wrapped'), { cause });
  return Object.assign(new TypeError('fetch failed'), { cause });
};

const PROXY = { HTTPS_PROXY: 'http://127.0.0.1:49151' };

describe('DNS', () => {
  it.each(['ENOTFOUND', 'EAI_AGAIN'])('%s is DNS_FAILURE', (code) => {
    const d = classifyNetworkError(fetchFailed(code), {});
    expect(d.code).toBe('DNS_FAILURE');
    expect(d.cause).toBe(code);
    expect(d.remedy).toContain('HTTPS_PROXY');
  });

  it('with a proxy already set, the remedy stops telling you to set one', () => {
    // Otherwise the advice is "set HTTPS_PROXY" to someone who has, which reads as the tool
    // not having noticed — and the real point (a proxy does not resolve names for you) is lost.
    const d = classifyNetworkError(fetchFailed('ENOTFOUND'), PROXY);
    expect(d.code).toBe('DNS_FAILURE');
    expect(d.remedy).toContain('does not resolve names for you');
    expect(d.remedy).toContain('127.0.0.1:49151');
  });
});

describe('TLS', () => {
  it.each([
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'SELF_SIGNED_CERT_IN_CHAIN',
    'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'CERT_HAS_EXPIRED',
  ])('%s is TLS_CA_UNTRUSTED and names NODE_EXTRA_CA_CERTS', (code) => {
    const d = classifyNetworkError(fetchFailed(code), {});
    expect(d.code).toBe('TLS_CA_UNTRUSTED');
    expect(d.remedy).toContain('NODE_EXTRA_CA_CERTS');
  });

  it('never suggests disabling certificate verification', () => {
    // NODE_TLS_REJECT_UNAUTHORIZED=0 is the first search hit for this error and it turns off
    // checking for the whole process — on an intercepting network, that means trusting the
    // interceptor and everything else. Asserted so nobody "helpfully" adds it later.
    const d = classifyNetworkError(fetchFailed('SELF_SIGNED_CERT_IN_CHAIN'), {});
    expect(d.remedy).not.toContain('NODE_TLS_REJECT_UNAUTHORIZED');
    expect(d.remedy).toContain('Do not disable certificate verification');
  });
});

describe('refused and timed out - the proxy changes the meaning', () => {
  it('ECONNREFUSED with no proxy is CONNECTION_REFUSED, about the instance', () => {
    const d = classifyNetworkError(fetchFailed('ECONNREFUSED'), {});
    expect(d.code).toBe('CONNECTION_REFUSED');
    expect(d.remedy).toContain('instance');
  });

  it('criterion 2 - ECONNREFUSED WITH a proxy is PROXY_UNREACHABLE, naming the proxy', () => {
    // The client never opened a socket to the instance, so reporting CONNECTION_REFUSED would
    // send the user to check a host that was never contacted.
    const d = classifyNetworkError(fetchFailed('ECONNREFUSED'), PROXY);
    expect(d.code).toBe('PROXY_UNREACHABLE');
    expect(d.remedy).toContain('HTTPS_PROXY=http://127.0.0.1:49151 is set but not reachable');
  });

  it.each(['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT'])(
    '%s without a proxy is CONNECTION_TIMEOUT', (code) => {
      expect(classifyNetworkError(fetchFailed(code), {}).code).toBe('CONNECTION_TIMEOUT');
    });

  it('a timeout with a proxy set is also PROXY_UNREACHABLE', () => {
    expect(classifyNetworkError(fetchFailed('ETIMEDOUT'), PROXY).code).toBe('PROXY_UNREACHABLE');
  });

  it('HTTP_PROXY alone is honoured, and the message names THAT variable', () => {
    const d = classifyNetworkError(fetchFailed('ECONNREFUSED'), { HTTP_PROXY: 'http://p:3128' });
    expect(d.remedy).toContain('HTTP_PROXY=http://p:3128');
    expect(d.remedy).not.toContain('HTTPS_PROXY');
  });

  it('lowercase https_proxy is honoured too', () => {
    // The lowercase spellings are the conventional ones on Unix and are what most laptops set.
    expect(classifyNetworkError(fetchFailed('ECONNREFUSED'), { https_proxy: 'http://p:3128' }).code)
      .toBe('PROXY_UNREACHABLE');
  });
});

describe('anything else', () => {
  it('an unknown code is NETWORK_ERROR but still carries the cause', () => {
    const d = classifyNetworkError(fetchFailed('EHOSTUNREACH'), {});
    expect(d.code).toBe('NETWORK_ERROR');
    expect(d.cause).toBe('EHOSTUNREACH');
    expect(d.remedy).toContain('EHOSTUNREACH');
  });

  it('an error with no cause at all does not throw', () => {
    const d = classifyNetworkError(new Error('something'), {});
    expect(d.code).toBe('NETWORK_ERROR');
    expect(d.cause).toBeNull();
  });

  it('the cause is found through several layers of wrapping', () => {
    // undici nests it; a classifier that read only `err.cause.code` would return NETWORK_ERROR
    // for every real failure and look like it was working.
    expect(classifyNetworkError(fetchFailed('ENOTFOUND', 4), {}).code).toBe('DNS_FAILURE');
  });

  it('a cyclic cause chain terminates', () => {
    const a = new Error('a') as Error & { cause?: unknown };
    a.cause = a;
    expect(() => classifyNetworkError(a, {})).not.toThrow();
  });
});

describe('proxy URLs are masked wherever they are printed', () => {
  it('userinfo is replaced, host and port survive', () => {
    expect(maskProxyUrl('http://user:hunter2@proxy.corp:8080'))
      .toBe('http://***@proxy.corp:8080');
  });

  it('and the password is not in the classified remedy either', () => {
    // The end-to-end version of the claim: the remedy is what reaches the user, the log and
    // any bug report pasted from it.
    const d = classifyNetworkError(fetchFailed('ECONNREFUSED'),
      { HTTPS_PROXY: 'http://alice:s3cr3t@proxy.corp:8080' });
    expect(d.remedy).not.toContain('s3cr3t');
    expect(d.remedy).not.toContain('alice');
    expect(d.remedy).toContain('proxy.corp:8080');
  });

  it('a proxy with no credentials is unchanged', () => {
    expect(maskProxyUrl('http://proxy.corp:8080')).toBe('http://proxy.corp:8080');
  });

  it('an unparseable value is not echoed back', () => {
    // Whatever it is, it is not a URL — and an unparseable environment value can be anything,
    // including a pasted credential.
    expect(maskProxyUrl('not a url at all')).toBe('(unparseable)');
    expect(maskProxyUrl(undefined)).toBe('(unset)');
  });
});

describe('the codes are registered', () => {
  it.each(['DNS_FAILURE', 'TLS_CA_UNTRUSTED', 'PROXY_UNREACHABLE', 'CONNECTION_REFUSED',
    'CONNECTION_TIMEOUT', 'NETWORK_ERROR'])('%s is in the error registry with a remedy', (code) => {
    const entry = ERROR_CODES.find((c) => c.code === code);
    expect(entry, `${code} missing from src/errors/codes.ts`).toBeDefined();
    expect(entry!.remedy.length).toBeGreaterThan(0);
  });
});
