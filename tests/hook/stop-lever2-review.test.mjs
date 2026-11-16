// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C267, lever 2 — the review of #600 (the architect's findings A1 to D), through the Stop hook itself, on a fixture transcript for each case.
 *
 * The pre-registered guard is 0 false "unread" claims: telling the model it did not open a page it did read is the failure that costs. Each case here
 * is a way the first build did it, or a way the notice told the user a page was not corrected when the ask had never named it:
 *   A1  a glob or a brace list the call holds OUTSIDE a viewer's arguments (a loop, `find -name | xargs`, a folder lost by `cd ~`, a spent glob budget);
 *   A2  a sub-agent's folder is reset before every Bash call (so is the main thread's when Claude Code is told to);
 *   A3  an input that was cut short (sub-agent files past a cap, a lost line of the session file) asks nothing;
 *   A4  the glob budget is one for each pattern, and a pattern that spent it falls back to A1's match;
 *   B1  the notice closes a page by the rules the ask used;   B2  it never lists a dead path or an item the ask did not name;
 *   C   the session file is read once and a run past its deadline asks nothing and says why;   D  a bare `c_Name.md` is a citation.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { makeGlob } from '../../tools/snowarch/lib/docs/glob-fs.mjs';
import * as hook from '../../tools/snowarch/hooks/stop-citations.mjs';
import { A, PAGE, U, asked, bash, cite, powershell, readPage, res, silent, stop, use, withInstall } from '../helpers/lever2.mjs';

const agentCall = [use('a1', 'Agent', { subagent_type: 'general-purpose', prompt: 'read it' }), res('a1', 'It says X.')];
const text = (t) => A([{ type: 'text', text: t }]);
const re = (page) => new RegExp(page.replaceAll('.', '\\.'));
/** Writes one more corpus page into the install (a second page of a file name, or a page of a name with many). */
const addPage = (i, rel) => { mkdirSync(dirname(join(i.corpus, rel)), { recursive: true }); writeFileSync(join(i.corpus, rel), 'The sn\\_example table.\n'); };

// ---- A1: a glob or a brace list outside a viewer's own arguments ---------------------------------------------------------------------------
withInstall('ARC-09-C267 review A1 — a glob or a brace list the call holds outside a viewer\'s arguments names the pages it covers', async (t, i) => {
  const folder = i.folder(PAGE.alpha);                       // c_Alpha.md and c_Beta.md
  // [the call, the pages it shows, a page it does not]
  for (const [command, shows, other] of [
    [`for f in ${folder}/c_Alp*.md; do sed -n 1,60p "$f"; done`, [PAGE.alpha], PAGE.beta],
    [`for f in vendor/ServiceNowDocs/markdown/it-service-management/c_Alp*.md; do sed -n 1,60p "$f"; done`, [PAGE.alpha], PAGE.beta],
    [`cd ${folder} && for f in c_Alp*.md; do head -40 "$f"; done`, [PAGE.alpha], PAGE.beta],
    [`cd ${folder} && for f in *.md; do head -3 "$f"; done`, [PAGE.alpha, PAGE.beta], PAGE.gamma],
    [`for f in ${folder}/c_{Alpha,Beta}.md; do head -3 "$f"; done`, [PAGE.alpha, PAGE.beta], PAGE.gamma],
    [`find ${folder} -name 'c_Alp*.md' | xargs cat`, [PAGE.alpha], PAGE.beta],
    [`find ${i.corpus}/markdown -path '*/it-service-management/c_B*' -exec cat {} +`, [PAGE.beta], PAGE.alpha],
    [`cd ~/install/vendor/ServiceNowDocs/markdown/it-service-management && cat c_Alp*.md`, [PAGE.alpha], PAGE.beta],
    [`cd "$HOME/install/vendor/ServiceNowDocs/markdown/it-service-management" && sed -n 1,60p c_Alp*.md`, [PAGE.alpha], PAGE.beta],
  ]) {
    silent(await stop(t, { rows: bash('b', command), message: shows.map(cite).join(' ') }), command);
    asked(await stop(t, { rows: bash('b', command), message: cite(other) }), other);
    silent(await stop(t, { rows: agentCall, side: { a1: bash('s', command, { extra: { cwd: i.root } }) }, message: shows.map(cite).join(' ') }), `a sub-agent's ${command}`);
  }
  // a call that failed with a viewer may have printed part of what it was asked for: the pages the pattern covers that are on disk
  const loop = `for f in ${folder}/c_Alp*.md; do sed -n 1,60p "$f"; done`;
  silent(await stop(t, { rows: bash('b', loop, { error: true }), message: cite(PAGE.alpha) }), 'a failed loop over a glob');
  asked(await stop(t, { rows: bash('b', loop, { error: true }), message: cite(PAGE.beta) }), PAGE.beta);
  // where the shell stood is known and is not the corpus: a bare pattern covers nothing there
  asked(await stop(t, { rows: bash('b', 'cd /tmp && for f in *.md; do cat "$f"; done'), message: cite(PAGE.alpha) }), PAGE.alpha);
  asked(await stop(t, { rows: bash('b', 'for f in docs/*.md; do cat "$f"; done'), message: cite(PAGE.alpha) }), PAGE.alpha);
  asked(await stop(t, { rows: bash('b', `for f in ${folder}/c_Alp*.txt; do cat "$f"; done`), message: cite(PAGE.alpha) }), PAGE.alpha);
});

