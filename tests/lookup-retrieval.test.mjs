// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C268 (phase A) — the offline retrieval check (scripts/validation/lookup-retrieval.mjs) on a corpus small enough to count by hand.
// The check itself runs on the real corpus, by hand, and prints numbers; this holds that the cases it builds and the greps it
// compares are what its header says they are.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';
import { buildNamesIndex, writeNamesIndex } from '../tools/snowarch/lib/docs/names-index-build.mjs';
import { loadNamesIndex } from '../tools/snowarch/lib/docs/names-index.mjs';
import { contentWords, parseSynonyms } from '../tools/snowarch/lib/docs/label-rules.mjs';
import { corpusNamesDir } from '../tools/snowarch/lib/local-paths.mjs';
import { classL, classN, classS, classT, describe, grep, loadTexts, pick, seeded, unescapedNames } from '../scripts/validation/lookup-retrieval.mjs';

const PIN = 'c'.repeat(40);
const front = (title) => `---\ntitle: ${title}\nlocale: en-US\n---\n\n`;
const SYN = ['# Synonym & Alias Reference', '', '| Canonical Term | Synonyms |', '|---|---|',
  '| requested item | ritm \\| req item |', '| configuration item | ci \\| cmdb ci |', ''].join('\n');
const FILES = {
  'markdown/itsm/requested-item.md': `${front('Requested Item table')}The Requested Item \\[sc\\_req\\_item\\] table holds one record per ordered item. Its field \`cat\\_item\` is the catalog item.\n`,
  'markdown/itsm/catalog-task.md': `${front('Catalog Task')}The Catalog Task \\[sc\\_task\\] table records the work for a requested item in the Requested Item \\[sc\\_req\\_item\\] table.\n`,
  'markdown/itsm/incident.md': `${front('Incident management')}Incident \\[incident\\] records carry the field incident.assigned\\_to and the field assigned\\_to.\n`,
  'markdown/itsm/flow-note.md': `${front('Flow note')}A flow pill reads fd_data.subflow_inputs.requested_item once.\n`,
  'markdown/dev/script.md': `${front('Scripting the catalog')}var gr = new GlideRecord('sc_req_item');\n`,
  'markdown/platform/ci-overview.md': `${front('Configuration item overview')}The Configuration Item \\[cmdb\\_ci\\] table is the root of the CMDB.\n`,
  'markdown/vocabulary/sn-docs-synonym-terms-enus.md': SYN,
};

function world(t) {
  const root = tempDir('retrieval-', t);
  const corpus = join(root, 'vendor', 'ServiceNowDocs');
  for (const [p, text] of Object.entries(FILES)) {
    const abs = join(corpus, ...p.split('/'));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, text);
  }
  writeNamesIndex(corpusNamesDir(root, PIN), buildNamesIndex({ corpus, pin: PIN, tree: Object.keys(FILES).sort() }));
  const idx = loadNamesIndex(corpusNamesDir(root, PIN), { pin: PIN });
  const texts = loadTexts(corpus, idx);
  const page = (p) => readFileSync(join(corpus, ...p.split('/')), 'utf8');
  return { idx, texts, page, synonyms: parseSynonyms(SYN) };
}

test('ARC-09-C268 retrieval — a seed picks the same cases, and a pick is a sample without repeats', () => {
  const a = pick([...Array(50).keys()], 10, seeded(7));
  const b = pick([...Array(50).keys()], 10, seeded(7));
  assert.deepEqual(a, b);
  assert.equal(new Set(a).size, 10);
  assert.notDeepEqual(a, pick([...Array(50).keys()], 10, seeded(8)));
  assert.equal(pick([1, 2, 3], 10, seeded(1)).length, 3, 'a sample larger than the population is the population');
});

test('ARC-09-C268 retrieval — grep is a fixed string, or a whole word; the escaped text and the unescaped text differ', (t) => {
  const { texts, idx } = world(t);
  const ids = (needle, texts_, opt) => grep(texts_, needle, opt).map((i) => idx.pagePath(i).replace('markdown/', ''));
  assert.deepEqual(ids('sc_req_item', texts.raw), ['dev/script.md'], 'a grep that does not unescape sees only the unescaped print');
  assert.deepEqual(ids('sc_req_item', texts.unescaped), ['dev/script.md', 'itsm/catalog-task.md', 'itsm/requested-item.md']);
  assert.equal(ids('item', texts.unescaped, { word: true }).length, 4, 'item as a word: four pages say it, and sc_req_item is not one of the words');
  assert.deepEqual(ids('ritm', texts.unescaped, { word: true }), ['vocabulary/sn-docs-synonym-terms-enus.md'], 'the synonym page names the synonym, the other pages do not');
  const unesc = unescapedNames(texts.raw);
  assert.equal(unesc.get('sc_req_item'), 1);
  assert.equal(unesc.get('cat_item'), undefined, 'printed only escaped');
});

