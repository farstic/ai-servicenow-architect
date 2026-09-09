export interface DefaultLabel {
    label: string;
}
/**
 * `{ label }` when the store names a default, `null` otherwise — including when the file is
 * missing or malformed. A mirror that threw would make an unreadable store fail a step whose job
 * is unrelated to it; the store's own reader reports that, with its own diagnosis.
 */
export declare function readDefaultLabel(storePath: string): DefaultLabel | null;
