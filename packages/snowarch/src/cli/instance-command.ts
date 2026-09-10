/**
 * ARC-07-S05/S06 — the `instance` sub-command's entry point: parse, then run.
 *
 * Separate from `instance.ts` so the composition can be imported and tested without a process:
 * every exit path in the commands returns a code, and this is the only place one becomes
 * `process.exit`. A library that exits is a library nobody can test twice in one run.
 *
 * The parsing lives here rather than in the commands because the eight sub-commands share nearly
 * all of their options and differ only in which POSITIONS mean something — `set-preset` takes two
 * arguments, `set-flags` takes a label and a list, the rest take a label. One parser with a table
 * of shapes cannot drift the way eight parsers can.
 */
import { promptLine, promptSecret } from './tty.js';
import {
  addHelp, parseAddArgs, runAdd, runList, runRemove, runSetCredentials, runSetDefault,
  runSetFlags, runSetPreset, runTest, EXIT_CODES, EXIT_OK, EXIT_USAGE,
  type AddIo, type ManageOptions,
} from './instance.js';

/** The real terminal, wired to S01's prompts. Tests pass their own. */
export const terminalIo = (): AddIo => ({
  ask: async (prompt: string) => promptLine(prompt.replace(/[:>]\s*$/, '').trim(), {}),
  write: (text: string) => { process.stdout.write(text); },
  secret: (label: string) => promptSecret(label, {}),
});

/** How many positional arguments each sub-command takes after its name. */
const SUB_COMMANDS = {
  list: { positionals: 0, summary: 'the instances this checkout can reach, and their last probe' },
  test: { positionals: 1, summary: 're-probe one instance (or --all --json); writes only lastProbe' },
  'set-credentials': { positionals: 1, summary: 'new username/password; saved only if the instance says ok' },
  'set-preset': { positionals: 2, summary: 'change the preset (production needs --ack-prod)' },
  'set-flags': { positionals: -1, summary: 'change individual flags: WRITE=on CMDB_WRITE=off …' },
  'set-default': { positionals: 1, summary: 'which instance the server starts with' },
  remove: { positionals: 1, summary: 'delete an instance and its stored credentials' },
} as const;

export type SubCommand = keyof typeof SUB_COMMANDS;

/** `instance --help` — every sub-command, then the exit table. ARC-06-S08's B08 reads this. */
export function instanceHelp(): string {
  const width = Math.max(...Object.keys(SUB_COMMANDS).map((k) => k.length), 'add <label>'.length);
  const lines = [
    'usage: snowarch instance <command> [options]',
    '',
    `  ${'add <label>'.padEnd(width)}  add an instance (the wizard)`,
  ];
  for (const [name, meta] of Object.entries(SUB_COMMANDS)) {
    lines.push(`  ${name.padEnd(width)}  ${meta.summary}`);
  }
  lines.push('', '  --json      machine-readable output (list, test)',
    '  --all       list BOTH stores, with a STORE column (list)',
    '  --global    act on the per-user store instead of this checkout\'s',
    '  --verbose   print which store is being read',
    '  --yes       accept every proposal; no questions',
    '', 'secrets are never accepted as arguments — the prompt or --password-stdin',
    '', 'exit codes:');
  for (const { code, meaning } of EXIT_CODES) lines.push(`  ${code}  ${meaning}`);
  return lines.join('\n');
}

/**
 * The options for one maintenance sub-command, or the sentence that says what was not understood.
 *
 * Secrets are refused HERE, before any sub-command sees an argument list: `--password` on a
 * command line reaches `ps` for every user on the machine, and the refusal has to be earlier than
 * anything that might echo it back.
 */
