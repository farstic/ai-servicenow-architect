#!/usr/bin/env node
/**
 * Merge every retired name into one flat, sorted object.
 *
 * `retired-names.json` is what a `grep -f` reads: `jq -r 'keys[]'` must yield exactly the
 * forbidden words and nothing else. That is why the file has **no metadata keys** — not even
 * `$schema`. A top-level `$schema` would become a "retired name", and every file in the
 * repository that mentions a JSON schema would fail the sweep. The file's shape is dictated by
 * how it is consumed, which is unusual and worth stating rather than discovering.
 *
 * Three sources, and each is authoritative for a different kind of name:
 *
 *  - `packages/snowarch/tool-rename-map.json` — tools that were RENAMED. The old name is dead,
 *    the value is what replaced it.
 *  - `packages/contract/retired-identifiers.json` — identifiers that were never tool names:
 *    the old product name, the old MCP prefixes, the old package path. Hand-authored, because
 *    no build artefact knows them.
 *  - `packages/snowarch/retired-tools.json` — tools that were REGISTERED and then REMOVED. The
 *    server answers them with `UNKNOWN_TOOL`, so they are retired in exactly the sense that
 *    matters here, but they are in no rename map: nothing replaced them. Their value is the
 *    literal `(removed)`.
 *
 *   node packages/contract/gen-retired-names.mjs           # write the file
 *   node packages/contract/gen-retired-names.mjs --check    # exit 1 if it is stale
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');

const OUT = join(here, 'retired-names.json');
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));

const renameMap = read(join(root, 'packages', 'snowarch', 'tool-rename-map.json'));
const identifiers = read(join(here, 'retired-identifiers.json'));
const retiredTools = read(join(root, 'packages', 'snowarch', 'retired-tools.json')).retired;

/** Removed tools have no replacement. The literal is documented in CONTRIBUTING and asserted. */
const REMOVED = '(removed)';

const removedNames = new Set(retiredTools.map((t) => t.name));

const merged = {};
for (const [oldName, newName] of Object.entries(renameMap)) {
  // A rename whose destination was later REMOVED collapses to `(removed)`.
  //
  // `generate_report` → `snow_rpt_report_generate` → gone (ARC-04-S08). Left as written, this
  // file would tell a reader of the old name to use one that also does not exist — a two-hop
  // dead end, and the second hop is the one nobody checks. The chain is real history and the
  // resolution is the honest answer: the tool is gone, not moved.
  merged[oldName] = removedNames.has(newName) ? REMOVED : newName;
}
for (const [oldId, newId] of Object.entries(identifiers)) merged[oldId] = newId;
for (const t of retiredTools) merged[t.name] = REMOVED;

// Any REMAINING replacement that is itself a retired key is a real error: a second rename
// recorded as a value rather than as a new key, or an identifier pointing at a dead one. The
// removal case above is resolved; this is what is left, and it has no correct interpretation.
const deadReplacements = Object.entries(merged)
  .filter(([, value]) => value !== REMOVED && merged[value] !== undefined)
  .map(([key, value]) => `${key} -> ${value} (which is itself retired)`);
if (deadReplacements.length > 0) {
  process.stderr.write('gen-retired-names: a replacement is itself a retired name:\n');
  for (const d of deadReplacements) process.stderr.write(`  ${d}\n`);
  process.stderr.write('A second rename is expressed as a NEW KEY in the rename map, never as a value.\n');
  process.exit(1);
}

const sorted = Object.fromEntries(Object.keys(merged).sort().map((k) => [k, merged[k]]));
const text = `${JSON.stringify(sorted, null, 2)}\n`;

if (process.argv.includes('--check')) {
  let committed = null;
  try { committed = readFileSync(OUT, 'utf8'); } catch { /* not there yet */ }
  if (committed === text) {
    process.stdout.write(`gen-retired-names: retired-names.json current (${Object.keys(sorted).length} names).\n`);
    process.exit(0);
  }
  const have = committed === null ? {} : JSON.parse(committed);
  const missing = Object.keys(sorted).filter((k) => !(k in have));
  const extra = Object.keys(have).filter((k) => !(k in sorted));

  process.stderr.write('gen-retired-names: retired-names.json is stale.\n');
  for (const k of missing) process.stderr.write(`  missing: ${k} -> ${sorted[k]}\n`);
  for (const k of extra) process.stderr.write(`  no longer a source: ${k}\n`);
  if (missing.length === 0 && extra.length === 0) {
    process.stderr.write('  the keys match but the file differs — formatting or a changed value\n');
  }
  process.stderr.write('Run: node packages/contract/gen-retired-names.mjs   and commit the result.\n');
  process.exit(1);
}

writeFileSync(OUT, text);
process.stdout.write(
  `gen-retired-names: wrote ${Object.keys(sorted).length} names `
  + `(${Object.keys(renameMap).length} renamed, ${Object.keys(identifiers).length} identifiers, `
  + `${retiredTools.length} removed).\n`);
