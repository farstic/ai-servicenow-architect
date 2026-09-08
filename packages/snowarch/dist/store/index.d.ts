import { type Store, type StoreError } from './schema.js';
export * from './paths.js';
export * from './schema.js';
/**
 * POSIX mode check.
 *
 * THE FILE is what holds the password, so any group or world bit on it is a refusal.
 *
 * THE DIRECTORY is a different risk, and the first version of this got it wrong: it
 * refused on any `0o077` directory bit, which rejects a 0600 store sitting in an ordinary
 * 0755 folder — and `/tmp`, which is 1777, and is the path the story's own criterion 1
 * uses. A 0600 file is unreadable whatever its directory. What a directory bit actually
 * buys an attacker is group/world WRITE: the ability to replace the file or plant a
 * symlink in its place. So:
 *
 *   - group/world WRITE on the directory, without the sticky bit → REFUSE. Sticky (1777,
 *     as on /tmp) means only the owner can unlink or rename another user's entry, which
 *     removes exactly that attack.
 *   - any other group/world bit on the directory → WARN and load. Worth telling someone
 *     about; not worth refusing a correctly protected file over.
 *
 * Every path in the message is masked at construction: `maskPath` for the prose, and
 * `shellRemedy` for the `Run:` clause so the remedy is pasteable AND carries no absolute
 * path — checkout-relative inside the checkout, `~` under HOME, as given elsewhere.
 * Masking a whole sentence afterwards misses every occurrence but the first, which is how
 * the raw home directory used to reach the log; and masking only to `~` left an absolute
 * path whenever the checkout was not under HOME.
 *
 * Skipped entirely on Windows, where permissions are ACL-inherited and the POSIX mode bits
 * Node reports are synthetic (01 §13).
 */
export declare function checkFileModes(path: string): {
    error?: StoreError;
    warning?: string;
};
export declare function loadStore(path: string): {
    store: Store;
    warning?: string;
} | {
    error: StoreError;
};
/**
 * Atomic write: temp file in the same directory, fsync, rename over the target.
 *
 * Same directory because rename is only atomic within a filesystem. fsync before rename
 * because a rename can land before the data does, leaving a valid name over a truncated
 * file after a crash. `renameSync` replaces an existing file on Windows too — the
 * windows-latest cell in tests/store/atomic.test.ts is what proves that here rather than
 * on the documentation's word.
 */
export declare function saveStore(path: string, store: Store): void;
