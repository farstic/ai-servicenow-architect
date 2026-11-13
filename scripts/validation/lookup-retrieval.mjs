#!/usr/bin/env node
// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C268 (phase A) — the OFFLINE retrieval check: no session, no model, no sitting. It asks one question of the corpus itself: when
// the words of a request are not the words the corpus uses, how often does a plain grep over the request's words reach a page that
// documents the construct, and how often does `./snowarch docs lookup`?
//
//   node scripts/validation/lookup-retrieval.mjs [--root <checkout>] [--index-root <checkout>] [--sample <n>] [--seed <n>] [--json]
//
// It needs the whole corpus and its names index (format 2); it reads every page once (about 600 MB of strings) and prints numbers.
// Four classes of case, each BUILT FROM THE CORPUS ITSELF, none typed by hand:
//   N  a name as it is typed          every name in the index; the grep that does not know the corpus escapes `_` finds a page only
//                                      if some page prints the name unescaped — a name printed only as `sc\_req\_item` is "absent" to it
//   L  a label for a name              the pairs the corpus prints as `Label \[name\]`: the request says the label, the page that
//                                      documents it prints the name. Grep: the label as typed, and its snake_case guess
//   S  a synonym for a canonical term  the corpus's own synonym page: the request says "ritm", the page that documents it is titled
//                                      "requested item …". Grep: the synonym as a word
//   T  most of a title                 a page title with one content word dropped: the page is the one that documents it
// "Found" for a grep is: a page that documents the construct is among the first 25 files it lists (path order, as grep lists them; a
// reader cannot open more) — and, separately, among all it lists. For the lookup it is: a page that documents it is among the pages
// the call prints (its default 5 per name and 5 titles; the first 10 for T).
// L is circular for the lookup by construction (the pair came from the corpus), and says so: the number to read there is whether
// the name is among the lookup's first three names for its label, which is a precision, not a recall. S and T are not circular.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { COVERAGE, loadNamesIndex } from '../../tools/snowarch/lib/docs/names-index.mjs';
import { lookupTerms } from '../../tools/snowarch/lib/docs/lookup.mjs';
import { contentWords, parseSynonyms } from '../../tools/snowarch/lib/docs/label-rules.mjs';
import { corpusNamesDir } from '../../tools/snowarch/lib/local-paths.mjs';

export const READABLE = 25;       // files a reader can open from a grep listing
export const SHOWN = 10;          // pages the lookup is read to (its default prints 5 per name and 5 titles)

/** A small seeded generator (mulberry32): the same seed picks the same cases. */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const pick = (arr, n, rnd) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
};

/** The pages' text twice, lower case: as printed (escapes in) and with the corpus's `\_` taken off. Aligned with the index's page ids. */
export function loadTexts(corpus, idx) {
  const raw = [];
  const unescaped = [];
  for (let id = 0; id < idx.pageCount; id += 1) {
    const low = readFileSync(join(corpus, ...idx.pagePath(id).split('/')), 'utf8').toLowerCase();
    raw.push(low);
    unescaped.push(low.includes('\\_') ? low.replace(/\\_/g, '_') : low);
  }
  return { raw, unescaped };
}

/** Ids of the pages whose text contains `needle` (a fixed string), or `\bneedle\b` when `word`. */
export function grep(texts, needle, { word = false } = {}) {
  const out = [];
  if (word) {
    const re = new RegExp(`(?<![a-z0-9_])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9_])`);
    for (let id = 0; id < texts.length; id += 1) if (re.test(texts[id])) out.push(id);
  } else {
    for (let id = 0; id < texts.length; id += 1) if (texts[id].includes(needle)) out.push(id);
  }
  return out;
}

