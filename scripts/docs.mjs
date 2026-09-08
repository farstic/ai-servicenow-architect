#!/usr/bin/env node
// ARC-03-S03 — maintainer entry point for the corpus. ARC-06's `./snowarch docs …` wraps the SAME
// two libraries (tools/snowarch/lib/docs/{sync,verify}.mjs); this script exists so the gate is
// runnable before that CLI is built, not as a second implementation.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { syncCorpus, planRecipe, readAreas, inspect, resolveMode, SyncError, EXIT as SYNC_EXIT }
  from '../tools/snowarch/lib/docs/sync.mjs';
import { verifyCitations, formatResult, EXIT } from '../tools/snowarch/lib/docs/verify.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(join(root, 'engine.config.json'), 'utf8'));
const [cmd, ...rest] = process.argv.slice(2);

if (cmd === 'sync') {
  const flag = (name) => rest.includes(name);
  const value = (name) => { const i = rest.indexOf(name); return i === -1 ? undefined : rest[i + 1]; };
  const quiet = flag('--quiet');
  const asJson = flag('--json');

  // `--print-recipe` executes nothing. It is the source the ARCHITECTURE block is copied from and
  // the launchers run when Node is absent, so it must print for the state the caller is IN — a
  // fresh checkout and an existing one need different command lists.
  if (flag('--print-recipe')) {
    try {
      const areas = readAreas(root, config.docs.areasFile);
      const mode = resolveMode(root, value('--mode'));
      const state = inspect(root, config, areas);
      for (const line of planRecipe({ config, areas, mode, state })) console.log(line);
      process.exit(0);
    } catch (e) {
      console.error(e.message);
      process.exit(e instanceof SyncError ? e.code : 2);
    }
  }

  let result;
  try {
    result = syncCorpus({ root, config, mode: value('--mode'), quiet: quiet || asJson });
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    console.error(e.message);
    process.exit(e.code);
  }
  const { completeness } = result;

  if (asJson) {
    // MINIMAL AND TEMPORARY. ARC-03-S06 introduces `docsStatus()` and this object is REPLACED by
    // its shape — do not build a consumer on these keys.
    const corpus = join(root, 'vendor/ServiceNowDocs');
    let files = 0, bytes = 0;
    const walk = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.name === '.git') continue;
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else { files += 1; bytes += statSync(p).size; }
      }
    };
    if (existsSync(corpus)) walk(corpus);
    console.log(JSON.stringify({
      pin: config.docs.pin, mode: result.mode, areas: result.areas.length,
      files, bytes, complete: completeness.ok,
    }, null, 2));
    process.exit(completeness.ok ? 0 : 1);
  }
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

console.error('usage: node scripts/docs.mjs '
  + '(sync [--mode sparse|full] [--json] [--quiet] [--print-recipe] | verify [--allow-missing])');
process.exit(2);
