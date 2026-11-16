// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C263 (M5) — the grounding check: an answer's names and citations against what this session actually read.
//
// The rule (CLAUDE.md:13) has no page limit: the Architect reads until each construct is cited from a page it Read or an escape-safe
// search did not find it. This is the machine's half, after the answer is written. It compares every identifier-shaped name and every
// corpus citation of the answer with the session's sources (turn-sources.mjs) and the corpus's names (names-index.mjs), and says,
// in seven classes, where the answer departs from the rule. Detection is mechanical; the remedy is the model's — one ask, never a rewrite.
//
//   falseAbsent       a name called "not documented" that the corpus prints (or a Read page printed)
//   unsourcedPrinted  a name the corpus prints, but this session got from no page, skill, request or builder
//   coined            a name in no source and not in a corpus whose index is whole
//   unsourced         a name in no source, where the index is sparse or missing: no corpus claim is made
//   citedUnread       a corpus page cited that this session never Read (not one the line itself says, right after the path, was not read)
//   resting           "unverified" / "not opened" / a spent budget in the final reply
//   overclaim         `Pages read: <n>` greater than the pages Read
//
// ONE PURE FUNCTION: `groundingFindings({ rows, reply, index, coverage, options })` reads no file, no clock and no global. `rows` are
// session-JSONL rows (or stream-json rows in that shape); `reply` is the final text (`last_assistant_message`); `index` is
// `loadNamesIndex`'s answer or null; `options` carries what the caller read from the checkout (the roster's builders, the always-loaded
// rules' text). The hook, the tests, the architect's offline replay and the graders' reference run all call it.
//
// THE REASON NEVER PRINTS A NAME THE INDEX LACKS. A name the model invented, said back to it in a block, becomes a row of the
// transcript the next graders read as a source. So a coined or unsourced name is pointed at by the opening words of its line, every
// identifier in those words masked, and by its first segment (`sensor_…`), which no tokenizer reads as a name.
//
// stdlib only; imports leaves (name-rules, turn-sources, finding-copy) so the Stop hook stays fast.
import { copyLines } from '../finding-copy.mjs';
import { ABSENCE_ANYWHERE, CUSTOM, DECLARED, MARKER, PLATFORM_PREFIXES, bare, dotted, markedAbsent, nameSpans, qualifiesWhole } from './name-rules.mjs';
import { COVERAGE } from './names-index.mjs';
import { namesIn, turnSources } from './turn-sources.mjs';

export const KINDS = Object.freeze(['falseAbsent', 'unsourcedPrinted', 'coined', 'unsourced', 'citedUnread', 'resting', 'overclaim']);
export const LEAD = 'Before this answer stands, check these against the corpus; there is no page limit.';
export const KEEP_OUT = ' Do not mention this notice.';
// The notice's closing paragraph is registered text (496 bytes): a change to it is a new registration, pinned in tests/hook/stop-grounding.test.mjs.
const TAIL = 'Then add one line for each, starting "Correction:", with the page you Read and one short sentence on whether your claim stands '
  + 'and what, if anything, changes in the answer. If the answer has a Part 3, close with one line starting "Part 3:", with its letter, and its '
  + 'new basis if a correction changes the letter or the basis. Keep every line under 240 characters, paths included. Write nothing else '
  + '(no summary, no sentence of the answer repeated), and do not write a withdrawn name or path again.';
export const MAX_ITEMS = 12;

/**
 * `grounding-classes.json` — which classes block and the ubiquity threshold — as the hook reads it: the defaults for a missing or
 * garbage file, a list of known kinds (an unknown one is dropped; an empty list is valid and means nothing blocks), a positive integer.
 * The measurement sets these two values; the code that reads them does not change. Pure.
 */
