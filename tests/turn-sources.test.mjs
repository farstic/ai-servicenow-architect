// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C263 (M4) — what a session has read, from the transcript Claude Code keeps. The real captures are tests/fixtures/transcripts/,
// one set per version the architect named: the floor 2.1.214, the measured 2.1.309 and the current 2.1.318 (MANIFEST.json). The
// rulings of 2026-11-07 are pinned below with rows built for each: a row is known by its prefix and not by a flag, a sub-agent's
// rows and results are never a source unless a roster builder made them, a `<task-notification>` is a result and never the request,
// and every source before the LAST compact boundary stops grounding.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';
import { corpusRelative } from '../tools/snowarch/lib/docs/resolve.mjs';
import {
  MAX_TRANSCRIPT_BYTES, classifyUserText, flagsOf, isMainRow, namesIn, pagesOfCommand, pagesOfInput, parseTranscript, readTurnSources,
  shellWords, turnSources,
} from '../tools/snowarch/lib/docs/turn-sources.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = join(ROOT, 'tests/fixtures/transcripts');
const MANIFEST = JSON.parse(readFileSync(join(FIXTURES, 'MANIFEST.json'), 'utf8'));
const BUILDERS = new Set(['story-writer', 'technical-designer']);
const OPTIONS = { builders: BUILDERS, rosterSkills: new Set(['itsm-specialist']), lead: 'Before this answer stands' };
const VERSIONS = ['2.1.214', '2.1.309', '2.1.318'];

const capture = (version, name) => join(FIXTURES, `v${version}`, `${name}.jsonl`);
const rowsOf = (version, name) => parseTranscript(readFileSync(capture(version, name), 'utf8')).rows;

// ---- rows built for a case -------------------------------------------------------------------------------------------------
const A = (blocks, extra = {}) => ({ type: 'assistant', message: { role: 'assistant', content: blocks }, ...extra });
const text = (t) => ({ type: 'text', text: t });
const U = (content, extra = {}) => ({ type: 'user', message: { role: 'user', content }, ...extra });
const use = (id, name, input) => A([{ type: 'tool_use', id, name, input }]);
const res = (id, content, extra = {}) => U([{ type: 'tool_result', tool_use_id: id, content, ...extra }]);
const PAGE = '/home/dev/install/vendor/ServiceNowDocs/markdown/itsm/c_Example.md';
const read = (id, file, body, extra = {}) => [use(id, 'Read', { file_path: file }), res(id, body, extra)];
const boundary = () => ({ type: 'system', subtype: 'compact_boundary', content: 'Conversation compacted' });
const isBoundary = (r) => r.type === 'system' && r.subtype === 'compact_boundary';
/** The part of a capture before its compaction (the 2.1.214 many-tools capture was compacted afterwards, by a later session). */
const beforeBoundary = (rows) => { const at = rows.findIndex(isBoundary); return at < 0 ? rows : rows.slice(0, at); };

// ---- the real captures ---------------------------------------------------------------------------------------------------
test('ARC-09-C263 M4 — every capture of every version parses, is one version, and has a turn', () => {
  assert.deepEqual([...new Set(MANIFEST.captures.map((c) => c.claudeCode))].sort(), VERSIONS);
  assert.ok(MANIFEST.captures.length >= 14, `${MANIFEST.captures.length} captures`);
  for (const c of MANIFEST.captures) {
    const t = readTurnSources(join(FIXTURES, c.file), { options: OPTIONS });
    assert.ok(t, `${c.file}: not read`);
    assert.equal(t.rowCount, c.rows, `${c.file}: every row of a main file is a main-thread row`);
    assert.equal(t.rows.length, c.rows, `${c.file}: readTurnSources hands back the rows`);
    const versions = [...new Set(parseTranscript(readFileSync(join(FIXTURES, c.file), 'utf8')).rows.map((r) => r.version).filter(Boolean))];
    assert.deepEqual(versions, [c.claudeCode], `${c.file}: the rows say ${versions}, the manifest ${c.claudeCode}`);
    assert.equal(t.badLines, 0, `${c.file}: lines that do not parse`);
  }
});

