import { type Migration } from '../store/migrations/index.js';
export interface StoreIo {
    write(text: string): void;
    error(text: string): void;
    ask(prompt: string): Promise<string>;
}
export declare const defaultStoreIo: () => StoreIo;
export declare const NOTHING_CHANGED = "store: nothing changed";
export declare function storeHelp(): string;
/**
 * `chain` is the same seam `migrateStore` exposes, passed through rather than re-invented.
 *
 * The shipped registry is empty at v1, so without it the plan screen, the `n` path and `--yes`
 * would have no migration to be about and AC 5 would be asserted against a program that took the
 * "nothing to do" branch every time. A test supplying its own chain exercises the real code with
 * a real pending migration; production passes nothing and gets `MIGRATIONS`.
 */
export declare function runStoreMigrate(argv: readonly string[], io?: StoreIo, chain?: {
    migrations?: readonly Migration[];
    current?: number;
}): Promise<number>;
export declare function runStoreBackups(io?: StoreIo): number;
export declare function runStoreRestore(argv: readonly string[], io?: StoreIo): Promise<number>;
export declare function runStore(args: readonly string[], io?: StoreIo): Promise<number>;
