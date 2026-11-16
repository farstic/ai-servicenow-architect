// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C267, lever 2 — the architect's replay of the hook over the 151 finished C268 sitting sessions (2026-11-16, head 3974ef3e), through the Stop hook itself. The pure
 * modules' cases are tests/lever2-replay.test.mjs. The guard is 0 false "unread" claims:
 *   B1  a Grep line is relative to the session's folder: after a `cd` into the corpus the line became a doubled page that is not on disk, and the page the model saw was asked about;
 *   B2  a REFUSED shell call never ran, and its pages were counted as shown.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PAGE, asked, cite, readPage, res, silent, stop, use, withInstall } from '../helpers/lever2.mjs';

// ---- B1 -----------------------------------------------------------------------------------------------------------------------------------------
withInstall('ARC-09-C267 replay B1 — a Grep whose lines are relative to the session\'s folder shows that page, not a doubled one that is not on disk', async (t, i) => {
  const markdown = `${i.corpus}/markdown`;                       // the rows' folder after a cd into the corpus
  const area = i.folder(PAGE.alpha);                            // the folder the Grep searched, inside it
  const grep = (id, body, input = {}) => [use(id, 'Grep', { pattern: 'table', path: area, output_mode: 'content', ...input }, { cwd: markdown }), res(id, body)];
  const hit = 'it-service-management/c_Alpha.md:1:The sn\\_example table.';
  silent(await stop(t, { rows: grep('g', hit), message: cite(PAGE.alpha) }), 'the line below the session\'s folder');
  silent(await stop(t, { rows: grep('g', 'it-service-management/c_Alpha.md-2-context line'), message: cite(PAGE.alpha) }), 'a context line, path-2-text');
  silent(await stop(t, { rows: grep('g', `${hit}\nit-service-management/c_Beta.md:4:another`), message: `${cite(PAGE.alpha)} ${cite(PAGE.beta)}` }), 'two pages');
  // the lines name those pages and no other
  asked(await stop(t, { rows: grep('g', hit), message: cite(PAGE.beta) }), PAGE.beta);
  asked(await stop(t, { rows: grep('g', hit), message: cite(PAGE.gamma) }), PAGE.gamma);
  // the corpus itself as the session's folder, the lines starting with markdown/
  const fromRoot = [use('g', 'Grep', { pattern: 'table', path: `${i.corpus}/markdown/it-service-management`, output_mode: 'content' }, { cwd: i.corpus }),
    res('g', 'markdown/it-service-management/c_Alpha.md:1:The sn\\_example table.')];
  silent(await stop(t, { rows: fromRoot, message: cite(PAGE.alpha) }), 'the corpus as the folder');
  asked(await stop(t, { rows: fromRoot, message: cite(PAGE.beta) }), PAGE.beta);
});

// ---- B2 -----------------------------------------------------------------------------------------------------------------------------------------
const REFUSED = [
  'This Bash command contains multiple operations. The following part requires approval: cat x',
  "A variable in this command can't be checked before it runs",
  'Parser skipped input between top-level statements',
  'This command requires approval',
];
const failedCall = (id, command, text, name = 'Bash') => [use(id, name, { command, description: 'x' }), res(id, text, { is_error: true })];

