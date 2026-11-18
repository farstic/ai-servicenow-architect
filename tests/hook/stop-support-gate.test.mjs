// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C294 — through the Stop hook: an unsupported name beside a bare file name that is written with an escaped underscore (`c\_Alpha.md`) is asked about, as it is beside
 * the plain spelling. The name support check reads such a name and the cue for a bare name in the early gate does not, so the last term of the gate (`supportAt`, any `.md` in
 * a line) is what lets it through; tests/support-gate.test.mjs, the pure function's cases, says why that term is not dead code.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PAGE, asked, silent, stop, withInstall } from '../helpers/lever2.mjs';

const NAMES = { sysrule_assignment: [PAGE.beta], sn_bom_claim: [PAGE.alpha] };
const INDEX = {
  coverage: 'full', meta: { coverage: 'full' }, namespaces: new Map(), pageCount: 4, nameCount: 2,
  has: (n) => Object.hasOwn(NAMES, n), count: (n) => (NAMES[n] ?? []).length, pathsOf: (n) => NAMES[n] ?? [], pagesOf: () => [], both: () => [], nameKeys: () => Object.keys(NAMES).values(),
};
const BOTH = ['citedUnread', 'unsupportedName'];

/** The install's two pages: alpha prints sn_bom_claim, beta prints sysrule_assignment. */
function pages(i) {
  writeFileSync(join(i.corpus, PAGE.alpha), 'Assignment rules route a claim.\nThe table sn\\_bom\\_claim holds the claim.\n');
  writeFileSync(join(i.corpus, PAGE.beta), 'The sysrule\\_assignment table holds the rules.\n');
}
const run = (t, message, { blocking = ['unsupportedName'] } = {}) =>
  stop(t, { rows: [], message, seams: { loadIndex: () => INDEX, options: { blocking } } });

withInstall('ARC-09-C294 hook — an unsupported name beside a bare file name written with an escaped underscore is asked about, as beside the plain spelling', async (t, i) => {
  pages(i);
  asked(await run(t, 'The table sysrule_assignment is described in c_Alpha.md.'), '`sysrule_assignment`', PAGE.alpha);                     // the control: the plain spelling
  asked(await run(t, 'The table sysrule_assignment is described in c\\_Alpha.md.'), '`sysrule_assignment`', PAGE.alpha);
  asked(await run(t, 'The table sysrule\\_assignment is described in c\\_Alpha.md.'), '`sysrule_assignment`', PAGE.alpha);
  asked(await run(t, 'The table sysrule_assignment (citation: c\\_Alpha.md).'), '`sysrule_assignment`', PAGE.alpha);
  asked(await run(t, 'The table sysrule_assignment is described in c\\_Alpha.md.', { blocking: BOTH }), '`sysrule_assignment`', PAGE.alpha);
});

withInstall('ARC-09-C294 hook — a name that the page prints, a page that no corpus file has, and a mention of .md that names no page are not asked about', async (t, i) => {
  pages(i);
  silent(await run(t, 'The `sn_bom_claim` table is in c\\_Alpha.md.'), 'a name that the page prints');
  silent(await run(t, 'The table sysrule_assignment is described in c\\_Missing.md.'), 'no corpus page of that name');
  silent(await run(t, 'Notes are kept in .md files, and the sysrule_assignment table is listed there.'), 'a mention of .md that names no page');
});
