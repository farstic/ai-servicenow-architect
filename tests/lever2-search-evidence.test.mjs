// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C267, lever 2, B8 — the architect's replay of the hook over the C268 sessions found the last two citations of a page that was never opened that the hook did not
 * ask about, both after a successful search: a multi-file grep that matched nothing in one of its files, and a grep whose pattern missed the page's markdown escapes
 * (`sn_aia_tool` against `sn\_aia\_tool`). A search verb (grep, egrep, fgrep, rg, Select-String) showed every page it names; it shows a page only when its result holds
 * a line of that page. The whole-file viewers (cat, sed, head, tail, awk, nl) keep "named is shown". The hook-level cases are tests/hook/stop-lever2-search-evidence.test.mjs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { walkThread } from '../tools/snowarch/lib/docs/read-routes.mjs';
import { U, res, use } from './helpers/lever2.mjs';

const CORPUS = '/arms/N/clone/vendor/ServiceNowDocs';
const CSM = 'markdown/customer-service-management';
const SELF = `${CSM}/self-service-options-csm-customers.md`;
const CASE = `${CSM}/csm-case-management.md`;
const AIA = 'markdown/intelligent-experiences/na-aia-reference.md';
const RULES = 'markdown/it-service-management/c_AssignmentRulesModule.md';
const LONG = 'markdown/it-service-management/c_LongPage.md';
const TERSE = 'markdown/it-service-management/c_Terse.md';
const TEXT = {
  [SELF]: 'Self-service options for customers of CSM.\nCustomers can attach a file to a case from the portal.\nThey can also reopen a case that they closed.\n',
  [CASE]: 'Case management covers the whole life of a case.\nAn agent may attach a document when updating the case.\nThe case is closed when the customer accepts.\n',
  [AIA]: 'The agent tools are stored in sn\\_aia\\_tool and grouped by sn\\_aia\\_usecase and sn\\_aia\\_team.\n',
  [RULES]: 'Assignment rules run in order.\n-   The task record must be unassigned before a rule applies.\nA rule never reassigns a task.\n',
  [LONG]: `${Array.from({ length: 600 }, (_, k) => `Line ${k} of a long page that carries enough words.`).join('\n')}\n`,
  [TERSE]: 'A.\nB.\n',
};
const AREA = `${CORPUS}/${CSM}`;
const MD = `${CORPUS}/markdown`;
const IT = `${CORPUS}/markdown/it-service-management`;
// A session runs from the install folder and moves into the corpus with `cd`, as the C268 sessions did; `folder: null` is a command that has its own.
const ran = (command, output, { folder = IT, tool = 'Bash' } = {}) => [use('b', tool, { command: folder ? `cd ${folder}; ${command}` : command }, { cwd: '/home/dev/install' }), res('b', output)];
const reached = (rows, { seam = true } = {}) => [...walkThread([U('how?'), ...rows], { pageExists: (page) => page in TEXT, ...(seam ? { pageText: (page) => TEXT[page] ?? null } : {}) }).reached.keys()];

// ---- the architect's three cases, from the C268 replay -----------------------------------------------------------------------------------------------
test('ARC-09-C267 B8 — a multi-file grep shows the pages whose lines it printed, and not the one it matched nothing in', () => {
  const command = `cd ${AREA}; ls a.md b.md csm-case-management.md 2>&1; sed -n 15,45p self-service-options-csm-customers.md; grep -n -i "attach" self-service-options-csm-customers.md csm-case-management.md | head -5`;
  const listing = 'ls: a.md: No such file or directory\nls: b.md: No such file or directory\ncsm-case-management.md';
  const sed = TEXT[SELF];
  const grepSelf = 'self-service-options-csm-customers.md:2:Customers can attach a file to a case from the portal.';
  // his case (1): the grep printed no line of csm-case-management.md, so a later citation of it is asked about; the sed shows the other page
  assert.deepEqual(reached(ran(command, `${listing}\n${sed}${grepSelf}`, { folder: null })), [SELF]);
  // the same grep that printed a line of it shows it
  assert.deepEqual(reached(ran(command, `${listing}\n${sed}${grepSelf}\ncsm-case-management.md:2:An agent may attach a document when updating the case.`, { folder: null })), [SELF, CASE]);
  // `-h` prints no file name: the line is the page's text, and that names it
  const bare = 'grep -h -n -i "attach" self-service-options-csm-customers.md csm-case-management.md';
  assert.deepEqual(reached(ran(bare, '2:Customers can attach a file to a case from the portal.', { folder: AREA })), [SELF]);
  assert.deepEqual(reached(ran(bare, '2:Customers can attach a file to a case from the portal.\n2:An agent may attach a document when updating the case.', { folder: AREA })), [SELF, CASE]);
});