export function parseClasses(text) {
  const defaults = { blocking: [...KINDS], ubiquity: DEFAULT_UBIQUITY, source: 'default' };
  if (typeof text !== 'string') return defaults;
  let data;
  try { data = JSON.parse(text); } catch { return defaults; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return defaults;
  const blocking = Array.isArray(data.blocking) ? KINDS.filter((k) => data.blocking.includes(k)) : defaults.blocking;
  const ubiquity = Number.isInteger(data.ubiquityPages) && data.ubiquityPages > 0 ? data.ubiquityPages : defaults.ubiquity;
  return { blocking, ubiquity, source: 'file' };
}
/** A name that is on this many pages is everywhere: printing it without a page proves nothing, so `unsourcedPrinted` leaves it alone. */
export const DEFAULT_UBIQUITY = 500;

const RESTING = /un-?verified|not (?:yet )?(?:opened|read|checked|verified)|(?:did|could) not (?:open|read)|in the pages? (?:I|we) (?:opened|read)|(?:page|reading) budget|budget (?:is )?(?:spent|reached|used|exhausted)/i;
// What a reply may say of "not read" without leaving a corpus construct unread: C239's not-installed wording, live mode's declarations (CLAUDE.md:65),
// and the finder's own header (`/snowarch finding` prints "instance store NOT read", about the instance store).
const RESTING_EXEMPT = [/not installed on this sparse corpus/i, /not on disk in this install's corpus/i, /items? remain(?:s)? unread/i, /reads per envelope/i,
  /instance store NOT read|credentials NOT read/i];
const PAGES_READ = /`?Pages read:\s*(\d+)`?/gi;
const CITATION = /markdown\/[A-Za-z0-9_.\-/]+?\.md/g;
// What may follow a cited path, on its own line, for the citation to say the page was not read: closing markup, whitespace, one separator, an
// opening bracket, "found by search,", was / were / is / are, then "not read", "not opened", "not yet read", "not yet opened" or "unread" as a word.
const DECLARED_UNREAD = /^[`*_)\]>"']*\s*(?:[-,;:–—]\s*)?(?:(?:\(|\[)\s*)?(?:found by search,\s*)?(?:(?:was|were|is|are)\s+)?(?:not\s+(?:yet\s+)?(?:read|opened)|unread)\b/i;
const FILE_TAILS = new Set(['md', 'json', 'mjs', 'js', 'ts', 'yml', 'yaml', 'html', 'css', 'csv', 'txt', 'png', 'svg', 'drawio', 'xml', 'sh', 'pdf', 'docx', 'py', 'io', 'net', 'com', 'org']);
const FENCE = /^\s*```/;
const prefixOk = (name) => PLATFORM_PREFIXES.includes(name.split(/[_.]/)[0]);
const norm = (s) => String(s ?? '').replace(/\\_/g, '_').toLowerCase();
const posix = (p) => String(p ?? '').replace(/\\/g, '/');

/** The opening words of a line with every identifier-shaped run masked to its first segment, so no complete name is printed. */
export function opening(line, index = null, words = 8) {
  const head = line.replace(/[`*|]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, words).join(' ');
  return head.replace(/[A-Za-z0-9]+(?:[_.][A-Za-z0-9_.]+)+/g, (m) => {
    const n = bare(m.replace(/\\_/g, '_'));
    return index?.has?.(n) ? m : `${m.split(/[_.]/)[0]}_…`;
  });
}

/** Every identifier in `text` that is not a name the index holds, replaced by its first segment and an ellipsis. */
export const maskUnheld = (text, index) => String(text).replace(/[A-Za-z0-9]+(?:_[A-Za-z0-9]+)+/g, (m) => (index?.has?.(bare(m)) ? m : `${m.split('_')[0]}_…`));

/** The candidates of one line: names set off as a backticked span or a `[table]`, identifier-shaped, outside the exemptions. */
function candidatesOf(line, i, { declared, isTool }) {
  const out = [];
  for (const sp of nameSpans(line)) {
    const text = sp.raw.replace(/\\_/g, '_');
    if (!text.includes('_') && !text.includes('.')) continue;
    if (/^\d+(?:\.\d+)+$/.test(text)) continue;
    const parts = text.split('.');
    if (parts.length > 1 && FILE_TAILS.has(parts[parts.length - 1].toLowerCase()) && parts[0].toLowerCase() !== 'com') continue;
    const first = bare(parts[0]);
    if (CUSTOM.test(first) || CUSTOM.test(text.toLowerCase())) continue;
    const name = parts.length > 1 ? dotted(text) : bare(text);
    if (!name || declared.has(name) || (isTool && isTool(name)) || name.startsWith('mcp__')) continue;
    out.push({ name, parts: parts.map(bare), dottedName: parts.length > 1, line: i, start: sp.start, end: sp.end });
  }
  return out;
}

/** Up to two pages for a name: those that print a table named on the same line first, then those in an area already read, then by file name, then the shortest. */
export function candidatePages(name, index, { tables = [], areas = new Set() } = {}) {
  const paths = index.pathsOf(name);
  if (paths.length === 0) return [];
  const segs = name.split(/[_.]/).filter((x) => x.length >= 4);
  const withTables = new Set();
  for (const t of tables) if (t !== name && index.has(t)) for (const p of index.pathsOf(t)) withTables.add(p);
  // More of the name's segments in the file name is better; then the shorter path.
  const inFile = (p) => { const f = p.split('/').pop().toLowerCase(); return segs.filter((x) => f.includes(x)).length; };
  const score = (p) => [withTables.has(p) ? 0 : 1, areas.has(p.split('/')[1]) ? 0 : 1, -inFile(p), p.length];
  const cmp = (a, b) => { const x = score(a); const y = score(b); for (let k = 0; k < x.length; k += 1) if (x[k] !== y[k]) return x[k] - y[k]; return a < b ? -1 : 1; };
  return paths.slice().sort(cmp).slice(0, 2);
}

/**
 * The findings for one answer. Pure. Returns `{ skipped, findings, blocks, items, reasonBody, reason, pagesRead, coverage, notes }`.
 * `blocks` are the kinds that are non-empty and allowed to block (`options.blocking`, default all); `items` are their items, in order.
 */
export function groundingFindings({ rows = null, reply = null, index = null, coverage = null, options = {} } = {}) {
  const stop = options.shouldStop ?? (() => false);
  const notes = [];
  const result = (skipped, extra = {}) => ({
    skipped, findings: Object.fromEntries(KINDS.map((k) => [k, []])), blocks: [], items: [], reasonBody: null, reason: null,
    pagesRead: 0, coverage: coverage ?? index?.coverage ?? null, notes, ...extra,
  });
  const cov = coverage ?? index?.coverage ?? null;
  const turn = Array.isArray(rows) ? turnSources(rows, options) : null;

  // The reply: every main-thread text block of the turn the file holds, then the final text unless the file already ends with it.
  const blocks = turn ? turn.replyBlocks.slice() : [];
  const same = (a, b) => a === b || String(a).replace(/\r\n/g, '\n') === String(b).replace(/\r\n/g, '\n');
  if (typeof reply === 'string' && reply && !(blocks.length && same(blocks[blocks.length - 1], reply))) blocks.push(reply);
  if (blocks.length === 0) return result('no-reply');
  const lines = blocks.flatMap((b) => b.split(/\r?\n/));
  const inCopy = copyLines(lines);
  const skip = new Set(inCopy);
  let fenced = false;
  lines.forEach((l, i) => { if (FENCE.test(l)) { fenced = !fenced; skip.add(i); } else if (fenced) skip.add(i); });
  const live = lines.map((l, i) => [l, i]).filter(([, i]) => !skip.has(i));
  const fullText = live.map(([l]) => l).join('\n');

  const absenceAt = live.some(([l]) => ABSENCE_ANYWHERE.test(l));
  const cites = live.some(([l]) => l.includes('markdown/'));
  const names0 = live.some(([l]) => /`[^`\n]*[_.][^`\n]*`|\[[A-Za-z0-9_.\\]*[_.][A-Za-z0-9_.\\]*\]/.test(l));
  const restingAt = live.some(([l]) => RESTING.test(l));
  const countsAt = /Pages read:/i.test(fullText);
  if (!(names0 || cites || absenceAt || restingAt || countsAt)) return result('nothing-to-check');

  const declared = new Set([...fullText.matchAll(DECLARED)].map((m) => m[1].toLowerCase()));
  const isTool = options.isToolName ?? null;
  const cands = [];
  for (const [l, i] of live) for (const c of candidatesOf(l, i, { declared, isTool })) cands.push({ ...c, text: l, marked: false });
  for (const c of cands) c.marked = markedAbsent(c.text, { start: c.start, end: c.end });
  // Pass 2 of the marker: the span positions are the line's, so attribution used the raw line.
  if (stop()) return result('deadline');

  const fullScope = Boolean(turn && (turn.scope.rosterSkill || turn.scope.corpus)) || cites || absenceAt;
  const names = turn?.names ?? null;
  const namedRules = (() => {
    const t = typeof options.named === 'function' ? options.named() : options.named;
    return t ? namesIn(t) : new Set();
  })();
  const sourced = (n) => {
    if (!names) return false;
    if (names.read.has(n) || names.skill.has(n) || names.named.has(n) || namedRules.has(n)) return true;
    if (names.builder.has(n) && index?.has(n)) return true;
    if (turn.envelopeNames.has(n) && index?.has(n) && index.pathsOf(n).some((p) => turn.savedCitations.has(p))) return true;
    return false;
  };
  const sourcedAll = (c) => (c.dottedName && !(index && qualifiesWhole(c.name, index.namespaces)))
    ? c.parts.filter((p) => p.includes('_')).every(sourced)
    : sourced(c.name);
  const present = (c) => {
    // A dotted name looked up whole, or by its parts (both must be printed on one page); a plain token by itself.
    if (c.dottedName && !(index && qualifiesWhole(c.name, index.namespaces))) {
      const toks = c.parts.filter((p) => p.includes('_'));
      if (toks.length >= 2) return Boolean(index) && index.both(toks[0], toks[1]).length > 0;
      return false;                                                  // a table with a plain word: nothing to look up
    }
    return Boolean(index?.has(c.name)) || Boolean(names?.read.has(c.name));
  };
  const heldByIndex = (c) => (c.dottedName && !(index && qualifiesWhole(c.name, index.namespaces)))
    ? c.parts.filter((p) => p.includes('_')).every((p) => index?.has(p))
    : Boolean(index?.has(c.name));

  const findings = Object.fromEntries(KINDS.map((k) => [k, []]));
  const seen = new Set();
  const tablesOnLine = (i) => cands.filter((c) => c.line === i && !c.dottedName).map((c) => c.name);
  const readAreas = new Set([...(turn?.pagesRead ?? [])].map((p) => p.split('/')[1]));
  const pagesFor = (c) => {
    const key = c.dottedName && !(index && qualifiesWhole(c.name, index.namespaces)) ? c.parts.find((p) => p.includes('_')) : c.name;
    return index?.has(key) ? candidatePages(key, index, { tables: tablesOnLine(c.line), areas: readAreas }) : [];
  };

  for (const c of cands) {
    if (c.marked && present(c) && !seen.has(`f:${c.name}`)) {
      seen.add(`f:${c.name}`);
      seen.add(`n:${c.name}`);                  // already asked about: not asked a second time as "unsourced"
      const pages = pagesFor(c);
      // The search lost its escapes: the pattern held the name with plain underscores, and the search found no corpus page.
      const escapeNote = (turn?.searches ?? []).some((s) => norm(s.pattern).includes(c.name) && !/markdown\//.test(s.result));
      findings.falseAbsent.push({ kind: 'falseAbsent', name: c.name, line: c.line, opening: opening(c.text, index), pages, escapeNote });
    }
  }
  if (stop()) return result('deadline');

  if (turn) {
    for (const c of cands) {
      if (seen.has(`n:${c.name}`)) continue;
      if (!fullScope && !prefixOk(c.name)) continue;
      if (sourcedAll(c)) continue;
      seen.add(`n:${c.name}`);
      const held = heldByIndex(c);
      if (held) {
        if (index.count(c.parts.length > 1 && !qualifiesWhole(c.name, index.namespaces) ? c.parts.find((p) => p.includes('_')) : c.name) >= (options.ubiquity ?? DEFAULT_UBIQUITY)) continue;
        const searched = (turn.searches ?? []).some((s) => norm(s.result).includes(c.name));
        const pages = pagesFor(c);
        const foundPages = searched ? [...new Set((turn.searches).flatMap((s) => norm(s.result).includes(c.name)
          ? [...s.result.replace(/\\/g, '/').matchAll(CITATION)].map((m) => m[0]) : []))].slice(0, 2) : [];
        findings.unsourcedPrinted.push({ kind: 'unsourcedPrinted', name: c.name, line: c.line, opening: opening(c.text, index), pages, found: searched && foundPages.length > 0, foundPages });
      } else if (cov === COVERAGE.full && index) {
        findings.coined.push({ kind: 'coined', name: c.name, line: c.line, seg: c.name.split(/[_.]/)[0], opening: opening(c.text, index) });
      } else {
        findings.unsourced.push({ kind: 'unsourced', name: c.name, line: c.line, seg: c.name.split(/[_.]/)[0], opening: opening(c.text, index) });
      }
    }
    if (stop()) return result('deadline');

    // Citations: a corpus page cited that this session never Read (a saved Envelope's own citations excepted; a skill-printed one is not).
    // A match that says itself, right after its path and on the same line, that the page was not read is the answer saying what it did not
    // do, which is what the ask is for: it is skipped, per match, so a later plain citation of the same page is still asked about.
    const dead = options.deadPaths ?? new Set();
    const cited = new Map();
    for (const [l, i] of live) {
      const line = posix(l);
      for (const m of line.matchAll(CITATION)) {
        if (DECLARED_UNREAD.test(line.slice(m.index + m[0].length))) continue;
        if (!cited.has(m[0])) cited.set(m[0], i);
      }
    }
    for (const [path, line] of cited) {
      if (turn.pagesRead.has(path) || turn.savedCitations.has(path) || dead.has(path)) continue;
      findings.citedUnread.push({ kind: 'citedUnread', path, line });
    }

    // Overclaim: `Pages read: <n>` more than the distinct corpus pages Read.
    for (const [l, i] of live) {
      for (const m of l.matchAll(PAGES_READ)) {
        const claimed = Number(m[1]);
        if (claimed > turn.pagesRead.size) findings.overclaim.push({ kind: 'overclaim', claimed, read: turn.pagesRead.size, line: i });
      }
    }
  }

  // Resting: a line of the FINAL reply (the text after the turn's last tool result) that leaves a construct as not read or not verified.
  const finalLines = new Set();
  const finalBlocks = turn ? turn.finalBlocks.slice() : [];
  if (typeof reply === 'string' && reply && !(finalBlocks.length && same(finalBlocks[finalBlocks.length - 1], reply))) finalBlocks.push(reply);
  const finalText = (finalBlocks.length ? finalBlocks : blocks.slice(-1)).flatMap((b) => b.split(/\r?\n/));
  for (const l of finalText) finalLines.add(l);
  for (const [l, i] of live) {
    if (!finalLines.has(l) || !RESTING.test(l)) continue;
    if (l.includes(MARKER) || RESTING_EXEMPT.some((re) => re.test(l))) continue;
    if (/verify (?:on the instance|against)/i.test(l) && l.includes('markdown/')) continue;      // an instance deferral about a construct cited on the same line
    findings.resting.push({ kind: 'resting', line: i, excerpt: maskUnheld(l.replace(/[`*]/g, '').trim().slice(0, 70), index) });
  }

  const allowed = options.blocking ? new Set(options.blocking) : new Set(KINDS);
  const blocking = KINDS.filter((k) => findings[k].length > 0 && allowed.has(k));
  const all = blocking.flatMap((k) => findings[k]);
  const reasonBody = all.length ? reasonOf(findings, blocking, options.maxItems ?? MAX_ITEMS) : null;
  return {
    skipped: null, findings, blocks: blocking, items: all, reasonBody, reason: reasonBody ? `${reasonBody}${KEEP_OUT}` : null,
    pagesRead: turn?.pagesRead.size ?? 0, coverage: cov, notes, turn: turn ? { startedBy: turn.startedBy, feedback: turn.feedback } : null,
  };
}

