/**
 * Turn a network failure into a name, a cause and something to do about it.
 *
 * R-3 exists because the failure a corporate laptop actually produces is `TypeError: fetch
 * failed` with the real reason two `cause` levels down, and that message is indistinguishable
 * between "your instance host name is wrong", "your company intercepts TLS and we do not trust
 * the certificate" and "your proxy is not listening". Those have three different remedies and
 * only one of them is the user's typo, so a first live session that fails with `fetch failed`
 * sends people to the wrong place — usually to their credentials, which are fine.
 */
const DNS = new Set(['ENOTFOUND', 'EAI_AGAIN']);
const TLS_UNTRUSTED = new Set([
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    'SELF_SIGNED_CERT_IN_CHAIN',
    'DEPTH_ZERO_SELF_SIGNED_CERT',
    'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
    'CERT_HAS_EXPIRED',
    'ERR_TLS_CERT_ALTNAME_INVALID',
]);
const TIMEOUT = new Set([
    'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT',
]);
/**
 * A proxy URL with its userinfo removed.
 *
 * `http://user:pass@proxy:8080` is a perfectly ordinary value of `HTTPS_PROXY`, and every
 * message here names the proxy so the user can see which one was tried. Printing it whole would
 * put a password in an error string, a log line and — through the classifier's remedy — in the
 * audit trail's neighbourhood. The host and port are what identifies the proxy; the credentials
 * identify the user.
 */
export function maskProxyUrl(raw) {
    if (!raw)
        return '(unset)';
    try {
        const u = new URL(raw);
        if (u.username || u.password) {
            u.username = '***';
            u.password = '';
        }
        // `URL` renders `***@` for the userinfo and keeps host, port and protocol intact.
        return u.toString().replace(/\/$/, '');
    }
    catch {
        // Not a URL at all — which is itself worth surfacing, but not by echoing whatever it was:
        // an unparseable value can be anything, including a pasted credential.
        return '(unparseable)';
    }
}
/** Walk `cause` to the deepest system code. undici nests the real reason two levels down. */
/** A request that was aborted — by our own deadline, or by a caller's signal. */
function isAbort(err) {
    const seen = new Set();
    let node = err;
    while (node && typeof node === 'object' && !seen.has(node)) {
        seen.add(node);
        const name = node.name;
        if (name === 'TimeoutError' || name === 'AbortError')
            return true;
        node = node.cause;
    }
    return false;
}
function deepestCode(err) {
    let current = err;
    let found = null;
    for (let depth = 0; current && depth < 8; depth += 1) {
        const code = current.code;
        if (typeof code === 'string')
            found = code;
        current = current.cause;
    }
    return found;
}
/**
 * Classify a thrown fetch error.
 *
 * `env` is a parameter so the tests can classify against a chosen proxy setting without
 * mutating the process — and so the remedy names the variable the SERVER read, not whatever
 * the environment happens to hold when the message is finally rendered.
 */
export function classifyNetworkError(err, env = process.env) {
    const cause = deepestCode(err);
    const proxy = env.HTTPS_PROXY ?? env.https_proxy ?? env.HTTP_PROXY ?? env.http_proxy;
    const proxyVar = (env.HTTPS_PROXY ?? env.https_proxy) ? 'HTTPS_PROXY' : 'HTTP_PROXY';
    if (cause && DNS.has(cause)) {
        return {
            code: 'DNS_FAILURE',
            cause,
            remedy: proxy
                ? 'the instance host name did not resolve; check the spelling, and note that a proxy is '
                    + `configured (${proxyVar}=${maskProxyUrl(proxy)}) — a proxy does not resolve names for you `
                    + 'unless the request goes through it'
                : 'the instance host name did not resolve; check the spelling. On a corporate network, set '
                    + 'HTTPS_PROXY to your proxy',
        };
    }
    if (cause && TLS_UNTRUSTED.has(cause)) {
        return {
            code: 'TLS_CA_UNTRUSTED',
            cause,
            // Never NODE_TLS_REJECT_UNAUTHORIZED=0. It is the first hit for this error and it disables
            // certificate checking for the whole process, which on a TLS-intercepting network means
            // trusting the interceptor and everything else too.
            remedy: 'the TLS certificate was not signed by a CA this machine trusts, which is normal on a '
                + 'network that intercepts TLS. Export your organisation root CA as PEM and set '
                + 'NODE_EXTRA_CA_CERTS to its path, then restart the server. Do not disable certificate '
                + 'verification',
        };
    }
    if (cause === 'ECONNREFUSED') {
        // A refused connection when a proxy is set is almost always the PROXY refusing, not the
        // instance: the client never opens a socket to the instance at all. Reporting
        // CONNECTION_REFUSED there would send the user to check a host that was never contacted.
        return proxy
            ? {
                code: 'PROXY_UNREACHABLE',
                cause,
                remedy: `${proxyVar}=${maskProxyUrl(proxy)} is set but not reachable — nothing is listening `
                    + 'there. Check the proxy host and port, or unset the variable if you are not behind a proxy',
            }
            : {
                code: 'CONNECTION_REFUSED',
                cause,
                remedy: 'the instance refused the connection; check the URL, its port, and whether the '
                    + 'instance is awake',
            };
    }
    // An ABORTED request is a timeout too, and it carries no `code` at all: `AbortSignal.timeout`
    // rejects with a `TimeoutError` DOMException, so `deepestCode` finds nothing and the request
    // would have been classified `NETWORK_ERROR` — "run the doctor" — for the one failure whose
    // remedy is the most specific of the six. Added by ARC-07-S02, whose probe sets its own
    // deadline; every other caller that passes a signal gets it as well.
    const aborted = isAbort(err);
    if (aborted || (cause && TIMEOUT.has(cause))) {
        return proxy
            ? {
                code: 'PROXY_UNREACHABLE',
                cause,
                remedy: `${proxyVar}=${maskProxyUrl(proxy)} is set but not reachable — the connection timed `
                    + 'out. Check the proxy host and port, or unset the variable if you are not behind a proxy',
            }
            : {
                code: 'CONNECTION_TIMEOUT',
                cause,
                remedy: 'the connection timed out. If you are on a corporate network, set HTTPS_PROXY; '
                    + 'otherwise check connectivity to the instance',
            };
    }
    return {
        code: 'NETWORK_ERROR',
        cause,
        remedy: cause
            ? `the request failed with ${cause}. Run ./snowarch doctor for a fuller diagnosis`
            : 'the request failed before a response was received. Run ./snowarch doctor for a fuller '
                + 'diagnosis',
    };
}