withInstall('ARC-09-C267 replay B2 — a refused call shows nothing, and one that ran and failed still shows the pages it printed', async (t, i) => {
  const page = i.abs(PAGE.alpha);
  for (const text of REFUSED) {
    asked(await stop(t, { rows: failedCall('b', `cat ${page} missing.md`, text), message: cite(PAGE.alpha) }), PAGE.alpha);
    asked(await stop(t, { rows: failedCall('p', `Get-Content ${page}, missing.md`, text, 'PowerShell'), message: cite(PAGE.alpha) }), PAGE.alpha);
    // a loop and a pattern that were refused show nothing either
    asked(await stop(t, { rows: failedCall('l', 'for f in c_Alpha.md c_Beta.md; do head -20 "$f"; done', text), message: cite(PAGE.alpha) }), PAGE.alpha);
    asked(await stop(t, { rows: failedCall('g', `for f in ${i.folder(PAGE.alpha)}/c_Alp*.md; do head -3 "$f"; done`, text), message: cite(PAGE.alpha) }), PAGE.alpha);
  }
  // it ran: "Exit code N"
  silent(await stop(t, { rows: failedCall('b', `cat ${page} missing.md`, 'Exit code 1\n1\tThe sn\\_example table.\ncat: missing.md: No such file or directory'), message: cite(PAGE.alpha) }), 'a viewer that ran and failed');
  silent(await stop(t, { rows: failedCall('l', 'for f in c_Alpha.md c_Beta.md; do head -20 "$f"; done', 'Exit code 1'), message: cite(PAGE.alpha) }), 'a loop that ran and failed');
  // the prefix is not relied on: the result holds a line of the page
  silent(await stop(t, { rows: failedCall('b', `cat ${page} missing.md`, '1\tThe sn\\_example table.\ncat: missing.md: No such file or directory'), message: cite(PAGE.alpha) }), 'a result with the page\'s lines');
  asked(await stop(t, { rows: failedCall('b', `cat ${page} missing.md`, 'cat: missing.md: No such file or directory'), message: cite(PAGE.alpha) }), PAGE.alpha);
  // and the page it did not name is asked about as before
  asked(await stop(t, { rows: failedCall('b', `cat ${page} missing.md`, 'Exit code 1'), message: cite(PAGE.beta) }), PAGE.beta);
  // a sub-agent's calls follow the same rule: its rows are walked with the same seams
  const agent = [use('a1', 'Agent', { subagent_type: 'general-purpose', prompt: 'read it' }), res('a1', 'It says X.')];
  const held = '1\tThe sn\\_example table.\ncat: missing.md: No such file or directory';
  silent(await stop(t, { rows: agent, side: { a1: failedCall('s', `cat ${page} missing.md`, held) }, message: cite(PAGE.alpha) }), 'a sub-agent\'s failed cat whose result holds the page\'s line');
  silent(await stop(t, { rows: agent, side: { a1: failedCall('s', `cat ${page} missing.md`, 'Exit code 1\n1\tThe sn\\_example table.') }, message: cite(PAGE.alpha) }), 'a sub-agent\'s failed cat that ran');
  asked(await stop(t, { rows: agent, side: { a1: failedCall('s', `cat ${page} missing.md`, 'This command requires approval') }, message: cite(PAGE.alpha) }), PAGE.alpha);
});

// ---- B3 -----------------------------------------------------------------------------------------------------------------------------------------
withInstall('ARC-09-C267 replay B3 — a resolved search with a name filter that prints lines without a file name shows the pages the filter matches', async (t, i) => {
  const area = i.folder(PAGE.alpha);                            // c_Alpha.md and c_Beta.md
  const printed = '1\tThe sn\\_example table.';
  const ran = (command, body = printed) => [use('b', 'Bash', { command, description: 'x' }), res('b', body)];
  for (const command of [`grep -rh --include='c_Alp*' -m 3 'table' ${area}`, `grep -rh --include=c_Alpha.md table ${area}`, `rg -I -g 'c_Alp*' table ${area}`, `rg --no-filename --glob='c_Alp*' table ${area}`,
    `rg -h --iglob 'C_ALP*' table ${area}`]) {
    silent(await stop(t, { rows: ran(command), message: cite(PAGE.alpha) }), command);
    asked(await stop(t, { rows: ran(command), message: cite(PAGE.beta) }), PAGE.beta);
  }
  // without the filter nothing names the page; with the filter and no line printed nothing was shown
  asked(await stop(t, { rows: ran(`grep -rh -m 3 'table' ${area}`), message: cite(PAGE.alpha) }), PAGE.alpha);
  asked(await stop(t, { rows: ran(`grep -rh --include='c_Alp*' table ${area}`, ''), message: cite(PAGE.alpha) }), PAGE.alpha);
  // a listing prints no line of a page
  asked(await stop(t, { rows: ran(`grep -rl --include='c_Alp*' table ${area}`), message: cite(PAGE.alpha) }), PAGE.alpha);
  // a refused call shows nothing, and does not mask the page (the soak's head -40 … && touch)
  const refused = [use('b', 'Bash', { command: `head -40 ${area}/c_Alp*.md && touch soak-refused.txt`, description: 'x' }), res('b', 'This command requires approval', { is_error: true })];
  asked(await stop(t, { rows: refused, message: cite(PAGE.alpha) }), PAGE.alpha);
});