// ---- A2: a sub-agent's folder is reset before every Bash call ------------------------------------------------------------------------------
withInstall('ARC-09-C267 review A2 — every Bash call of a sub-agent starts where its row says; so does the main thread\'s when Claude Code is told to', async (t, i) => {
  const area = 'vendor/ServiceNowDocs/markdown/customer-service-management';
  const here = { extra: { cwd: i.root } };
  const twice = (a, b, opts = {}) => [...bash('s1', a, opts), ...bash('s2', b, opts)];
  // the reviewer's case: two calls that each `cd` relative to the project folder; the second prints c_Gamma.md
  const calls = [`cd ${area} && ls`, `cd ${area} && sed -n 1,80p c_Gamma.md`];
  silent(await stop(t, { rows: agentCall, side: { a1: twice(...calls, here) }, message: cite(PAGE.gamma) }), 'a sub-agent\'s second cd is not joined to its first');
  asked(await stop(t, { rows: agentCall, side: { a1: twice(...calls, here) }, message: cite(PAGE.alpha) }), PAGE.alpha);
  // a folder set in one call is not the next call's
  const folder = i.folder(PAGE.alpha);
  asked(await stop(t, { rows: agentCall, side: { a1: twice(`cd ${folder}`, 'sed -n 1,60p c_Alpha.md', here) }, message: cite(PAGE.alpha) }), PAGE.alpha);
  silent(await stop(t, { rows: agentCall, side: { a1: bash('s', `cd ${folder} && sed -n 1,60p c_Alpha.md`, here) }, message: cite(PAGE.alpha) }), 'but one call is its own');
  // the main thread: the folder is kept between calls unless the environment says it is not
  const main = twice(...calls);
  const kept = { env: { CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR: '1' } };
  silent(await stop(t, { rows: main, message: cite(PAGE.gamma), seams: kept }), 'the main thread, folder reset after each call');
  silent(await stop(t, { rows: twice(`cd ${folder}`, 'sed -n 1,60p c_Alpha.md'), message: cite(PAGE.alpha), seams: { env: {} } }), 'the main thread keeps the folder (the C268 case)');
  asked(await stop(t, { rows: twice(`cd ${folder}`, 'sed -n 1,60p c_Alpha.md'), message: cite(PAGE.alpha), seams: kept }), PAGE.alpha);
  silent(await stop(t, { rows: twice(`cd ${folder}`, 'sed -n 1,60p c_Alpha.md'), message: cite(PAGE.alpha), seams: { env: { CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR: '0' } } }), 'the variable set to 0 is off');
});

