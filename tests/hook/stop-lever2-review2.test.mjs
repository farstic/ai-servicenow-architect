// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C267, lever 2 — the architect's SECOND review of #600 (2026-11-16, eight agents, every finding checked by a skeptic), through the Stop hook itself.
 * The pure modules' cases are tests/lever2-review2.test.mjs. The guard is 0 false "unread" claims; the numbers are the architect's:
 *   1, 2  a name filter of find -iname, rg -g, grep --include, fd -g or Get-ChildItem -Filter shows the pages it names, read as written and case-blind where the tool is;
 *   3     a folder's file list fed to a viewer shows the folder's pages;     7  a call that only lists shows none, and does not switch the ask off for the session;
 *   4     a script the turn wrote and ran is not a document that cites pages;  5  nor is a client file whose name a corpus page has;
 *   6     the notice lists only what the ask listed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { A, PAGE, U, asked, bash, cite, powershell, readPage, res, silent, stop, use, withInstall } from '../helpers/lever2.mjs';

const text = (t) => A([{ type: 'text', text: t }]);
const re = (page) => new RegExp(page.replaceAll('.', '\\.'));
const addPage = (i, rel) => { mkdirSync(dirname(join(i.corpus, rel)), { recursive: true }); writeFileSync(join(i.corpus, rel), 'The sn\\_example table.\n'); };
const write = (id, file, content) => [use(id, 'Write', { file_path: file, content }), res(id, 'ok')];

// ---- items 1, 2 and 3: what a call that lists or filters by name shows ---------------------------------------------------------------------
withInstall('ARC-09-C267 review 2, items 1 and 2 — a name filter of find, rg, fd, grep or Get-ChildItem shows the pages it names, as written and case-blind where the tool is', async (t, i) => {
  const root = `${i.corpus}/markdown`;                 // the search root, absolute; the shell stands in the project folder
  // [the call, the page it shows, a page of the same folder that it does not]
  for (const [command, shows, other] of [
    [`rg -l -g 'c_Alp*.md' table ${root} | xargs cat`, PAGE.alpha, PAGE.beta],
    [`rg -l --glob='c_Alp*.md' table ${root} | xargs cat`, PAGE.alpha, PAGE.beta],
    [`rg -l --glob 'c_Alp*.md' table ${root} | xargs cat`, PAGE.alpha, PAGE.beta],
    [`rg --files -g 'c_Alp*.md' ${root} | xargs cat`, PAGE.alpha, PAGE.beta],
    [`rg --files --iglob 'C_ALP*.MD' ${root} | xargs cat`, PAGE.alpha, PAGE.beta],
    [`fd -g 'c_Alp*.md' ${root} | xargs cat`, PAGE.alpha, PAGE.beta],
    [`grep -rl --include='c_Alp*.md' table ${root} | xargs cat`, PAGE.alpha, PAGE.beta],
    [`grep -rl --include 'c_Alp*.md' table ${root} | head -5 | xargs cat`, PAGE.alpha, PAGE.beta],
    [`find ${root} -iname 'C_ALP*.MD' | xargs cat`, PAGE.alpha, PAGE.beta],
    [`find ${root} -iname 'c_alpha.md' -exec sed -n 1,5p {} \\;`, PAGE.alpha, PAGE.beta],
    [`find ${root} -ipath '*it-service-management/c_alp*' -exec cat {} +`, PAGE.alpha, PAGE.beta],
  ]) {
    silent(await stop(t, { rows: bash('b', command), message: cite(shows) }), command);
    asked(await stop(t, { rows: bash('b', command), message: cite(other) }), other);
  }
  // the control: a case-sensitive filter with the wrong case shows nothing
  asked(await stop(t, { rows: bash('b', `find ${root} -name 'C_ALP*.MD' | xargs cat`), message: cite(PAGE.alpha) }), PAGE.alpha);
  // PowerShell takes -Filter and -Include below its root, case-blind
  const win = i.folder(PAGE.alpha).replaceAll('/', '\\');
  for (const command of [`Get-ChildItem -Path "${win}" -Recurse -Filter 'c_alp*.md' | Get-Content`, `gci -Path "${win}" -Recurse -Include 'x*','c_alp*' | Get-Content`]) {
    silent(await stop(t, { rows: powershell('p', command), message: cite(PAGE.alpha) }), command);
    asked(await stop(t, { rows: powershell('p', command), message: cite(PAGE.beta) }), PAGE.beta);
  }
});

