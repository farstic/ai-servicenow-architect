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
import { join } from 'node:path';
import { KEEP_OUT, LEAD, parseClasses } from '../../tools/snowarch/lib/docs/grounding-check.mjs';
import { A, CTX_BATCH, CTX_FILE, PAGE, U, asked, bash, cite, compaction, powershell, readPage, res, silent, stop, use, withInstall } from '../helpers/lever2.mjs';

// ---- the read routes: a page that reached the session is not asked about ---------------------------------------------------------
withInstall('ARC-09-C267 lever 2 — nothing read: the cited page is asked about, once, with the words of the ask', async (t, i) => {
  const d = await stop(t, { rows: [], message: `${cite(PAGE.alpha)} And ${PAGE.beta} says the rest.` });
  asked(d, PAGE.alpha, PAGE.beta);
  assert.ok(d.reason.startsWith(LEAD));
  assert.ok(d.reason.endsWith(KEEP_OUT));
  assert.ok(d.reason.includes('You cited pages that this session never opened: ' + `${PAGE.alpha}, ${PAGE.beta}. Open each one now. Where a page contradicts your answer, correct the answer. Where a citation only tells the reader where to look, mark it as a pointer on its Correction line.`), d.reason);
  assert.doesNotMatch(d.reason, /Cited pages that nothing in this session showed/, 'the earlier words are gone');
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

withInstall('ARC-09-C267 lever 2 — what is not a read: a heredoc that writes a file, a failed command that is no viewer, another page, a listing, a grep that lists names, a directory, a variable in a command that cannot show a page', async (t, i) => {
  const page = i.abs(PAGE.alpha);
  const heredoc = `cat > ${join(i.root, 'notes.md')} <<'EOF'\ncat ${page}\nSee ${PAGE.alpha} and read ${page}\nEOF`;
  asked(await stop(t, { rows: bash('b', heredoc), message: cite(PAGE.alpha) }), PAGE.alpha);
  asked(await stop(t, { rows: bash('b', `cat ${i.abs(PAGE.beta)}`), message: cite(PAGE.alpha) }), PAGE.alpha);
  asked(await stop(t, { rows: bash('b', `ls ${i.folder(PAGE.alpha)}`), message: cite(PAGE.alpha) }), PAGE.alpha);
  asked(await stop(t, { rows: bash('b', `grep -l escalation ${page}`), message: cite(PAGE.alpha) }), PAGE.alpha);
  asked(await stop(t, { rows: bash('b', `grep -c escalation ${page}`), message: cite(PAGE.alpha) }), PAGE.alpha);
  asked(await stop(t, { rows: bash('b', `grep -rn escalation ${i.folder(PAGE.alpha)}`), message: cite(PAGE.alpha) }), PAGE.alpha);
  asked(await stop(t, { rows: bash('b', `wc -l ${page}`), message: cite(PAGE.alpha) }), PAGE.alpha);
  asked(await stop(t, { rows: bash('b', `ls ${page}`, { error: true }), message: cite(PAGE.alpha) }), PAGE.alpha);
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
  assert.equal(d.reason.match(/You cited pages that this session never opened/g).length, 1, 'one clause for both pages');
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
  const still = await stop(t, { rows: [...early, A([{ type: 'text', text: message }]), feedback2, A([{ type: 'text', text: message }])], message, input: { stop_hook_active: true } });
  assert.match(still.systemMessage, new RegExp(PAGE.beta.replaceAll('.', '\\.')), 'the page nobody read stays open');
  assert.doesNotMatch(still.systemMessage, new RegExp(PAGE.alpha.replaceAll('.', '\\.')), 'and the one read before the compaction is not reported');
});

// ---- what cannot be resolved: the architect's ruling of 2026-11-16, because the pre-registration has a guard of 0 false "unread" claims ----------
withInstall('ARC-09-C267 lever 2 — a glob or a brace list in a viewer command is expanded against the file system, from the folder the shell is in', async (t, i) => {
  const folder = i.folder(PAGE.alpha);                 // holds c_Alpha.md and c_Beta.md, and no other file
  const both = `${cite(PAGE.alpha)} ${cite(PAGE.beta)}`;
  silent(await stop(t, { rows: bash('b', `cat ${folder}/*.md`), message: both }), 'cat dir/*.md');
  silent(await stop(t, { rows: bash('b', `cd ${folder} && cat c_*.md`), message: both }), 'a pattern after a cd');
  silent(await stop(t, { rows: bash('b', `cd ${i.corpus} && head -5 markdown/it-service-management/*.md`), message: both }), 'relative to the corpus folder');
  silent(await stop(t, { rows: [...bash('b1', `cd ${folder}`), ...bash('b2', 'cat c_?lpha.md c_B[a-z]*.md')], message: both }), 'a cd in the call before, ? and a class');
  silent(await stop(t, { rows: bash('b', `cd ${folder} && sed -n 1,40p {c_Alpha,c_Beta}.md`), message: both }), 'sed -n 1,40p {a,b}.md');
  silent(await stop(t, { rows: bash('b', `sed -n 1,40p ${folder}/c_{Alpha,Beta}.md`), message: both }), 'a brace list in an absolute path');
  silent(await stop(t, { rows: bash('b', `cat ${i.corpus}/markdown/**/c_Alpha.md`), message: cite(PAGE.alpha) }), '**');
  silent(await stop(t, { rows: bash('b', `grep -n table ${folder}/*.md`), message: both }), 'a search over a pattern');
  silent(await stop(t, { rows: bash('b', `ls ${folder} && cat ${folder}/c_[AB]*.md | head -5`), message: both }), 'a pattern after a listing, at the head of a pipe');
  // only the pages the pattern expands to
  asked(await stop(t, { rows: bash('b', `cat ${folder}/c_B*.md`), message: both }), PAGE.alpha);
  asked(await stop(t, { rows: bash('b', `cat ${folder}/*.md`), message: cite(PAGE.gamma) }), PAGE.gamma);
  asked(await stop(t, { rows: bash('b', 'cat /tmp/*.md'), message: cite(PAGE.alpha) }), PAGE.alpha);
  asked(await stop(t, { rows: bash('b', `grep -l table ${folder}/*.md`), message: both }), PAGE.alpha);
  silent(await stop(t, { rows: bash('b', `cat ${folder}/*.md`, { error: true }), message: cite(PAGE.alpha) }), 'a pattern in a call that failed: the pages are on disk, and the call is a viewer');
  // PowerShell takes the same patterns, with back-slashes and any case
  const win = folder.replaceAll('/', '\\');
  silent(await stop(t, { rows: powershell('p', `Get-Content "${win}\\*.md" -TotalCount 40`), message: both }), 'Get-Content over a pattern');
  silent(await stop(t, { rows: powershell('p', `Select-String -Path "${win}\\C_A*.MD" -Pattern table`), message: cite(PAGE.alpha) }), 'Select-String, another case');
});

withInstall('ARC-09-C267 lever 2 — what cannot be resolved counts every page whose path or bare file name is in the call: a variable, a loop, xargs, a substitution, another language', async (t, i) => {
  const folder = i.folder(PAGE.alpha);
  const page = i.abs(PAGE.alpha);
  const CTX_EXEC = ['mcp', 'context-mode', 'ctx_execute'].join('__');
  // [the call, whether it has a viewer verb]: a call that failed counts when it has one, since it may have printed part of what it was asked for
  for (const [command, viewer] of [
    ['for f in c_Alpha.md c_Beta.md; do head -20 "$f"; done', true],
    ['find . -name c_Alpha.md | xargs cat', true],
    [`find ${folder} -name c_Alpha.md -exec cat {} \;`, true],
    [`cat $(find ${folder} -name c_Alpha.md)`, true],
    [`F=${page}; cat "$F"`, true],
    [`python3 -c "print(open('${page}').read())"`, false],
    [`node -e "console.log(require('fs').readFileSync('${page}','utf8'))"`, false],
    [`bash -c "cat ${page}"`, true],
    [`git -C ${i.corpus} show HEAD:markdown/it-service-management/c_Alpha.md`, false],
    [`python3 - <<'PY'\nprint(open('${page}').read())\nPY`, false],
    [`cd "$CORPUS/markdown/it-service-management" && sed -n 1,60p c_Alpha.md`, true],
  ]) {
    silent(await stop(t, { rows: bash('b', command), message: cite(PAGE.alpha) }), command);
    asked(await stop(t, { rows: bash('b', command), message: cite(PAGE.gamma) }), PAGE.gamma);
    const failed = await stop(t, { rows: bash('b', command, { error: true }), message: cite(PAGE.alpha) });
    if (viewer) silent(failed, `${command}, failed: a viewer call that failed may have printed part of it`); else asked(failed, PAGE.alpha);
  }
  silent(await stop(t, { rows: bash('b', 'for f in c_Alpha.md c_Beta.md; do head -20 "$f"; done'), message: `${cite(PAGE.alpha)} ${cite(PAGE.beta)}` }), 'both named in the loop');
  // the name is a whole name and the call is a command that could show a page
  for (const command of ['ls $DIR/c_Alpha.md', 'echo $HOME c_Alpha.md', 'cp c_Alpha.md $DEST', 'find . -name c_Alpha.md', 'git status c_Alpha.md', `python3 -c "open('xc_Alpha.md')"`, `python3 -c "open('c_Alpha.md.bak')"`,
    "cat > notes.md <<'EOF'\nsee c_Alpha.md\nEOF\npython3 -c 'print(1)'"]) {
    asked(await stop(t, { rows: bash('b', command), message: cite(PAGE.alpha) }), PAGE.alpha);
  }
  // another language through an MCP code tool, a batch with xargs, a sub-agent's call, and PowerShell
  const code = (language, source) => [use('e', CTX_EXEC, { language, code: source }), res('e', [{ type: 'text', text: 'a summary' }])];
  silent(await stop(t, { rows: code('python', `print(open('${page}').read())`), message: cite(PAGE.alpha) }), 'python code in an MCP tool');
  silent(await stop(t, { rows: code('javascript', `require('fs').readFileSync('c_Alpha.md')`), message: cite(PAGE.alpha) }), 'javascript code in an MCP tool');
  asked(await stop(t, { rows: code('python', 'print(1)'), message: cite(PAGE.alpha) }), PAGE.alpha);
  const batch = [use('c', CTX_BATCH, { commands: [{ label: 'x', command: 'find . -name c_Alpha.md | xargs cat' }], queries: ['q'] }), res('c', [{ type: 'text', text: 'a section' }])];
  silent(await stop(t, { rows: batch, message: cite(PAGE.alpha) }), 'a batch command with xargs');
  const agent = [use('a1', 'Agent', { subagent_type: 'general-purpose', prompt: 'read it' }), res('a1', 'It says X.')];
  silent(await stop(t, { rows: agent, side: { a1: bash('s', 'find . -name c_Alpha.md | xargs cat') }, message: cite(PAGE.alpha) }), 'a sub-agent\'s xargs');
  asked(await stop(t, { rows: agent, side: { a1: bash('s', 'find . -name c_Alpha.md') }, message: cite(PAGE.alpha) }), PAGE.alpha);
  for (const command of [`Get-ChildItem ${folder} -Filter c_Alpha.md | Get-Content`, "foreach ($f in 'c_Alpha.md') { Get-Content $f }", `$p = '${page}'; Get-Content $p`, `python -c "open('${page}')"`]) {
    silent(await stop(t, { rows: powershell('p', command), message: cite(PAGE.alpha) }), command);
  }
  asked(await stop(t, { rows: powershell('p', 'Get-ChildItem c_Alpha.md'), message: cite(PAGE.alpha) }), PAGE.alpha);
  // a folder the call cannot tell, over two calls: the second call's relative name is the first's lost folder
  silent(await stop(t, { rows: [...bash('b1', 'cd "$CORPUS/markdown/it-service-management"'), ...bash('b2', 'sed -n 1,60p c_Alpha.md')], message: cite(PAGE.alpha) }), 'a lost folder carries');
  asked(await stop(t, { rows: [...bash('b1', 'cd "$CORPUS/markdown/it-service-management"'), ...bash('b2', 'sed -n 1,60p c_Alpha.md')], message: cite(PAGE.beta) }), PAGE.beta);
  asked(await stop(t, { rows: [...bash('b1', 'cd "$CORPUS/markdown/it-service-management"'), ...bash('b2', `cd ${folder}`), ...bash('b3', 'sed -n 1,60p c_Beta.md')], message: cite(PAGE.alpha) }), PAGE.alpha);
});

// ---- what stays open after the ask: the first answer's citations and the continuation's (the architect's ruling a of 2026-11-16) ----------------
withInstall('ARC-09-C267 lever 2 — the notice keeps the first answer\'s citations as a second input: a read, or a Correction line that names a page as a pointer or withdrawn, closes one; silence does not', async (t, i) => {
  const message = `${cite(PAGE.alpha)} ${cite(PAGE.beta)}`;
  const d = await stop(t, { rows: [], message });
  const feedback = U(`Stop hook feedback:\n${d.reason}`, { isMeta: true });
  const after = (text, extra = [], input = {}) => stop(t, { rows: [A([{ type: 'text', text: message }]), feedback, ...extra, A([{ type: 'text', text }])], message: text, input: { stop_hook_active: true, ...input } });
  const re = (page) => new RegExp(page.replaceAll('.', '\\.'));
  const open = (n, pages, why) => {
    assert.ok(n && n.systemMessage, `${why}: no notice`);
    for (const p of [PAGE.alpha, PAGE.beta, PAGE.gamma]) {
      if (pages.includes(p)) assert.match(n.systemMessage, re(p), `${why}: ${p} should be open`); else assert.doesNotMatch(n.systemMessage, re(p), `${why}: ${p} should be closed`);
    }
  };
  // The user still sees the first answer: "Understood." leaves every unread citation of it in the notice.
  open(await after('Understood.'), [PAGE.alpha, PAGE.beta], 'nothing cited, nothing closed');
  // A restated answer that silently drops a citation does not close it.
  open(await after(`Correction: the matrix rests on ${PAGE.beta} alone.`), [PAGE.alpha, PAGE.beta], 'a citation dropped without a word');
  open(await after(message), [PAGE.alpha, PAGE.beta], 'the answer restated');
  // The registered tail says not to write a withdrawn path again: a withdrawal that names no page closes nothing, and the notice says so.
  open(await after('Correction: both citations are withdrawn; the answer rests on the skill text.'), [PAGE.alpha, PAGE.beta], 'a withdrawal that names no page');
  // A line that names the pages and says something else closes nothing either.
  open(await after(`Correction: ${PAGE.alpha} and ${PAGE.beta} say what I cited, I believe.`), [PAGE.alpha, PAGE.beta], 'a claim about unread pages');
  // A Correction line that names a page and says it is a pointer, withdrawn, retracted, removed or dropped closes it.
  for (const word of ['is a pointer', 'withdrawn', 'was withdrawn', 'retracted', 'removed from the answer', 'dropped']) {
    silent(await after(`Correction: ${PAGE.alpha} ${word}.\nCorrection: ${PAGE.beta} ${word}.`), word);
  }
  open(await after(`Correction: ${PAGE.alpha} is a pointer.`), [PAGE.beta], 'one of two named');
  // A page that first appears in the continuation is open until a page is read or a line marks it; the first answer's closed ones stay closed.
  open(await after(`Correction: ${PAGE.alpha} is a pointer.\nCorrection: ${PAGE.beta} withdrawn.\nThe rest is in ${PAGE.gamma}.`), [PAGE.gamma], 'a new citation');
  silent(await after(`Correction: ${PAGE.alpha} is a pointer.\nCorrection: ${PAGE.beta} withdrawn.\nCorrection: ${PAGE.gamma} is a pointer.`), 'a new citation marked a pointer');
  // A page read after the ask is closed.
  open(await after(message, readPage('r1', i.abs(PAGE.alpha))), [PAGE.beta], 'one read after the ask');
  silent(await after('Correction: both pages say what I cited.', [...readPage('r1', i.abs(PAGE.alpha)), ...readPage('r2', i.abs(PAGE.beta))]), 'both read');
  // A file the turn wrote follows the same rule: its citations are the first answer's.
  const file = join(i.root, 'clients', 'acme', 'envelopes', 'e2.md');
  const write = (id, content) => [use(id, 'Write', { file_path: file, content }), res(id, 'ok')];
  const original = `The matrix (citation: ${PAGE.alpha}) and ${PAGE.beta}.\n`;
  const saved = await stop(t, { rows: write('w', original), message: 'Saved.' });
  asked(saved, PAGE.alpha, PAGE.beta);
  const fb = U(`Stop hook feedback:\n${saved.reason}`, { isMeta: true });
  const next = async (content, text, extra = []) => stop(t, { rows: [...write('w', original), A([{ type: 'text', text: 'Saved.' }]), fb, ...(content === null ? [] : write('w2', content)), ...extra, A([{ type: 'text', text }])], message: text, input: { stop_hook_active: true } });
  open(await next(null, 'Understood.'), [PAGE.alpha, PAGE.beta], 'the file left alone');
  open(await next('The matrix, with no citation.\n', 'Correction: the citations are removed from the file.'), [PAGE.alpha, PAGE.beta], 'the file rewritten, no page named');
  open(await next(`The matrix (citation: ${PAGE.alpha}).\n`, 'Saved again.'), [PAGE.alpha, PAGE.beta], 'the file rewritten with one citation');
  silent(await next('The matrix, with no citation.\n', `Correction: ${PAGE.alpha} removed from the file.\nCorrection: ${PAGE.beta} removed from the file.`), 'the file rewritten and the removal said');
  open(await next(null, 'Correction: read.', readPage('r', i.abs(PAGE.beta))), [PAGE.alpha], 'one page of the file read');
});

// ---- a failed viewer call may have printed part of what it was asked for (ruling d) ----------------------------------------------------------
withInstall('ARC-09-C267 lever 2 — a failed viewer call shows the pages it names that are on disk; a failed call that is no viewer shows nothing', async (t, i) => {
  const folder = i.folder(PAGE.alpha);
  const page = i.abs(PAGE.alpha);
  const gone = `${folder}/missing.md`;
  // cat a.md missing.md: the shell prints a.md and says the other is not there, and the call fails
  silent(await stop(t, { rows: bash('b', `cat ${page} ${gone}`, { error: true }), message: cite(PAGE.alpha) }), 'cat a.md missing.md clears a.md');
  asked(await stop(t, { rows: bash('b', `cat ${page} ${gone}`, { error: true }), message: cite(PAGE.beta) }), PAGE.beta);
  // the same for the other viewers, a folder set in the call, a pattern, a search, PowerShell, a loop
  for (const [command, pages] of [
    [`sed -n 1,40p ${page}; false`, [PAGE.alpha]],
    [`cd ${folder} && head -5 c_Alpha.md && exit 3`, [PAGE.alpha]],
    [`cat ${folder}/*.md; false`, [PAGE.alpha, PAGE.beta]],
    [`cat ${folder}/c_{Alpha,Beta}.md ${gone}`, [PAGE.alpha, PAGE.beta]],
    [`grep -n table ${page}; false`, [PAGE.alpha]],
    [`for f in c_Alpha.md c_Beta.md; do head -3 "$f"; done; false`, [PAGE.alpha, PAGE.beta]],
  ]) {
    silent(await stop(t, { rows: bash('b', command, { error: true }), message: pages.map(cite).join(' ') }), command);
    asked(await stop(t, { rows: bash('b', command, { error: true }), message: cite(PAGE.gamma) }), PAGE.gamma);
  }
  silent(await stop(t, { rows: powershell('p', `Get-Content "${page.replaceAll('/', '\\')}" -TotalCount 5; exit 1`, {}, { error: true }), message: cite(PAGE.alpha) }), 'a failed PowerShell Get-Content');
  // a call that is no viewer shows nothing, failed or not for what it printed
  asked(await stop(t, { rows: bash('b', `python3 -c "open('${page}')"`, { error: true }), message: cite(PAGE.alpha) }), PAGE.alpha);
  asked(await stop(t, { rows: bash('b', `ls ${page}`, { error: true }), message: cite(PAGE.alpha) }), PAGE.alpha);
  asked(await stop(t, { rows: bash('b', `cp ${page} /tmp/x`, { error: true }), message: cite(PAGE.alpha) }), PAGE.alpha);
  // a sub-agent's failed viewer call, too
  const agent = [use('a1', 'Agent', { subagent_type: 'general-purpose', prompt: 'read it' }), res('a1', 'It says X.')];
  silent(await stop(t, { rows: agent, side: { a1: bash('s', `cat ${page} ${gone}`, { error: true }) }, message: cite(PAGE.alpha) }), 'a sub-agent\'s cat a.md missing.md');
});

// ---- an unresolved call with a viewer shows the pages its output names (ruling e) ---------------------------------------------------------------
withInstall('ARC-09-C267 lever 2 — an unresolved call that has a viewer verb shows the pages named in its output; one that has none does not', async (t, i) => {
  const folder = i.folder(PAGE.alpha);
  const page = i.abs(PAGE.alpha);
  const out = (id, command, text, { error = false } = {}) => [use(id, 'Bash', { command, description: 'x' }), res(id, text, { is_error: error })];
  const both = `${cite(PAGE.alpha)} ${cite(PAGE.beta)}`;
  const listing = '== c_Alpha.md\n1\tThe sn_example table.\n== c_Beta.md\n1\tThe sn_example table.\n';
  const loop = `for f in $(ls ${folder}); do echo "== $f"; head -3 ${folder}/$f; done`;
  silent(await stop(t, { rows: out('b', loop, listing), message: both }), 'the loop over $(ls dir) with head names both in its output');
  asked(await stop(t, { rows: out('b', loop, listing), message: cite(PAGE.gamma) }), PAGE.gamma);
  asked(await stop(t, { rows: out('b', loop, '== xc_Alpha.md\n== c_Alpha.md.bak\n'), message: cite(PAGE.alpha) }), PAGE.alpha);
  // head over several files prints a header for each
  silent(await stop(t, { rows: out('b', `ls ${folder} | sed 's|^|${folder}/|' | xargs head -2`, `==> ${page} <==\n1\tx\n\n==> ${i.abs(PAGE.beta)} <==\n1\tx\n`), message: both }), 'xargs head: the headers name the pages');
  silent(await stop(t, { rows: out('b', `find ${folder} -name '*.md' -exec head -1 {} +`, `==> ${page} <==\n1\tx\n`), message: cite(PAGE.alpha) }), 'find -exec head');
  silent(await stop(t, { rows: out('b', loop, listing, { error: true }), message: both }), 'a failed loop: its output counts as well');
  // no viewer verb: what an interpreter or a listing printed shows no page
  asked(await stop(t, { rows: out('b', `python3 -c "import os; print(os.listdir('${folder}'))"`, "['c_Alpha.md', 'c_Beta.md']"), message: cite(PAGE.alpha) }), PAGE.alpha);
  asked(await stop(t, { rows: out('b', `for f in $(ls ${folder}); do echo "$f"; done`, 'c_Alpha.md\nc_Beta.md\n'), message: cite(PAGE.alpha) }), PAGE.alpha);
  asked(await stop(t, { rows: out('b', `ls ${folder} | xargs echo`, 'c_Alpha.md c_Beta.md'), message: cite(PAGE.alpha) }), PAGE.alpha);
  // a sub-agent's call
  const agent = [use('a1', 'Agent', { subagent_type: 'general-purpose', prompt: 'read them' }), res('a1', 'It says X.')];
  silent(await stop(t, { rows: agent, side: { a1: out('s', loop, listing) }, message: both }), 'a sub-agent\'s loop');
});

// ---- C254 does not read the classes file --------------------------------------------------------------------------------------------------
withInstall('ARC-09-C267 lever 2 — with no classes file at all, C254\'s dead-path line in the answer still works, and the grounding asks stay off', async (t, i) => {
  const dead = 'markdown/it-service-management/wrong-folder/c_Alpha.md';   // the one page of that name is in the cited area: C254 knows where it is
  const message = `The rule is in (citation: ${dead}).`;
  for (const classesText of [undefined, null, 'not json', '{"blocking": []}']) {
    const d = await stop(t, { rows: [], message, shipped: true, seams: { classesText } });
    assert.equal(d?.decision, 'block', `a dead path with the classes file ${JSON.stringify(classesText)}`);
    assert.ok(d.reason.includes(`${dead} -> ${PAGE.alpha}`), d.reason);
    assert.ok(d.reason.endsWith(KEEP_OUT));
    assert.doesNotMatch(d.reason, /you cited pages that this session never opened/i, 'and only C254 speaks');
  }
  // beside a page that nothing read: C254's line alone without the file, both with it, C254 first
  const both = `${message} And ${cite(PAGE.beta)}`;
  const none = await stop(t, { rows: [], message: both, shipped: true, seams: { classesText: undefined } });
  assert.doesNotMatch(none.reason, /never opened/);
  assert.ok(none.reason.includes(`${dead} -> ${PAGE.alpha}`));
  const shipped = await stop(t, { rows: [], message: both, shipped: true });
  assert.ok(shipped.reason.indexOf(`${dead} -> ${PAGE.alpha}`) >= 0 && shipped.reason.indexOf('You cited pages that this session never opened') > shipped.reason.indexOf(dead), 'C254 first, then the grounding ask');
  assert.ok(shipped.reason.includes(PAGE.beta));
  assert.ok(!shipped.reason.includes(`never opened: ${dead}`) && !/never opened: .*wrong-folder/.test(shipped.reason), 'the dead path is C254\'s, not asked about twice');
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
