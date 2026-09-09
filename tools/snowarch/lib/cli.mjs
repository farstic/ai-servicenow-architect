// ARC-06-S02 — the CLI frame: parse, dispatch, and refuse clearly.
//
// Long flags only. Short flags invite `-p` meaning preset in one command and password in another,
// and this CLI will grow sub-commands written months apart by different people. Everything a user
// can get wrong — an unknown command, an unknown flag, a missing value — ends in EXIT_USAGE with
// the usage block for what they were actually trying to do, never a stack trace.
import { EXIT_OK, EXIT_USAGE } from './exit.mjs';
import { contractSha, cwdNote, loadConfig, root, version } from './config.mjs';
import { createLogger } from './log.mjs';
import { USAGE as BOOTSTRAP_USAGE } from './bootstrap.mjs';

/** Flags every sub-command understands, so no sub-command has to remember them. */
const UNIVERSAL = ['json', 'quiet', 'verbose', 'help'];

/**
 * `--flag value`, `--flag=value`, and bare booleans — with repeats kept as an array.
 *
 * A repeated flag is not an error and not last-wins: `--area a --area b` means both, and a parser
 * that silently dropped one would make a wrong command look like a working one.
 */
export function parseArgs(argv, { booleans = [] } = {}) {
  const flags = Object.create(null);
  const positional = [];
  const bool = new Set([...UNIVERSAL, ...booleans]);
  const errors = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) { positional.push(arg); continue; }
    if (arg === '--') { positional.push(...argv.slice(i + 1)); break; }

    const eq = arg.indexOf('=');
    const name = (eq === -1 ? arg.slice(2) : arg.slice(2, eq));
    if (!/^[a-z][a-z0-9-]*$/.test(name)) { errors.push(`malformed flag "${arg}"`); continue; }

    let value;
    if (eq !== -1) value = arg.slice(eq + 1);
    else if (bool.has(name)) value = true;
    else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) { value = argv[i + 1]; i += 1; }
    else { errors.push(`--${name} needs a value`); continue; }

    if (name in flags) flags[name] = [].concat(flags[name], value);
    else flags[name] = value;
  }
  return { flags, positional, errors };
}

const PLACEHOLDER = (name, story) => ({
  summary: `${name} — not available in this build`,
  usage: `usage: ./snowarch ${name} …\n\n  Not available in this build; ${story} adds it.`,
  run: ({ log }) => {
    log.fail(`"${name}" is not available in this build — ${story} adds it`);
    return EXIT_USAGE;
  },
});

/**
 * `version`, and everything in it read from a file.
 *
 * Not one literal: the version comes from `package.json`, the floors and the docs pin from
 * `engine.config.json`, the sha from the built contract. A hard-coded floor here would be a second
 * declaration of a number the bootstrap enforces, and the two would part company.
 */
function versionCommand({ flags, log }) {
  const config = loadConfig();
  const sha = contractSha();
  const payload = {
    version: version(),
    contractSha: sha,
    docsPin: config.docs.pin,
    docsFamily: config.docs.family,
    floors: config.floors,
  };
  if (flags.json) { log.json(payload); return EXIT_OK; }

  const floors = Object.entries(config.floors)
    .map(([k, v]) => `${k === 'claudeCode' ? 'Claude Code' : k} ≥ ${v}`).join(', ');
  log.step(`snowarch ${payload.version} · contract ${sha ? sha.slice(0, 12) : 'not built'} · `
    + `docs pin ${payload.docsPin.slice(0, 7)} (${payload.docsFamily}) · floors: ${floors}`);
  return EXIT_OK;
}

/**
 * `docs`, mounted on ARC-03's library rather than reimplemented.
 *
 * `scripts/docs.mjs` was the interim entry point and is now a shim over this same function, so the
 * npm scripts, CI and the two workflows keep working byte-for-byte and there is one implementation
 * of every sub-command. A test asserts the two entry points agree.
 */
async function bootstrapCommand(args) {
  const { bootstrapCommand: run } = await import('./bootstrap.mjs');
  return run(args);
}

async function docsCommand({ argv }) {
  const { runDocs } = await import('./docs/cli.mjs');
  return runDocs(argv);
}

export const COMMANDS = {
  version: { summary: 'print versions, the contract sha and the floors', run: versionCommand,
    usage: 'usage: ./snowarch version [--json]' },
  docs: { summary: 'sync, verify, describe or re-family the documentation corpus', run: docsCommand,
    usage: 'usage: ./snowarch docs (sync | verify | status | family) …\n\n'
      + '  Run `./snowarch docs` with no sub-command for the full flag list.' },
  bootstrap: { summary: 'install this checkout: plan, then the numbered steps, resumable',
    run: bootstrapCommand, usage: BOOTSTRAP_USAGE, booleans: ['yes', 'reset', 'skip-claude-check'],
    defersLog: true },
  mode: PLACEHOLDER('mode', 'ARC-06-S12'),
  doctor: PLACEHOLDER('doctor', 'ARC-08'),
  instance: PLACEHOLDER('instance', 'ARC-07'),
  upgrade: PLACEHOLDER('upgrade', 'ARC-09'),
};

export function helpText() {
  const width = Math.max(...Object.keys(COMMANDS).map((k) => k.length));
  const lines = ['usage: ./snowarch <command> [options]', '', 'commands:'];
  for (const [name, c] of Object.entries(COMMANDS)) {
    lines.push(`  ${name.padEnd(width)}  ${c.summary}`);
  }
  lines.push('', 'every command understands: --json --quiet --verbose --help');
  lines.push('exit: 0 ok · 1 failed · 2 usage · 3 prerequisite missing · 130 interrupted');
  return lines.join('\n');
}

export async function main(argv, { out = process.stdout, err = process.stderr } = {}) {
  const [name, ...rest] = argv;

  if (name === undefined || name === 'help' || name === '--help') {
    out.write(`${helpText()}\n`);
    return EXIT_OK;
  }
  const command = COMMANDS[name];
  if (!command) {
    err.write(`snowarch: unknown command "${name}" — run ./snowarch help\n`);
    return EXIT_USAGE;
  }

  const { flags, errors } = parseArgs(rest, { booleans: command.booleans ?? [] });
  if (flags.help) { out.write(`${command.usage}\n`); return EXIT_OK; }
  if (errors.length > 0 && name !== 'docs') {
    // `docs` parses its own arguments — it has sub-commands of its own — so the frame does not
    // second-guess a flag it has no table for.
    for (const e of errors) err.write(`snowarch ${name}: ${e}\n`);
    err.write(`${command.usage}\n`);
    return EXIT_USAGE;
  }

  const log = createLogger({
    command: name, quiet: Boolean(flags.quiet), verbose: Boolean(flags.verbose),
    json: Boolean(flags.json), defer: Boolean(command.defersLog), out, err,
  });
  const note = cwdNote();
  if (note) log.note(note);

  const code = await command.run({ flags, argv: rest, log, root, out, err });
  log.commit();          // a deferred logger that was never committed still gets its lines on disk
  return code;
}