// ---- A3: an input cut short asks nothing ---------------------------------------------------------------------------------------------------
withInstall('ARC-09-C267 review A3 — sub-agent files past a cap, or a lost line of the session file, ask nothing and say why', async (t, i) => {
  const lines = [];
  const seams = { debug: (l) => lines.push(l) };
  // 201 agent files; the one that read the page sorts after the 200th
  const side = {};
  for (let k = 0; k < 200; k += 1) side[`a${String(k).padStart(4, '0')}`] = bash(`x${k}`, 'ls');
  side.f00d = bash('s', `cat ${i.abs(PAGE.alpha)}`);
  silent(await stop(t, { rows: agentCall, side, message: cite(PAGE.alpha), seams }), 'the 201st file is not read: nothing is asked');
  assert.ok(lines.some((l) => /sub-agent/i.test(l) && /200/.test(l)), `a debug line says the files were cut: ${JSON.stringify(lines)}`);
  // 200 files read in all: complete, so a page nobody read is asked about
  delete side.f00d;
  asked(await stop(t, { rows: agentCall, side, message: cite(PAGE.alpha) }), PAGE.alpha);
  // the bytes cap
  lines.length = 0;
  const big = bash('big', 'ls');
  const padded = [...big, ...Array.from({ length: 60 }, (_, k) => res(`pad${k}`, 'x'.repeat(200)))];
  silent(await stop(t, { rows: agentCall, side: { a: padded, b: bash('s', 'ls') }, message: cite(PAGE.alpha), seams: { ...seams, subagentLimits: { maxBytes: 5000 } } }), 'the sub-agent files are over the byte cap');
  assert.ok(lines.some((l) => /sub-agent/i.test(l) && /5000/.test(l)), JSON.stringify(lines));
  // a sub-agent file that is not readable at all
  lines.length = 0;
  silent(await stop(t, { rows: agentCall, side: { a: ['not a row', 7] }, message: cite(PAGE.alpha), seams }), 'a file with nothing in it that parses');
  assert.ok(lines.some((l) => /sub-agent/i.test(l)), JSON.stringify(lines));
  // a line of the session file that does not parse, in the middle of it: what it held is unknown
  lines.length = 0;
  silent(await stop(t, { rows: [...bash('b0', 'ls'), 'a line that is not a row', ...bash('b1', 'ls')], message: cite(PAGE.alpha), seams }), 'a lost line in the middle of the session file');
  assert.ok(lines.some((l) => /line/i.test(l) && /transcript|session/i.test(l)), JSON.stringify(lines));
  // the last line only, which a write in progress tears, is not a loss
  asked(await stop(t, { rows: [...bash('b0', 'ls'), 'a torn last line'], message: cite(PAGE.alpha) }), PAGE.alpha);
});

// ---- A4: a budget for each pattern ---------------------------------------------------------------------------------------------------------
withInstall('ARC-09-C267 review A4 — the glob budget is one for each pattern, and a pattern that spent it falls back to the names in its words', async (t, i) => {
  const rows = [...bash('b1', `cat ${i.folder(PAGE.alpha)}/c_?lpha.md`), ...bash('b2', `cat ${i.folder(PAGE.alpha)}/c_B*.md`), ...bash('b3', `cat ${i.folder(PAGE.gamma)}/c_?amma.md`)];
  const all = [PAGE.alpha, PAGE.beta, PAGE.gamma].map(cite).join(' ');
  // three patterns of one folder read each: a budget of two shared by them is spent at the third
  silent(await stop(t, { rows, message: all, seams: { options: { glob: makeGlob({ maxDirs: 2 }) } } }), 'each pattern has its own budget');
  // a pattern that is over its own budget is the call's words: it covers the pages its name can be
  const spent = { options: { glob: makeGlob({ maxDirs: 0 }) } };
  silent(await stop(t, { rows: bash('b', `cat ${i.folder(PAGE.alpha)}/c_?lpha.md`), message: cite(PAGE.alpha), seams: spent }), 'over its budget, ? covers c_Alpha.md');
  asked(await stop(t, { rows: bash('b', `cat ${i.folder(PAGE.alpha)}/c_?lpha.md`), message: cite(PAGE.beta), seams: spent }), PAGE.beta);
  silent(await stop(t, { rows: bash('b', `cat ${i.corpus}/markdown/**/c_Alpha.md`), message: cite(PAGE.alpha), seams: spent }), '** over its budget');
  silent(await stop(t, { rows: bash('b', `cd ${i.folder(PAGE.alpha)} && cat c_*.md`), message: `${cite(PAGE.alpha)} ${cite(PAGE.beta)}`, seams: spent }), 'a relative pattern over its budget');
  asked(await stop(t, { rows: bash('b', `cd ${i.folder(PAGE.alpha)} && cat c_*.md`), message: cite(PAGE.gamma), seams: spent }), PAGE.gamma);
});

