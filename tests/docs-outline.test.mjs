// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { OUTLINE_LINES, parseIndex, runOutline } from '../tools/snowarch/lib/docs/outline.mjs';
import { runDocs } from '../tools/snowarch/lib/docs/cli.mjs';
import { spellings } from '../tools/snowarch/lib/text.mjs';
import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';

/**
 * ARC-09-C284 — `docs outline`: the corpus's own hierarchy, a level at a time.
 *
 * Every area's index.md lists the whole area as a nested list, and the larger of those files are 0.4 to 2.3 MB (17 of the 53 at the
 * 96d3212 pin are over 0.4 MB, the median is 199 KB): too big to read, and the pages a question needs sit three to five levels down.
 * The command prints the hierarchy below a start node, a few levels at a time, one
 * line per node, bounded, so that the reader goes down level by level instead of reading the index.
 */
const SPELL = spellings();
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const URL_OF = (p) => `https://raw.githubusercontent.com/ServiceNow/ServiceNowDocs/australia/${p}`;

/** `[[title, path, children?, description?]]` as the nested list an index.md carries: `- [Title](url) -- description`, two spaces a level. */
function list(nodes, depth = 0) {
  return nodes.flatMap(([title, path, children = [], description = 'About it.']) => [
    `${'  '.repeat(depth)}- [${title}](${URL_OF(path)}) -- ${description}`, ...list(children, depth + 1)]);
}
const indexOf = (title, nodes) => `---\ntitle: ${title}\nlocale: en-US\nrelease: australia\ndoc_type: toc\n---\n\n# ${title}\n\n${list(nodes).join('\n')}\n`;

/** A root with a corpus whose areas are `{ name: nodes }`, and `extra` files under markdown/ (`{ 'alpha/guides/index.md': text }`). */
function corpus(t, areas, extra = {}) {
  const root = tempDir('snowarch-c284-outline-', t);
  const put = (rel, text) => { mkdirSync(dirname(join(root, 'vendor', 'ServiceNowDocs', 'markdown', rel)), { recursive: true }); writeFileSync(join(root, 'vendor', 'ServiceNowDocs', 'markdown', rel), text); };
  for (const [name, nodes] of Object.entries(areas)) put(`${name}/index.md`, indexOf(`Brazil ${name}`, nodes));
  for (const [rel, text] of Object.entries(extra)) put(rel, text);
  return root;
}
/** One call: the exit code, the lines printed on stdout, the lines on stderr, and both as one text. */
function outline(root, ...argv) {
  const lines = [];
  const errors = [];
  const code = runOutline({ argv, root, spell: SPELL, out: (line) => lines.push(line), err: (line) => errors.push(line) });
  return { code, lines, errors, text: [...lines, ...errors].join('\n') };
}

const ALPHA = [
  ['Alpha overview', 'markdown/alpha/overview.md', [
    ['Install', 'markdown/alpha/install.md', [
      ['Install on Linux', 'markdown/alpha/install-linux.md', [['Linux prerequisites', 'markdown/alpha/linux-prereqs.md']]],
      ['Install on Windows', 'markdown/alpha/install-windows.md'],
    ]],
    ['Configure', 'markdown/alpha/configure.md'],
  ]],
  ['Alpha reference', 'markdown/alpha/reference.md'],
];

test('ARC-09-C284 — an area prints two levels by default, one line per node: indent, title, page path, and what is below it', (t) => {
  const r = outline(corpus(t, { alpha: ALPHA }), 'alpha');
  assert.equal(r.code, 0, r.text);
  assert.deepEqual(r.lines, [
    'alpha — markdown/alpha/index.md (+7 below)',
    '  Alpha overview — markdown/alpha/overview.md (+5 below)',
    '    Install — markdown/alpha/install.md (+3 below)',
    '    Configure — markdown/alpha/configure.md',
    '  Alpha reference — markdown/alpha/reference.md',
  ]);
});

