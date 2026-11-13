// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C268 (phase A) — `./snowarch docs lookup`: which pages print a name, or print it under another word. Every case runs on a
// small corpus built here, the way the corpus prints: `\_` for `_`, `Label \[name\]` pairs, front matter titles, a synonym page,
// a page with CRLF line ends (a Windows checkout). The real corpus is read only by the last case, where one is whole.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';
import { buildNamesIndex, writeNamesIndex } from '../tools/snowarch/lib/docs/names-index-build.mjs';
import { loadNamesIndex } from '../tools/snowarch/lib/docs/names-index.mjs';
import { LOOKUP_EXIT, STATUS, classify, lookupTerms, runLookup } from '../tools/snowarch/lib/docs/lookup.mjs';
import { contentWords, labelPairsOf, normalisePhrase, parseSynonyms, singular, titleOf, wordsOf } from '../tools/snowarch/lib/docs/label-rules.mjs';
import { corpusNamesDir } from '../tools/snowarch/lib/local-paths.mjs';
import { spellings } from '../tools/snowarch/lib/launcher-spelling.mjs';

const PIN = 'c10276e953456835cdbb1f3a60d58ae1980be353';
const SPELL = spellings();

const front = (title) => `---\ntitle: ${title}\nlocale: en-US\n---\n\n`;
const FILES = {
  'markdown/itsm/requested-item.md': `${front('Requested Item table')}The Requested Item \\[sc\\_req\\_item\\] table holds one record per ordered item. Its field \`cat\\_item\` is the catalog item.\n`,
  'markdown/itsm/catalog-task.md': `${front('Catalog Task')}The Catalog Task \\[sc\\_task\\] table records the work for a requested item in the Requested Item \\[sc\\_req\\_item\\] table.\n`,
  'markdown/itsm/incident.md': `${front('Incident management')}Incident \\[incident\\] records carry the field incident.assigned\\_to and the field assigned\\_to.\n`,
  'markdown/itsm/flow-note.md': `${front('Flow note')}A flow pill reads fd_data.subflow_inputs.requested_item once.\n`,
  'markdown/dev/script.md': `${front('Scripting the catalog')}var gr = new GlideRecord('sc_req_item');\n`,
  'markdown/csm/case.md': `${front('Case management')}Cases live in sn\\_customerservice\\_case, whose field is state; the pair is never written with a dot.\n`,
  'markdown/platform/glide-notes.md': `${front('Glide notes')}See glide.ui.escape\\_text and glide.foo.bar.\n`,
  'markdown/platform/ci-overview.md': `${front('Configuration item overview')}The Configuration Item \\[cmdb\\_ci\\] table is the root of the CMDB.\n`,
  'markdown/vocabulary/sn-docs-synonym-terms-enus.md': [
    '# Synonym & Alias Reference', '', '| Canonical Term | Synonyms |', '|---|---|',
    '| requested item | ritm \\| req item |', '| configuration item | ci \\| cmdb ci |', ''].join('\n'),
  // A Windows checkout: CRLF line ends. The line numbers and the text must not change for it.
  'markdown/win/crlf.md': `${front('Windows checkout')}First line.\r\nThe table sys\\_user is printed here.\r\nLast line.\r\n`,
};

/** A root with the corpus under vendor/ServiceNowDocs and the index built for it; `full` makes the coverage whole. */
function world(t, { files = FILES, full = true } = {}) {
  const root = tempDir('lookup-world-', t);
  const corpus = join(root, 'vendor', 'ServiceNowDocs');
  for (const [page, text] of Object.entries(files)) {
    const abs = join(corpus, ...page.split('/'));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, text);
  }
  const pages = Object.keys(files).sort();
  writeNamesIndex(corpusNamesDir(root, PIN), buildNamesIndex({ corpus, pin: PIN, tree: full ? pages : null }));
  return { root, corpus };
}

/** The command, as the docs frame calls it, with its output collected. */
function run(w, argv) {
  const out = [];
  const err = [];
  const code = runLookup(argv, { root: w.root, corpus: w.corpus, pin: PIN, spell: SPELL, out: (l) => out.push(l), err: (l) => err.push(l) });
  return { code, out, err, text: out.join('\n') };
}

