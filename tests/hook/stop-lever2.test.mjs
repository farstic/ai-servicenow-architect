// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C267, lever 2 — the Stop hook on unread citations, through the hook itself, on a fixture transcript for each case.
 *
 * At the end of a turn the hook lists the corpus pages that the final answer, or a file written in that turn, cites and that reached the
 * session by no read route. It asks once. This file is the contract of that sentence, case by case, with the transcript Claude Code would
 * have kept: a page that Read, a Bash `cat`, `sed`, `head`, `tail`, `awk`, `nl`, `grep` or `rg` that names it (relative to the shell's folder,
 * which a `cd` sets and the next Bash call keeps), a Grep in content mode, an MCP file read, a sub-agent's reads and a read before a
 * compaction all count; a heredoc that writes a file, a failed command, another page and a listing do not. A pointer sentence, a path the user
 * typed and a page the answer says it did not open are not claims. One ask a turn. A classes file that is missing or corrupt switches it off.
 *
 * The cases turn the class on through the hook's own seam (`options.blocking`), so they test the hook and not the data; the cases of "as
 * shipped" at the end call it without one.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tempDir } from '../../tools/snowarch/tests/helpers/temp.mjs';
import { KEEP_OUT, LEAD, parseClasses } from '../../tools/snowarch/lib/docs/grounding-check.mjs';
import { report } from '../../tools/snowarch/hooks/stop-citations.mjs';

const PIN = 'd'.repeat(40);
const PAGE = {
  alpha: 'markdown/it-service-management/c_Alpha.md',
  beta: 'markdown/it-service-management/c_Beta.md',
  gamma: 'markdown/customer-service-management/c_Gamma.md',
  delta: 'markdown/hr-service-delivery/c_Delta.md',
};
// Built, not spelled whole: engine lint L02 holds every literal `mcp__<server>__` under tests/ to the product's own server key.
const CTX_FILE = ['mcp', 'context-mode', 'ctx_execute_file'].join('__');
const CTX_BATCH = ['mcp', 'context-mode', 'ctx_batch_execute'].join('__');

// ---- an install, a session and its rows ---------------------------------------------------------------------------------------
/** A checkout with the docs pin, a roster and the pages on disk (so no path is a dead one: C254 has nothing to say). */
function install(t) {
  const root = tempDir('lever2-', t);
  writeFileSync(join(root, 'engine.config.json'), `${JSON.stringify({ docs: { pin: PIN } })}\n`);
  mkdirSync(join(root, '.claude', 'agents'), { recursive: true });
  writeFileSync(join(root, '.claude', 'agents', 'story-writer.md'), '# story-writer\n');
  mkdirSync(join(root, '.claude', 'skills', 'csm-specialist'), { recursive: true });
  writeFileSync(join(root, 'CLAUDE.md'), '# CLAUDE\n');
  for (const rel of Object.values(PAGE)) {
    mkdirSync(dirname(join(root, 'vendor', 'ServiceNowDocs', rel)), { recursive: true });
    writeFileSync(join(root, 'vendor', 'ServiceNowDocs', rel), 'The sn\\_example table.\n');
  }
  const corpus = join(root, 'vendor', 'ServiceNowDocs');
  // Forward slashes on every platform: a Bash command reads a back-slash as an escape, and a Read or a PowerShell command takes either.
  const fwd = (p) => p.replaceAll('\\', '/');
  return { root, corpus, abs: (rel) => fwd(join(corpus, rel)), folder: (rel) => fwd(dirname(join(corpus, rel))) };
}
const A = (blocks, extra = {}) => ({ type: 'assistant', message: { role: 'assistant', content: blocks }, ...extra });
const U = (content, extra = {}) => ({ type: 'user', message: { role: 'user', content }, ...extra });
const use = (id, name, input, extra = {}) => A([{ type: 'tool_use', id, name, input }], extra);
const res = (id, content, extra = {}) => U([{ type: 'tool_result', tool_use_id: id, content, ...(extra.is_error ? { is_error: true } : {}) }]);
const bash = (id, command, { error = false, extra = {} } = {}) => [use(id, 'Bash', { command, description: 'x' }, extra), res(id, error ? 'Exit code 1' : '1\tThe sn\\_example table.', { is_error: error })];
const powershell = (id, command, extra = {}) => [use(id, 'PowerShell', { command, description: 'x' }, extra), res(id, '1\tThe table.')];
const readPage = (id, file, extra = {}) => [use(id, 'Read', { file_path: file }, extra), res(id, '1\tThe sn\\_example table.')];
const compaction = () => [{ type: 'system', subtype: 'compact_boundary', content: 'Conversation compacted' },
  U('This session is being continued from a previous conversation that ran out of context. Summary: ...', { isCompactSummary: true })];

