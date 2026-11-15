// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { loadArea, nodesOf } from '../tools/snowarch/lib/docs/outline.mjs';
import { TARGET, locate, main, summarise, walkTo } from '../scripts/validation/outline-walk.mjs';
import { initFixtureRepo } from '../tools/snowarch/tests/helpers/fixture-git.mjs';
import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';

/**
 * ARC-09-C284 — the walk: how many `docs outline` calls, and how many printed lines, it takes to reach a page from its area's top.
 *
 * Each call is the command's own renderer, so a line counted here is a line the command prints. The reader follows the page's own
 * branch: after a call that does not print the page, the next is `--under` the deepest ancestor that call printed.
 */
const URL_OF = (p) => `https://raw.githubusercontent.com/ServiceNow/ServiceNowDocs/australia/${p}`;
const list = (nodes, depth = 0) => nodes.flatMap(([title, path, children = []]) => [`${'  '.repeat(depth)}- [${title}](${URL_OF(path)}) -- About it.`, ...list(children, depth + 1)]);
const indexText = (nodes) => `---\ntitle: x\n---\n\n# x\n\n${list(nodes).join('\n')}\n`;
const reader = (files) => (rel) => files[rel] ?? null;
const treeOf = (nodes, area = 'alpha') => loadArea({ read: reader({ [`${area}/index.md`]: indexText(nodes) }), area });
const find = (tree, path) => [...nodesOf(tree.root)].find((n) => n.path === path);

const DEEP = [['Alpha overview', 'markdown/alpha/overview.md', [
  ['Install', 'markdown/alpha/install.md', [
    ['Linux', 'markdown/alpha/linux.md', [['Prerequisites', 'markdown/alpha/prereqs.md', [['Deep page', 'markdown/alpha/deep.md']]]]],
  ]],
]]];

function corpus(t, areas) {
  const root = tempDir('snowarch-c284-walk-', t);
  for (const [area, nodes] of Object.entries(areas)) {
    mkdirSync(join(root, 'markdown', area), { recursive: true });
    writeFileSync(join(root, 'markdown', area, 'index.md'), indexText(nodes));
  }
  return root;
}
const run = (...argv) => { const out = []; const err = []; const code = main(argv, { out: (l) => out.push(l), err: (l) => err.push(l) }); return { code, out, err, text: out.join('\n') }; };

test('ARC-09-C284 — a page two levels down is reached by the first call, one at five levels by three, and each call is counted in lines', () => {
  const tree = treeOf(DEEP);
  const near = walkTo(tree, find(tree, 'markdown/alpha/install.md'));
  assert.deepEqual(near, { calls: [{ under: null, lines: 3 }], reached: true });
  const deep = walkTo(tree, find(tree, 'markdown/alpha/deep.md'));
  assert.equal(deep.reached, true);
  assert.deepEqual(deep.calls, [
    { under: null, lines: 3 },                             // the area, its overview and Install
    { under: 'markdown/alpha/install.md', lines: 3 },       // Install, Linux and Prerequisites
    { under: 'markdown/alpha/prereqs.md', lines: 2 },       // Prerequisites and Deep page
  ]);
});

test('ARC-09-C284 — a branch a call cuts off is not followed past what the call printed: the walk says it did not reach the page', () => {
  const wide = Array.from({ length: 250 }, (_, i) => [`Child ${i + 1}`, `markdown/wide/c${i + 1}.md`]);
  const tree = treeOf([['Wide overview', 'markdown/wide/overview.md', wide]], 'wide');
  const hidden = walkTo(tree, find(tree, 'markdown/wide/c230.md'));
  assert.equal(hidden.reached, false, 'a child past the cut was reached');
  assert.ok(hidden.calls.length >= 1);
  const shown = walkTo(tree, find(tree, 'markdown/wide/c12.md'));
  assert.equal(shown.reached, true);
});

test('ARC-09-C284 — the figures are the median and the maximum over the pages reached, and how many are within the target', () => {
  const calls = (...lines) => ({ reached: true, calls: lines.map((n) => ({ under: null, lines: n })) });
  const s = summarise([calls(10), calls(10, 20), calls(10, 20, 30), { reached: false, calls: [{ under: null, lines: 5 }] }]);
  assert.deepEqual(s.calls, { median: 2, max: 3 });
  assert.deepEqual(s.lines, { median: 30, max: 60 });
  assert.equal(s.pages, 4);
  assert.equal(s.reached, 3);
  assert.equal(s.withinTarget, 3);
  const over = summarise([calls(10, 10, 10, 10, 10), calls(...Array(2).fill(200))]);
  assert.equal(over.withinTarget, 0, 'five calls, and 400 lines, are each outside the target');
  assert.equal(TARGET.calls, 4);
  assert.equal(TARGET.lines, 300);
  assert.deepEqual(summarise([{ reached: false, calls: [] }]).calls, null);
});