/** The ask, word for word, from the blocking findings: one lead, one clause per kind that has items, at most `max` items, the tail. */
function reasonOf(findings, kinds, max) {
  let room = max;
  let extra = 0;
  const take = (list) => { const got = list.slice(0, Math.max(room, 0)); room -= got.length; extra += list.length - got.length; return got; };
  const clauses = [];
  for (const kind of kinds) {
    const got = take(findings[kind]);
    if (got.length === 0) continue;
    const pages = (i) => i.pages.join(', ');
    switch (kind) {
      case 'falseAbsent':
        clauses.push(`Called not documented, but the corpus prints them: ${got.map((i) => `\`${i.name}\`${i.pages.length || i.escapeNote
          ? ` (${[i.pages.length ? `try ${pages(i)}` : null, i.escapeNote ? 'your search did not escape its underscores' : null].filter(Boolean).join('; ')})` : ''}`).join('; ')}. `
          + 'Read the page that documents each for the table you name with it, and cite it; keep the marker only if no page documents it there.');
        break;
      case 'unsourcedPrinted':
        clauses.push(`In no page, skill, request or instance read of this session, though the corpus prints them: ${got.map((i) => `\`${i.name}\`${i.found
          ? ` (your search found ${i.foundPages.join(', ')})` : (i.pages.length ? ` (try ${pages(i)})` : '')}`).join('; ')}. `
          + 'Read a page that documents each for the table you name with it, and cite it.');
        break;
      case 'coined':
        for (const i of got) {
          clauses.push(`On the line that begins "${i.opening}", the name that begins \`${i.seg}_…\` is in no page, skill, request or instance read of this session, and the corpus does not print it: `
            + 'leave it out or describe the construct without a name; never put another name in its place unless a page you Read says it is the same construct.');
        }
        break;
      case 'unsourced':
        for (const i of got) {
          clauses.push(`On the line that begins "${i.opening}", the name that begins \`${i.seg}_…\` is in no page, skill, request or instance read of this session: `
            + 'Read a page that prints it, or leave it out; never put another name in its place unless a page you Read says it is the same construct.');
        }
        break;
      case 'citedUnread':
        clauses.push(`Cited but not Read in this session: ${got.map((i) => i.path).join(', ')}. Read each, and keep a citation only where the page says what you cite it for.`);
        break;
      case 'resting':
        clauses.push(`Left as not read or not verified: ${got.map((i) => `"${i.excerpt}"`).join('; ')}. Read the page, or search escape-safe and give the marker only to what the search does not find.`);
        break;
      case 'overclaim':
        for (const i of got) clauses.push(`\`Pages read: ${i.claimed}\` is more than the ${i.read} corpus pages this session Read: give the number Read.`);
        break;
      default: break;
    }
  }
  if (extra > 0) clauses.push(`And ${extra} more of these: check each the same way before you finish.`);
  return [LEAD, ...clauses, TAIL].join(' ');
}

