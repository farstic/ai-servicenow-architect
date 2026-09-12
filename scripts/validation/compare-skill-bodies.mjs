#!/usr/bin/env node
// PERMANENT. This was written as a throwaway to be deleted with `scripts/maint/` at the end of the
// ARC; it is executed by `tests/skill-bodies-preserved.test.mjs` now, which is why it moved to
// `scripts/validation/`. A script a committed test runs is not throwaway (ARC-02-C1).
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
// LINE ENDINGS FIRST. A body is the same body whichever way the lines end, and this script exists
// to answer "was content lost" — not "which platform checked it out". The import tag predates
// `* text=auto eol=lf` in `.gitattributes`, so a Windows checkout of the tag arrives CRLF while the
// working tree is LF, and every one of the 65 files then "differs". Found on the Windows cell:
// 42 differ on macOS and Linux, 65 on Windows, from the same two trees.
const normalise = (t) => stripFrontmatter(t.replace(/\r\n/g, '\n'))
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
// ARC-02 acceptance (B02-01): EVERY difference, not the first ten. This printed
// `diffs.slice(0, 10)` with no "…and N more", so a reader — including a reviewer measuring the
// criterion — saw ten names when forty-two files differed, and no line said otherwise. A
// diagnostic that truncates silently is a diagnostic that misleads precisely when it matters.
for (const d of diffs) console.error(d);
console.log(`bodies identical: ${mdSame}/${md}`);
console.log(`assets identical: ${assetSame}/${asset}`);
process.exit(diffs.length ? 1 : 0);
