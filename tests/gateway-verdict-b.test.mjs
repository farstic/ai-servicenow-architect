// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C204 — one definition of Verdict B, the same words in every gateway's verdict table, and governance §1.1's.
//
// Measured before the change (clean installs of v2.2.2, N=5 each): ITSM-P1 read A 3 times and B twice, ITSM-DL1 read A 4
// times of 5.
// The B row said "Baseline covers the need only with a baseline EXTENSION — configuration of an existing object, not a
// new one" in five gateways, while each one's Part 3 and Part 4 filed configuration records under A. A run that leaned on
// the row said B for a scripted assignment rule; one that leaned on Part 4 said A. And ITSM's Part 3 ladder put new
// tables under B, where governance §1.1 makes every new table a custom object, which is Verdict C. B is now a new field
// on a baseline table and nothing else, word for word in every table, so the gateways cannot drift apart again. A
// configuration record is A, unless it is itself a §1.1 object (a state value, an alias, a group structure, an item on the
// skill's own §1.1 list), so the row does not override the list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { gatewayDirs } from './lib/gateways.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The verdict table's B row, as every gateway with a "When it applies" column carries it. */
const B_ROW = '| **Verdict B** (requires baseline extension) | Baseline covers the need only by adding a field to a '
  + 'baseline table. A configuration record on an existing table (an assignment rule, rows of an existing data '
  + 'lookup, a business rule, a notification, an ACL rule, a changed attribute of an existing dictionary entry) '
  + 'is Verdict A, its script included, unless the record is itself a §1.1 object: a new state value, a '
  + 'Connection & Credential Alias, a new sys_user_group structure, or an item on this skill\'s §1.1 list. A new '
  + 'table, one that extends a baseline table included, is a custom object: Verdict C (governance §1.1). | '
  + 'Citations **required** — must cite the baseline construct being extended |';

/** A rung of governance §1.1's custom-object hierarchy, which belongs under Verdict C and never under B. */
const TABLE_RUNG = /extension of (?:a )?baseline table|extension in (?:a )?pre-existing scoped app|top-level table|table extending|table that extends|extends a baseline table/i;

/** A configuration record, which is Verdict A. */
const CONFIGURATION_RECORD = /service definition|flow|playbook|decision-table|document list|record producer/i;

const skill = (dir) => readFileSync(join(ROOT, '.claude/skills', dir, 'SKILL.md'), 'utf8');