// ---- the continuation: what stayed open after the one ask ----------------------------------------------------------------------

const keyOf = (i) => `${i.kind}:${i.name ?? i.path ?? i.claimed ?? i.excerpt ?? i.line}`;
const DESCRIBE = Object.freeze({
  falseAbsent: (i) => `a name called not documented that the corpus prints (line "${i.opening}")`,
  unsourcedPrinted: (i) => `a name the corpus prints that no page, skill or request of this session gives (line "${i.opening}")`,
  coined: (i) => `a name the corpus does not print (line "${i.opening}")`,
  unsourced: (i) => `a name no page, skill or request of this session gives (line "${i.opening}")`,
  citedUnread: (i) => `a page cited but not read (${i.path})`,
  resting: (i) => `a construct left as not read or not verified ("${i.excerpt}")`,
  overclaim: (i) => `a pages-read count of ${i.claimed} where ${i.read} pages were read`,
});

/**
 * What stayed open after our one block. Pure. Called on the continuation's Stop (`stop_hook_active`), where the hook never blocks again:
 * the first block's items are recomputed from the transcript (the rows before our feedback row, no state file), each is checked against
 * the continuation and the Reads after the block, and what is still open — with what first appears in the continuation — is a notice to
 * the USER (a `systemMessage`), never to the model. `{ ours, open, text }`: `ours` is false when no feedback row of ours is in the turn.
 */
