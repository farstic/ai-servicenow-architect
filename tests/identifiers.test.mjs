// ARC-09-C81 — the roster's identifiers against the bundled corpus. Every outcome the check allows
// is planted here once on each side: the excuse that holds, and the same shape that must fail.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';
import {
  MARKER, PLATFORM_PREFIXES, PROPOSED, REASONS, checkAllowList, corpusIndex, formatIdentifiers, readAllowList,
  scanRoster, verifyIdentifiers,
} from '../tools/snowarch/lib/docs/identifiers.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CORPUS = join(ROOT, 'vendor', 'ServiceNowDocs');
const HAS_CORPUS = existsSync(join(CORPUS, 'markdown'));

// The allow-list's size by reason. A change here is a decision about the roster, made in review.
const EXPECTED = { 'example-field': 13, 'payload-key': 22, 'example-role': 3, 'script-variable': 5, 'example-name': 46 };
// The excuses the real roster rests on, by kind (sites), and the absent names written only in capitals
// or in mixed case. A new member of either is a decision made in review, as a new allow-list entry is:
// the marker covers its whole line, and a platform name retyped in capitals is never looked at.
const EXCUSES = { tool: 6, marker: 7, proposed: 4, glob: 5, glued: 1, placeholder: 4 };
const CAPITALS = {
  constant: ['AT_RISK', 'BODY_SHA256', 'CMDB_WRITE', 'FLAG_DEPENDENCY_VIOLATION', 'GET_TICKET', 'NOW_ASSIST',
    'POST_CLOSE_TICKET', 'POST_TICKET', 'PRESET_FLAGS_MISMATCH', 'PUT_TICKET', 'REST_OUT', 'WAR_ROOM'],
  mixed: ['Discovery_Custom', 'System_Ext'],
};
const kinds = (r) => r.excused.reduce((a, e) => (e.by === 'allow-list' ? a : { ...a, [e.by]: (a[e.by] ?? 0) + 1 }), {});

// A fixture corpus small enough to read: two `cmdb_ci_cloud_` names (a family), one `cmdb_ci_lone_`
// name (a family of one), five `sn_demo.` names (a namespace), a glued label, and the tables a
// field is written on.
const PAGE = [
  'The Incident [incident] table and the Users [sys_user] table.',
  'Cloud classes: cmdb_ci_cloud_database and cmdb_ci_cloud_vm. One lone class: cmdb_ci_lone_thing.',
  'Roles: sn_demo.admin, sn_demo.agent, sn_demo.viewer, sn_demo.writer, sn_demo.reader.',
  'Plugin com.snc.real_plugin is required.',
  'SIU Tasksn\\_demo\\_siu\\_task — Stores tasks.',
  'Also present: present_plain_name, incident_state and sys_audit.',
].join('\n');
const PREFIXES = ['sn', 'sys', 'cmdb', 'incident'];
const TOOLS = new Set(['snow_core_capabilities_read']);

function fixture(t, skill, { corpus = PAGE, other = null } = {}) {
  const dir = tempDir('c81-ids-', t);
  mkdirSync(join(dir, '.claude', 'skills', 'fx'), { recursive: true });
  writeFileSync(join(dir, '.claude', 'skills', 'fx', 'SKILL.md'), skill);
  if (other !== null) {
    mkdirSync(join(dir, '.claude', 'skills', 'fy'), { recursive: true });
    writeFileSync(join(dir, '.claude', 'skills', 'fy', 'SKILL.md'), other);
  }
  if (corpus !== null) {
    mkdirSync(join(dir, 'vendor', 'ServiceNowDocs', 'markdown', 'area'), { recursive: true });
    writeFileSync(join(dir, 'vendor', 'ServiceNowDocs', 'markdown', 'area', 'page.md'), corpus);
  }
  return dir;
}
const FILE = '.claude/skills/fx/SKILL.md';
const run = (root, opts = {}) => verifyIdentifiers({ root, tools: TOOLS, prefixes: PREFIXES, allow: [], glued: [], ...opts });
const names = (r) => r.unexcused.map((u) => u.identifier);

