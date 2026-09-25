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
import { CANCELLED, promptLine, promptSecret } from './tty.js';
import { instanceSubCommandLines, SUB_COMMANDS, type SubCommand } from './help-tables.js';
import {
  addHelp, parseAddArgs, runAdd, runList, runRemove, runSetCredentials, runSetDefault,
  runSetFlags, runSetPreset, runTest, EXIT_CODES, EXIT_FAILED, EXIT_OK, EXIT_USAGE,
  LABEL_EXHAUSTED, MAX_ATTEMPTS,
  type AddIo, type ManageOptions,
} from './instance.js';
import { runImport } from './import-legacy.js';

// ARC-08-C22 — the table moved to `help-tables.js` (which imports nothing, so the generator can
// read it without dependencies) and is re-exported here, where its consumers already look for it.
export { SUB_COMMANDS };
export type { SubCommand };

/** The real terminal, wired to S01's prompts. Tests pass their own. */
export const terminalIo = (): AddIo => ({
  ask: async (prompt: string) => promptLine(prompt.replace(/[:>]\s*$/, '').trim(), {}),
  write: (text: string) => { process.stdout.write(text); },
  secret: (label: string) => promptSecret(label, {}),
  // ARC-07-C2 — INJECTED, like every other terminal fact in this file, so a test can take the
  // prompt path without a terminal and the no-terminal path without hiding one.
  isTty: process.stdin.isTTY === true,
});

/** The label the prompt proposes. ADR-0005: propose, do not impose — Enter accepts, typing wins. */
export const DEFAULT_LABEL = 'pdi';


/** `instance --help` — every sub-command, then the exit table. ARC-06-S08's B08 reads this. */
export function instanceHelp(): string {
  // ARC-08-C22 — the table and the layout come from `help-tables.ts`, which imports nothing, so
  // `scripts/gen-cli-help.mjs` can read them on a clone with no `node_modules` and carry the same
  // lines into the frame's own help.
  const lines = [
    'usage: snowarch instance <command> [options]',
    '',
    ...instanceSubCommandLines(),
  ];
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
      case 'from-legacy': options.fromLegacy = true; break;
      case 'dry-run': options.dryRun = true; break;
      case 'path': {
        const v = value();
        if (!v) return { ok: false, message: '--path needs a file' };
        options.path = v; break;
      }
      case 'only': {
        const v = value();
        if (!v) return { ok: false, message: '--only needs one or more labels' };
        options.only = v.split(',').map((s) => s.trim()).filter(Boolean); break;
      }
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
    let parsed = parseAddArgs(rest);
    // ARC-07-C2 — on a terminal, a missing label is a QUESTION, not a usage error.
    //
    // B06 spawns `instance add --from-bootstrap` with no label and `stdio: 'inherit'`, so the
    // wizard has the operator's terminal — and every interactive install died here at exit 2
    // before asking anything. CI never caught it because CI has no TTY, and rc.2 never reached B06.
    //
    // Without a terminal, or with --yes, the usage error stands exactly as it was: a run that
    // cannot ask must not hang waiting for an answer nobody can type.
    if (!parsed.ok && parsed.needsLabel === true && io.isTty === true && !rest.includes('--yes')) {
      // ARC-07-C10 — IT ASKS AGAIN, because the label was the one interactive answer in this wizard
      // that did not.
      //
      // The owner typed `testPDI` at the S06 sitting (2026-09-25). The validation sentence was
      // right; the consequence was not: one bad answer ended the wizard at exit 2, B06 reported
      // `the wizard rejected its arguments`, and its remedy told the owner this was a defect in the
      // bootstrap and asked them to file a bug — for a capital letter in a name they had just been
      // asked for.
      //
      // The convention is already here, six hundred lines down: the credential prompt re-asks up to
      // `MAX_ATTEMPTS`, prints an `…after N attempts — nothing saved` line and returns
      // `EXIT_FAILED`, which `EXIT_CODES` documents as "nothing saved — a refusal, an abort, three
      // failed attempts…". So this needed no new exit code and no new constant; it needed the loop
      // the prompt next to it already had.
      //
      // EXIT_FAILED AND NOT EXIT_USAGE on exhaustion, which is the second half of the finding: B06
      // cannot see anything but the status, so as long as a rejected ANSWER and a bad ARGV both
      // exited 2, B06's message had to guess — and it guessed "defect in the bootstrap". Exit 2 now
      // means what it says.
      for (let attempt = 1; ; attempt += 1) {
        const typed = (await io.ask(`Label for this instance [${DEFAULT_LABEL}]: `))?.trim();
        if (typed === undefined) { io.write(`${CANCELLED}\n`); return EXIT_USAGE; }
        // Re-parsed rather than patched in: the label goes through the SAME validation as one typed
        // on the command line, so `LABEL_RULE` has one enforcement point and its sentence one author.
        parsed = parseAddArgs([typed === '' ? DEFAULT_LABEL : typed, ...rest]);
        if (parsed.ok) break;
        io.write(`${parsed.message}\n`);
        if (attempt >= MAX_ATTEMPTS) { io.write(`${LABEL_EXHAUSTED}\n`); return EXIT_FAILED; }
      }
    }
    if (!parsed.ok) { io.write(`${parsed.message}\n`); return EXIT_USAGE; }
    return (await runAdd(parsed.options, io)).exitCode;
  }

  if (!isSub(sub)) {
    io.write(`instance ${sub}: not available in this build (no such sub-command)\n`);
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
    case 'import': {
      // `--from-legacy` is REQUIRED and named rather than assumed: `import` will mean more than
      // one thing before 2.1, and a command that guessed which import you meant would be a
      // migration nobody asked for.
      if (!options.fromLegacy) {
        io.write('instance import needs --from-legacy (the only import in this build)\n');
        return EXIT_USAGE;
      }
      return (await runImport({
        ...(options.path !== undefined ? { path: options.path } : {}),
        ...(options.dryRun ? { dryRun: true } : {}),
        ...(options.yes ? { yes: true } : {}),
        ...(options.global ? { global: true } : {}),
        ...(options.only ? { only: options.only } : {}),
      }, io)).exitCode;
    }
    default: return EXIT_USAGE;
  }
}
