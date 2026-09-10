/**
 * The doctor's probes: ARC-07-S03's implementation, adapted to ARC-04-S12's declaration.
 *
 * Two signatures existed for one job — the doctor declared `runAll(instanceLabel)` before the
 * probes were written, and the probes landed as `probeAll(client, options)`. Adapting them in ONE
 * place is the whole point of this file: a check that built its own client would be a second
 * answer to "how do we authenticate a probe", and the first thing such an answer loses is
 * `maxRetries: 0` — the rule that stops a 401 becoming three.
 *
 * WHAT THIS NEVER DOES IS WRITE. The wizard records `lastProbe` in the store; the doctor reads and
 * reports. A doctor that wrote its findings would change the file it is diagnosing, and a user
 * comparing two runs could not tell which changes were theirs.
 */
import { probeClientFor, probeOptionsFor } from '../servicenow/probe-client.js';
import { probeAll } from '../servicenow/probes.js';
import { storeEntry } from './store-entry.js';
/** `auth ok · write ok · scripting role missing (…)` — one line, statuses only. */
export function describeProbes(result) {
    const parts = [`auth ${result.auth.status}`];
    for (const c of result.capabilities) {
        if (c.status === 'skipped')
            continue;
        // The flag's own name, lower-cased and without the suffix every flag shares: the line is read
        // at a glance and `WRITE_ENABLED ok · CMDB_WRITE_ENABLED ok` is six words of noise.
        parts.push(`${c.flag.replace(/_ENABLED$/, '').toLowerCase()} ${c.status}`);
    }
    return parts.join(' · ');
}
/** The worst status wins, and only `ok` is ok. A probe that could not run is a `warn`, not a pass. */
export function statusOf(result) {
    if (result.auth.status === 'auth failed')
        return 'fail';
    if (result.auth.status !== 'ok')
        return 'warn';
    return result.capabilities.some((c) => c.status === 'error' || c.status === 'unreachable')
        ? 'warn'
        : 'ok';
}
/**
 * The real probes, bound to the store.
 *
 * `stubProbes` stays the answer for "no instance configured" — that is a real state and `skip` is
 * its honest report — so this returns the same shape and the caller chooses between them by
 * whether an entry exists.
 */
export { storeEntry };
export function makeProbes(deps = {}) {
    const probe = deps.probe ?? probeAll;
    const makeClient = deps.makeClient ?? probeClientFor;
    const env = deps.env ?? process.env;
    const readEntry = deps.readEntry ?? storeEntry;
    return {
        async runAll(label) {
            const entry = readEntry(label);
            if (!entry) {
                return {
                    status: 'skip',
                    detail: `no store entry for "${label}" — nothing to probe`,
                    remedy: 'add one with ./snowarch instance add',
                };
            }
            const client = makeClient({ url: entry.url, auth: entry.auth });
            const result = await probe(client, probeOptionsFor(entry.auth, env));
            const status = statusOf(result);
            const detail = `${label}: ${describeProbes(result)}`;
            const data = { label, auth: result.auth.status,
                capabilities: Object.fromEntries(result.capabilities.map((c) => [c.flag, c.status])) };
            // A CODE beats a hint: `OAUTH_ROPC_DISABLED` has a remedy in the contract, and the registry's
            // is the one `docs/TROUBLESHOOTING.md` prints. Never both — the runner refuses a result that
            // carries a code and a remedy, because that is two answers to one question.
            if (result.auth.code) {
                return { status, detail, code: result.auth.code, data };
            }
            const remedy = result.auth.status === 'ok' ? undefined : result.auth.hint;
            return { status, detail, ...(remedy ? { remedy } : {}), data };
        },
    };
}