withInstall('ARC-09-C267 review 2, items 2 and 3 — a regex filter, a folder\'s file list or a loop over it shows the pages of the folder, and not those of another', async (t, i) => {
  const area = i.folder(PAGE.alpha);                   // c_Alpha.md and c_Beta.md; c_Gamma.md is in another area
  const both = `${cite(PAGE.alpha)} ${cite(PAGE.beta)}`;
  for (const command of [
    `find ${area} -iregex '.*c_alpha.*' | xargs head -80`,
    `find ${area} -regex '.*c_Alpha.*\\.md' -exec cat {} +`,
    `fd alpha ${area} | xargs cat`,
    `rg -l table ${area} | xargs cat`,
    `rg -l -g '!*.txt' table ${area} | xargs cat`,
    `find ${area} -type f | xargs cat`,
    `ls ${area} | grep -i alp | xargs -I{} cat ${area}/{}`,
    `for f in $(ls ${area}); do head -20 "${area}/$f"; done`,
    `cd ${area} && rg -l table . | xargs cat`,
  ]) {
    silent(await stop(t, { rows: bash('b', command), message: both }), command);
    asked(await stop(t, { rows: bash('b', command), message: cite(PAGE.gamma) }), PAGE.gamma);
    silent(await stop(t, { rows: agentRows(i, command), side: sideOf(i, command), message: both }), `a sub-agent's ${command}`);
  }
});
const agentCall = [use('a1', 'Agent', { subagent_type: 'general-purpose', prompt: 'read it' }), res('a1', 'It says X.')];
const agentRows = () => agentCall;
const sideOf = (i, command) => ({ a1: bash('s', command, { extra: { cwd: i.root } }) });

withInstall('ARC-09-C267 review 2, item 7 — a call that only lists shows no page, and one such call does not switch the ask off for the rest of the session', async (t, i) => {
  const root = `${i.corpus}/markdown`;
  const area = i.folder(PAGE.alpha);
  for (const command of [
    `find ${root} -name '*.md' | xargs grep -l table`,
    `find ${root} -name '*.md' | xargs wc -l | sort -n | tail -3`,
    `for f in ${area}/*.md; do echo "$f"; done | wc -l`,
    `rg -l table ${area} | xargs grep -c alpha`,
    `ls ${area} | xargs echo`,
  ]) {
    asked(await stop(t, { rows: bash('b', command), message: cite(PAGE.alpha) }), PAGE.alpha);
    // and later in the session: the listing came first, the answer cites a page nothing read
    asked(await stop(t, { rows: [...bash('b0', command), ...bash('b1', 'ls'), ...readPage('r', i.abs(PAGE.beta))], message: cite(PAGE.alpha) }), PAGE.alpha);
  }
  // the controls: the same searches given a content viewer show the pages
  for (const command of [`find ${root} -name '*.md' | xargs grep -n table`, `find ${root} -name '*.md' | xargs cat`, `for f in ${area}/*.md; do head -3 "$f"; done`]) {
    silent(await stop(t, { rows: bash('b', command), message: cite(PAGE.alpha) }), command);
  }
  // an interpreter can read without a viewer verb
  silent(await stop(t, { rows: bash('b', `python3 -c "print(open(glob.glob('${area}/c_Alp*.md')[0]).read())"`), message: cite(PAGE.alpha) }), 'python reads');
});

