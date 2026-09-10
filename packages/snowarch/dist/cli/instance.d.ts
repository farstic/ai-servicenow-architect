import { EXIT_INTERRUPTED, EXIT_USAGE, type Io } from './tty.js';
export { EXIT_USAGE, EXIT_INTERRUPTED };
import { type Environment } from './url.js';
import { type ReviewIo } from './preset-ui.js';
import { type StoreLabel } from './format.js';
import { maskUsername } from '../store/paths.js';
import { probeReachability } from '../servicenow/reachability.js';
import { probeAll, type LastProbe, type ProbeClient } from '../servicenow/probes.js';
import { type StoreInstance } from '../store/schema.js';
import { type FlagName, type Flags } from '../utils/permissions.js';
export declare const EXIT_OK = 0;
export declare const EXIT_FAILED = 1;
export declare const EXIT_POLICY = 3;
/**
 * What each code means when THIS command produces it. One table, printed by `--help`, so the
 * help and the behaviour cannot describe different programs.
 */
export declare const EXIT_CODES: ReadonlyArray<{
    code: number;
    meaning: string;
}>;
export declare const MAX_ATTEMPTS = 3;
export declare const LABEL_RULE: RegExp;
export declare const NOTHING_SAVED = "Nothing saved.";
/**
 * The duplicate-label refusal, rendered FROM the registry.
 *
 * `LABEL_EXISTS` shipped as a bare literal: a code with no registry entry, so `docs/TROUBLESHOOTING.md`
 * documented every other failure of this command and not this one, and the remedy lived only here.
 * The registry is the single source; only the label, which no registry entry can hold, is added.
 */
export declare const labelExists: (label: string) => string;
export declare const authFailedRetry: (attempt: number) => string;
export declare const AUTH_EXHAUSTED: string;
export declare const NEXT_LINE = "Next: in Claude Code run  /snowarch setup-instance --resume  (or restart claude).";
export declare const AUTH_QUESTION = "Authentication?";
export declare const AUTH_CHOICES: ReadonlyArray<{
    key: 'basic' | 'oauth_ropc';
    text: string;
}>;
export interface AddOptions {
    label?: string;
    url?: string;
    environment?: string;
    auth?: 'basic' | 'oauth_ropc';
    username?: string;
    preset?: string;
    flags?: string;
    makeDefault?: boolean;
    global?: boolean;
    passwordStdin?: boolean;
    noProbes?: boolean;
    json?: boolean;
    yes?: boolean;
    replace?: boolean;
    fromBootstrap?: boolean;
}
export interface AddIo extends ReviewIo {
    /** S01's masked prompt, injected so a test never needs a terminal. */
    secret: (label: string) => Promise<string>;
    io?: Io;
}
export interface AddResult {
    saved: boolean;
    exitCode: number;
    entry?: MaskedEntry;
    lastProbe?: LastProbe | null;
    message?: string;
    /** The cloud-sync WARN, when there was one — kept whether the run saved or declined. */
    warnings?: string[];
}
/** What a caller may see of a saved entry: never the password, never the client secret. */
export interface MaskedEntry {
    url: string;
    environment: Environment;
    preset: string;
    flags: Flags;
    auth: {
        method: 'basic' | 'oauth_ropc';
        username: string;
    };
    toolPackage: string;
    maxRecords: number;
    prodWriteAck: boolean;
}
/**
 * ARC-04-S02's masker, re-exported rather than reimplemented.
 *
 * S05 wrote a second one here that dropped the domain — `c***` where the store's own says
 * `c***@corp.com` — so `list` and the wizard's summary would have masked the same account two
 * ways. A username is not a secret, but the full account name in a pasted summary is one more
 * thing an attacker does not have to guess, and one masker is what makes that claim checkable.
 */
