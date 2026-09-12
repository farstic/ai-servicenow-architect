#!/usr/bin/env node
/**
 * The included blocks in `docs/MODES-AND-PRESETS.md`.
 *
 * Four things this page shows are owned somewhere else: the two review screens (ARC-07-S04's
 * snapshots, which its own tests compare against the real renderer), the migration plan sample
 * (ARC-07-S08's, byte-identical to what the command prints) and the terminal hand-off (ARC-06-S13's
 * fragment, which the skill and the install page also carry). A page that RETYPED any of them would
 * be a second version of a text somebody follows — and the hand-off is the one where following a
 * stale copy means typing a password somewhere it was not meant to go.
 *
 * So they are included, and `--check` fails when the page and the source disagree. The preset table
 * between the `PRESETS:` markers belongs to `gen-governance` (ARC-05-S05) and is not touched here:
 * both generators write this file, in separate processes, and each leaves the other's block alone.
 *
 * Usage: `node scripts/gen-modes.mjs [--check]` · exit 0 current/written · 1 stale · 2 cannot run.
 *
 * Stdlib only, like every generator in `npm run lint`.
 */
import { readFileSync, writeFileSync, writeSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = 'docs/MODES-AND-PRESETS.md';
const CHECK = process.argv.includes('--check');

const read = (rel) => readFileSync(join(root, rel), 'utf8');

/** The fenced block out of a snippet file, without the fence and without the file's own comment. */
export function fencedBlock(text, source) {
  const m = /```\n([\s\S]*?)```/.exec(text);
  if (!m) throw new Error(`${source}: no fenced block to include`);
  return m[1].replace(/\n+$/, '');
}

/** One region, replaced. The markers are gen-readme's, so a reader learns one shape for both. */
export function replaceRegion(doc, name, body) {
  const open = `<!-- generated:${name} -->`;
  const close = `<!-- /generated:${name} -->`;
  const start = doc.indexOf(open);
  const stop = doc.indexOf(close, start);
  if (start === -1 || stop === -1) throw new Error(`${TARGET}: no ${name} region`);
  return `${doc.slice(0, start + open.length)}\n${body}\n${doc.slice(stop)}`;
}

/** Every included block, and where each comes from. Data, so the list reads as a manifest. */
export const INCLUDES = [
  { region: 'review-screen-nonprod', source: 'docs/snippets/review-screen-nonprod.txt', fence: true },
  { region: 'review-screen-prod', source: 'docs/snippets/review-screen-prod.txt', fence: true },
  { region: 'import-plan', source: 'docs/snippets/import-from-legacy.md', block: true },
  { region: 'terminal-handoff', source: 'docs/snippets/terminal-handoff.md', block: true },
];

export function renderModes(doc, sources) {
  let out = doc;
  for (const { region, source, block } of INCLUDES) {
    const text = sources[source];
    // A `.txt` snapshot IS the block and gets a fence here; a `.md` fragment already carries one.
    const body = block
      ? ['```', fencedBlock(text, source), '```'].join('\n')
      : ['```', text.replace(/\n+$/, ''), '```'].join('\n');
    out = replaceRegion(out, region, body);
  }
  return out;
}

// `argv[1]` is the script that was invoked, compared as a path: this module is also IMPORTED by
// `tests/modes-page.test.mjs`, and a generator that ran — and exited — on import would end the test
// process after its first case. It did, once, which is how this guard got here.
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const sources = Object.fromEntries(INCLUDES.map(({ source }) => [source, read(source)]));
  const current = read(TARGET);
  const next = renderModes(current, sources);

  if (current.replace(/\r\n/g, '\n') === next) {
    writeSync(1, `gen-modes: ${TARGET} current (${INCLUDES.length} included blocks).\n`);
  } else if (CHECK) {
    writeSync(1, `gen-modes: ${TARGET} is stale — run npm run gen and commit the result\n`);
    process.exit(1);
  } else {
    writeFileSync(join(root, TARGET), next);
    writeSync(1, `gen-modes: wrote ${TARGET} (${INCLUDES.length} included blocks).\n`);
  }
}