/** Writes the rows as the session file (and the sub-agents' as files beside it) and runs the hook as the Stop event does. */
async function stop(t, { rows, side = {}, message, prompt = 'how does a case escalate?', input = {}, cwd = true, seams = {}, shipped = false }) {
  const { root } = t.env;
  const dir = join(root, 'sessions');
  t.env.n = (t.env.n ?? 0) + 1;
  const session = `s${t.env.n}`;                 // one session per call: the sub-agents' files of an earlier call are not this one's
  mkdirSync(join(dir, session, 'subagents'), { recursive: true });
  const stamp = (r) => (cwd && r.type === 'assistant' && r.cwd === undefined ? { ...r, cwd: root } : r);
  const body = [U(prompt), ...rows].map(stamp).map((r) => JSON.stringify(r)).join('\n');
  writeFileSync(join(dir, `${session}.jsonl`), `${body}\n`);
  for (const [name, subRows] of Object.entries(side)) writeFileSync(join(dir, session, 'subagents', `agent-${name}.jsonl`), `${subRows.map((r) => JSON.stringify({ isSidechain: true, ...r })).join('\n')}\n`);
  const stdin = { hook_event_name: 'Stop', last_assistant_message: message, transcript_path: join(dir, `${session}.jsonl`), stop_hook_active: false, ...input };
  const out = await report(stdin, { root, seams: shipped ? seams : { ...seams, options: { blocking: ['citedUnread'], ...seams.options } } });
  return out.stdout ? JSON.parse(out.stdout) : null;
}
/** A test body that has an install: `t.env` is it. */
const withInstall = (name, fn) => test(name, async (t) => { t.env = install(t); await fn(t, t.env); });
const cite = (page) => `The rule is in (citation: ${page}).`;
const asked = (d, ...pages) => {
  assert.ok(d && d.decision === 'block', `no ask: ${JSON.stringify(d)}`);
  for (const p of pages) assert.ok(d.reason.includes(p), `the ask does not name ${p}: ${d.reason}`);
};
const silent = (d, why) => assert.equal(d, null, `${why}: the hook asked: ${d && d.reason}`);

// ---- the read routes: a page that reached the session is not asked about ---------------------------------------------------------
withInstall('ARC-09-C267 lever 2 — nothing read: the cited page is asked about, once, with the words of the ask', async (t, i) => {
  const d = await stop(t, { rows: [], message: `${cite(PAGE.alpha)} And ${PAGE.beta} says the rest.` });
  asked(d, PAGE.alpha, PAGE.beta);
  assert.ok(d.reason.startsWith(LEAD));
  assert.ok(d.reason.endsWith(KEEP_OUT));
  assert.ok(d.reason.includes(`Cited pages that nothing in this session showed: ${PAGE.alpha}, ${PAGE.beta}.`), d.reason);
  assert.ok(d.reason.includes('Open each page and correct what it contradicts in your answer; where a citation only points to where to look, say on its Correction line that it is a pointer.'));
  // One ask a turn: the continuation of that turn is never asked again, however it ends.
  const again = await stop(t, { rows: [], message: cite(PAGE.alpha), input: { stop_hook_active: true } });
  silent(again, 'the continuation');
});

withInstall('ARC-09-C267 lever 2 — Read, and a Read with an offset and a limit, count', async (t, i) => {
  silent(await stop(t, { rows: readPage('r1', i.abs(PAGE.alpha)), message: cite(PAGE.alpha) }), 'Read');
  const partial = [use('r2', 'Read', { file_path: i.abs(PAGE.alpha), offset: 2, limit: 3 }), res('r2', '2\ta line')];
  silent(await stop(t, { rows: partial, message: cite(PAGE.alpha) }), 'Read with offset and limit');
  asked(await stop(t, { rows: readPage('r3', i.abs(PAGE.beta)), message: cite(PAGE.alpha) }), PAGE.alpha);
});

