#!/usr/bin/env node
// ARC-06 fix — the launcher recipe is GENERATED, because it embeds a value that moves.
//
// The block in `docs/ARCHITECTURE.md` carries the docs pin twice (`fetch`, `checkout --detach`), and
// `tests/docs-recipe.test.mjs` asserted it byte-for-byte against `--print-recipe`. That works until
// the pin moves — and then it fails on every bump pull request by construction, which is what
// happened on the first real one. A documentation block that embeds a moving value must be
// generated, not asserted: the parity guarantee is kept (the block IS the module's output) and the
// bump regenerates it along with the pin.
//
// The rendering and the splice moved to `tools/snowarch/lib/docs/recipe-block.mjs` when the bump
// became the second caller. This is the CLI over it: flags, exit codes, and the sentence a
// maintainer reads. Nothing here decides what the block looks like.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyRecipeBlock, RECIPE_TARGET } from '../tools/snowarch/lib/docs/recipe-block.mjs';

const argv = process.argv.slice(2);
const rootArg = argv.indexOf('--root');
const root = rootArg === -1
  ? resolve(dirname(fileURLToPath(import.meta.url)), '..')
  : resolve(argv[rootArg + 1]);
const check = argv.includes('--check');

const config = JSON.parse(readFileSync(join(root, 'engine.config.json'), 'utf8'));
const { status, commands } = applyRecipeBlock({ root, config, write: !check });

// Exit 2 is "could not run", distinct from exit 1 "found it stale" — a caller that conflated them
// would read a missing document as a passing check.
if (status === 'absent' || status === 'no-markers') {
  process.stderr.write(`gen-docs-recipe: ${status === 'absent'
    ? `${RECIPE_TARGET} does not exist`
    : `markers not found in ${RECIPE_TARGET}`}\n`);
  process.exit(2);
}

if (check) {
  if (status === 'written') {
    process.stderr.write(`gen-docs-recipe: ${RECIPE_TARGET} recipe block is STALE — run node ${'scripts/gen-docs-recipe.mjs'} --write\n`);
    process.exit(1);
  }
  process.stdout.write(`gen-docs-recipe: ${RECIPE_TARGET} recipe block is current (${commands} commands)\n`);
  process.exit(0);
}
process.stdout.write(`gen-docs-recipe: ${status === 'written' ? 'wrote' : 'no change to'} ${RECIPE_TARGET} (${commands} commands)\n`);
