// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C267, lever 2 — the review of #600, on the pure modules (the hook-level cases are tests/hook/stop-lever2-review.test.mjs; the glob's are in
 * tests/glob-fs.test.mjs). A1: the glob and brace words of a call that cannot be resolved are tested against a page's path and file name, with no
 * file system. A2: a thread whose folder is reset before every call. A3: an input cut short is said to be. C: the names of the pages read are not
 * collected for a class that does not ask, and a run can be stopped. B1 and D: what `groundingFindings` says is shown.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as routes from '../tools/snowarch/lib/docs/read-routes.mjs';
import * as sources from '../tools/snowarch/lib/docs/turn-sources.mjs';
import { groundingFindings } from '../tools/snowarch/lib/docs/grounding-check.mjs';
import { A, U, readPage, res, use } from './helpers/lever2.mjs';

// The new functions are reached through the module, so that one that is not there yet fails its own case and not the file.
const { commandReads, walkThread } = routes;
const { parseTranscript, readSubagentRows, turnSources } = sources;
const wordNamesPage = (...args) => routes.wordNamesPage(...args);
const readSubagents = (...args) => sources.readSubagents(...args);

const ESC = 'markdown/customer-service-management/c_Escalation.md';
const OTHER = 'markdown/hr-service-delivery/c_Other.md';
const DEEP = 'markdown/csm/sub/c_Escalation.md';
const ABS = '/home/dev/install/vendor/ServiceNowDocs';

// ---- A1: a glob or a brace word names a page by its path and its file name -----------------------------------------------------------------
test('ARC-09-C267 review A1 — wordNamesPage: a glob or a brace word may name a page by its file name and the folders it gives, matched from the end', () => {
  for (const [word, page] of [
    ['c_Escalation*.md', ESC], ['c_Esc*', ESC], ['*.md', ESC], ['*', ESC], ['c_?scalation.md', ESC], ['c_[Ee]scalation.md', ESC], ['c_[!x]scalation.md', ESC],
    ['c_{Escalation,Other}.md', ESC], ['c_{Escalation,Other}.md', OTHER], ['c_{Esc,Oth}*.md', OTHER], ['c_{A..F}*.md', ESC.replace('Escalation', 'Cscalation')],
    ['customer-service-management/c_Esc*.md', ESC], ['customer-*/c_Esc*.md', ESC], ['markdown/*/c_Esc*.md', ESC], ['vendor/ServiceNowDocs/markdown/*/c_Escalation.md', ESC],
    [`${ABS}/markdown/customer-service-management/c_Escalation*.md`, ESC], [`${ABS}/markdown/**/c_Esc*.md`, ESC], [`${ABS}/**/c_Esc*.md`, DEEP],
    ['C:/Users/dev/install/vendor/ServiceNowDocs/markdown/customer-service-management/c_Esc*.md', ESC],
    ['$CORPUS/markdown/customer-service-management/c_Esc*.md', ESC], ['~/install/vendor/ServiceNowDocs/markdown/*/c_Esc*.md', ESC], ['${DIR}/c_Esc*.md', ESC],
    ['~/c_Esc*.md', ESC], ['~dev/c_Esc*.md', ESC], ['$HOME/c_Esc*.md', ESC], ['${HOME}/c_Esc*.md', ESC],
    ['c_$NAME*.md', ESC], ['markdown/{customer-service-management,hr-service-delivery}/c_{Escalation,Other}.md', ESC],
    ['markdown/{customer-service-management,hr-service-delivery}/c_{Escalation,Other}.md', OTHER], ['../customer-service-management/c_Esc*.md', ESC],
  ]) assert.equal(wordNamesPage(word, page), true, `${word} names ${page}`);
  for (const [word, page] of [
    ['c_Other*.md', ESC], ['c_Esc*.txt', ESC], ['hr-service-delivery/c_Esc*.md', ESC], ['sub/dir/c_Esc*.md', ESC], [`${ABS.replace('/vendor/ServiceNowDocs', '')}/docs/*.md`, ESC],
    ['/c_Escalation*.md', ESC], ['markdown/*/c_Escalation.md', DEEP], ['markdown/c_Escalation*.md', ESC], ['c_Esc*/', ESC], ['c_{Other,Third}.md', ESC], ['docs/*.md', ESC],
    ['C:/c_Esc*.md', ESC], ['$X/c_Other*.md', ESC], ['~dev/docs/c_Esc*.md', ESC], ['$HOME/x/y/c_Esc*.md', ESC],
  ]) assert.equal(wordNamesPage(word, page), false, `${word} does not name ${page}`);
  assert.equal(wordNamesPage('C_ESC*.MD', ESC), false, 'case matters by default');
  // a segment with more wildcards than any command has can take exponential time to refuse a name: it is not tried, and taken to match
  const started = Date.now();
  assert.equal(wordNamesPage('*a*a*a*a*a*a*a*a*a*a*a*a*b.md', 'markdown/x/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.md'), true);
  assert.ok(Date.now() - started < 1000, 'and at once');
  assert.equal(wordNamesPage('*a*b.md', 'markdown/x/aaaa.md'), false, 'a few wildcards are tried');
  assert.equal(wordNamesPage('C_ESC*.MD', ESC, { ci: true }), true, 'and not for PowerShell');
  assert.equal(wordNamesPage('', ESC), false);
  assert.equal(wordNamesPage('c_{', ESC), false, 'an unclosed brace is just text');
  assert.equal(wordNamesPage(undefined, ESC), false);
});