/** `## Part 3 …` to the next `## ` heading, and within it `### Verdict B …` to the next heading, or the whole Part 3. */
function part3VerdictB(text) {
  const lines = text.split('\n');
  const from = lines.findIndex((l) => l.startsWith('## Part 3'));
  if (from < 0) return null;
  let to = lines.findIndex((l, i) => i > from && l.startsWith('## '));
  if (to < 0) to = lines.length;
  const part3 = lines.slice(from, to);
  const b = part3.findIndex((l) => l.startsWith('### Verdict B'));
  if (b < 0) return part3.join('\n');
  const next = part3.findIndex((l, i) => i > b && /^#{2,3} /.test(l));
  return part3.slice(b, next < 0 ? part3.length : next).join('\n');
}

test('ARC-09-C204 — every gateway with a "When it applies" column defines Verdict B in the same words', () => {
  const dirs = gatewayDirs(ROOT);
  assert.ok(dirs.length >= 6, `${dirs.length} gateways found`);
  const rows = new Map();
  for (const dir of dirs) {
    const b = skill(dir).split('\n').filter((l) => l.startsWith('| **Verdict B** '));
    assert.equal(b.length, 1, `${dir}: ${b.length} Verdict B rows in its verdict table`);
    rows.set(dir, b[0]);
  }
  // A two-column table (verdict, citation discipline) has no definition to agree with; FSO's is one.
  const defining = [...rows].filter(([, row]) => row.split(' | ').length >= 3);
  assert.ok(defining.length >= 5, `${defining.length} gateways define Verdict B in their table`);
  for (const [dir, row] of defining) assert.equal(row, B_ROW, `${dir}: its Verdict B row is not the shared definition`);
});

test('ARC-09-C204 — no gateway\'s Part 3 puts a table under Verdict B, and FSO\'s names no configuration record there', () => {
  const dirs = gatewayDirs(ROOT);
  let read = 0;
  for (const dir of dirs) {
    const b = part3VerdictB(skill(dir));
    assert.ok(b, `${dir}: no Part 3`);
    read += 1;
    assert.doesNotMatch(b, TABLE_RUNG, `${dir}: its Part 3 lists a table under Verdict B:\n${b}`);
  }
  assert.ok(read >= 6, `${read} gateways' Part 3 read`);
  const fso = part3VerdictB(skill('fso-insurance-specialist'));
  assert.match(fso, /^### Verdict B/, 'FSO has no Part 3 Verdict B heading to hold');
  assert.doesNotMatch(fso, CONFIGURATION_RECORD, `FSO's Part 3 lists a configuration record under Verdict B:\n${fso}`);
  assert.doesNotMatch(fso, /\bnew table\b/i, `FSO's Part 3 lists a table under Verdict B:\n${fso}`);
});

/** The halt's items 2–4, which belong to Verdict C's custom-object proposal and never to a Verdict B example. */
const HALT_ITEM = /Custom object proposed|Consequences of approval|Alternatives if rejected|CUSTOM OBJECT PROPOSAL/;

test('ARC-09-C204 — no gateway\'s Verdict B example carries the halt\'s items 2–4', () => {
  let read = 0;
  for (const dir of gatewayDirs(ROOT)) {
    let text;
    try { text = readFileSync(join(ROOT, '.claude/skills', dir, 'EXAMPLES.md'), 'utf8'); } catch { continue; }
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      if (!lines[i].startsWith('## Example') || !/Verdict B/.test(lines[i])) continue;
      const next = lines.findIndex((l, k) => k > i && l.startsWith('## Example'));
      const section = lines.slice(i, next < 0 ? lines.length : next).join('\n');
      read += 1;
      assert.doesNotMatch(section, HALT_ITEM, `${dir}/EXAMPLES.md: its Verdict B example carries a halt item (${lines[i]})`);
    }
  }
  assert.ok(read >= 5, `${read} Verdict B examples read`);
});

test('ARC-09-C204 — no §1.1 hot spot gives two letters', () => {
  let read = 0;
  for (const dir of gatewayDirs(ROOT)) {
    const lines = skill(dir).split('\n');
    const from = lines.findIndex((l) => l.startsWith('## §1.1 Hot Spots'));
    if (from < 0) continue;
    const to = lines.findIndex((l, k) => k > from && l.startsWith('## '));
    const section = lines.slice(from, to < 0 ? lines.length : to).join('\n');
    read += 1;
    assert.doesNotMatch(section, /\bA ?(?:\/|or) ?B\b/, `${dir}: a §1.1 hot spot gives two letters`);
  }
  assert.ok(read >= 6, `${read} gateways' hot spots read`);
});

/** `## Part 4 …` to the next `## ` heading. */
function part4(text) {
  const lines = text.split('\n');
  const from = lines.findIndex((l) => l.startsWith('## Part 4'));
  if (from < 0) return null;
  const to = lines.findIndex((l, i) => i > from && l.startsWith('## '));
  return lines.slice(from, to < 0 ? lines.length : to).join('\n');
}

/** Each letter's recommendation, which a Part 4 states on the line that names the letter. */
const PART4 = [
  ['A', 'PROCEED — baseline configuration only', 'No Technical Designer needed'],
  ['B', 'PROCEED — dispatch to Technical Designer with constraints', null],
  ['C', 'HALT — §1.1 custom-object proposal required', null],
];

test('ARC-09-C204 — every gateway\'s Part 4 routes each letter, and Verdict A to no Technical Designer', () => {
  // Measured in the AFTER sitting on #503: FSO's and CSM's Part 4 named "baseline configuration only" and "dispatch to
  // Technical Designer" with no letter, and 3 of the 4 FSO and CSM runs proposed the Technical Designer on a Verdict A,
  // configuration-only answer. Under v2.2.2 that routing went with B. A configuration record is A now, so Part 4 says
  // which letter each recommendation answers.
  const failures = [];
  let read = 0;
  for (const dir of gatewayDirs(ROOT)) {
    const p4 = part4(skill(dir));
    if (!p4) { failures.push(`${dir}: no Part 4`); continue; }
    read += 1;
    const lines = p4.split('\n');
    for (const [letter, recommendation, also] of PART4) {
      const named = lines.filter((l) => new RegExp(`\\bVerdict ${letter}\\b`).test(l) && l.includes(recommendation));
      if (named.length !== 1) failures.push(`${dir}: its Part 4 does not route Verdict ${letter} to "${recommendation}"`);
      else if (also && !named[0].includes(also)) failures.push(`${dir}: its Part 4 Verdict ${letter} line does not say "${also}"`);
    }
    if (lines.some((l) => /\bVerdict A\b/.test(l) && /dispatch to Technical Designer/.test(l))) {
      failures.push(`${dir}: its Part 4 sends Verdict A to the Technical Designer`);
    }
  }
  assert.deepEqual(failures, [], failures.join('\n'));
  assert.ok(read >= 6, `${read} gateways' Part 4 read`);
});