// ---- B1: the notice closes a page by the rules the ask used ---------------------------------------------------------------------------------
withInstall('ARC-09-C267 review B1 — after the ask, a page opened by a loop, a pattern, xargs or a folder set before the answer is closed', async (t, i) => {
  const folder = i.folder(PAGE.alpha);
  const message = `${cite(PAGE.alpha)} ${cite(PAGE.beta)}`;
  const first = async (before = []) => {
    const d = await stop(t, { rows: before, message });
    asked(d, PAGE.alpha, PAGE.beta);
    return U(`Stop hook feedback:\n${d.reason}`, { isMeta: true });
  };
  const after = (before, feedback, extra, line = 'Correction: both pages say what I cited.') =>
    stop(t, { rows: [...before, text(message), feedback, ...extra, text(line)], message: line, input: { stop_hook_active: true } });
  const fb = await first();
  // the model opens both pages as asked, in ways the first check counts
  for (const command of [
    `for f in c_Alpha.md c_Beta.md; do sed -n 1,80p "${folder}/$f"; done`,
    `for f in ${folder}/c_*.md; do head -50 "$f"; done`,
    `ls ${folder} | sed 's|^|${folder}/|' | xargs head -3`,
    `find ${folder} -name '*.md' | xargs cat`,
  ]) {
    silent(await after([], fb, bash('l', command)), command);
  }
  // a page the loop does not name stays open
  const open = await after([], fb, bash('l', 'for f in c_Alpha.md; do sed -n 1,80p "$f"; done'));
  assert.ok(open?.systemMessage && re(PAGE.beta).test(open.systemMessage) && !re(PAGE.alpha).test(open.systemMessage), JSON.stringify(open));
  // a folder set BEFORE the answer, then relative reads after the ask: the rows after it hold no `cd`, and the first check counts the pages
  const cd = bash('c0', `cd ${folder}`);
  const fb2 = await first(cd);
  silent(await after(cd, fb2, [...bash('r1', 'sed -n 1,60p c_Alpha.md'), ...bash('r2', 'sed -n 1,60p c_Beta.md')]), 'relative reads after a cd made before the answer');
});

// ---- B2: the notice never lists a dead path, or an item the ask did not name -----------------------------------------------------------------
withInstall('ARC-09-C267 review B2 — after a C254 line and a grounding ask, the notice lists neither the dead path, nor the path C254 gave, nor one it never named', async (t, i) => {
  const dead = 'markdown/it-service-management/wrong-folder/c_Alpha.md';      // C254 knows the page: it is c_Alpha.md of this area
  const gone = 'markdown/it-service-management/gone/c_Nowhere.md';            // no page of that name: C254 says nothing, and the grounding ask leaves it
  const message = `The rule is in (citation: ${dead}). The SLA part is in (citation: ${PAGE.beta}). The rest is in (citation: ${gone}).`;
  const d = await stop(t, { rows: [], message });
  asked(d, PAGE.beta);
  assert.ok(d.reason.includes(`${dead} -> ${PAGE.alpha}`), d.reason);
  assert.ok(!/never opened: .*(wrong-folder|gone)/.test(d.reason), 'neither dead path is in the grounding ask');
  const feedback = U(`Stop hook feedback:\n${d.reason}`, { isMeta: true });
  const cont = (extra, line) => stop(t, { rows: [text(message), feedback, ...extra, text(line)], message: line, input: { stop_hook_active: true } });
  // the model did what both asks said
  silent(await cont([...readPage('r1', i.abs(PAGE.alpha)), ...readPage('r2', i.abs(PAGE.beta))],
    `Correction: the rule is at ${PAGE.alpha}.\nCorrection: ${PAGE.beta} confirms the SLA part.`), 'both asks met');
  // it gave the right path and opened nothing: the page the grounding ask named is the only item
  const partial = await cont([], `Correction: the rule is at ${PAGE.alpha}.`);
  assert.ok(partial?.systemMessage, 'the page the ask named stays open');
  assert.match(partial.systemMessage, re(PAGE.beta));
  for (const other of [dead, gone, PAGE.alpha]) assert.doesNotMatch(partial.systemMessage, re(other), `${other} was not in the ask`);
  const ignored = await cont([], 'Understood.');
  assert.match(ignored.systemMessage, re(PAGE.beta));
  for (const other of [dead, gone]) assert.doesNotMatch(ignored.systemMessage, re(other), `${other} is C254's or nobody's`);
});