export function residualFindings({ rows = null, reply = null, index = null, coverage = null, options = {} } = {}) {
  const none = { ours: false, open: [], text: null };
  if (!Array.isArray(rows)) return none;
  const whole = turnSources(rows, options);
  const first = whole.feedback.find((f) => f.ours);
  if (!first) return none;
  const before = whole.live.slice(0, first.index);
  const after = whole.live.slice(first.index + 1);
  const was = groundingFindings({ rows: before, reply: null, index, coverage, options });
  if (was.skipped || was.items.length === 0) return { ours: true, open: [], text: null };

  const later = turnSources(after, options);
  const blocks = later.replyBlocks.slice();
  if (typeof reply === 'string' && reply && !(blocks.length && blocks[blocks.length - 1] === reply)) blocks.push(reply);
  const cont = blocks.flatMap((b) => b.split(/\r?\n/));
  const corrections = cont.filter((l) => /^\s*Correction:/i.test(l)).map(norm);
  const text = norm(blocks.join('\n'));
  const corrected = (name) => corrections.some((l) => l.includes(name));
  const printedBy = (name) => (index?.pathsOf(name) ?? []);
  const resolved = (i) => {
    switch (i.kind) {
      case 'falseAbsent': case 'unsourcedPrinted': {
        const pages = printedBy(i.name);
        return corrections.some((l) => l.includes(i.name) && [...later.pagesRead].some((p) => l.includes(norm(p)) && (pages.length === 0 || pages.includes(p))))
          || (corrected(i.name) && later.names.read.has(i.name));
      }
      case 'coined': case 'unsourced': return corrections.length > 0 && !text.includes(i.name);
      case 'citedUnread': return later.pagesRead.has(i.path);
      case 'resting': case 'overclaim': return corrections.length > 0;
      default: return true;
    }
  };
  const open = was.items.filter((i) => !resolved(i));
  const wasKeys = new Set(was.items.map(keyOf));
  const now = groundingFindings({ rows, reply, index, coverage, options: { ...options, replyAfter: first.index } });
  for (const i of now.items) if (!wasKeys.has(keyOf(i))) open.push(i);
  if (open.length === 0) return { ours: true, open: [], text: null };
  const shown = open.slice(0, 6).map((i) => DESCRIBE[i.kind](i));
  const more = open.length > shown.length ? `; and ${open.length - shown.length} more` : '';
  return { ours: true, open, text: `Grounding check: ${open.length} item(s) in this answer were not corrected after one request — ${shown.join('; ')}${more}. Check them before relying on this answer.` };
}
