// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C268 (phase A) — the words side of the corpus names index, as a leaf: no import.
//
// The names index (names-index-build.mjs) answers "which pages print this NAME". A user, and the Architect after them, rarely start
// from the name: they say "requested item" and the corpus says `sc_req_item`. The corpus bridges the two itself, in print:
// `Requested Item \[sc\_req\_item\]` (a label, a space, the name in brackets), 46,579 times on 7,440 pages at the pin. This file
// reads those pairs, the page titles and the synonym page of the corpus, and normalises a phrase the one way both the builder
// and the lookup (lookup.mjs) use, so a label written at build time is found by the same words at query time.

/** Words a title or a phrase does not need to match on. Closed: a change here is a change to what the lookup finds. */
export const STOPWORDS = new Set(['a', 'an', 'the', 'of', 'for', 'to', 'in', 'on', 'at', 'by', 'with', 'from', 'and', 'or', 'as',
  'is', 'are', 'be', 'your', 'you', 'it', 'its', 'this', 'that', 'these', 'those', 'into', 'about', 'how', 'what', 'when', 'using', 'use']);

/**
 * Words that end a run of label words to the left of a bracketed name: a sentence's glue, not the label's. The function words end
 * it in any case; the prose words only when they are written in lower case, because `Decision Tables` and `Survey Questions` are
 * labels and "the table \[x\]" is a sentence.
 */
const PROSE_WORDS = new Set(['new', 'existing', 'select', 'choose', 'open', 'create', 'add', 'see', 'uses', 'used', 'per', 'than', 'then',
  'also', 'not', 'no', 'if', 'where', 'which', 'who', 'was', 'were', 'each', 'every', 'all', 'any', 'name', 'table', 'tables', 'field',
  'fields', 'record', 'records', 'column', 'columns', 'list', 'lists', 'form', 'forms', 'specify', 'enter']);
const endsRun = (t) => STOPWORDS.has(t.toLowerCase()) || (t === t.toLowerCase() && PROSE_WORDS.has(t));

/**
 * Words a person adds to a label that the label itself does not carry ("the incident table", "a knowledge article"). The lookup
 * retries a phrase without them when the whole phrase is not a label.
 */
export const GENERIC = new Set(['table', 'record', 'field', 'form', 'list', 'article', 'page', 'module', 'application', 'app', 'plugin',
  'tab', 'section', 'screen', 'window', 'view', 'object', 'entry']);

const MAX_RUN = 5;

/**
 * A copy of `s` that owns its characters. V8 hands back a slice of the parent string for a capture or a trim, and a slice keeps its
 * parent alive: 51,657 titles kept as slices kept all 51,657 pages (about 300 MB) in memory until the build ended.
 */
const own = (s) => Buffer.from(s, 'utf8').toString('utf8');
const MAX_IDS_PER_PAIR = 40;

