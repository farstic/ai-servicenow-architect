// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C291 — a cited page must print the name it is cited for, through the Stop hook itself (the pure function's cases are tests/citation-support.test.mjs).
 * The ask is the one ask of the turn: folded into the hook's single block, beside a never-opened page when there is one, and never repeated on the continuation.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { A, PAGE, U, asked, silent, stop, withInstall } from '../helpers/lever2.mjs';
import { normalisePage } from '../../tools/snowarch/lib/docs/name-support.mjs';
import assert from 'node:assert/strict';

const text = (t) => A([{ type: 'text', text: t }]);
const INDEX = {
  coverage: 'full', meta: { coverage: 'full' }, namespaces: new Map(), pageCount: 4, nameCount: 2,
  has: (n) => Object.hasOwn(NAMES, n), count: (n) => (NAMES[n] ?? []).length, pathsOf: (n) => NAMES[n] ?? [], pagesOf: () => [], both: () => [],
};
const NAMES = { sysrule_assignment: [PAGE.beta], sn_bom_claim: [PAGE.alpha] };
const OWN = 'For a name of your own design, leave it and add no line for it.';
const ELSEWHERE = (list) => `These names are not printed on the page you cite for them: ${list}. For each platform name, add one line that starts "Correction:" and cites a page that prints it (docs lookup finds one). ${OWN}`;
const ABSENT = (list) => `No corpus page prints ${list}. For each platform name, say in a line that starts "Correction:" that the corpus does not document it. ${OWN}`;
/** Once, after the last names clause. */
const NOT_AGAIN = 'Do not repeat the answer.';
const BOTH = ['citedUnread', 'unsupportedName'];

/** The install's two pages, with the text that the cases need: alpha prints sn_bom_claim and the label "assignment group", beta prints sysrule_assignment. */
function pages(i) {
  writeFileSync(join(i.corpus, PAGE.alpha), 'Assignment rules route a claim.\nThe assignment group field is set.\nThe table sn\\_bom\\_claim holds the claim.\n');
  writeFileSync(join(i.corpus, PAGE.beta), 'The sysrule\\_assignment table holds the rules.\n');
}
const run = (t, message, { blocking = ['unsupportedName'], seams = {}, ...rest } = {}) =>
  stop(t, { rows: [], message, seams: { loadIndex: () => INDEX, ...seams, options: { blocking, ...seams.options } }, ...rest });
const cite = (page) => `(citation: ${page})`;

withInstall('ARC-09-C291 hook — a name that the cited page prints is not asked about; one it does not is, ELSEWHERE or ABSENT, in the ask\'s own words', async (t, i) => {
  pages(i);
  silent(await run(t, `The \`sn_bom_claim\` table holds the claim ${cite(PAGE.alpha)}.`), 'a name that the page prints');
  silent(await run(t, `The \`sn\\_bom\\_claim\` table, escaped ${cite(PAGE.alpha)}.`), 'the escaped form');
  silent(await run(t, `Set the \`assignment_group\` ${cite(PAGE.alpha)}.`), 'the page prints the label only');
  const elsewhere = await run(t, `The \`sysrule_assignment\` table holds the rules ${cite(PAGE.alpha)}.`);
  asked(elsewhere, '`sysrule_assignment`', PAGE.alpha);
  assert.ok(elsewhere.reason.includes(`${ELSEWHERE(`\`sysrule_assignment\` (${PAGE.alpha})`)} ${NOT_AGAIN}`), elsewhere.reason);
  assert.ok(elsewhere.reason.startsWith('Before this answer stands, check these against the corpus; there is no page limit.'), elsewhere.reason);
  const absent = await run(t, `The \`fso_claim_score\` field is computed ${cite(PAGE.alpha)}.`);
  asked(absent, '`fso_claim_score`');
  assert.ok(absent.reason.includes(`${ABSENT('`fso_claim_score`')} ${NOT_AGAIN}`), absent.reason);
});

withInstall('ARC-09-C291 hook — a hedged line, an anti-pattern line and the prefixes u_, x_ and snow_ are never asked about', async (t, i) => {
  pages(i);
  for (const line of [
    `The page does not mention \`sysrule_assignment\` ${cite(PAGE.alpha)}.`, `\`sysrule_assignment\` is not documented ${cite(PAGE.alpha)}.`,
    `- Don't use \`sysrule_assignment\` ${cite(PAGE.alpha)}.`, `1. Never write \`sysrule_assignment\` ${cite(PAGE.alpha)}.`,
    `Use \`u_claim_score\`, \`x_acme_claims_score\` and \`snow_core_records_query\` ${cite(PAGE.alpha)}.`,
  ]) silent(await run(t, line), line);
});

