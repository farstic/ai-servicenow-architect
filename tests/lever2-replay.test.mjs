// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C267, lever 2 — the architect's replay of the hook over the 151 finished C268 sessions (2026-11-16, head 3974ef3e), on the pure modules. Two defects, B1 and B2;
 * the hook-level cases are tests/hook/stop-lever2-replay.test.mjs.
 *   B1  a relative line of a Grep (or of a shell search) is a path below the SESSION's folder, and was joined to the search path first: after a `cd` into the corpus the
 *       line became a doubled page that is not on disk, and the page the model saw was asked about as never opened (11 pages in 6 sessions);
 *   B2  a REFUSED shell call never ran and showed nothing, but the failed-viewer rule (`cat a.md missing.md` printed a.md) counted the pages it names (72 of the 95 failed
 *       calls of the sitting were refusals; the others ran and say `Exit code N`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pagesInLines, pagesOfGrep, walkThread, wordNamesPage } from '../tools/snowarch/lib/docs/read-routes.mjs';
import { A, U, res, use } from './helpers/lever2.mjs';

const CORPUS = '/arms/N/clone/vendor/ServiceNowDocs';
const CMDB = 'servicenow-platform/configuration-management-database-cmdb';
const CMDB_PAGE = `markdown/${CMDB}/cmdb-table-property-descriptions.md`;
const ROLES = 'markdown/platform-administration/user-administration/r_BaseSystemRoles.md';
const exists = (...pages) => (page) => pages.includes(page);
const grep = (input, body, rowCwd, seams) => [...pagesOfGrep({ output_mode: 'content', pattern: 'x', ...input }, body, rowCwd, seams)];

// ---- B1: a relative line names the page under the base where it exists, the session's folder first -------------------------------------------------
test('ARC-09-C267 replay B1 — a Grep line relative to the session\'s folder is that page and not a doubled one, with the disk and without', () => {
  // the architect's first repro: the rows' folder is the corpus's markdown folder, the lines start below it, the search path is a folder inside
  const lines = `${CMDB}/cmdb-table-property-descriptions.md:103:|Support group|Group table|`;
  const input = { pattern: '[Ss]upport group', path: `${CORPUS}/markdown/${CMDB}` };
  assert.deepEqual(grep(input, lines, `${CORPUS}/markdown`), [CMDB_PAGE], 'no disk: the session\'s folder is tried first');
  assert.deepEqual(grep(input, lines, `${CORPUS}/markdown`, { pageExists: exists(CMDB_PAGE) }), [CMDB_PAGE], 'with the disk');
  // his second: the folder is the corpus, the lines start with markdown/, the search path is an area
  const roles = { pattern: 'x', path: `${CORPUS}/markdown/platform-administration` };
  assert.deepEqual(grep(roles, `${ROLES}:120:x`, CORPUS), [ROLES]);
  assert.deepEqual(grep(roles, `${ROLES}:120:x`, CORPUS, { pageExists: exists(ROLES) }), [ROLES]);
  // a context line (-C) is path-49-text
  assert.deepEqual(grep(input, `${CMDB}/cmdb-table-property-descriptions.md-49-text`, `${CORPUS}/markdown`), [CMDB_PAGE], 'a context line');
  assert.deepEqual(grep(input, `${CMDB}/cmdb-table-property-descriptions.md-49-text\n${CMDB}/cmdb-table-property-descriptions.md:50:hit`, `${CORPUS}/markdown`, { pageExists: exists(CMDB_PAGE) }), [CMDB_PAGE]);
});

test('ARC-09-C267 replay B1 — with the disk, a relative line names the page under the first base where it EXISTS, and never a page that is not there', () => {
  const lines = 'c_Esc.md:12:x';
  const csm = { pattern: 'x', path: `${CORPUS}/markdown/csm` };
  // the session's folder does not hold it, the search path does
  assert.deepEqual(grep(csm, lines, '/elsewhere', { pageExists: exists('markdown/csm/c_Esc.md') }), ['markdown/csm/c_Esc.md']);
  // the session's folder holds it, and is tried first
  assert.deepEqual(grep({ pattern: 'x', path: `${CORPUS}/markdown/other` }, lines, `${CORPUS}/markdown/csm`, { pageExists: exists('markdown/csm/c_Esc.md', 'markdown/other/c_Esc.md') }), ['markdown/csm/c_Esc.md']);
  // neither holds it: the line names no page
  assert.deepEqual(grep(csm, lines, `${CORPUS}/markdown/other`, { pageExists: exists() }), []);
  assert.deepEqual(grep(csm, lines, `${CORPUS}/markdown/other`, { pageExists: exists('markdown/csm/c_Other.md') }), []);
  // pagesInLines with several bases: the first one where the page exists
  assert.deepEqual([...pagesInLines('a/c.md:1:x', [`${CORPUS}/markdown/x`, `${CORPUS}/markdown`], { pageExists: exists('markdown/a/c.md') })], ['markdown/a/c.md']);
  assert.deepEqual([...pagesInLines('a/c.md:1:x', [`${CORPUS}/markdown/x`, `${CORPUS}/markdown`], { pageExists: exists('markdown/x/a/c.md', 'markdown/a/c.md') })], ['markdown/x/a/c.md'], 'the first base that holds it');
  // a path that is absolute needs no base, and a page named by its path is a page whatever the disk says (the tool printed it)
  assert.deepEqual([...pagesInLines(`${CORPUS}/markdown/csm/c_Esc.md:1:x`, [], { pageExists: exists() })], ['markdown/csm/c_Esc.md']);
});