for (const version of VERSIONS) {
  test(`ARC-09-C263 M4 — Claude Code ${version}: a Stop block and its continuation are one turn; the feedback is no request and no source`, () => {
    const t = readTurnSources(capture(version, 'block-continuation'), { options: OPTIONS });
    assert.equal(t.startedBy, 'prompt');
    assert.equal(t.request.length, 1);
    assert.match(t.request[0], /second line/);
    assert.equal(t.feedback.length, 1, 'one Stop-hook feedback row in the turn');
    assert.equal(t.classes['hook-feedback'], 1);
    assert.equal(t.replyBlocks.length, 2, 'the text before the block and the continuation after it, both in the file');
    assert.match(t.replyBlocks.at(-1), /PINEAPPLE$/);
    assert.equal(t.pagesRead.size, 0);
  });

  test(`ARC-09-C263 M4 — Claude Code ${version}: corpus pages, an offset/limit Read, a skill file, a saved Envelope and a Grep are told apart`, () => {
    const t = readTurnSources(capture(version, 'corpus-reads'), { options: OPTIONS });
    assert.deepEqual([...t.pagesRead].sort(), ['markdown/csm/c_Other.md', 'markdown/itsm/c_Example.md']);
    for (const n of ['sn_probe_table', 'probe_state', 'probe_owner', 'task_probe', 'com.snc.probe.enabled']) assert.ok(t.names.read.has(n), `a page Read prints ${n}`);
    for (const n of ['csm_probe_case', 'csm_probe_account', 'csm_probe_contract']) assert.ok(t.names.read.has(n), `offset 2, limit 2 returned the lines that print ${n}`);
    assert.ok(t.names.skill.has('sn_probe_widget'), 'a Read of a roster SKILL.md is a skill source');
    assert.equal(t.scope.rosterSkill, true);
    assert.equal(t.scope.corpus, true);
    assert.ok(t.savedCitations.has('markdown/itsm/c_Example.md'), 'the Envelope\'s citation');
    assert.ok(t.envelopeNames.has('probe_state'), 'the Envelope\'s names are kept apart');
    assert.equal(t.names.named.has('probe_state') && !t.request.join('\n').includes('probe_state'), false, 'an Envelope is not "named"');
    assert.ok(t.searches.some((s) => s.pattern === 'sn_probe_table'), 'the Grep is recorded as a search');
  });

  test(`ARC-09-C263 M4 — Claude Code ${version}: a failed Read, a Grep, an offset Read of a non-corpus file and a general-purpose agent's result ground nothing`, () => {
    const t = turnSources(beforeBoundary(rowsOf(version, 'many-tools')), OPTIONS);
    assert.equal(t.pagesRead.size, 0, 'notes.txt is not a corpus page; the missing file is not a page');
    assert.equal(t.names.builder.size, 0, 'the sub-agent was general-purpose: never a source');
    assert.ok(t.names.skill.has('sn_probe_widget') && t.names.skill.has('widget_state'), 'the loaded skill body is a skill source');
    assert.equal(t.scope.rosterSkill, true);
    // The agent's own summary names `sn_probe_widget`'s neighbours nowhere in a source: nothing of the agent's text is in any set.
    for (const set of Object.values(t.names)) assert.ok(!set.has('hello'), 'nothing the agent wrote is a name');
  });

  test(`ARC-09-C263 M4 — Claude Code ${version}: after /compact only what follows the boundary counts, and the request is the prompts after it`, () => {
    const name = version === '2.1.214' ? 'many-tools' : 'resume-compact';
    const t = readTurnSources(capture(version, name), { options: OPTIONS });
    assert.ok(t.boundary >= 0, 'the compact_boundary row is found');
    assert.equal(t.compacted, 1);
    assert.equal(t.names.skill.size, 0, 'a skill loaded before the boundary no longer grounds');
    assert.equal(t.classes['compaction-summary'], 1, 'the summary row is known by its prefix');
    assert.ok(!t.request.some((r) => /continued from a previous conversation/.test(r)), 'the summary is not a request');
  });

  test(`ARC-09-C263 M4 — Claude Code ${version}: an async agent's task-notification is a result by its tool-use id, never the request`, () => {
    // With the capture's boundary row taken out: this case is about the notification, which the session had before its /compact
    // at 2.1.214 and 2.1.309 and after it at 2.1.318.
    const t = turnSources(rowsOf(version, 'async-agent').filter((r) => !isBoundary(r)), OPTIONS);
    assert.ok(t.classes['task-notification'] >= 1, 'the notification row is known by its prefix');
    assert.equal(t.names.builder.size, 0, 'general-purpose: never a source');
    assert.ok(!t.request.some((r) => r.startsWith('<task-notification>')), 'a notification is not the user\'s request');
  });
}

test('ARC-09-C263 M4 — 2.1.309 -p: an async agent starts a turn with its notification, and the turn keeps the session\'s real request', () => {
  const t = readTurnSources(capture('2.1.309', 'many-tools'), { options: OPTIONS });
  assert.equal(t.startedBy, 'task-notification');
  assert.equal(t.request.length, 1, 'the real prompt, still the request');
  assert.match(t.request[0], /Read notes\.txt with offset 2/);
  assert.equal(t.replyBlocks.length, 1, 'the reply to the notification');
});