withInstall('ARC-09-C267 lever 2 — Bash cat, sed, head, tail, awk, nl, grep and rg that name the page count', async (t, i) => {
  const page = i.abs(PAGE.alpha);
  for (const command of [`cat ${page}`, `sed -n '1,60p;80,90p' ${page}`, `head -50 ${page}`, `tail -n 20 ${page}`, `awk 'NR<30' ${page}`, `nl ${page} | head -5`,
    `grep -n escalation ${page}`, `rg -n escalation ${page}`, `rg --no-heading -i table ${page} | head`, `cd /tmp && cat ${page}`]) {
    silent(await stop(t, { rows: bash('b', command), message: cite(PAGE.alpha) }), command);
  }
});

withInstall('ARC-09-C267 lever 2 — the C268 case: a page read with `cd <folder> && sed -n 1,60p <page>.md` is not flagged', async (t, i) => {
  const folder = i.folder(PAGE.alpha);
  const file = PAGE.alpha.split('/').pop();
  silent(await stop(t, { rows: bash('b', `cd ${folder} && sed -n 1,60p ${file}`), message: cite(PAGE.alpha) }), 'cd and sed in one command');
  silent(await stop(t, { rows: bash('b', `cd ${folder}; sed -n 1,60p ${file}`), message: cite(PAGE.alpha) }), 'a ;');
  silent(await stop(t, { rows: bash('b', `cd "${folder}" && head -50 ${file}`), message: cite(PAGE.alpha) }), 'a quoted folder');
  // The page named is the cited one: a different file name in that folder is another page.
  asked(await stop(t, { rows: bash('b', `cd ${folder} && sed -n 1,60p c_Beta.md`), message: cite(PAGE.alpha) }), PAGE.alpha);
});

withInstall('ARC-09-C267 lever 2 — a `cd` sets the shell\'s folder and the next Bash call keeps it, absolute or relative', async (t, i) => {
  const folder = i.folder(PAGE.alpha);
  const file = PAGE.alpha.split('/').pop();
  // absolute, in one call; the page by its bare name in the next
  silent(await stop(t, { rows: [...bash('b1', `cd ${folder}`), ...bash('b2', `sed -n 1,60p ${file}`)], message: cite(PAGE.alpha) }), 'absolute cd, then sed');
  // without a `cwd` on any row of the session
  silent(await stop(t, { rows: [...bash('b1', `cd ${folder}`), ...bash('b2', `cat ${file}`)], message: cite(PAGE.alpha), cwd: false }), 'absolute cd, rows with no cwd');
  // relative, from the folder the session started in (the rows' `cwd`), then deeper, then the page
  const rows = [...bash('b1', 'cd vendor/ServiceNowDocs'), ...bash('b2', 'cd markdown/it-service-management && head -50 c_Alpha.md')];
  silent(await stop(t, { rows, message: cite(PAGE.alpha) }), 'relative cd, then cd and head');
  silent(await stop(t, { rows: [...bash('b1', `cd ${i.folder(PAGE.gamma)}`), ...bash('b2', `cat ../it-service-management/${file}`)], message: cite(PAGE.alpha) }), 'cd and a path with ..');
  // a Windows session: PowerShell keeps its own folder
  const win = [...powershell('p1', `Set-Location "${folder.replaceAll('/', '\\')}"`), ...powershell('p2', `Get-Content ${file} -TotalCount 40`)];
  silent(await stop(t, { rows: win, message: cite(PAGE.alpha) }), 'Set-Location, then Get-Content');
  // what a `cd` that did not happen does not set
  asked(await stop(t, { rows: [...bash('b1', `cd ${folder}`, { error: true }), ...bash('b2', `cat ${file}`)], message: cite(PAGE.alpha) }), PAGE.alpha);
  asked(await stop(t, { rows: [...bash('b1', `(cd ${folder} && ls)`), ...bash('b2', `cat ${file}`)], message: cite(PAGE.alpha) }), PAGE.alpha);
  asked(await stop(t, { rows: [...bash('b1', `cd ${folder} | cat`), ...bash('b2', `cat ${file}`)], message: cite(PAGE.alpha) }), PAGE.alpha);
  asked(await stop(t, { rows: bash('b1', `cat ${file}`), message: cite(PAGE.alpha) }), PAGE.alpha);
});

