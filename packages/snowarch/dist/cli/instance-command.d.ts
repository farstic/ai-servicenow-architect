import { type AddIo } from './instance.js';
/** The real terminal, wired to S01's prompts. Tests pass their own. */
export declare const terminalIo: () => AddIo;
export declare function runInstance(argv: readonly string[], io?: AddIo): Promise<number>;
