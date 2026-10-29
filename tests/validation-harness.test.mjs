// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';
import { DEFAULT_MODEL, SETTING_SOURCES, header, policyFor } from '../scripts/validation/session-policy.mjs';
import { POSIX } from '../tools/snowarch/lib/launcher-spelling.mjs';
import { formatReport, reportTurn } from '../scripts/validation/turn-report.mjs';
import { initFixtureRepo } from '../tools/snowarch/tests/helpers/fixture-git.mjs';

/**
 * ARC-09-C87 — the validation harness runs every case, isolates the session it runs, and reports what a
 * reviewer used to measure by hand.
 *
 * `validation-run.sh` produces sessions; a person judges them. Three things were wrong with what it
 * produced. The extractor skipped every case above T-18, so T-19 to T-25 could not be run at all. Its
 * sessions inherited the machine's user-level settings and hooks, and `--allowedTools` grants permission
 * without confining the tool set, so the d01fbf9 sitting saw read-only Bash and an async sub-agent run
 * with no denial. And the runner reported none of what a reviewer then counts: the skills invoked, the
 * corpus pages read, and the cited pages that do not exist.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const SPEC = 'tests/VALIDATION-TESTS.md';

function extract(specText, t) {
  const dir = tempDir('c87-extract-', t);
  const src = join(dir, 'spec.md');
  const out = join(dir, 'out.json');
  writeFileSync(src, specText);
  execFileSync(process.execPath, [join(root, 'scripts/validation/extract-validation-prompts.mjs'), src, out], { stdio: 'pipe' });
  return JSON.parse(readFileSync(out, 'utf8'));
}

// ── (a) the extractor reads every case ──────────────────────────────────────────────────────────

test('C87 (a) — the extractor reads every case in the spec: extracted count equals heading count', (t) => {
  const spec = read(SPEC);
  const headings = [...spec.matchAll(/^## (T-\d\d) /gm)].map((m) => m[1]);
  const tests = extract(spec, t);
  assert.deepEqual(tests.map((x) => x.id), headings, 'a case the extractor skips is a case no run can make');
  assert.ok(headings.length >= 25, `the spec has ${headings.length} cases`);
  // Each case that has a Prompt section gives the runner at least one prompt. The case's OWN section: this
  // sliced to the end of the file, so T-28, which has no Prompt, read T-29's below it and was called bare.
  const section = (id) => {
    const at = spec.indexOf(`## ${id} `);
    const next = spec.indexOf('\n## ', at + 1);
    return spec.slice(at, next < 0 ? undefined : next);
  };
  const bare = tests.filter((x) => /\n### Prompt\n/.test(section(x.id)) && x.prompts.length === 0).map((x) => x.id);
  assert.deepEqual(bare, [], 'a Prompt section with no fenced prompt');
});

test('C87 (a) — a case numbered above T-18 is extracted (the old cap would drop it)', (t) => {
  const cases = Array.from({ length: 21 }, (_, i) => {
    const n = String(i + 1).padStart(2, '0');
    return `## T-${n} — case ${n}\n\n**Modes:** design-only\n\n### Prompt\n\n\`\`\`\nask ${n}\n\`\`\`\n\n### Expected behaviour\n\nx\n\n---\n`;
  });
  const tests = extract(`# spec\n\n${cases.join('\n')}`, t);
  assert.equal(tests.length, 21);
  assert.deepEqual(tests.at(-1).prompts, ['ask 21']);
});

// ── (b) the session is isolated ─────────────────────────────────────────────────────────────────

test('C87 (b) — the policy: Sonnet 5.5 by default, the clone\'s own settings, and a tool set that is a set', () => {
  assert.equal(DEFAULT_MODEL, 'claude-sonnet-5-5');
  assert.equal(SETTING_SOURCES, 'project,local');
  const base = policyFor('T-01');
  assert.deepEqual(base.tools, ['Read', 'Grep', 'Glob', 'Skill']);
  assert.deepEqual(base.allowed, base.tools);
  const t07 = policyFor('T-07');
  assert.ok(t07.tools.includes('Bash'), 'T-07 runs the doctor');
  const { cli } = POSIX;
  assert.deepEqual(t07.allowed.filter((a) => a.startsWith('Bash')), [`Bash(${cli}:*)`, `Bash(${cli} doctor:*)`]);
  assert.ok(policyFor('T-13').tools.includes('Write'));
  // ARC-09-C243 — T-38 prints the status panel and may run the doctor, and nothing else of the launcher: a Bash grant for
  // those two commands, never for the whole CLI, and no Write.
  const t38 = policyFor('T-38');
  assert.ok(t38.tools.includes('Bash'), 'T-38 runs the status command');
  assert.deepEqual(t38.allowed.filter((a) => a.startsWith('Bash')), [`Bash(${cli} status:*)`, `Bash(${cli} doctor:*)`]);
  assert.ok(!t38.tools.includes('Write'), 'T-38 writes nothing');
  for (const id of ['T-01', 'T-07', 'T-13', 'T-25', 'T-38']) {
    const p = policyFor(id);
    assert.deepEqual(p.tools.filter((x) => ['Agent', 'Task', 'WebFetch', 'WebSearch', 'Edit'].includes(x)), [], `${id} has no sub-agent, web or edit tool`);
    // Every allowed pattern names a tool that exists: permission is never granted for a tool the session lacks.
    for (const a of p.allowed) assert.ok(p.tools.includes(a.replace(/\(.*$/, '')), `${id}: ${a} is allowed but not available`);
  }
});

test('C87 (b) — every claude invocation in the runner carries the policy flags', () => {
  const sh = read('scripts/validation/validation-run.sh');
  const calls = sh.split('\n').filter((l) => /^\s*claude -p "/.test(l));   // the invocations, not the prose about them
  assert.equal(calls.length, 2, 'a first turn and a resumed turn');
  for (const l of calls) {
    for (const flag of ['--model "$MODEL"', '--setting-sources "$SOURCES"', '--strict-mcp-config', '--tools "$TOOLS"', '--allowedTools "$ALLOWED"']) {
      assert.ok(l.includes(flag), `a claude call lacks ${flag}: ${l.trim().slice(0, 80)}`);
    }
  }
  assert.doesNotMatch(sh, /--allowedTools "\$TOOLS"/, 'permission without confinement is the old arrangement');
});

test('C87 (b) — the header names the sha, model, setting sources and tools', () => {
  const lines = header({ tag: 'v9.0.0', sha: 'abc1234', model: DEFAULT_MODEL, version: '2.1.289 (Claude Code)' }).join('\n');
  for (const want of ['v9.0.0', 'abc1234', 'claude-sonnet-5-5', 'setting sources: project,local', 'Read,Grep,Glob,Skill', 'T-07', 'Bash', 'T-13', 'Write', '2.1.289']) {
    assert.ok(lines.includes(want), `the header does not say ${want}:\n${lines}`);
  }
  assert.match(lines, /mcp: none/, 'a design-only run reaches no MCP server');
});

// ARC-11-C6 — the architect's sitting on 199e806 (2026-10-12) ran no SessionStart hook, so its sessions had no
// Licence line, and T-31 could not fire. The hook is registered in the clone's local settings, where the bootstrap
// writes it (ARC-06-S05: the committed file stays hook-free), and `project` alone does not load that file.
test('ARC-11-C6 — the sessions load the settings the SessionStart hook is in, so its Licence line reaches T-31', async () => {
  const { hookEntry, SETTINGS_LOCAL } = await import('../tools/snowarch/lib/settings-local.mjs');
  assert.ok(hookEntry().SessionStart, 'the bootstrap registers no SessionStart hook');
  assert.equal(SETTINGS_LOCAL.split('\\').join('/'), '.claude/settings.local.json');
  assert.equal(JSON.parse(read('.claude/settings.json')).hooks, undefined, 'the committed settings carry a hook');
  // So a session loads the local file as well as the project's, and still never the machine's own settings.
  const sources = SETTING_SOURCES.split(',');
  assert.ok(sources.includes('local'), `the sessions load ${SETTING_SOURCES}, which leaves the hook's file out`);
  assert.ok(sources.includes('project'));
  assert.equal(sources.includes('user'), false, 'the machine\'s own settings reach the session');
});

// ── (c) the turn report ─────────────────────────────────────────────────────────────────────────

function corpus(t) {
  const dir = tempDir('c87-corpus-', t);
  const md = join(dir, 'vendor', 'ServiceNowDocs', 'markdown');
  mkdirSync(join(md, 'it-service-management', 'incident'), { recursive: true });
  mkdirSync(join(md, 'customer-service-management'), { recursive: true });
  writeFileSync(join(md, 'it-service-management', 'incident', 'real-page.md'), 'x');
  writeFileSync(join(md, 'customer-service-management', 'twin.md'), 'x');
  writeFileSync(join(md, 'it-service-management', 'twin.md'), 'x');
  writeFileSync(join(md, 'customer-service-management', 'only-here.md'), 'x');
  initFixtureRepo((args) => execFileSync('git', args, { cwd: dir }), dir, ['-q', '-b', 'main']);
  writeFileSync(join(dir, 'CLAUDE.md'), 'x');
  execFileSync('git', ['add', 'CLAUDE.md'], { cwd: dir });
  return dir;
}

const stream = (events) => events.map((e) => JSON.stringify(e)).join('\n');
const assistant = (...content) => ({ type: 'assistant', message: { content } });
const text = (s) => ({ type: 'text', text: s });
const use = (name, input) => ({ type: 'tool_use', name, input });

test('C87 (c) — the skills invoked and the corpus pages read are counted from the tool calls', (t) => {
  const dir = corpus(t);
  const r = reportTurn(stream([
    assistant(use('Skill', { skill: 'itsm-specialist' })),
    assistant(use('Read', { file_path: '.claude/skills/csm-specialist/SKILL.md' })),
    assistant(use('Read', { file_path: 'vendor/ServiceNowDocs/markdown/it-service-management/incident/real-page.md' })),
    assistant(use('Read', { file_path: `${dir}/vendor/ServiceNowDocs/markdown/it-service-management/incident/real-page.md` })),
    assistant(use('Grep', { pattern: 'x', path: 'vendor/ServiceNowDocs/markdown' })),
    assistant(use('Read', { file_path: 'docs/MODES-AND-PRESETS.md' })),
    { type: 'result', result: 'done' },
  ]), { repoRoot: dir });
  assert.deepEqual(r.skills, [{ name: 'itsm-specialist', how: 'Skill' }, { name: 'csm-specialist', how: 'Read' }]);
  assert.equal(r.corpusReads.length, 1, 'the same page twice, by two spellings, is one page; a repo file is not a corpus page');
  assert.equal(r.corpusSearches, 1);
});

test('C87 (c) — a cited page is resolved: full path, bare name, ambiguous name, or missing', (t) => {
  const dir = corpus(t);
  const answer = [
    'Per *(citation: `markdown/it-service-management/incident/real-page.md`)* the flow holds.',
    'Also vendor/ServiceNowDocs/markdown/customer-service-management/only-here.md and ServiceNowDocs/markdown/it-service-management/incident/ghost.md.',
    'A bare name: only-here.md. An ambiguous one: twin.md. One that is nowhere: nowhere.md.',
    'Repo files are not citations: CLAUDE.md and docs/ARCHITECTURE.md.',
  ].join('\n');
  const r = reportTurn(stream([assistant(text(answer)), { type: 'result', result: answer }]), { repoRoot: dir });
  const by = Object.fromEntries(r.citations.map((c) => [c.cited, c.status]));
  assert.equal(by['markdown/it-service-management/incident/real-page.md'], 'ok');
  assert.equal(by['vendor/ServiceNowDocs/markdown/customer-service-management/only-here.md'], 'ok');
  assert.equal(by['ServiceNowDocs/markdown/it-service-management/incident/ghost.md'], 'missing', 'a full path that is not there');
  assert.equal(by['only-here.md'], 'bare', 'a bare name that resolves to one page is flagged, not accepted');
  assert.equal(by['twin.md'], 'ambiguous');
  assert.equal(by['nowhere.md'], 'missing');
  assert.equal(by['CLAUDE.md'], undefined);
  assert.equal(by['docs/ARCHITECTURE.md'], undefined);
  const line = formatReport(r);
  assert.match(line, /citations: 6 \(ok 2 · bare 1 · ambiguous 1 · missing 2\)/);
  assert.match(line, /MISSING .*ghost\.md/);
  assert.match(line, /MISSING .*nowhere\.md/);
});

test('C87 (c) — a turn with nothing to report says so, and never throws on a ragged stream', (t) => {
  const dir = corpus(t);
  const r = reportTurn('not json\n{"type":"assistant"}\n{"type":"assistant","message":{"content":"plain"}}\n', { repoRoot: dir });
  assert.deepEqual([r.skills.length, r.corpusReads.length, r.citations.length], [0, 0, 0]);
  assert.match(formatReport(r), /skills: none · corpus pages read: 0 · citations: 0/);
});

// ── a skill run by its slash command ────────────────────────────────────────────────────────────
// ARC-09-C243 — `claude -p "/snowarch status"` has the CLI expand the skill before the model's first step, so the stream holds
// no Skill call and no Read of the skill's file, and the report said `skills: none` for a turn that followed the skill. A
// reviewer reads that line as "the skill was never read" (the sitting of 2026-10-29 read it that way for the bare `Status`
// prompt, where it was true). The prompt is what says the skill ran, so the report is given the prompt.
test('C243 — a turn whose prompt is a skill\'s slash command reports that skill; a prompt that is not one reports none', (t) => {
  const dir = corpus(t);
  mkdirSync(join(dir, '.claude', 'skills', 'snowarch'), { recursive: true });
  writeFileSync(join(dir, '.claude', 'skills', 'snowarch', 'SKILL.md'), '---\nname: snowarch\n---\n');
  const ran = stream([assistant(use('Bash', { command: `${POSIX.cli} status` })), { type: 'result', result: 'done' }]);
  const skills = (prompt) => reportTurn(ran, { repoRoot: dir, prompt }).skills;
  assert.deepEqual(skills('/snowarch status'), [{ name: 'snowarch', how: 'slash command' }]);
  assert.deepEqual(skills('/snowarch'), [{ name: 'snowarch', how: 'slash command' }], 'a slash command with no argument');
  assert.deepEqual(skills('  /snowarch status\n'), [{ name: 'snowarch', how: 'slash command' }], 'the prompt file ends in a newline');
  assert.match(formatReport(reportTurn(ran, { repoRoot: dir, prompt: '/snowarch status' })), /^skills: snowarch \(slash command\) · /);
  // each of these must report none: the detector is shown able to say no
  assert.deepEqual(skills('Status'), [], 'a bare word is routed by CLAUDE.md, not by the skill');
  assert.deepEqual(skills('/clear'), [], 'a slash command that is no skill of this checkout');
  assert.deepEqual(skills('/snowarchx status'), [], 'a longer name is another command');
  assert.deepEqual(skills('please run /snowarch status'), [], 'a slash command that is not the start of the prompt');
  assert.deepEqual(skills(''), []);
  assert.deepEqual(reportTurn(ran, { repoRoot: dir }).skills, [], 'no prompt given: nothing is claimed');
  // a skill the model loaded itself is still reported as before, beside it
  const both = reportTurn(stream([assistant(use('Skill', { skill: 'snowarch' }))]), { repoRoot: dir, prompt: '/snowarch status' });
  assert.deepEqual(both.skills, [{ name: 'snowarch', how: 'Skill' }, { name: 'snowarch', how: 'slash command' }]);
});

test('C243 — the runner gives each turn\'s prompt file to the report, and the report takes it as its third argument', () => {
  const code = read('scripts/validation/validation-run.sh').split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  assert.match(code, /turn-report\.mjs" "\$OUT" "\$C" "\$RUN\/prompt\.txt"/, 'the report is not given the prompt');
  // the prompt file is written before the session runs and the report runs after it, so it is this turn's prompt
  assert.ok(code.indexOf('> "$RUN/prompt.txt"') < code.indexOf('turn-report.mjs'), 'the report reads a prompt that is not this turn\'s');
  assert.match(read('scripts/validation/turn-report.mjs'), /usage: turn-report\.mjs <stream\.jsonl> <checkout> \[<prompt\.txt>\]/);
});

// ── a Stop hook sent the turn on ────────────────────────────────────────────────────────────────
// ARC-09-C254 — when the Stop hook asks for a correction line, the `result` row of the stream is that line and nothing else: it
// is the last message. Every reader that took `result.result` for the answer then graded the correction. The answer is what the
// model wrote after its last tool result, the reply and the line after it; text written before a tool call is narration, and a
// sub-agent's text is not the main thread's.
const toolResult = (id = 't1') => ({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] } });
const hookFeedback = (s) => ({ type: 'user', message: { content: [{ type: 'text', text: `Stop hook feedback:\n${s}` }] } });
const DEAD = 'markdown/it-service-management/real-page.md';
const REAL = 'markdown/it-service-management/incident/real-page.md';
const statusOf = (r) => Object.fromEntries(r.citations.map((c) => [c.cited, c.status]));

test('C254 — the answer is all the text after the last tool result: the reply, and the correction a Stop hook asked for', (t) => {
  const dir = corpus(t);
  const correction = `Correction: the page is ${REAL}.`;
  const r = reportTurn(stream([
    assistant(use('Read', { file_path: 'vendor/ServiceNowDocs/markdown/it-service-management/incident/real-page.md' })), toolResult(),
    assistant(text(`A claim (citation: ${DEAD}).`)),
    hookFeedback('Your reply cites a corpus page at a path that does not exist.'),
    assistant(text(correction)),
    { type: 'result', result: correction },
  ]), { repoRoot: dir });
  assert.deepEqual(statusOf(r), { [DEAD]: 'missing', [REAL]: 'ok' }, 'the reply before the correction is part of the answer');
  assert.match(formatReport(r), /citations: 2 \(ok 1 · bare 0 · ambiguous 0 · missing 1\)/);
});

test('C254 — the same when the hook gave its feedback as context, with nothing between the two messages', (t) => {
  const dir = corpus(t);
  const correction = `Correction: the page is ${REAL}.`;
  const r = reportTurn(stream([
    assistant(use('Read', { file_path: 'docs/MODES-AND-PRESETS.md' })), toolResult(),
    assistant(text(`A claim (citation: ${DEAD}).`)), assistant(text(correction)),
    { type: 'result', result: correction },
  ]), { repoRoot: dir });
  assert.deepEqual(statusOf(r), { [DEAD]: 'missing', [REAL]: 'ok' });
});

test('C254 — text written before the last tool result is narration, not the answer', (t) => {
  const dir = corpus(t);
  const final = `Done (citation: ${REAL}).`;
  const r = reportTurn(stream([
    assistant(text(`I will try ${DEAD} first.`), use('Read', { file_path: 'docs/MODES-AND-PRESETS.md' })), toolResult('t1'),
    assistant(text(`That did not work; ${DEAD} again.`), use('Read', { file_path: 'docs/MODES-AND-PRESETS.md' })), toolResult('t2'),
    assistant(text(final)),
    { type: 'result', result: final },
  ]), { repoRoot: dir });
  assert.deepEqual(statusOf(r), { [REAL]: 'ok' });
});

test('C254 — a sub-agent\'s text is not the main thread\'s, wherever it falls in the stream', (t) => {
  const dir = corpus(t);
  const final = `Final (citation: ${REAL}).`;
  const sub = (...content) => ({ type: 'assistant', parent_tool_use_id: 'toolu_task', message: { content } });
  const r = reportTurn(stream([
    assistant(use('Task', { prompt: 'x' })),
    sub(text(`The sub-agent says ${DEAD}.`)), toolResult('toolu_task'),
    assistant(text(final)),
    sub(text(`A sub-agent that reports late: ${DEAD}.`)),
    { type: 'result', result: final },
  ]), { repoRoot: dir });
  assert.deepEqual(statusOf(r), { [REAL]: 'ok' });
  // a sub-agent's late tool result is not the main thread's last, so it does not cut the reply from its correction
  const correction = `Correction: the page is ${REAL}.`;
  const late = reportTurn(stream([
    assistant(use('Read', { file_path: 'docs/MODES-AND-PRESETS.md' })), toolResult(),
    assistant(text(`A claim (citation: ${DEAD}).`)), hookFeedback('Your reply cites a corpus page at a path that does not exist.'),
    assistant(text(correction)),
    { type: 'user', parent_tool_use_id: 'toolu_task', message: { content: [{ type: 'tool_result', tool_use_id: 'x', content: 'late' }] } },
    { type: 'result', result: correction },
  ]), { repoRoot: dir });
  assert.deepEqual(statusOf(late), { [DEAD]: 'missing', [REAL]: 'ok' });
});

test('C254 — a stream with no result row has the answer as it always had: all the assistant text', (t) => {
  const dir = corpus(t);
  const r = reportTurn(stream([assistant(text(`One (citation: ${DEAD}).`)), assistant(text(`Two (citation: ${REAL}).`))]), { repoRoot: dir });
  assert.deepEqual(statusOf(r), { [DEAD]: 'missing', [REAL]: 'ok' });
});

test('C254 — a result row with no text blocks before it is still the answer', (t) => {
  const dir = corpus(t);
  const r = reportTurn(stream([assistant(use('Read', { file_path: 'docs/MODES-AND-PRESETS.md' })), { type: 'result', result: `It is (citation: ${REAL}).` }]),
    { repoRoot: dir });
  assert.deepEqual(statusOf(r), { [REAL]: 'ok' });
});

// ── the finding flow's copy: in the reply, as the finder printed it, and not in a fence ─────────────────────────────────────
// ARC-09-C252 (a), ruled by the architect on 2026-10-29. T-37 turn 3 asks for the copy "verbatim", and a reviewer judged it by eye: on
// develop both runs put it in a code fence after a sentence of prose, and on the head one said its output was above and never printed it.
// The report counts it, so a before and an after are numbers and not impressions.
const COPY_OUT = ['instance store NOT read — check every instance name · credentials NOT read — check usernames and passwords before sending', '',
  '<engagement> showed the wrong group on <instance-url-1>.', '', 'Read before sending:', '- people: names of colleagues, users and customers'].join('\n');
const FINDER = 'node tools/snowarch/lib/finding.mjs clients/acme-bank/findings/2026-10-29-wrong-group.md';
const ran = (id, command, out) => [
  { type: 'assistant', message: { content: [{ type: 'tool_use', id, name: 'Bash', input: { command } }] } },
  { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content: out }] } },
];
const copyOf = (events, reply) => reportTurn(stream([...events, assistant(text(reply)), { type: 'result', result: reply }]), { repoRoot: root }).findingCopy;

test('C252 (a) — the report says whether the finder\'s output is in the reply as printed, and whether it is in a code fence', () => {
  const events = ran('t1', FINDER, COPY_OUT);
  const send = 'Send the text above to the person who issued your licence.';
  assert.deepEqual(copyOf(events, `${COPY_OUT}\n\n${send}`), { verbatim: true, fenced: false });
  assert.deepEqual(copyOf(events, `The note is saved at clients/acme-bank/findings/x.md.\n\n${COPY_OUT}\n\n${send}`), { verbatim: true, fenced: false },
    'a sentence before the copy is not a fence');
  assert.deepEqual(copyOf(events, `The note is saved.\n\n\`\`\`\n${COPY_OUT}\n\`\`\`\n\n${send}`), { verbatim: true, fenced: true });
  assert.deepEqual(copyOf(events, `\`\`\`text\n${COPY_OUT}\n\`\`\`\n${send}`), { verbatim: true, fenced: true }, 'a fence with a language');
  assert.deepEqual(copyOf(events, `A fenced example first:\n\`\`\`\nx\n\`\`\`\n\n${COPY_OUT}\n${send}`), { verbatim: true, fenced: false },
    'a fence that is closed before the copy does not hold it');
  assert.deepEqual(copyOf(events, 'The masker ran; its output is above.\n\n' + send), { verbatim: false, fenced: false });
  assert.deepEqual(copyOf(events, `${COPY_OUT.split('\n').slice(0, 3).join('\n')}\n\n${send}`), { verbatim: false, fenced: false }, 'a part of it is not the copy');
  assert.deepEqual(copyOf(events, COPY_OUT.split('\n').map((l) => `> ${l}`).join('\n')), { verbatim: false, fenced: false }, 'a quotation block is not verbatim');
});

test('C252 (a) — a turn with no finder run, or only the one that names the note, has no finding copy to report', () => {
  assert.equal(copyOf(ran('t2', `${POSIX.cli} status`, 'Mode: design-only'), 'Mode: design-only'), null);
  assert.equal(copyOf(ran('t3', 'node tools/snowarch/lib/finding.mjs --next-name acme-bank wrong-group', 'clients/acme-bank/findings/2026-10-29-wrong-group.md'),
    'I will write the note there.'), null);
  // a finder run whose output has no review list is not a copy (a refusal prints one sentence)
  assert.equal(copyOf(ran('t4', 'node tools/snowarch/lib/finding.mjs /etc/passwd', 'refused: not a note under clients/<engagement>/findings/'), 'refused'), null);
  const line = formatReport(reportTurn(stream([...ran('t5', FINDER, COPY_OUT), assistant(text(COPY_OUT)), { type: 'result', result: COPY_OUT }]), { repoRoot: root }));
  assert.match(line, /^skills: none · corpus pages read: 0 · citations: 0 · finding copy: in the reply, verbatim, unfenced$/);
  const fenced = formatReport(reportTurn(stream([...ran('t6', FINDER, COPY_OUT), assistant(text(`\`\`\`\n${COPY_OUT}\n\`\`\``)), { type: 'result', result: `\`\`\`\n${COPY_OUT}\n\`\`\`` }]), { repoRoot: root }));
  assert.match(fenced, / · finding copy: in the reply, but in a code fence$/);
  const gone = formatReport(reportTurn(stream([...ran('t7', FINDER, COPY_OUT), assistant(text('Its output is above.')), { type: 'result', result: 'Its output is above.' }]), { repoRoot: root }));
  assert.match(gone, / · finding copy: NOT in the reply as printed \(only in the tool result, or changed\)$/);
  // a turn that ran no finder keeps the line it always had
  assert.match(formatReport(reportTurn('', { repoRoot: root })), /^skills: none · corpus pages read: 0 · citations: 0$/);
});

// ── the gateways ask for the full path ──────────────────────────────────────────────────────────

test('C87 (c) — each gateway\'s citation format asks for the full path from markdown/, never a bare file name', () => {
  for (const g of ['itsm', 'csm', 'hrsd', 'itom-discovery', 'cmdb-csdm', 'fso-insurance']) {
    const f = `.claude/skills/${g}-specialist/SKILL.md`;
    const body = read(f);
    const at = body.search(/(\*\*Citation format:\*\*|### Citation format)/);
    assert.ok(at >= 0, `${f} has no citation format`);
    const section = body.slice(at, at + 700);
    assert.match(section, /full path[^.]*markdown\//i, `${f}: the citation format does not ask for the full path`);
    assert.match(section, /never (a )?bare file name/i, `${f}: it does not forbid the bare file name`);
  }
});
