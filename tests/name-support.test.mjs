// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C291 — a cited page must print the name it is cited for: the text rules, on the leaf module (tools/snowarch/lib/docs/name-support.mjs).
 * The architect measured, on the C267 and C287 sittings, that in 27 to 36 % of the answers a line cites a corpus page for a snake_case name that the page does not print. The
 * pure check that uses these rules is tests/citation-support.test.mjs, and the Stop hook's cases are tests/hook/stop-citation-support.test.mjs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_NAMES, constructsOf, isAntiPattern, isHedged, normalisePage, printsConstruct } from '../tools/snowarch/lib/docs/name-support.mjs';

test('ARC-09-C291 — a construct is a lower-case snake_case token with an underscore, read from a line as the model writes it', () => {
  assert.equal(MAX_NAMES, 6);
  assert.deepEqual(constructsOf('The table `sysrule_assignment` and `sc_req_item` are used.'), ['sysrule_assignment', 'sc_req_item']);
  assert.deepEqual(constructsOf('a_b and a_b again, then c_d'), ['a_b', 'c_d'], 'each once, in order');
  assert.deepEqual(constructsOf('(sys_id), sys_user.sys_id; "table_2"'), ['sys_id', 'sys_user', 'table_2'], 'punctuation is no part of a token, and a dotted name is its parts');
  assert.deepEqual(constructsOf('the `sn\\_hr\\_core\\_case` table'), ['sn_hr_core_case'], 'a markdown escape is dropped');
  assert.deepEqual(constructsOf('an _emphasised_name_ here'), ['emphasised_name'], 'edge underscores are markdown emphasis, not the name');
  for (const not of ['incident and task', 'Sys_user, SYS_ID, camelCase_thing', '_', '__init__', '2_fast', 'a__b']) assert.deepEqual(constructsOf(not), [], not);
});

test('ARC-09-C291 — the prefixes snow_, x_ and u_ and a placeholder are never a construct', () => {
  assert.deepEqual(constructsOf('snow_core_records_query, x_acme_app_table, u_custom_field'), []);
  assert.deepEqual(constructsOf('sn_<scope>_table, {table}_name, sys_{id}, incident_<n>_state'), [], 'a token that holds < or { is a placeholder');
  assert.deepEqual(constructsOf('sn_<scope>_table_name and {app}_claim_score and incident_<n>_state_x'), [], 'a placeholder is one run, and not fragments that look like names');
  assert.deepEqual(constructsOf('snow_x and sn_x_y'), ['sn_x_y'], 'sn_ is a platform prefix and stays');
  assert.deepEqual(constructsOf('xx_y and ux_y and snowy_x'), ['xx_y', 'ux_y', 'snowy_x'], 'only the whole prefix counts');
});

test('ARC-09-C291 — a cited path, a file name and a file with an extension are no construct', () => {
  assert.deepEqual(constructsOf('See markdown/area/some_page_name.md and c_Some_page.md and other_notes.md for sys_user'), ['sys_user']);
  assert.deepEqual(constructsOf('run my_script.js then read data_file.json and notes_file.csv, not sys_log'), ['sys_log']);
  assert.deepEqual(constructsOf('run my_script.JS and sys_log'), ['sys_log'], 'an extension in capitals');
  assert.deepEqual(constructsOf('a Windows path markdown\\it-service-management\\c_Alpha.md uses sys_user'), ['sys_user']);
  assert.deepEqual(constructsOf('the glide.ui.foo_bar property'), ['foo_bar'], 'a dotted name is its parts; only a known file extension makes a file');
  assert.deepEqual(constructsOf('a my_host.com'), [], 'a host name is no construct');
  assert.deepEqual(constructsOf('a my_other.example.local'), ['my_other'], 'and an unknown extension makes none');
});

test('ARC-09-C291 — a hedged line says that the corpus does not document it, or that it was not opened', () => {
  const yes = [
    'This is not documented.', 'It is undocumented.', 'The page does not include it.', "The page doesn't mention it.", 'The pages do not list it.', "Pages don't show it.",
    'It does not say.', 'The page does not print it.', 'It does not define it.', 'It does not name it.', 'It does not cover it.', 'It does not document it.', 'It does not contain it.',
    'The page does not explicitly mention it.', 'The page doesn’t mention it.', 'It is not on the page.', 'It is not in this page.', 'Not on that page.', 'It is not in the page.',
    'It is not listed.', "It isn't listed.", 'There is no such table.', 'Unconfirmed.', 'This is unverified.', 'The page was not opened.', "I haven't opened it.", 'I have not opened it.',
    'I did not open it.', "I didn't open it.", 'An Open Question remains.', 'NOT DOCUMENTED in the corpus',
    'Pages don’t show it.', 'It isn’t listed.', 'I haven’t opened it.', 'I didn’t open it.', 'The pages do not say.',
  ];
  for (const line of yes) assert.equal(isHedged(line), true, line);
  const no = ['The page lists the table.', 'The rule does apply.', 'It does not matter.', 'Do not rely on it.', 'The page is not long.', 'No table is named.', 'It is on this page.'];
  for (const line of no) assert.equal(isHedged(line), false, line);
});

test('ARC-09-C291 — an anti-pattern line starts, after bullets, numbers and bold, with Don\'t, Do not, Never or Avoid', () => {
  const yes = ["Don't use `a_b`.", '- Do not rely on `a_b`.', '1. Never write `a_b`.', '**Avoid** `a_b`.', "* **Don't** `a_b`.", '> Never `a_b`.', '  - **Never** `a_b`.', '2) avoid `a_b`', 'DO NOT use `a_b`', '# Avoid `a_b`', '• Never `a_b`', 'Don’t use `a_b`.', '+ Do not `a_b`'];
  for (const line of yes) assert.equal(isAntiPattern(line), true, line);
  const no = ['You should never use `a_b`.', 'Avoiding `a_b` is wise.', 'Neverland has `a_b`.', 'The rule: do not use `a_b`.', '- Use `a_b`.', 'Doing so is fine.'];
  for (const line of no) assert.equal(isAntiPattern(line), false, line);
});

test('ARC-09-C291 — a page prints a name when its text holds it, with escapes dropped, case ignored and spaces normalised, or holds its label', () => {
  const page = normalisePage('The `sn\\_hr\\_core\\_case` table.\n\nAn   ASSIGNMENT\n   Group is set, and SYS_USER_Group too.\n');
  assert.equal(printsConstruct(page, 'sn_hr_core_case'), true, 'the corpus writes \\_');
  assert.equal(printsConstruct(page, 'sys_user_group'), true, 'case ignored');
  assert.equal(printsConstruct(page, 'assignment_group'), true, 'the label: underscores read as spaces, lines joined');
  assert.equal(printsConstruct(page, 'sys_user'), true, 'a name inside a longer one is printed, as a substring');
  assert.equal(printsConstruct(page, 'sysrule_assignment'), false);
  assert.equal(printsConstruct(page, 'incident_state'), false);
  assert.equal(normalisePage('a\\_b \\* c\\[d\\] \\\\e'), 'a_b * c[d] \\e', 'the markdown escapes that the corpus writes');
  assert.equal(normalisePage(null), '');
  assert.equal(normalisePage('\\`\\*\\_\\{\\}\\[\\]\\(\\)\\#\\+\\-\\.\\!\\|\\<\\>\\~'), '`*_{}[]()#+-.!|<>~', 'every markdown escape');
  assert.equal(normalisePage('a\\b \\q'), 'a\\b \\q', 'a back-slash before a letter is a Windows path, and stays');
});
