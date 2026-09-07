#!/usr/bin/env node
// ARC-03-S02 — generate vendor/docs-areas.txt from the citations themselves.
//
// The sparse checkout must never be narrower than the grounding rule requires, and never widened by
// hand. So the list is derived, and `--check` fails CI when the committed file and the citations
// disagree. Runs on a checkout with no submodule: the checkout is computed FROM this.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { scanRepo, areasOf } from '../tools/snowarch/lib/docs/citations.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = 'vendor/docs-areas.txt';

const args = process.argv.slice(2);
const write = args.includes('--write');
const check = args.includes('--check');
// Exactly one is required. No TTY sniffing, no `CI` environment check: nothing platform-dependent
// decides what a maintainer command does.
if (write === check) {
  console.error('usage: node scripts/gen-docs-areas.mjs (--check | --write)');
  process.exit(2);
}

const { citations, warnings, skipped } = scanRepo({ root });
const areas = areasOf(citations);
const body = areas.map((a) => `markdown/${a}`).join('\n') + '\n';   // LF, no header, trailing newline

for (const s of skipped) console.error(`note: scan root "${s}" does not exist yet — skipped`);
for (const w of warnings) console.error(`warning: ${w.file}:${w.line}: ${w.reason} (${w.raw})`);

if (write) {
  writeFileSync(join(root, OUT), body);
  console.log(`${OUT} written (${areas.length} areas)`);
  process.exit(0);
}

const current = existsSync(join(root, OUT)) ? readFileSync(join(root, OUT), 'utf8') : '';
if (current === body) {
  console.log(`${OUT} up to date (${areas.length} areas)`);
  process.exit(0);
}
const now = new Set(areas.map((a) => `markdown/${a}`));
const was = new Set(current.split('\n').filter(Boolean));
const added = [...now].filter((a) => !was.has(a)).map((a) => `+${a.replace('markdown/', '')}`);
const removed = [...was].filter((a) => !now.has(a)).map((a) => `-${a.replace('markdown/', '')}`);
console.error(`${OUT} is stale: ${[...added, ...removed].join(' ')} — run: node scripts/gen-docs-areas.mjs --write`);
process.exit(2);
