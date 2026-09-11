#!/usr/bin/env node
/**
 * The `docs/ARCHITECTURE.md` "Bootstrap input hashes" table.
 *
 * Rendered from `lib/inputs.mjs` for the reason every generated region here exists: a table of
 * what each step depends on, maintained by hand beside the table the runner actually hashes, is a
 * table that disagrees with it — and the disagreement shows up as a resume that skipped something
 * it should have run, which is the hardest kind of wrong to notice.
 *
 * Usage: `node scripts/gen-inputs-docs.mjs [--check]` · exit 0 current/written · 1 stale.
 *
 * Stdlib only — it runs inside `npm run lint`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { INPUTS, STEP_IDS } from '../tools/snowarch/lib/inputs.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = 'docs/ARCHITECTURE.md';
const CHECK = process.argv.includes('--check');

/** One row per declared input, the step spanning its first. `—` where a step has none. */
export function inputsTable(table = INPUTS, ids = STEP_IDS) {
  const rows = ['| Step | Input | Kind | Why it is an input |', '|---|---|---|---|'];
  for (const id of ids) {
    const row = table[id];
    if (row.inputs.length === 0) {
      rows.push(`| \`${id}\` ${row.title} | — | — | runs every time: ${row.why.split('.')[0]}. |`);
      continue;
    }
    row.inputs.forEach((i, n) => {
      rows.push(`| ${n === 0 ? `\`${id}\` ${row.title}` : ''} | \`${i.ref}\` | ${i.kind} | ${i.why} |`);
    });
  }
  return rows.join('\n');
}

/** The notes a row carries — the decisions a reader needs and a table cell cannot hold. */
export function inputsNotes(table = INPUTS, ids = STEP_IDS) {
  return ids.filter((id) => table[id].why && table[id].inputs.length > 0)
    .map((id) => `- **\`${id}\` ${table[id].title}.** ${table[id].why}`)
    .join('\n');
}

function replaceRegion(doc, name, body) {
  const open = `<!-- generated:${name} -->`;
  const close = `<!-- /generated:${name} -->`;
  const start = doc.indexOf(open);
  const stop = doc.indexOf(close, start);
  if (start === -1 || stop === -1) throw new Error(`${TARGET}: no ${name} region`);
  return `${doc.slice(0, start + open.length)}\n${body}\n${doc.slice(stop)}`;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const current = readFileSync(join(root, TARGET), 'utf8');
  let next = replaceRegion(current, 'bootstrap-inputs', inputsTable());
  next = replaceRegion(next, 'bootstrap-input-notes', inputsNotes());

  if (current.replace(/\r\n/g, '\n') === next) {
    process.stdout.write(`gen-inputs-docs: ${TARGET} current (2 blocks).\n`);
  } else if (CHECK) {
    process.stdout.write(`gen-inputs-docs: ${TARGET} is stale — run npm run gen and commit the result\n`);
    process.exit(1);
  } else {
    writeFileSync(join(root, TARGET), next);
    process.stdout.write(`gen-inputs-docs: wrote ${TARGET} (2 blocks).\n`);
  }
}