test('ARC-09-C267 review A1 — commandReads returns the glob and brace words of a call it cannot resolve, joined to the folder when it is known', () => {
  const pats = (command, opts) => commandReads(command, opts).patterns.map((p) => p.w).sort();
  assert.deepEqual(pats(`for f in ${ABS}/markdown/csm/c_Esc*.md; do sed -n 1,60p "$f"; done`), [`${ABS}/markdown/csm/c_Esc*.md`]);
  assert.deepEqual(pats('for f in c_{Esc,Other}.md; do head "$f"; done'), ['c_{Esc,Other}.md'], 'a brace list, no folder known: as written');
  assert.deepEqual(pats('for f in c_Esc*.md; do head "$f"; done', { cwd: `${ABS}/markdown/csm` }), [`${ABS}/markdown/csm/c_Esc*.md`], 'a folder known: joined to it');
  assert.deepEqual(pats('for f in c_Esc*.md; do head "$f"; done', { cwd: `${ABS}/markdown/csm`, rowCwd: '/home/dev/install' }), ['/home/dev/install/c_Esc*.md', `${ABS}/markdown/csm/c_Esc*.md`], 'and to the row\'s');
  assert.deepEqual(pats('for f in c_Esc*.md; do head "$f"; done', { lost: true, rowCwd: '/home/dev/install' }), ['c_Esc*.md'], 'a folder lost by a cd: as written');
  assert.deepEqual(pats('cd ~/x/markdown/csm && cat c_Esc*.md'), ['c_Esc*.md'], 'cd ~ loses the folder, and the viewer\'s pattern is the call\'s');
  assert.deepEqual(pats('cd "$HOME/x" && sed -n 1,5p c_Esc*.md c_Other.md'), ['c_Esc*.md']);
  assert.deepEqual(pats(`find ${ABS}/markdown -name 'c_Esc*.md' | xargs cat`, { cwd: '/tmp' }), ['c_Esc*.md'], 'find -name matches base names wherever the shell is');
  assert.deepEqual(pats('find . -iname "C_*.MD" -o -path "*/csm/*" | xargs cat'), ['*/csm/*', 'C_*.MD']);
  assert.deepEqual(pats('find . -name x -exec cat {} \\;'), [], '{} is not a brace list');
  assert.deepEqual(pats('for f in a b; do cat "$f"; done'), []);
  assert.deepEqual(pats(`for f in ${'a'.repeat(5000)}*.md; do cat "$f"; done`), [], 'a word that is a blob and not a path is not kept');
  // a call that is not unresolved returns none: what the file system answered, a plain read, a listing
  const glob = () => [`${ABS}/markdown/csm/c_Esc.md`];
  assert.deepEqual(pats(`cat ${ABS}/markdown/csm/c_Es*.md`, { glob }), []);
  assert.deepEqual(pats(`cat ${ABS}/markdown/csm/c_Esc.md`), []);
  assert.deepEqual(pats('ls *.md'), []);
  // a viewer's pattern the file system did not answer is the call's
  assert.deepEqual(pats(`cat ${ABS}/markdown/csm/c_Es*.md`, { glob: () => null }), [`${ABS}/markdown/csm/c_Es*.md`]);
  assert.deepEqual(pats(`cat ${ABS}/markdown/csm/c_Es*.md`, { glob: () => [] }), [`${ABS}/markdown/csm/c_Es*.md`]);
  // PowerShell: case-blind patterns
  const ps = commandReads('foreach ($f in Get-ChildItem C:\\i\\ServiceNowDocs\\markdown\\csm\\C_*.md) { Get-Content $f }', { powershell: true });
  assert.deepEqual(ps.patterns.map((p) => [p.w, p.ci]), [['C:/i/ServiceNowDocs/markdown/csm/C_*.md', true]]);
});