// ---- the rulings, with rows built for each -------------------------------------------------------------------------------------
test('ARC-09-C263 M4 — a row is known by its PREFIX, whichever flags it carries (on disk isMeta + string, in stream-json isSynthetic + blocks)', () => {
  const reason = 'Stop hook feedback:\nBefore this answer stands: `sn_leaked_name` is in no page. Do not mention this notice.';
  const rows = [
    U('how do I escalate a case?'),
    A([text('first draft')]),
    U(reason, { isMeta: true }),                                     // on disk
    U([{ type: 'text', text: reason }], { isSynthetic: true }),      // in stream-json
    U(reason),                                                       // a version that sets no flag at all
    U('Base directory for this skill: /home/dev/install/.claude/skills/csm-specialist\n\nThe field sn_skill_field.'),
    U('This session is being continued from a previous conversation.\n\nSummary names sn_summary_table.'),
    U('<local-command-stdout>Compacted sn_command_output</local-command-stdout>', { isMeta: true }),
    U('some unknown injected text sn_flagged_name', { isMeta: true }),
    U('ends the way our notices end: sn_notice_name. Do not mention this notice.'),
    U('[Request interrupted by user]'),
  ];
  const t = turnSources(rows, OPTIONS);
  assert.deepEqual(t.request, ['how do I escalate a case?'], 'only the real prompt is the request');
  assert.deepEqual(t.classes, { prompt: 1, 'hook-feedback': 3, 'skill-body': 1, 'compaction-summary': 1, command: 1, flagged: 1, 'hook-notice': 1, interrupt: 1 });
  for (const n of ['sn_leaked_name', 'sn_summary_table', 'sn_command_output', 'sn_flagged_name', 'sn_notice_name']) {
    for (const [kind, set] of Object.entries(t.names)) assert.ok(!set.has(n), `${n} is in ${kind}`);
  }
  assert.ok(t.names.skill.has('sn_skill_field'), 'the skill body prints, whatever its flags');
  assert.equal(t.feedback.length, 3);
  assert.ok(t.feedback.every((f) => f.ours), 'all three carry our lead');
  assert.deepEqual(flagsOf({ isMeta: true, isSynthetic: false }), ['isMeta'], 'flags are recorded');
  assert.equal(classifyUserText('plain words', {}), 'prompt');
  assert.equal(classifyUserText('plain words', { isMeta: true }), 'flagged');
});

test('ARC-09-C263 M4 — sub-agent rows are dropped whatever the caller passes: isSidechain, and a parent_tool_use_id', () => {
  const rows = [
    U('request'),
    ...read('r1', PAGE, '1\tThe table sn_main_table'),
    { ...A([text('agent says sn_agent_name')]), isSidechain: true },
    { ...U([{ type: 'tool_result', tool_use_id: 'rx', content: '1\tsn_agent_page_name' }]), parent_tool_use_id: 'toolu_agent' },
    { ...use('rx', 'Read', { file_path: PAGE.replace('c_Example', 'c_Agent') }), parent_tool_use_id: 'toolu_agent' },
  ];
  const t = turnSources(rows, OPTIONS);
  assert.equal(t.rowCount, 3, 'three main-thread rows');
  assert.deepEqual([...t.pagesRead], ['markdown/itsm/c_Example.md']);
  assert.ok(t.names.read.has('sn_main_table') && !t.names.read.has('sn_agent_page_name'));
  assert.equal(isMainRow({ isSidechain: true }), false);
  assert.equal(isMainRow({ parent_tool_use_id: 'x' }), false);
  assert.equal(isMainRow({ parent_tool_use_id: null }), true);
});

test('ARC-09-C263 M4 — a <task-notification> is classed by the Agent call\'s subagent_type: a roster builder, indexed names only; anything else, nothing', () => {
  const note = (id, body) => `<task-notification>\n<task-id>a1</task-id>\n<tool-use-id>${id}</tool-use-id>\n<result>${body}</result>\n</task-notification>`;
  const rows = [
    U('design the escalation story'),
    use('t_builder', 'Agent', { subagent_type: 'story-writer', prompt: 'x' }),
    res('t_builder', 'Async agent launched successfully. agentId: a1'),
    use('t_reader', 'Task', { subagent_type: 'general-purpose', prompt: 'x' }),
    res('t_reader', 'Async agent launched successfully. agentId: a2'),
    use('t_none', 'Agent', { prompt: 'no type given' }),
    U(note('t_builder', 'story names sn_builder_table')),
    U(note('t_reader', 'reader names sn_reader_table')),
    U(note('t_none', 'untyped names sn_untyped_table')),
    U(note('t_unknown', 'unmappable names sn_unmapped_table')),
  ];
  const t = turnSources(rows, OPTIONS);
  assert.ok(t.names.builder.has('sn_builder_table'));
  for (const n of ['sn_reader_table', 'sn_untyped_table', 'sn_unmapped_table']) for (const [k, set] of Object.entries(t.names)) assert.ok(!set.has(n), `${n} grounds as ${k}`);
  assert.deepEqual(t.request, ['design the escalation story'], 'a notification is never the request');
  assert.equal(t.startedBy, 'task-notification');
  assert.equal(t.classes['task-notification'], 4);
});

