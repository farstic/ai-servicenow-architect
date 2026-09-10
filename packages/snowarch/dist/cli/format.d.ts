import { type Store, type StoreInstance } from '../store/schema.js';
import type { LastProbe } from '../servicenow/probes.js';
import type { Flags } from '../utils/permissions.js';
/**
 * A secret, described rather than shown: `set (len 12)`.
 *
 * The LENGTH is the useful part — "did the client secret arrive whole" is the question a support
 * conversation actually asks — and it is not the secret. `not set` for an absent one, because an
 * empty field and a missing field are different states to a reader debugging an OAuth entry.
 */
export declare const secretNote: (secret: string | undefined) => string;
export interface MaskedInstance {
    label: string;
    url: string;
    environment: StoreInstance['environment'];
    auth: {
        method: StoreInstance['auth']['method'];
        username: string;
        secret: string;
    };
    preset: StoreInstance['preset'];
    flags: Flags;
    prodWriteAck: boolean;
    lastProbe: LastProbe | null;
}
export declare function maskedInstance(label: string, entry: StoreInstance): MaskedInstance;
export interface ListJson {
    store: string;
    defaultInstance: string | null;
    instances: MaskedInstance[];
}
/** `list --json`. The store path is masked too: an absolute path carries the account name. */
export declare function listJson(storePath: string, store: Store): ListJson;
export declare const NO_INSTANCES = "No instances configured. Add one with: ./snowarch instance add <label> --url https://<host>";
/** One probe as the table shows it: `auth ok · write ok · …`, or a dash when none has run. */
export declare function probeCell(probe: LastProbe | null): string;
/**
 * The table. Columns are as wide as their widest cell, never wider.
 *
 * The `LAST PROBE` header carries the time of the most RECENT probe in the store, because every
 * row's own time would repeat a 20-character timestamp per line to say what one header says once,
 * and a table nobody can read across is a table nobody reads.
 */
export declare function listTable(list: ListJson): string;
export interface ProbesJson {
    store: string;
    instances: Record<string, LastProbe>;
}
/**
 * `test --json` and `test --all --json` — ONE envelope, whether it holds one instance or five.
 *
 * The story specifies the shape for `--all`; giving the single form a different one would make
 * ARC-06-S08's merge (`probes[label] = JSON.parse(stdout)`) depend on which flag produced the
 * output, and a consumer that has to ask "how many did I request?" before reading a result is a
 * consumer that will get it wrong once.
 */
export declare function probesJson(storePath: string, probes: Record<string, LastProbe>): ProbesJson;
/**
 * The precedence sentence, spelled ONCE.
 *
 * `add --global`, `list --all` and `instance test` all say it, and the one thing a user needs from
 * it is which file the server will actually read. Paths go through `maskPath` — the home directory
 * becomes `~`, and an absolute path carries the account name into every screen share and ticket.
 */
export declare const precedenceNote: (label: string, firstPath: string, globalPath: string, source?: StoreLabel) => string;
/** The footer `list` prints when the OTHER store is not empty. */
export declare const otherStoreFooter: (count: number) => string;
/**
 * What the STORE column says — the thing that SELECTED the file, in the words a reader can check.
 *
 * `SNOW_STORE` rather than the resolver's internal `env`: a cell saying `env` sends somebody
 * looking for an environment, and the variable's own name is both shorter and checkable.
 */
export type StoreLabel = 'project' | 'global' | 'SNOW_STORE';
export declare const storeLabelFor: (source: string) => StoreLabel;
export interface CombinedListJson extends ListJson {
    /** `list --all`: which store each row came from, and the note when a label is in both. */
    stores: Record<StoreLabel, string | null>;
    notes: string[];
}
/**
 * Both stores, side by side, with every row saying where it came from.
 *
 * NEVER MERGED — `01` §7, and the reason is that a merge makes "which file set this value"
 * unanswerable. The rows are concatenated, a duplicate label appears TWICE with different `store`
 * values, and the note says which of the two the server reads.
 */
export declare function combinedListJson(first: {
    path: string;
    store: Store | null;
    source: StoreLabel;
}, globalStore: {
    path: string;
    store: Store | null;
}): CombinedListJson;
/** `list --all`: the table with a STORE column, then the precedence note for anything in both. */
export declare function listAllTable(list: CombinedListJson): string;