test('ARC-09-C284 — --depth says how many levels: 1 is the first level, 3 reaches the grandchildren\'s children, and the counts do not change', (t) => {
  const root = corpus(t, { alpha: ALPHA });
  assert.deepEqual(outline(root, 'alpha', '--depth', '1').lines, [
    'alpha — markdown/alpha/index.md (+7 below)',
    '  Alpha overview — markdown/alpha/overview.md (+5 below)',
    '  Alpha reference — markdown/alpha/reference.md',
  ]);
  const three = outline(root, 'alpha', '--depth', '3').lines;
  assert.ok(three.includes('      Install on Linux — markdown/alpha/install-linux.md (+1 below)'), three.join('\n'));
  assert.ok(three.includes('      Install on Windows — markdown/alpha/install-windows.md'), three.join('\n'));
  assert.ok(!three.some((l) => l.includes('Linux prerequisites')), 'a fourth level was printed at depth 3');
});

test('ARC-09-C284 — --under starts at a node found by its page path or by its title, and prints below it', (t) => {
  const root = corpus(t, { alpha: ALPHA });
  const want = [
    'Install — markdown/alpha/install.md (+3 below)',
    '  Install on Linux — markdown/alpha/install-linux.md (+1 below)',
    '    Linux prerequisites — markdown/alpha/linux-prereqs.md',
    '  Install on Windows — markdown/alpha/install-windows.md',
  ];
  assert.deepEqual(outline(root, 'alpha', '--under', 'markdown/alpha/install.md').lines, want);
  assert.deepEqual(outline(root, 'alpha', '--under', 'Install').lines, want, 'a title is found without regard to case');
  assert.deepEqual(outline(root, 'alpha', '--under', 'install').lines, want);
  // A page path alone starts at that page's node, as `--under` does inside its area.
  assert.deepEqual(outline(root, 'markdown/alpha/install.md').lines, want);
});