// ---- item 4: a script the turn wrote and ran ----------------------------------------------------------------------------------------------
withInstall('ARC-09-C267 review 2, item 4 — a script the turn wrote and then ran is not read as a document that cites pages', async (t, i) => {
  const script = `base = "${i.folder(PAGE.alpha)}"\nfor name in ["c_Alpha.md", "c_Beta.md"]:\n    print(open(base + "/" + name).read()[:2000])\n`;
  const shell = `D=${i.folder(PAGE.alpha)}\nfor f in c_Alpha.md c_Beta.md; do sed -n 1,40p "$D/$f"; done\n`;
  const answer = 'Both pages agree: the matrix is kept per area.';
  // a Write, then a run by an interpreter given its path
  silent(await stop(t, { rows: [...write('w', '/tmp/readpages.py', script), ...bash('b', 'python3 /tmp/readpages.py')], message: answer }), 'a python script that was run');
  silent(await stop(t, { rows: [...write('w', '/tmp/r.sh', shell), ...bash('b', 'bash /tmp/r.sh')], message: answer }), 'a shell script that was run');
  silent(await stop(t, { rows: [...write('w', '/tmp/r.sh', shell), ...bash('b', 'cd /tmp && sh r.sh')], message: answer }), 'by its base name');
  // a heredoc that writes it, run in the same call or in a later one
  silent(await stop(t, { rows: bash('b', `cat > /tmp/r.sh <<'EOF'\n${shell}EOF\nbash /tmp/r.sh`), message: answer }), 'written and run in one call');
  silent(await stop(t, { rows: [...bash('b', `cat > /tmp/r.sh <<'EOF'\n${shell}EOF`), ...bash('c', 'bash /tmp/r.sh')], message: answer }), 'written, then run');
  // the controls: a script nobody ran, and a document the turn wrote and read back, are files the turn wrote like any other
  asked(await stop(t, { rows: write('w', '/tmp/readpages.py', script), message: 'Saved.' }), 'c_Alpha.md');
  const envelope = join(i.root, 'clients', 'acme', 'envelopes', 'e1.md');
  asked(await stop(t, { rows: [...write('w', envelope, `The rule is in ${PAGE.alpha}.\n`), ...bash('b', `cat ${envelope.replaceAll('\\', '/')}`)], message: 'Saved.' }), PAGE.alpha);
});

// ---- item 5: a client file whose name a corpus page has -----------------------------------------------------------------------------------
withInstall('ARC-09-C267 review 2, item 5 — a client file whose name is also a corpus page\'s is no citation of the page', async (t, i) => {
  for (const rel of ['markdown/it-service-management/incident.md', 'markdown/it-service-management/change.md', 'markdown/it-service-management/overview.md', 'markdown/hr-service-delivery/overview.md']) addPage(i, rel);
  const acme = join(i.root, 'clients', 'acme');
  const edit = (id, file) => [use(id, 'Edit', { file_path: file, old_string: 'a', new_string: 'b' }), res(id, 'ok')];
  const rows = [use('r1', 'Read', { file_path: join(acme, 'incident.md') }), res('r1', '1\tx'), ...edit('e1', join(acme, 'incident.md')), ...write('w1', join(acme, 'change.md'), 'CAB notes\n')];
  silent(await stop(t, { rows, message: 'Updated `incident.md` with the major-incident RACI and started `change.md` for the CAB notes.' }), 'files the session read, edited and wrote');
  silent(await stop(t, { rows: write('w', join(acme, 'overview.md'), 'x\n'), message: 'Drafted overview.md in the engagement folder.' }), 'a file the turn wrote');
  silent(await stop(t, { rows: [], message: 'The RACI is in clients/acme/incident.md, and incident.md lists the approvers.' }), 'the answer gives the name a path outside the corpus');
  // the controls: a name nothing outside the corpus owns is a citation of the corpus page
  asked(await stop(t, { rows: [], message: 'See `incident.md` for the process.' }), 'incident.md');
  asked(await stop(t, { rows, message: 'The overview is in overview.md.' }), 'overview.md');
});

