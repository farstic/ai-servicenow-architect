// ARC-09-S06 — the `store` forwarder.
//
// The same shape as `instance` (ARC-07-S05) and the same reasons, which is why it is the same
// CODE: `forwardToServerCli` is that file's machinery, and a second copy of "check Node, check
// dist/, check the dependencies, spawn with childEnv" would be a second opinion about when this
// checkout can run the server — and the two would disagree the first time either was corrected.
//
// The store belongs to the server package. This process does not read it, write it, parse it or
// know its shape; it hands the terminal over and returns the child's code.
import { EXIT_OK } from './exit.mjs';
import { forwardToServerCli } from './instance.mjs';
import { root as defaultRoot } from './config.mjs';

export const USAGE = [
  'usage: ./snowarch store <command> [options]',
  '',
  '  migrate [--dry-run] [--yes]   bring the store up to the schema this build reads',
  '  backups                       the backups beside the store, newest first',
  '  restore <file> [--yes]        put one of them back',
  '',
  '  Everything after `store` is passed to the server CLI unchanged.',
].join('\n');

export async function storeCommand({ log, argv = [], root = defaultRoot, ...rest } = {}) {
  if (argv.includes('--help') && argv.length === 1) {
    log.step(USAGE);
    return EXIT_OK;
  }
  return forwardToServerCli('store', { log, argv, root, ...rest });
}