/** The pages that print each underscore token with a literal `_` (unescaped), as a Map name -> count. One pass over `raw`. */
export function unescapedNames(raw) {
  const counts = new Map();
  for (const text of raw) {
    const seen = new Set();
    for (const m of text.matchAll(/[a-z0-9]+(?:_[a-z0-9]+)+/g)) seen.add(m[0]);
    for (const n of seen) counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  return counts;
}

const isTarget = (targets, ids, k = Infinity) => ids.slice(0, k).some((id) => targets.has(id));
const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(1)}%` : 'n/a');

const idsByPath = new WeakMap();
function pathIds(idx) {
  if (!idsByPath.has(idx)) {
    const m = new Map();
    for (let id = 0; id < idx.pageCount; id += 1) m.set(idx.pagePath(id), id);
    idsByPath.set(idx, m);
  }
  return idsByPath.get(idx);
}

/** The lookup's pages for one term: every page it prints, names first then titles, as ids. `limit` pages per name and per titles. */
function lookupIds(idx, page, term, limit, synonyms) {
  const [r] = lookupTerms([term], { idx, page, synonyms, limit, maxNames: 3, cache: lookupCache });
  const paths = [...r.names.flatMap((n) => n.pages.map((p) => p.path)), ...(r.titles ?? []).map((p) => p.path)];
  const ids = pathIds(idx);
  return { r, ids: paths.map((p) => ids.get(p)) };
}
const lookupCache = {};

/** Class N: names as typed. No lookup is needed to know the answer for the lookup: the index is the truth it reads. */
export function classN(idx, texts, rnd, sample) {
  const unesc = unescapedNames(texts.raw);
  const names = [];
  for (const n of idx.nameKeys()) if (n.includes('_') && !n.includes('.')) names.push(n);
  const chosen = sample ? pick(names, sample, rnd) : names;
  const onlyEscaped = chosen.filter((n) => !unesc.has(n));
  return { cases: chosen.length, plainGrepFinds: chosen.length - onlyEscaped.length, escapedOnly: onlyEscaped.length, escapeSafeGrepFinds: chosen.length, lookupFinds: chosen.length,
    escapedOnlyShare: pct(onlyEscaped.length, chosen.length) };
}

/** Class L: a label for a name. `pairs` are the index's (key, name) rows. */
export function classL(idx, texts, page, rnd, sample, synonyms) {
  const rows = [];
  for (const key of idx.labelKeys()) for (const e of idx.labelNames(key)) rows.push({ key, name: e.name, pairPages: e.count, ids: e.ids });
  const eligible = rows.filter((r) => r.key.split(' ').length >= 2 || r.pairPages >= 2);
  const chosen = pick(eligible, sample, rnd);
  const out = { cases: chosen.length, eligible: eligible.length, pairs: rows.length, pairsOn2plusPages: rows.filter((r) => r.pairPages >= 2).length,
    phraseGrep25: 0, phraseGrepAny: 0, snakeGrep25: 0, snakeGrepAny: 0, anyGrep25: 0, lookupNameInTop3: 0, lookupPageShown: 0, guessIsTheName: 0 };
  for (const c of chosen) {
    const targets = new Set(idx.count(c.name) > 0 ? idx.pagesOf(c.name) : c.ids);
    const snake = c.key.replace(/ /g, '_');
    if (snake === c.name) out.guessIsTheName += 1;
    const byPhrase = grep(texts.unescaped, c.key);
    const bySnake = grep(texts.unescaped, snake);
    out.phraseGrepAny += isTarget(targets, byPhrase) ? 1 : 0;
    out.phraseGrep25 += isTarget(targets, byPhrase, READABLE) ? 1 : 0;
    out.snakeGrepAny += isTarget(targets, bySnake) ? 1 : 0;
    out.snakeGrep25 += isTarget(targets, bySnake, READABLE) ? 1 : 0;
    out.anyGrep25 += (isTarget(targets, byPhrase, READABLE) || isTarget(targets, bySnake, READABLE)) ? 1 : 0;
    const { r, ids } = lookupIds(idx, page, c.key, 5, synonyms);
    out.lookupNameInTop3 += r.names.some((n) => n.name === c.name) ? 1 : 0;
    out.lookupPageShown += isTarget(targets, ids) ? 1 : 0;
  }
  return out;
}

/** Class S: a synonym from the corpus's synonym page; the pages that document the canonical term are those whose title holds its words. */
export function classS(idx, texts, page, synonymRaw, titleWordsOf, synonyms) {
  const groups = parseSynonyms(synonymRaw);
  const titles = idx.titles();
  const titleSets = titles.map((x) => new Set(titleWordsOf(x ?? '')));
  const cases = [];
  const seen = new Set();
  for (const [term, others] of groups) {
    for (const canonical of others) {
      if (seen.has(`${term}|${canonical}`) || canonical.split(' ').length < 1) continue;
      seen.add(`${term}|${canonical}`);
      const words = titleWordsOf(canonical);
      if (!words.length) continue;
      const targets = new Set();
      for (let id = 0; id < titles.length; id += 1) if (words.every((w) => titleSets[id].has(w))) targets.add(id);
      // a synonym is a word the person types; the page is "documenting" it when its title holds the canonical words, and the
      // synonym is not itself a title word of that page (otherwise the title already says it)
      if (targets.size >= 1 && targets.size <= 300 && !words.includes(term) && term !== canonical) cases.push({ term, canonical, targets });
    }
  }
  const out = { cases: cases.length, grepWord25: 0, grepWordAny: 0, lookupPageShown: 0 };
  for (const c of cases) {
    const g = grep(texts.unescaped, c.term, { word: true });
    out.grepWordAny += isTarget(c.targets, g) ? 1 : 0;
    out.grepWord25 += isTarget(c.targets, g, READABLE) ? 1 : 0;
    const { ids } = lookupIds(idx, page, c.term, SHOWN, synonyms);
    out.lookupPageShown += isTarget(c.targets, ids, SHOWN * 4) ? 1 : 0;
  }
  return out;
}

/** Class T: a title with one content word dropped. The page is the target. */
export function classT(idx, texts, page, rnd, sample, synonyms) {
  const titles = idx.titles();
  const eligible = [];
  for (let id = 0; id < titles.length; id += 1) if (contentWords(titles[id] ?? '').length >= 3) eligible.push(id);
  const chosen = pick(eligible, sample, rnd);
  const out = { cases: chosen.length, eligible: eligible.length, phraseGrep25: 0, phraseGrepAny: 0, wordsAnywhere25: 0, lookupPageShown: 0 };
  for (const id of chosen) {
    const words = contentWords(titles[id]);
    const drop = Math.floor(rnd() * words.length);
    const kept = words.filter((_, i) => i !== drop);
    const phrase = kept.join(' ');
    const targets = new Set([id]);
    const byPhrase = grep(texts.unescaped, phrase);
    out.phraseGrepAny += isTarget(targets, byPhrase) ? 1 : 0;
    out.phraseGrep25 += isTarget(targets, byPhrase, READABLE) ? 1 : 0;
    // the best a grep user does without a phrase match: every word somewhere in the file, narrowed by the first word's listing
    let ids = grep(texts.unescaped, kept[0]);
    for (const w of kept.slice(1)) { const s = new Set(grep(texts.unescaped, w)); ids = ids.filter((x) => s.has(x)); }
    out.wordsAnywhere25 += isTarget(targets, ids, READABLE) ? 1 : 0;
    const { ids: shown } = lookupIds(idx, page, phrase, SHOWN, synonyms);
    out.lookupPageShown += isTarget(targets, shown) ? 1 : 0;
  }
  return out;
}

/** The report as lines of plain text. */
export function describe(res) {
  const L = [];
  const row = (label, n, d) => L.push(`  ${label.padEnd(66)} ${String(n).padStart(5)} / ${String(d).padEnd(5)} ${pct(n, d)}`);
  const { N, L: l, S, T } = res;
  L.push(`pages ${res.pages} · names ${res.names} · coverage ${res.coverage} · pin ${res.pin} · seed ${res.seed} · sample ${res.sample}`);
  L.push('', `N  names as typed (${N.cases} names, all of them)`);
  row('a grep that does not escape finds a page', N.plainGrepFinds, N.cases);
  row('  names printed ONLY with escaped underscores (invisible to it)', N.escapedOnly, N.cases);
  row('an escape-safe grep finds a page', N.escapeSafeGrepFinds, N.cases);
  row('the lookup finds a page', N.lookupFinds, N.cases);
  L.push('', `L  labels for names (${l.cases} cases of ${l.eligible} eligible; the corpus prints ${l.pairs} pairs, ${l.pairsOn2plusPages} on 2 or more pages)`);
  row('the label\'s snake_case guess is the name', l.guessIsTheName, l.cases);
  row('grep of the label as typed: a page that prints the name, first 25 files', l.phraseGrep25, l.cases);
  row('grep of the label as typed: ... among all files it lists', l.phraseGrepAny, l.cases);
  row('grep of the snake_case guess: first 25 files', l.snakeGrep25, l.cases);
  row('grep of the snake_case guess: ... among all files', l.snakeGrepAny, l.cases);
  row('either grep: first 25 files', l.anyGrep25, l.cases);
  row('lookup: the name is among its first 3 names for the label', l.lookupNameInTop3, l.cases);
  row('lookup: a page that prints the name is among the pages printed', l.lookupPageShown, l.cases);
  L.push('', `S  synonyms from the corpus's synonym page (${S.cases} cases)`);
  row('grep -w of the synonym: a page titled for the canonical term, first 25 files', S.grepWord25, S.cases);
  row('grep -w of the synonym: ... among all files', S.grepWordAny, S.cases);
  row('lookup: such a page is among the pages printed', S.lookupPageShown, S.cases);
  L.push('', `T  a title with one content word dropped (${T.cases} cases of ${T.eligible} eligible)`);
  row('grep of the remaining words as a phrase: the page, first 25 files', T.phraseGrep25, T.cases);
  row('grep of the remaining words as a phrase: ... among all files', T.phraseGrepAny, T.cases);
  row('grep of every remaining word, files that hold all: the page, first 25', T.wordsAnywhere25, T.cases);
  row('lookup: the page is among the pages printed', T.lookupPageShown, T.cases);
  return L;
}

