// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C291 — a cited page must print the name it is cited for, as a class of the grounding check (`unsupportedName`), on the pure function. The Stop hook's cases are
 * tests/hook/stop-citation-support.test.mjs, and the text rules (what a construct is, what hedges a line) are tests/name-support.test.mjs.
 *
 * A reply line that cites a corpus page, by path or by a bare file name that names one page, and names a snake_case construct, must have a page it cites print that
 * construct. One it does not is either ELSEWHERE (the names index has it on another page) or ABSENT (the names index has it on none), and the ask says which.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KINDS, LEAD, groundingFindings, parseClasses, residualFindings, supportFindings } from '../tools/snowarch/lib/docs/grounding-check.mjs';
import { normalisePage } from '../tools/snowarch/lib/docs/name-support.mjs';
import { A as assistant, U, res, use } from './helpers/lever2.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RULES = 'markdown/financial-services-operations/assignment-rules.md';                 // prints sn_bom_claim and the label "assignment group", not sysrule_assignment
const TABLE = 'markdown/financial-services-operations/c_SysruleAssignment.md';              // prints sysrule_assignment
const OTHER = 'markdown/it-service-management/c_Other.md';
const THIRD = 'markdown/it-service-management/c_Third.md';
const FOURTH = 'markdown/it-service-management/c_Fourth.md';
const TEXT = {
  [RULES]: 'Assignment rules route a claim to a group.\nThe assignment group field is set.\nThe table sn\\_bom\\_claim holds the claim.\n',
  [TABLE]: 'The sysrule\\_assignment table holds the rules.\n',
  [OTHER]: 'Escalation of a case. The sys\\_user table.\n',
  [THIRD]: 'A third page.\n',
  [FOURTH]: 'A fourth page.\n',
};
const pageNorm = (page) => (Object.hasOwn(TEXT, page) ? normalisePage(TEXT[page]) : null);
/** The names index's API, for the names of `names` ({ name: [pages] }). */
function fakeIndex(names, { coverage = 'full' } = {}) {
  return { coverage, meta: { coverage }, pageCount: 5, nameCount: Object.keys(names).length, has: (n) => Object.hasOwn(names, n), count: (n) => (names[n] ?? []).length, pathsOf: (n) => names[n] ?? [], pagesOf: () => [] };
}
const INDEX = fakeIndex({ sysrule_assignment: [TABLE], sn_bom_claim: [RULES], sys_user: [OTHER], known_a: [TABLE], known_b: [TABLE], known_c: [TABLE], known_d: [TABLE] });
const text = (t) => assistant([{ type: 'text', text: t }]);

const check = (reply, { index = INDEX, blocking = ['unsupportedName'], pagesNamed = () => [], norm = pageNorm, rows = null, options = {} } = {}) =>
  groundingFindings({ rows, reply, index, options: { blocking, askedOnly: true, pagesNamed, pageNorm: norm, pageExists: () => true, ...options } });
const items = (r) => r.findings.unsupportedName.map((i) => [i.name, i.where, ...i.pages]);
const cite = (page) => `(citation: ${page})`;

const OWN = 'For a name of your own design, leave it and add no line for it.';
const ELSEWHERE = (list) => `These names are not printed on the page you cite for them: ${list}. For each platform name, add one line that starts "Correction:" and cites a page that prints it (docs lookup finds one). ${OWN}`;
const ABSENT = (list) => `No corpus page prints ${list}. For each platform name, say in a line that starts "Correction:" that the corpus does not document it. ${OWN}`;
/** Once, after the last names clause. */
const NOT_AGAIN = 'Do not repeat the answer.';
const NEVER_OPENED = (pages) => `You cited pages that this session never opened: ${pages}. Open each one now. Where a page contradicts your answer, correct the answer. Where a citation only tells the reader where to look, mark it as a pointer on its Correction line.`;
/** The registered closing paragraph, taken from an ask that has no other kind of clause than a never-opened page. */
const TAIL = (() => {
  const body = groundingFindings({ rows: [U('q'), text(`See ${RULES}.`)], reply: `See ${RULES}.`, options: { blocking: ['citedUnread'], pageExists: () => true } }).reasonBody;
  return body.slice(body.indexOf('Then add one line for each'));
})();