test('ARC-09-C263 M4 — the -p Agent tool_result is classed the same way (a sync agent returns its text as the result)', () => {
  const rows = [
    U('request'),
    use('a1', 'Agent', { subagent_type: 'technical-designer', prompt: 'x' }),
    res('a1', [{ type: 'text', text: 'design uses sn_designer_table' }]),
    use('a2', 'Agent', { subagent_type: 'Explore', prompt: 'x' }),
    res('a2', [{ type: 'text', text: 'explorer saw sn_explorer_table' }]),
    use('a3', 'Workflow', { script: 'x' }),
    res('a3', 'workflow names sn_workflow_table'),
  ];
  const t = turnSources(rows, OPTIONS);
  assert.ok(t.names.builder.has('sn_designer_table'));
  assert.ok(!t.names.builder.has('sn_explorer_table') && !t.names.read.has('sn_explorer_table'));
  for (const set of Object.values(t.names)) assert.ok(!set.has('sn_workflow_table'), 'a Workflow result is never a source');
});

test('ARC-09-C263 M4 — a failed Read is not a source and not a page; a Glob and a Bash result are not sources; an MCP result is named; Grep lines are only recorded', () => {
  const rows = [
    U('request'),
    ...read('r1', PAGE, 'File does not exist. sn_missing_name', { is_error: true }),
    use('g1', 'Glob', { pattern: '**/*.md' }), res('g1', 'markdown/itsm/sn_glob_name.md'),
    use('b1', 'Bash', { command: 'cat page' }), res('b1', 'sn_bash_name'),
    use('m1', 'mcp__servicenow__snow_core_records_query', {}), res('m1', '{"table":"sn_instance_table"}'),
    use('s1', 'Grep', { pattern: 'sn_grep_name', path: 'vendor/ServiceNowDocs/markdown' }), res('s1', 'markdown/itsm/c_Example.md:3: sn_grep_name'),
  ];
  const t = turnSources(rows, OPTIONS);
  assert.equal(t.pagesRead.size, 0);
  for (const n of ['sn_missing_name', 'sn_glob_name', 'sn_bash_name', 'sn_grep_name']) for (const [k, set] of Object.entries(t.names)) assert.ok(!set.has(n), `${n} grounds as ${k}`);
  assert.ok(t.names.named.has('sn_instance_table'), 'live-mode reads are named');
  assert.equal(t.searches.length, 1);
  assert.match(t.searches[0].result, /sn_grep_name/);
  assert.equal(t.scope.corpus, true, 'a Grep under the corpus is the corpus touched');
});

// ---- ARC-09-C267: a page read through Bash or an MCP file tool ------------------------------------------------------------------
// The Read tool is not the only way a page reaches the model: in auto mode Claude Code says to read with `cat`, `head` and `sed`, and the
// context-mode server's `ctx_execute_file` takes the file as `path`. The shapes below are the real ones (a Bash input is
// { command, description }, its result a string; an MCP result is a list of text blocks, with no `is_error` unless it failed). Phase 0's
// five batteries used Read 1,709 times, Grep 1,209, Bash 0 and MCP 0, so nothing here can move a number measured on them.
const REL = 'markdown/itsm/c_Example.md';
const DIR = PAGE.slice(0, PAGE.lastIndexOf('/'));
const OTHER = '/home/dev/install/vendor/ServiceNowDocs/markdown/hrsd/c_Other.md';
const OTHER_REL = 'markdown/hrsd/c_Other.md';
const bash = (id, command, body, extra = {}) => [use(id, 'Bash', { command, description: 'read it' }), res(id, body, extra)];
const mcp = (id, name, input, body, extra = {}) => [use(id, name, input), res(id, [{ type: 'text', text: body }], extra)];
const sourcesOf = (calls) => turnSources([U('request'), ...calls], OPTIONS);
const heldBy = (t, name) => Object.entries(t.names).filter(([, set]) => set.has(name)).map(([kind]) => kind);
// Built, not spelled whole: engine lint L02 holds every literal `mcp__<server>__` under tests/ to the product's own server key.
const tool = (server, name) => ['mcp', server, name].join('__');
const CTX_FILE = tool('context-mode', 'ctx_execute_file');

test('ARC-09-C267 — a page that cat, head, sed, tail, nl, awk, bat, less or more shows is a page read, and the names it printed are read names', () => {
  const commands = [
    `cat ${PAGE}`, `sed -n '1,40p' ${PAGE}`, `head -50 ${PAGE} | grep -n sn_shown_name`, `tail -n +10 ${PAGE}`, `nl ${PAGE}`,
    `awk 'NR<=40' ${PAGE}`, `bat -p ${PAGE}`, `less ${PAGE}`, `more ${PAGE}`,
  ];
  for (const command of commands) {
    const t = sourcesOf(bash('b', command, '1\tThe sn_shown_name table'));
    assert.deepEqual([...t.pagesRead], [REL], command);
    assert.deepEqual(heldBy(t, 'sn_shown_name'), ['read'], `${command}: what it printed is read, and neither named nor skill`);
  }
});

