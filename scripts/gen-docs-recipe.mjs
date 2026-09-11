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
// The rendering and the splice live in `tools/snowarch/lib/docs/recipe-block.mjs`; this is the CLI
// over it — flags, exit codes, and the sentence a maintainer reads. Nothing here decides what the
// recipe looks like.
//
// THREE targets since ARC-06-S06: the published block in `docs/ARCHITECTURE.md`, and the two
// launcher files the Node-free `bootstrap.sh` / `bootstrap.ps1` will source. Those launchers have
// to run the same git commands as the Node path, and the only way that stays true is if nobody
// types them twice.
import { readFileSync, writeSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyAllTargets } from '../tools/snowarch/lib/docs/recipe-block.mjs';

const argv = process.argv.slice(2);
const rootArg = argv.indexOf('--root');
const root = rootArg === -1
  ? resolve(dirname(fileURLToPath(import.meta.url)), '..')
  : resolve(argv[rootArg + 1]);
const check = argv.includes('--check');

const config = JSON.parse(readFileSync(join(root, 'engine.config.json'), 'utf8'));
const results = applyAllTargets({ root, config, write: !check });

// Exit 2 is "could not run", distinct from exit 1 "found it stale" — a caller that conflated them
// would read a missing document as a passing check. `absent` is not an error for a target that a
// fixture tree simply does not have; a MISSING MARKER in a file that does exist is.
const broken = results.filter((r) => r.status === 'no-markers');
if (broken.length > 0) {
  for (const r of broken) writeSync(2, `gen-docs-recipe: markers not found in ${r.path}\n`);
  process.exit(2);
}

const stale = results.filter((r) => r.status === 'written');
const present = results.filter((r) => r.status !== 'absent');
if (present.length === 0) {
  writeSync(2, `gen-docs-recipe: none of the ${results.length} targets exist under ${root}\n`);
  process.exit(2);
}

if (check) {
  if (stale.length > 0) {
    for (const r of stale) {
      writeSync(2, `gen-docs-recipe: ${r.path} recipe is STALE — `
        + 'run node scripts/gen-docs-recipe.mjs --write\n');
    }
    process.exit(1);
  }
  writeSync(1, `gen-docs-recipe: ${present.length} target(s) current `
    + `(${present.map((r) => `${r.target} ${r.commands}`).join(', ')} commands)\n`);
  process.exit(0);
}
writeSync(1, stale.length > 0
  ? `gen-docs-recipe: wrote ${stale.map((r) => r.path).join(', ')}\n`
  : `gen-docs-recipe: no change to ${present.length} target(s)\n`);