withInstall('ARC-09-C267 lever 2 — Grep in content mode, an MCP file read and a batch command count; a Grep that only lists files does not', async (t, i) => {
  const page = i.abs(PAGE.alpha);
  const grep = (mode, result, input = {}) => [use('g', 'Grep', { pattern: 'escalation', path: i.corpus, output_mode: mode, ...input }), res('g', result)];
  silent(await stop(t, { rows: grep('content', `${page}:12:The escalation table.\n${i.abs(PAGE.beta)}:3:escalation`), message: cite(PAGE.alpha) }), 'Grep over the corpus, content');
  silent(await stop(t, { rows: grep('content', '12:The escalation table.', { path: page }), message: cite(PAGE.alpha) }), 'Grep of one page, content (no path on its lines)');
  asked(await stop(t, { rows: grep('files_with_matches', `${page}\n${i.abs(PAGE.beta)}`), message: cite(PAGE.alpha) }), PAGE.alpha);
  asked(await stop(t, { rows: grep('count', `${page}:4`), message: cite(PAGE.alpha) }), PAGE.alpha);
  const mcp = (input) => [use('m', CTX_FILE, { language: 'shell', code: 'print', ...input }), res('m', [{ type: 'text', text: 'a summary' }])];
  silent(await stop(t, { rows: mcp({ path: page }), message: cite(PAGE.alpha) }), 'an MCP file tool, path');
  const batch = [use('c', CTX_BATCH, { commands: [{ label: 'page', command: `sed -n 1,40p ${page}` }], queries: ['q'] }), res('c', [{ type: 'text', text: 'a section' }])];
  silent(await stop(t, { rows: batch, message: cite(PAGE.alpha) }), 'a command of a batch');
});

withInstall('ARC-09-C267 lever 2 — a sub-agent\'s reads and the reads before a compaction count', async (t, i) => {
  const page = i.abs(PAGE.alpha);
  const agent = [use('a1', 'Agent', { subagent_type: 'general-purpose', prompt: 'read the page' }), res('a1', 'It says the rule is X.')];
  const side = { a1: [...readPage('s1', page)], a2: [...bash('s2', `cat ${i.abs(PAGE.beta)}`)] };
  silent(await stop(t, { rows: agent, side, message: cite(PAGE.alpha) }), 'a sub-agent Read');
  silent(await stop(t, { rows: agent, side, message: cite(PAGE.beta) }), 'a sub-agent cat');
  asked(await stop(t, { rows: agent, side, message: cite(PAGE.gamma) }), PAGE.gamma);
  asked(await stop(t, { rows: agent, message: cite(PAGE.alpha) }), PAGE.alpha);
  // A compaction: what was read before it is still read.
  silent(await stop(t, { rows: [...readPage('r1', page), ...compaction(), ...readPage('r2', i.abs(PAGE.beta))], message: `${cite(PAGE.alpha)} ${cite(PAGE.beta)}` }), 'before and after a compaction');
  asked(await stop(t, { rows: [...readPage('r1', page), ...compaction()], message: cite(PAGE.gamma) }), PAGE.gamma);
});

