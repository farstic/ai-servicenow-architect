/**
 * The store's default instance, named — never its secrets.
 *
 * `.local/config.json` mirrors the label so the doctor and the launchers can name the configured
 * instance without opening the credential store. Two constraints shaped this into its own module:
 *
 *   NO ZOD. `index.ts` validates through a schema, and the schema package only exists after B04's
 *   `npm ci`. B07 runs in a design-only checkout that never installs anything, so a reader that
 *   imported the validator could not run at all there.
 *
 *   NO SECRETS, BY CONSTRUCTION. `readDefaultLabel` returns one string and `readDefaultSummary`
 *   returns three — label, environment, preset, the three fields B09 already calls "the three that
 *   are not secrets". Neither reads, copies or returns a URL, a username or a credential, and a
 *   test pins the exact key set of each — so a later "while we're here, also return the instance
 *   URL" has to argue with a test rather than slip in.
 *
 * The store remains authoritative: this is a mirror, and ARC-07's `set-default` re-mirrors it.
 */
import { readFileSync } from 'node:fs';
/**
 * `{ label }` when the store names a default, `null` otherwise — including when the file is
 * missing or malformed. A mirror that threw would make an unreadable store fail a step whose job
 * is unrelated to it; the store's own reader reports that, with its own diagnosis.
 */
export function readDefaultLabel(storePath) {
    let parsed;
    try {
        parsed = JSON.parse(readFileSync(storePath, 'utf8'));
    }
    catch {
        return null;
    }
    const value = parsed?.defaultInstance;
    return typeof value === 'string' && value.length > 0 ? { label: value } : null;
}
/**
 * The default instance's label, environment and preset — ARC-06-C15.
 *
 * `./snowarch mode` printed `instance=pdi (unknown) preset=unknown` on every live checkout, because
 * it read `state.instance` and `state.steps.B08.data.instance` and NOTHING in the tree ever wrote
 * either. The two fields could not be anything but `unknown`. B06 has just watched the wizard save
 * them, so B06 is the step that should record them — the same rule ARC-06-C7 applied to the mode
 * itself: the step that makes it true is the step that writes it down.
 *
 * Deliberately NOT an extension of `readDefaultLabel`: that function's one-key shape is pinned by a
 * test whose message says "exactly one key, so nothing else can ride along", and the right answer to
 * a guard like that is a second function with its own guard, not an argument with it.
 */
export function readDefaultSummary(storePath) {
    let parsed;
    try {
        parsed = JSON.parse(readFileSync(storePath, 'utf8'));
    }
    catch {
        return null;
    }
    const root = parsed;
    const label = root?.defaultInstance;
    if (typeof label !== 'string' || label.length === 0)
        return null;
    const entry = root?.instances?.[label];
    const str = (v) => (typeof v === 'string' && v.length > 0 ? v : null);
    // Named explicitly, one at a time. A spread of the entry would carry the credential block.
    return { label, environment: str(entry?.environment), preset: str(entry?.preset) };
}
/**
 * Every configured instance, named — ARC-08-C17.
 *
 * SV-03's cheap half: who is in the store, without a probe, a network call or a spawned server.
 * The doctor's quick run needs this because `deriveMode` was deciding "design-only" from an empty
 * instance list that was empty only because nobody had asked — and the SessionStart hook prints
 * that line, while the rule file forbids every MCP call in design-only. A checkout with a working
 * instance could not get a single tool called.
 *
 * Same discipline as its two siblings: three non-secret fields per entry, named one at a time, and
 * a test pins the key set. A spread of the entry would carry the credential block.
 */
export function readStoreSummaries(storePath) {
    let parsed;
    try {
        parsed = JSON.parse(readFileSync(storePath, 'utf8'));
    }
    catch {
        return [];
    }
    const instances = parsed?.instances;
    if (!instances || typeof instances !== 'object')
        return [];
    const str = (v) => (typeof v === 'string' && v.length > 0 ? v : null);
    return Object.entries(instances).map(([label, raw]) => {
        const entry = raw;
        return { label, environment: str(entry?.environment), preset: str(entry?.preset) };
    });
}
