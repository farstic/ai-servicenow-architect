// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C291 — a cited page must print the name it is cited for: the text rules of the check, pure and stdlib only.
//
// The architect measured, on the C267 and C287 sittings (150 answers each), that in 27 to 36 % of the answers a reply line cites a corpus page for a snake_case name
// that the page does not print: most such names are printed on another page, and some on none. The C267 hook cannot catch it, since it asks only about pages that
// were never opened. The class that uses these rules is `unsupportedName` in grounding-check.mjs; this module holds what a line must say to be checked, what a
// construct is, and when a page prints one.

/** The most names one ask lists, filled with ABSENT first and then ELSEWHERE; the rest are counted. */
export const MAX_NAMES = 6;

/** The file extensions that make a token a file name (the same set as grounding-check.mjs's FILE_TAILS): `my_script.js`, `data_file.json`, a host name. */
const FILE_TAILS = new Set(['md', 'json', 'mjs', 'js', 'ts', 'yml', 'yaml', 'html', 'css', 'csv', 'txt', 'png', 'svg', 'drawio', 'xml', 'sh', 'pdf', 'docx', 'py', 'io', 'net', 'com', 'org']);

/**
 * A `.md` file name, with the folders in front of it: a cited corpus path is one, and neither holds a construct. Anchored at the start of a run of name characters, so that
 * a run of 60,000 of them is scanned once and not from every position in it (a run without `.md` took 2.6 s).
 */
const MD_NAME = /(?<![A-Za-z0-9_.\-/])[A-Za-z0-9_.\-/]+\.md\b/g;
/**
 * A run of the characters a construct is made of, and of a placeholder for one (`sn_<scope>_table_name`): a placeholder is one run, which SNAKE rejects, and not
 * fragments of it that would look like names (`table_name`).
 */
const RUN = /[A-Za-z0-9_<>{}]+/g;
const SNAKE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;
/** A tool name of the engine, a scoped-app name and a custom field: never the corpus's to print. */
const OWN_PREFIX = /^(?:snow|x|u)_/;

/**
 * The constructs a line names, in order, each once: a lower-case snake_case token with an underscore, outside the cited paths and the file names, whose prefix is
 * not `snow_`, `x_` or `u_`, and which holds no `<`, `>`, `{` or `}` (a placeholder). A markdown escape (`sn\_x`) is dropped first, the edge underscores of a
 * run are markdown emphasis and not the name, and a token directly followed by a file extension (`my_script.js`) is a file. A run that ends with an underscore and does not
 * start with one is a prefix, the stem of a family of names (`sn_ins_`, `sn_ins_*`), and no construct (ARC-09-C293).
 */
export function constructsOf(line) {
  const flat = String(line ?? '').replace(/\\_/g, '_').replace(/\\/g, '/');
  const text = flat.replace(MD_NAME, ' ');
  const names = [];
  for (const m of text.matchAll(RUN)) {
    if (m[0].endsWith('_') && !m[0].startsWith('_')) continue;
    const name = m[0].replace(/^_+|_+$/g, '');
    if (!SNAKE.test(name) || OWN_PREFIX.test(name) || names.includes(name)) continue;
    const ext = /^\.([A-Za-z0-9]+)(?![A-Za-z0-9_])/.exec(text.slice(m.index + m[0].length));
    if (ext && FILE_TAILS.has(ext[1].toLowerCase())) continue;
    names.push(name);
  }
  return names;
}

/**
 * Does the line hedge: say that the corpus does not document it, that a page does not hold it, or that the page was not opened? "does not / doesn't / do not / don't"
 * counts before include, contain, say, print, define, name, mention, list, show, cover or document, with up to two words between ("does not explicitly mention").
 */
const HEDGED = new RegExp([
  'not documented', 'undocumented',
  '\\b(?:does\\s+not|doesn[\'’]t|do\\s+not|don[\'’]t)\\s+(?:\\w+\\s+){0,2}?(?:include|contain|say|print|define|name|mention|list|show|cover|document)\\b',
  '\\bnot\\s+(?:on|in)\\s+(?:the|this|that)\\s+page\\b',
  '\\b(?:is\\s+not|isn[\'’]t)\\s+listed\\b',
  '\\bno such\\b', 'unconfirmed', 'unverified', 'not opened',
  '\\b(?:haven[\'’]t|have\\s+not|did\\s+not|didn[\'’]t)\\s+open',
  'open question',
].join('|'), 'i');
export const isHedged = (line) => HEDGED.test(String(line ?? ''));

/** Bullets, numbers, quotes, headings and bold markers in front of a line's first word. */
const LINE_MARKUP = /^(?:\s|[-*+>•#]|\d+[.)])+/;
/** An anti-pattern line says what not to do: it starts, after the markup, with Don't, Do not, Never or Avoid. */
export const isAntiPattern = (line) => /^(?:don['’]t|do\s+not|never|avoid)\b/i.test(String(line ?? '').replace(LINE_MARKUP, ''));

/**
 * A page's text as it is compared: the markdown escapes the corpus writes dropped (`sn\_x` is `sn_x`), case ignored, every run of whitespace one space. An empty
 * string for what is no text.
 */
export function normalisePage(text) {
  if (typeof text !== 'string' || text === '') return '';
  return text.replace(/\\([\\`*_{}[\]()#+\-.!|<>~])/g, '$1').toLowerCase().replace(/\s+/g, ' ');
}

/** Does a normalised page print the name, or its label, the underscores read as spaces (`assignment group`)? A name inside a longer one is printed. */
export const printsConstruct = (norm, name) => norm.includes(name) || norm.includes(name.replaceAll('_', ' '));