withInstall('ARC-09-C267 lever 2 — what is not a read: a heredoc that writes a file, a failed command, another page, a listing, a grep that lists names, a directory', async (t, i) => {
  const page = i.abs(PAGE.alpha);
  const heredoc = `cat > ${join(i.root, 'notes.md')} <<'EOF'\ncat ${page}\nSee ${PAGE.alpha} and read ${page}\nEOF`;
  asked(await stop(t, { rows: bash('b', heredoc), message: cite(PAGE.alpha) }), PAGE.alpha);
  asked(await stop(t, { rows: bash('b', `cat ${page}`, { error: true }), message: cite(PAGE.alpha) }), PAGE.alpha);
  asked(await stop(t, { rows: bash('b', `cat ${i.abs(PAGE.beta)}`), message: cite(PAGE.alpha) }), PAGE.alpha);
  asked(await stop(t, { rows: bash('b', `ls ${i.folder(PAGE.alpha)}`), message: cite(PAGE.alpha) }), PAGE.alpha);
  asked(await stop(t, { rows: bash('b', `grep -l escalation ${page}`), message: cite(PAGE.alpha) }), PAGE.alpha);
  asked(await stop(t, { rows: bash('b', `grep -c escalation ${page}`), message: cite(PAGE.alpha) }), PAGE.alpha);
  asked(await stop(t, { rows: bash('b', `grep -rn escalation ${i.folder(PAGE.alpha)}`), message: cite(PAGE.alpha) }), PAGE.alpha);
  asked(await stop(t, { rows: bash('b', `wc -l ${page}`), message: cite(PAGE.alpha) }), PAGE.alpha);
  asked(await stop(t, { rows: bash('b', `python3 -c "print(open('${page}').read())"`), message: cite(PAGE.alpha) }), PAGE.alpha);
  // a cat that shows the page after a heredoc in the same command line still reads it
  silent(await stop(t, { rows: bash('b', `cat > ${join(i.root, 'n.md')} <<'EOF'\nnotes\nEOF\ncat ${page}`), message: cite(PAGE.alpha) }), 'a cat after the heredoc');
});

// ---- the deliverable: a file written in the turn is checked as the answer is -------------------------------------------------------
withInstall('ARC-09-C267 lever 2 — a file written in the turn: its unread citations are asked about, even when the answer cites nothing', async (t, i) => {
  const file = join(i.root, 'clients', 'acme', 'envelopes', 'e1.md');
  const write = (id, content) => [use(id, 'Write', { file_path: file, content }), res(id, 'File created successfully')];
  const doc = `# Envelope\n\nThe escalation matrix (citation: ${PAGE.alpha}) and the SLA page ${PAGE.beta}.\n`;
  const d = await stop(t, { rows: write('w', doc), message: 'Saved the Envelope; the open questions are in Part 4.' });
  asked(d, PAGE.alpha, PAGE.beta);
  silent(await stop(t, { rows: [...readPage('r', i.abs(PAGE.alpha)), ...readPage('r2', i.abs(PAGE.beta)), ...write('w', doc)], message: 'Saved the Envelope.' }), 'both read');
  asked(await stop(t, { rows: [...readPage('r', i.abs(PAGE.alpha)), ...write('w', doc)], message: 'Saved the Envelope.' }), PAGE.beta);
  // Edit, MultiEdit and a heredoc that writes a file
  const edit = [use('e', 'Edit', { file_path: file, old_string: 'x', new_string: `See ${PAGE.gamma} for the rule.` }), res('e', 'edited')];
  asked(await stop(t, { rows: edit, message: 'Updated the file.' }), PAGE.gamma);
  const multi = [use('e', 'MultiEdit', { file_path: file, edits: [{ old_string: 'a', new_string: 'b' }, { old_string: 'c', new_string: `The rule: ${PAGE.delta}.` }] }), res('e', 'edited')];
  asked(await stop(t, { rows: multi, message: 'Updated the file.' }), PAGE.delta);
  asked(await stop(t, { rows: bash('b', `cat > ${file} <<'EOF'\nThe rule is in (citation: ${PAGE.alpha}).\nEOF`), message: 'Saved.' }), PAGE.alpha);
  // a heredoc that only prints is not a deliverable; a write that failed is not one either
  silent(await stop(t, { rows: bash('b', `cat <<'EOF'\nThe rule is in (citation: ${PAGE.alpha}).\nEOF`), message: 'Printed.' }), 'a heredoc to the screen');
  silent(await stop(t, { rows: [use('w', 'Write', { file_path: file, content: doc }), res('w', 'Permission denied', { is_error: true })], message: 'Could not save.' }), 'a failed write');
  // the skip rules apply to the file's lines as to the answer's
  const skipped = `See also ${PAGE.alpha}.\nThe page ${PAGE.beta} (not opened) may say more.\n`;
  silent(await stop(t, { rows: write('w', skipped), message: 'Saved.' }), 'a pointer and a declared-unread page in the file');
  // a path the corpus does not hold: in the answer it is C254's and this check leaves it; in a file it is asked about like any other, and
  // opening it tells the model that the path is wrong
  const gone = 'markdown/it-service-management/c_Gone.md';
  silent(await stop(t, { rows: [], message: `The rule (citation: ${gone}).` }), 'a dead path in the answer');
  asked(await stop(t, { rows: write('w', `The rule (citation: ${gone}).\n`), message: 'Saved.' }), gone);
  // a fenced block in the file is not read for citations, as in the answer
  silent(await stop(t, { rows: write('w', `Example:\n\`\`\`\n${PAGE.alpha}\n\`\`\`\n`), message: 'Saved.' }), 'a fenced block in the file');
});

