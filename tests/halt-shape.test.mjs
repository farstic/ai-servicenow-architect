// ARC-09-C85 — the §1.1 halt comes before the design, in every example that shows one.
//
// governance/governance-rules.md: a specialist "must halt before designing it", and item 2 of the
// OPEN QUESTION — CUSTOM OBJECT PROPOSAL names the object, its kind, its place in the hierarchy and what
// it would hold. tests/VALIDATION-TESTS.md T-02 counts a field list as a design artefact. The roster's
// own examples taught the opposite — typed field lists, indices, parents and code fences inside the
// halt — and a model copies what the examples show. This is the class case over every proposal block:
// item 2 carries no field list, types, indices, ACLs, parent, table-name line or code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(new URL(import.meta.url).pathname), '..');
const SURFACES = ['.claude', 'governance', 'templates', 'CLAUDE.md', 'tests/VALIDATION-TESTS.md'];

// A block opens on a line that is the marker itself — a heading, a bold line, or the line a fenced
// halt starts with — not on a sentence that mentions the structure.
const MARKER = /^\s*(?:#{1,4}\s*|\*\*|🚨\s*)?`?OPEN QUESTION — CUSTOM OBJECT PROPOSAL`?\**(?:\s*\([^)]*\))?\**\s*$/;
const ITEM2 = /^\s*(?:#{1,4}\s*)?(?:\*\*)?2\.\s*(?:\*\*)?Custom object proposed/i;
const ITEM3 = /^\s*(?:#{1,4}\s*)?(?:\*\*)?3\.\s|Consequences of approval/i;
const DETAIL = [
  ['code fence', (l) => /^\s*```/.test(l)],
  // A field and its type, in each spelling a design has used: `name` (Reference to …), (ref to …),
  // `name` — Integer, and a table row | name | Reference |.
  ['typed field', (l) => /`?[a-z_][a-z0-9_]*`?\s*\((?:Reference(?: list)?|ref|String|Integer|DateTime|Date|Boolean|Choice|Currency|Decimal|JSON|Text)\b/i.test(l)
    || /`?[a-z_][a-z0-9_]*`?\s*[—–]\s*(?:Reference|String|Integer|DateTime|Date|Boolean|Choice|Currency|Decimal|JSON|Text)\b/i.test(l)
    || /^\s*\|\s*`?[a-z_][a-z0-9_.]*`?\s*\|\s*(?:Reference|ref|String|Integer|DateTime|Date|Boolean|Choice|Currency|Decimal|JSON|Text|True\/False)\b/i.test(l)],
  ['field-list line', (l) => /\b(?:Field list|New fields|Fields to define|Fields)\s*:/i.test(l)],
  ['index line', (l) => /\bInd(?:ex|ices|exes)\s*:/i.test(l)],
  ['ACL line', (l) => /\bACLs?(?: pattern)?\s*:/i.test(l)],
  ['parent line', (l) => /\bParent(?: table)?\s*:/i.test(l)],
  ['table-name line', (l) => /\bTable name\s*:/i.test(l)],
];

/** Every proposal block in the files, with item 2's range and the design detail inside it. */
export function haltBlocks({ files, read }) {
  const blocks = [];
  for (const f of files) {
    const lines = read(f).split('\n');
    lines.forEach((l, i) => {
      if (!MARKER.test(l)) return;
      const s = lines.slice(i + 1, i + 61).findIndex((x) => ITEM2.test(x));
      // A marker whose item 2 cannot be found is a block this test cannot read — said by name, not skipped.
      if (s < 0) { blocks.push({ file: f, line: i + 1, item2: null, detail: [], unread: `${f}:${i + 1}: no item 2 ("2. Custom object proposed") within 60 lines of the marker` }); return; }
      const a = i + 1 + s;
      let b = a + 1;
      while (b < lines.length && b < a + 40 && !ITEM3.test(lines[b])) b += 1;
      const detail = [];
      for (let k = a + 1; k < b; k += 1) {
        for (const [what, t] of DETAIL) if (t(lines[k])) detail.push(`${f}:${k + 1}: ${what} — ${lines[k].trim().slice(0, 70)}`);
      }
      blocks.push({ file: f, line: i + 1, item2: [a + 1, b], detail });
    });
  }
  return blocks;
}

const tracked = () => execFileSync('git', ['ls-files', ...SURFACES], { cwd: ROOT, encoding: 'utf8' })
  .split('\n').filter((f) => f.endsWith('.md'));

test('ARC-09-C85 — no proposal block carries design detail in item 2', () => {
  const blocks = haltBlocks({ files: tracked(), read: (f) => readFileSync(join(ROOT, f), 'utf8') });
  // A floor, because a scan that found no block would pass by having nothing to read.
  assert.ok(blocks.length >= 8, `only ${blocks.length} proposal block(s) found — the markers no longer match the roster`);
  const unread = blocks.filter((b) => b.unread).map((b) => b.unread);
  assert.deepEqual(unread, [], `${unread.length} marker(s) whose item 2 could not be read:\n  ${unread.join('\n  ')}`);
  const detail = blocks.flatMap((b) => b.detail);
  assert.deepEqual(detail, [], `${detail.length} line(s) of design detail inside a halt:\n  ${detail.join('\n  ')}`);
  console.log(`    ${blocks.length} proposal blocks, item 2 read in each`);
});

test('ARC-09-C85 — a planted field list, code fence or parent line in item 2 is found; words and a Verdict B design are not', () => {
  const dir = mkdtempSync(join(tmpdir(), 'snowarch-halt-'));
  try {
    const plant = (rel, text) => { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), `${text}\n`); };
    plant('a.md', ['### OPEN QUESTION — CUSTOM OBJECT PROPOSAL', '', '1. Baseline option evaluated: none fits.', '',
      '2. Custom object proposed (smallest viable scope):', '   - `from_tier` (Reference to `sys_user_group`)', '   - `reason_code` (Choice)', '',
      '3. Consequences of approval: one table.'].join('\n'));
    plant('b.md', ['🚨 OPEN QUESTION — CUSTOM OBJECT PROPOSAL (§1.1 Blocking)', '', '2. Custom object proposed:', '   ```',
      '   Table name: u_matrix', '   Parent: none', '   ```', '3. Consequences of approval'].join('\n'));
    plant('c.md', ['**OPEN QUESTION — CUSTOM OBJECT PROPOSAL**', '', '2. Custom object proposed:',
      '   - Object: `u_matrix`, as the request names it.', '   - Kind: a new top-level table; rejected as unnecessary.',
      '   - What it would hold, in the request\'s words: "the approval groups, in order".', '3. Consequences of approval'].join('\n'));
    // A Verdict B field design is an extension that proceeds, not a halt: its field names stay.
    plant('d.md', ['## Part 3 — Verdict B', '', '**Field design:**', '- `u_target_role_title` (String, 100)'].join('\n'));
    // The other spellings of a field and its type, and a marker whose item 2 is missing.
    plant('e.md', ['### OPEN QUESTION — CUSTOM OBJECT PROPOSAL', '2. Custom object proposed:', '| from_tier | Reference | the tier |',
      '   - u_business_unit (ref to business_unit)', '   - `u_shard_count` — Integer', '3. Consequences of approval'].join('\n'));
    plant('f.md', ['**OPEN QUESTION — CUSTOM OBJECT PROPOSAL**', '', '2. Custom app proposed only if the baseline cannot hold it.', '3. Consequences'].join('\n'));
    const blocks = haltBlocks({ files: ['a.md', 'b.md', 'c.md', 'd.md', 'e.md', 'f.md'], read: (f) => readFileSync(join(dir, f), 'utf8') });
    const at = (f) => blocks.filter((b) => b.file === f).flatMap((b) => b.detail);
    assert.equal(blocks.length, 5, 'the five halts were not all found, or the Verdict B design was taken for one');
    assert.equal(at('e.md').length, 3, 'a table-row field, a (ref to …) field or a "— Integer" field was not found');
    assert.match(blocks.find((b) => b.file === 'f.md')?.unread ?? '', /f\.md:1: no item 2/, 'a marker with no item 2 was skipped instead of named');
    assert.equal(at('a.md').length, 2, 'a typed field list in item 2 was not found');
    assert.deepEqual(at('b.md').map((d) => d.split(': ')[1].split(' — ')[0]).sort(),
      ['code fence', 'code fence', 'parent line', 'table-name line'], 'a fenced table block in item 2 was not found');
    assert.deepEqual(at('c.md'), [], 'an item 2 written in words was flagged');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