test('ARC-09-C267 — the command line is cut at | ; && || & and a newline, and a quote hides its separators', () => {
  const shown = [
    `cd /home/dev/install && cat ${PAGE}`, `echo start; cat ${PAGE}`, `cat ${PAGE} | head -3`, `false || cat ${PAGE}`, `sleep 1 & cat ${PAGE}`,
    `echo a\ncat ${PAGE}`, `cat \\\n  ${PAGE}`, `sed -n '1,40p;50,60p' ${PAGE}`, `sed -n "1,40p;50,60p" ${PAGE}`, `awk 'NR>1; END {print}' ${PAGE}`,
    `FOO=1 BAR=2 /bin/cat ${PAGE}`, `cat < ${PAGE}`, `cat <${PAGE}`, `cat "${PAGE}"`, `cat '${PAGE}'`, `cat -n ${PAGE} 2>&1`,
    `cat '${PAGE.replaceAll('/', '\\')}'`, 'cat "C:\\Users\\dev\\vendor\\ServiceNowDocs\\markdown\\itsm\\c_Example.md"',
    `cat -- ${PAGE}`, `cat ../../vendor/ServiceNowDocs/${REL}`, `cat vendor/ServiceNowDocs/${REL}`, `cat $HOME/work/vendor/ServiceNowDocs/${REL}`,
  ];
  for (const command of shown) assert.deepEqual([...pagesOfCommand(command)], [REL], JSON.stringify(command));
  assert.deepEqual([...pagesOfCommand(`cat ${PAGE} ${OTHER}`)].sort(), [OTHER_REL, REL].sort(), 'every file argument of a cat');
  assert.deepEqual([...pagesOfCommand(`nl ${PAGE}; head -3 ${OTHER}`)].sort(), [OTHER_REL, REL].sort(), 'and of each command');
  assert.deepEqual([...pagesOfCommand(`cat ${PAGE} ${PAGE}`)], [REL], 'a page once');
});

test('ARC-09-C267 — grep, rg, ls, find, wc, stat, echo, a glob, a variable and a cat of any other file show no page', () => {
  const hidden = [
    `grep -l sn_shown_name ${PAGE}`, `grep -n '' ${PAGE}`, `rg sn_shown_name ${PAGE}`, `ls ${DIR}`, `ls -l ${PAGE}`, `find ${DIR} -name c_Example.md`,
    `wc -l ${PAGE}`, `stat ${PAGE}`, `echo "cat ${PAGE}"`, `printf '%s' ${PAGE}`, `git log -3 -- ${PAGE}`,
    'cat /home/dev/notes/readme.md', `cat ${DIR}/*.md`, `cat ${DIR}/c_{Example,Other}.md`, `cat ${DIR}/c_Exampl?.md`, `cat ${DIR}/c_[E]xample.md`,
    'cat "$PAGE"', 'cat $(git rev-parse --show-toplevel)/vendor/x.md', `cat ${DIR}/index.json`, `cat ${DIR}`, `cat vendor/ServiceNowDocs/README.md`,
    'cat --help', 'cat', 'cat ""', '', '   ',
  ];
  for (const command of hidden) {
    const t = sourcesOf(bash('b', command, '1\tThe sn_shown_name table'));
    assert.equal(t.pagesRead.size, 0, JSON.stringify(command));
    assert.deepEqual(heldBy(t, 'sn_shown_name'), [], `${JSON.stringify(command)}: a command that shows no page is no source`);
  }
});

test('ARC-09-C267 — a Bash or MCP result that failed never counts, whatever it was asked to show', () => {
  const t = sourcesOf([
    ...bash('b', `cat ${PAGE}`, 'cat: No such file or directory sn_failed_bash', { is_error: true }),
    ...mcp('m', CTX_FILE, { path: PAGE, language: 'shell', code: 'print' }, 'it failed sn_failed_mcp', { is_error: true }),
  ]);
  assert.equal(t.pagesRead.size, 0);
  for (const n of ['sn_failed_bash', 'sn_failed_mcp']) assert.deepEqual(heldBy(t, n), [], n);
});

test('ARC-09-C267 — an MCP call given a corpus page by path, file_path or paths reads it; every other MCP result is only named', () => {
  const file = (input, name = CTX_FILE) => sourcesOf(mcp('m', name, { language: 'shell', code: 'print', ...input }, 'The sn_mcp_name table'));
  for (const input of [{ path: PAGE }, { file_path: PAGE }, { paths: [PAGE] }, { paths: ['/etc/hosts', 3, PAGE] }, { path: '/etc/hosts', paths: [PAGE] }]) {
    const t = file(input);
    assert.deepEqual([...t.pagesRead], [REL], JSON.stringify(input));
    assert.deepEqual(heldBy(t, 'sn_mcp_name'), ['read'], `${JSON.stringify(input)}: read, rather than named`);
  }
  assert.deepEqual([...file({ paths: [PAGE, OTHER] }).pagesRead].sort(), [OTHER_REL, REL].sort());
  assert.deepEqual([...file({ file_path: PAGE.replaceAll('/', '\\') }, tool('files', 'read_file')).pagesRead], [REL], 'any MCP server\'s file tool, Windows spelling');
  // Not one corpus page: the result is named, as it was before this row.
  for (const input of [{ path: '/home/dev/notes/readme.md' }, { path: DIR }, { path: `${DIR}/*.md` }, { path: `${DIR}/index.json` }, { paths: [] }, { paths: PAGE }, { path: 42 }, { path: null }, {}]) {
    const t = file(input);
    assert.equal(t.pagesRead.size, 0, JSON.stringify(input));
    assert.deepEqual(heldBy(t, 'sn_mcp_name'), ['named'], `${JSON.stringify(input)}: an MCP result is named`);
  }
  assert.deepEqual(heldBy(sourcesOf(mcp('m', 'mcp__servicenow__snow_core_records_query', { table: 'incident' }, 'The sn_mcp_name table')), 'sn_mcp_name'), ['named'], 'a live-mode read');
});