// ---- what is not a claim -----------------------------------------------------------------------------------------------------------
withInstall('ARC-09-C267 lever 2 — a pointer sentence, a path the user typed and a page the answer says it did not open are not claims', async (t, i) => {
  for (const sentence of [`Read ${PAGE.alpha} first.`, `Start with ${PAGE.alpha}, then the others.`, `See also ${PAGE.alpha}.`, `For the SLA part, read ${PAGE.alpha} and ${PAGE.beta} first.`,
    `(see also: ${PAGE.alpha}; ${PAGE.beta})`, `start with \`${PAGE.alpha}\``]) {
    silent(await stop(t, { rows: [], message: sentence }), sentence);
  }
  // a plain citation of the same page is a claim, even beside a pointer; a pointer's sentence ends at its full stop
  asked(await stop(t, { rows: [], message: `See also ${PAGE.beta}. The matrix is in ${PAGE.alpha}.` }), PAGE.alpha);
  assert.doesNotMatch((await stop(t, { rows: [], message: `See also ${PAGE.beta}. The matrix is in ${PAGE.alpha}.` })).reason, new RegExp(PAGE.beta.replaceAll('.', '\\.')));
  asked(await stop(t, { rows: [], message: `The matrix is in ${PAGE.alpha}; see also ${PAGE.beta}.` }), PAGE.alpha);
  // a path the user typed
  silent(await stop(t, { rows: [], prompt: `Explain ${PAGE.alpha} to me`, message: cite(PAGE.alpha) }), 'typed by the user');
  silent(await stop(t, { rows: [], prompt: `explain ${PAGE.alpha.replaceAll('/', '\\')}`, message: cite(PAGE.alpha) }), 'typed with back-slashes');
  asked(await stop(t, { rows: [], prompt: `Explain ${PAGE.alpha}`, message: cite(PAGE.beta) }), PAGE.beta);
  // a page the answer says it did not open
  silent(await stop(t, { rows: [], message: `(citations: ${PAGE.alpha} — found by search, not opened; ${PAGE.beta}, not read)` }), 'declared unread');
  asked(await stop(t, { rows: [], message: `${PAGE.alpha} (not read). The rule is in ${PAGE.alpha}.` }), PAGE.alpha);
});

