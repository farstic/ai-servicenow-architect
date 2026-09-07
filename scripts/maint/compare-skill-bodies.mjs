#!/usr/bin/env node
// ARC-02-S01 (throwaway, deleted with scripts/maint/ at the end of the ARC).
// Proves the roster's BODY CONTENT survived the move: frontmatter aside, and with the rewritten path
// tokens normalised back, every skill, EXAMPLES and agent file must be byte-identical to the import.
// ARC README acceptance criterion 1. S03/S04 reuse it against import/engine-v2.8.0-worktree.
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, sep } from 'node:path';

const [oldRoot, newRoot] = process.argv.slice(2);
if (!oldRoot || !newRoot) { console.error('usage: compare-skill-bodies.mjs <old .claude> <new .claude>'); process.exit(2); }

const stripFrontmatter = (t) => t.replace(/^---\n[\s\S]*?\n---\n/, '');
// The rewrite is the ONLY change this story makes, so it is normalised away before comparing —
// otherwise every agent file would "differ" for the very reason the story exists.
const normalise = (t) => stripFrontmatter(t)
  .replace(/\.claude\/skills\//g, 'skills/')
  .replace(/\.claude\/agents\//g, 'agents/');

function* mdFiles(root) {
  if (!existsSync(root)) return;
  for (const e of readdirSync(root, { withFileTypes: true })) {
    const p = join(root, e.name);
    if (e.isDirectory()) yield* mdFiles(p);
    else yield p;
  }
}

let md = 0, mdSame = 0, asset = 0, assetSame = 0;
const diffs = [];
for (const f of mdFiles(join(oldRoot, 'skills'))) { }   // walked below with agents together
for (const sub of ['skills', 'agents']) {
  for (const f of mdFiles(join(oldRoot, sub))) {
    const rel = relative(oldRoot, f).split(sep).join('/');
    const other = join(newRoot, ...rel.split('/'));
    const isMd = f.endsWith('.md');
    if (!existsSync(other)) { diffs.push(`MISSING in new tree: ${rel}`); isMd ? md++ : asset++; continue; }
    if (isMd) {
      md++;
      if (normalise(readFileSync(f, 'utf8')) === normalise(readFileSync(other, 'utf8'))) mdSame++;
      else diffs.push(`BODY DIFFERS: ${rel}`);
    } else {
      asset++;
      const h = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
      if (h(f) === h(other)) assetSame++; else diffs.push(`ASSET DIFFERS: ${rel}`);
    }
  }
}
for (const d of diffs.slice(0, 10)) console.error(d);
console.log(`bodies identical: ${mdSame}/${md}`);
console.log(`assets identical: ${assetSame}/${asset}`);
process.exit(diffs.length ? 1 : 0);
