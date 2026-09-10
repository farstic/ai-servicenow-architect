/**
 * ARC-07-S05 — the `instance` sub-command's entry point: parse, then run.
 *
 * Separate from `instance.ts` so the composition can be imported and tested without a process:
 * every exit path in `runAdd` returns a code, and this is the only place one becomes
 * `process.exit`. A library that exits is a library nobody can test twice in one run.
 */
import { promptLine, promptSecret } from './tty.js';
import { addHelp, parseAddArgs, runAdd, EXIT_OK, EXIT_USAGE } from './instance.js';
/** The real terminal, wired to S01's prompts. Tests pass their own. */
export const terminalIo = () => ({
    ask: async (prompt) => promptLine(prompt.replace(/[:>]\s*$/, '').trim(), {}),
    write: (text) => { process.stdout.write(text); },
    secret: (label) => promptSecret(label, {}),
});
export async function runInstance(argv, io = terminalIo()) {
    const [sub, ...rest] = argv;
    if (sub === undefined || sub === '--help' || sub === '-h' || sub === 'help') {
        io.write(`${addHelp()}\n`);
        return sub === undefined ? EXIT_USAGE : EXIT_OK;
    }
    if (sub !== 'add') {
        // S06 fills these in. Naming the story is not decoration: it tells a reader whether they have
        // found a bug or a boundary.
        io.write(`instance ${sub}: not available in this build (ARC-07-S06 adds list, test, `
            + `set-credentials, set-preset, set-flags, set-default and remove)\n`);
        return EXIT_USAGE;
    }
    if (rest.includes('--help') || rest.includes('-h')) {
        io.write(`${addHelp()}\n`);
        return EXIT_OK;
    }
    const parsed = parseAddArgs(rest);
    if (!parsed.ok) {
        io.write(`${parsed.message}\n`);
        return EXIT_USAGE;
    }
    const result = await runAdd(parsed.options, io);
    return result.exitCode;
}
