/**
 * ARC-09-S06 — `snowarch store migrate | backups | restore`.
 *
 * The one door through which a store's SHAPE changes, and it is a door a person opens. Nothing
 * here runs on load, on start-up, or as a side effect of anything else: the server refuses to
 * start configured against a schema it does not read and names this command, and that refusal is
 * the whole user interface for "your file is from an older build".
 *
 * Principle 10 all the way through — the plan is printed BEFORE anything is written, every line
 * of it is something a reader can check (which versions, which migrations, where the backup goes,
 * and that credentials are untouched), and `n` leaves the tree exactly as it was.
 *
 * Composition like `instance-command.ts`: every path RETURNS a code and only the CLI entry turns
 * one into `process.exit`, so the whole surface is testable twice in one process.
 */
import { statSync } from 'node:fs';

import { promptLine } from './tty.js';
import { EXIT_OK, EXIT_FAILED, EXIT_USAGE } from './instance.js';
import { maskPath, resolveStorePath } from '../store/paths.js';
import {
  CURRENT_SCHEMA_VERSION, StoreMigrationError, listBackups, migrateStore, restoreBackup,
  type Migration,
} from '../store/migrations/index.js';

export interface StoreIo {
  write(text: string): void;
  error(text: string): void;
  ask(prompt: string): Promise<string>;
}

export const defaultStoreIo = (): StoreIo => ({
  write: (text) => { process.stdout.write(text); },
  error: (text) => { process.stderr.write(text); },
  ask: (prompt) => promptLine(prompt, {}),
});

export const NOTHING_CHANGED = 'store: nothing changed';

export function storeHelp(): string {
  return [
    'usage: snowarch store <command> [options]',
    '',
    '  migrate [--dry-run] [--yes]   bring the store up to the schema this build reads',
    '  backups                       the backups beside the store, newest first',
    '  restore <file> [--yes]        put one of them back',
    '',
    '  A migration writes a 0600 backup first and never changes a credential value.',
    '  Backups are never pruned automatically — delete them yourself when you no longer want them.',
    '',
    'exit codes:',
    `  ${EXIT_OK}  done, or nothing to do`,
    `  ${EXIT_FAILED}  refused — a schema from the future, an unreadable file, or a failed migration`,
    `  ${EXIT_USAGE}  usage — an unknown sub-command or a missing argument`,
  ].join('\n');
}

/** Where the store is, or the reason there is nothing to act on. */
function storePath(io: StoreIo): string | null {
  const res = resolveStorePath();
  if (res.path === null) {
    io.error('store: no store found — run ./snowarch instance add <label> first\n');
    return null;
  }
  return res.path;
}

/** `[Y/n]`, defaulting to yes, with anything but a no meaning yes. */
async function confirm(io: StoreIo, question: string): Promise<boolean> {
  const answer = (await io.ask(`${question} [Y/n]`)).trim().toLowerCase();
  return answer !== 'n' && answer !== 'no';
}

/**
 * `chain` is the same seam `migrateStore` exposes, passed through rather than re-invented.
 *
 * The shipped registry is empty at v1, so without it the plan screen, the `n` path and `--yes`
 * would have no migration to be about and AC 5 would be asserted against a program that took the
 * "nothing to do" branch every time. A test supplying its own chain exercises the real code with
 * a real pending migration; production passes nothing and gets `MIGRATIONS`.
 */