test('ARC-09-C267 — a Glob, a Write, a WebFetch and a Workflow are still never a source, even when their input names a corpus page', () => {
  const t = sourcesOf([
    use('g', 'Glob', { pattern: '*.md', path: DIR }), res('g', `${PAGE}\nsn_glob_name`),
    use('w', 'Write', { file_path: PAGE, content: 'sn_write_name' }), res('w', 'File written sn_write_result'),
    use('f', 'WebFetch', { url: 'https://docs.invalid/page', path: PAGE }), res('f', 'sn_fetch_name'),
    use('k', 'Workflow', { script: 'x', path: PAGE }), res('k', 'sn_workflow_name'),
    use('e', 'Edit', { file_path: PAGE, old_string: 'a', new_string: 'b' }), res('e', 'sn_edit_name'),
  ]);
  assert.equal(t.pagesRead.size, 0);
  for (const n of ['sn_glob_name', 'sn_write_name', 'sn_write_result', 'sn_fetch_name', 'sn_workflow_name', 'sn_edit_name']) assert.deepEqual(heldBy(t, n), [], n);
});

test('ARC-09-C267 — a page read through Bash or MCP before the last compact boundary stops counting, as a Read does', () => {
  const rows = [
    U('first'), ...bash('b1', `cat ${PAGE}`, '1\tsn_before_bash'), ...mcp('m1', CTX_FILE, { path: OTHER }, 'sn_before_mcp'),
    boundary(), U('second'), ...bash('b2', `head -5 ${OTHER}`, '1\tsn_after_bash'),
  ];
  const t = turnSources(rows, OPTIONS);
  assert.deepEqual([...t.pagesRead], [OTHER_REL]);
  assert.ok(!t.names.read.has('sn_before_bash') && !t.names.read.has('sn_before_mcp') && t.names.read.has('sn_after_bash'));
});

test('ARC-09-C267 — a Read, a Bash and an MCP read of one page are one page; a sub-agent\'s Bash is not the main thread\'s', () => {
  const sub = { ...use('s', 'Bash', { command: `cat ${OTHER}` }), isSidechain: true };
  const rows = [U('request'), ...read('r', PAGE, '1\tsn_read_name'), ...bash('b', `cat ${PAGE}`, '1\tsn_bash_name'), ...mcp('m', tool('x', 'read'), { path: PAGE }, 'sn_mcp_name'),
    sub, { ...res('s', 'sn_sub_name'), isSidechain: true }];
  const t = turnSources(rows, OPTIONS);
  assert.deepEqual([...t.pagesRead], [REL]);
  assert.deepEqual(['sn_read_name', 'sn_bash_name', 'sn_mcp_name'].map((n) => heldBy(t, n)), [['read'], ['read'], ['read']]);
  assert.deepEqual(heldBy(t, 'sn_sub_name'), []);
});

test('ARC-09-C267 — the real captures, with each corpus Read rewritten as a sed or an MCP path call, read the same pages and the same names', () => {
  let pages = 0;
  for (const c of MANIFEST.captures) {
    const rows = parseTranscript(readFileSync(join(FIXTURES, c.file), 'utf8')).rows;
    const base = turnSources(rows, OPTIONS);
    pages += base.pagesRead.size;
    const rewritten = (rewrite) => rows.map((r) => (r.type !== 'assistant' || !Array.isArray(r.message?.content) ? r : {
      ...r, message: { ...r.message, content: r.message.content.map((b) => (b?.type === 'tool_use' && b.name === 'Read' && corpusRelative(b.input?.file_path) ? rewrite(b) : b)) },
    }));
    const viaBash = rewritten((b) => ({ ...b, name: 'Bash', input: { command: `sed -n '1,200p' "${b.input.file_path}"`, description: 'read it' } }));
    const viaMcp = rewritten((b) => ({ ...b, name: CTX_FILE, input: { path: b.input.file_path, language: 'shell', code: 'print' } }));
    for (const [how, changed] of [['Bash', viaBash], ['MCP', viaMcp]]) {
      const t = turnSources(changed, OPTIONS);
      assert.deepEqual([...t.pagesRead].sort(), [...base.pagesRead].sort(), `${c.file} via ${how}: the pages`);
      assert.deepEqual([...t.names.read].sort(), [...base.names.read].sort(), `${c.file} via ${how}: the names`);
    }
  }
  assert.ok(pages > 0, 'the captures read at least one corpus page, or this proves nothing');
});

