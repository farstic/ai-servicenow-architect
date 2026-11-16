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
import { commandReads, pagesInLines, pagesOfGrep, walkThread, wordNamesPage } from '../tools/snowarch/lib/docs/read-routes.mjs';
import { makeShown } from '../tools/snowarch/lib/docs/grounding-check.mjs';
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
  assert.deepEqual([...walkThread(rows, { pageExists: exists('markdown/elsewhere/x.md') }).reached.keys()], [], 'a Grep line the same');
  // with no disk, the folder the shell stood in when it searched comes before the row's: the lines are relative to it
  assert.deepEqual([...walkThread(shell, {}).reached.keys()], [CMDB_PAGE]);
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
  // the prefix is the START of the result: a refusal that says the words later is still a refusal
  assert.deepEqual(reached(failed('b', `cat ${ESC} missing.md`, 'This command requires approval. A command that fails prints Exit code 1 first.')), []);
  assert.deepEqual(reached(failed('b', `cat ${ESC} missing.md`, '  Exit code 2\nout')), [PAGE], 'white space before it is not the start of anything else');
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
  // a search outside the corpus, or of a folder nobody can place, names no page by its filter (`*.md` would be every page)
  assert.equal(showsPage("grep -rh --include='*.md' assign /home/dev/install/clients/acme", MODULE), false, 'a folder outside the corpus');
  assert.equal(showsPage("grep -rh --include='*.md' assign clients/acme", MODULE), false, 'a folder in the project');
  // lines that carry a file name name their pages, and the filter adds none of the others it matches
  const HELPER = 'markdown/platform-administration/table-administration-and-data-management/c_AssignmentRulesHelper.md';
  const named = `${AREA}/c_AssignmentRulesModule.md:3:assign the incident`;
  assert.equal(showsPage(`grep -rn --include='c_AssignmentRules*' assign ${AREA}`, HELPER, named), false, 'a page the lines do not name');
  assert.equal(showsPage(`grep -rn --include='c_AssignmentRules*' assign ${AREA}`, MODULE, named), false, 'its own lines are the search route\'s, not a pattern');
  // the shell\'s own folder is the root of a search that is given none
  const inArea = (command, body = '1\tassign the incident') => walkThread([U('how?'), use('b', 'Bash', { command }, { cwd: AREA }), res('b', body)], {}).patterns.some((q) => wordNamesPage(q.w, MODULE, { ci: q.ci }));
  assert.equal(inArea("grep -rh --include='c_AssignmentRules*' assign"), true, 'no folder named: the one the shell stands in');
  assert.equal(inArea("rg -I -g 'c_AssignmentRules*' assign"), true);
  assert.equal(inArea("echo x | grep -h --include='c_AssignmentRules*' assign"), false, 'a pipe is its input');
});

// ---- the disk is asked once for each page --------------------------------------------------------------------------------------------------------
test('ARC-09-C267 replay — the disk is asked once for each page however many lines name it, within a call and across calls (a Grep result has thousands of lines)', () => {
  let asks = 0;
  const pageExists = (page) => { asks += 1; return page === CMDB_PAGE; };
  const lines = Array.from({ length: 500 }, (_, k) => `${CMDB}/cmdb-table-property-descriptions.md:${k + 1}:text`).join('\n');
  const grepRow = (id) => [use(id, 'Grep', { pattern: 'x', path: `${CORPUS}/markdown/${CMDB}`, output_mode: 'content' }, { cwd: `${CORPUS}/markdown` }), res(id, lines)];
  assert.deepEqual([...walkThread([U('how?'), ...grepRow('g1')], { pageExists }).reached.keys()], [CMDB_PAGE]);
  assert.equal(asks, 1, `${asks} asks for one page in one call`);
  asks = 0;
  walkThread([U('how?'), ...grepRow('g1'), ...grepRow('g2'), ...grepRow('g3')], { pageExists });
  assert.equal(asks, 1, `${asks} asks for one page across three calls`);
  // a shell search the same
  asks = 0;
  const shell = (id) => [use(id, 'Bash', { command: `grep -rn x ${CMDB.split('/')[1]}` }, { cwd: `${CORPUS}/markdown/servicenow-platform` }), res(id, lines.replaceAll(`${CMDB}/`, `${CMDB.split('/')[1]}/`))];
  walkThread([U('how?'), ...shell('b1'), ...shell('b2')], { pageExists });
  assert.ok(asks <= 1, `${asks} asks in a shell search`);
});