test('ARC-09-C291 — a name that a cited page prints is supported, whatever the page\'s spelling of it', () => {
  assert.deepEqual(items(check(`The \`sn_bom_claim\` table holds the claim ${cite(RULES)}.`)), []);
  assert.deepEqual(items(check(`The \`sn\\_bom\\_claim\` table, escaped as the page has it ${cite(RULES)}.`)), [], 'the escaped form on the line, and on the page');
  assert.deepEqual(items(check(`The \`SN_BOM_CLAIM\` table, in capitals ${cite(RULES)}.`)), [], 'case ignored');
  assert.deepEqual(items(check(`Set the \`assignment_group\` ${cite(RULES)}.`)), [], 'the page prints the label only, "assignment group"');
  assert.equal(check(`The \`sn_bom_claim\` table ${cite(RULES)}.`).reasonBody, null);
  assert.deepEqual(items(check(`The \`sysrule_assignment\` table ${cite(RULES)} and ${cite(TABLE)}.`)), [], 'any page the line cites will do');
  assert.deepEqual(items(check(`The \`sn_bom_claim\` table ${cite(OTHER)} and ${cite(RULES)}.`, { index: fakeIndex({}) })), [], 'any page, when the index says nothing: the page\'s own text is what supports it');
  assert.deepEqual(items(check(`The \`sysrule_assignment\` table ${cite(RULES)}.`, { index: fakeIndex({ sysrule_assignment: [RULES] }) })), [], 'a name that the index puts on the cited page is printed on it');
});

test('ARC-09-C291 — a name that no cited page prints is ELSEWHERE when the index has it on another page, and says so in the ask', () => {
  const r = check(`The \`sysrule_assignment\` table holds the rules ${cite(RULES)}.`);
  assert.deepEqual(items(r), [['sysrule_assignment', 'elsewhere', RULES]]);
  assert.deepEqual(r.blocks, ['unsupportedName']);
  assert.equal(r.reasonBody, [LEAD, ELSEWHERE(`\`sysrule_assignment\` (${RULES})`), NOT_AGAIN, TAIL].join(' '));
});

test('ARC-09-C291 — a name that no page of the corpus prints is ABSENT, and says so in the ask', () => {
  const r = check(`The \`fso_claim_score\` field is computed ${cite(RULES)}.`);
  assert.deepEqual(items(r), [['fso_claim_score', 'absent', RULES]]);
  assert.equal(r.reasonBody, [LEAD, ABSENT('`fso_claim_score`'), NOT_AGAIN, TAIL].join(' '), 'it closes with the one sentence that ELSEWHERE has');
  // two of each kind, in one ask: the pages in parentheses for ELSEWHERE, plain names for ABSENT
  const both = check(`The \`sysrule_assignment\` and \`fso_claim_score\` and \`fso_other_score\` ${cite(RULES)}.\nThe \`known_a\` ${cite(OTHER)}.`);
  assert.equal(both.reasonBody, [LEAD, ELSEWHERE(`\`sysrule_assignment\` (${RULES}); \`known_a\` (${OTHER})`), ABSENT('`fso_claim_score`, `fso_other_score`'), NOT_AGAIN, TAIL].join(' '), 'the sentence once, after the last clause');
  assert.equal(both.reasonBody.split(NOT_AGAIN).length, 2);
});