export { maskUsername };
export declare function maskEntry(entry: StoreInstance): MaskedEntry;
/** The probe line of the summary: enabled flags report, disabled ones read `off`. */
export declare function probeSummary(probe: LastProbe | null, flags: Flags, noProbes: boolean): string;
export declare const savedLine: (label: string, entry: MaskedEntry, isDefault: boolean) => string;
export declare const storeLine: (path: string, platform?: NodeJS.Platform) => string;
/** Parse and validate; every refusal here is exit 2 and happens before anything is asked. */
export declare function parseAddArgs(argv: readonly string[]): {
    ok: true;
    options: AddOptions;
} | {
    ok: false;
    message: string;
};
export interface AddDeps {
    storePath?: string;
    makeClient?: (entry: {
        url: string;
        auth: StoreInstance['auth'];
    }) => ProbeClient;
    probe?: typeof probeAll;
    reachability?: typeof probeReachability;
    env?: NodeJS.ProcessEnv;
    platform?: NodeJS.Platform;
}
/**
 * What `probeAll` needs to know about one entry's credentials — including the ROPC seam.
 *
 * `probeAuth` refuses an `oauth_ropc` run with no `tokenProbe` ("no token probe supplied"), and
 * S05 never passed one: with probes on, `instance add --auth oauth_ropc` could not succeed at all,
 * because the error came back as neither `ok` nor `unreachable` and fell through to the wrong-
 * password branch. Found by S06's `set-credentials --auth oauth_ropc` test, which hit the same
 * seam.
 *
 * The probe supplied here says "the request that follows IS the token exchange", and that is the
 * truth of this client: `ServiceNowClient` acquires the ROPC token inside its first request, so a
 * separate token call would be a SECOND login attempt on an account this whole file is careful to
 * spend only three of — against S03's one-request-per-probe rule. A failed grant still lands as
 * `auth failed` through `fromClientError` on the `sys_user` query; what is lost is only the
 * four-way ROPC error table's extra specificity, which needs a real token endpoint to distinguish
 * and belongs with the live sitting.
 */
export declare const probeOptionsFor: (auth: StoreInstance["auth"], env: NodeJS.ProcessEnv) => {
    username: string;
    authMethod: "basic" | "oauth_ropc";
    env: NodeJS.ProcessEnv;
    tokenProbe?: () => Promise<{
        ok: boolean;
    }>;
};
/**
 * The cloud-sync warning, and the question that follows it (D-04, ARC-07-S07).
 *
 * 0600 is a LOCAL permission: the sync client runs as the same user, so the mode does not stop the
 * file leaving the machine. This is a WARNING and a question rather than a refusal — where somebody
 * keeps their code is theirs to decide — but the default is NO, because the cost of being wrong is
 * a credential store on somebody else's servers and the cost of asking again is one command.
 *
 * The text is the REGISTRY's, filled with the provider and the folder; there is no second copy of
 * this sentence anywhere. When the global store is itself synced, the alternative is dropped: the
 * remedy's parenthetical would otherwise offer a place that has the same problem.
 */
export declare function cloudSyncGate(storePath: string, options: {
    yes?: boolean;
    global?: boolean;
}, io: AddIo, env?: NodeJS.ProcessEnv): Promise<{
    ok: boolean;
    warning?: string;
}>;
/**
 * The whole command. Seven steps, and every one of them can end it.
 */
export declare function runAdd(options: AddOptions, terminal: AddIo, deps?: AddDeps): Promise<AddResult>;
/**
 * The programmatic entry ARC-06-S07's `--instance-file` path can call.
 *
 * Everything is supplied, nothing is asked: `yes: true` is implied, and the `io` is whatever the
 * caller wants the lines written to. The return carries a MASKED entry — a caller that wanted the
 * password already had it.
 */
export declare function addInstance(opts: Omit<AddOptions, 'auth' | 'username'> & {
    auth: StoreInstance['auth'];
}, io: AddIo, deps?: AddDeps): Promise<AddResult>;
/** `--help`, from the same table the behaviour uses. */
export declare function addHelp(): string;
/** Exported for the forwarder's precondition test — the CLI path the engine spawns. */
export declare const CLI_RELATIVE = "packages/snowarch/dist/cli/index.js";
/** True when the server's runtime dependencies are installed beside the built CLI. */
export declare const serverDepsInstalled: (packageDir: string) => boolean;
/** `LABEL_NOT_FOUND` — registered, so `docs/TROUBLESHOOTING.md` carries its remedy. */
export declare const labelNotFound: (label: string, known: readonly string[]) => string;
export declare const MISMATCH = "Label mismatch \u2014 nothing changed.";
export declare const prodRaiseWarning: () => string;
export declare const CONFIRM_PROMPT = "Type the instance label to confirm: ";
export declare const credentialsUpdated: (label: string) => string;
export declare const removeQuestion: (label: string, storePath: string) => string;
export declare const WAS_DEFAULT: (label: string) => string;
/**
 * The `set-default` sentence, with the reload tool named from the CONTRACT's own list.
 *
 * A retyped tool token is what L01 exists to catch: the name appears in the contract, in
 * `governance/`, in the rule file and here, and four spellings of it is three chances to be
 * wrong on the day a name changes.
 */