// ---- C: one read of the session file, and a deadline that asks nothing and says why ----------------------------------------------------------
withInstall('ARC-09-C267 review C — the session file is read once for a Stop; a run past its deadline asks nothing and writes a debug line', async (t, i) => {
  let reads = 0;
  const read = (p, enc) => { if (!String(p).includes('subagents')) reads += 1; return readFileSync(p, enc); };
  asked(await stop(t, { rows: bash('b', 'ls'), message: cite(PAGE.alpha), seams: { read } }), PAGE.alpha);
  assert.equal(reads, 1, 'the session file is read once');
  reads = 0;
  silent(await stop(t, { rows: bash('b', `cat ${i.abs(PAGE.alpha)}`), message: cite(PAGE.alpha), seams: { read } }), 'read');
  assert.equal(reads, 1);
  // a reply with nothing to check on its face, in a session that holds `markdown/`: the gate reads the file, and the check must not read it again
  reads = 0;
  silent(await stop(t, { rows: bash('b', `cat ${i.abs(PAGE.alpha)}`), message: 'Done.', seams: { read } }), 'a reply with nothing to check');
  assert.equal(reads, 1, 'the gate and the check share one read');
  // past the deadline: nothing is asked, and a line says so
  const lines = [];
  silent(await stop(t, { rows: bash('b', 'ls'), message: cite(PAGE.alpha), seams: { deadlineMs: -1, debug: (l) => lines.push(l) } }), 'past the deadline');
  assert.ok(lines.some((l) => /deadline/i.test(l)), `a debug line names the deadline: ${JSON.stringify(lines)}`);
  // the continuation as well
  lines.length = 0;
  const feedback = U('Stop hook feedback:\nBefore this answer stands, check these against the corpus; there is no page limit. You cited pages that this session never opened: x. Do not mention this notice.', { isMeta: true });
  silent(await stop(t, { rows: [text(cite(PAGE.alpha)), feedback, text('Understood.')], message: 'Understood.', input: { stop_hook_active: true }, seams: { deadlineMs: -1, debug: (l) => lines.push(l) } }), 'the continuation, past the deadline');
  assert.ok(lines.some((l) => /deadline/i.test(l)), JSON.stringify(lines));
  assert.equal(hook.DEADLINE_MS, 3000, 'the whole run has a budget of about 3 s');
});