test('ARC-09-C267 — shellWords: the simple commands of a line, quotes taken off, cut only at an unquoted separator; nothing throws', () => {
  assert.deepEqual(shellWords('a \'b c\' "d \\" e" f\\ g | h ;; i && j & k\nl'), [['a', 'b c', 'd " e', 'f g'], ['h'], ['i'], ['j'], ['k'], ['l']]);
  assert.deepEqual(shellWords("sed -n '1,2p;3p' f"), [['sed', '-n', '1,2p;3p', 'f']], 'a ; inside quotes cuts nothing');
  assert.deepEqual(shellWords('echo "a | b" \'c && d\''), [['echo', 'a | b', 'c && d']]);
  assert.deepEqual(shellWords('echo "a\\nb" "c\\$d"'), [['echo', 'a\\nb', 'c$d']], 'inside double quotes a back-slash escapes only " \\ $ and a back-tick');
  assert.deepEqual(shellWords('x "unclosed ; y'), [['x', 'unclosed ; y']], 'an unbalanced quote runs to the end');
  assert.deepEqual(shellWords('x ""'), [['x', '']], 'an empty quoted string is a word');
  assert.deepEqual(shellWords('x\r\ny'), [['x'], ['y']], 'CRLF');
  for (const odd of [undefined, null, '', '   ', '\\', '\\\n', '"\\', "'", '|||', '&&&&', ';', '\n\n']) assert.ok(Array.isArray(shellWords(odd)), String(odd));
  assert.deepEqual(shellWords('\\'), [], 'a lone back-slash is nothing');
  for (const odd of [undefined, null, 42, {}, [], true]) {
    assert.equal(pagesOfCommand(odd).size, 0, String(odd));
    assert.equal(pagesOfInput(odd).size, 0, String(odd));
  }
  assert.equal(pagesOfInput({ path: [PAGE], paths: { 0: PAGE } }).size, 0, 'only a string path, and only an array of paths');
});

test('ARC-09-C263 M4 — compaction is keyed on the LAST boundary row: a Read before it stops grounding, a Read after it counts, whatever the trigger', () => {
  const before = read('r1', PAGE, '1\tsn_before_table');
  const after = read('r2', PAGE.replace('c_Example', 'c_After'), '1\tsn_after_table');
  const one = turnSources([U('first'), ...before, boundary(), U('second'), ...after], OPTIONS);
  assert.deepEqual([...one.pagesRead], ['markdown/itsm/c_After.md']);
  assert.ok(!one.names.read.has('sn_before_table') && one.names.read.has('sn_after_table'));
  assert.deepEqual(one.request, ['second'], 'the request is the prompts after the boundary');
  // Two boundaries: only what follows the second.
  const two = turnSources([U('a'), ...before, boundary(), U('b'), ...after, boundary(), U('c')], OPTIONS);
  assert.equal(two.pagesRead.size, 0);
  assert.deepEqual(two.request, ['c']);
  assert.equal(two.compacted, 2);
  // A result whose call is before the boundary is unknown after it.
  const orphan = turnSources([U('a'), use('r9', 'Read', { file_path: PAGE }), boundary(), res('r9', '1\tsn_orphan_table')], OPTIONS);
  assert.equal(orphan.pagesRead.size, 0);
});

test('ARC-09-C263 M4 — compaction on a real capture: a corpus Read put before its boundary does not count, the same Read after it does', () => {
  for (const version of ['2.1.309', '2.1.318']) {
    const real = rowsOf(version, 'resume-compact');
    const at = real.findIndex((r) => r.type === 'system' && r.subtype === 'compact_boundary');
    assert.ok(at > 0, `${version}: boundary found`);
    const planted = read('plant1', PAGE, '1\tsn_planted_table');
    const early = turnSources([...real.slice(0, at), ...planted, ...real.slice(at)], OPTIONS);
    const late = turnSources([...real, ...planted], OPTIONS);
    assert.equal(early.pagesRead.size, 0, `${version}: a Read before the boundary counted`);
    assert.deepEqual([...late.pagesRead], ['markdown/itsm/c_Example.md'], `${version}: a Read after the boundary did not count`);
  }
});