export declare const defaultChanged: (label: string) => string;
export interface ManageOptions {
    label?: string;
    json?: boolean;
    all?: boolean;
    global?: boolean;
    verbose?: boolean;
    yes?: boolean;
    ackProd?: boolean;
    confirmLabel?: string;
    auth?: 'basic' | 'oauth_ropc';
    username?: string;
    passwordStdin?: boolean;
    preset?: string;
    pairs?: readonly string[];
    /** ARC-07-S08's `import --from-legacy`. */
    fromLegacy?: boolean;
    dryRun?: boolean;
    path?: string;
    only?: string[];
}
export interface ManageDeps extends AddDeps {
    /** The clock, injected so an audit line and a `lastProbe` are assertable to the character. */
    now?: () => string;
    /** `.local/config.json`, so the mirror can be pointed somewhere else in a test. */
    configPath?: string;
}
/**
 * The store as the SERVER would resolve it, or the sentence saying why not.
 *
 * `resolveStorePath()` answering "none" is not an error here the way it is for the server: it
 * means this checkout has no instances yet, and `list` on such a checkout prints a line and exits
 * 0. What is NOT allowed is inventing a path: a maintenance command that created a store would
 * make `set-default` on a typo produce a second, empty configuration.
 */
/**
 * WHICH FILE this command acts on, and what selected it. One resolution, shared.
 *
 * The path AND the source: `list --all` needs the second half to say which store the server reads,
 * and computing the two separately is how they came apart — a run under `SNOW_STORE` once listed
 * the global store and left out the file in use. `import` (ARC-07-S08) asks the same question, so
 * it asks this function rather than repeating the precedence.
 *
 * An injected path is named by WHERE IT POINTS, not by the fact that it was injected: the same
 * file is the project store whether the resolver found it or a caller handed it over, and calling
 * it an override would put the wrong word in the STORE column.
 */
export declare function targetStore(deps: {
    storePath?: string;
}, options?: {
    global?: boolean;
}): {
    path: string;
    source: StoreLabel;
};
export declare function runList(options: ManageOptions, io: AddIo, deps?: ManageDeps): number;
/**
 * Re-probe one instance or all of them. `lastProbe` is the only field this writes, ever.
 *
 * In `--json` the human lines are suppressed rather than interleaved: ARC-06-S08 parses this
 * command's stdout, and a network note printed above the object turns a probe result into
 * `unparsable`.
 */
export declare function runTest(options: ManageOptions, io: AddIo, deps?: ManageDeps): Promise<number>;
/**
 * New credentials for an existing instance — saved only when the instance says `ok`.
 *
 * The re-entry loop is S05's, called through the same helper, so "three attempts, one request
 * each" is one rule in one place. A run that ends any other way leaves the OLD credentials
 * exactly where they were: an entry whose password has been replaced by a wrong one is worse
 * than an entry nobody touched, because the failure arrives later and somewhere else.
 */
export declare function runSetCredentials(options: ManageOptions, io: AddIo, deps?: ManageDeps): Promise<number>;
export declare function runSetPreset(options: ManageOptions, io: AddIo, deps?: ManageDeps): Promise<number>;
/**
 * `WRITE=on` → the flag's own name mapped to the string `true`, or the sentence naming what was
 * not understood. (Spelled that way round because writing the flag constant out here would make
 * this comment a hit in the sweep that forbids flag literals in `src/cli/` — the thirteenth time
 * that lesson has been learnt in this repository.)
 */
export declare function parseFlagPairs(pairs: readonly string[]): {
    ok: true;
    changes: Map<FlagName, 'true' | 'false'>;
} | {
    ok: false;
    message: string;
};
/**
 * A PARTIAL change to the six flags — the difference from `set-preset`, which replaces all of them.
 *
 * Each requested change goes through S04's own toggle, so the dependency conversation is the one
 * the review screen has rather than a second implementation of the same rule. A change that is
 * already the current value is skipped: toggling to the state something is already in would flip
 * it the wrong way and ask a question about a change nobody requested.
 */
export declare function runSetFlags(options: ManageOptions, io: AddIo, deps?: ManageDeps): Promise<number>;
/**
 * `.local/config.json`'s `defaultInstance`, refreshed — a MIRROR, never a second source.
 *
 * Only when the file already exists (ARC-06-S05's ruling: the bootstrap owns creating it), only
 * that one key, and every other key is left byte-for-byte as it was — including `updatedAt`, which
 * belongs to the bootstrap step that writes the rest. The server package does not import the
 * engine's `.mjs`, so this is the minimal JSON update rather than a call into B07's writer.
 */
export declare function mirrorDefault(configPath: string, label: string | null): boolean;
export declare function runSetDefault(options: ManageOptions, io: AddIo, deps?: ManageDeps): number;
export declare function runRemove(options: ManageOptions, io: AddIo, deps?: ManageDeps): Promise<number>;