test('ARC-09-C267 review A1 — walkThread keeps the patterns of the calls it cannot resolve, those of a failed viewer call apart', () => {
  const rows = [
    U('how?'),
    A([{ type: 'tool_use', id: 'l', name: 'Bash', input: { command: `for f in ${ABS}/markdown/csm/c_Esc*.md; do sed -n 1,5p "$f"; done` } }], { cwd: '/home/dev/install' }),
    res('l', 'text'),
    A([{ type: 'tool_use', id: 'f', name: 'Bash', input: { command: `for f in ${ABS}/markdown/csm/c_Oth*.md; do sed -n 1,5p "$f"; done` } }], { cwd: '/home/dev/install' }),
    res('f', 'Exit code 1', { is_error: true }),
  ];
  const walked = walkThread(rows, {});
  assert.deepEqual(walked.patterns.map((p) => p.w), [`${ABS}/markdown/csm/c_Esc*.md`]);
  assert.deepEqual(walked.failedPatterns.map((p) => p.w), [`${ABS}/markdown/csm/c_Oth*.md`]);
});

// ---- A2: a thread whose folder is reset before every call ----------------------------------------------------------------------------------
test('ARC-09-C267 review A2 — walkThread with carryFolder false starts every call at its row\'s folder', () => {
  const area = 'vendor/ServiceNowDocs/markdown/csm';
  const call = (id, command) => [A([{ type: 'tool_use', id, name: 'Bash', input: { command } }], { cwd: '/home/dev/install' }), res(id, 'ok')];
  const rows = [...call('b1', `cd ${area} && ls`), ...call('b2', `cd ${area} && sed -n 1,80p c_Esc.md`)];
  assert.deepEqual([...walkThread(rows, {}).reached.keys()], [`markdown/csm/${area}/c_Esc.md`.replace('markdown/csm/vendor/ServiceNowDocs/', 'markdown/csm/vendor/ServiceNowDocs/')], 'carried: the second cd is joined to the first (the bug a reset thread must not have)');
  assert.deepEqual([...walkThread(rows, { carryFolder: false }).reached.keys()], ['markdown/csm/c_Esc.md']);
  const same = [...call('b1', 'cd /home/dev/install/vendor/ServiceNowDocs/markdown/csm'), ...call('b2', 'sed -n 1,5p c_Esc.md')];
  assert.deepEqual([...walkThread(same, {}).reached.keys()], ['markdown/csm/c_Esc.md'], 'carried: the C268 case');
  assert.deepEqual([...walkThread(same, { carryFolder: false }).reached.keys()], [], 'reset: a folder set in one call is not the next one\'s');
  const turn = turnSources([U('how?'), ...same], { carryFolder: false });
  assert.equal(turn.reached.size, 0, 'turnSources passes the option on');
  assert.equal(turnSources([U('how?'), ...same], {}).reached.size, 1);
});

// ---- A3: an input cut short is said to be -----------------------------------------------------------------------------------------------------
test('ARC-09-C267 review A3 — parseTranscript counts the lines it lost; a torn last line is not one', () => {
  const row = JSON.stringify({ type: 'user', message: { role: 'user', content: 'x' } });
  assert.equal(parseTranscript(`${row}\n${row}\n`).lostLines, 0);
  assert.equal(parseTranscript(`${row}\n{"type": "user", "mes`).lostLines, 0, 'the last line, torn by a write in progress');
  assert.equal(parseTranscript(`${row}\n{"type": "user", "mes`).badLines, 1, 'but still a bad line');
  assert.equal(parseTranscript(`${row}\nnot json\n${row}\n`).lostLines, 1, 'a bad line in the middle');
  assert.equal(parseTranscript(`${row}\n"a string"\n${row}\n`).lostLines, 1, 'a line that parses to something that is no row');
  assert.equal(parseTranscript(`${row}\nnot json\n\n\n`).lostLines, 0, 'blank lines after the bad one: it is the last');
});

