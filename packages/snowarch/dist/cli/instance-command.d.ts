import { type AddIo, type ManageOptions } from './instance.js';
/** The real terminal, wired to S01's prompts. Tests pass their own. */
export declare const terminalIo: () => AddIo;
/** How many positional arguments each sub-command takes after its name. */
declare const SUB_COMMANDS: {
    readonly list: {
        readonly positionals: 0;
        readonly summary: "the instances this checkout can reach, and their last probe";
    };
    readonly test: {
        readonly positionals: 1;
        readonly summary: "re-probe one instance (or --all --json); writes only lastProbe";
    };
    readonly 'set-credentials': {
        readonly positionals: 1;
        readonly summary: "new username/password; saved only if the instance says ok";
    };
    readonly 'set-preset': {
        readonly positionals: 2;
        readonly summary: "change the preset (production needs --ack-prod)";
    };
    readonly 'set-flags': {
        readonly positionals: -1;
        readonly summary: "change individual flags: WRITE=on CMDB_WRITE=off …";
    };
    readonly 'set-default': {
        readonly positionals: 1;
        readonly summary: "which instance the server starts with";
    };
    readonly remove: {
        readonly positionals: 1;
        readonly summary: "delete an instance and its stored credentials";
    };
};
export type SubCommand = keyof typeof SUB_COMMANDS;
/** `instance --help` — every sub-command, then the exit table. ARC-06-S08's B08 reads this. */
export declare function instanceHelp(): string;
/**
 * The options for one maintenance sub-command, or the sentence that says what was not understood.
 *
 * Secrets are refused HERE, before any sub-command sees an argument list: `--password` on a
 * command line reaches `ps` for every user on the machine, and the refusal has to be earlier than
 * anything that might echo it back.
 */
export declare function parseManageArgs(sub: SubCommand, argv: readonly string[]): {
    ok: true;
    options: ManageOptions;
} | {
    ok: false;
    message: string;
};
export declare function runInstance(argv: readonly string[], io?: AddIo): Promise<number>;
export {};