async function main() {
  const argv = process.argv.slice(2);
  const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
  const root = resolve(val('--root', resolve(fileURLToPath(import.meta.url), '..', '..', '..')));
  const sample = Number(val('--sample', 300));
  const seed = Number(val('--seed', 20261113));
  const corpus = join(root, 'vendor', 'ServiceNowDocs');
  const pin = execFileSync('git', ['-C', corpus, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const indexRoot = resolve(val('--index-root', root));      // the checkout whose .local/ holds the index, when it is not this one
  const idx = loadNamesIndex(corpusNamesDir(indexRoot, pin), { pin });
  if (!idx || idx.coverage !== COVERAGE.full) { console.error('needs the names index (format 2) of the whole corpus: run ./snowarch doctor --fix'); process.exit(3); }
  const texts = loadTexts(corpus, idx);
  const cache = new Map();
  const page = (p) => { if (!cache.has(p)) cache.set(p, readFileSync(join(corpus, ...p.split('/')), 'utf8')); return cache.get(p); };
  const synPath = idx.titles().findIndex((t, id) => /synonym/i.test(idx.pagePath(id)) && /vocabulary/.test(idx.pagePath(id)));
  const synonymRaw = synPath >= 0 ? page(idx.pagePath(synPath)) : '';
  const synonyms = parseSynonyms(synonymRaw);
  const rnd = seeded(seed);
  const res = { pages: idx.pageCount, names: idx.nameCount, coverage: idx.coverage, pin: pin.slice(0, 12), seed, sample };
  res.N = classN(idx, texts, rnd, 0);
  res.L = classL(idx, texts, page, rnd, sample, synonyms);
  res.S = classS(idx, texts, page, synonymRaw, contentWords, synonyms);
  res.T = classT(idx, texts, page, rnd, sample, synonyms);
  if (argv.includes('--json')) console.log(JSON.stringify(res, null, 2));
  else for (const line of describe(res)) console.log(line);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