test('ARC-09-C267 review A3 — readSubagents says when files or bytes were left out; readSubagentRows is its threads', () => {
  const rowText = (n) => `${JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [] } })}\n`.repeat(n);
  const fsOf = (names, size = 10, body = rowText(1)) => ({
    list: () => names, stat: (f) => ({ size, isDirectory: () => !/\.jsonl$/.test(f) }), read: () => body,
  });
  const names = (n) => Array.from({ length: n }, (_, k) => `agent-${String(k).padStart(4, '0')}.jsonl`);
  const lines = [];
  const opts = (o) => ({ ...o, onDebug: (l) => lines.push(l) });
  const done = readSubagents('/s/main.jsonl', opts(fsOf(names(3))));
  assert.equal(done.threads.length, 3);
  assert.deepEqual(done.incomplete, [], 'every file read');
  const cut = readSubagents('/s/main.jsonl', opts({ ...fsOf(names(201)), maxFiles: 200 }));
  assert.equal(cut.threads.length, 200);
  assert.equal(cut.incomplete.length, 1);
  assert.match(cut.incomplete[0], /200/);
  assert.match(lines.join('\n'), /200/, 'and the debug line says so');
  assert.deepEqual(readSubagents('/s/main.jsonl', opts({ ...fsOf(names(200)), maxFiles: 200 })).incomplete, [], 'exactly the cap is not over it');
  const bytes = readSubagents('/s/main.jsonl', opts({ ...fsOf(names(3), 4000), maxBytes: 9000 }));
  assert.equal(bytes.threads.length, 2);
  assert.match(bytes.incomplete.join(' '), /9000/);
  const lost = readSubagents('/s/main.jsonl', opts(fsOf(names(2), 10, `${rowText(1)}garbage\n${rowText(1)}`)));
  assert.match(lost.incomplete.join(' '), /line/, 'a lost line of a sub-agent file');
  const unreadable = readSubagents('/s/main.jsonl', opts({ list: () => names(2), stat: () => ({ size: 10, isDirectory: () => false }), read: () => { throw new Error('EACCES'); } }));
  assert.match(unreadable.incomplete.join(' '), /EACCES|unreadable/);
  assert.deepEqual(readSubagents('/s/main.jsonl', opts({ list: () => { throw Object.assign(new Error('x'), { code: 'ENOENT' }); }, stat: () => ({ size: 0 }), read: () => '' })), { threads: [], incomplete: [] }, 'no folder: none, and complete');
  assert.equal(readSubagentRows('/s/main.jsonl', fsOf(names(3))).length, 3);
  assert.deepEqual(readSubagents('/s/not-a-session.txt'), { threads: [], incomplete: [] });
});

// ---- C: the names of the pages read are collected only for a class that asks; a run can be stopped -------------------------------------------
const PAGE = '/home/dev/install/vendor/ServiceNowDocs/markdown/it-service-management/c_Alpha.md';
const SESSION = [U('how does a case escalate?'), ...readPage('r', PAGE)];

test('ARC-09-C267 review C — turnSources collects the names of what was read only when asked, and counts the scans', () => {
  const full = turnSources(SESSION, {});
  assert.ok(full.names.read.size > 0 && full.stats.namesScanned >= 1, 'by default');
  const lean = turnSources(SESSION, { names: false });
  assert.equal(lean.names.read.size, 0);
  assert.equal(lean.stats.namesScanned, 0);
  assert.ok(lean.pagesRead.has('markdown/it-service-management/c_Alpha.md'), 'the pages read are still known');
  assert.ok(lean.reached.has('markdown/it-service-management/c_Alpha.md'));
});

test('ARC-09-C267 review C — a run that is stopped stops the walk of the rows: turnSources and walkThread report it', () => {
  let calls = 0;
  const stopAt = (n) => () => { calls += 1; return calls > n; };
  const many = [U('how?'), ...Array.from({ length: 400 }, (_, k) => readPage(`r${k}`, PAGE)).flat()];
  assert.equal(turnSources(many, { shouldStop: () => false }).aborted, false);
  calls = 0;
  const t = turnSources(many, { shouldStop: stopAt(2) });
  assert.equal(t.aborted, true);
  calls = 0;
  const w = walkThread(many, { shouldStop: stopAt(2) });
  assert.equal(w.aborted, true);
  assert.equal(walkThread(many, {}).aborted, false);
  // turnSources' own loops stop too, when the walk of the read routes did not: 129 rows are checked by the walk at 0, 64 and 128 (the first three calls),
  // and by turnSources' loop at its 64th row (the fourth)
  const mid = [U('how?'), ...Array.from({ length: 64 }, (_, k) => readPage(`m${k}`, PAGE)).flat()];
  assert.equal(mid.length, 129);
  calls = 0;
  const own = turnSources(mid, { shouldStop: () => { calls += 1; return calls > 3; } });
  assert.equal(own.aborted, true, 'the rows of turnSources are stopped by its own check');
  calls = 0;
  assert.equal(turnSources(mid, { shouldStop: () => { calls += 1; return false; } }).aborted, false);
});