test('ARC-09-C267 B8 — a grep whose pattern misses the page\'s markdown escapes shows nothing; the escaped pattern, and a line that matched, show the page', () => {
  // his case (2): the page writes sn\_aia\_tool, the pattern has sn_aia_tool, and there is no match
  const missed = 'grep -n "sn_aia_tool\\|sn_aia_usecase\\|sn_aia_team\\b" intelligent-experiences/na-aia-reference.md | head -6';
  assert.deepEqual(reached(ran(missed, '', { folder: MD })), []);
  const escaped = 'grep -n "sn\\\\_aia\\\\_tool" intelligent-experiences/na-aia-reference.md | head -6';
  assert.deepEqual(reached(ran(escaped, '1:The agent tools are stored in sn\\_aia\\_tool and grouped by sn\\_aia\\_usecase and sn\\_aia\\_team.', { folder: MD })), [AIA]);
  // his case (3), the control: a line `N:text` of the page shows it
  assert.deepEqual(reached(ran('grep -n "unassigned" c_AssignmentRulesModule.md', '2:-   The task record must be unassigned before a rule applies.')), [RULES]);
  // a search piped into a count prints no line of the page
  assert.deepEqual(reached(ran('grep -n "unassigned" c_AssignmentRulesModule.md | wc -l', '1')), []);
  // the other verbs: egrep, fgrep, rg
  for (const verb of ['egrep', 'fgrep', 'rg']) {
    assert.deepEqual(reached(ran(`${verb} -n "zzz" c_AssignmentRulesModule.md`, '')), [], `${verb}, no line`);
    assert.deepEqual(reached(ran(`${verb} -n "unassigned" c_AssignmentRulesModule.md`, '2:-   The task record must be unassigned before a rule applies.')), [RULES], `${verb}, a line`);
  }
  // PowerShell: Select-String prints path:N:text
  const select = 'Select-String unassigned c_AssignmentRulesModule.md';
  assert.deepEqual(reached(ran(select, '', { tool: 'PowerShell' })), []);
  assert.deepEqual(reached(ran(select, 'c_AssignmentRulesModule.md:2:-   The task record must be unassigned before a rule applies.', { tool: 'PowerShell' })), [RULES]);
});

// ---- what stays: the guard is 0 false "never opened" --------------------------------------------------------------------------------------------------
test('ARC-09-C267 B8 — whole-file viewers keep "named is shown", in either order with a search; without the page text, and for a page that cannot be compared, a search keeps it too', () => {
  for (const viewer of ['cat', 'head -5', 'tail -5', "sed -n '1,5p'", "awk 'NR<5'", 'nl']) {
    assert.deepEqual(reached(ran(`${viewer} c_AssignmentRulesModule.md`, '')), [RULES], viewer);
  }
  // a page that a viewer and a search both name is the viewer's, whichever comes first
  assert.deepEqual(reached(ran('grep -n zzz c_AssignmentRulesModule.md; sed -n 1,2p c_AssignmentRulesModule.md', 'Assignment rules run in order.')), [RULES]);
  assert.deepEqual(reached(ran('sed -n 1,2p c_AssignmentRulesModule.md; grep -n zzz c_AssignmentRulesModule.md', 'Assignment rules run in order.')), [RULES]);
  // with no page text to compare with, or a page with no line to compare, the search shows the page as it did
  assert.deepEqual(reached(ran('grep -n zzz c_AssignmentRulesModule.md', ''), { seam: false }), [RULES]);
  assert.deepEqual(reached(ran('grep -n zzz c_Terse.md', '')), [TERSE]);
  // an output whose shape is not the lines of the page (`-o` prints the match) shows the page, unless it printed nothing at all
  assert.deepEqual(reached(ran('grep -on unassigned c_AssignmentRulesModule.md', '2:unassigned')), [RULES]);
  assert.deepEqual(reached(ran('grep --only-matching unassigned c_AssignmentRulesModule.md', 'unassigned')), [RULES]);
  assert.deepEqual(reached(ran('grep -on unassigned c_AssignmentRulesModule.md', '')), []);
  // a match anywhere in a long page, and a context line, are the page's text
  assert.deepEqual(reached(ran('grep -n "Line 450 " c_LongPage.md', '451:Line 450 of a long page that carries enough words.')), [LONG]);
  assert.deepEqual(reached(ran('grep -n -C1 "Line 450 " c_LongPage.md', '450-Line 449 of a long page that carries enough words.\n451:Line 450 of a long page that carries enough words.')), [LONG]);
  assert.deepEqual(reached(ran('grep -n -C1 "Line 450 " c_LongPage.md', '450-Line 449 of a long page that carries enough words.')), [LONG]);
  // a line of another page is not the page's
  assert.deepEqual(reached(ran('grep -n "zzz" c_LongPage.md; sed -n 1,2p c_AssignmentRulesModule.md', 'Assignment rules run in order.')), [RULES]);
});
