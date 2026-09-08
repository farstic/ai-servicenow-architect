#!/usr/bin/env node
/**
 * Run every generator, or check every generator, from the one list.
 *
 * `npm run gen` and `npm run gen:check` both come here rather than spelling out four commands each,
 * because a list written in `package.json` is a fifth copy of something `scripts/lib/generators.mjs`
 * already knows — and the one that would be missing a generator after somebody adds the fifth.
 *
 * Exit 0 all current or all written · 1 at least one stale (with its own diff) · 2 one could not run.
 */
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GENERATORS } from './lib/generators.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');

let stale = 0;
let cannotRun = 0;

for (const gen of GENERATORS) {
  const args = [join(root, gen.script), ...(check ? ['--check'] : [])];
  try {
    const out = execFileSync(process.execPath, args, { cwd: root, encoding: 'utf8', stdio: 'pipe' });
    process.stdout.write(out);
  } catch (e) {
    process.stdout.write(`${e.stdout ?? ''}`);
    process.stderr.write(`${e.stderr ?? ''}`);
    // A generator's own exit codes are carried through unchanged: 1 is stale, 2 is cannot run, and
    // collapsing them here would lose the distinction every caller of this script depends on.
    if (e.status === 2) cannotRun += 1; else stale += 1;
  }
}

if (cannotRun > 0) {
  process.stderr.write(`gen-all: ${cannotRun} generator(s) could not run\n`);
  process.exit(2);
}
if (stale > 0) {
  process.stdout.write(`gen-all: ${stale} generator(s) ${check ? 'stale — run npm run gen' : 'failed'}\n`);
  process.exit(1);
}
process.stdout.write(`gen-all: ${GENERATORS.length} generator(s) ${check ? 'current' : 'run'}\n`);