test('ARC-09-C267 review C — groundingFindings that finds its rows stopped asks nothing, even if the stop is over by the time it looks again', () => {
  let calls = 0;
  const stopFirst = () => { calls += 1; return calls === 1; };                  // true during the walk, false after
  const r = groundingFindings({ rows: SESSION, reply: CITE(BETA), options: { blocking: ['citedUnread'], shouldStop: stopFirst } });
  assert.equal(r.skipped, 'deadline');
  assert.deepEqual(r.items, []);
  assert.match(r.notes.join('\n'), /deadline/);
});

// ---- B1 and D: what groundingFindings says is shown --------------------------------------------------------------------------------------------
const CITE = (p) => `The rule is in (citation: ${p}).`;
const ALPHA = 'markdown/it-service-management/c_Alpha.md';
const BETA = 'markdown/it-service-management/c_Beta.md';

test('ARC-09-C267 review B1 — groundingFindings answers shown(path) by the rules of the ask: a read, the names of a call, a pattern, a sub-agent', () => {
  const find = (rows, options = {}) => groundingFindings({ rows, reply: CITE(BETA), options: { blocking: ['citedUnread'], ...options } });
  const read = find(SESSION);
  assert.equal(read.shown(ALPHA), true);
  assert.equal(read.shown(BETA), false);
  assert.deepEqual(read.items.map((i) => i.path), [BETA]);
  const loop = (command) => [U('how?'), use('b', 'Bash', { command }, { cwd: '/home/dev/install' }), res('b', 'text')];
  assert.equal(find(loop('for f in c_Alpha.md c_Beta.md; do head -3 "$f"; done')).shown(BETA), true, 'a name in a loop');
  assert.equal(find(loop('for f in /x/ServiceNowDocs/markdown/it-service-management/c_B*.md; do head -3 "$f"; done')).shown(BETA), true, 'a pattern in a loop');
  assert.equal(find(loop('for f in /x/ServiceNowDocs/markdown/it-service-management/c_A*.md; do head -3 "$f"; done')).shown(BETA), false, 'another pattern');
  const side = [[A([{ type: 'tool_use', id: 's', name: 'Bash', input: { command: 'for f in vendor/ServiceNowDocs/markdown/it-service-management/c_B*.md; do head -3 "$f"; done' } }], { cwd: '/home/dev/install' }), res('s', 'x')]];
  assert.equal(find([U('how?')], { sideRows: () => side }).shown(BETA), true, 'a sub-agent\'s pattern');
  assert.equal(find([U('how?')], { sideRows: () => ({ threads: side, incomplete: [] }) }).shown(ALPHA), false, 'and not another page');
});

test('ARC-09-C267 review B2 — a page the answer cites that is not on disk is dead in the answer (C254\'s), and asked about in a file; shown(path) is true for the dead one', () => {
  const exists = (p) => p !== 'markdown/it-service-management/wrong-folder/c_Alpha.md';
  const dead = 'markdown/it-service-management/wrong-folder/c_Alpha.md';
  const r = groundingFindings({ rows: [U('how?')], reply: `${CITE(dead)} ${CITE(BETA)}`, options: { blocking: ['citedUnread'], pageExists: exists } });
  assert.deepEqual(r.items.map((i) => i.path), [BETA], 'the dead path is C254\'s, with no deadPaths given: the disk says so');
  const written = [U('how?'), use('w', 'Write', { file_path: '/c/e.md', content: `${CITE(dead)}\n` }), res('w', 'ok')];
  const f = groundingFindings({ rows: written, reply: 'Saved.', options: { blocking: ['citedUnread'], pageExists: exists } });
  assert.deepEqual(f.items.map((i) => i.path), [dead], 'in a file the turn wrote it is asked about like any other');
});

