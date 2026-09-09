// The network diagnosis vocabulary, in one module, because two subsystems reach the same internet.
//
// ARC-03-S05 wrote these sentences for git's stderr; ARC-06-S04's preflight reaches github.com over
// `node:https` and hits the same four walls — DNS, an unreachable proxy, a TLS-intercepting gateway,
// a full disk. An operator behind a corporate proxy should not learn two different vocabularies for
// one problem depending on which half of the tool noticed it first, so the sentences live here and
// both callers import them.
//
// What legitimately differs is the KNOB. When git fails, the fix is git's CA setting; when Node
// fails, it is Node's. So the TLS sentence is parameterised by which tool is speaking and names the
// other one second — both knobs, in the order that helps. Everything else is byte-identical.
export const TOOL = Object.freeze({ git: 'git', node: 'node' });

/**
 * A proxy URL is printed back at the operator — that is the whole point of the message — and their
 * `HTTPS_PROXY` may carry `user:password@`. The password is removed before the sentence exists,
 * not on the way to the terminal, so no later caller can print the unmasked form.
 */
export function maskProxy(url) {
  if (!url) return null;
  return String(url).replace(/\/\/[^/@]*@/, '//***@');
}

/** `host:port` from a proxy URL, for the message. Falls back to the masked URL if it will not parse. */
export function proxyAddress(url) {
  try {
    const u = new URL(/^[a-z]+:\/\//i.test(url) ? url : `http://${url}`);
    return u.port ? `${u.hostname}:${u.port}` : u.hostname;
  } catch { return maskProxy(url); }
}

/** The host a URL points at, for the DNS message. `file://` fixtures have none. */
export function upstreamHost(upstream) {
  try { return new URL(upstream).hostname || null; } catch { return null; }
}

export const proxyUnreachable = (proxy) =>
  `cannot reach proxy ${proxyAddress(proxy)} (HTTPS_PROXY) — fix the proxy address, `
  + 'or unset HTTPS_PROXY / add github.com to NO_PROXY, and re-run';

export const dnsFailure = (host) =>
  `cannot reach ${host} (DNS) — check your network and re-run`;

export const noRoute = (host) =>
  `no route to ${host} — are you offline, or is a firewall blocking 443?`;

/**
 * The CA sentence. `tool` is who just failed, and its knob comes first; the other is named too,
 * because a corporate bundle is always needed by both and finding that out twice is a bad day.
 */
export function tlsIntercepted({ tool = TOOL.git } = {}) {
  return tool === TOOL.node
    ? 'TLS interception detected — export NODE_EXTRA_CA_CERTS=<your corporate CA bundle .pem> '
      + 'and re-run; git needs the same bundle via git config --global http.sslCAInfo '
      + '(docs/TROUBLESHOOTING.md)'
    : 'TLS interception detected — set GIT_SSL_CAINFO (or git config http.sslCAInfo) to your '
      + 'corporate CA bundle and re-run; the MCP server needs the same bundle via '
      + 'NODE_EXTRA_CA_CERTS (docs/TROUBLESHOOTING.md)';
}

export const noDiskSpace =
  'insufficient disk space: need ~400 MB free (~700 MB for --mode full)';

export const unfetchablePin = (pin) =>
  `pin ${String(pin ?? '').slice(0, 7)} not fetchable from upstream (force-push or history `
  + 'rewrite?) — maintainer: run ./snowarch docs sync --upstream';
