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
import { docsStatus, formatStatus } from '../tools/snowarch/lib/docs/status.mjs';

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
    // The S06 shape, replacing S05's minimal placeholder: one description of the corpus, the same
    // one the doctor embeds. `verify: false` — a sync has just run the completeness check, and the
    // citation scan is `docs verify`'s job, not a second cost on every sync.
    console.log(JSON.stringify(docsStatus({ root, verify: false, measure: true }), null, 2));
    process.exit(completeness.ok ? 0 : 1);
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
  if (rest.includes('--json')) {
    console.log(JSON.stringify(r, null, 2));
    process.exit(formatResult(r).code);
  }
  const { text, code } = formatResult(r);
  (code === EXIT.ok ? console.log : console.error)(text);
  process.exit(code);
}

if (cmd === 'status') {
  const s = docsStatus({ root, verify: true, measure: true });
  if (rest.includes('--json')) {
    // `--json` exits 0 unless the command itself failed: a caller reading the object wants the
    // object, and would have to distinguish "the corpus is missing" from "the tool crashed"
    // through an exit code that says both.
    console.log(JSON.stringify(s, null, 2));
    process.exit(0);
  }
  const { text, code } = formatStatus(s);
  (code === 0 ? console.log : console.error)(text);
  process.exit(code);
}

console.error('usage: node scripts/docs.mjs '
  + '(sync [--mode sparse|full] [--json] [--quiet] [--print-recipe] '
  + '| verify [--allow-missing] [--json] | status [--json])');
process.exit(2);