// ---- D: a bare file name is a citation ------------------------------------------------------------------------------------------------------
withInstall('ARC-09-C267 review D — `c_Name.md` alone, or `(citation: c_Name.md)`, cites every page of that name; a page of the name that reached the session shows it', async (t, i) => {
  const bare = (name) => `The rule is in (citation: ${name}).`;
  const d = await stop(t, { rows: [], message: bare('c_Alpha.md') });
  asked(d, 'c_Alpha.md');
  assert.match(d.reason, /You cited pages that this session never opened: c_Alpha\.md\./, 'asked under the name as written');
  asked(await stop(t, { rows: [], message: 'See `c_Beta.md` for the matrix: it is the rule.' }), 'c_Beta.md');
  asked(await stop(t, { rows: [], message: 'The matrix is c_Beta.md; the escalation rule is c_Alpha.md.' }), 'c_Beta.md', 'c_Alpha.md');
  // shown by any route
  silent(await stop(t, { rows: readPage('r', i.abs(PAGE.alpha)), message: bare('c_Alpha.md') }), 'Read');
  silent(await stop(t, { rows: bash('b', `cd ${i.folder(PAGE.alpha)} && sed -n 1,60p c_Alpha.md`), message: bare('c_Alpha.md') }), 'sed');
  silent(await stop(t, { rows: bash('b', 'for f in c_Alpha.md; do head -3 "$f"; done'), message: bare('c_Alpha.md') }), 'a loop that names it');
  silent(await stop(t, { rows: agentCall, side: { a1: bash('s', `cat ${i.abs(PAGE.alpha)}`) }, message: bare('c_Alpha.md') }), 'a sub-agent');
  asked(await stop(t, { rows: readPage('r', i.abs(PAGE.beta)), message: bare('c_Alpha.md') }), 'c_Alpha.md');
  // the same name in two areas: a page of the name that reached the session shows it
  addPage(i, 'markdown/hr-service-delivery/c_Alpha.md');
  silent(await stop(t, { rows: readPage('r', i.abs('markdown/hr-service-delivery/c_Alpha.md')), message: bare('c_Alpha.md') }), 'the other page of that name');
  asked(await stop(t, { rows: [], message: bare('c_Alpha.md') }), 'c_Alpha.md');
  // not citations: what the answer says it did not open, a pointer, a name the user typed, a file that is no page of the corpus, a fenced block
  silent(await stop(t, { rows: [], message: 'The rule: c_Alpha.md was not read; c_Beta.md (not opened).' }), 'declared unread');
  silent(await stop(t, { rows: [], message: 'See also c_Alpha.md.' }), 'a pointer');
  silent(await stop(t, { rows: [], prompt: 'explain c_Alpha.md to me', message: bare('c_Alpha.md') }), 'typed by the user');
  silent(await stop(t, { rows: [], message: 'Edit SKILL.md, CLAUDE.md and README.md, then see notes.md and docs/PLATFORM-NOTES.md.' }), 'files that are no page of the corpus');
  silent(await stop(t, { rows: [], message: 'Run:\n```\ncat c_Alpha.md\n```\nDone.' }), 'a fenced block');
  // a name that many pages carry (index.md has fifty) is no citation of any
  for (const area of ['a1', 'a2', 'a3', 'a4', 'a5', 'a6']) addPage(i, `markdown/${area}/x_Many.md`);
  silent(await stop(t, { rows: [], message: bare('x_Many.md') }), 'six pages of one name');
  // the path and the name of one page are one item, not two
  const both = await stop(t, { rows: [], message: `The rule is in (citation: ${PAGE.beta}), that is c_Beta.md.` });
  asked(both, PAGE.beta);
  assert.equal(both.reason.match(/c_Beta\.md/g).length, 1, both.reason);
  // a file the turn wrote cites by name too
  const file = join(i.root, 'clients', 'acme', 'envelopes', 'e3.md');
  asked(await stop(t, { rows: [...bash('b0', 'ls vendor/ServiceNowDocs/markdown'), use('w', 'Write', { file_path: file, content: 'The SLA rule is in c_Beta.md.\n' }), res('w', 'ok')], message: 'Saved.' }), 'c_Beta.md');
  // the continuation: closed by a read, by a line that marks it, open otherwise
  const feedback = U(`Stop hook feedback:\n${d.reason}`, { isMeta: true });
  const cont = (extra, line) => stop(t, { rows: [text(bare('c_Alpha.md')), feedback, ...extra, text(line)], message: line, input: { stop_hook_active: true } });
  assert.match((await cont([], 'Understood.')).systemMessage, /c_Alpha\.md/);
  silent(await cont(readPage('r', i.abs(PAGE.alpha)), 'Correction: c_Alpha.md says what I cited.'), 'read after the ask');
  silent(await cont([], 'Correction: c_Alpha.md is a pointer.'), 'marked a pointer');
  // PowerShell reads by name as well
  silent(await stop(t, { rows: powershell('p', `Get-Content ${i.abs(PAGE.alpha).replaceAll('/', '\\')}`), message: bare('c_Alpha.md') }), 'Get-Content');
});