test('ARC-09-C268 — a name the corpus prints only with escaped underscores is found, with its page and its line', (t) => {
  const w = world(t);
  const r = run(w, ['sc_req_item']);
  assert.equal(r.code, LOOKUP_EXIT.ok);
  assert.match(r.out[0], /^lookup pin=c10276e95345 coverage=full pages=10 names=\d+$/);
  assert.equal(r.out[1], 'sc_req_item: PRINTED');
  assert.equal(r.out[2], '  sc_req_item: 3 pages (name)');
  const pageLines = r.out.slice(3);
  assert.equal(pageLines.length, 3, 'every page of the name is listed (the limit is 5)');
  // one line per page, grep's shape: path:line: text, with the corpus's escapes taken off the text
  for (const l of pageLines) assert.match(l, /^ {2}markdown\/[a-z]+\/[a-z-]+\.md:\d+: \S/, l);
  assert.ok(pageLines.some((l) => l.includes('The Requested Item [sc_req_item] table holds one record')), 'the escaped line is shown unescaped');
  assert.ok(pageLines.every((l) => !l.includes('\\_')), 'no escape is left in a page line');
  // the pages titled for the name's label come first
  assert.match(pageLines[0], /requested-item\.md/);
});

test('ARC-09-C268 — the name may be typed with the corpus\'s own escapes, in capitals, or in backticks', (t) => {
  const w = world(t);
  for (const typed of ['sc\\_req\\_item', 'SC_REQ_ITEM', '`sc_req_item`', '[sc_req_item]']) {
    const r = run(w, [typed]);
    assert.equal(r.code, LOOKUP_EXIT.ok, typed);
    assert.equal(r.out[1], `${typed}: PRINTED`);
  }
});

test('ARC-09-C268 — a name no page prints is ABSENT where the index covers the whole corpus, and UNKNOWN where it does not', (t) => {
  const full = world(t);
  const r = run(full, ['sn_made_up_table']);
  assert.equal(r.code, LOOKUP_EXIT.notPrinted);
  assert.match(r.out[1], /^sn_made_up_table: ABSENT: no page of the corpus prints this name \(the whole corpus at the pin\), so "not documented in the bundled corpus" is grounded$/);
  const sparse = world(t, { full: false });
  const s = run(sparse, ['sn_made_up_table']);
  assert.equal(s.code, LOOKUP_EXIT.notPrinted);
  assert.match(s.out[0], /coverage=disk/);
  assert.match(s.out[1], /^sn_made_up_table: UNKNOWN: no page prints it, but this index covers a sparse checkout: only the areas it holds; no claim either way$/);
  assert.doesNotMatch(s.text, /is grounded/, 'a sparse index never grounds an absence');
});

