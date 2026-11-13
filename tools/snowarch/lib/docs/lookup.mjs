// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C268 (phase A) — `./snowarch docs lookup <term…>`: which pages of the documentation corpus print a name, or print it under
// another word, BEFORE anything is called "not documented". Local, no network, stdlib only; it reads the names index
// (names-index.mjs) and, for the lines, the few pages it names. Warm, a call of several terms takes well under a second.
//
// A TERM IS ONE OF
//   name     `sc_req_item`, `sc\_req\_item`        underscores: looked up in the index, however the corpus escapes them
//   dotted   `glide.ui.escape_text`, `incident.assigned_to`   a qualified name, or a table written with a field (looked up by parts)
//   word     `incident`, `task`                    one plain word: a table of that name (via the labels), else a phrase
//   phrase   `requested item`, `data policy`       a label the corpus prints beside a name, a synonym of the corpus's, or a title
//
// WHAT COMES BACK, per term, one status and then lines:
//   PRINTED       the corpus prints it as typed (a name) or under that label, synonym or title (a phrase)
//   NEAR          a NAME that no page prints as typed, but which the corpus prints under another spelling: the names listed
//   ABSENT        a name that no page of the corpus prints, and the index covers the whole corpus: an absence claim is grounded
//   UNKNOWN       the same on a sparse checkout, whose index says nothing about the areas it does not hold: no claim either way
//   NO MATCH      a phrase that is no label, no synonym and no title word set of any page
//   then, per name, `<name>: <n> pages (<how it was reached>)` and, per page, `<path>:<line>: <the line>` — grep's own shape.
// Exit: 0 every term PRINTED · 1 some term is not · 2 usage · 3 no corpus or no index for this pin (the remedy is printed).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { bare, dotted } from './name-rules.mjs';
import { GENERIC, contentWords, normalisePhrase, parseSynonyms, wordsOf } from './label-rules.mjs';
import { loadNamesIndex } from './names-index.mjs';
import { corpusNamesDir } from '../local-paths.mjs';
import { spellings } from '../launcher-spelling.mjs';

export const LOOKUP_EXIT = Object.freeze({ ok: 0, notPrinted: 1, usage: 2, missing: 3 });
export const STATUS = Object.freeze({ printed: 'PRINTED', near: 'NEAR', absent: 'ABSENT', unknown: 'UNKNOWN', none: 'NO MATCH' });

const DEFAULT_LIMIT = 5;
const DEFAULT_NAMES = 3;
const MAX_TERMS = 40;
const DENSITY_MAX = 300;          // a name on more pages than this is ranked on titles and label pairs only
const LINE_WINDOW = 110;          // characters kept on each side of the match in a long line

const ESC = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A name as the corpus may print it: `\_` for `_`, bounded so `sc_req_item` is not found inside `x_sc_req_item_y`. */
const namePattern = (name, flags = 'i') => new RegExp(`(?<![A-Za-z0-9_])${name.split('.').map((p) => p.split('_').map(ESC).join('\\\\?_')).join('\\.')}(?![A-Za-z0-9_])`, flags);

