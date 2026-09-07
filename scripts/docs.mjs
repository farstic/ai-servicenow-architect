#!/usr/bin/env node
// ARC-03-S03 — maintainer entry point for the corpus. ARC-06's `./snowarch docs …` wraps the SAME
// two libraries (tools/snowarch/lib/docs/{sync,verify}.mjs); this script exists so the gate is
// runnable before that CLI is built, not as a second implementation.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { syncCorpus } from '../tools/snowarch/lib/docs/sync.mjs';
import { verifyCitations, formatResult, EXIT } from '../tools/snowarch/lib/docs/verify.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(join(root, 'engine.config.json'), 'utf8'));
const [cmd, ...rest] = process.argv.slice(2);

if (cmd === 'sync') {
  const { completeness } = syncCorpus({ root, config });
  if (!completeness.ok) {
    if (completeness.missingRoot.length) console.error(`INCOMPLETE: missing root file(s): ${completeness.missingRoot.join(', ')}`);

    if (completeness.head !== completeness.pin) console.error(`INCOMPLETE: HEAD ${completeness.head} != pin ${completeness.pin}`);
    if (!completeness.initialised) console.error(`INCOMPLETE: superproject reports the submodule uninitialised: ${completeness.submodule}`);
    process.exit(1);
  }
  // A cited area that upstream does not have is a citation defect; `verify` is where it fails.
  for (const a of completeness.missingAreas) {
    console.error(`WARN: cited area "${a}" does not exist at the pin — `
      + 'a dead citation, not a checkout fault; run: node scripts/docs.mjs verify');
  }
  console.log('docs sync: complete');
  process.exit(0);
}

if (cmd === 'verify') {
  const r = verifyCitations({ root, allowMissing: rest.includes('--allow-missing') });
  const { text, code } = formatResult(r);
  (code === EXIT.ok ? console.log : console.error)(text);
  process.exit(code);
}

console.error('usage: node scripts/docs.mjs (sync | verify [--allow-missing])');
process.exit(2);