test('ARC-09-C284 — a title that names two nodes is refused with their paths, and a page listed twice is told apart by its number', (t) => {
  const root = corpus(t, { alpha: [
    ['Overview', 'markdown/alpha/a.md', [['Child of a', 'markdown/alpha/a1.md']]],
    ['Overview', 'markdown/alpha/b.md'],
    ['Roles', 'markdown/alpha/roles.md', [['Admin', 'markdown/alpha/roles.md', [['Admin detail', 'markdown/alpha/detail.md']]]]],
  ] });
  const ambiguous = outline(root, 'alpha', '--under', 'Overview');
  assert.equal(ambiguous.code, 2);
  assert.match(ambiguous.text, /2 nodes are titled "Overview"/);
  assert.ok(ambiguous.text.includes('markdown/alpha/a.md') && ambiguous.text.includes('markdown/alpha/b.md'), ambiguous.text);
  assert.deepEqual(outline(root, 'alpha', '--under', 'markdown/alpha/a.md').lines.slice(0, 2),
    ['Overview — markdown/alpha/a.md (+1 below)', '  Child of a — markdown/alpha/a1.md']);
  // markdown/alpha/roles.md is a node twice (the page is linked from itself, as roles pages are): the first by default, the second by number.
  assert.match(outline(root, 'alpha', '--under', 'markdown/alpha/roles.md').text, /also appears at 1 other place: markdown\/alpha\/roles\.md#2/);
  assert.deepEqual(outline(root, 'alpha', '--under', 'markdown/alpha/roles.md#2').lines.slice(0, 2),
    ['Admin — markdown/alpha/roles.md (+1 below)', '  Admin detail — markdown/alpha/detail.md']);
});

test('ARC-09-C284 — a call that would print more than the bound prints the first level only, with the counts, and says so', (t) => {
  const many = Array.from({ length: 70 }, (_, i) => [`Topic ${i + 1}`, `markdown/big/t${i + 1}.md`, [
    [`Task ${i + 1}a`, `markdown/big/t${i + 1}a.md`], [`Task ${i + 1}b`, `markdown/big/t${i + 1}b.md`]]]);
  const root = corpus(t, { big: [['Big overview', 'markdown/big/overview.md', many]], small: ALPHA });
  const r = outline(root, 'big', '--under', 'Big overview');
  assert.equal(r.code, 0, r.text);
  // 1 header + 70 topics at depth 1; depth 2 would be 1 + 70 + 140 = 211 lines, over the bound.
  assert.ok(211 > OUTLINE_LINES);
  assert.equal(r.lines.length, 1 + 70 + 1, 'header, the first level, and the one line that says why');
  assert.match(r.lines.at(-1), /^\(depth 2 would print 211 lines, over the bound of 120: this is the first level only; go down with --under <path or title>\)$/);
  assert.ok(r.lines[1].endsWith('(+2 below)'), r.lines[1]);
  // The same node at depth 1 asked for outright is the same lines, and no note: the bound only cuts a deeper call down.
  assert.deepEqual(outline(root, 'big', '--under', 'Big overview', '--depth', '1').lines, r.lines.slice(0, -1));
  // A call that fits is not cut, and says nothing of a bound.
  const fits = outline(root, 'small');
  assert.equal(fits.code, 0, fits.text);
  assert.ok(!fits.text.includes('would print'), fits.text);
});

test('ARC-09-C284 — a page listed only in a sub-folder\'s index is reached through that folder\'s node', (t) => {
  const root = corpus(t, { alpha: [
    ['Alpha overview', 'markdown/alpha/overview.md', [['Guides', 'markdown/alpha/guides/index.md']]],
  ] }, {
    'alpha/guides/index.md': indexOf('Guides', [['Guide one', 'markdown/alpha/guides/one.md', [['Guide one, step two', 'markdown/alpha/guides/one-two.md']]], ['Guide two', 'markdown/alpha/guides/two.md']]),
  });
  const via = outline(root, 'alpha', '--depth', '4').lines;
  assert.ok(via.includes('      Guide one — markdown/alpha/guides/one.md (+1 below)'), via.join('\n'));
  assert.equal(outline(root, 'alpha', '--under', 'Guides').lines[0], 'Guides — markdown/alpha/guides/index.md (+3 below)');
  // ...and by the page's own path, which the area's index never lists.
  assert.deepEqual(outline(root, 'markdown/alpha/guides/one-two.md').lines, ['Guide one, step two — markdown/alpha/guides/one-two.md']);
});

test('ARC-09-C284 — a missing area, a page that is in no index and a bad flag are each refused, with a reason and no output on stdout', (t) => {
  const root = corpus(t, { alpha: ALPHA, alphabet: ALPHA });
  const area = outline(root, 'alph');
  assert.equal(area.code, 2);
  assert.deepEqual(area.lines, [], 'a refusal prints nothing on stdout');
  assert.match(area.text, /no area named "alph"/);
  assert.match(area.text, /alpha, alphabet/, 'the nearest areas are named');
  const page = outline(root, 'markdown/alpha/ghost.md');
  assert.equal(page.code, 2);
  assert.match(page.text, /markdown\/alpha\/ghost\.md is not in alpha's index/);
  const under = outline(root, 'alpha', '--under', 'Nothing here');
  assert.equal(under.code, 2);
  assert.match(under.text, /no node titled "Nothing here" in alpha/);
  for (const bad of [['alpha', '--depth', 'abc'], ['alpha', '--depth', '0'], ['alpha', '--frobnicate'], []]) {
    const r = outline(root, ...bad);
    assert.equal(r.code, 2, `${bad.join(' ')}: ${r.text}`);
    assert.match(r.text, /usage: .*docs outline/, bad.join(' '));
  }
});

test('ARC-09-C284 — a corpus that is not there says so, and names the launcher the reader typed', (t) => {
  const none = tempDir('snowarch-c284-nocorpus-', t);
  const r = outline(none, 'alpha');
  assert.equal(r.code, 3);
  assert.ok(r.text.includes(SPELL.cli), `the remedy names the launcher the reader typed: ${r.text}`);
  assert.match(r.text, /corpus missing/);
});

test('ARC-09-C284 — paths are read the way a citation writes them, on every platform: forward or back slashes, with or without the corpus prefix', (t) => {
  const root = corpus(t, { alpha: ALPHA });
  const want = outline(root, 'markdown/alpha/install.md').lines;
  assert.ok(want.length > 1);
  assert.deepEqual(outline(root, 'markdown\\alpha\\install.md').lines, want);
  assert.deepEqual(outline(root, 'vendor/ServiceNowDocs/markdown/alpha/install.md').lines, want);
  assert.deepEqual(outline(root, 'ServiceNowDocs/markdown/alpha/install.md').lines, want);
  assert.deepEqual(outline(root, 'markdown/alpha/').lines, outline(root, 'alpha').lines);
  assert.deepEqual(outline(root, 'alpha', '--under', 'markdown\\alpha\\install.md').lines, want);
});

test('ARC-09-C284 — it reads the shapes the real indexes have: brackets and zero-width spaces in a title, a line separator in a description', () => {
  const text = [
    '---', 'title: x', '---', '', '# x', '',
    `- [Case Admin  [sn_x.admin\u200b]](${URL_OF('markdown/csm/roles.md')}) -- Uses roles to provide access\u2028and more.`,
    `  - [Child](${URL_OF('markdown/csm/child.md')})`,
    'not a list line',
  ].join('\n');
  const [top, ...rest] = parseIndex(text);
  assert.equal(rest.length, 0);
  assert.equal(top.title, 'Case Admin [sn_x.admin]', 'whitespace is collapsed and a zero-width character is not printed');
  assert.equal(top.path, 'markdown/csm/roles.md');
  assert.deepEqual(top.children.map((c) => [c.title, c.path]), [['Child', 'markdown/csm/child.md']]);
});

test('ARC-09-C284 — it is read-only and deterministic: the same call prints the same lines and writes nothing', (t) => {
  const root = corpus(t, { alpha: ALPHA });
  const listing = () => readdirSync(join(root, 'vendor', 'ServiceNowDocs', 'markdown', 'alpha')).sort().join(',');
  const before = listing();
  const first = outline(root, 'alpha', '--depth', '3').lines;
  assert.deepEqual(outline(root, 'alpha', '--depth', '3').lines, first);
  assert.equal(listing(), before);
  assert.ok(!existsSync(join(root, 'bump.json')));
});

test('ARC-09-C284 — `docs outline` is a docs sub-command: with no argument it prints its usage', () => {
  const printed = [];
  const original = console.error;
  console.error = (...a) => printed.push(a.join(' '));
  let code;
  try { code = runDocs(['outline'], { spell: SPELL }); } finally { console.error = original; }
  assert.equal(code, 2);
  assert.match(printed.join('\n'), /docs outline/);
  assert.ok(existsSync(join(REPO, 'tools', 'snowarch', 'lib', 'docs', 'outline.mjs')));
});

test('ARC-09-C284 — a page path written without the corpus folder is a page and not the area with its tail dropped, and the header\'s own path is the area', (t) => {
  const root = corpus(t, { alpha: ALPHA });
  const want = outline(root, 'markdown/alpha/install.md').lines;
  assert.ok(want.length > 1);
  // `alpha/install.md` is the page markdown/alpha/install.md, as it is when the folder is spelled out; the first reading of it was the area
  // `alpha` with the `/install.md` thrown away, which printed a whole area for a page and said nothing.
  assert.deepEqual(outline(root, 'alpha/install.md').lines, want);
  assert.deepEqual(outline(root, 'alpha\\install.md').lines, want);
  // The first line of every call names the node it starts at, and the area's own line is the area: pasting it back is the area.
  assert.deepEqual(outline(root, 'markdown/alpha/index.md').lines, outline(root, 'alpha').lines);
  assert.deepEqual(outline(root, 'alpha/index.md').lines, outline(root, 'alpha').lines);
  // A tail that is not a page of the area is refused, never dropped.
  const ghost = outline(root, 'alpha/ghost.md');
  assert.equal(ghost.code, 2);
  assert.deepEqual(ghost.lines, []);
  assert.match(ghost.text, /markdown\/alpha\/ghost\.md is not in alpha's index/);
});