// ---- B4: a name filter names a page only below the folder the search ran on ------------------------------------------------------------------------
// The architect's check of 88f22769 over the C268 sessions: a kept filter such as `*.md` had no folder, so it named every page of the corpus and one call switched the ask
// off for the rest of the session (5 of 151 sessions; 5 asks for never-opened citations went with it). (a) a kept filter carries its roots, for B3 and for the filters of
// items 1 and 2; (b) B3 needs the search to be the only segment that prints; (c) a pattern with no folder that names more pages than the ubiquity counts for none.
const MD = `${CORPUS}/markdown`;
const HERE = { cwd: '/home/dev/install', rowCwd: '/home/dev/install' };
const turnOf = (patterns) => ({ reached: new Map(), pagesRead: new Set(), savedCitations: new Set(), opaque: [], opaqueFailed: [], patterns, patternsFailed: [] });
const shownBy = (patterns, page, options = {}) => makeShown(turnOf(patterns), options).shown(page);
const kept = (command, opts = HERE) => { const done = commandReads(command, opts); return [...done.patterns, ...done.searchPatterns]; };
const afterRun = (command, body, cwd = '/home/dev/install') => walkThread([U('how?'), use('b', 'Bash', { command }, { cwd }), res('b', body)], {}).patterns;

test('ARC-09-C267 replay B4 (a) — a name filter names a page only below the folder the search ran on, in an unresolved call as in B3', () => {
  const ITSM = `${MD}/it-service-management`;
  const here = 'markdown/it-service-management/c_Escalation.md';
  const there = 'markdown/hr-service-delivery/c_Escalation.md';
  for (const command of [
    `find ${ITSM} -name 'c_Esc*' | xargs cat`, `find ${ITSM} -iname 'C_ESC*' | xargs cat`, `rg -l -g 'c_Esc*' x ${ITSM} | xargs cat`, `rg --files --iglob 'C_ESC*' ${ITSM} | xargs cat`,
    `grep -rl --include='c_Esc*' x ${ITSM} | xargs cat`, `fd -g 'c_Esc*' ${ITSM} | xargs cat`, `cd ${ITSM} && find -name 'c_Esc*' | xargs cat`, `cd ${ITSM} && rg --files -g 'c_Esc*' | xargs cat`,
    `find ${ITSM} -path '*/it-service-management/c_Esc*' -exec cat {} +`,
  ]) {
    const got = kept(command);
    assert.equal(shownBy(got, here), true, command);
    assert.equal(shownBy(got, there), false, `${command}: a page of another area`);
  }
  const ps = { powershell: true, cwd: 'C:/home/dev/install', rowCwd: 'C:/home/dev/install' };
  const win = 'C:\\home\\dev\\install\\vendor\\ServiceNowDocs\\markdown\\it-service-management';
  for (const command of [`Get-ChildItem -Path ${win} -Recurse -Filter c_Esc*.md | Get-Content`, `gci -Path ${win} -Recurse -Include c_Esc*.md | Get-Content`]) {
    const got = kept(command, ps);
    assert.equal(shownBy(got, here), true, command);
    assert.equal(shownBy(got, there), false, `${command}: a page of another area`);
  }
  // two folders: the pages of both, and of no other
  const both = kept(`find ${ITSM} ${MD}/customer-service-management -name 'c_Esc*' | xargs cat`);
  assert.equal(shownBy(both, here), true);
  assert.equal(shownBy(both, 'markdown/customer-service-management/c_Escalation.md'), true);
  assert.equal(shownBy(both, there), false);
  // a regex of find: the folder it names
  const regex = kept(`find ${ITSM} -regex '.*c_Esc.*' | xargs cat`);
  assert.equal(shownBy(regex, here), true);
  assert.equal(shownBy(regex, there), false);
});

test('ARC-09-C267 replay B4 (a) — with no corpus folder a name filter names nothing: a folder of the project, one outside it, one the call cannot tell', () => {
  for (const command of ["find . -name 'c_Esc*' | xargs cat", "find /tmp -name 'c_Esc*' | xargs cat", "rg -l -g 'c_Esc*' x clients/acme | xargs cat", "find \"$DOCS\" -name 'c_Esc*' | xargs cat",
    "find . -regex '.*c_Esc.*' | xargs cat", "find -iregex '.*c_esc.*' | xargs cat", "grep -rl --include='*.md' x /home/dev/notes | xargs cat", "fd -g '*.md' /tmp | xargs cat"]) {
    assert.deepEqual(kept(command), [], command);
  }
  // the project folder is no corpus folder; the corpus folder the shell stands in is
  assert.deepEqual(kept("find -name 'c_Esc*' | xargs cat").length, 0);
  assert.equal(shownBy(kept("find -name 'c_Esc*' | xargs cat", { cwd: `${MD}/it-service-management`, rowCwd: '/home/dev/install' }), 'markdown/it-service-management/c_Escalation.md'), true);
});

