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
import { Command } from 'commander';
import { spawn } from 'child_process';
import { readFileSync } from 'fs';
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
  .allowUnknownOption()
  .allowExcessArguments()
  .action(stub('doctor', 'ARC-04-S12'));

program
  .command('contract')
  .description('Print or verify the tool contract')
  .allowUnknownOption()
  .allowExcessArguments()
  .action(stub('contract', 'ARC-04-S06'));

program.parse();
