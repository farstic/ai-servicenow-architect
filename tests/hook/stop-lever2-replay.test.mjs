// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C267, lever 2 — the architect's replay of the hook over the 151 finished C268 sitting sessions (2026-11-16, head 3974ef3e), through the Stop hook itself. The pure
 * modules' cases are tests/lever2-replay.test.mjs. The guard is 0 false "unread" claims:
 *   B1  a Grep line is relative to the session's folder: after a `cd` into the corpus the line became a doubled page that is not on disk, and the page the model saw was asked about;
 *   B2  a REFUSED shell call never ran, and its pages were counted as shown.
 */
import { PAGE, asked, cite, res, silent, stop, use, withInstall } from '../helpers/lever2.mjs';

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
  silent(await stop(t, { rows: failedCall('b', `cat ${page} missing.md`, 'Exit code 1\ncat: missing.md: No such file or directory'), message: cite(PAGE.alpha) }), 'a viewer that ran and failed');
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
  silent(await stop(t, { rows: agent, side: { a1: failedCall('s', `cat ${page} missing.md`, 'Exit code 1') }, message: cite(PAGE.alpha) }), 'a sub-agent\'s failed cat that ran');
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