test('ARC-09-C268 retrieval — class N: the names a grep that does not escape cannot see', (t) => {
  const { idx, texts } = world(t);
  const n = classN(idx, texts, seeded(1), 0);
  assert.equal(n.cases, 8, 'assigned_to cat_item cmdb_ci fd_data requested_item sc_req_item sc_task subflow_inputs');
  assert.equal(n.plainGrepFinds, 4, 'sc_req_item, fd_data, subflow_inputs and requested_item are printed with a literal underscore');
  assert.equal(n.escapedOnly, 4, 'assigned_to, cat_item, cmdb_ci and sc_task only as sc\\_task');
  assert.equal(n.escapeSafeGrepFinds + 0, n.cases);
  assert.equal(n.escapedOnlyShare, '50.0%');
});

test('ARC-09-C268 retrieval — class L: a label as typed, its snake_case guess, and the lookup', (t) => {
  const { idx, texts, page, synonyms } = world(t);
  const l = classL(idx, texts, page, seeded(1), 1000, synonyms);
  assert.equal(l.pairs, 4, 'requested item, catalog task, incident, configuration item');
  assert.equal(l.eligible, 3, '"incident" is one word on one page: not eligible');
  assert.equal(l.cases, 3);
  assert.equal(l.pairsOn2plusPages, 1, 'only "requested item" is printed on two pages');
  assert.equal(l.guessIsTheName, 0, 'requested_item is not sc_req_item');
  assert.equal(l.phraseGrep25, 3, 'the label as typed is in the page that prints the pair');
  assert.equal(l.snakeGrep25, 0, 'the snake_case guess names no page that prints the construct');
  assert.equal(l.lookupNameInTop3, 3);
  assert.equal(l.lookupPageShown, 3);
});

test('ARC-09-C268 retrieval — class S: the corpus\'s own synonyms, a page titled for the canonical term', (t) => {
  const { idx, texts, page, synonyms } = world(t);
  const s = classS(idx, texts, page, SYN, contentWords, synonyms);
  assert.equal(s.cases, 4, 'ritm and req item for requested item; ci and cmdb ci for configuration item');
  assert.equal(s.grepWordAny, 0, 'no page says "ritm" or "ci" but the synonym page');
  assert.equal(s.lookupPageShown, 4);
});

test('ARC-09-C268 retrieval — class T: a title with one content word dropped', (t) => {
  const { idx, texts, page, synonyms } = world(t);
  const tt = classT(idx, texts, page, seeded(1), 1000, synonyms);
  assert.equal(tt.eligible, 3, 'Requested Item table, Configuration item overview and the synonym page\'s own title');
  assert.equal(tt.cases, 3);
  assert.equal(tt.lookupPageShown, 3);
  assert.ok(tt.phraseGrepAny <= tt.cases && tt.wordsAnywhere25 <= tt.cases);
});

test('ARC-09-C268 retrieval — the report names every class and prints a number for each line', (t) => {
  const { idx, texts, page, synonyms } = world(t);
  const res = { pages: idx.pageCount, names: idx.nameCount, coverage: idx.coverage, pin: 'cccccccccccc', seed: 1, sample: 1000,
    N: classN(idx, texts, seeded(1), 0), L: classL(idx, texts, page, seeded(1), 1000, synonyms),
    S: classS(idx, texts, page, SYN, contentWords, synonyms), T: classT(idx, texts, page, seeded(1), 1000, synonyms) };
  const text = describe(res).join('\n');
  for (const head of ['N  names as typed', 'L  labels for names', 'S  synonyms from the corpus', 'T  a title with one content word dropped']) assert.ok(text.includes(head), head);
  assert.match(text, /names printed ONLY with escaped underscores \(invisible to it\)\s+4 \/ 8\s+50\.0%/);
  assert.match(text, /lookup: the name is among its first 3 names for the label\s+3 \/ 3\s+100\.0%/);
});