withInstall('ARC-09-C291 hook — a bare file name that names one page is checked, and the ask names the page in full', async (t, i) => {
  pages(i);
  const d = await run(t, 'The `sysrule_assignment` table is in c_Alpha.md.');
  asked(d, '`sysrule_assignment`', PAGE.alpha);
  silent(await run(t, 'The `sn_bom_claim` table is in c_Alpha.md.'), 'a name that the page prints, cited by its bare name');
  // no backtick and no corpus path anywhere in the reply: the hook's cheap gate still lets a bare file name through
  asked(await run(t, 'The table sysrule_assignment is described in c_Alpha.md.'), 'sysrule_assignment', PAGE.alpha);
});

withInstall('ARC-09-C291 hook — beside a never-opened page there is one ask with both lists, and the continuation says nothing about a name', async (t, i) => {
  pages(i);
  const reply = `The rule is in ${cite(PAGE.alpha)}.\nThe \`sysrule_assignment\` table ${cite(PAGE.alpha)}.`;
  const d = await run(t, reply, { blocking: BOTH });
  asked(d, PAGE.alpha, '`sysrule_assignment`');
  assert.ok(d.reason.includes('You cited pages that this session never opened:'), d.reason);
  assert.ok(d.reason.includes(`${ELSEWHERE(`\`sysrule_assignment\` (${PAGE.alpha})`)} ${NOT_AGAIN}`), d.reason);
  assert.equal(d.reason.split(NOT_AGAIN).length, 2, 'the closing sentence once');
  assert.equal(d.reason.split('Before this answer stands').length, 2, 'one lead');
  assert.equal(d.reason.split('Then add one line for each').length, 2, 'one tail');
  assert.ok(d.reason.indexOf('never opened') < d.reason.indexOf('These names are not printed'), 'the never-opened list first');
  // a names-only ask, then the continuation: no second ask and no notice for the name, whether it stays or a new one appears
  const only = await run(t, `The \`sysrule_assignment\` table ${cite(PAGE.alpha)}.`);
  asked(only, '`sysrule_assignment`');
  const feedback = U(`Stop hook feedback:\n${only.reason}`, { isMeta: true });
  const next = (line) => stop(t, { rows: [text('first'), feedback, text(line)], message: line, input: { stop_hook_active: true }, seams: { loadIndex: () => INDEX, options: { blocking: ['unsupportedName'] } } });
  silent(await next(`Still \`sysrule_assignment\` ${cite(PAGE.alpha)}.`), 'the name stays');
  silent(await next(`Now \`fso_claim_score\` ${cite(PAGE.alpha)}.`), 'a name that first appears in the continuation');
});

withInstall('ARC-09-C291 hook — past the deadline nothing is asked, and the debug line says so', async (t, i) => {
  pages(i);
  const lines = [];
  const slow = (page) => { const end = Date.now() + 250; while (Date.now() < end); return normalisePage(page.includes('c_Alpha') ? 'nothing here' : 'x'); };
  const d = await run(t, `The \`sysrule_assignment\` table ${cite(PAGE.alpha)}.`, { seams: { debug: (l) => lines.push(l), deadlineMs: 120, options: { pageNorm: slow } } });
  silent(d, 'the check passed its deadline');
  assert.ok(lines.some((l) => /deadline/.test(l)), lines.join('\n'));
  // the same input within the deadline asks, so the silence above is the deadline's
  asked(await run(t, `The \`sysrule_assignment\` table ${cite(PAGE.alpha)}.`, { seams: { options: { pageNorm: slow }, deadlineMs: 5000 } }), '`sysrule_assignment`');
});

withInstall('ARC-09-C291 hook — a Windows path is a citation, and an escaped name beside it is read as the page writes it', async (t, i) => {
  pages(i);
  const win = PAGE.alpha.replaceAll('/', '\\');
  silent(await run(t, `The \`sn\\_bom\\_claim\` table (citation: ${win}).`), 'a supported name, a back-slashed path and an escaped underscore');
  const d = await run(t, `The \`sysrule_assignment\` table (citation: ${win}).`);
  asked(d, '`sysrule_assignment`', PAGE.alpha);
});

withInstall('ARC-09-C291 hook — as shipped, the class is on: the classes file names it beside citedUnread', async (t, i) => {
  pages(i);
  const d = await stop(t, { rows: [], message: `The \`sysrule_assignment\` table ${cite(PAGE.alpha)}.`, shipped: true, seams: { loadIndex: () => INDEX } });
  asked(d, '`sysrule_assignment`');
});
