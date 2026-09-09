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
/** The six codes this classifier can produce. Registered in `src/errors/codes.ts`. */
export type NetworkErrorCode = 'DNS_FAILURE' | 'TLS_CA_UNTRUSTED' | 'PROXY_UNREACHABLE' | 'CONNECTION_REFUSED' | 'CONNECTION_TIMEOUT' | 'NETWORK_ERROR';
export interface NetworkDiagnosis {
    code: NetworkErrorCode;
    /** The underlying system code, e.g. `ENOTFOUND` — kept so a report can be traced back. */
    cause: string | null;
    remedy: string;
}
/**
 * A proxy URL with its userinfo removed.
 *
 * `http://user:pass@proxy:8080` is a perfectly ordinary value of `HTTPS_PROXY`, and every
 * message here names the proxy so the user can see which one was tried. Printing it whole would
 * put a password in an error string, a log line and — through the classifier's remedy — in the
 * audit trail's neighbourhood. The host and port are what identifies the proxy; the credentials
 * identify the user.
 */
export declare function maskProxyUrl(raw: string | undefined): string;
/**
 * Classify a thrown fetch error.
 *
 * `env` is a parameter so the tests can classify against a chosen proxy setting without
 * mutating the process — and so the remedy names the variable the SERVER read, not whatever
 * the environment happens to hold when the message is finally rendered.
 */
export declare function classifyNetworkError(err: unknown, env?: NodeJS.ProcessEnv): NetworkDiagnosis;
