// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C263 (M5) — the grounding check and the Stop hook that asks for it: seven classes of departure from "read until each construct is
// cited from a page you Read or a search did not find it", each with a positive and a negative case; each exemption; what the reason
// may print; one block per turn; and what the hook does when it cannot do its part.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tempDir } from '../../tools/snowarch/tests/helpers/temp.mjs';
import { DEFAULT_UBIQUITY, KEEP_OUT, KINDS, LEAD, candidatePages, groundingFindings, opening, parseClasses, residualFindings } from '../../tools/snowarch/lib/docs/grounding-check.mjs';
import { report as shippedReport } from '../../tools/snowarch/hooks/stop-citations.mjs';
import { buildNamesIndex, writeNamesIndex } from '../../tools/snowarch/lib/docs/names-index-build.mjs';
import { loadNamesIndex } from '../../tools/snowarch/lib/docs/names-index.mjs';
import { corpusNamesDir } from '../../tools/snowarch/lib/local-paths.mjs';
import { parseTranscript } from '../../tools/snowarch/lib/docs/turn-sources.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PIN = 'd'.repeat(40);

// ---- an index and a session, built for a case ---------------------------------------------------------------------------------
/** An index with the names of `names` ({ name: [pages] }), the API loadNamesIndex gives. */
function fakeIndex(names, { coverage = 'full', namespaces = new Map() } = {}) {
  return {
    coverage, namespaces, pageCount: 1, nameCount: Object.keys(names).length, meta: { coverage },
    has: (n) => Object.hasOwn(names, n), count: (n) => (names[n] ?? []).length, pathsOf: (n) => names[n] ?? [], pagesOf: () => [],
    both: (a, b) => (names[a] ?? []).filter((p) => (names[b] ?? []).includes(p)).map((_, i) => i),
  };
}
const CSM = 'markdown/customer-service-management/c_CaseEscalation.md';
const ITSM = 'markdown/itsm/c_SlaDefinition.md';
const INDEX = fakeIndex({
  sn_customerservice_escalation: [CSM, 'markdown/customer-service-management/t_Other.md'],
  task_sla: [ITSM], contract_sla: [ITSM], sys_id: Array(800).fill('markdown/misc/x.md'),
  assigned_to: ['markdown/itsm/a.md'], sub_state: ['markdown/hrsd/b.md'],
  'sn_si.major_incident_manager': ['markdown/itom/m.md'],
}, { namespaces: new Map([['sn_si', 7], ['sn_hr_core_case', 2]]) });

const A = (t) => ({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: t }] } });
const U = (t, extra = {}) => ({ type: 'user', message: { role: 'user', content: t }, ...extra });
const use = (id, name, input) => ({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] } });
const res = (id, content, extra = {}) => ({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content, ...extra }] }, ...extra });
const PAGEPATH = (rel) => `/home/dev/install/vendor/ServiceNowDocs/${rel}`;
const readPage = (id, rel, body) => [use(id, 'Read', { file_path: PAGEPATH(rel) }), res(id, body)];
const OPT = { builders: new Set(['story-writer']), rosterSkills: new Set(['csm-specialist']) };

/** The findings for `reply`, in a session that read `reads` ({ rel: body }). */
function check(reply, { reads = {}, prompt = 'how does a case escalate?', extra = [], index = INDEX, coverage, options = {}, scoped = true } = {}) {
  // The Architect's turns load a gateway first (CLAUDE.md:5); without a roster skill or a corpus read the check is narrower (see the scope case).
  const skill = scoped ? [use('sk', 'Skill', { skill: 'csm-specialist' }), res('sk', 'Launching skill: csm-specialist')] : [];
  const rows = [U(prompt), ...skill, ...Object.entries(reads).flatMap(([rel, body], k) => readPage(`r${k}`, rel, body)), ...extra];
  return groundingFindings({ rows, reply, index, coverage, options: { ...OPT, ...options } });
}
const kinds = (r) => KINDS.filter((k) => r.findings[k].length > 0);
const namesOf = (r, k) => r.findings[k].map((i) => i.name ?? i.path);

/** Every identifier-shaped run of a reason, outside paths, is a name the index holds. */
function assertNoUnheldNames(reason, index, why = '') {
  const noPaths = reason.replace(/[A-Za-z0-9_.\-/]*\/[A-Za-z0-9_.\-/]+/g, ' ');
  for (const m of noPaths.matchAll(/[A-Za-z0-9]+(?:_[A-Za-z0-9]+)+/g)) {
    assert.ok(index?.has(m[0].toLowerCase()), `the reason prints "${m[0]}", a name the index does not hold${why ? ` (${why})` : ''}`);
  }
}