/** One word, lower case, apostrophes off, a plural folded in the plainest ways (`ies`, `sses`, a final `s`). Both sides use it. */
export function singular(word) {
  const w = word.toLowerCase().replace(/'/g, '');
  if (w.length <= 3 || /\d/.test(w)) return w;
  if (/ies$/.test(w)) return `${w.slice(0, -3)}y`;
  if (/(sses|shes|ches|xes|zes)$/.test(w)) return w.slice(0, -2);
  if (/s$/.test(w) && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
  return w;
}

/** The words of a text: letters and digits, `_` and `\_` read as separators, plurals folded. `Requested_Item` is two words. */
export function wordsOf(text) {
  return String(text).replace(/\\_/g, ' ').replace(/'/g, '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map(singular);
}

/** A phrase as a label key: its words, joined by one space. */
export const normalisePhrase = (text) => wordsOf(text).join(' ');

/** The content words of a title or a phrase: `wordsOf` without the stopwords. */
export const contentWords = (text) => wordsOf(text).filter((w) => !STOPWORDS.has(w));

const BRACKETED = /(?<=\s)\\?\[([a-z][a-z0-9]*(?:\\?_[a-z0-9]+)*)\\?\](?!\()/g;
const CLAUSE_END = /[,;:.()|>!?]$/;
const LABEL_WORD = /^[A-Za-z0-9][A-Za-z0-9&/'-]*$/;

/** The words of the label that stands to the left of a bracketed name, nearest last: `['Requested', 'Item']`. May be empty. */
function runBefore(raw, index) {
  const lineStart = raw.lastIndexOf('\n', index - 1) + 1;
  const head = raw.slice(lineStart, index).replace(/\\(.)/g, '$1');
  const toks = head.trimEnd().split(/\s+/).filter(Boolean);
  const run = [];
  for (let i = toks.length - 1; i >= 0 && run.length < MAX_RUN; i -= 1) {
    if (CLAUSE_END.test(toks[i])) break;                       // a clause or a sentence ends here: the label is to its right
    const t = toks[i].replace(/^[("'*`]+|[*`]+$/g, '');         // emphasis marks and an opening quote are not the label's
    if (!LABEL_WORD.test(t) || endsRun(t)) break;
    run.unshift(t);
  }
  return run;
}

/**
 * The label-and-name pairs one page prints: `Label \[name\]`, as `[{ key, name }]`, distinct. The label is the run of words before
 * the bracket, up to a stop word or a mark; `key` is its `normalisePhrase`, and every suffix of two or more words is a key too
 * (`Add Requested Item \[sc_req_item\]` is also `requested item`). A single-word name is a pair only when its label says it
 * (`Incident \[incident\]`), which leaves out `array[i]` and `table[field]`. A link, `[name](url)`, and a bracket glued to a word
 * are never a pair.
 */
export function labelPairsOf(raw) {
  const seen = new Set();
  const out = [];
  for (const m of raw.matchAll(BRACKETED)) {
    const name = own(m[1].replace(/\\_/g, '_'));
    if (name.length < 3) continue;
    const run = runBefore(raw, m.index);
    if (!run.length) continue;
    if (!name.includes('_') && !run.some((w) => singular(w) === singular(name))) continue;
    const keys = run.length === 1 ? [run] : run.map((_, i) => run.slice(i)).filter((s) => s.length >= 2);
    for (const k of keys) {
      const key = normalisePhrase(k.join(' '));
      if (!key) continue;
      const id = `${key}\t${name}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ key, name });
    }
  }
  return out;
}

/** The title of a page: the front matter's `title:`, else the first `# ` heading, else an empty string. One line, no tab. */
export function titleOf(raw) {
  const front = /^---\r?\n([\s\S]{0,1200}?)\r?\n---/.exec(raw);
  const fromFront = front ? /^title:\s*(.+?)\s*$/m.exec(front[1]) : null;
  const heading = fromFront ? null : /^#\s+(.+?)\s*$/m.exec(raw.slice(0, 4000));
  return own((fromFront?.[1] ?? heading?.[1] ?? '').replace(/^["']|["']$/g, '').replace(/[\t\r\n]+/g, ' ').trim());
}

/**
 * The synonym page of the corpus (`markdown/vocabulary/…synonym-terms…md`): a table of `canonical | synonym \| synonym`. Returns a
 * Map from each normalised term to the other normalised terms of its group. Rows that are not a term group are ignored.
 */
export function parseSynonyms(raw) {
  const groups = new Map();
  for (const line of raw.split(/\r?\n/)) {
    if (!line.startsWith('|')) continue;
    const cells = line.split(/(?<!\\)\|/).slice(1, -1).map((c) => c.trim());
    if (cells.length < 2 || /^-+$/.test(cells[0]) || /^canonical term$/i.test(cells[0])) continue;
    const terms = [cells[0], ...cells[1].split(/\\\|/)].map(normalisePhrase).filter(Boolean);
    if (terms.length < 2) continue;
    for (const t of terms) {
      if (!groups.has(t)) groups.set(t, new Set());
      for (const o of terms) if (o !== t) groups.get(t).add(o);
    }
  }
  return groups;
}

export { MAX_IDS_PER_PAIR };