// ---- B4: a name filter names a page only below the folder the search ran on ----------------------------------------------------------------------
withInstall('ARC-09-C267 replay B4 (a) — a name filter names a page only below the folder the search ran on: the same file name in another area is asked about', async (t, i) => {
  const hrAlpha = 'markdown/hr-service-delivery/c_Alpha.md';       // the file name of PAGE.alpha, in another area
  mkdirSync(dirname(join(i.corpus, hrAlpha)), { recursive: true });
  writeFileSync(join(i.corpus, hrAlpha), 'The sn\\_example table.\n');
  const area = i.folder(PAGE.alpha);
  const ran = (command, body = '1\tThe sn\\_example table.') => [use('b', 'Bash', { command, description: 'x' }), res('b', body)];
  for (const command of [`find ${area} -name 'c_Alp*' | xargs cat`, `grep -rh --include='c_Alp*' table ${area}`, `rg -l -g 'c_Alp*' table ${area} | xargs head -3`, `cd ${area} && find -name 'c_Alp*' | xargs cat`]) {
    silent(await stop(t, { rows: ran(command), message: cite(PAGE.alpha) }), command);
    asked(await stop(t, { rows: ran(command), message: cite(hrAlpha) }), hrAlpha);
  }
  // no corpus folder, no page: a filter of the project folder names nothing
  asked(await stop(t, { rows: ran("find . -name 'c_Alp*' | xargs cat"), message: cite(PAGE.alpha) }), PAGE.alpha);
  asked(await stop(t, { rows: ran("grep -rh --include='*.md' table clients/acme"), message: cite(PAGE.alpha) }), PAGE.alpha);
});

withInstall('ARC-09-C267 replay B4 (b) — B3 does not apply when other segments of the call print: the page the search might have printed is asked about', async (t, i) => {
  const area = i.folder(PAGE.alpha);
  const ran = (command) => [use('b', 'Bash', { command, description: 'x' }), res('b', '1\tThe sn\\_example table.\n----\n1\ta line')];
  const mixed = `cd ${area} && sed -n 1,2p c_Beta.md; echo ----; grep -rh --include='c_Alp*' table .`;
  silent(await stop(t, { rows: ran(mixed), message: cite(PAGE.beta) }), 'the page sed printed');
  asked(await stop(t, { rows: ran(mixed), message: cite(PAGE.alpha) }), PAGE.alpha);
  // alone, or piped into head: B3 applies
  silent(await stop(t, { rows: ran(`cd ${area} && grep -rh --include='c_Alp*' table . | head -5`), message: cite(PAGE.alpha) }), 'piped into head');
});

withInstall('ARC-09-C267 replay B4 (c) — a pattern with no folder that names more pages than ubiquityPages counts for none, a narrow one counts', async (t, i) => {
  const printed = '1\tThe sn\\_example table.';
  const ran = (command) => [use('b', 'Bash', { command, description: 'x' }), res('b', printed)];
  const script = 'python3 -c "import glob; print(glob.glob(\'**/*.md\'))"';
  // the corpus here has four pages: with a ubiquity of 2, `**/*.md` names too many
  asked(await stop(t, { rows: ran(script), message: cite(PAGE.alpha), seams: { options: { ubiquity: 2 } } }), PAGE.alpha);
  asked(await stop(t, { rows: ran('cd "$HOME/x" && cat *.md'), message: cite(PAGE.alpha), seams: { options: { ubiquity: 2 } } }), PAGE.alpha);
  // with the real ubiquity (500) it names four: it counts
  silent(await stop(t, { rows: ran(script), message: cite(PAGE.alpha) }), 'under the ubiquity');
  // a narrow pattern with no folder names one page
  silent(await stop(t, { rows: ran('cd "$HOME/x" && cat c_Alp*.md'), message: cite(PAGE.alpha), seams: { options: { ubiquity: 2 } } }), 'c_Alp*.md names one page');
  asked(await stop(t, { rows: ran('cd "$HOME/x" && cat c_Alp*.md'), message: cite(PAGE.beta), seams: { options: { ubiquity: 2 } } }), PAGE.beta);
  // a pattern with a folder counts however many pages it names
  silent(await stop(t, { rows: ran(`for f in ${i.folder(PAGE.alpha)}/c_*.md; do head -3 "$f"; done`), message: cite(PAGE.alpha), seams: { options: { ubiquity: 1 } } }), 'a pattern with a folder');
});