test('ARC-09-C268 — a guessed name leads to the name the corpus prints beside the same words', (t) => {
  const w = world(t, { files: { ...FILES, 'markdown/itsm/flow-note.md': `${front('Flow note')}Nothing about it.\n` } });
  const r = run(w, ['requested_item']);
  assert.equal(r.code, LOOKUP_EXIT.notPrinted);
  assert.match(r.out[1], /^requested_item: NOT PRINTED as typed; the corpus prints: sc_req_item/);
  assert.match(r.out[2], /^ {2}sc_req_item: 3 pages \(label "requested item"\)$/);
  assert.ok(r.out.slice(3).length >= 1 && r.out.slice(3).every((l) => /^ {2}markdown\//.test(l)));
});

test('ARC-09-C268 — a name printed as typed, but on far fewer pages than another name carries its words, says so', (t) => {
  // requested_item is printed once (flow-note); with twelve more pages that label sc_req_item, "requested item" is worth a "see also".
  const files = { ...FILES };
  for (let i = 0; i < 12; i += 1) files[`markdown/itsm/ritm-${i}.md`] = `${front(`Requested Item ${i}`)}The Requested Item \\[sc\\_req\\_item\\] table, page ${i}.\n`;
  const w = world(t, { files });
  const r = run(w, ['requested_item']);
  assert.equal(r.code, LOOKUP_EXIT.ok, 'it is printed as typed');
  assert.equal(r.out[1], 'requested_item: PRINTED; see also sc_req_item');
  assert.ok(r.out.some((l) => /^ {2}also sc_req_item: \d+ pages \(label "requested item"\)$/.test(l)));
});

test('ARC-09-C268 — a name nobody labels is met by the names that carry its segments', (t) => {
  const files = { 'markdown/a/p.md': `${front('Page')}The table sc\\_req\\_item and the table sc\\_cat\\_item, and cmdb\\_ci\\_server.\n` };
  const w = world(t, { files });
  const r = run(w, ['request_item']);
  assert.equal(r.code, LOOKUP_EXIT.notPrinted);
  assert.match(r.out[1], /^request_item: NOT PRINTED as typed; the corpus prints: sc_req_item$/, 'req is the start of request, and cat is not');
  assert.match(r.out[2], /\(similar name\)$/);
});

test('ARC-09-C268 — a dotted name: printed whole, a table with a field on one page, and never together', (t) => {
  const w = world(t);
  const whole = run(w, ['glide.ui.escape_text']);
  assert.equal(whole.code, LOOKUP_EXIT.ok);
  assert.equal(whole.out[1], 'glide.ui.escape_text: PRINTED');
  assert.match(whole.out.at(-1), /^ {2}markdown\/platform\/glide-notes\.md:\d+: See glide\.ui\.escape_text and glide\.foo\.bar\.$/);
  // `incident.assigned_to`: `incident` is one plain word (not in the index), `assigned_to` is a token; one page prints both on one line
  const field = run(w, ['incident.assigned_to']);
  assert.equal(field.code, LOOKUP_EXIT.ok);
  assert.equal(field.out[1], 'incident.assigned_to: PRINTED');
  assert.equal(field.out[2], '  incident.assigned_to: 1 page (incident and assigned_to on one page)');
  assert.equal(field.out[3], '  markdown/itsm/incident.md:6: Incident [incident] records carry the field incident.assigned_to and the field assigned_to.');
  // a table and a field that the corpus prints, and never on one page
  const apart = run(w, ['sc_req_item.assigned_to']);
  assert.equal(apart.code, LOOKUP_EXIT.notPrinted);
  assert.match(apart.out[1], /^sc_req_item\.assigned_to: NOT PRINTED as typed; the corpus prints: sc_req_item, assigned_to$/);
  assert.ok(apart.out.some((l) => /printed, but never on a page with assigned_to/.test(l)));
});

test('ARC-09-C268 — a plain word that is a table is found through the label that says so', (t) => {
  const w = world(t);
  const r = run(w, ['incident']);
  assert.equal(r.code, LOOKUP_EXIT.ok);
  assert.equal(r.out[1], 'incident: PRINTED');
  assert.equal(r.out[2], '  incident: at least 1 page (label "incident")');
  assert.equal(r.out[3], '  markdown/itsm/incident.md:6: Incident [incident] records carry the field incident.assigned_to and the field assigned_to.',
    'the line with the pair, not the front matter title');
});

test('ARC-09-C268 — a phrase is a label, a synonym of the corpus\'s own, or a title', (t) => {
  const w = world(t);
  const label = run(w, ['requested item']);
  assert.equal(label.code, LOOKUP_EXIT.ok);
  assert.match(label.out[2], /^ {2}sc_req_item: 3 pages \(label "requested item"\)$/);
  // "ritm" is on the corpus's synonym page, beside "requested item"
  const syn = run(w, ['ritm']);
  assert.equal(syn.code, LOOKUP_EXIT.ok);
  assert.match(syn.out[2], /^ {2}sc_req_item: 3 pages \(label "requested item" \(from "ritm"\)\)$/);
  // "the configuration item table": a generic word at the end is no part of the label
  const generic = run(w, ['the configuration item table']);
  assert.equal(generic.code, LOOKUP_EXIT.ok);
  assert.match(generic.out[2], /cmdb_ci: 1 page/);
  // a title, with no label to go by
  const title = run(w, ['windows checkout']);
  assert.equal(title.code, LOOKUP_EXIT.ok);
  assert.ok(title.out.includes('  titles: 1 page'));
  assert.ok(title.out.includes('  markdown/win/crlf.md: Windows checkout'));
  // nothing matches
  const none = run(w, ['quantum entanglement']);
  assert.equal(none.code, LOOKUP_EXIT.notPrinted);
  assert.match(none.out[1], /^quantum entanglement: NO MATCH: it is no label the corpus prints beside a name, no synonym, and no title word set; that does not show the corpus lacks the construct$/);
});

test('ARC-09-C268 — several terms in one call, in order; the exit code is 1 when any one is not printed', (t) => {
  const w = world(t);
  const r = run(w, ['sc_task', 'sn_made_up_table', 'cmdb_ci']);
  assert.equal(r.code, LOOKUP_EXIT.notPrinted);
  const heads = r.out.filter((l) => /^\S/.test(l) && !l.startsWith('lookup '));
  assert.deepEqual(heads.map((l) => l.split(':')[0]), ['sc_task', 'sn_made_up_table', 'cmdb_ci']);
  assert.deepEqual(heads.map((l) => l.split(':')[1].trim().split(' ')[0]), ['PRINTED', 'ABSENT', 'PRINTED']);
  assert.equal(run(w, ['sc_task', 'cmdb_ci']).code, LOOKUP_EXIT.ok);
});

test('ARC-09-C268 — --limit and --names bound the output; --json is the whole result', (t) => {
  const w = world(t);
  assert.equal(run(w, ['sc_req_item', '--limit', '1']).out.length, 4, 'the header, the term, the name and one page');
  const j = run(w, ['sc_req_item', 'requested_item', '--json']);
  const doc = JSON.parse(j.text);
  assert.equal(doc.pin, PIN);
  assert.equal(doc.coverage, 'full');
  assert.deepEqual(doc.terms.map((x) => [x.term, x.status]), [['sc_req_item', STATUS.printed], ['requested_item', STATUS.printed]]);
  assert.equal(doc.terms[0].names[0].name, 'sc_req_item');
  assert.ok(doc.terms[0].names[0].pages.every((p) => typeof p.path === 'string' && Number.isInteger(p.line)));
  assert.equal(run(w, ['requested_item', '--names', '1', '--limit', '1']).code, LOOKUP_EXIT.ok);
});

test('ARC-09-C268 — a usage error is 2 and says how; no corpus or no index is 3 and says the remedy', (t) => {
  const w = world(t);
  for (const bad of [[], ['--bogus', 'x'], ['x', '--limit'], ['x', '--limit', '0'], ['x', '--names', 'many']]) {
    const r = run(w, bad);
    assert.equal(r.code, LOOKUP_EXIT.usage, JSON.stringify(bad));
    assert.match(r.err[0], new RegExp(`^usage: ${SPELL.cli.replace(/[.\\]/g, '\\$&')} docs lookup <name or phrase>… `));
  }
  const bare = tempDir('lookup-bare-', t);
  mkdirSync(join(bare, 'vendor', 'ServiceNowDocs', 'markdown'), { recursive: true });
  const noIndex = run({ root: bare, corpus: join(bare, 'vendor', 'ServiceNowDocs') }, ['sc_task']);
  assert.equal(noIndex.code, LOOKUP_EXIT.missing);
  assert.match(noIndex.err[0], new RegExp(`names index for the docs pin c10276e95345 is not built.* Run ${SPELL.cli.replace(/[.\\]/g, '\\$&')} doctor --fix$`));
  const noCorpus = run({ root: bare, corpus: join(bare, 'nowhere') }, ['sc_task']);
  assert.equal(noCorpus.code, LOOKUP_EXIT.missing);
  assert.match(noCorpus.err[0], /the documentation corpus is not on disk/);
});

test('ARC-09-C268 — a page with CRLF line ends gives the same line number and the same text, and no path has a backslash', (t) => {
  const w = world(t);
  const r = run(w, ['sys_user']);
  assert.equal(r.code, LOOKUP_EXIT.ok);
  const line = r.out.find((l) => l.includes('crlf.md'));
  // front matter is 5 lines (---, title, locale, ---, blank), then "First line." at 6, the name at 7
  assert.equal(line, '  markdown/win/crlf.md:7: The table sys_user is printed here.');
  assert.ok(r.out.every((l) => !l.includes('\r')), 'a carriage return reached the output');
  assert.ok(r.out.filter((l) => /^ {2}markdown/.test(l)).every((l) => !/^ {2}[^:]*\\/.test(l)), 'a page path printed with a backslash');
});

test('ARC-09-C268 — a page on a name\'s long posting list is not read to rank it: the read count is bounded', (t) => {
  const files = {};
  for (let i = 0; i < 400; i += 1) files[`markdown/bulk/p${String(i).padStart(3, '0')}.md`] = `${front(`Bulk page ${i}`)}Mentions sys\\_common once.\n`;
  const w = world(t, { files });
  const idx = loadNamesIndex(corpusNamesDir(w.root, PIN), { pin: PIN });
  const reads = [];
  const page = (p) => { reads.push(p); return readFileSync(join(w.corpus, ...p.split('/')), 'utf8'); };
  const [res] = lookupTerms(['sys_common'], { idx, page, limit: 5, maxNames: 3 });
  assert.equal(res.names[0].count, 400);
  assert.equal(res.names[0].pages.length, 5);
  assert.ok(reads.length <= 5 * 4 + 5 + 200, `read ${reads.length} pages to rank a 400-page name`);
});

test('ARC-09-C268 — warm, a call of several terms takes well under a second on a 2,000-page corpus', (t) => {
  const files = {};
  for (let i = 0; i < 2000; i += 1) files[`markdown/syn/p${i}.md`] = `${front(`Synthetic page ${i}`)}Table tbl_${i % 300}_x with field\\_${i % 50} and the Label ${i % 40} \\[tbl_${i % 300}_x\\] pair.\n`;
  const w = world(t, { files });
  run(w, ['tbl_7_x']);                                           // warm the file cache
  const t0 = performance.now();
  const r = run(w, ['tbl_7_x', 'tbl_77_x', 'no_such_thing_here', 'label 7', 'synthetic page 12']);
  const ms = performance.now() - t0;
  console.log(`    docs lookup (synthetic, 2000 pages, 5 terms) on ${process.platform}/${process.arch} node ${process.versions.node}: ${ms.toFixed(0)} ms`);
  assert.ok(ms < 1000, `${ms.toFixed(0)} ms for five terms`);
  assert.equal(r.code, LOOKUP_EXIT.notPrinted);
});

// ---- the rules the index and the lookup share (label-rules.mjs)

test('ARC-09-C268 — words: underscores and escapes are separators, plurals are folded, stop words leave a title\'s content words', () => {
  assert.deepEqual(wordsOf('Requested_Item'), ['requested', 'item']);
  assert.deepEqual(wordsOf('sc\\_req\\_item'), ['sc', 'req', 'item']);
  assert.equal(normalisePhrase('Decision Tables'), 'decision table');
  assert.equal(normalisePhrase("User's  groups"), 'user group');
  assert.equal(singular('status'), 'status', 'us stays');
  assert.equal(singular('business'), 'business', 'ss stays');
  assert.equal(singular('policies'), 'policy');
  assert.deepEqual(contentWords('How to configure the data policy for a table'), ['configure', 'data', 'policy', 'table']);
});

test('ARC-09-C268 — label pairs: the words before a bracketed name, up to a stop word; links and glued brackets are none', () => {
  const keys = (raw) => labelPairsOf(raw).map((p) => `${p.key}=${p.name}`);
  assert.deepEqual(keys('Requested Item \\[sc\\_req\\_item\\] table'), ['requested item=sc_req_item']);
  assert.deepEqual(keys('in the Requested Item \\[sc\\_req\\_item\\] table'), ['requested item=sc_req_item'], 'the stops at "the"');
  assert.deepEqual(keys('Add Requested Item [sc_req_item]'), ['add requested item=sc_req_item', 'requested item=sc_req_item'], 'the whole run and the two-word suffix');
  assert.deepEqual(keys('such as Requested Item \\[sc\\_req\\_item\\], Incident \\[incident\\]'), ['requested item=sc_req_item', 'incident=incident']);
  assert.deepEqual(keys('Decision Tables \\[sys\\_decision\\]'), ['decision table=sys_decision'], 'a capitalised prose word is part of the label');
  assert.deepEqual(keys('the table \\[sys\\_user\\]'), [], 'a lowercase prose word ends the run: no label');
  assert.deepEqual(keys('records[sys_user] and array[i]'), [], 'a bracket glued to a word is no pair');
  assert.deepEqual(keys('See [sys_user](https://example.invalid/x) for more'), [], 'a link is no pair');
  assert.deepEqual(keys('Short \\[x1\\] and Name \\[abc\\]'), [], 'a one-word name no label says is no pair');
  assert.deepEqual(keys('Incident \\[incident\\]'), ['incident=incident'], 'a one-word name its label says is');
});

test('ARC-09-C268 — a title is the front matter\'s, else the first heading, one line', () => {
  assert.equal(titleOf('---\ntitle: Data policy rules\nlocale: en-US\n---\n\nBody'), 'Data policy rules');
  assert.equal(titleOf('---\r\ntitle: "Quoted title"\r\n---\r\n'), 'Quoted title');
  assert.equal(titleOf('# A heading\n\nBody'), 'A heading');
  assert.equal(titleOf('no title at all'), '');
});

test('ARC-09-C268 — the synonym page: each term of a group reaches the others', () => {
  const g = parseSynonyms(FILES['markdown/vocabulary/sn-docs-synonym-terms-enus.md']);
  assert.deepEqual([...g.get('ritm')].sort(), ['req item', 'requested item']);
  assert.deepEqual([...g.get('requested item')].sort(), ['req item', 'ritm']);
  assert.ok(g.get('ci').has('configuration item'));
  assert.equal(g.get('nothing'), undefined);
});

test('ARC-09-C268 — a term is classified: a name, a dotted name, a plain word or a phrase', () => {
  assert.deepEqual(classify('sc\\_req\\_item'), { raw: 'sc\\_req\\_item', kind: 'name', key: 'sc_req_item' });
  assert.equal(classify('`Glide.UI.escape_text`').kind, 'dotted');
  assert.equal(classify('incident').kind, 'word');
  assert.equal(classify('requested item').kind, 'phrase');
  assert.equal(classify('requested item').key, 'requested item');
});

// ---- the index the lookup reads

test('ARC-09-C268 — the index holds the label pairs and the titles, and an index without them does not load', (t) => {
  const w = world(t);
  const dir = corpusNamesDir(w.root, PIN);
  const idx = loadNamesIndex(dir, { pin: PIN });
  assert.ok(idx.wordsOk);
  assert.deepEqual(idx.labelNames('requested item').map((p) => [p.name, p.count]), [['sc_req_item', 2]]);
  assert.deepEqual(idx.labelsOfName('sc_req_item').map((p) => p.key), ['requested item']);
  assert.ok(idx.titles().includes('Requested Item table'));
  assert.equal(idx.meta.v, 2);
  assert.ok(Number.isInteger(idx.meta.labels) && idx.meta.labels > 0);
  // a build that lacks a file is not an index
  for (const f of ['labels.tsv', 'titles.txt']) {
    const w2 = world(t);
    rmSync(join(corpusNamesDir(w2.root, PIN), f));
    assert.equal(loadNamesIndex(corpusNamesDir(w2.root, PIN), { pin: PIN }), null, `without ${f}`);
  }
  // a titles file that is short reads as empty, and says so
  const w3 = world(t);
  writeFileSync(join(corpusNamesDir(w3.root, PIN), 'titles.txt'), 'only one\n');
  const short = loadNamesIndex(corpusNamesDir(w3.root, PIN), { pin: PIN });
  assert.ok(short, 'the names still load');
  assert.equal(short.wordsOk, false);
});