test('ARC-09-C291 — a hedged line, an anti-pattern line and a name that is none of the model\'s claims are never asked about', () => {
  for (const line of [
    `The page does not mention \`sysrule_assignment\` ${cite(RULES)}.`, `\`sysrule_assignment\` is not documented ${cite(RULES)}.`, `Unverified: \`sysrule_assignment\` ${cite(RULES)}.`,
    `\`sysrule_assignment\` is not on this page ${cite(RULES)}.`, `Open question: is \`sysrule_assignment\` the table? ${cite(RULES)}`,
    `- Don't use \`sysrule_assignment\` ${cite(RULES)}.`, `1. **Never** write \`sysrule_assignment\` ${cite(RULES)}.`, `**Avoid** \`sysrule_assignment\` ${cite(RULES)}.`,
    `Use \`u_claim_score\`, \`x_acme_claims_score\` and \`snow_core_records_query\` ${cite(RULES)}.`, `The table \`sn_<scope>_claim\` and \`{table}_name\` ${cite(RULES)}.`,
    `Run my_script.js for the claim ${cite(RULES)}.`, `Names without an underscore: claim, score ${cite(RULES)}.`, 'The `sysrule_assignment` table, with no page cited.',
  ]) assert.deepEqual(items(check(line)), [], line);
  // the same line without the hedge is asked about: the hedge is what silences it
  assert.equal(check(`The page prints \`sysrule_assignment\` ${cite(RULES)}.`).findings.unsupportedName.length, 1);
  assert.equal(check(`You should never use \`sysrule_assignment\` ${cite(RULES)}.`).findings.unsupportedName.length, 1, 'never, not at the start');
});

test('ARC-09-C291 — a bare file name that names exactly one page is a citation; one that names several, or none, is not', () => {
  const only = (n) => (n === 'assignment-rules.md' ? [RULES] : []);
  const r = check('The `sysrule_assignment` table is in assignment-rules.md.', { pagesNamed: only });
  assert.deepEqual(items(r), [['sysrule_assignment', 'elsewhere', RULES]], 'the ask names the page, in full');
  assert.deepEqual(items(check('The `sysrule_assignment` table is in assignment-rules.md.', { pagesNamed: () => [RULES, OTHER] })), [], 'two pages of that name');
  assert.deepEqual(items(check('The `sysrule_assignment` table is in assignment-rules.md.', { pagesNamed: () => [] })), [], 'no page of that name');
  assert.deepEqual(items(check('The `sysrule_assignment` table is in README.md.', { pagesNamed: () => [RULES] })), [], 'a file that is no page of the corpus');
  assert.deepEqual(items(check('The `sysrule_assignment` table is in assignment-rules.md and mentions `sn_bom_claim`.', { pagesNamed: only })), [['sysrule_assignment', 'elsewhere', RULES]], 'a supported name beside it');
  assert.deepEqual(items(check(`The \`sysrule_assignment\` table ${cite(RULES)} and assignment-rules.md.`, { pagesNamed: only })), [['sysrule_assignment', 'elsewhere', RULES]], 'the same page by its path and by its name is listed once');
});

test('ARC-09-C291 — the ask lists at most six names, filled with ABSENT first and then ELSEWHERE, each in the order it appears, the ELSEWHERE clause printed first, and counts the rest', () => {
  const lines = ['missing_a', 'known_a', 'missing_b', 'known_b', 'missing_c', 'known_c', 'missing_d', 'known_d'].map((n) => `The \`${n}\` ${cite(RULES)}.`);
  const r = check(lines.join('\n'));
  assert.equal(r.findings.unsupportedName.length, 8, 'all eight are findings');
  assert.equal(r.reasonBody, [LEAD,
    ELSEWHERE(['a', 'b'].map((x) => `\`known_${x}\` (${RULES})`).join('; ')),
    ABSENT('`missing_a`, `missing_b`, `missing_c`, `missing_d`'),
    NOT_AGAIN,
    'And 2 more of these: check each the same way before you finish.', TAIL].join(' '), 'four ABSENT fill the first slots, two ELSEWHERE the rest');
  // a name that the answer writes twice is one finding, with the pages of the first line
  const twice = check(`The \`sysrule_assignment\` ${cite(RULES)}.\nAgain \`sysrule_assignment\` ${cite(OTHER)}.`);
  assert.deepEqual(items(twice), [['sysrule_assignment', 'elsewhere', RULES]]);
  // a line that cites four pages lists three of them
  const many = check(`The \`sysrule_assignment\` ${cite(RULES)} ${cite(OTHER)} ${cite(THIRD)} ${cite(FOURTH)}.`);
  assert.deepEqual(items(many), [['sysrule_assignment', 'elsewhere', RULES, OTHER, THIRD]]);
});