test('ARC-09-C284 — a page not at its path is found by its file name, in its area and then in the others, and one that is nowhere is absent', () => {
  const trees = {
    alpha: treeOf([['Overview', 'markdown/alpha/overview.md', [['Moved here', 'markdown/alpha/sub/moved.md']]]]),
    beta: treeOf([['Overview', 'markdown/beta/overview.md', [['Wandered', 'markdown/beta/wandered.md']]]], 'beta'),
  };
  const load = (a) => trees[a] ?? null;
  const areas = ['alpha', 'beta'];
  const same = locate({ area: 'alpha', path: 'markdown/alpha/moved.md', load, areas });
  assert.equal(same.moved, 'markdown/alpha/sub/moved.md');
  const other = locate({ area: 'alpha', path: 'markdown/alpha/wandered.md', load, areas });
  assert.equal(other.moved, 'markdown/beta/wandered.md');
  assert.equal(other.tree, trees.beta);
  const exact = locate({ area: 'alpha', path: 'markdown/alpha/overview.md', load, areas });
  assert.equal(exact.moved, null);
  assert.ok(exact.node);
  const gone = locate({ area: 'alpha', path: 'markdown/gone/gone.md', load, areas });
  assert.equal(gone.node, null);
});

test('ARC-09-C284 — the command prints a line a page and the summary, and says which pages moved and which are absent', (t) => {
  const root = corpus(t, { alpha: [['Overview', 'markdown/alpha/overview.md', [['Install', 'markdown/alpha/install.md', [['Linux', 'markdown/alpha/linux.md']]]]]] });
  const r = run('--corpus', root, 'markdown/alpha/linux.md', 'markdown/alpha/install.md', 'markdown/alpha/vanished.md');
  assert.equal(r.code, 0, r.err.join('\n'));
  // Linux is three levels down: the area's call prints two, so a second call under Install prints it.
  assert.ok(r.out.includes('markdown/alpha/linux.md · reached in 2 calls, lines per call 3 + 2 = 5'), r.text);
  assert.ok(r.out.includes('markdown/alpha/install.md · reached in 1 call, lines per call 3 = 3'), r.text);
  assert.ok(r.out.includes('markdown/alpha/vanished.md · absent at this pin'), r.text);
  assert.ok(r.out.includes('pages 3, reached 2 (1 absent at this pin)'), r.text);
  assert.ok(r.out.includes('calls: median 1.5, max 2 · lines: median 4, max 5 · within 4 calls and 300 lines: 2 of 2'), r.text);
  const none = run('--corpus', join(root, 'nowhere'), 'markdown/alpha/linux.md');
  assert.equal(none.code, 3);
  assert.match(none.err.join('\n'), /no corpus at/);
});

test('ARC-09-C284 — --pin reads the index files of a commit, so one checkout answers for the old corpus and the new', (t) => {
  const dir = tempDir('snowarch-c284-pin-', t);
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
  initFixtureRepo((args) => git(...args), dir, ['-q', '-b', 'main']);
  const put = (rel, text) => { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), text); };
  put('markdown/alpha/index.md', indexText([['Overview', 'markdown/alpha/overview.md', [['Old page', 'markdown/alpha/old-name.md']]]]));
  git('add', '-A');
  git('-c', 'user.email=f@example.invalid', '-c', 'user.name=f', 'commit', '-qm', 'before');
  const before = git('rev-parse', 'HEAD').trim();
  put('markdown/alpha/index.md', indexText([['Overview', 'markdown/alpha/overview.md', [['Section', 'markdown/alpha/section.md', [['Old page', 'markdown/alpha/sub/old-name.md']]]]]]));
  git('add', '-A');
  git('-c', 'user.email=f@example.invalid', '-c', 'user.name=f', 'commit', '-qm', 'after');

  const old = run('--corpus', dir, '--pin', before, 'markdown/alpha/old-name.md');
  assert.ok(old.out.some((l) => l.startsWith('markdown/alpha/old-name.md · reached in 1 call')), old.text);
  assert.ok(!old.text.includes('moved to'), 'it is where it was at that pin');
  const now = run('--corpus', dir, 'markdown/alpha/old-name.md');
  assert.ok(now.out.some((l) => l.includes('moved to markdown/alpha/sub/old-name.md')), now.text);
  assert.ok(now.out[0].includes('the working tree'), now.text);
  assert.ok(old.out[0].includes(`pin ${before}`), old.text);
});

test('ARC-09-C284 — --areas prints, for every area, the lines of its first call and the largest single call over its nodes', (t) => {
  const kids = Array.from({ length: 30 }, (_, i) => [`Topic ${i + 1}`, `markdown/big/t${i + 1}.md`, [[`Task ${i + 1}`, `markdown/big/k${i + 1}.md`]]]);
  const root = corpus(t, { small: [['Only', 'markdown/small/only.md']], big: [['Big overview', 'markdown/big/overview.md', kids]] });
  const r = run('--corpus', root, '--areas');
  assert.equal(r.code, 0, r.err.join('\n'));
  assert.ok(r.out.includes('small · 1 · 2 · 2 ((the top))'), r.text);
  // big: the area's first call is the header, the overview and its 30 topics (32 lines); the overview's own call at depth 2 is 1 + 30 + 30 = 61.
  assert.ok(r.out.includes('big · 61 · 32 · 61 (markdown/big/overview.md)'), r.text);
});