test('ARC-09-C267 replay B4 (a) — B3: grep -rh --include=*.md names the pages of the folder it ran on, and only those', () => {
  const folder = `${MD}/platform-administration`;
  const got = afterRun(`grep -rh --include='*.md' assign ${folder}`, '1\tassign the incident');
  assert.equal(shownBy(got, 'markdown/platform-administration/r_BaselineEmailNotifications.md'), true);
  assert.equal(shownBy(got, 'markdown/platform-administration/user-administration/r_BaseSystemRoles.md'), true, 'below it');
  assert.equal(shownBy(got, 'markdown/governance-risk-compliance/configure-entity-approvals.md'), false, 'another area');
  // the soak\'s command still covers its page, and no other area\'s
  const soak = afterRun(`grep -rh --include='c_AssignmentRules*' -m 3 'assign' ${folder}/table-administration-and-data-management`, '1\tassign');
  assert.equal(shownBy(soak, 'markdown/platform-administration/table-administration-and-data-management/c_AssignmentRulesModule.md'), true);
  assert.equal(shownBy(soak, 'markdown/it-service-management/c_AssignmentRulesModule.md'), false);
  // the shell's own folder
  const own = afterRun("grep -rh --include='*.md' assign", '1\tassign', `${MD}/platform-administration`);
  assert.equal(shownBy(own, 'markdown/platform-administration/r_BaselineEmailNotifications.md'), true);
  assert.equal(shownBy(own, 'markdown/governance-risk-compliance/configure-entity-approvals.md'), false);
});

// ---- B4 (b): B3 needs the filtered search to be the only segment that prints -----------------------------------------------------------------------
test('ARC-09-C267 replay B4 (b) — B3 applies only when the filtered search is the call\'s only printing segment: alone, or piped into head, tail, cut, sort or uniq', () => {
  const folder = `${MD}/it-service-management`;
  const search = `grep -rh --include='c_Esc*' x ${folder}`;
  const page = 'markdown/it-service-management/c_Escalation.md';
  const names = (command) => shownBy(afterRun(command, '1\tx the text'), page);
  for (const command of [search, `${search} | head -10`, `${search} | tail -3`, `${search} | cut -c1-80`, `${search} | sort`, `${search} | sort | uniq | head`, `cd ${folder} && grep -rh --include='c_Esc*' x . | head`, `${search} 2>/dev/null | head -3`]) {
    assert.equal(names(command), true, command);
  }
  for (const command of [`echo start; ${search}`, `${search}; echo ----`, `${search} | head; echo ----`, `sed -n 1,5p ${folder}/c_Other.md; ${search}`, `cat ${folder}/c_Other.md && ${search}`, `ls ${folder}; ${search}`,
    `${search}; grep -rl y ${folder}`, `${search}; head -3 ${folder}/c_Other.md`, `${search} | cat`, `${search} | awk '{print $1}'`, `${search} | wc -l`, `${search} && ${search.replace('c_Esc*', 'c_Other*')}`]) {
    assert.equal(names(command), false, command);
  }
});

test('ARC-09-C267 replay B4 — the two calls of the replay (8ded40bf, 99939ce8) leave no pattern that names a page outside their folders', () => {
  const cmd1 = String.raw`cd ${MD} && sed -n 1,50p platform-administration/table-administration-and-data-management/t_AssignmentModuleRule.md; echo ----; sed -n 1,40p platform-administration/table-administration-and-data-management/r_BaselineAssignmentRulesExample.md; echo ----; grep -rn -i "support\\\?_group" --include=*.md it-service-management/incident-management configuration-management 2>/dev/null | head -10; echo ----; sed -n 1,40p it-service-management/incident-management/c_IncidentManagementStateModel.md | cut -c1-400; echo; grep -n "P1\|Critical\|1 - Critical" it-service-management/incident-management/def-prio-lookup-rules.md | head`;
  const body1 = '1\tTo assign a record\n----\n50:    |1 - High|\n';
  const got1 = afterRun(cmd1, body1);
  for (const page of ['markdown/platform-administration/r_BaselineEmailNotifications.md', 'markdown/platform-administration/t_DataLookupRule.md', 'markdown/governance-risk-compliance/configure-entity-approvals.md']) {
    assert.equal(shownBy(got1, page), false, page);
  }
  const cmd2 = String.raw`cd ${MD}/governance-risk-compliance && grep -rn -E "risk\\?_asmt\\?_project|project\\?_user|project\\?_reader" --include=*.md . | cut -c1-300 | head -30; echo ----; grep -rln -E "business\\?_user" . | head -30`;
  const got2 = afterRun(cmd2, '(eval):1: no matches found: --include=*.md\n----\n./a/b.md\n./c.md\n');
  for (const page of ['markdown/platform-administration/r_BaselineEmailNotifications.md', 'markdown/governance-risk-compliance/configure-entity-approvals.md', 'markdown/reporting-views-from-ram.md', 'markdown/governance-risk-compliance/risk-rollup-ara-concept.md']) {
    assert.equal(shownBy(got2, page), false, page);
  }
});

