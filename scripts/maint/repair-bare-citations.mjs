#!/usr/bin/env node
// ARC-02-S03 — resolves every bare citation in the roster to a full `markdown/<area>/…` path that
// exists at the pinned corpus commit.
//
// A bare `foo.md` cannot be checked by the citation gate, which is how a skill came to point readers
// at two pages that exist nowhere (ARC-03-S04b). Resolution is by basename against the corpus, and
// where a basename matches in more than one area the match inside the skill's own declared area wins
// — a licensing page in it-asset-management is not the same page as one in platform-administration.
// A basename with no match anywhere is reported, never guessed: the caller cites the area index and
// says so, per file, in the commit.
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, dirname, basename, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findBareCitations, extract } from '../../tools/snowarch/lib/docs/citations.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CORPUS = join(root, 'vendor/ServiceNowDocs');
const apply = process.argv.includes('--apply');

// basename -> [repo-relative markdown/... paths]
const index = new Map();
(function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.md')) {
      const rel = relative(CORPUS, p).split('\\').join('/');
      if (!rel.startsWith('markdown/')) continue;
      if (!index.has(e.name)) index.set(e.name, []);
      index.get(e.name).push(rel);
    }
  }
}(join(CORPUS, 'markdown')));

const mdFiles = [];
(function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.md')) mdFiles.push(p);
  }
}(join(root, '.claude')));

// The areas a file already cites, most-cited first — the disambiguation signal.
function areasOfFile(text, rel) {
  const counts = new Map();
  for (const c of extract(text, rel).citations) {
    const a = c.area;
    counts.set(a, (counts.get(a) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([a]) => a);
}

// A second class the bare-citation detector cannot see: a token that already carries its area but
// not the `markdown/` root (`platform-security/access-control/foo.md`). It is citation-shaped, so a
// reader trusts it, yet the gate's regex requires the root — so it is neither checked nor warned.
// Prefixing it is the whole repair; the target must still exist at the pin.
const AREAS = new Set(readdirSync(join(CORPUS, 'markdown'), { withFileTypes: true })
  .filter((e) => e.isDirectory()).map((e) => e.name));
const ROOTLESS = /`([a-z0-9][a-z0-9-]*\/[A-Za-z0-9._\/-]+)`/g;

const unresolved = [];
const resolvedBy = { exact: 0, area: 0, dir: 0, rootless: 0 };
let filesChanged = 0;
const perFile = [];

for (const file of mdFiles) {
  const rel = relative(root, file).split('\\').join('/');
  let text = readFileSync(file, 'utf8');
  // Both passes run on every file: a file whose bare citations are already repaired can still carry
  // rootless ones, and skipping on `!bare.length` silently hid exactly that (measured 2026-09-08).
  const bare = findBareCitations(text, rel);
  const areas = areasOfFile(text, rel);
  const fixes = new Map();

  for (const w of bare) {
    const token = w.raw;
    // A token ending in "/" names a directory, not a page — it only lacks the markdown/ prefix.
    if (token.endsWith('/')) {
      if (existsSync(join(CORPUS, 'markdown', token))) { fixes.set(token, `markdown/${token}`); resolvedBy.dir += 1; continue; }
      unresolved.push({ rel, token, why: 'directory not present at the pin' });
      continue;
    }
    const base = basename(token);
    const cands = index.get(base) ?? [];
    if (!cands.length) { unresolved.push({ rel, token, why: 'no such basename in the corpus' }); continue; }
    let pick;
    if (cands.length === 1) { pick = cands[0]; resolvedBy.exact += 1; }
    else {
      // Prefer a candidate whose area this file already cites; then the shallowest path.
      const ranked = [...cands].sort((a, b) => {
        const ai = areas.indexOf(a.split('/')[1]), bi = areas.indexOf(b.split('/')[1]);
        const av = ai === -1 ? 99 : ai, bv = bi === -1 ? 99 : bi;
        return av - bv || a.split('/').length - b.split('/').length || a.localeCompare(b);
      });
      pick = ranked[0]; resolvedBy.area += 1;
    }
    fixes.set(token, pick);
  }

  // Class two: area-prefixed but rootless.
  for (const m of text.matchAll(ROOTLESS)) {
    const t = m[1];
    if (t.startsWith('markdown/') || !AREAS.has(t.split('/')[0]) || fixes.has(t)) continue;
    if (!existsSync(join(CORPUS, 'markdown', t.replace(/\/$/, '')))) {
      unresolved.push({ rel, token: t, why: 'area-prefixed but not present at the pin' });
      continue;
    }
    fixes.set(t, `markdown/${t}`); resolvedBy.rootless += 1;
  }

  if (!fixes.size) continue;
  let out = text;
  for (const [token, full] of fixes) {
    // Replace the token only where it appears inside a backtick span, never in prose.
    out = out.split('`' + token + '`').join('`' + full + '`');
  }
  if (out !== text) {
    filesChanged += 1;
    perFile.push(`  ${rel}: ${fixes.size} distinct token(s) resolved`);
    if (apply) writeFileSync(file, out);
  }
}

console.log(`repair-bare-citations${apply ? '' : ' (dry run)'}: ${filesChanged} file(s), resolved ${resolvedBy.exact} by unique basename + ${resolvedBy.area} disambiguated by area + ${resolvedBy.dir} directory token(s) + ${resolvedBy.rootless} rootless area-prefixed token(s)`);
perFile.forEach((l) => console.log(l));
if (unresolved.length) {
  console.log(`\n  UNRESOLVED — no such basename anywhere in the corpus at the pin (${unresolved.length}):`);
  for (const u of unresolved) console.log(`    ${u.rel}: ${u.token} — ${u.why}`);
}