// ---- one ask a turn, and what stays open ----------------------------------------------------------------------------------------------
withInstall('ARC-09-C267 lever 2 — one ask a turn: two pages, one block; the continuation never blocks, and says to the user only what stayed open', async (t, i) => {
  const message = `${cite(PAGE.alpha)} ${cite(PAGE.beta)}`;
  const d = await stop(t, { rows: [], message });
  assert.equal(d.decision, 'block');
  assert.equal(d.reason.match(/Cited pages that nothing in this session showed/g).length, 1, 'one clause for both pages');
  // The continuation after our block: our feedback row, then what the model did.
  const feedback = U(`Stop hook feedback:\n${d.reason}`, { isMeta: true });
  const ignored = await stop(t, { rows: [A([{ type: 'text', text: message }]), feedback, A([{ type: 'text', text: 'Understood.' }])], message: `Understood. ${cite(PAGE.alpha)}`, input: { stop_hook_active: true } });
  assert.deepEqual(Object.keys(ignored), ['systemMessage'], 'a notice to the user, never a decision');
  assert.match(ignored.systemMessage, /^Grounding check: \d+ item\(s\) in this answer were not corrected after one request — .*a page cited but not read/);
  const reads = [...readPage('r1', i.abs(PAGE.alpha)), ...readPage('r2', i.abs(PAGE.beta))];
  const met = await stop(t, { rows: [A([{ type: 'text', text: message }]), feedback, ...reads, A([{ type: 'text', text: 'Correction: both pages say what I cited.' }])], message: 'Correction: both pages say what I cited.', input: { stop_hook_active: true } });
  silent(met, 'both pages Read after the ask');
  // a citation marked as a pointer on its Correction line is closed too
  const pointer = await stop(t, { rows: [A([{ type: 'text', text: message }]), feedback, A([{ type: 'text', text: `Correction: ${PAGE.alpha} is a pointer, not a claim.\nCorrection: ${PAGE.beta} is a pointer too.` }])],
    message: `Correction: ${PAGE.alpha} is a pointer, not a claim.\nCorrection: ${PAGE.beta} is a pointer too.`, input: { stop_hook_active: true } });
  silent(pointer, 'marked as pointers');
  // a page read before a compaction is a page read: the first ask left it out, and the continuation does not report it as open
  const early = [...readPage('r0', i.abs(PAGE.alpha)), ...compaction()];
  const first = await stop(t, { rows: [...early, A([{ type: 'text', text: message }])], message });
  asked(first, PAGE.beta);
  assert.doesNotMatch(first.reason, new RegExp(PAGE.alpha.replaceAll('.', '\\.')), 'the page read before the compaction is not in the ask');
  const feedback2 = U(`Stop hook feedback:\n${first.reason}`, { isMeta: true });
  const still = await stop(t, { rows: [...early, A([{ type: 'text', text: message }]), feedback2, A([{ type: 'text', text: 'Understood.' }])], message: 'Understood.', input: { stop_hook_active: true } });
  assert.match(still.systemMessage, new RegExp(PAGE.beta.replaceAll('.', '\\.')), 'the page nobody read stays open');
  assert.doesNotMatch(still.systemMessage, new RegExp(PAGE.alpha.replaceAll('.', '\\.')), 'and the one read before the compaction is not reported');
});

// ---- the classes file --------------------------------------------------------------------------------------------------------------
test('ARC-09-C267 lever 2 — a classes file that is missing or corrupt switches the grounding asks off; a known class turns itself on', () => {
  for (const text of [undefined, null, '', '   ', 'not json', '[]', '"a string"', '42', '{', '{"blocking": "citedUnread"}', '{"blocking": 7}', '{"ubiquityPages": 500}']) {
    assert.deepEqual(parseClasses(text).blocking, [], JSON.stringify(text));
  }
  assert.deepEqual(parseClasses('{"blocking": ["citedUnread"]}').blocking, ['citedUnread']);
  assert.deepEqual(parseClasses('{"blocking": ["citedUnread", "nothing", 3]}').blocking, ['citedUnread'], 'an unknown class is dropped');
  assert.deepEqual(parseClasses('{"blocking": []}').blocking, [], 'an empty list is valid: nothing blocks');
  assert.equal(parseClasses(undefined).source, 'default');
});

withInstall('ARC-09-C267 lever 2 — the hook reads its classes file as data: none, a corrupt one or an empty list asks nothing; the class named asks', async (t, i) => {
  const message = cite(PAGE.alpha);
  const run = (classesText) => stop(t, { rows: [], message, shipped: true, seams: { classesText } });
  silent(await run(undefined), 'no file');
  silent(await run(null), 'a missing file');
  silent(await run('{ not json'), 'a corrupt file');
  silent(await run('{"blocking": []}'), 'an empty list');
  asked(await run('{"blocking": ["citedUnread"]}'), PAGE.alpha);
});

withInstall('ARC-09-C267 lever 2 — as shipped: the data file names citedUnread, and a cited page that nothing read is asked about', async (t, i) => {
  const { readFileSync } = await import('node:fs');
  const data = JSON.parse(readFileSync(new URL('../../tools/snowarch/lib/docs/grounding-classes.json', import.meta.url), 'utf8'));
  assert.deepEqual(data.blocking, ['citedUnread']);
  asked(await stop(t, { rows: [], message: cite(PAGE.alpha), shipped: true }), PAGE.alpha);
  silent(await stop(t, { rows: bash('b', `cat ${i.abs(PAGE.alpha)}`), message: cite(PAGE.alpha), shipped: true }), 'read by cat');
  silent(await stop(t, { rows: [], message: 'Sure, here is the plan in plain words.', shipped: true }), 'nothing cited');
});