// ---- B5: a Grep of one page that found nothing shows nothing -----------------------------------------------------------------------------------------
withInstall('ARC-09-C267 replay B5 — a Grep whose path is one page shows it only when its result has a match line', async (t, i) => {
  const grepOne = (body) => [use('g', 'Grep', { pattern: 'Priority 1|P1 ', path: i.abs(PAGE.alpha), output_mode: 'content' }), res('g', body)];
  asked(await stop(t, { rows: grepOne('No matches found'), message: cite(PAGE.alpha) }), PAGE.alpha);
  asked(await stop(t, { rows: grepOne('[Omitted long matching line]'), message: cite(PAGE.alpha) }), PAGE.alpha);
  silent(await stop(t, { rows: grepOne('40:The sn\\_example table.'), message: cite(PAGE.alpha) }), 'a match line');
  silent(await stop(t, { rows: grepOne('[Omitted long matching line]\n--\n41:another line'), message: cite(PAGE.alpha) }), 'an omitted line beside a match');
  // another page is asked about either way
  asked(await stop(t, { rows: grepOne('40:The sn\\_example table.'), message: cite(PAGE.beta) }), PAGE.beta);
});

// ---- B6: a failed call counts a page only if the result holds a line of that page --------------------------------------------------------------------
withInstall('ARC-09-C267 replay B6 — zsh stops a list at an expansion error: the sed after it never ran, and its page is asked about; an ls shows no page', async (t, i) => {
  writeFileSync(join(i.corpus, PAGE.alpha), 'Alpha holds the escalation rule of a case.\n');
  writeFileSync(join(i.corpus, PAGE.beta), 'Beta says something quite different here.\n');
  const area = i.folder(PAGE.alpha);
  const list = `cd ${area}; sed -n 15,60p c_Alpha.md; echo ======; sed -n 15,70p c_Beta.md`;
  const abort = 'Exit code 1\nAlpha holds the escalation rule of a case.\n(eval):1: ====== not found';
  silent(await stop(t, { rows: failedCall('b', list, abort), message: cite(PAGE.alpha) }), 'the first sed printed');
  asked(await stop(t, { rows: failedCall('b', list, abort), message: cite(PAGE.beta) }), PAGE.beta);
  silent(await stop(t, { rows: failedCall('b', list, `${abort}\nBeta says something quite different here.`), message: `${cite(PAGE.alpha)} ${cite(PAGE.beta)}` }), 'both printed');
  asked(await stop(t, { rows: failedCall('b', list, 'Exit code 1\n(eval):1: ====== not found'), message: cite(PAGE.alpha) }), PAGE.alpha);
  // cat a.md missing.md still counts a.md: its lines are there
  silent(await stop(t, { rows: failedCall('b', `cat ${i.abs(PAGE.alpha)} missing.md`, 'Exit code 1\nAlpha holds the escalation rule of a case.\ncat: missing.md: No such file or directory'), message: cite(PAGE.alpha) }), 'a.md of cat a.md missing.md');
  // a page that only an ls named is no page that was read, whether the call ran or not
  const ls = `cd ${area}; ls c_Alpha.md c_Beta.md 2>&1; sed -n 15,45p c_Alpha.md`;
  const ran = [use('b', 'Bash', { command: ls, description: 'x' }), res('b', 'c_Alpha.md\nc_Beta.md\nAlpha holds the escalation rule of a case.')];
  silent(await stop(t, { rows: ran, message: cite(PAGE.alpha) }), 'the page sed printed');
  asked(await stop(t, { rows: ran, message: cite(PAGE.beta) }), PAGE.beta);
});

// ---- B7: the file name of a partial path is a bare-name citation -------------------------------------------------------------------------------------
withInstall('ARC-09-C267 replay B7 — a partial path to a corpus page (`.../x.md`, `folder/x.md`) is asked about unless the page was opened; a path outside the corpus is not', async (t, i) => {
  const remote = 'markdown/servicenow-platform/domain-separation/domain-separation-remote-tables.md';
  const incident = 'markdown/it-service-management/incident.md';
  for (const rel of [remote, incident]) { mkdirSync(dirname(join(i.corpus, rel)), { recursive: true }); writeFileSync(join(i.corpus, rel), 'The sn\\_example table.\n'); }
  const ellipsis = 'Domain separation is unsupported (`.../domain-separation-remote-tables.md`).';
  asked(await stop(t, { rows: [], message: ellipsis }), 'domain-separation-remote-tables.md');
  asked(await stop(t, { rows: [], message: 'See domain-separation/domain-separation-remote-tables.md for it.' }), 'domain-separation-remote-tables.md');
  silent(await stop(t, { rows: readPage('r', i.abs(remote)), message: ellipsis }), 'the page was opened');
  // a path outside the corpus is that file\'s, even when a corpus page has the same name
  silent(await stop(t, { rows: [], message: 'The RACI is in clients/acme/incident.md.' }), 'a client file named like a page');
  silent(await stop(t, { rows: [], message: 'Updated .claude/skills/csm-specialist/SKILL.md.' }), 'SKILL.md');
});