test('ARC-09-C291 — the check reads the final reply only, and not a fenced block, and not when it cannot judge', () => {
  const claim = `The \`sysrule_assignment\` table ${cite(RULES)}.`;
  const rows = [U('q'), text(claim), use('t1', 'Bash', { command: 'ls' }), res('t1', 'ok'), text('Done.')];
  assert.deepEqual(items(check('Done.', { rows })), [], 'an earlier block of the turn is not the reply');
  assert.deepEqual(items(check(claim, { rows: [U('q'), text('draft'), use('t1', 'Bash', { command: 'ls' }), res('t1', 'ok'), text(claim)] })), [['sysrule_assignment', 'elsewhere', RULES]]);
  assert.deepEqual(items(check(`\`\`\`\n${claim}\n\`\`\``)), [], 'a line in a fence');
  assert.deepEqual(items(check(claim, { norm: () => null })), [], 'a page that cannot be read cannot be judged');
  assert.deepEqual(items(check(`The \`sysrule_assignment\` ${cite(RULES)} ${cite(OTHER)}.`, { norm: (p) => (p === RULES ? null : pageNorm(p)) })), [], 'nor when one of the pages cannot');
  assert.deepEqual(items(groundingFindings({ rows: null, reply: claim, index: INDEX, options: { blocking: ['unsupportedName'], askedOnly: true, pagesNamed: () => [] } })), [], 'no way to read a page');
  assert.deepEqual(items(check(claim, { index: null })), [], 'no names index: the two kinds cannot be told apart');
  assert.deepEqual(items(check(claim, { index: {} })), [], 'an index that cannot say where a name is printed');
  assert.deepEqual(items(check(claim, { norm: () => undefined })), [], 'a reader that says nothing of the page');
  assert.deepEqual(items(groundingFindings({ rows: null, reply: `${claim} See also assignment-rules.md.`, index: INDEX, options: { blocking: ['unsupportedName'], askedOnly: true, pageNorm } })), [['sysrule_assignment', 'elsewhere', RULES]],
    'a caller with no way to name a bare file still checks a path, and a bare file name is no citation then');
  let reads = 0;
  check(`See ${cite(RULES)} for the claim.`, { norm: (p) => { reads += 1; return pageNorm(p); } });
  assert.equal(reads, 0, 'a page is not read for a line that names no construct');
  assert.equal(check(claim, { blocking: ['citedUnread'] }).reasonBody, null, 'a class that does not block does not ask');
  assert.equal(check(claim, { blocking: ['citedUnread'] }).findings.unsupportedName.length, 0, 'and is not computed for a caller that only asks');
  assert.equal(check(claim, { blocking: ['citedUnread'], options: { askedOnly: false } }).findings.unsupportedName.length, 1, 'but is for a replay or a grader, which computes every class');
  // a sparse index cannot say that no page prints a name: ABSENT is not asked, ELSEWHERE still is
  const sparse = check(`The \`sysrule_assignment\` and \`fso_claim_score\` ${cite(RULES)}.`, { index: fakeIndex({ sysrule_assignment: [TABLE] }, { coverage: 'disk' }) });
  assert.deepEqual(items(sparse), [['sysrule_assignment', 'elsewhere', RULES]]);
});

test('ARC-09-C291 — the notice to the user names no name: not one that stays after the ask, and not one that first appears in the continuation', () => {
  const first = `The \`sysrule_assignment\` table ${cite(RULES)}.`;
  const options = { blocking: ['unsupportedName'], askedOnly: true, pagesNamed: () => [], pageNorm, pageExists: () => true };
  const ask = groundingFindings({ rows: [U('q'), text(first)], reply: first, index: INDEX, options }).reasonBody;
  assert.ok(ask, 'the first answer is asked about');
  const feedback = U(`Stop hook feedback:\n${ask}`, { isMeta: true });
  for (const line of [`Still \`sysrule_assignment\` ${cite(RULES)}.`, `Now \`fso_claim_score\` ${cite(RULES)}.`]) {
    const r = residualFindings({ rows: [U('q'), text(first), feedback, text(line)], reply: line, index: INDEX, options: { ...options, lead: LEAD } });
    assert.equal(r.ours, true, 'the block is ours');
    assert.deepEqual(r.open, [], line);
    assert.equal(r.text, null, line);
  }
});