test('a name the corpus has passes; a platform-prefixed name it lacks fails, whatever else is on the line', (t) => {
  const r = run(fixture(t, 'Use `sys_user` and `sn_invented_table`.\n'));
  assert.deepEqual(names(r), ['sn_invented_table']);
  assert.match(formatIdentifiers(r).text, /^UNEXCUSED \.claude\/skills\/fx\/SKILL\.md:1 sn_invented_table — platform-prefixed/m);
  assert.equal(formatIdentifiers(r).code, 1);
});

test('tier 1: the marker on the line and a contract tool pass; the marker on another line does not', (t) => {
  const ok = run(fixture(t, `Use \`sn_cone_silent\` (${MARKER}).\nCall \`snow_core_capabilities_read\`.\n`));
  assert.deepEqual(names(ok), []);
  const bad = run(fixture(t, `Use \`sn_cone_silent\`.\n(${MARKER})\n`));
  assert.deepEqual(names(bad), ['sn_cone_silent']);
  // The marker covers its line, so a second name rides along; the trace shows it, and the real-tree
  // test holds the count of marker sites.
  const two = run(fixture(t, `Use \`sn_cone_silent\` and \`sn_ride_along\` (${MARKER}).\n`));
  assert.deepEqual(two.excused.filter((e) => e.by === 'marker').map((e) => e.identifier), ['sn_cone_silent', 'sn_ride_along']);
});

test('capitalised and mixed-case absent names are listed by spelling, not looked at as platform claims', (t) => {
  const r = run(fixture(t, 'Flags `SN_DEMO_SHOUTED` and `Sn_Demo_Mixed`, and the corpus name `SYS_USER`.\n'));
  assert.deepEqual(names(r), []);
  assert.deepEqual(r.capitals, { constant: ['SN_DEMO_SHOUTED'], mixed: ['Sn_Demo_Mixed'] });
});

test('tier 1: a name declared PROPOSED once covers its file; no phrase, no pass', (t) => {
  const declared = `Proposed table: \`sn_demo_new_table\` (${PROPOSED}).\nIts columns live on \`sn_demo_new_table\`.\n`;
  const r = run(fixture(t, declared, { other: 'Elsewhere: `sn_demo_new_table`.\n' }));
  assert.deepEqual(r.unexcused.map((u) => `${u.file}:${u.line} ${u.identifier}`), ['.claude/skills/fy/SKILL.md:1 sn_demo_new_table'],
    'the declaration covers its own file and no other');
  assert.deepEqual(names(run(fixture(t, 'Proposed table: `sn_demo_new_table` (proposed).\n'))), ['sn_demo_new_table'], 'the phrase is exact');
  // It declares the name it is attached to, and no other name on its line.
  const after = run(fixture(t, `Proposed: \`sn_demo_new_table\` (${PROPOSED}; supersedes \`sn_demo_wrong_table\`).\n`));
  assert.deepEqual(names(after), ['sn_demo_wrong_table']);
  const before = run(fixture(t, `\`sn_demo_wrong_table\` is replaced by \`sn_demo_new_table\` (${PROPOSED}).\n`));
  assert.deepEqual(names(before), ['sn_demo_wrong_table']);
});

test('an example-field entry may name a table its file declares PROPOSED, and no other platform table', (t) => {
  const dir = fixture(t, `Proposed table: \`sn_demo_new_table\` (${PROPOSED}), with \`new_column\`; see also \`sn_demo_other\`.\n`);
  const entry = (table) => ({ file: FILE, identifier: 'new_column', reason: 'example-field', table });
  assert.deepEqual(run(dir, { allow: [entry('sn_demo_new_table')] }).allowErrors, []);
  assert.match(run(dir, { allow: [entry('sn_demo_unknown')] }).allowErrors[0].why, /declared proposed in that file/);
});

test('tier 1 has no allow-list: an entry for a platform-prefixed name is itself an error', (t) => {
  const dir = fixture(t, 'Use `sn_invented_table`.\n');
  const r = run(dir, { allow: [{ file: FILE, identifier: 'sn_invented_table', reason: 'example-name' }] });
  assert.deepEqual(names(r), ['sn_invented_table']);
  assert.match(r.allowErrors[0].why, /platform-prefixed name has no allow-list/);
});