test('ARC-09-C267 replay B1 — walkThread: a Grep after a cd into the corpus reaches the page it printed, and a shell search the same', () => {
  const markdown = `${CORPUS}/markdown`;
  const rows = [
    U('how?'),
    use('g', 'Grep', { pattern: '[Ss]upport group', path: `${markdown}/${CMDB}`, output_mode: 'content' }, { cwd: markdown }),
    res('g', `${CMDB}/cmdb-table-property-descriptions.md:103:|Support group|Group table|\n${CMDB}/cmdb-table-property-descriptions.md-104-next`),
  ];
  assert.deepEqual([...walkThread(rows, {}).reached.keys()], [CMDB_PAGE]);
  assert.deepEqual([...walkThread(rows, { pageExists: exists(CMDB_PAGE) }).reached.keys()], [CMDB_PAGE]);
  // a shell search: the lines are relative to the folder it ran in
  const shell = [
    U('how?'),
    use('b', 'Bash', { command: `cd ${CMDB.split('/')[0]} && grep -rn "Support group" ${CMDB.split('/')[1]}` }, { cwd: markdown }),
    res('b', `${CMDB.split('/')[1]}/cmdb-table-property-descriptions.md:103:|Support group|`),
  ];
  assert.deepEqual([...walkThread(shell, { pageExists: exists(CMDB_PAGE) }).reached.keys()], [CMDB_PAGE]);
  // a line that no base makes a page on disk reaches none
  assert.deepEqual([...walkThread(shell, { pageExists: exists('markdown/elsewhere/x.md') }).reached.keys()], []);
});

// ---- B2: a refused call never ran ------------------------------------------------------------------------------------------------------------------
const ESC = `${CORPUS}/markdown/csm/c_Esc.md`;
const PAGE = 'markdown/csm/c_Esc.md';
const failed = (id, command, text, name = 'Bash') => [use(id, name, { command }, { cwd: '/home/dev/install' }), res(id, text, { is_error: true })];
const reached = (rows, opts = {}) => [...walkThread([U('how?'), ...rows], { pageExists: exists(PAGE, 'markdown/csm/c_Other.md'), ...opts }).reached.keys()];
// the texts of the C268 sitting's refused calls (the architect's count: 28, 21, 15, 8), and of one that ran and failed (23)
const REFUSED = [
  'This Bash command contains multiple operations. The following part requires approval: cat x',
  "A variable in this command can't be checked before it runs",
  'Parser skipped input between top-level statements',
  'This command requires approval',
];

test('ARC-09-C267 replay B2 — a refused call reaches no page; a call that ran and failed reaches the pages it names that are on disk', () => {
  for (const text of REFUSED) {
    assert.deepEqual(reached(failed('b', `cat ${ESC} missing.md`, text)), [], text);
    assert.deepEqual(reached(failed('p', `Get-Content ${ESC}, missing.md`, text, 'PowerShell')), [], `PowerShell: ${text}`);
  }
  assert.deepEqual(reached(failed('b', `cat ${ESC} missing.md`, 'Exit code 1\ncat: missing.md: No such file or directory')), [PAGE], 'it ran');
  assert.deepEqual(reached(failed('b', `cat ${ESC} missing.md`, 'Exit code 127')), [PAGE]);
  assert.deepEqual(reached(failed('p', `Get-Content ${ESC}, missing.md`, 'Exit code 1\nGet-Content : Cannot find path', 'PowerShell')), [PAGE]);
  // a page that is not on disk is not named even then
  assert.deepEqual(reached(failed('b', `cat ${ESC} missing.md`, 'Exit code 1'), { pageExists: exists() }), []);
});

test('ARC-09-C267 replay B2 — a refused call that cannot be resolved (a loop, xargs, a pattern) shows nothing either: not its text, not its output, not its patterns', () => {
  const loop = 'for f in c_Esc.md c_Other.md; do head -20 "$f"; done';
  const walkedOf = (text) => walkThread([U('how?'), ...failed('b', loop, text)], { pageExists: exists(PAGE, 'markdown/csm/c_Other.md') });
  for (const text of REFUSED) {
    const walked = walkedOf(text);
    assert.deepEqual([walked.failedOpaque, walked.failedPatterns], [[], []], text);
  }
  const ran = walkedOf('Exit code 1');
  assert.ok(ran.failedOpaque.length > 0, 'a loop that ran and failed keeps its text');
  const globLoop = `for f in ${CORPUS}/markdown/csm/c_Esc*.md; do head -3 "$f"; done`;
  assert.deepEqual(walkThread([U('how?'), ...failed('b', globLoop, 'This command requires approval')], {}).failedPatterns, []);
  assert.equal(walkThread([U('how?'), ...failed('b', globLoop, 'Exit code 1')], {}).failedPatterns.length, 1);
});