export async function runStoreMigrate(argv: readonly string[], io: StoreIo = defaultStoreIo(),
  chain: { migrations?: readonly Migration[]; current?: number } = {}): Promise<number> {
  const dryRun = argv.includes('--dry-run');
  const yes = argv.includes('--yes');
  const path = storePath(io);
  if (path === null) return EXIT_FAILED;

  let plan;
  try {
    plan = migrateStore(path, { ...chain, dryRun: true });
  } catch (e) {
    // Every refusal this can produce is a NAMED code with a remedy of its own, and printing the
    // code is what lets a user find it in TROUBLESHOOTING. A stack trace here would be the tool
    // telling a person their credential file crashed it.
    const err = e as StoreMigrationError;
    io.error(`${err.code ?? 'STORE_UNREADABLE'}: ${err.message}\n`);
    return EXIT_FAILED;
  }

  if (!plan.dryRun && !plan.migrated && plan.from === plan.to) {
    io.write(`store: schema v${plan.from} is current — nothing to do\n`);
    return EXIT_OK;
  }

  io.write([
    `Store schema v${plan.from} → v${plan.to} · ${plan.steps.length} migration`
      + `${plan.steps.length === 1 ? '' : 's'}:`,
    ...plan.steps.map((s) => `  ${s}`),
    `  backup: ${maskPath(path)}.bak-<timestamp> (0600)`,
    '  credentials: untouched',
    '',
  ].join('\n'));

  if (dryRun) {
    io.write('store: --dry-run, nothing was written\n');
    return EXIT_OK;
  }
  if (!yes && !(await confirm(io, 'Proceed?'))) {
    io.write(`${NOTHING_CHANGED}\n`);
    return EXIT_OK;
  }

  try {
    const result = migrateStore(path, chain);
    io.write(`store: migrated schema v${result.from} → v${result.to}`
      + `${result.backup ? ` (backup ${maskPath(result.backup)})` : ''}\n`);
    return EXIT_OK;
  } catch (e) {
    const err = e as StoreMigrationError;
    io.error(`${err.code ?? 'STORE_UNREADABLE'}: ${err.message}\n`);
    return EXIT_FAILED;
  }
}

export function runStoreBackups(io: StoreIo = defaultStoreIo()): number {
  const path = storePath(io);
  if (path === null) return EXIT_FAILED;
  const backups = listBackups(path);
  if (backups.length === 0) {
    io.write('store: no backups\n');
    return EXIT_OK;
  }
  for (const b of backups) {
    io.write(`${b.at.toISOString()}  ${String(b.size).padStart(7)} B  ${maskPath(b.path)}\n`);
  }
  io.write(`\n${backups.length} backup${backups.length === 1 ? '' : 's'} — `
    + 'never pruned automatically; delete the ones you no longer want\n');
  return EXIT_OK;
}

export async function runStoreRestore(argv: readonly string[], io: StoreIo = defaultStoreIo()):
Promise<number> {
  const file = argv.find((a) => !a.startsWith('--'));
  if (!file) {
    io.error('store restore: name a backup file (./snowarch store backups lists them)\n');
    return EXIT_USAGE;
  }
  const path = storePath(io);
  if (path === null) return EXIT_FAILED;

  let size = 0;
  try { size = statSync(file).size; } catch {
    io.error(`store restore: ${maskPath(file)} is not there\n`);
    return EXIT_FAILED;
  }
  io.write(`Restore ${maskPath(file)} (${size} B) over ${maskPath(path)}.\n`
    + '  the current store is REPLACED; take a copy first if you want one\n\n');
  if (!argv.includes('--yes') && !(await confirm(io, 'Proceed?'))) {
    io.write(`${NOTHING_CHANGED}\n`);
    return EXIT_OK;
  }
  try {
    const { version } = restoreBackup(path, file);
    io.write(`store: restored schema v${version} from ${maskPath(file)}\n`);
    // Restoring a backup can legitimately put an OLDER schema back — that is what a rescue is —
    // so the next step is named rather than left to be discovered on the next server start.
    if (version !== CURRENT_SCHEMA_VERSION) {
      io.write(`store: schema v${version} is not this build's v${CURRENT_SCHEMA_VERSION} — `
        + 'run ./snowarch store migrate\n');
    }
    return EXIT_OK;
  } catch (e) {
    const err = e as StoreMigrationError;
    io.error(`${err.code ?? 'STORE_UNREADABLE'}: ${err.message}\n`);
    return EXIT_FAILED;
  }
}

export async function runStore(args: readonly string[], io: StoreIo = defaultStoreIo()):
Promise<number> {
  const [name, ...rest] = args;
  if (!name || name === '--help' || name === 'help') {
    io.write(`${storeHelp()}\n`);
    return name ? EXIT_OK : EXIT_USAGE;
  }
  // `store migrate --help` is a request for HELP, not a migration with a flag it does not know.
  // The help is one screen for the three sub-commands, so it is answered here rather than three
  // times — and answered before dispatch, so no sub-command has to remember to.
  if (rest.includes('--help')) {
    io.write(`${storeHelp()}\n`);
    return EXIT_OK;
  }

  switch (name) {
    case 'migrate': return runStoreMigrate(rest, io);   // the shipped chain, always
    case 'backups': return runStoreBackups(io);
    case 'restore': return runStoreRestore(rest, io);
    default:
      io.error(`store: unknown command "${name}" — migrate, backups or restore\n`);
      return EXIT_USAGE;
  }
}
