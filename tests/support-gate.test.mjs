// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C294 — the early gate of groundingFindings, and the one term of it that opens it for the name support check (ARC-09-C291): `supportAt`, any `.md` in a live line.
 *
 * That term looks like dead code since ARC-09-C292 made `cites` take either path separator, and it was thought dead: two mutation controls of ARC-09-C291 survived it, because no
 * test depended on it. It is live. The name support check reads a bare file name after dropping the escape of an underscore (`c\_Alpha.md`), while the cue for a bare name
 * (`bareAt`, ARC-09-C267) reads the line as it stands, as `citedUnread` does; so for such a name no other term opens the gate, and `supportAt` is the only one that does. Taking
 * the term out stops the ask about an unsupported name beside `c\_Alpha.md`: 388 of 421,529 generated runs changed, all of that one case, and not one test noticed. These cases
 * pin it, so that the term can go only together with a gate that reads a bare name as the check does. The Stop hook's cases are tests/hook/stop-support-gate.test.mjs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groundingFindings } from '../tools/snowarch/lib/docs/grounding-check.mjs';
import { normalisePage } from '../tools/snowarch/lib/docs/name-support.mjs';

const ALPHA = 'markdown/it-service-management/c_Alpha.md';         // prints sn_bom_claim
const BETA = 'markdown/it-service-management/c_Beta.md';           // prints sn_ins_policy
const TEXT = { [ALPHA]: 'The sn\\_bom\\_claim table holds the claim.\n', [BETA]: 'The sn\\_ins\\_policy table holds the policies.\n' };
const NAMES = { sn_bom_claim: [ALPHA], sn_ins_policy: [BETA] };
const INDEX = {
  coverage: 'full', meta: { coverage: 'full' }, namespaces: new Map(), pageCount: 2, nameCount: 2,
  has: (n) => Object.hasOwn(NAMES, n), count: (n) => (NAMES[n] ?? []).length, pathsOf: (n) => NAMES[n] ?? [], pagesOf: () => [], both: () => [], nameKeys: () => Object.keys(NAMES).values(),
};
const PAGES = { 'c_Alpha.md': [ALPHA], 'c_Beta.md': [BETA] };
const pagesNamed = (name) => PAGES[name] ?? [];
const pageNorm = (page) => (Object.hasOwn(TEXT, page) ? normalisePage(TEXT[page]) : null);

const check = (reply, { blocking = ['unsupportedName'], askedOnly = true, seam = pagesNamed } = {}) =>
  groundingFindings({ rows: null, reply, index: INDEX, options: { blocking, askedOnly, pagesNamed: seam, pageNorm, pageExists: () => true } });
const items = (r) => r.findings.unsupportedName.map((i) => [i.name, i.where, ...i.pages]);
/** The table that page BETA prints, named beside page ALPHA, which does not: the index has it on the other page. */
const ASKED = [['sn_ins_policy', 'elsewhere', ALPHA]];

test('ARC-09-C294 — an unsupported name beside a bare file name written with an escaped underscore is asked about, as beside the plain spelling', () => {
  const lines = [
    'The table sn_ins_policy is described in c_Alpha.md.',                       // the control: the plain spelling
    'The table sn_ins_policy is described in c\\_Alpha.md.',
    'The table sn\\_ins\\_policy is described in c\\_Alpha.md.',
    'The table sn_ins_policy (citation: c\\_Alpha.md).',
    'The table sn_ins_policy is in `c\\_Alpha.md`.',
    'The `sn_ins_policy` table is in c\\_Alpha.md.',
  ];
  for (const [label, blocking] of [['the class alone', ['unsupportedName']], ['as shipped', ['citedUnread', 'unsupportedName']]]) {
    for (const line of lines) {
      const r = check(line, { blocking });
      assert.deepEqual(items(r), ASKED, `${label}: ${line}`);
      assert.deepEqual(r.blocks, ['unsupportedName'], `${label}: ${line}`);
      assert.ok(r.reasonBody && r.reasonBody.includes('`sn_ins_policy`'), `${label}: ${line}`);
    }
  }
});

test('ARC-09-C294 — every bare file name of the line is read: a name that the second one prints is supported, and a line with no page to name is not asked about', () => {
  assert.deepEqual(items(check('The table sn_ins_policy is described in c\\_Alpha.md and c\\_Beta.md.')), [], 'the second page prints it');
  assert.deepEqual(items(check('The table sn_ins_policy is described in c\\_Alpha.md and c_Beta.md.')), [], 'one escaped and one plain');
  assert.deepEqual(items(check('The table sn_ins_policy is described in x\\_none.md.')), [], 'a name that no page has');
  assert.deepEqual(items(check('The table sn_ins_policy is described in c\\_Alpha.md.', { seam: null })), [], 'no way to name a page');
  assert.deepEqual(items(check('Notes are kept in .md files, and the sn_ins_policy tables are listed there.')), [], 'a mention of .md that names no page');
  assert.deepEqual(items(check('The table sn_bom_claim is described in c\\_Alpha.md.')), [], 'a name that the page prints');
});

test('ARC-09-C294 — a replay or a grader, which computes every class whatever blocks, finds it too; a hook that asks only for another class does not compute it', () => {
  const line = 'The table sn_ins_policy is described in c\\_Alpha.md.';
  const replay = check(line, { blocking: ['citedUnread'], askedOnly: false });
  assert.deepEqual(items(replay), ASKED);
  assert.deepEqual(replay.blocks, [], 'nothing is asked: the class does not block there');
  assert.deepEqual(items(check(line, { blocking: ['citedUnread'] })), [], 'the hook of another class');
  assert.deepEqual(items(check(line, { blocking: ['unsupportedName'], askedOnly: false })), ASKED, 'and asked, with every class computed');
});