// ---- item 6: the notice lists only what the ask listed -------------------------------------------------------------------------------------
withInstall('ARC-09-C267 review 2, item 6 — the notice names no dead path the ask did not name, and none past the ask\'s first twelve', async (t, i) => {
  // (a) a dead path in a file the turn wrote, which the answer also shows in a fence
  const dead = 'markdown/it-service-management/c_GoneRule.md';
  const file = join(i.root, 'clients', 'acme', 'hld.md');
  const answer = `The SLA part is in (citation: ${PAGE.beta}).\n\`\`\`markdown\nEscalation follows the rule in ${dead}.\n\`\`\``;
  const first = [...write('w', file, `Escalation follows the rule in ${dead}.\n`)];
  const d = await stop(t, { rows: first, message: answer });
  asked(d, PAGE.beta);
  const feedback = U(`Stop hook feedback:\n${d.reason}`, { isMeta: true });
  const cont = (extra, line) => stop(t, { rows: [...first, text(answer), feedback, ...extra, text(line)], message: line, input: { stop_hook_active: true } });
  const after = await cont(readPage('r', i.abs(PAGE.beta)), `Correction: ${PAGE.beta} says what I cited.`);
  if (after?.systemMessage?.includes(dead)) assert.ok(d.reason.includes(dead), `the notice names a path the ask did not: ${after.systemMessage}`);
  const pointed = await cont(readPage('r', i.abs(PAGE.beta)), `Correction: ${PAGE.beta} says what I cited.\nCorrection: ${dead} is withdrawn.`);
  silent(pointed, 'the dead path withdrawn on a Correction line');

  // (b) fifteen pages in a written file: the ask names twelve and counts three
  const pages = Array.from({ length: 15 }, (_, k) => `markdown/it-service-management/p${String(k + 1).padStart(2, '0')}.md`);
  for (const p of pages) addPage(i, p);
  const hld = join(i.root, 'clients', 'acme', 'hld2.md');
  const wrote = write('w2', hld, `References:\n${pages.map((p) => `- ${p}`).join('\n')}\n`);
  const d2 = await stop(t, { rows: wrote, message: 'Saved.' });
  assert.match(d2.reason, /And 3 more of these/);
  for (const p of pages.slice(0, 12)) assert.match(d2.reason, re(p));
  for (const p of pages.slice(12)) assert.doesNotMatch(d2.reason, re(p));
  const feedback2 = U(`Stop hook feedback:\n${d2.reason}`, { isMeta: true });
  const reads = pages.slice(0, 12).flatMap((p, k) => readPage(`q${k}`, i.abs(p)));
  const fixed = `${pages.slice(0, 12).map((p) => `Correction: ${p} says what the file cites.`).join('\n')}`;
  const n2 = await stop(t, { rows: [...wrote, text('Saved.'), feedback2, ...reads, text(fixed)], message: fixed, input: { stop_hook_active: true } });
  for (const p of pages.slice(12)) assert.ok(!n2?.systemMessage || !re(p).test(n2.systemMessage), `the notice names a page the ask did not: ${p}`);
  assert.match(n2?.systemMessage ?? '', /\b3 more\b/, 'it counts what the ask counted');
});

// ---- guards ----------------------------------------------------------------------------------------------------------------------------------
withInstall('ARC-09-C267 review 2, item 4 — the pages a script that ran names are pages it showed, and those of a script that did not run are not', async (t, i) => {
  const script = `base = "${i.folder(PAGE.alpha)}"\nfor name in ["c_Alpha.md", "c_Beta.md"]:\n    print(open(base + "/" + name).read()[:2000])\n`;
  const ran = [...write('w', '/tmp/readpages.py', script), ...bash('b', 'python3 /tmp/readpages.py')];
  silent(await stop(t, { rows: ran, message: `${cite(PAGE.alpha)} ${cite(PAGE.beta)}` }), 'the script printed both pages, and the answer cites them');
  asked(await stop(t, { rows: ran, message: cite(PAGE.gamma) }), PAGE.gamma);
  asked(await stop(t, { rows: write('w', '/tmp/readpages.py', script), message: cite(PAGE.alpha) }), PAGE.alpha);
  // run by another name: the base name decides, a different file is not it
  asked(await stop(t, { rows: [...write('w', '/tmp/readpages.py', script), ...bash('b', 'python3 /tmp/other.py')], message: cite(PAGE.alpha) }), PAGE.alpha);
});

