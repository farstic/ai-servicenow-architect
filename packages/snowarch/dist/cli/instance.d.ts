import { EXIT_INTERRUPTED, EXIT_USAGE, type Io } from './tty.js';
export { EXIT_USAGE, EXIT_INTERRUPTED };
import { type Environment } from './url.js';
import { type ReviewIo } from './preset-ui.js';
import { probeReachability } from '../servicenow/reachability.js';
import { probeAll, type LastProbe, type ProbeClient } from '../servicenow/probes.js';
import { type StoreInstance } from '../store/schema.js';
import { type Flags } from '../utils/permissions.js';
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
 * `u` → `u***`. Enough to recognise the account, never enough to use it.
 *
 * A username is not a secret — it may be typed on the command line — but a masked summary is what
 * gets pasted into a ticket, and the full account name there is one more thing an attacker does
 * not have to guess.
 */
export declare const maskUsername: (username: string) => string;
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
 * The whole command. Seven steps, and every one of them can end it.
 */
export declare function runAdd(options: AddOptions, io: AddIo, deps?: AddDeps): Promise<AddResult>;
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
