// ARC-03-S02 — one definition of "a citation", shared by the generator (S02) and the verifier (S03)
// so the two can never disagree about what they are looking at.
//
// stdlib only, and it must run on a checkout where vendor/ServiceNowDocs does NOT exist: the sparse
// checkout is computed FROM this scan, so anything that needed the corpus would be circular.
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export class CitationSyntaxError extends Error {
  constructor(message, file, line) {
    super(`${file}:${line}: ${message}`);
    this.name = 'CitationSyntaxError';
    this.file = file; this.line = line;
  }
}

// Byte-compatible with the bash regex the engine's verify-citations.sh used, plus the optional
// vendor/ and ServiceNowDocs/ prefixes the imported texts actually contain.
const CITATION = /(?:vendor\/)?(?:ServiceNowDocs\/)?markdown\/[A-Za-z0-9_./{},-]+/g;

// An area is a top-level directory of the corpus. Requiring it to LOOK like one is what keeps
// `markdown/...` out — that string appears in four agent files as a prose placeholder ("cite the
// path used: markdown/..."), not as a citation, and without this rule it would land in the sparse
// checkout list as an area that cannot exist.
const AREA = /^[a-z0-9][a-z0-9-]*$/;

// Expand exactly one {a,b,…} group. Two groups or a nested brace is a syntax error rather than a
// silent partial expansion: a citation nobody can resolve should be reported, not half-read.
function expandBraces(path, file, line) {
  const opens = (path.match(/\{/g) || []).length;
  if (opens === 0) return [path];
  if (opens > 1) throw new CitationSyntaxError(`more than one {…} group in "${path}"`, file, line);
  const m = path.match(/^([^{]*)\{([^{}]*)\}([^{}]*)$/);
  if (!m) throw new CitationSyntaxError(`unparsable {…} group in "${path}"`, file, line);
  return m[2].split(',').map((alt) => `${m[1]}${alt.trim()}${m[3]}`);
}

export function extract(text, file = '<inline>') {
  const out = [];
  const warnings = [];
  text.split('\n').forEach((lineText, i) => {
    const line = i + 1;
    for (const raw of lineText.match(CITATION) || []) {
      // Trailing punctuation belongs to the prose, not the path; so does a trailing slash on a
      // directory citation, which we record via isDir instead.
      let path = raw.replace(/^(?:vendor\/)?(?:ServiceNowDocs\/)?/, '').replace(/[).,;:]+$/, '');
      const isDir = !path.endsWith('.md');
      path = path.replace(/\/$/, '');
      const area = path.split('/')[1] ?? null;
      if (!area) { warnings.push({ file, line, raw, reason: 'bare markdown citation, no area' }); continue; }
      if (!AREA.test(area)) { warnings.push({ file, line, raw, reason: `"${area}" is not an area name` }); continue; }
      for (const p of expandBraces(path, file, line)) out.push({ path: p, area, isDir, file, line, raw });
    }
  });
  return { citations: out, warnings };
}

// Roots are scanned in this order. A root that does not exist is SKIPPED and reported, never an
// error: ARC-02 is still moving the engine's canonical location, and a generator that dies on a
// missing directory would block the very import that creates it.
export const DEFAULT_ROOTS = [
  '.claude/skills', '.claude/agents', 'governance', 'docs/PLATFORM-NOTES.md', 'CLAUDE.md',
];
export const LEGACY_ROOTS = ['skills', 'agents'];   // the imported root mirrors; dropped when ARC-02 closes

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.isFile() && e.name.endsWith('.md')) yield p;
  }
}

export function scanRepo({ root = process.cwd(), roots = DEFAULT_ROOTS, legacy = false } = {}) {
  const all = legacy ? [...roots, ...LEGACY_ROOTS] : roots;
  const citations = [], warnings = [], skipped = [], scanned = [];
  for (const r of all) {
    const abs = join(root, r);
    if (!existsSync(abs)) { skipped.push(r); continue; }
    const files = statSync(abs).isDirectory() ? [...walk(abs)] : [abs];
    for (const f of files) {
      const rel = relative(root, f).split(sep).join('/');
      scanned.push(rel);
      const { citations: c, warnings: w } = extract(readFileSync(f, 'utf8'), rel);
      citations.push(...c); warnings.push(...w);
    }
  }
  return { citations, warnings, skipped, scanned };
}

export function areasOf(citations) {
  return [...new Set(citations.map((c) => c.area))].sort();
}