test('ARC-09-C291 — the cap of six is for the names: the pages of a never-opened ask keep their own', () => {
  const pages = Array.from({ length: 8 }, (_, k) => `markdown/it-service-management/c_Page${k}.md`);
  const reply = `${pages.map((p) => `The rule is in ${cite(p)}.`).join('\n')}\nThe \`sysrule_assignment\` table ${cite(pages[0])}.`;
  const r = groundingFindings({ rows: [U('q'), text(reply)], reply, index: INDEX, options: { blocking: ['citedUnread', 'unsupportedName'], askedOnly: true, pagesNamed: () => [], pageNorm: () => 'nothing', pageExists: () => true } });
  assert.ok(r.reasonBody.includes(NEVER_OPENED(pages.join(', '))), 'all eight pages are listed');
});

test('ARC-09-C291 — a line of 100,000 characters is read in linear time by the whole check, and a line of citations by the function itself', () => {
  const shapes = [`${'x_'.repeat(50000)}y`, 'a'.repeat(100000), 'a.'.repeat(50000), 'sys_user.'.repeat(11000), `does not${' '.repeat(100000)}x`];
  for (const line of shapes) {
    const start = performance.now();
    check(`${line} ${cite(RULES)}`);
    assert.ok(performance.now() - start < 1000, `${line.slice(0, 12)}…: ${(performance.now() - start).toFixed(0)} ms`);
  }
  // 40,000 `markdown/` in a line: the citation pattern of this class is bounded to a path's length, and does not rescan the rest of the line from each (the older loop of the
  // citedUnread class takes 8 s on this line, on develop too; it is not this row's)
  const start = performance.now();
  supportFindings({ lines: [[`${'markdown/'.repeat(40000)} ${cite(RULES)}`, 0]], index: INDEX, pageNorm, pagesNamed: () => [] });
  assert.ok(performance.now() - start < 1000, `markdown/ repeated: ${(performance.now() - start).toFixed(0)} ms`);
});

test('ARC-09-C291 — it folds into the one ask beside a never-opened page, and past the deadline asks nothing', () => {
  const reply = `The rule is in ${cite(RULES)}.\nThe \`sysrule_assignment\` table ${cite(RULES)}.`;
  const r = check(reply, { rows: [U('q'), text(reply)], blocking: ['citedUnread', 'unsupportedName'] });
  assert.equal(r.reasonBody, [LEAD, NEVER_OPENED(RULES), ELSEWHERE(`\`sysrule_assignment\` (${RULES})`), NOT_AGAIN, TAIL].join(' '), 'one lead, both lists, one tail');
  const late = check(reply, { options: { shouldStop: () => true } });
  assert.equal(late.skipped, 'deadline');
  assert.equal(late.reasonBody, null);
  assert.match(late.notes.join('\n'), /deadline/);
  // the deadline passes while the pages are read: nothing found before it is asked either
  let passed = false;
  const slow = check(`The \`sysrule_assignment\` ${cite(RULES)}.\nThe \`fso_claim_score\` ${cite(OTHER)}.`, { norm: (p) => { passed = true; return pageNorm(p); }, options: { shouldStop: () => passed } });
  assert.equal(slow.skipped, 'deadline');
  assert.equal(slow.reasonBody, null);
  assert.match(slow.notes.join('\n'), /name support check/);
});

test('ARC-09-C291 — the class is the eighth kind, shipped switched on beside citedUnread, and an unknown name is still dropped', () => {
  assert.equal(KINDS.at(-1), 'unsupportedName');
  assert.equal(KINDS.length, 8);
  assert.deepEqual(parseClasses('{"blocking":["unsupportedName","citedUnread","nonsense"]}').blocking, ['citedUnread', 'unsupportedName']);
  const shipped = parseClasses(readFileSync(join(root, 'tools', 'snowarch', 'lib', 'docs', 'grounding-classes.json'), 'utf8'));
  assert.deepEqual(shipped.blocking, ['citedUnread', 'unsupportedName']);
});