test('ARC-09-C267 replay B2 — a failed call whose result does not say "Exit code" but holds a line of the page ran: the wording of the prefix is not relied on', () => {
  const pageText = () => 'The sn\\_example table holds the escalation of a case.\nA second line of the page.\n';
  const holds = '1\tThe sn\\_example table holds the escalation of a case.\ncat: missing.md: No such file or directory';
  assert.deepEqual(reached(failed('b', `cat ${ESC} missing.md`, holds), { pageText }), [PAGE], 'a line of the page is in the result');
  assert.deepEqual(reached(failed('b', `cat ${ESC} missing.md`, 'cat: missing.md: No such file or directory'), { pageText }), [], 'none is');
  assert.deepEqual(reached(failed('b', `cat ${ESC} missing.md`, holds)), [], 'no seam to read the page: only the prefix counts');
  assert.deepEqual(reached(failed('b', `cat ${ESC} missing.md`, 'This command requires approval to read The sn\\_example table'), { pageText }), [], 'the words of a refusal are not a line of the page');
  assert.deepEqual(reached(failed('b', `cat ${ESC} missing.md`, holds), { pageText: () => null }), [], 'a page that cannot be read');
  // a short line is no evidence (a heading, a rule)
  assert.deepEqual(reached(failed('b', `cat ${ESC} missing.md`, '# Table\ncat: missing.md: No such file'), { pageText: () => '# Table\n\nText.\n' }), []);
});

// ---- B3: a resolved search whose lines carry no file name ------------------------------------------------------------------------------------------
test('ARC-09-C267 replay B3 — a resolved search that prints lines without a file name (-h, -I, --no-filename) shows the pages its name filter matches, and only when it printed lines', () => {
  const AREA = `${CORPUS}/markdown/platform-administration/table-administration-and-data-management`;
  const MODULE = 'markdown/platform-administration/table-administration-and-data-management/c_AssignmentRulesModule.md';
  const OTHER = 'markdown/platform-administration/table-administration-and-data-management/c_SomethingElse.md';
  const ok = (command, body = '1\tassign the incident to a group') => [U('how?'), use('b', 'Bash', { command }, { cwd: '/home/dev/install' }), res('b', body)];
  const showsPage = (command, page, body) => walkThread(ok(command, body), {}).patterns.some((q) => wordNamesPage(q.w, page, { ci: q.ci }));
  // the architect's repro of the targeted soak
  const soak = `grep -rh --include='c_AssignmentRules*' -m 3 'assign' ${AREA}`;
  assert.equal(showsPage(soak, MODULE), true, 'the filter names the page');
  assert.equal(showsPage(soak, OTHER), false, 'and not another');
  // the same command without the filter names no page
  assert.equal(showsPage(`grep -rh -m 3 'assign' ${AREA}`, MODULE), false, 'nothing names the page');
  // nothing printed: nothing shown
  assert.equal(showsPage(soak, MODULE, ''), false, 'it printed nothing');
  assert.equal(showsPage(soak, MODULE, '   \n'), false);
  // the spellings of the filter, and of the flag that drops the file name
  for (const command of [`grep -rh --include=c_AssignmentRules* assign ${AREA}`, `grep -rh --include c_AssignmentRules* assign ${AREA}`, `egrep -rh --include='c_Assign*' assign ${AREA}`,
    `rg -I -g 'c_AssignmentRules*' assign ${AREA}`, `rg --no-filename --glob='c_AssignmentRules*' assign ${AREA}`, `rg -N -gc_AssignmentRules* assign ${AREA}`, `rg -h --iglob 'C_ASSIGNMENTRULES*' assign ${AREA}`,
    `grep -rh --include=c_AssignmentRulesModule.md assign ${AREA}`]) {
    assert.equal(showsPage(command, MODULE), true, command);
  }
  // a search that only lists or counts shows no line
  assert.equal(showsPage(`grep -rl --include='c_AssignmentRules*' assign ${AREA}`, MODULE), false, 'a listing');
  assert.equal(showsPage(`grep -rc --include='c_AssignmentRules*' assign ${AREA}`, MODULE, '3'), false, 'a count');
  // a call that failed or was refused shows none
  const refused = [U('how?'), use('b', 'Bash', { command: soak }, { cwd: '/home/dev/install' }), res('b', 'This command requires approval', { is_error: true })];
  assert.deepEqual(walkThread(refused, {}).patterns, []);
  // a negated glob and --exclude filter nothing
  assert.equal(showsPage(`rg -I -g '!*.txt' assign ${AREA}`, MODULE), false);
  assert.equal(showsPage(`grep -rh --exclude='*.txt' assign ${AREA}`, MODULE), false);
});
