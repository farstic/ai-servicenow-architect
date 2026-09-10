/**
 * ARC-07-S02 — is the instance reachable, and if not, WHICH of DNS, TLS or a proxy is in the way.
 *
 * R-3: on a corporate laptop "unreachable" is not a diagnosis, it is the start of an afternoon.
 * The three failures that produce it look identical from the outside and need completely
 * different actions — a name that does not resolve, a gateway presenting its own certificate, a
 * proxy that is not there — so the probe names the one that happened and prints the remedy for
 * it, with the host and the (masked) proxy substituted in.
 *
 * Two things this file deliberately does NOT do:
 *
 *   IT OPENS NO HTTP CALL SITE OF ITS OWN. Everything goes through ARC-04-S11's `snFetch`, so the
 *   proxy agent and `NODE_EXTRA_CA_CERTS` apply — a probe that bypassed them would report a
 *   reachability the real client does not have, which is worse than no probe. (This sentence used
 *   to name the global function it avoids, which made this file a hit in the very sweep that
 *   enforces the rule: `tests/servicenow/proxy.test.ts` greps `src/` for the call, and a comment
 *   is text like any other. Eleventh time in this repository.)
 *
 *   IT ADDS NO SECOND ERROR CLASSIFIER. `classifyNetworkError` decides the code, and the REMEDY
 *   text comes from `ERROR_CODES` — the one table `docs/TROUBLESHOOTING.md` and the doctor render
 *   too. Two remedy texts for one condition is how a user gets told two different things.
 */
import { ERROR_CODES, type ErrorCodeName } from '../errors/codes.js';
import { classifyNetworkError, maskProxyUrl } from './net-errors.js';
import { snFetch } from './http.js';

export interface ReachabilityOk {
  ok: true;
  status: number;
  latencyMs: number;
}

export interface ReachabilityFail {
  ok: false;
  code: ErrorCodeName;
  /** The underlying code, when there was one — `ENOTFOUND`, `UND_ERR_CONNECT_TIMEOUT`, … */
  cause: string | null;
  /** The registry remedy with `<host>`, `<proxy>` and `<issuer>` filled in. */
  remedy: string;
  latencyMs: number;
}

export type Reachability = ReachabilityOk | ReachabilityFail;

/** HTTP 407 is a RESPONSE, so the network classifier never sees it. The probe maps it. */
export const PROXY_AUTH_STATUS = 407;

const registryRemedy = (code: ErrorCodeName): string =>
  ERROR_CODES.find((e) => e.code === code)?.remedy ?? '';

/**
 * The registry template, instantiated.
 *
 * The placeholders are deliberately visible in the registry: `docs/TROUBLESHOOTING.md` prints the
 * same string, and a reader looking up `DNS_FAILURE` there has no host to substitute. `<issuer>`
 * is dropped rather than left empty when the certificate did not say — a remedy that reads
 * "(issuer: )" invites the reader to look for something that is not there.
 */
export function fillRemedy(code: ErrorCodeName, {
  host, proxy, issuer,
}: { host: string; proxy?: string | undefined; issuer?: string | undefined }): string {
  let text = registryRemedy(code)
    .replaceAll('<host>', host)
    .replaceAll('<proxy>', proxy ? maskProxyUrl(proxy) : 'the configured proxy');
  text = issuer
    ? text.replaceAll('<issuer>', issuer)
    : text.replace(/\s*\(issuer: `<issuer>`\)/, '');
  return text;
}

/** The certificate issuer, when the error carried one. Best effort: it is a hint, not a claim. */
export function issuerOf(err: unknown): string | undefined {
  const seen = new Set<unknown>();
  let node: unknown = err;
  while (node && typeof node === 'object' && !seen.has(node)) {
    seen.add(node);
    const cert = (node as { cert?: { issuer?: { CN?: string } } }).cert;
    if (cert?.issuer?.CN) return cert.issuer.CN;
    node = (node as { cause?: unknown }).cause;
  }
  return undefined;
}

const proxyOf = (env: NodeJS.ProcessEnv): string | undefined =>
  env.HTTPS_PROXY ?? env.https_proxy ?? env.HTTP_PROXY ?? env.http_proxy;

/**
 * One `HEAD` against the origin.
 *
 * ANY status other than 407 is a success, including 302 and 401: the question is "did the
 * request reach the instance", and a login redirect is the clearest possible yes. Treating 401
 * as a failure here would report an unreachable instance to a user whose password is simply not
 * the subject yet.
 */
