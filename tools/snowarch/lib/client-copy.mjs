// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C232 — the client copy of a deliverable (governance/governance-rules.md §4.5). The working file keeps what
// the team and Phase 2 need, its internal content after ONE end marker; the copy is everything above the marker,
// written under clients/<name>/for-client/ at the same path. The copy is then scanned for internal content left
// above the marker, and each hit comes back with its line, for the Chief Architect to rewrite in the working file.
//
// THE LEXICON IS PHRASES, never the bare words a client's own text uses: "API gateway", "consult the service owner",
// "dispatch a field technician", "Phase 1 of the rollout", an ADR id and the RAID log are a client's (the architect's
// ruling, 2026-10-24). It is one constant, LEXICON, so what it answers to is held in one place.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';

/** The end marker, by kind of file: a last heading in markdown, a last comment line in a Gherkin Feature. */
export const MARKERS = Object.freeze({
  markdown: '## Internal — not in the client copy',
  feature: '# --- internal: not in the client copy ---',
});

/** The roster's personas, by the names governance/taxonomy.md gives them, less the two below. */
export const PERSONAS = Object.freeze([
  'Story Writer', 'HLD/LLD Writer', 'Technical Designer', 'Now Assist Specialist', 'Integration Specialist',
  'Flow Designer Specialist', 'ATF Author', 'Diagramming Specialist', 'Code Reviewer', 'Performance & Scale Specialist',
  'ITSM Specialist', 'CSM Specialist', 'HRSD Specialist', 'ITOM/Discovery Specialist', 'SPM Specialist',
  'Security & GRC Specialist', 'CMDB & CSDM Specialist', 'App Engine Specialist', 'Migration Specialist',
  'UI/UX Specialist', 'Reporting & Analytics Specialist', 'DevOps / Release Manager', 'FSO Insurance Specialist',
  'Discovery Specialist', 'Licensing & Entitlement Specialist', 'Estimation & Sizing Specialist',
]);

/** Personas whose names are a client's ordinary words, and so are not matched by name alone. */
export const EXEMPT_PERSONAS = Object.freeze({
  Developer: 'a client\'s own role ("the developer team")',
  'Operational Documentation': 'a client\'s own section heading',
});

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Longest first, so a name inside a longer one (Discovery in ITOM/Discovery) is not a second hit. */
const alternation = (names) => [...names].sort((a, b) => b.length - a.length).map(escape).join('|');

/** The consults, as CLAUDE.md's consult tables name them: a hit when the word "consult" follows the name. */
const CONSULTS = ['Performance & Scale', 'Security & GRC', 'DevOps / Release Manager', 'Licensing & Entitlement',
  'Estimation & Sizing', 'Code Reviewer', 'ATF Author', 'Operational Documentation', 'Diagramming Specialist',
  'Diagramming', 'Domain Expert'];

/** Internal content, as §4.5 lists it: `{ term, re }`, each `re` global. */
export const LEXICON = Object.freeze([
  { term: 'OQ- id', re: /\bOQ-[A-Z]{2}-\d+\b/g },
  { term: 'ARC- id', re: /\bARC-\d{2}\b(?:-[A-Z]+\d+[a-z]?\b)?/g },
  { term: 'PN- id', re: /\bPN-\d+\b/g },
  { term: 'a persona\'s name', re: new RegExp(`\\b(?:${alternation(PERSONAS)})\\b`, 'g') },
  { term: 'a consult\'s name', re: new RegExp(`\\b(?:${alternation(CONSULTS)}) consults?\\b`, 'g') },
  { term: 'Chief Architect', re: /\bChief Architect\b/g },
  { term: 'Domain Expert', re: /\bDomain Expert\b/g },
  { term: 'a domain\'s gateway',
    re: /\b(?:ITSM|CSM|HRSD|ITOM(?:\/Discovery)?|CMDB(?: & CSDM)?|FSO(?: Insurance)?) gateways?\b/g },
  { term: 'sub-agent', re: /\bsub-agents?\b/gi },
  { term: 'Phase N Step', re: /\bPhase [12] Step \d+\b/g },
  { term: '§1.1', re: /§ ?1\.1(?!\d)/g },
  { term: 'Verdict A, B or C', re: /\bVerdict [ABC]\b/g },
  { term: 'Constraint Envelope', re: /\bConstraint Envelopes?\b/g },
  { term: 'consult flag', re: /\bconsult flags?\b/gi },
  { term: 'OPEN QUESTION', re: /\bOPEN QUESTIONS?\b/g },
  { term: 'PDI', re: /\bPDIs?\b/g },
]);

/**
 * Each hit of `lexicon` in `text`: `{ line, term, match, text }`, by line and then by column. Where two terms cover
 * the same words (a consult's name inside a persona's), the longer is the one hit.
 */
export function scanInternal(text, { lexicon = LEXICON } = {}) {
  const hits = [];
  String(text).split('\n').forEach((lineText, i) => {
    const found = lexicon.flatMap(({ term, re }) => [...lineText.matchAll(new RegExp(re.source, re.flags))]
      .map((m) => ({ term, match: m[0], start: m.index, end: m.index + m[0].length })))
      .sort((a, b) => a.start - b.start || b.end - a.end);
    let reached = -1;
    for (const f of found) {
      if (f.start < reached) continue;
      hits.push({ line: i + 1, term: f.term, match: f.match, text: lineText });
      reached = f.end;
    }
  });
  return hits;
}

/** The working file `text` above its one end marker: `{ text }`, or `{ refused }` with the reason. */
export function cutAtMarker(text, file) {
  const marker = String(file).endsWith('.feature') ? MARKERS.feature : MARKERS.markdown;
  const lines = String(text).split('\n');
  const at = lines.flatMap((l, i) => (l.trim() === marker ? [i] : []));
  if (at.length === 0) return { refused: `${file} has no end marker ("${marker}")` };
  if (at.length > 1) return { refused: `${file} has ${at.length} end markers; it must have one` };
  return { text: `${lines.slice(0, at[0]).join('\n').replace(/\s+$/, '')}\n` };
}

/** Where the copy of `rel` (a `/`-path below the root) goes: the same path under `clients/<name>/for-client/`. */
export function copyPathFor(rel) {
  const m = /^clients\/([^/]+)\/(.+)$/.exec(String(rel));
  if (!m || m[2].startsWith('for-client/') || m[2].split('/').includes('..')) return null;
  return `clients/${m[1]}/for-client/${m[2]}`;
}

/**
 * Make the client copy of `file` under `root`: `{ dest, hits }`, or `{ refused }` with nothing written. `file` is
 * a path below `root` or an absolute one inside it.
 */
export function clientCopy({ root, file, lexicon = LEXICON }) {
  const rel = (isAbsolute(file) ? relative(root, file) : file).split(sep).join('/');
  const dest = copyPathFor(rel);
  if (!dest) return { refused: `${rel} is not a file under clients/<name>/ (and not a copy under for-client/)` };
  if (!existsSync(join(root, rel))) return { refused: `${rel} does not exist` };
  const cut = cutAtMarker(readFileSync(join(root, rel), 'utf8'), rel);
  if (cut.refused) return { refused: cut.refused };
  mkdirSync(dirname(join(root, dest)), { recursive: true });
  writeFileSync(join(root, dest), cut.text);
  return { source: rel, dest, hits: scanInternal(cut.text, { lexicon }) };
}