/** Which kind of term this is, and its key. */
export function classify(raw) {
  const text = String(raw).trim().replace(/^[`"'(\[]+|[`"')\].,;:]+$/g, '').replace(/\\([_[\]])/g, '$1').trim();
  if (/^[A-Za-z0-9]+(?:_[A-Za-z0-9]+)+$/.test(text)) return { raw, kind: 'name', key: bare(text) };
  if (/^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+$/.test(text)) return { raw, kind: 'dotted', key: dotted(text) };
  if (/^[A-Za-z][A-Za-z0-9]*$/.test(text)) return { raw, kind: 'word', key: text.toLowerCase() };
  return { raw, kind: 'phrase', key: normalisePhrase(text) };
}

/** `{ line, text }` of the first line of `page` that prints `name`, or null. The text is one line, markdown escapes off, windowed. */
function lineOf(page, name) {
  const re = namePattern(name);
  const rows = page.split(/\r?\n/);
  for (let i = 0; i < rows.length; i += 1) {
    const m = re.exec(rows[i]);
    if (!m) continue;
    let text = rows[i].replace(/\\([_[\]()*#`])/g, '$1').replace(/\s+/g, ' ').trim();
    if (text.length > 2 * LINE_WINDOW) {
      const at = Math.max(0, text.search(namePattern(name.replace(/\\/g, ''))));
      const from = Math.max(0, at - LINE_WINDOW);
      text = `${from > 0 ? '…' : ''}${text.slice(from, at + LINE_WINDOW)}…`;
    }
    return { line: i + 1, text };
  }
  return null;
}

/** The pages (ids) to show for a name, best first: titled for it, then printing it beside its label, then most mentions. */
function rankPages({ ctx, name, ids, pairIds, labelKey }) {
  const { idx } = ctx;
  const titles = idx.titles();
  const nameWords = wordsOf(name);
  const labelWords = labelKey ? labelKey.split(' ') : null;
  const pairs = new Set(pairIds);
  const titled = (id) => {
    const tw = new Set(wordsOf(titles[id] ?? ''));
    return (labelWords && labelWords.every((w) => tw.has(w))) || nameWords.every((w) => tw.has(w));
  };
  let candidates = ids;
  if (ids.length > DENSITY_MAX) {
    candidates = ids.filter((id) => pairs.has(id) || titled(id)).slice(0, 200);
    for (let i = 0; candidates.length < ctx.limit * 4 && i < ids.length; i += 1) if (!candidates.includes(ids[i])) candidates.push(ids[i]);
  }
  const re = namePattern(name, 'gi');
  const scored = candidates.map((id) => {
    const text = ctx.page(idx.pagePath(id));
    const mentions = text ? Math.min(50, (text.match(re) ?? []).length) : 0;
    return { id, tier: titled(id) ? 0 : (pairs.has(id) ? 1 : 2), mentions };
  });
  scored.sort((a, b) => a.tier - b.tier || b.mentions - a.mentions || a.id - b.id);
  return scored.slice(0, ctx.limit).map((s) => ({ id: s.id, why: s.tier === 0 ? 'title' : (s.tier === 1 ? 'label pair' : `${s.mentions}x`) }));
}

/** A resolved name with its pages: `{ name, via, count, pages: [{ path, line, text, why }] }`. */
function nameEntry({ ctx, name, via, labelKey = null, pairs = [] }) {
  const { idx } = ctx;
  const indexed = idx.count(name) > 0;
  const ids = indexed ? idx.pagesOf(name) : [...new Set(pairs.flatMap((p) => p.ids))].sort((a, b) => a - b);
  const count = indexed ? idx.count(name) : pairs.reduce((n, p) => n + p.count, 0);
  const pairIds = pairs.flatMap((p) => p.ids);
  const shown = rankPages({ ctx, name, ids, pairIds, labelKey });
  const pages = shown.map(({ id, why }) => {
    const path = idx.pagePath(id);
    const found = lineOf(ctx.page(path) ?? '', name);
    return { path, line: found?.line ?? null, text: found?.text ?? null, why };
  });
  return { name, via, count, atLeast: !indexed, pages };
}

/** Names the corpus prints beside a label key, as `[{ name, count, ids }]` — pairs merged per name — most pages first. */
function namesForLabel(idx, key) {
  const byName = new Map();
  for (const p of idx.labelNames(key)) {
    const e = byName.get(p.name) ?? { name: p.name, count: 0, ids: [], pairs: [] };
    e.count += p.count;
    e.ids.push(...p.ids);
    e.pairs.push(p);
    byName.set(p.name, e);
  }
  return [...byName.values()].sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : 1));
}

/** Label keys to try for a phrase: itself, its synonyms, and each without a generic word at either end ("incident table"). */
function labelKeysFor(key, synonyms) {
  const out = new Set([key]);
  const trim = (k) => {
    const w = k.split(' ');
    const forms = [k];
    if (w.length > 1 && GENERIC.has(w[w.length - 1])) forms.push(w.slice(0, -1).join(' '));
    if (w.length > 1 && GENERIC.has(w[0])) forms.push(w.slice(1).join(' '));
    return forms;
  };
  for (const k of trim(key)) out.add(k);
  for (const k of [...out]) for (const s of synonyms?.get(k) ?? []) for (const f of trim(s)) out.add(f);
  return [...out].filter(Boolean);
}

/** Names that carry every segment of `key` (an exact segment, or one that begins the other: `req` and `requested`), fewest extras first. */
function nearNames(key, idx, max) {
  const q = key.split('_');
  const out = [];
  for (const cand of idx.nameKeys()) {
    if (cand === key || cand.includes('.')) continue;
    const s = cand.split('_');
    if (s.length > q.length + 2) continue;
    if (q.every((x) => s.some((y) => y === x || (x.length >= 3 && y.length >= 3 && (y.startsWith(x) || x.startsWith(y)))))) {
      out.push({ name: cand, extra: s.length - q.length, count: idx.count(cand) });
    }
  }
  out.sort((a, b) => a.extra - b.extra || b.count - a.count || (a.name < b.name ? -1 : 1));
  return out.slice(0, max);
}

function resolveName(c, ctx) {
  const { idx } = ctx;
  if (idx.count(c.key) > 0) return { status: STATUS.printed, names: [nameEntry({ ctx, name: c.key, via: 'name' })] };
  // Not printed as typed. The words it is made of may be a label the corpus prints beside a real name.
  const names = [];
  const seen = new Set();
  const add = (entry) => { if (!seen.has(entry.name) && names.length < ctx.maxNames) { seen.add(entry.name); names.push(entry); } };
  const words = c.key.split('_').map((w) => normalisePhrase(w)).join(' ');
  for (const key of labelKeysFor(words, ctx.synonyms)) {
    for (const e of namesForLabel(idx, key)) add(nameEntry({ ctx, name: e.name, via: `label "${key}"`, labelKey: key, pairs: e.pairs }));
  }
  if (names.length < ctx.maxNames) {
    for (const n of nearNames(c.key, idx, ctx.maxNames)) add(nameEntry({ ctx, name: n.name, via: 'similar name' }));
  }
  if (names.length) return { status: STATUS.near, names };
  return { status: idx.coverage === 'full' ? STATUS.absent : STATUS.unknown, names: [] };
}

function resolveDotted(c, ctx) {
  const { idx } = ctx;
  if (idx.count(c.key) > 0) return { status: STATUS.printed, names: [nameEntry({ ctx, name: c.key, via: 'name' })] };
  const parts = c.key.split('.');
  const indexed = parts.filter((p) => idx.count(p) > 0);
  if (parts.length === 2 && indexed.length === 2) {
    const both = idx.both(parts[0], parts[1]);
    if (both.length) {
      const entry = nameEntry({ ctx, name: parts[1], via: `${parts[0]} and ${parts[1]} on one page` });
      const pages = both.slice(0, ctx.limit).map((id) => {
        const path = idx.pagePath(id);
        const found = lineOf(ctx.page(path) ?? '', parts[1]);
        return { path, line: found?.line ?? null, text: found?.text ?? null, why: 'both' };
      });
      return { status: STATUS.printed, names: [{ ...entry, name: c.key, count: both.length, atLeast: false, pages }] };
    }
    return { status: STATUS.near, names: indexed.map((p) => nameEntry({ ctx, name: p, via: `printed, but never on a page with ${parts.find((x) => x !== p)}` })).slice(0, ctx.maxNames) };
  }
  if (indexed.length) return { status: STATUS.near, names: indexed.map((p) => nameEntry({ ctx, name: p, via: 'one part of the name' })).slice(0, ctx.maxNames) };
  return { status: idx.coverage === 'full' && parts.some((p) => p.includes('_')) ? STATUS.absent : STATUS.unknown, names: [] };
}

function resolvePhrase(c, ctx) {
  const { idx } = ctx;
  const names = [];
  const seen = new Set();
  for (const key of labelKeysFor(c.key, ctx.synonyms)) {
    for (const e of namesForLabel(idx, key)) {
      if (seen.has(e.name) || names.length >= ctx.maxNames) continue;
      seen.add(e.name);
      names.push(nameEntry({ ctx, name: e.name, via: key === c.key ? `label "${key}"` : `label "${key}" (from "${c.key}")`, labelKey: key, pairs: e.pairs }));
    }
  }
  // Titles: every content word of the phrase (or of a synonym of it) among the content words of a page's title.
  const queries = [contentWords(c.raw)];
  for (const s of ctx.synonyms?.get(c.key) ?? []) queries.push(contentWords(s));
  const titles = idx.titles();
  const hits = [];
  if (queries.some((q) => q.length)) {
    for (let id = 0; id < titles.length; id += 1) {
      if (!titles[id]) continue;
      const tw = new Set(contentWords(titles[id]));
      for (const q of queries) {
        if (q.length && q.every((w) => tw.has(w))) { hits.push({ id, score: q.length / tw.size }); break; }
      }
    }
  }
  hits.sort((a, b) => b.score - a.score || a.id - b.id);
  const pages = hits.slice(0, ctx.limit).map(({ id }) => ({ path: idx.pagePath(id), line: null, text: titles[id], why: 'title' }));
  if (names.length || pages.length) return { status: STATUS.printed, names, titles: pages, titleCount: hits.length };
  return { status: STATUS.none, names: [], titles: [], titleCount: 0 };
}

/**
 * Resolves `terms` against the index in `ctx`. `ctx` is `{ idx, page, synonyms, limit, maxNames }`: `idx` a loaded names index,
 * `page(path)` the text of a corpus page or null, `synonyms` the corpus's synonym Map or null. Returns one result per term.
 */
export function lookupTerms(terms, ctx) {
  const full = { limit: DEFAULT_LIMIT, maxNames: DEFAULT_NAMES, synonyms: null, ...ctx };
  return terms.map((raw) => {
    const c = classify(raw);
    let r;
    if (!c.key) r = { status: STATUS.none, names: [] };
    else if (c.kind === 'name') r = resolveName(c, full);
    else if (c.kind === 'dotted') r = resolveDotted(c, full);
    else r = resolvePhrase(c, full);
    return { term: raw, kind: c.kind, key: c.key, ...r };
  });
}

const sayCoverage = (idx) => (idx.coverage === 'full'
  ? 'the whole corpus at the pin'
  : 'a sparse checkout: only the areas it holds');

/** The result as plain lines. One status line per term, one line per name, one `path:line: text` line per page. */
export function formatLookup(results, { pin, idx }) {
  const out = [`lookup pin=${String(pin).slice(0, 12)} coverage=${idx.coverage} pages=${idx.pageCount} names=${idx.nameCount}`];
  for (const r of results) {
    const named = r.names.map((n) => n.name);
    let head;
    if (r.status === STATUS.printed) head = 'PRINTED';
    else if (r.status === STATUS.near) head = `NOT PRINTED as typed; the corpus prints: ${named.join(', ')}`;
    else if (r.status === STATUS.absent) head = `ABSENT: no page of the corpus prints this name (${sayCoverage(idx)}), so "not documented in the bundled corpus" is grounded`;
    else if (r.status === STATUS.unknown) head = `UNKNOWN: no page prints it, but this index covers ${sayCoverage(idx)}; no claim either way`;
    else head = 'NO MATCH: it is no label the corpus prints beside a name, no synonym, and no title word set; that does not show the corpus lacks the construct';
    out.push(`${r.term}: ${head}`);
    for (const n of r.names) {
      out.push(`  ${n.name}: ${n.atLeast ? 'at least ' : ''}${n.count} page${n.count === 1 ? '' : 's'} (${n.via})`);
      for (const p of n.pages) out.push(`  ${p.path}${p.line ? `:${p.line}` : ''}: ${p.text ?? '(the page is not on disk)'}`);
    }
    if (r.titles?.length) {
      out.push(`  titles: ${r.titleCount} page${r.titleCount === 1 ? '' : 's'}${r.titleCount > r.titles.length ? ` (${r.titles.length} shown)` : ''}`);
      for (const p of r.titles) out.push(`  ${p.path}: ${p.text}`);
    }
  }
  return out;
}

const usage = (cli) => `usage: ${cli} docs lookup <name or phrase>… [--limit <pages per name>] [--names <names per term>] [--json]\n`
  + 'exit: 0 every term printed · 1 some term is not · 2 usage · 3 no corpus or no names index for the docs pin';

/**
 * The command. `argv` is what follows `docs lookup`. `root` and `corpus` are the checkout and its corpus folder, `pin` the docs pin.
 * Returns the exit code; prints through `out` and `err`.
 */
export function runLookup(argv, { root, corpus, pin, spell = spellings(), out = console.log, err = console.error } = {}) {
  const terms = [];
  let json = false;
  let limit = DEFAULT_LIMIT;
  let maxNames = DEFAULT_NAMES;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') json = true;
    else if (a === '--limit' || a === '--names') {
      const v = Number(argv[i + 1]);
      i += 1;
      if (!Number.isInteger(v) || v < 1 || v > 50) { err(usage(spell.cli)); return LOOKUP_EXIT.usage; }
      if (a === '--limit') limit = v; else maxNames = v;
    } else if (a.startsWith('--')) { err(usage(spell.cli)); return LOOKUP_EXIT.usage; } else terms.push(a);
  }
  if (!terms.length || terms.length > MAX_TERMS) { err(usage(spell.cli)); return LOOKUP_EXIT.usage; }
  if (!existsSync(join(corpus, 'markdown'))) {
    err(`docs lookup: the documentation corpus is not on disk. Run ${spell.cli} docs sync, then ${spell.cli} doctor --fix`);
    return LOOKUP_EXIT.missing;
  }
  const idx = loadNamesIndex(corpusNamesDir(root, pin), { pin });
  if (!idx) {
    err(`docs lookup: the names index for the docs pin ${String(pin).slice(0, 12)} is not built, or does not load. Run ${spell.cli} doctor --fix`);
    return LOOKUP_EXIT.missing;
  }
  const cache = new Map();
  const page = (path) => {
    if (!path) return null;
    if (!cache.has(path)) {
      try { cache.set(path, readFileSync(join(corpus, ...path.split('/')), 'utf8')); } catch { cache.set(path, null); }
    }
    return cache.get(path);
  };
  let synonyms = null;
  try {
    const dir = join(corpus, 'markdown', 'vocabulary');
    const file = existsSync(dir) ? readdirSync(dir).find((f) => /synonym/i.test(f) && f.endsWith('.md')) : null;
    if (file) synonyms = parseSynonyms(readFileSync(join(dir, file), 'utf8'));
  } catch { synonyms = null; }
  const results = lookupTerms(terms, { idx, page, synonyms, limit, maxNames });
  if (json) {
    out(JSON.stringify({ pin, coverage: idx.coverage, pages: idx.pageCount, names: idx.nameCount, terms: results }, null, 2));
  } else {
    for (const line of formatLookup(results, { pin, idx })) out(line);
    if (!idx.wordsOk) err(`docs lookup: the labels or titles of the names index are short or garbled; run ${spell.cli} doctor --fix`);
  }
  return results.every((r) => r.status === STATUS.printed) ? LOOKUP_EXIT.ok : LOOKUP_EXIT.notPrinted;
}