// ---- B4 (c): a pattern with no folder that names more pages than the ubiquity counts for none ------------------------------------------------------
test('ARC-09-C267 replay B4 (c) — a pattern with no folder that names more than ubiquityPages pages counts for none; a narrow one, and one with a folder, count', () => {
  const pages = [];
  for (let k = 0; k < 600; k += 1) pages.push(`markdown/it-service-management/c_Rule${k}.md`);
  for (let k = 0; k < 3; k += 1) pages.push(`markdown/hr-service-delivery/c_Esc${k}.md`);
  pages.push('markdown/customer-service-management/c_Esc.md');
  const options = { allPages: () => pages, ubiquity: 500 };
  const cited = 'markdown/it-service-management/c_Rule7.md';
  const folderless = (command, opts = { cwd: null, rowCwd: null, lost: true }) => kept(command, opts);
  // no folder known (a cd the call cannot tell): `*.md` and `c_*.md` name the corpus
  assert.equal(shownBy(folderless('cd "$HOME/x" && cat *.md'), cited, options), false, '*.md');
  assert.equal(shownBy(folderless('cd "$HOME/x" && cat c_*.md'), cited, options), false, 'c_*.md');
  assert.equal(shownBy(folderless('for f in **/*.md; do head -3 "$f"; done'), cited, options), false, '**/*.md');
  assert.equal(shownBy(folderless('for f in $DIR/*.md; do head -3 "$f"; done'), cited, options), false, 'a folder that is a variable');
  assert.equal(shownBy(folderless('python3 -c "import glob; print(glob.glob(\'**/*.md\'))"'), cited, options), false, 'a script token');
  assert.equal(shownBy(folderless('python3 -c "import glob; print(glob.glob(\'markdown/*/*.md\'))"'), cited, options), false, 'a pattern with only the corpus root for a folder');
  // narrow: three pages, a folder-less pattern counts
  assert.equal(shownBy(folderless('cd "$HOME/x" && cat c_Esc*.md'), 'markdown/hr-service-delivery/c_Esc1.md', options), true, 'c_Esc*.md');
  // a folder: a loop over a big folder opened its pages
  const withFolder = kept(`for f in ${MD}/it-service-management/c_Rule*.md; do head -3 "$f"; done`);
  assert.equal(shownBy(withFolder, cited, options), true, 'a pattern with a folder counts however many pages it names');
  assert.equal(shownBy(kept('for f in it-service-management/c_*.md; do head -3 "$f"; done', { cwd: null, rowCwd: null, lost: true }), cited, options), true, 'a relative folder too');
  // no listing of the corpus: nothing can be said, and the pattern counts
  assert.equal(shownBy(folderless('cd "$HOME/x" && cat *.md'), cited, {}), true);
  assert.equal(shownBy(folderless('cd "$HOME/x" && cat *.md'), cited, { allPages: () => null }), true);
  // the ubiquity is the classes file's
  assert.equal(shownBy(folderless('cd "$HOME/x" && cat c_Esc*.md'), 'markdown/hr-service-delivery/c_Esc1.md', { allPages: () => pages, ubiquity: 2 }), false, '4 pages are over a ubiquity of 2');
  // exactly the ubiquity is not over it
  assert.equal(shownBy(folderless('cd "$HOME/x" && cat c_Esc*.md'), 'markdown/hr-service-delivery/c_Esc1.md', { allPages: () => pages, ubiquity: 4 }), true, '4 pages are not more than 4');
  assert.equal(shownBy(folderless('cd "$HOME/x" && cat c_Esc*.md'), 'markdown/hr-service-delivery/c_Esc1.md', { allPages: () => pages, ubiquity: 3 }), false, '4 pages are more than 3');
});