withInstall('ARC-09-C267 review 2, items 1 to 3 — a listing that is not fed to a viewer shows nothing, with the filters and folders of the review in the same call', async (t, i) => {
  const root = `${i.corpus}/markdown`;
  const area = i.folder(PAGE.alpha);
  for (const command of [
    `rg -l -g 'c_Alp*.md' table ${root}`, `find ${area} -iname 'c_alp*' -type f`, `fd -g 'c_Alp*.md' ${root}`, `find ${area} -type f | xargs wc -l`,
    `for f in $(ls ${area}); do echo "$f"; done`, `grep -rl --include='c_Alp*.md' table ${root} | sort | uniq -c | tail -3`,
  ]) {
    asked(await stop(t, { rows: bash('b', command), message: cite(PAGE.alpha) }), PAGE.alpha);
  }
  // and the same filters, fed to a viewer, show
  for (const command of [`rg -l -g 'c_Alp*.md' table ${root} | xargs head -3`, `find ${area} -iname 'c_alp*' -type f | xargs sed -n 1,3p`, `for f in $(ls ${area}); do head -2 "${area}/$f"; done`]) {
    silent(await stop(t, { rows: bash('b', command), message: cite(PAGE.alpha) }), command);
  }
});

withInstall('ARC-09-C267 review 2, item 6 — a dead path in a file the turn wrote is asked about, in the ask and in the notice alike, whatever the answer holds', async (t, i) => {
  const dead = 'markdown/it-service-management/c_GoneRule.md';
  const file = join(i.root, 'clients', 'acme', 'hld.md');
  const rows = write('w', file, `Escalation follows the rule in ${dead}.\n`);
  const d = await stop(t, { rows, message: 'Saved.' });
  asked(d, dead);
  const feedback = U(`Stop hook feedback:\n${d.reason}`, { isMeta: true });
  const after = await stop(t, { rows: [...rows, text('Saved.'), feedback, text('Understood.')], message: 'Understood.', input: { stop_hook_active: true } });
  assert.ok(after?.systemMessage?.includes(dead), `the notice names what the ask named: ${JSON.stringify(after)}`);
  // the same path in a fence of the answer (C254's set holds it): the ask names it all the same
  asked(await stop(t, { rows, message: `Saved.\n\`\`\`markdown\nEscalation follows the rule in ${dead}.\n\`\`\`` }), dead);
  // and a dead path only in the answer is C254's, not this ask's
  silent(await stop(t, { rows: [], message: cite(dead) }), 'a dead path in the answer is not asked about here');
});

withInstall('ARC-09-C267 review 2, item 6 — when the continuation opens every page, the ones past the twelve too, the notice says nothing', async (t, i) => {
  const pages = Array.from({ length: 15 }, (_, k) => `markdown/it-service-management/q${String(k + 1).padStart(2, '0')}.md`);
  for (const p of pages) addPage(i, p);
  const wrote = write('w3', join(i.root, 'clients', 'acme', 'hld3.md'), `References:\n${pages.map((p) => `- ${p}`).join('\n')}\n`);
  const d = await stop(t, { rows: wrote, message: 'Saved.' });
  assert.match(d.reason, /And 3 more of these/);
  const feedback = U(`Stop hook feedback:\n${d.reason}`, { isMeta: true });
  const reads = pages.flatMap((p, k) => readPage(`z${k}`, i.abs(p)));
  const fixed = pages.map((p) => `Correction: ${p} says what the file cites.`).join('\n');
  silent(await stop(t, { rows: [...wrote, text('Saved.'), feedback, ...reads, text(fixed)], message: fixed, input: { stop_hook_active: true } }), 'every page read');
});