// ---- falseAbsent ---------------------------------------------------------------------------------------------------------------
test('ARC-09-C263 M5 — falseAbsent: a name called not documented that the corpus prints, with candidate pages; by the index, and by a page the session Read', () => {
  const reply = 'Part 2: `sn_customerservice_escalation` — not documented in the bundled corpus — verify on the instance.';
  const r = check(reply);
  assert.deepEqual(namesOf(r, 'falseAbsent'), ['sn_customerservice_escalation']);
  assert.equal(r.findings.falseAbsent[0].pages.length, 2);
  assert.ok(r.findings.falseAbsent[0].pages.includes(CSM));
  assert.ok(r.blocks.includes('falseAbsent'));
  assert.match(r.reasonBody, /Called not documented, but the corpus prints them: `sn_customerservice_escalation` \(try /);
  // By a Read page, with no index at all: the session itself has seen a page print it.
  const noIndex = groundingFindings({ rows: [U('q'), ...readPage('r', 'markdown/csm/p.md', '1\tThe table sn\\_customerservice\\_escalation holds it.')], reply, index: null, options: OPT });
  assert.deepEqual(namesOf(noIndex, 'falseAbsent'), ['sn_customerservice_escalation']);
  // The same name, marked, when the corpus does not print it: no false absence (it is coined or unsourced, a different class).
  const real = check('`sensor_reading_x` — not documented in the bundled corpus.');
  assert.deepEqual(namesOf(real, 'falseAbsent'), []);
});

test('ARC-09-C263 M5 — falseAbsent: the escape-losing note names a search that lost its underscores', () => {
  const extra = [use('g1', 'Grep', { pattern: 'sn_customerservice_escalation', path: 'vendor/ServiceNowDocs/markdown' }), res('g1', 'No files found')];
  const r = check('`sn_customerservice_escalation` is not documented in the bundled corpus.', { extra });
  assert.equal(r.findings.falseAbsent[0].escapeNote, true);
  assert.match(r.reasonBody, /your search did not escape its underscores/);
  const escaped = [use('g2', 'Grep', { pattern: 'sn\\\\?_customerservice\\\\?_escalation', path: 'vendor/ServiceNowDocs/markdown' }), res('g2', 'No files found')];
  assert.equal(check('`sn_customerservice_escalation` is not documented in the bundled corpus.', { extra: escaped }).findings.falseAbsent[0].escapeNote, false, 'an escaped search lost nothing');
});

test('ARC-09-C263 M5 — strict attribution: the phrase must follow the name; a table row\'s first cell is its subject; words between do not mark', () => {
  const marked = (reply) => namesOf(check(reply), 'falseAbsent');
  assert.deepEqual(marked('`task_sla` is not documented here.'), ['task_sla'], 'is');
  assert.deepEqual(marked('`task_sla`: undocumented'), ['task_sla'], 'a colon');
  assert.deepEqual(marked('`task_sla` (not in the corpus)'), ['task_sla'], 'parentheses');
  assert.deepEqual(marked('`task_sla` — Citation unavailable in Australia branch — verify against engagement\'s actual release.'), ['task_sla'], 'the second marker');
  assert.deepEqual(marked('`task_sla` holds the SLA; the field below is not documented'), [], 'words between name and phrase');
  assert.deepEqual(marked('`task_sla` and `contract_sla`, both baseline, but a custom field is not documented'), [], 'a phrase later in the sentence');
  assert.deepEqual(marked('| `contract_sla` | baseline | not documented in the bundled corpus |'), ['contract_sla'], 'the first cell of a table row');
  assert.deepEqual(marked('| table | note |\n| --- | --- |\n| plain | `contract_sla` is baseline | not documented here |'), [], 'a name in a later cell is not the row\'s subject');
  assert.deepEqual(marked('verify on the instance that `task_sla` exists and is active'), [], 'an instance deferral is not an absence');
  assert.deepEqual(marked('`task_sla` — verify on the instance'), [], 'a bare "verify on the instance" is not an absence phrase');
});

test('ARC-09-C263 M5 — dotted names by qualifies(): a namespace is looked up whole, a table with a field by its parts (the five critique fixtures)', () => {
  // sn_si has seven dotted names: whole. sn_hr_core_case has two: a table written with a field, looked up by parts.
  const whole = check('`sn_si.major_incident_manager` is not documented.');
  assert.deepEqual(namesOf(whole, 'falseAbsent'), ['sn_si.major_incident_manager']);
  const absentWhole = check('`sn_si.no_such_thing` is not documented.');
  assert.deepEqual(namesOf(absentWhole, 'falseAbsent'), [], 'a qualified name the corpus does not hold is truly absent');
  const byParts = fakeIndex({ sn_hr_core_case: ['markdown/hrsd/a.md'], sub_state: ['markdown/hrsd/b.md'], state: [] }, { namespaces: new Map([['sn_hr_core_case', 2]]) });
  assert.deepEqual(namesOf(check('`sn_hr_core_case.sub_state` — not documented in the bundled corpus.', { index: byParts }), 'falseAbsent'), [],
    'each part is printed, on no page together: the pair is not documented');
  const together = fakeIndex({ sn_hr_core_case: ['markdown/hrsd/a.md'], sub_state: ['markdown/hrsd/a.md'] }, { namespaces: new Map([['sn_hr_core_case', 2]]) });
  assert.deepEqual(namesOf(check('`sn_hr_core_case.sub_state` — not documented in the bundled corpus.', { index: together }), 'falseAbsent'), ['sn_hr_core_case.sub_state']);
});

// ---- unsourcedPrinted / coined / unsourced ------------------------------------------------------------------------------------
test('ARC-09-C263 M5 — unsourcedPrinted: a name the corpus prints that no source of the session gives; the Grep sub-case; the ubiquity exemption', () => {
  const r = check('The `task_sla` table holds it.');
  assert.deepEqual(namesOf(r, 'unsourcedPrinted'), ['task_sla']);
  assert.deepEqual(r.findings.unsourcedPrinted[0].pages, [ITSM]);
  assert.equal(r.findings.unsourcedPrinted[0].found, false);
  assert.match(r.reasonBody, /In no page, skill, request or instance read of this session, though the corpus prints them: `task_sla` \(try /);
  // A Grep line that showed it: "found", with the page the line named.
  const grepped = check('The `task_sla` table holds it.', { extra: [use('g', 'Grep', { pattern: 'task\\\\?_sla', path: 'vendor/ServiceNowDocs/markdown' }), res('g', `${ITSM}:12: the task\\_sla table`)] });
  assert.equal(grepped.findings.unsourcedPrinted[0].found, true);
  assert.deepEqual(grepped.findings.unsourcedPrinted[0].foundPages, [ITSM]);
  assert.match(grepped.reasonBody, /\(your search found markdown\/itsm\/c_SlaDefinition\.md\)/);
  // On 800 pages the name is everywhere: with T = 500 it is left alone, with T = 1000 it is not.
  assert.deepEqual(namesOf(check('The `sys_id` field.'), 'unsourcedPrinted'), []);
  assert.deepEqual(namesOf(check('The `sys_id` field.', { options: { ubiquity: 1000 } }), 'unsourcedPrinted'), ['sys_id']);
});

test('ARC-09-C263 M5 — a name is sourced by a Read page, a skill, the request, a builder (indexed names only) or a saved Envelope\'s cited page', () => {
  const reply = 'Tables: `task_sla`, `contract_sla`, `assigned_to`, `sub_state`.';
  // none of them sourced: all four flagged
  assert.equal(check(reply).findings.unsourcedPrinted.length, 4);
  // a Read page prints task_sla
  assert.ok(!namesOf(check(reply, { reads: { [ITSM]: '1\tthe task\\_sla table' } }), 'unsourcedPrinted').includes('task_sla'));
  // a loaded skill prints contract_sla (prints, but never grounds a citation)
  const skill = check(reply, { extra: [U('Base directory for this skill: /home/dev/install/.claude/skills/csm-specialist\n\nThe contract_sla table.', { isMeta: true })] });
  assert.ok(!namesOf(skill, 'unsourcedPrinted').includes('contract_sla'));
  // the user wrote assigned_to
  assert.ok(!namesOf(check(reply, { prompt: 'what about assigned_to?' }), 'unsourcedPrinted').includes('assigned_to'));
  // a roster builder's Agent result: indexed names only (sub_state is indexed; a non-corpus name is not exempt)
  const builder = [use('a', 'Agent', { subagent_type: 'story-writer' }), res('a', [{ type: 'text', text: 'uses sub_state and sensor_reading_x' }])];
  const withBuilder = check('`sub_state` and `sensor_reading_x`.', { extra: builder });
  assert.ok(!namesOf(withBuilder, 'unsourcedPrinted').includes('sub_state'));
  assert.deepEqual(namesOf(withBuilder, 'coined'), ['sensor_reading_x'], 'a builder\'s non-corpus platform name is flagged');
  // a general-purpose agent is never a source
  const general = [use('b', 'Agent', { subagent_type: 'general-purpose' }), res('b', [{ type: 'text', text: 'uses sub_state' }])];
  assert.deepEqual(namesOf(check('`sub_state`.', { extra: general }), 'unsourcedPrinted'), ['sub_state']);
  // a saved Envelope grounds a name only when a page it cites prints it
  const envelope = (cites) => [use('e', 'Read', { file_path: '/home/dev/install/clients/acme/envelopes/e1.md' }), res('e', `The \`task_sla\` table (citation: ${cites}).`)];
  assert.ok(!namesOf(check('`task_sla`.', { extra: envelope(ITSM) }), 'unsourcedPrinted').includes('task_sla'), 'its cited page prints the name');
  assert.deepEqual(namesOf(check('`task_sla`.', { extra: envelope('markdown/other/z.md') }), 'unsourcedPrinted'), ['task_sla'], 'its cited page does not');
});

test('ARC-09-C263 M5 — coined at full coverage names a name the corpus does not print; at disk coverage, or with no index, only "unsourced" and no corpus claim', () => {
  const full = check('Uses `sensor_reading_x` for the metric.');
  assert.deepEqual(namesOf(full, 'coined'), ['sensor_reading_x']);
  assert.match(full.reasonBody, /and the corpus does not print it: leave it out or describe the construct without a name/);
  assert.equal(full.findings.coined[0].seg, 'sensor');
  const sparse = check('Uses `sensor_reading_x` for the metric.', { index: fakeIndex({ task_sla: [ITSM] }, { coverage: 'disk' }) });
  assert.deepEqual(namesOf(sparse, 'coined'), []);
  assert.deepEqual(namesOf(sparse, 'unsourced'), ['sensor_reading_x']);
  assert.doesNotMatch(sparse.reasonBody, /the corpus does not print it/);
  const none = check('Uses `sensor_reading_x` for the metric.', { index: null });
  assert.deepEqual(namesOf(none, 'unsourced'), ['sensor_reading_x']);
  assert.deepEqual(namesOf(none, 'coined'), []);
  // The architect's replay passes coverage explicitly: it wins over the index's own.
  assert.deepEqual(namesOf(check('Uses `sensor_reading_x`.', { coverage: 'disk' }), 'unsourced'), ['sensor_reading_x']);
});

test('ARC-09-C263 M5 — the exemptions: custom names, placeholders, declared proposals, fences, finding copies, paths and tool names are never checked', () => {
  const reply = [
    'Custom `x_acme_widget` and `u_acme_field` are the customer\'s.',
    'A placeholder `x_<vendor>_<app>_table` and a path `' + ['docs', 'some_notes_file.md'].join('/') + '` and a file `report_final.json`.',   // assembled: L05 reads a written path as a citation
    'A proposal `sn_customerservice_widget` (proposed — not baseline) is ours.',
    'Its tool is `snow_core_records_query`.',
    '```',
    'code with `sensor_in_fence` inside',
    '```',
    'A version `1.2.3` and plain words.',
  ].join('\n');
  const r = check(reply, { options: { isToolName: (n) => n === 'snow_core_records_query' } });
  assert.deepEqual(kinds(r), [], JSON.stringify(r.findings));
  // Control: the same names outside the exemptions are checked.
  assert.deepEqual(namesOf(check('Uses `sensor_in_fence` and `sn_customerservice_widget`.'), 'coined').sort(), ['sensor_in_fence', 'sn_customerservice_widget']);
});

test('ARC-09-C263 M5 — scope: without a roster skill or a corpus read, only names under a platform prefix are checked', () => {
  const reply = 'My helper `parse_user_input` and the table `sensor_reading_x` and `sys_zzz_made_up`.';
  const chat = groundingFindings({ rows: [U('write me a parser')], reply, index: INDEX, options: OPT });
  assert.deepEqual(namesOf(chat, 'coined'), ['sys_zzz_made_up'], 'only the platform-prefixed name');
  const grounded = groundingFindings({ rows: [U('q'), ...readPage('r', 'markdown/itsm/p.md', '1\ttext')], reply, index: INDEX, options: OPT });
  assert.deepEqual(namesOf(grounded, 'coined').sort(), ['parse_user_input', 'sensor_reading_x', 'sys_zzz_made_up']);
});

// ---- citedUnread / resting / overclaim ------------------------------------------------------------------------------------------
test('ARC-09-C263 M5 — citedUnread: a corpus page cited that the session never Read; a Read page, a saved Envelope\'s citation and a C254 dead path are not', () => {
  const reply = `The escalation is described in (citation: ${CSM}).`;
  assert.deepEqual(namesOf(check(reply), 'citedUnread'), [CSM]);
  assert.deepEqual(namesOf(check(reply, { reads: { [CSM]: '1\ttext' } }), 'citedUnread'), []);
  const env = [use('e', 'Read', { file_path: '/home/dev/install/clients/acme/envelopes/e1.md' }), res('e', `see ${CSM}`)];
  assert.deepEqual(namesOf(check(reply, { extra: env }), 'citedUnread'), [], 'an Envelope saved earlier cites it');
  assert.deepEqual(namesOf(check(reply, { options: { deadPaths: new Set([CSM]) } }), 'citedUnread'), [], 'C254 asks about a dead path');
  // D-5: a citation a skill printed is not a Read.
  const skill = [U('Base directory for this skill: /home/dev/install/.claude/skills/csm-specialist\n\nSee ' + CSM, { isMeta: true })];
  assert.deepEqual(namesOf(check(reply, { extra: skill }), 'citedUnread'), [CSM], 'no skill exemption');
  // Windows: the cited path with back-slashes and the Read with a drive letter
  assert.deepEqual(namesOf(check(reply.replaceAll('/', '\\'), { reads: { [CSM]: '1\ttext' } }), 'citedUnread'), []);
  assert.deepEqual(namesOf(check('See `markdown/hrsd/c_Missing.md`.', {}), 'citedUnread'), ['markdown/hrsd/c_Missing.md']);
});

test('ARC-09-C267 — citedUnread: a page the session showed itself with cat or sed, or read through an MCP file tool, is read; a grep, an ls and a failed cat of it are not', () => {
  const reply = `The escalation is described in (citation: ${CSM}).`;
  const page = PAGEPATH(CSM);
  const dir = page.slice(0, page.lastIndexOf('/'));
  const bash = (command, extra = {}) => [use('b', 'Bash', { command, description: 'x' }), res('b', '1\tThe sn\\_customerservice\\_escalation table.', extra)];
  const mcp = (input) => [use('m', 'mcp__context-mode__ctx_execute_file', { language: 'shell', code: 'print', ...input }), res('m', [{ type: 'text', text: 'a summary' }])];
  const open = (extra) => namesOf(check(reply, { extra }), 'citedUnread');
  assert.deepEqual(open(bash(`cat ${page}`)), [], 'cat');
  assert.deepEqual(open(bash(`sed -n '1,40p;60,90p' ${page}`)), [], 'sed, with a ; inside its quotes');
  assert.deepEqual(open(bash(`head -50 ${page} | grep -n escalation`)), [], 'head at the head of a pipe');
  assert.deepEqual(open(bash(`cd ${dir} && cat ${page}`)), [], 'after a &&');
  assert.deepEqual(open(mcp({ path: page })), [], 'an MCP file tool given the page as path');
  assert.deepEqual(open(mcp({ paths: [page] })), [], 'or in paths');
  // What does not show the page does not clear its citation.
  assert.deepEqual(open(bash(`grep -l escalation ${page}`)), [CSM], 'grep');
  assert.deepEqual(open(bash(`ls ${dir}`)), [CSM], 'ls');
  assert.deepEqual(open(bash(`wc -l ${page}`)), [CSM], 'wc');
  assert.deepEqual(open(bash(`cat ${page}`, { is_error: true })), [CSM], 'a cat that failed');
  assert.deepEqual(open(bash('cat /home/dev/notes/other.md')), [CSM], 'a cat of another file');
  assert.deepEqual(open(mcp({ path: '/home/dev/notes/other.md' })), [CSM], 'an MCP file tool given another file');
  assert.deepEqual(open([]), [CSM], 'no read of any kind');
  // A different page shown does not stand in for the cited one.
  assert.deepEqual(open(bash(`cat ${PAGEPATH(ITSM)}`)), [CSM], 'another page');
  // The names such a read printed are read names, and `Pages read: 1` is not an overclaim.
  const printed = check('The `sn_customerservice_escalation` table, Pages read: 1.', { extra: bash(`cat ${page}`) });
  assert.deepEqual(kinds(printed), [], 'sourced by the page cat showed; one page read');
  assert.deepEqual(kinds(check('The `sn_customerservice_escalation` table, Pages read: 3.', { extra: bash(`cat ${page}`) })), ['overclaim']);
});

test('ARC-09-C263 M5 — resting: unverified / not opened / a spent budget in the final reply; the marker, C239, live mode and an instance deferral with a citation are not', () => {
  const flagged = (line) => check(`Part 2 done.\n${line}`).findings.resting.length;
  for (const line of ['The escalation matrix is unverified.', 'I have not opened the HR pages.', 'The page budget is spent, so the rest is open.',
    'Left: the SLA timers were not verified.', 'In the pages I opened the field is absent.', 'I could not read the flow page.']) {
    assert.equal(flagged(line), 1, line);
  }
  for (const line of ['`foo_bar_baz` not documented in the bundled corpus — verify on the instance, unverified.',
    'markdown/itsm/x.md — a real page, not installed on this sparse corpus.', 'Items remain unread on the instance: two.',
    'Live mode reads per Envelope: eight.', 'Verify on the instance that the rule is active (citation: markdown/itsm/x.md), not verified here.',
    'instance store NOT read — check every instance name']) {
    assert.equal(flagged(line), 0, line);
  }
  // Only the FINAL reply: text before the turn's last tool result is not its resting place.
  const rows = [U('q'), A('Early draft: the matrix is unverified.'), use('r', 'Read', { file_path: PAGEPATH('markdown/itsm/p.md') }), res('r', '1\ttext')];
  const early = groundingFindings({ rows, reply: 'Final answer with nothing left open.', index: INDEX, options: OPT });
  assert.equal(early.findings.resting.length, 0, 'the early draft is not the final reply');
});

test('ARC-09-C263 M5 — overclaim: `Pages read: <n>` above the distinct pages Read; equal or below is fine; one Read page counted once', () => {
  const two = { 'markdown/itsm/a.md': '1\tx', 'markdown/itsm/b.md': '1\ty' };
  assert.deepEqual(check('Part 2.\n`Pages read: 9`', { reads: two }).findings.overclaim.map((i) => [i.claimed, i.read]), [[9, 2]]);
  assert.equal(check('Pages read: 2', { reads: two }).findings.overclaim.length, 0);
  assert.equal(check('Pages read: 1', { reads: two }).findings.overclaim.length, 0);
  const again = [...readPage('d1', 'markdown/itsm/a.md', '1\tx'), ...readPage('d2', 'markdown/itsm/a.md', '1\tx')];
  assert.equal(check('Pages read: 2', { reads: { 'markdown/itsm/a.md': '1\tx' }, extra: again }).findings.overclaim.length, 1, 'the same page twice is one page');
});

// ---- the reason ------------------------------------------------------------------------------------------------------------------
test('ARC-09-C263 M5 — the reason never prints a name the index lacks, in any class, on every case above', () => {
  const replies = [
    ['`sn_customerservice_escalation` — not documented in the bundled corpus.', {}],
    ['The `task_sla` and `sensor_reading_x` tables; also `Pages read: 9` and unverified. See markdown/itsm/c_Missing.md.', {}],
    ['`sensor_alpha_beta` `sensor_gamma_delta` `weird_name_here` on one line, unverified: "sensor_zeta_eta not opened".', {}],
  ];
  for (const [reply, o] of replies) {
    const r = check(reply, o);
    assert.ok(r.reason, reply);
    assertNoUnheldNames(r.reason, INDEX, reply.slice(0, 40));
  }
  // The pointer for a coined name is the opening words with every identifier masked, and the first segment.
  assert.equal(opening('Uses `sensor_reading_x` for `task_sla` metrics and more words after that', INDEX), 'Uses sensor_… for task_sla metrics and more words');
  assert.match(check('Uses `sensor_reading_x` here.').reasonBody, /the name that begins `sensor_…` is in no page/);
});

test('ARC-09-C263 M5 — the reason: the lead, one clause per kind, at most twelve items and an overflow line, the tail, and our closing words once', () => {
  const lots = Array.from({ length: 15 }, (_, i) => `\`sensor_item_${String.fromCharCode(97 + i)}${i}\``).join(' ');
  const r = check(`Uses ${lots}.`);
  assert.equal(r.findings.coined.length, 15);
  assert.equal(r.reason.split('is in no page, skill, request or instance read').length - 1, 12, 'twelve items shown');
  assert.match(r.reason, /And 3 more of these: check each the same way before you finish\./);
  assert.ok(r.reason.startsWith(LEAD));
  assert.ok(r.reason.endsWith(`do not write a withdrawn name or path again.${KEEP_OUT}`));
  assert.equal(r.reason.split('Do not mention this notice.').length - 1, 1);
  assert.match(r.reason, /Then add one line for each, starting "Correction:", with the page you Read\. If a correction changes Part 3, restate Part 3's letter and its basis/);
  // Only what is allowed to block blocks: with `blocking` limited, the others are computed and not asked.
  const some = check('Uses `sensor_reading_x` and `task_sla`.', { options: { blocking: ['coined'] } });
  assert.deepEqual(some.blocks, ['coined']);
  assert.ok(some.findings.unsourcedPrinted.length === 1 && !some.reason.includes('though the corpus prints them'));
});

test('ARC-09-C263 M5 — candidate pages: those that print a table named on the same line first, then the segment in the file name, then the shortest', () => {
  const idx = fakeIndex({ field_one: ['markdown/a/zzz.md', 'markdown/b/c_Field.md', 'markdown/c/t_Both.md'], table_one: ['markdown/c/t_Both.md'] });
  assert.deepEqual(candidatePages('field_one', idx, { tables: ['table_one'] }), ['markdown/c/t_Both.md', 'markdown/b/c_Field.md']);
  assert.deepEqual(candidatePages('field_one', idx, { tables: [] })[0], 'markdown/b/c_Field.md', 'the name\'s segment in the file name');
  assert.deepEqual(candidatePages('nope', idx), []);
});

test('ARC-09-C263 M5 — the pinned pair: CLAUDE.md carries the sourced-names sentence and the coined clause says to leave it out or describe the construct without a name', () => {
  const claude = readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8');
  assert.ok(claude.includes('print a platform name only as one of them or an instance read gives it'), 'S3 is in the rule');
  assert.match(check('Uses `sensor_reading_x` here.').reasonBody, /leave it out or describe the construct without a name/);
});

// ---- the sources' edge cases -------------------------------------------------------------------------------------------------------
test('ARC-09-C263 M5 — a prior feedback row, a Read-failure notice and a failed Read ground nothing; the reply is the file\'s blocks plus the final text, not twice', () => {
  const rows = [U('q'), use('sk', 'Skill', { skill: 'csm-specialist' }), res('sk', 'Launching skill: csm-specialist'), A('Part 1 draft with `sensor_reading_x`.'),
    U('Stop hook feedback:\nOn the line that begins "x", fine. Do not mention this notice. task_sla', { isMeta: true }),
    ...readPage('bad', 'markdown/itsm/a.md', 'File does not exist task_sla').map((r, i) => (i === 1 ? { ...r, message: { ...r.message, content: [{ ...r.message.content[0], is_error: true }] } } : r))];
  const r = groundingFindings({ rows, reply: 'Part 1 final: `task_sla`.', index: INDEX, options: { ...OPT, lead: 'On the line that begins' } });
  assert.deepEqual(namesOf(r, 'unsourcedPrinted'), ['task_sla'], 'neither the feedback row nor the failed Read gave it');
  assert.deepEqual(namesOf(r, 'coined'), ['sensor_reading_x'], 'the early block of the turn is checked too');
  // The final text the file already ends with is not added twice.
  const skill = [use('sk2', 'Skill', { skill: 'csm-specialist' }), res('sk2', 'Launching skill: csm-specialist')];
  const same = groundingFindings({ rows: [U('q'), ...skill, A('Only text `sensor_reading_x`.')], reply: 'Only text `sensor_reading_x`.', index: INDEX, options: OPT });
  assert.equal(same.findings.coined.length, 1);
  const crlf = groundingFindings({ rows: [U('q'), ...skill, A('Only text `sensor_reading_x`.')], reply: 'Only text `sensor_reading_x`.', index: INDEX, options: OPT });
  assert.equal(crlf.findings.coined.length, 1);
  // A final text that differs only by line endings is still the same text.
  assert.equal(groundingFindings({ rows: [U('q'), ...skill, A('Only\ntext `sensor_reading_x`.')], reply: 'Only\r\ntext `sensor_reading_x`.', index: INDEX, options: OPT }).findings.coined.length, 1);
  assert.equal(groundingFindings({ rows: null, reply: '', index: INDEX }).skipped, 'no-reply');
});

test('ARC-09-C263 M5 — nothing to check: no names, citations or phrases is skipped; a plain sentence with no transcript is skipped', () => {
  assert.equal(groundingFindings({ rows: [U('hi')], reply: 'Hello, how can I help?', index: INDEX, options: OPT }).skipped, 'nothing-to-check');
  assert.equal(groundingFindings({ rows: null, reply: 'Just a sentence.', index: INDEX }).skipped, 'nothing-to-check');
});

test('ARC-09-C263 M5 — without a transcript only falseAbsent (by the index) and resting run', () => {
  const r = groundingFindings({ rows: null, reply: '`sn_customerservice_escalation` not documented. Also `sensor_x_y` and unverified claims. (citation: markdown/itsm/z.md) Pages read: 9', index: INDEX, options: OPT });
  assert.deepEqual(kinds(r), ['falseAbsent', 'resting']);
});

// ---- the continuation: what stayed open ----------------------------------------------------------------------------------------------
const LEADWORDS = 'Before this answer stands';
const feedback = () => U(`Stop hook feedback:\n${LEAD} Called not documented, but the corpus prints them. Do not mention this notice.`, { isMeta: true });
function continuation({ text, reads = {}, early = 'Part 2: `sn_customerservice_escalation` — not documented in the bundled corpus. Uses `sensor_reading_x`.' }) {
  const afterReads = Object.entries(reads).flatMap(([rel, body], k) => readPage(`c${k}`, rel, body));
  return [U('how does a case escalate?'), A(early), feedback(), ...afterReads, ...(text ? [A(text)] : [])];
}

test('ARC-09-C263 M5 — residual: what the continuation corrected is closed, what it did not is the user\'s notice, and new items count', () => {
  const opts = { ...OPT, lead: LEADWORDS };
  const fixed = residualFindings({ rows: continuation({ reads: { [CSM]: '1\tThe sn\\_customerservice\\_escalation table.' },
    text: `Correction: \`sn_customerservice_escalation\` is documented in ${CSM}; the other name is withdrawn.` }), index: INDEX, options: opts });
  assert.equal(fixed.ours, true);
  assert.deepEqual(fixed.open, [], JSON.stringify(fixed.open.map((i) => [i.kind, i.name])));
  assert.equal(fixed.text, null);

  const ignored = residualFindings({ rows: continuation({ text: 'Understood. Here is the answer again with `sensor_reading_x`.' }), index: INDEX, options: opts });
  assert.equal(ignored.open.length, 2, 'no Correction line and no Read: both items still open');
  assert.match(ignored.text, /^Grounding check: 2 item\(s\) in this answer were not corrected after one request — /);
  assert.match(ignored.text, /Check them before relying on this answer\.$/);
  assertNoUnheldNames(ignored.text, INDEX, 'the notice to the user');

  const partly = residualFindings({ rows: continuation({ reads: { [CSM]: '1\tThe sn\\_customerservice\\_escalation table.' },
    text: `Correction: \`sn_customerservice_escalation\` is in ${CSM}.\nAlso uses \`sensor_other_name\`.` }), index: INDEX, options: opts });
  assert.deepEqual(partly.open.map((i) => [i.kind, i.name]), [['coined', 'sensor_other_name']],
    'the false absence and the withdrawn name are closed; a name that first appears in the continuation is open');
  assert.equal(partly.ours, true);

  const notOurs = residualFindings({ rows: [U('q'), A('draft'), U('Stop hook feedback:\nsome other hook. Do not mention this notice.', { isMeta: true }), A('after')], index: INDEX, options: opts });
  assert.deepEqual(notOurs, { ours: false, open: [], text: null }, 'a block of another hook is not ours to report');
  assert.deepEqual(residualFindings({ rows: null, index: INDEX }), { ours: false, open: [], text: null });
});

// ---- the hook -------------------------------------------------------------------------------------------------------------------
/** An install: the docs pin, a roster, a names index of a tiny corpus, and a transcript for `rows`. */
function install(t, { rows = null, raw = null, indexed = true } = {}) {
  const root = tempDir('stop-grounding-', t);
  writeFileSync(join(root, 'engine.config.json'), `${JSON.stringify({ docs: { pin: PIN } })}\n`);
  mkdirSync(join(root, '.claude', 'agents'), { recursive: true });
  writeFileSync(join(root, '.claude', 'agents', 'story-writer.md'), '# story-writer\n');
  mkdirSync(join(root, '.claude', 'skills', 'csm-specialist'), { recursive: true });
  writeFileSync(join(root, 'CLAUDE.md'), '# CLAUDE\nThe `contract_sla` table is named here.\n');
  const corpus = join(root, 'tmp-corpus');
  const pages = ['markdown/csm/c_Esc.md', 'markdown/itsm/c_Sla.md'];
  for (const [i, p] of pages.entries()) { mkdirSync(dirname(join(corpus, p)), { recursive: true }); writeFileSync(join(corpus, p), i === 0 ? 'sn\\_customerservice\\_escalation here\n' : 'task\\_sla and contract\\_sla\n'); }
  if (indexed) writeNamesIndex(corpusNamesDir(root, PIN), buildNamesIndex({ corpus, pin: PIN, pages, tree: pages }));
  let transcript;
  if (raw !== null || rows) {
    transcript = join(root, 'transcript.jsonl');
    writeFileSync(transcript, raw ?? `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`);
  }
  return { root, transcript };
}
const stopInput = (message, transcript, extra = {}) => ({ hook_event_name: 'Stop', last_assistant_message: message, transcript_path: transcript, stop_hook_active: false, ...extra });
const decision = (out) => (out.stdout ? JSON.parse(out.stdout) : null);

// The hook tests below drive the machinery (one ask, the order of the two asks, failing open, the continuation) with a false absence, a
// class that Phase 0 left grader-only in the committed data (tools/snowarch/lib/docs/grounding-classes.json). They name the classes they
// rely on through the hook's own seam, so they test the hook and not the measurement; the one test of the file as shipped is "the
// shipped data" below, and it calls shippedReport.
const report = (input, args = {}) => shippedReport(input, { ...args, seams: { ...args.seams, options: { blocking: [...KINDS], ...args.seams?.options } } });

test('ARC-09-C263 M5 hook — a false absence blocks once with the grounding ask; the same input with stop_hook_active never blocks', async (t) => {
  const reply = '`sn_customerservice_escalation` — not documented in the bundled corpus.';
  const { root, transcript } = install(t, { rows: [U('how does a case escalate?'), A(reply)] });
  const out = await report(stopInput(reply, transcript), { root });
  assert.equal(out.code, 0);
  assert.equal(out.stderr, '');
  const d = decision(out);
  assert.equal(d.decision, 'block');
  assert.ok(d.reason.startsWith(LEAD));
  assert.ok(d.reason.endsWith(`do not write a withdrawn name or path again.${KEEP_OUT}`));
  assertNoUnheldNames(d.reason, loadNamesIndex(corpusNamesDir(root, PIN), { pin: PIN }));
  // The continuation: never a decision. (Our feedback row is not in this transcript, so there is nothing of ours to report.)
  const again = await report(stopInput(reply, transcript, { stop_hook_active: true }), { root });
  assert.equal(again.stdout, '', 'stop_hook_active never blocks');
});

test('ARC-09-C263 M5 hook — C254 alone is byte for byte what it was; with a grounding finding, its ask comes first, without its closing words, and they close once', async (t) => {
  const { root } = install(t);
  // A real corpus layout for C254: a dead path whose page exists at another path.
  const real = 'markdown/alpha/deep/folder/page-two.md';
  mkdirSync(join(root, 'vendor/ServiceNowDocs', dirname(real)), { recursive: true });
  writeFileSync(join(root, 'vendor/ServiceNowDocs', real), '# page\n');
  const dead = 'markdown/alpha/page-two.md';
  const alone = await report(stopInput(`See (citation: ${dead}).`, undefined), { root });
  const c254 = `Your reply cites a corpus page at a path that does not exist: ${dead} -> ${real}. Add one line that starts "Correction:" and gives the right path. Do not repeat the answer, and do not write the wrong path again.${KEEP_OUT}`;
  assert.equal(alone.stdout, `${JSON.stringify({ decision: 'block', reason: c254 })}\n`);
  const both = await report(stopInput(`See (citation: ${dead}). \`sn_customerservice_escalation\` is not documented.`, undefined), { root });
  const reason = decision(both).reason;
  assert.ok(reason.startsWith(c254.slice(0, -KEEP_OUT.length)), 'C254\'s ask first, without its closing words');
  assert.ok(reason.includes(`${LEAD} Called not documented`), 'then the lead and the clauses');
  assert.equal(reason.split(KEEP_OUT.trim()).length - 1, 1, 'the closing words once');
  assert.ok(reason.endsWith(KEEP_OUT));
});

test('ARC-09-C263 M5 hook — nothing to check exits without reading a transcript or an index', async (t) => {
  const { root } = install(t);
  let reads = 0;
  const out = await report(stopInput('Sure, here is the plan in plain words.', '/nowhere.jsonl'), { root, seams: { readRows: () => { reads += 1; return null; } } });
  assert.equal(out.stdout, '');
  assert.equal(reads, 0, 'the fast path read nothing');
});

test('ARC-09-C263 M5 hook — it fails open: a missing, ragged, CRLF, foreign or oversize transcript, a throw, and the deadline leave the citation part alone', async (t) => {
  const reply = '`sn_customerservice_escalation` — not documented in the bundled corpus.';
  const rows = [U('how does a case escalate?'), A(reply)];
  const body = `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`;
  // No transcript: falseAbsent still runs (the index alone), the transcript-only classes do not.
  assert.equal(decision(await report(stopInput(reply, undefined), { root: install(t).root })).decision, 'block');
  assert.equal(decision(await report(stopInput(reply, '/nowhere.jsonl'), { root: install(t).root })).decision, 'block', 'a missing file');
  // Ragged last line and CRLF: the same answer as the clean file.
  const clean = decision(await report(stopInput(reply, install(t, { raw: body }).transcript), { root: install(t, { raw: body }).root }));
  const ragged = install(t, { raw: `${body}{"type":"assistant","mess` });
  assert.deepEqual(decision(await report(stopInput(reply, ragged.transcript), { root: ragged.root })), clean);
  const crlf = install(t, { raw: body.replace(/\n/g, '\r\n') });
  assert.deepEqual(decision(await report(stopInput(reply, crlf.transcript), { root: crlf.root })), clean);
  // A transcript that is not Claude Code's: read as none; no crash.
  const foreign = install(t, { raw: '{"event":"x"}\n' });
  assert.equal(decision(await report(stopInput(reply, foreign.transcript), { root: foreign.root })).decision, 'block');
  // A throw inside the grounding part, and the deadline: nothing of ours, no failure.
  const clear = install(t, { rows });
  const lines = [];
  const thrown = await report(stopInput(reply, clear.transcript), { root: clear.root, seams: { readRows: () => { throw new Error('boom'); }, debug: (l) => lines.push(l) } });
  assert.equal(thrown.stdout, '');
  assert.equal(thrown.code, 0);
  assert.match(lines[0], /grounding failed open: boom/);
  const late = await report(stopInput(reply, clear.transcript), { root: clear.root, seams: { deadlineMs: -1 } });
  assert.equal(late.stdout, '', 'past the deadline the grounding part is dropped');
  // No index (not built): the checks that need it are off, the others run.
  const bare = install(t, { rows, indexed: false });
  const noIndex = decision(await report(stopInput(reply, bare.transcript), { root: bare.root }));
  assert.doesNotMatch(noIndex.reason, /the corpus prints them|the corpus does not print it/, 'with no index nothing is claimed of the corpus');
  assert.match(noIndex.reason, /is in no page, skill, request or instance read of this session: Read a page that prints it/, 'only the transcript-only class runs');
});

test('ARC-09-C263 M5 hook — a transcript in Windows form (CRLF, back-slash paths, drive letters) is read as the same session', async (t) => {
  const reply = 'The `task_sla` table, (citation: markdown/itsm/c_Sla.md).';
  const readRows = readPage('w1', 'markdown/itsm/c_Sla.md', '1\ttask\\_sla').map((r) => JSON.parse(JSON.stringify(r).replace(/\/home\/dev\/install\/vendor\/ServiceNowDocs\/(markdown\/[^"]+)/, (_m, p) => `C:\\\\snow\\\\vendor\\\\ServiceNowDocs\\\\${p.replaceAll('/', '\\\\')}`)));
  const body = `${[U('q'), ...readRows, A(reply)].map((r) => JSON.stringify(r)).join('\r\n')}\r\n`;
  const { root, transcript } = install(t, { raw: body });
  const out = await report(stopInput(reply, transcript), { root });
  assert.equal(out.stdout, '', `the Read grounded both the name and the citation: ${out.stdout}`);
});

test('ARC-09-C263 M5 hook — the continuation tells the user, not the model: a systemMessage when our block was ignored, nothing when it was met', async (t) => {
  const first = 'Part 2: `sn_customerservice_escalation` — not documented in the bundled corpus.';
  const ignoredRows = [U('how does a case escalate?'), A(first), feedback(), A('Understood.\nStill `sn_customerservice_escalation` — not documented in the bundled corpus.')];
  const a = install(t, { rows: ignoredRows });
  const out = await report(stopInput('Understood.\nStill `sn_customerservice_escalation` — not documented in the bundled corpus.', a.transcript, { stop_hook_active: true }), { root: a.root });
  const msg = decision(out);
  assert.deepEqual(Object.keys(msg), ['systemMessage'], 'a user notice and no decision');
  assert.match(msg.systemMessage, /^Grounding check: \d+ item\(s\) in this answer were not corrected after one request — /);
  const metRows = [U('how does a case escalate?'), A(first), feedback(), ...readPage('m', 'markdown/csm/c_Esc.md', '1\tsn\\_customerservice\\_escalation here'),
    A('Correction: `sn_customerservice_escalation` is documented in markdown/csm/c_Esc.md.')];
  const b = install(t, { rows: metRows });
  const met = await report(stopInput('Correction: `sn_customerservice_escalation` is documented in markdown/csm/c_Esc.md.', b.transcript, { stop_hook_active: true }), { root: b.root });
  assert.equal(met.stdout, '');
});

test('ARC-09-C263 M5 hook — no new hook entry, and no hook imports the index builder: the entry is the one B07 wrote', () => {
  const settings = readFileSync(join(ROOT, 'tools/snowarch/lib/settings-local.mjs'), 'utf8');
  const stop = settings.match(/STOP_CITATIONS[\s\S]{0,400}/g)?.length ?? 0;
  assert.ok(stop >= 1, 'the Stop entry exists');
  const hooks = readFileSync(join(ROOT, 'tools/snowarch/hooks/stop-citations.mjs'), 'utf8');
  assert.doesNotMatch(hooks, /names-index-build|sync-index/);
  assert.match(hooks, /DEADLINE_MS = 6000/);
});

// ---- the data file the measurement sets -----------------------------------------------------------------------------------------
test('ARC-09-C263 M5 — parseClasses: the committed file is what Phase 0 set (citedUnread blocks, 500 pages); unknown kinds drop; garbage means all seven kinds', () => {
  const committed = parseClasses(readFileSync(join(ROOT, 'tools/snowarch/lib/docs/grounding-classes.json'), 'utf8'));
  // Phase 0 (C263, R6): citedUnread was judged right 39 times in 40, 0.975 against the registered bar of 0.90, and no other class reached
  // it. A change to this list is a measured decision, made in the file and here together.
  assert.deepEqual(committed, { blocking: ['citedUnread'], ubiquity: DEFAULT_UBIQUITY, source: 'file' });
  assert.equal(DEFAULT_UBIQUITY, 500);
  assert.deepEqual(parseClasses('{"blocking":["coined","nonsense","falseAbsent"],"ubiquityPages":50}'),
    { blocking: ['falseAbsent', 'coined'], ubiquity: 50, source: 'file' }, 'known kinds only, in the check\'s own order');
  assert.deepEqual(parseClasses('{"blocking":[],"ubiquityPages":1}'), { blocking: [], ubiquity: 1, source: 'file' }, 'an empty list is valid: nothing blocks');
  for (const bad of [null, undefined, '', '{ nope', '[]', 'null', '"x"', '42']) {
    assert.deepEqual(parseClasses(bad), { blocking: [...KINDS], ubiquity: 500, source: 'default' }, String(bad));
  }
  assert.deepEqual(parseClasses('{"blocking":"coined","ubiquityPages":0}'), { blocking: [...KINDS], ubiquity: 500, source: 'file' }, 'a wrong type is the default for that field');
  assert.deepEqual(parseClasses('{"ubiquityPages":-3.5}').ubiquity, 500);
});

test('ARC-09-C263 M5 — options given to groundingFindings override the data (the offline replay sets its own)', () => {
  const reply = 'Uses `sensor_reading_x` and `task_sla`.';
  const dataAsRead = parseClasses(readFileSync(join(ROOT, 'tools/snowarch/lib/docs/grounding-classes.json'), 'utf8'));
  const withData = check(reply, { options: { blocking: dataAsRead.blocking, ubiquity: dataAsRead.ubiquity } });
  assert.deepEqual(withData.blocks, [], 'the data blocks citedUnread only, and this reply cites no page');
  assert.deepEqual(kinds(withData), ['unsourcedPrinted', 'coined'], 'the two classes it raises are still computed, for a replay or a grader');
  const everyKind = check(reply, { options: { blocking: [...KINDS], ubiquity: dataAsRead.ubiquity } });
  assert.deepEqual(everyKind.blocks, ['unsourcedPrinted', 'coined'], 'an option that names every kind asks about both');
  const replay = check(reply, { options: { blocking: ['coined'], ubiquity: 0 } });
  assert.deepEqual(replay.blocks, ['coined'], 'the replay\'s blocking set wins');
  assert.equal(replay.findings.unsourcedPrinted.length, 0, 'the replay\'s ubiquity wins: ubiquity 0 means every name is common');
});

test('ARC-09-C263 M5 hook — the shipped data, as Phase 0 set it: a page cited and never read is asked about; a false absence and a coined name are computed and not asked', async (t) => {
  const skill = [use('sk', 'Skill', { skill: 'csm-specialist' }), res('sk', 'Launching skill: csm-specialist')];
  const ask = async (reply) => {
    const { root, transcript } = install(t, { rows: [U('how does a case escalate?'), ...skill, A(reply)] });
    const out = await shippedReport(stopInput(reply, transcript), { root });
    assert.deepEqual([out.code, out.stderr], [0, '']);
    return decision(out);
  };
  const absent = '`sn_customerservice_escalation` — not documented in the bundled corpus.';
  const coined = 'The `sn_zzz_made_up_table` holds it.';
  const cited = 'The escalation is described in (citation: markdown/csm/c_Esc.md).';
  assert.equal(await ask(absent), null, 'falseAbsent is grader-only');
  assert.equal(await ask(coined), null, 'coined is grader-only');
  const alone = await ask(cited);
  assert.equal(alone?.decision, 'block', 'a page cited and never read is asked about');
  assert.ok(alone.reason.includes('markdown/csm/c_Esc.md'), alone.reason);
  const both = await ask(`${cited}\n${absent}`);
  assert.equal(both?.decision, 'block');
  assert.ok(both.reason.includes('markdown/csm/c_Esc.md'), both.reason);
  assert.ok(!both.reason.includes('sn_customerservice_escalation'), 'the false absence is not in the ask: it is computed and reported, never asked');
});

test('ARC-09-C267 hook — the shipped data: a page cited and read only through Bash or an MCP file tool is not asked about; read by nothing, or only grepped, it still is', async (t) => {
  const skill = [use('sk', 'Skill', { skill: 'csm-specialist' }), res('sk', 'Launching skill: csm-specialist')];
  const ask = async (reply, calls = []) => {
    const { root, transcript } = install(t, { rows: [U('how does a case escalate?'), ...skill, ...calls, A(reply)] });
    const out = await shippedReport(stopInput(reply, transcript), { root });
    assert.deepEqual([out.code, out.stderr], [0, '']);
    return decision(out);
  };
  const cited = 'The escalation is described in (citation: markdown/csm/c_Esc.md).';
  const page = PAGEPATH('markdown/csm/c_Esc.md');
  const body = '1\tsn\\_customerservice\\_escalation here';
  const bash = (command, extra = {}) => [use('b', 'Bash', { command, description: 'x' }), res('b', body, extra)];
  const mcp = (input, extra = {}) => [use('m', 'mcp__context-mode__ctx_execute_file', { language: 'shell', code: 'print', ...input }), res('m', [{ type: 'text', text: body }], extra)];

  const unread = await ask(cited);
  assert.equal(unread?.decision, 'block', 'with no read of any kind the citation is asked about');
  assert.ok(unread.reason.includes('markdown/csm/c_Esc.md'), unread.reason);
  assert.equal(await ask(cited, bash(`cat ${page}`)), null, 'cat');
  assert.equal(await ask(cited, bash(`sed -n '1,40p' ${page}`)), null, 'sed');
  assert.equal(await ask(cited, bash(`head -50 ${page} | grep -n escalation`)), null, 'head, at the head of a pipe');
  assert.equal(await ask(cited, mcp({ path: page })), null, 'an MCP file tool given the page as path');
  assert.equal(await ask(cited, mcp({ paths: [page] })), null, 'an MCP file tool given it in paths');
  for (const [what, calls] of [
    ['grep', bash(`grep -l escalation ${page}`)],
    ['ls', bash(`ls ${page.slice(0, page.lastIndexOf('/'))}`)],
    ['a cat that failed', bash(`cat ${page}`, { is_error: true })],
    ['a cat of another file', bash('cat /home/dev/notes/other.md')],
    ['an MCP call that failed', mcp({ path: page }, { is_error: true })],
    ['an MCP call given another file', mcp({ path: '/home/dev/notes/other.md' })],
  ]) {
    const d = await ask(cited, calls);
    assert.equal(d?.decision, 'block', `${what} does not clear the citation`);
    assert.ok(d.reason.includes('markdown/csm/c_Esc.md'), `${what}: ${d.reason}`);
  }
});

// ---- time ----------------------------------------------------------------------------------------------------------------------------
test('ARC-09-C263 M5 — a 5 MB transcript with a 9 MB index runs under 5 s (the time is printed)', async (t) => {
  // An index of ~9 MB: 120,000 names over 50,000 pages, a posting list each, written through the real writer.
  const names = new Map();
  const pages = Array.from({ length: 50_000 }, (_, i) => `markdown/area${i % 50}/c_Page${i}.md`);
  for (let i = 0; i < 120_000; i += 1) names.set(`tbl_${i}_x`, Array.from({ length: 8 }, (_, k) => (i * (k + 3)) % 50_000).sort((a, b) => a - b).filter((v, k, arr) => arr.indexOf(v) === k));
  names.set('sn_customerservice_escalation', [3, 4]);
  const dir = join(tempDir('stop-time-', t), 'idx');
  const bytes = writeNamesIndex(dir, { meta: { v: 1, pin: PIN, coverage: 'full', areas: null, pages: pages.length, names: names.size, built: new Date().toISOString() }, pages, names });
  // A 5 MB transcript: a prompt, forty Reads of 120 KB pages, and the answer.
  const rows = [U('how does a case escalate?')];
  const chunk = Array.from({ length: 2400 }, (_, i) => `line ${i} about tbl_${i}_x and field_${i} of the table`).join('\n');
  for (let i = 0; i < 40; i += 1) rows.push(...readPage(`p${i}`, `markdown/area${i}/c_Page${i}.md`, chunk));
  const reply = Array.from({ length: 30 }, (_, i) => `The \`tbl_${i}_x\` table (citation: markdown/area${i}/c_Page${i}.md).`).join('\n') + '\n`sn_customerservice_escalation` — not documented in the bundled corpus.';
  rows.push(A(reply));
  const body = `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`;
  const root = tempDir('stop-time-root-', t);
  writeFileSync(join(root, 'engine.config.json'), `${JSON.stringify({ docs: { pin: PIN } })}\n`);
  mkdirSync(corpusNamesDir(root, PIN), { recursive: true });
  writeNamesIndex(corpusNamesDir(root, PIN), { meta: { v: 1, pin: PIN, coverage: 'full', areas: null, pages: pages.length, names: names.size, built: new Date().toISOString() }, pages, names });
  const transcript = join(root, 'big.jsonl');
  writeFileSync(transcript, body);
  const t0 = Date.now();
  const out = await report(stopInput(reply, transcript), { root });
  const ms = Date.now() - t0;
  console.log(`    5 MB transcript (${(Buffer.byteLength(body) / 1e6).toFixed(1)} MB) with a ${(bytes / 1e6).toFixed(1)} MB index: report() ${ms} ms on ${process.platform}/${process.arch} node ${process.versions.node}`);
  assert.ok(Buffer.byteLength(body) > 4_500_000, `the transcript is ${Buffer.byteLength(body)} bytes`);
  assert.ok(bytes > 8_500_000, `the index is ${bytes} bytes`);
  assert.ok(ms < 5000, `the hook took ${ms} ms`);
  assert.equal(decision(out).decision, 'block', 'and it still finds the false absence');
  assert.equal(parseTranscript(body).rows.length, rows.length);
});