test('ARC-09-C263 M4 — Windows: back-slash Read paths are corpus pages, and a transcript with CRLF parses to the same sources', () => {
  const win = turnSources([U('r'), ...read('w1', 'C:\\work\\snowarch\\vendor\\ServiceNowDocs\\markdown\\itsm\\c_Example.md', '1\tsn_win_table')], OPTIONS);
  assert.deepEqual([...win.pagesRead], ['markdown/itsm/c_Example.md']);
  assert.ok(win.names.read.has('sn_win_table'));
  const sk = turnSources([U('r'), ...read('w2', 'C:\\work\\snowarch\\.claude\\skills\\itsm-specialist\\SKILL.md', '1\tsn_win_skill'),
    ...read('w3', 'C:\\work\\snowarch\\clients\\acme\\envelopes\\e.md', 'cites markdown/itsm/c_Example.md here sn_win_env')], OPTIONS);
  assert.ok(sk.names.skill.has('sn_win_skill'));
  assert.ok(sk.savedCitations.has('markdown/itsm/c_Example.md'));
  // The same capture with CRLF line endings (synthetic: Windows captures are the CI cells' job, labelled in the manifest).
  const lf = readFileSync(capture('2.1.318', 'corpus-reads'), 'utf8');
  const a = parseTranscript(lf);
  const b = parseTranscript(lf.replace(/\n/g, '\r\n'));
  assert.equal(b.crlf, true);
  assert.equal(b.rows.length, a.rows.length);
  assert.deepEqual([...turnSources(b.rows, OPTIONS).pagesRead].sort(), [...turnSources(a.rows, OPTIONS).pagesRead].sort());
  // ...and with back-slash paths in every Read, as a Windows session writes them.
  const slashed = a.rows.map((r) => JSON.parse(JSON.stringify(r).replace(/"file_path":"([^"]*)"/g, (_, p) => `"file_path":"${p.replace(/\//g, '\\\\')}"`)));
  assert.deepEqual([...turnSources(slashed, OPTIONS).pagesRead].sort(), [...turnSources(a.rows, OPTIONS).pagesRead].sort());
});

test('ARC-09-C263 M4 — namesIn: underscore tokens and dotted names, normalised as the index normalises them', () => {
  const n = namesIn('The `sys\\_user` and SC_REQ_ITEM, _emphasis_ and com.snc.thing; a plain word, 1.2.3 and file.txt.');
  assert.ok(n.has('sys_user') && n.has('sc_req_item') && n.has('com.snc.thing'));
  assert.ok(!n.has('emphasis') && !n.has('plain'));
});

// ---- reading the file ----------------------------------------------------------------------------------------------------------
test('ARC-09-C263 M4 — readTurnSources: null, with one reason, for a missing, empty, foreign, oversize or garbage file — and it never throws', () => {
  const dir = tempDir('turn-sources-');
  const reasons = [];
  const onDebug = (r) => reasons.push(r);
  assert.equal(readTurnSources(join(dir, 'nowhere.jsonl'), { onDebug }), null);
  assert.equal(readTurnSources(undefined, { onDebug }), null);
  writeFileSync(join(dir, 'empty.jsonl'), '');
  assert.equal(readTurnSources(join(dir, 'empty.jsonl'), { onDebug }), null);
  writeFileSync(join(dir, 'other.jsonl'), '{"event":"x"}\n{"event":"y"}\n');
  assert.equal(readTurnSources(join(dir, 'other.jsonl'), { onDebug }), null, 'JSON lines without a `type`: an unknown format');
  writeFileSync(join(dir, 'garbage.jsonl'), Buffer.from([0, 255, 254, 10, 123, 10, 91, 93, 10]));
  assert.equal(readTurnSources(join(dir, 'garbage.jsonl'), { onDebug }), null);
  writeFileSync(join(dir, 'prose.jsonl'), 'not json at all\nnor this\n');
  assert.equal(readTurnSources(join(dir, 'prose.jsonl'), { onDebug }), null);
  writeFileSync(join(dir, 'ok.jsonl'), `${JSON.stringify(U('hello'))}\n`);
  assert.equal(readTurnSources(join(dir, 'ok.jsonl'), { onDebug, maxBytes: 5 }), null, 'over the size limit: reply-only checks');
  assert.ok(reasons.some((r) => /over the 5 limit/.test(r)));
  assert.ok(readTurnSources(join(dir, 'ok.jsonl'), { options: OPTIONS }), 'control: the same file under the limit reads');
  assert.equal(MAX_TRANSCRIPT_BYTES, 64 * 1_000_000, '64 MB, in the one decimal unit the product uses (size.mjs)');
  assert.equal(readTurnSources(join(dir, 'ok.jsonl'), { read: () => { throw new Error('EIO'); }, onDebug }), null, 'a read that throws');
  assert.ok(reasons.length >= 7, 'each null said why');
});

test('ARC-09-C263 M4 — parseTranscript: CRLF, a byte-order mark, blank lines and a ragged tail', () => {
  const body = [JSON.stringify(U('one')), '', JSON.stringify(U('two')), '{"type":"user","message":{"role":"user","con'].join('\r\n');
  const p = parseTranscript(`\uFEFF${body}`);
  assert.equal(p.rows.length, 2);
  assert.equal(p.badLines, 1, 'the half-written last line is counted and skipped');
  assert.equal(p.crlf, true);
});
