/**
 * `{ code }` when a file is at `path` and cannot be read as JSON, `null` when it is not there or parses. ENOENT is "no store yet" and nothing
 * else is: a file that cannot be read is somebody's store.
 */
export declare function unreadableStore(path: string): {
    code: string;
} | null;
export interface StoreRefusalWords {
    /** The store's own error, as the step names it. */
    code: string;
    /** What is wrong with the file, to follow its name: `cannot be read as JSON`. */
    what: string;
    /** What to do, in the step's own style (a clause, no full stop). */
    remedy: string;
}
/**
 * The words for one of the store's errors. `cli` is the launcher as this platform spells it and `file` the store as the step shows it
 * (`.local/instances.json`, relative: an absolute path names the account). A code this does not know is spoken of as a file that cannot be read.
 */
export declare function storeRefusalWords(code: string, cli: string, file: string): StoreRefusalWords;
