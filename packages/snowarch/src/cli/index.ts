#!/usr/bin/env node
/**
 * snowarch CLI — four sub-commands.
 *
 * `start` is the only one implemented here. `instance`, `doctor` and `contract` are
 * stubs that exit 2: they are filled by ARC-07 (on the store module), ARC-04-S12 and
 * ARC-04-S06 respectively. They exist now so the command surface is stable for the
 * `tools/snowarch` launcher, which forwards to `dist/cli/index.js` — that path is a
 * contract with ARC-06/ARC-07 and must not move.
 *
 * What is deliberately absent: the npm update check (it fetched a third party's
 * package record — P-18), the `setup`, `auth`, `instances`, `web`, `shortcuts`,
 * `capabilities`, `run` and `report` commands (D-03), and any coloured output — a
 * CLI that may be piped should not depend on a TTY library for four sub-commands.
 */
// FIRST, before anything that constructs the proxy agent. ESM evaluates every import before
// the importing module's body, so this cannot be a call in main(): `EnvHttpProxyAgent` reads
// the environment when it is constructed, and by then it would already have been built from
// the unsanitised one. Same ordering rule that bit ARC-04-S02 with dotenv.
import '../env-sanitise.js';
import { Command } from 'commander';
import { spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import path from 'path';

const __cliDir = path.dirname(fileURLToPath(import.meta.url));
const __pkgJson = JSON.parse(readFileSync(path.resolve(__cliDir, '..', '..', 'package.json'), 'utf8'));
const CLI_VERSION: string = __pkgJson.version;

const NOT_IMPLEMENTED_EXIT = 2;

/** A sub-command whose implementation belongs to a later story. Exits 2, never 0. */
function stub(name: string, owner: string): (this: Command) => void {
  return function stubAction(this: Command) {
    process.stderr.write(`snowarch ${name}: not implemented in this story (${owner})\n`);
    process.exit(NOT_IMPLEMENTED_EXIT);
  };
}

const program = new Command();

program
  .name('snowarch')
  .description('ServiceNow MCP server')
  .version(CLI_VERSION);

program
  .command('start')
  .description('Start the MCP server on stdio')
  .action(() => {
    // Spawned as a child so this process never writes to the JSON-RPC stdout stream:
    // a single stray byte on stdout corrupts the protocol framing.
    const serverPath = path.resolve(__cliDir, '..', 'server.js');
    const child = spawn(process.execPath, [serverPath], { stdio: 'inherit', env: process.env });
    const forward = (sig: NodeJS.Signals) => { if (!child.killed) child.kill(sig); };
    process.on('SIGINT', () => forward('SIGINT'));
    process.on('SIGTERM', () => forward('SIGTERM'));
    child.on('exit', (code, signal) => {
      if (signal) process.kill(process.pid, signal);
      else process.exit(code ?? 0);
    });
  });

program
  .command('instance')
  .description('Manage configured ServiceNow instances')
  .allowUnknownOption()
  .allowExcessArguments()
  .action(stub('instance', 'ARC-07'));

program
  .command('doctor')
  .description('Diagnose the installation')
  .option('--json', 'print the report object and nothing else')
  .option('--no-network', 'skip checks that contact the instance')
  .option('--section <name>', 'only this section (server)', 'server')
  .action(async (opts: { json?: boolean; network?: boolean; section?: string }) => {
    // commander turns `--no-network` into `network: false`, so the flag the doctor takes is
    // the negation. Spelled out because reading `opts.network` as "network requested" is the
    // obvious misreading, and it would silently run the probes the user asked to skip.
    const { runServerDoctor, exitCodeFor, formatReport } = await import('../doctor/index.js');
    let report;
    try {
      report = await runServerDoctor({ noNetwork: opts.network === false, cwd: process.cwd() });
    } catch (e) {
      // Exit 3: the doctor could not run at all, which is a different thing from "checks
      // failed". A caller scripting against this needs to tell them apart.
      process.stderr.write(`snowarch doctor: could not run — ${(e as Error).message}\n`);
      process.exit(3);
    }
    process.stdout.write(opts.json ? `${JSON.stringify(report, null, 2)}\n` : formatReport(report));
    process.exit(exitCodeFor(report));
  });

program
  .command('contract')
  .description('Print the tool contract, or its sha256')
  .option('--json', 'print dist/contract.json verbatim')
  .option('--sha', 'print sha256(dist/contract.json) and nothing else')
  .action((opts: { json?: boolean; sha?: boolean }) => {
    const contractPath = path.resolve(__cliDir, '..', 'contract.json');
    if (!existsSync(contractPath)) {
      // The contract is a BUILD artefact — `scripts/extract-tools.mjs` emits it from the tool
      // registrations, and this command only reads it. Saying so is the whole message: the
      // remedy is a build, not a reinstall or a missing flag.
      process.stderr.write(
        `snowarch contract: ${contractPath} is missing.\n`
        + 'The contract is generated at build time from the tool registrations.\n'
        + 'Run: npm run build  (in packages/snowarch)\n');
      process.exit(NOT_IMPLEMENTED_EXIT);
    }
    const text = readFileSync(contractPath, 'utf8');

    if (opts.sha) {
      // Exactly 64 hex characters and a newline. ARC-05 pins against this and ARC-06's B05
      // compares it, so anything else on stdout — a label, a prefix — breaks both.
      process.stdout.write(`${createHash('sha256').update(text).digest('hex')}\n`);
      return;
    }
    if (opts.json) { process.stdout.write(text); return; }

    const c = JSON.parse(text);
    const sha = createHash('sha256').update(text).digest('hex');
    process.stdout.write(
      `contract ${c.contractVersion} · ${c.product} ${c.version} · ${c.toolCount} tools · sha256 ${sha.slice(0, 12)}\n`);
  });

program.parse();