export async function probeReachability(url: string, {
  timeoutMs = 10_000,
  env = process.env,
  fetchImpl = snFetch,
  now = () => Date.now(),
}: Partial<{
  timeoutMs: number;
  env: NodeJS.ProcessEnv;
  fetchImpl: typeof snFetch;
  now: () => number;
}> = {}): Promise<Reachability> {
  const host = new URL(url).host;
  const started = now();
  const elapsed = () => Math.max(0, now() - started);

  try {
    // OUR deadline, as a signal: `snFetch` takes undici's `RequestInit` and has no timeout of its
    // own, and a probe with no deadline is a wizard that hangs on a network that drops packets
    // rather than refusing them. The abort is classified as a timeout (see `net-errors.ts`).
    const response = await fetchImpl(`${new URL(url).origin}/`,
      { method: 'HEAD', signal: AbortSignal.timeout(timeoutMs) });
    if (response.status === PROXY_AUTH_STATUS) {
      return {
        ok: false,
        code: 'PROXY_AUTH_REQUIRED',
        cause: String(PROXY_AUTH_STATUS),
        remedy: fillRemedy('PROXY_AUTH_REQUIRED', { host, proxy: proxyOf(env) }),
        latencyMs: elapsed(),
      };
    }
    return { ok: true, status: response.status, latencyMs: elapsed() };
  } catch (err) {
    // A 407 can arrive as a THROW instead of a response, depending on how the proxy agent
    // surfaces it — the story's open point. Both paths end at the same code.
    if (isProxyAuth(err)) {
      return {
        ok: false,
        code: 'PROXY_AUTH_REQUIRED',
        cause: String(PROXY_AUTH_STATUS),
        remedy: fillRemedy('PROXY_AUTH_REQUIRED', { host, proxy: proxyOf(env) }),
        latencyMs: elapsed(),
      };
    }
    const diagnosis = classifyNetworkError(err, env);
    return {
      ok: false,
      code: diagnosis.code as ErrorCodeName,
      cause: diagnosis.cause ?? null,
      remedy: fillRemedy(diagnosis.code as ErrorCodeName,
        { host, proxy: proxyOf(env), issuer: issuerOf(err) }),
      latencyMs: elapsed(),
    };
  }
}

/** A thrown 407, in the shapes a proxy agent produces. */
function isProxyAuth(err: unknown): boolean {
  const seen = new Set<unknown>();
  let node: unknown = err;
  while (node && typeof node === 'object' && !seen.has(node)) {
    seen.add(node);
    const e = node as { statusCode?: number; status?: number; code?: string; message?: string };
    if (e.statusCode === PROXY_AUTH_STATUS || e.status === PROXY_AUTH_STATUS) return true;
    if (e.code === 'ERR_PROXY_AUTH_REQUIRED') return true;
    if (typeof e.message === 'string' && /\b407\b/.test(e.message)) return true;
    node = (node as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * The network state, in one line, printed whether the probe succeeds or not.
 *
 * A support reader is looking at a transcript, not at the machine. "It worked" and "it worked
 * through a proxy with a corporate CA" are different facts, and only one of them explains why the
 * same command fails for their colleague. Userinfo is masked here and in every remedy — the whole
 * line is written for a screen share.
 */
export function describeNetworkEnv(env: NodeJS.ProcessEnv = process.env): string {
  const proxy = proxyOf(env);
  const noProxy = env.NO_PROXY ?? env.no_proxy;
  const ca = env.NODE_EXTRA_CA_CERTS;
  return `network: HTTPS_PROXY=${proxy ? `set (${maskProxyUrl(proxy)})` : 'unset'}`
    + ` · NO_PROXY=${noProxy && noProxy !== '' ? noProxy : 'unset'}`
    + ` · NODE_EXTRA_CA_CERTS=${ca && ca !== '' ? ca : 'unset'}`;
}

/** The two lines a failed probe prints, in the story's exact shape. */
export function formatFailure(result: ReachabilityFail): string[] {
  return [
    `reachability: FAIL ${result.code} — ${result.cause ?? 'no response'}`,
    `  remedy: ${result.remedy}`,
  ];
}

export interface MenuOption { key: string; text: string }

/**
 * What the wizard offers after a failed probe. THREE options, and none of them is "continue
 * anyway".
 *
 * P-23: the wizard this replaces offered exactly that, and a user who took it saved an instance
 * that had never answered — the failure then reappeared later, in a tool call, with no memory of
 * this moment. Nothing is saved from here except by going back and succeeding.
 */
export function reachabilityMenu(): MenuOption[] {
  return [
    { key: 'reenter', text: 're-enter the URL' },
    { key: 'retry', text: 'retry' },
    { key: 'abort', text: 'abort (nothing is saved)' },
  ];
}
