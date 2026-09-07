#!/usr/bin/env node
// ARC-02-S01 (throwaway, deleted with scripts/maint/ at the end of the ARC).
// Rewrites root-mirror path references to the canonical .claude/ locations. Mechanical and
// reviewable: only path tokens change, and the script prints every file it touched with a count.
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// The documentary record is EXCLUDED, for the same reason the ARC-01-S10 ratchet excludes it: these
// files describe the layout as it WAS, and rewriting them would edit history to match the present.
// docs/spikes/ is additionally a frozen archive (snowarch-spikes@arc-00-final-1) and docs/CHANGELOG.md
// is the engine's historical changelog that ARC-09 regenerates. Found by running the script without
// these and watching it rewrite 124 tokens across the three.
const SKIP = new Set(['.git', 'node_modules', 'vendor', 'packages']);
const SKIP_PATHS = ['docs/plans', 'docs/spikes', 'docs/decisions', 'docs/RELICENSING.md',
  'docs/CHANGELOG.md', 'docs/IMPORT-NOTES.md'];
const RULES = [
  // A `skills/<name>/SKILL.md` or EXAMPLES.md token not already prefixed by a path character.
  [/(?<![\w./-])skills\/([a-z0-9-]+)\/(SKILL|EXAMPLES)\.md/g, '.claude/skills/$1/$2.md'],
  [/(?<![\w./-])agents\/([a-z0-9-]+)\.md/g, '.claude/agents/$1.md'],
  // Bare directory mentions inside backticks.
  [/`skills\/`/g, '`.claude/skills/`'],
  [/`agents\/`/g, '`.claude/agents/`'],
];

const roots = process.argv.slice(2);
if (!roots.length) { console.error('usage: rewrite-roster-paths.mjs <path>…'); process.exit(2); }

function* walk(p) {
  const st = statSync(p);
  if (SKIP_PATHS.some((s) => p === s || p.startsWith(s + '/'))) return;
  if (st.isFile()) { if (p.endsWith('.md')) yield p; return; }
  for (const e of readdirSync(p, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const c = join(p, e.name);
    if (SKIP_PATHS.some((s) => c === s || c.startsWith(s + '/'))) continue;
    yield* walk(c);
  }
}

let files = 0, edits = 0;
for (const root of roots) {
  for (const f of walk(root)) {
    const before = readFileSync(f, 'utf8');
    let after = before, n = 0;
    for (const [re, to] of RULES) {
      after = after.replace(re, (...a) => { n++; return to.replace(/\$(\d)/g, (_, i) => a[Number(i)]); });
    }
    if (n) { writeFileSync(f, after); files++; edits += n; console.log(`  ${String(n).padStart(3)}  ${f}`); }
  }
}
console.log(`rewrote ${edits} path token(s) in ${files} file(s)`);