test('ARC-09-C267 review A3 — an input cut short asks nothing about citations and notes why', () => {
  const r = groundingFindings({ rows: [U('how?')], reply: CITE(BETA), options: { blocking: ['citedUnread'], incomplete: ['the transcript has 1 line that does not parse'] } });
  assert.deepEqual(r.items, []);
  assert.match(r.notes.join('\n'), /does not parse/);
  const side = groundingFindings({ rows: [U('how?')], reply: CITE(BETA), options: { blocking: ['citedUnread'], sideRows: () => ({ threads: [], incomplete: ['sub-agent files over the 200 limit'] }) } });
  assert.deepEqual(side.items, [], 'a sub-agent input cut short: the page might have been read in what was left out');
  assert.match(side.notes.join('\n'), /200 limit/);
  const fine = groundingFindings({ rows: [U('how?')], reply: CITE(BETA), options: { blocking: ['citedUnread'], sideRows: () => ({ threads: [], incomplete: [] }) } });
  assert.deepEqual(fine.items.map((i) => i.path), [BETA], 'and a complete one asks');
});

test('ARC-09-C267 review C — a caller that only asks (askedOnly) collects no name when only citedUnread asks; a replay or a grader still computes every class', () => {
  const lean = groundingFindings({ rows: SESSION, reply: CITE(BETA), options: { blocking: ['citedUnread'], askedOnly: true } });
  assert.equal(lean.stats.namesScanned, 0);
  assert.deepEqual(lean.items.map((i) => i.path), [BETA]);
  const replay = groundingFindings({ rows: SESSION, reply: CITE(BETA), options: { blocking: ['citedUnread'] } });
  assert.ok(replay.stats.namesScanned >= 1, 'not asked and still computed, for a replay');
  assert.deepEqual(replay.items.map((i) => i.path), [BETA]);
  const names = groundingFindings({ rows: SESSION, reply: CITE(BETA), options: { blocking: ['coined', 'citedUnread'], askedOnly: true } });
  assert.ok(names.stats.namesScanned >= 1, 'a name class that asks is computed');
});

test('ARC-09-C267 review D — a bare file name that a corpus page has is a citation of every page of the name', () => {
  const named = (name) => ({ 'c_Alpha.md': [ALPHA, 'markdown/hr-service-delivery/c_Alpha.md'], 'c_Beta.md': [BETA] }[name] ?? []);
  const find = (reply, rows = [U('how?')], options = {}) => groundingFindings({ rows, reply, options: { blocking: ['citedUnread'], pagesNamed: named, ...options } });
  assert.deepEqual(find('The rule is in (citation: c_Beta.md).').items.map((i) => i.path), ['c_Beta.md']);
  assert.deepEqual(find('See `c_Beta.md`. And SKILL.md, CLAUDE.md, c_Nowhere.md.').items.map((i) => i.path), ['c_Beta.md'], 'only a name the corpus has');
  assert.deepEqual(find(`The rule is in ${BETA}, that is c_Beta.md.`).items.map((i) => i.path), [BETA], 'the path and the name of one page are one item');
  assert.equal(find('(citation: c_Alpha.md)', SESSION).items.length, 0, 'a page of that name was read');
  assert.equal(find('(citation: c_Alpha.md)', [U('how?'), ...readPage('r', '/x/ServiceNowDocs/markdown/hr-service-delivery/c_Alpha.md')]).items.length, 0, 'the other page of the name');
  assert.equal(find('(citation: c_Alpha.md)', [U('how?')]).items.length, 1);
  assert.equal(find('(citation: c_Beta.md)', [U('how?')], { pageExists: () => false }).items.length, 0, 'a page that is not on disk cannot be opened');
  assert.equal(find('(citation: c_Beta.md)', [U('how?')], { pagesNamed: undefined }).items.length, 0, 'with no list of the corpus\'s names, a bare name is nothing');
  assert.equal(find('c_Beta.md was not read.').items.length, 0);
  assert.equal(find('See also c_Beta.md.').items.length, 0);
  assert.equal(find('(citation: c_Beta.md)', [U('look at c_Beta.md')]).items.length, 0, 'typed by the user');
  const many = (name) => (name === 'x_Many.md' ? Array.from({ length: 6 }, (_, k) => `markdown/a${k}/x_Many.md`) : []);
  assert.equal(find('(citation: x_Many.md)', [U('how?')], { pagesNamed: many }).items.length, 0, 'a name that six pages carry is no citation of any');
});
