/**
 * The one place this package makes an HTTP request.
 *
 * Node's global `fetch` ignores `HTTPS_PROXY`, `HTTP_PROXY` and `NO_PROXY` entirely (R-15).
 * That is not a bug — WHATWG fetch says nothing about proxy variables — but it means a laptop
 * on a corporate network gets `fetch failed` from a client that never tried the proxy, while
 * `curl` to the same URL works, which reads as "the tool is broken".
 *
 * `undici` is the same implementation Node bundles, published separately so a dispatcher can be
 * attached. `EnvHttpProxyAgent` reads the proxy variables **when it is constructed**, which is
 * why `env-sanitise.ts` runs first at both entry points and why the agent is built lazily here
 * rather than at module load: a test that sets `HTTPS_PROXY` and then imports this module would
 * otherwise be configuring an agent that already exists.
 *
 * `grep -rn "\bfetch(" src` is expected to show only this file. That is criterion 7, and the
 * reason for it is that a second call site is a second place where proxy support silently does
 * not apply — and it would fail only on the machines least able to debug it.
 */
import { EnvHttpProxyAgent, fetch as undiciFetch } from 'undici';
let dispatcher;
let connectOptions;
/**
 * Built on first use, then reused: one connection pool for the process.
 *
 * Constructing an agent per request would defeat keep-alive and open a new socket every time —
 * on a proxied network, a new CONNECT tunnel every time.
 */
function getDispatcher() {
    if (!dispatcher) {
        dispatcher = new EnvHttpProxyAgent(connectOptions ? { connect: connectOptions } : undefined);
    }
    return dispatcher;
}
/**
 * Drop the cached agent so the next request rebuilds it from the current environment.
 *
 * For tests only. Production code changes no proxy variable after start-up, and a caller that
 * did would be changing where requests go mid-session — which is the kind of thing
 * `snow_core_instance_switch` exists to make visible rather than something to support quietly.
 *
 * `connect` is the same escape hatch, for the same audience: undici passes these straight to
 * `net.connect`, so a test can supply its own `lookup` and make a name fail to resolve WITHOUT
 * asking the machine's resolver. That matters because the alternative — pointing a test at a
 * name that "cannot resolve" — is a test that depends on the network it is trying not to use, and
 * it failed exactly that way on a macOS runner where something answered for a `.invalid` host.
 *
 * Passing nothing clears both, so the seam cannot leak from one test into the next: the existing
 * `afterEach` calls this with no arguments and gets the production agent back for free.
 */
export function resetHttpDispatcher(connect) {
    dispatcher = undefined;
    connectOptions = connect;
}
/** True when a proxy variable is set to a non-empty value — for diagnostics, not for routing. */
export function proxyConfigured(env = process.env) {
    return Boolean(env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy);
}
/** `fetch`, through the proxy agent. Same signature as the global. */
export function snFetch(url, init = {}) {
    return undiciFetch(url, { ...init, dispatcher: getDispatcher() });
}