export function parseManageArgs(sub: SubCommand, argv: readonly string[]):
{ ok: true; options: ManageOptions } | { ok: false; message: string } {
  const options: ManageOptions = {};
  const positionals: string[] = [];
  const pairs: string[] = [];
  const rest = [...argv];

  while (rest.length > 0) {
    const arg = rest.shift() as string;
    if (!arg.startsWith('--')) {
      if (sub === 'set-flags' && positionals.length >= 1) pairs.push(arg);
      else positionals.push(arg);
      continue;
    }
    const [name, inline] = arg.slice(2).split('=', 2);
    const value = (): string | null => {
      if (inline !== undefined) return inline;
      const next = rest[0];
      if (next === undefined || next.startsWith('--')) return null;
      rest.shift();
      return next;
    };
    switch (name) {
      case 'json': options.json = true; break;
      case 'all': options.all = true; break;
      case 'global': options.global = true; break;
      case 'verbose': options.verbose = true; break;
      case 'yes': options.yes = true; break;
      case 'ack-prod': options.ackProd = true; break;
      case 'password-stdin': options.passwordStdin = true; break;
      case 'confirm-label': {
        const v = value();
        if (!v) return { ok: false, message: '--confirm-label needs the label, typed out' };
        options.confirmLabel = v; break;
      }
      case 'auth': {
        const v = value();
        if (v !== 'basic' && v !== 'oauth_ropc') return { ok: false, message: '--auth must be basic or oauth_ropc' };
        options.auth = v; break;
      }
      case 'username': {
        const v = value();
        if (!v) return { ok: false, message: '--username needs a value' };
        options.username = v; break;
      }
      default: return { ok: false, message: `unknown option --${name}` };
    }
  }

  const wanted = SUB_COMMANDS[sub].positionals;
  if (sub === 'test' && options.all) {
    if (positionals.length > 0) return { ok: false, message: 'instance test takes a label or --all, not both' };
  } else if (wanted === -1) {
    if (positionals.length !== 1) return { ok: false, message: 'instance set-flags needs a label' };
    if (pairs.length === 0) return { ok: false, message: 'instance set-flags needs at least one FLAG=on|off' };
  } else if (positionals.length !== wanted) {
    return { ok: false, message: `instance ${sub} needs ${wanted === 0 ? 'no arguments' : wanted === 1 ? 'a label' : 'a label and a preset'}` };
  }

  if (positionals[0] !== undefined) options.label = positionals[0];
  if (sub === 'set-preset') options.preset = positionals[1];
  if (pairs.length > 0) options.pairs = pairs;
  return { ok: true, options };
}

const isSub = (name: string): name is SubCommand => Object.hasOwn(SUB_COMMANDS, name);

export async function runInstance(argv: readonly string[], io: AddIo = terminalIo()): Promise<number> {
  const [sub, ...rest] = argv;

  if (sub === undefined || sub === '--help' || sub === '-h' || sub === 'help') {
    io.write(`${instanceHelp()}\n`);
    return sub === undefined ? EXIT_USAGE : EXIT_OK;
  }

  // Before any parser, and before any sub-command: a secret on the command line is refused
  // whatever it was attached to.
  if (rest.some((a) => a === '--password' || a.startsWith('--password='))) {
    io.write('Secrets are never accepted on the command line — the prompt asks, or --password-stdin reads one.\n');
    return EXIT_USAGE;
  }

  if (sub === 'add') {
    if (rest.includes('--help') || rest.includes('-h')) { io.write(`${addHelp()}\n`); return EXIT_OK; }
    const parsed = parseAddArgs(rest);
    if (!parsed.ok) { io.write(`${parsed.message}\n`); return EXIT_USAGE; }
    return (await runAdd(parsed.options, io)).exitCode;
  }

  if (!isSub(sub)) {
    // Naming the story is not decoration: it tells a reader whether they have found a bug or a
    // boundary. `import` is the one sub-command still to come.
    const story = sub === 'import' ? 'ARC-07-S08 adds import --from-legacy' : 'no such sub-command';
    io.write(`instance ${sub}: not available in this build (${story})\n`);
    return EXIT_USAGE;
  }

  if (rest.includes('--help') || rest.includes('-h')) { io.write(`${instanceHelp()}\n`); return EXIT_OK; }

  const parsed = parseManageArgs(sub, rest);
  if (!parsed.ok) { io.write(`${parsed.message}\n`); return EXIT_USAGE; }
  const options = parsed.options;

  switch (sub) {
    case 'list': return runList(options, io);
    case 'test': return runTest(options, io);
    case 'set-credentials': return runSetCredentials(options, io);
    case 'set-preset': return runSetPreset(options, io);
    case 'set-flags': return runSetFlags(options, io);
    case 'set-default': return runSetDefault(options, io);
    case 'remove': return runRemove(options, io);
    default: return EXIT_USAGE;
  }
}
