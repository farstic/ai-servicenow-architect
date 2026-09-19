export interface DefaultLabel {
    label: string;
}
/**
 * `{ label }` when the store names a default, `null` otherwise — including when the file is
 * missing or malformed. A mirror that threw would make an unreadable store fail a step whose job
 * is unrelated to it; the store's own reader reports that, with its own diagnosis.
 */
export declare function readDefaultLabel(storePath: string): DefaultLabel | null;
/** The three non-secret fields that name an install: what B09 prints and what `mode` reports. */
export interface DefaultSummary {
    label: string;
    environment: string | null;
    preset: string | null;
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
export declare function readDefaultSummary(storePath: string): DefaultSummary | null;
/**
 * Every configured instance, named — ARC-09-C17.
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
export declare function readStoreSummaries(storePath: string): DefaultSummary[];
