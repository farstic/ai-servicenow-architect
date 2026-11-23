export interface StartCandidate {
    label: string;
    /** Whether the loader registers it. */
    loads: boolean;
}
/**
 * The label a new session starts on, from the store's default and its instances in store order; `null` when nothing loads. A default that is not in the
 * store, or does not load, is no default.
 */
export declare function startInstance(defaultInstance: string | null | undefined, entries: readonly StartCandidate[]): string | null;
/** What the loader reads of a store entry to decide whether it loads. */
export interface LoadableEntry {
    environment: string;
    preset: string;
    flags?: Partial<Record<string, string>>;
    prodWriteAck?: boolean;
}
/** The loader's refusal, asked without building a client: the same three steps `registerClient` takes (expand the preset, apply the dependency rule, check the production posture). */
export declare function entryLoads(label: string, entry: LoadableEntry): boolean;
export interface StartsOn {
    label: string;
    environment: string;
}
/** What a new session starts on for a whole store, with the environment a message names it by; `null` when nothing loads or nothing is there. */
export declare function startOfStore(store: {
    defaultInstance?: string | null;
    instances: Readonly<Record<string, LoadableEntry>>;
}): StartsOn | null;
