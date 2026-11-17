// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C267, lever 2, B8 — through the Stop hook itself (the pure modules' cases are tests/lever2-search-evidence.test.mjs): a search verb shows a page it names only when
 * its result holds a line of that page. The guard is 0 false "never opened" claims, so a whole-file viewer keeps "named is shown".
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PAGE, asked, cite, res, silent, stop, use, withInstall } from '../helpers/lever2.mjs';

withInstall('ARC-09-C267 B8 — a multi-file grep that printed no line of a page does not show it, and the page is asked about when the answer cites it', async (t, i) => {
  writeFileSync(join(i.corpus, PAGE.alpha), 'Alpha lets customers attach a file to a case.\nAlpha closes the case on acceptance.\n');
  writeFileSync(join(i.corpus, PAGE.beta), 'Beta lets an agent attach a document to a case.\nBeta never reopens a closed case.\n');
  const area = i.folder(PAGE.alpha);
  const call = (command, output) => [use('b', 'Bash', { command, description: 'x' }), res('b', output)];
  const both = `cd ${area}; sed -n 1,2p c_Alpha.md; grep -n -i "attach" c_Alpha.md c_Beta.md | head -5`;
  const alpha = 'Alpha lets customers attach a file to a case.\nAlpha closes the case on acceptance.\nc_Alpha.md:1:Alpha lets customers attach a file to a case.';
  silent(await stop(t, { rows: call(both, alpha), message: cite(PAGE.alpha) }), 'the page that sed printed');
  asked(await stop(t, { rows: call(both, alpha), message: cite(PAGE.beta) }), PAGE.beta);
  silent(await stop(t, { rows: call(both, `${alpha}\nc_Beta.md:1:Beta lets an agent attach a document to a case.`), message: cite(PAGE.beta) }), 'a line of it was printed');
});

withInstall('ARC-09-C267 B8 — a grep with no match, as one whose pattern misses the escapes of the page, shows nothing; a line of the page, or a whole-file viewer, shows it', async (t, i) => {
  writeFileSync(join(i.corpus, PAGE.alpha), 'The tables are sn\\_example\\_tool and sn\\_example\\_team.\nAlpha closes the case on acceptance.\n');
  const area = i.folder(PAGE.alpha);
  const call = (command, output) => [use('b', 'Bash', { command, description: 'x' }), res('b', output)];
  const missed = `cd ${area}; grep -n "sn_example_tool\\|sn_example_team\\b" c_Alpha.md | head -6`;
  asked(await stop(t, { rows: call(missed, ''), message: cite(PAGE.alpha) }), PAGE.alpha);
  asked(await stop(t, { rows: call(`cd ${area}; grep -n "close" c_Alpha.md | wc -l`, '1'), message: cite(PAGE.alpha) }), PAGE.alpha);
  silent(await stop(t, { rows: call(`cd ${area}; grep -n "close" c_Alpha.md`, '2:Alpha closes the case on acceptance.'), message: cite(PAGE.alpha) }), 'a match line of the page');
  silent(await stop(t, { rows: call(`cd ${area}; cat c_Alpha.md`, ''), message: cite(PAGE.alpha) }), 'a whole-file viewer');
  silent(await stop(t, { rows: call(`cd ${area}; grep -n "zzz" c_Alpha.md; sed -n 1,2p c_Alpha.md`, ''), message: cite(PAGE.alpha) }), 'a viewer after a search');
});