test('tier 2: each of the five reasons excuses its name, and an unlisted one fails', (t) => {
  const dir = fixture(t, [
    'The `x_acme_app_ledger` table has `ledger_status`.',
    'The payload carries `order_ref`; the example role is `gsc_operator`.',
    '```javascript\nvar row_count = 0;\n```',
    'The index is `idx_ledger_status`; also `unlisted_name`.',
  ].join('\n'));
  const allow = [
    { file: FILE, identifier: 'ledger_status', reason: 'example-field', table: 'x_acme_app_ledger' },
    { file: FILE, identifier: 'order_ref', reason: 'payload-key' },
    { file: FILE, identifier: 'gsc_operator', reason: 'example-role' },
    { file: FILE, identifier: 'row_count', reason: 'script-variable' },
    { file: FILE, identifier: 'idx_ledger_status', reason: 'example-name' },
  ];
  assert.deepEqual(Object.keys(REASONS).sort(), [...new Set(allow.map((e) => e.reason))].sort(), 'one plant per reason');
  const r = run(dir, { allow });
  assert.deepEqual(names(r), ['unlisted_name']);
  assert.deepEqual(r.allowErrors, []);
});

test('an example-field entry names an x_/u_ table that its file writes', (t) => {
  const dir = fixture(t, 'The `x_acme_app_ledger` table has `ledger_status`.\n');
  const errs = (table) => run(dir, { allow: [{ file: FILE, identifier: 'ledger_status', reason: 'example-field', ...(table ? { table } : {}) }] })
    .allowErrors.map((e) => e.why);
  assert.deepEqual(errs('x_acme_app_ledger'), []);
  assert.match(errs(null)[0], /names the example's own table/);
  assert.match(errs('incident')[0], /names the example's own table/);
  assert.match(errs('x_acme_other_table')[0], /does not write the table x_acme_other_table/);
});

test('rule 4: a field written on a corpus name takes no example reason, even an example-field entry', (t) => {
  const dir = fixture(t, 'The flag `incident.assigned_late` and `x_acme_app_ledger`.\n');
  const allow = [{ file: FILE, identifier: 'assigned_late', reason: 'example-field', table: 'x_acme_app_ledger' }];
  const r = run(dir, { allow });
  assert.deepEqual(names(r), ['assigned_late']);
  assert.match(r.unexcused[0].why, /written on incident/);
  assert.deepEqual(names(run(fixture(t, `The flag \`incident.assigned_late\` (${MARKER}).\n`))), [], 'the marker answers it');
  assert.deepEqual(names(run(fixture(t, 'The flag `incident.u_assigned_late`.\n'))), [], 'a custom field is custom');
});

test('qualified names are looked up whole: a wrong com. id fails; x_ and placeholder names are custom as a whole', (t) => {
  assert.deepEqual(names(run(fixture(t, 'Activate `com.snc.real_plugin`.\n'))), []);
  assert.deepEqual(names(run(fixture(t, 'Activate `com.snc.wrong_plugin`.\n'))), ['com.snc.wrong_plugin']);
  assert.deepEqual(names(run(fixture(t, 'Give `sn_demo.agent`.\n'))), []);
  assert.deepEqual(names(run(fixture(t, 'Give `sn_demo.ghost_role`.\n'))), ['sn_demo.ghost_role'], 'both halves may exist; the pair does not');
  assert.deepEqual(names(run(fixture(t, 'Set `x_acme_app.some_property_name`.\n'))), []);
  assert.deepEqual(names(run(fixture(t, 'Scoped: `x_<vendor>_<app>_business_severity`.\n'))), [], 'adjacent to the placeholder');
  assert.deepEqual(names(run(fixture(t, 'Scoped: `x_<vendor>_<app>_x` and later `business_severity`.\n'))), ['business_severity'],
    'a bare fragment elsewhere needs its own excuse');
});

test('a <stem>_* glob passes over a family of two or more; a family of one, none, or a bare stem fails', (t) => {
  assert.deepEqual(names(run(fixture(t, 'The `cmdb_ci_cloud_*` classes.\n'))), []);
  assert.deepEqual(names(run(fixture(t, 'The `cmdb_ci_lone_*` classes.\n'))), ['cmdb_ci_lone_*'], 'a family of one is a name');
  assert.deepEqual(names(run(fixture(t, 'The `cmdb_ci_ghost_*` classes.\n'))), ['cmdb_ci_ghost_*'], 'an empty family');
  assert.deepEqual(names(run(fixture(t, 'The `cmdb_ci_cloud` classes.\n'))), ['cmdb_ci_cloud'], 'the asterisk must be at the site');
});

test('a declared glued name passes while the page prints it glued, and is stale once it does not', (t) => {
  const glued = [{ identifier: 'sn_demo_siu_task', glued: 'tasksn_demo_siu_task', page: 'markdown/area/page.md' }];
  const ok = run(fixture(t, 'Table `sn_demo_siu_task`.\n'), { glued });
  assert.deepEqual([names(ok), ok.stale], [[], []]);
  const fixed = run(fixture(t, 'Table `sn_demo_siu_task`.\n', { corpus: PAGE.replace('Tasksn\\_demo', 'Task sn\\_demo') }), { glued });
  assert.deepEqual(names(fixed), [], 'upstream un-glued it: the name is now found');
  assert.match(fixed.stale[0].why, /corpus has the name itself now/);
  const gone = run(fixture(t, 'Table `sn_demo_siu_task`.\n', { corpus: PAGE.replace(/SIU Task.*\n/, '') }), { glued });
  assert.deepEqual(names(gone), ['sn_demo_siu_task']);
  assert.match(gone.stale[0].why, /no longer prints "tasksn_demo_siu_task"/);
});

test('an allow-listed name the corpus has is stale, and so is a declared prefix that begins no corpus name', (t) => {
  const r = run(fixture(t, 'Use `present_plain_name` and `ordinary_name`.\n'),
    { allow: [{ file: FILE, identifier: 'ordinary_name', reason: 'example-name' }, { file: FILE, identifier: 'present_plain_name', reason: 'example-name' }] });
  assert.deepEqual(r.stale.map((x) => x.identifier), ['present_plain_name']);
  assert.match(r.stale[0].why, /corpus has this name/);
  const p = run(fixture(t, 'Nothing here.\n'), { prefixes: [...PREFIXES, 'zzz'] });
  assert.deepEqual(p.deadPrefixes, ['zzz']);
  assert.match(formatIdentifiers(p).text, /^PREFIX zzz — begins no corpus name/m);
});

test('with no corpus the check examines nothing, says so, and still checks the allow-list against the roster', (t) => {
  const dir = fixture(t, 'Use `sn_invented_table`.\n', { corpus: null });
  const r = run(dir, { allow: [{ file: FILE, identifier: 'not_written_here', reason: 'example-name' }] });
  assert.equal(r.status, 'missing');
  assert.equal(r.checked, 0);
  assert.deepEqual(r.unexcused, []);
  const { text, code } = formatIdentifiers(r);
  assert.match(text, /identifiers: examined nothing — the corpus is absent/);
  assert.match(text, /^ALLOW \.claude\/skills\/fx\/SKILL\.md not_written_here — the file does not write this name/m);
  assert.equal(code, 1);
});

test('every excuse is reported with its kind and its site', (t) => {
  const dir = fixture(t, [
    'Call `snow_core_capabilities_read`.',
    `Use \`sn_cone_silent\` (${MARKER}).`,
    'The `cmdb_ci_cloud_*` classes.',
    'Table `sn_demo_siu_task`.',
    `Proposed table: \`sn_demo_new_table\` (${PROPOSED}).`,
    'Scoped: `x_<vendor>_<app>_business_severity`.',
    'Example index `idx_ledger_status`.',
  ].join('\n'));
  const r = run(dir, {
    glued: [{ identifier: 'sn_demo_siu_task', glued: 'tasksn_demo_siu_task', page: 'markdown/area/page.md' }],
    allow: [{ file: FILE, identifier: 'idx_ledger_status', reason: 'example-name' }],
  });
  assert.deepEqual(r.unexcused, []);
  assert.deepEqual(r.excused.map((e) => `${e.line} ${e.by} ${e.identifier}`).sort(), [
    '1 tool snow_core_capabilities_read', '2 marker sn_cone_silent', '3 glob cmdb_ci_cloud_*', '4 glued sn_demo_siu_task',
    '5 proposed sn_demo_new_table', '6 placeholder business_severity', '7 allow-list idx_ledger_status',
  ]);
});

test('the real allow-list holds against the real roster, on every cell, with the corpus or without it', () => {
  const { allow, glued } = readAllowList();
  assert.deepEqual(checkAllowList(allow, scanRoster(ROOT), { glued }), []);
  const counts = Object.fromEntries(Object.keys(REASONS).map((k) => [k, allow.filter((e) => e.reason === k).length]));
  assert.deepEqual(counts, EXPECTED);
  assert.equal(allow.length, Object.values(EXPECTED).reduce((a, b) => a + b, 0));
});

let realIndex;
const realIndexOnce = () => (realIndex ??= corpusIndex(CORPUS, {
  words: new Set([...scanRoster(ROOT).tokens.values()].flatMap((t) => t.sites.map((s) => s.on)).filter((w) => w && !w.includes('_'))),
}));

test('the real roster against the bundled corpus: nothing unexcused, nothing stale, every prefix live', () => {
  const r = verifyIdentifiers({ root: ROOT, ...(HAS_CORPUS ? { index: realIndexOnce() } : {}) });
  if (!HAS_CORPUS) {
    // A cell without the corpus examines nothing and must say so; CI's release rehearsal runs the
    // real check through `docs verify` after it syncs the corpus.
    assert.equal(r.status, 'missing');
    assert.match(formatIdentifiers(r).text, /examined nothing/);
    return;
  }
  assert.deepEqual(r.unexcused, []);
  assert.deepEqual(r.stale, []);
  assert.deepEqual(r.deadPrefixes, []);
  assert.equal(r.status, 'ok');
  assert.match(formatIdentifiers(r).text, /^identifiers: checked \d+ \| unexcused 0$/m);
  assert.equal(PLATFORM_PREFIXES.length, 36);
  assert.deepEqual(kinds(r), EXCUSES);
  assert.deepEqual(r.capitals, CAPITALS);
});

test('a ride-along on a marker line, and a platform name retyped in capitals, each move what the real-tree test holds', (t) => {
  if (!HAS_CORPUS) { t.skip('the plant needs the bundled corpus; this cell has none'); return; }
  const dir = tempDir('c81-ride-', t);
  cpSync(join(ROOT, '.claude'), join(dir, '.claude'), { recursive: true });
  const hr = join(dir, '.claude', 'skills', 'hrsd-specialist', 'SKILL.md');
  const text = readFileSync(hr, 'utf8');
  assert.ok(text.includes('- `employment_status` (Choice'), 'the marker line this plant edits');
  writeFileSync(hr, text.replace('- `employment_status` (Choice', '- `employment_status` and `sn_hr_core_wrong_table_y` (Choice'));
  const csm = join(dir, '.claude', 'skills', 'csm-specialist', 'SKILL.md');
  writeFileSync(csm, `${readFileSync(csm, 'utf8')}\nAlso \`SN_CUSTOMERSERVICE_CONTRACT\` and \`Sn_Entitlement_Condition\`.\n`);
  const r = verifyIdentifiers({ root: dir, corpusDir: CORPUS, index: realIndexOnce() });
  assert.deepEqual(r.unexcused, [], 'the guard alone lets all three through');
  assert.deepEqual(kinds(r), { ...EXCUSES, marker: EXCUSES.marker + 1 }, 'the ride-along is one more marker site');
  assert.deepEqual(r.capitals, {
    constant: [...CAPITALS.constant, 'SN_CUSTOMERSERVICE_CONTRACT'].sort(),
    mixed: [...CAPITALS.mixed, 'Sn_Entitlement_Condition'].sort(),
  });
});

test('the regression this guards: `sn_customerservice_contract` back in the CSM skill fails', (t) => {
  if (!HAS_CORPUS) { t.skip('the plant needs the bundled corpus; this cell has none'); return; }
  const dir = tempDir('c81-plant-', t);
  cpSync(join(ROOT, '.claude'), join(dir, '.claude'), { recursive: true });
  const skill = join(dir, '.claude', 'skills', 'csm-specialist', 'SKILL.md');
  writeFileSync(skill, `${readFileSync(skill, 'utf8')}\nContracts live in \`sn_customerservice_contract\`.\n`);
  const r = verifyIdentifiers({ root: dir, corpusDir: CORPUS, index: realIndexOnce() });
  assert.deepEqual(r.unexcused.map((u) => `${u.file} ${u.identifier}`),
    ['.claude/skills/csm-specialist/SKILL.md sn_customerservice_contract']);
});
