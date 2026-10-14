// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C117 — one live-verification rule, in the same words wherever a session reads it.
//
// The architect's design, approved 2026-10-11 with rulings (a)–(c), and the owner's approval of the seven
// copies in session. In live mode the Architect reads a gateway's "verify on the instance" items that are
// instance facts before the Envelope is final. The budget is eight reads per Envelope by default, declared
// like the page budget, and there is no cap under the Ultracode or max-effort opt-in. The rule sits once in
// CLAUDE.md Phase 1 Step 5 and once in each gateway's Part 2, under the grounding rule, where an Envelope is
// grounded. Seven copies drift unless something compares them, so this does, as
// `tests/grounding-rule.test.mjs` does for the grounding rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GATEWAYS = ['itsm-specialist', 'csm-specialist', 'hrsd-specialist', 'itom-discovery-specialist',
  'fso-insurance-specialist', 'cmdb-csdm-specialist'].map((s) => `.claude/skills/${s}/SKILL.md`);
const SITES = ['CLAUDE.md', ...GATEWAYS];
const LEAD = 'Live mode, read what the corpus cannot settle:';

/** The rule as each site states it: the line that starts with the lead, its formatting taken off. */
export function liveRules(read) {
  return SITES.map((f) => {
    const lines = read(f).split('\n').filter((l) => l.replace(/^[-\s[]*(\*\*)?/, '').startsWith(LEAD));
    const words = lines.map((l) => l.replace(/^\s*-\s+/, '').replace(/^\s*\[/, '').replace(/\]\s*$/, '')
      .replace(/\*\*/g, '').trim());
    return { file: f, count: lines.length, words: words[0] ?? null };
  });
}

const real = (f) => readFileSync(resolve(ROOT, f), 'utf8');

test('ARC-09-C117 — the live-verification rule is one paragraph, in the same words in CLAUDE.md and the six gateways', () => {
  const rules = liveRules(real);
  for (const r of rules) assert.equal(r.count, 1, `${r.file}: the live-verification rule appears ${r.count} time(s), not once`);
  const first = rules[0].words;
  for (const r of rules) assert.equal(r.words, first, `${r.file}: the live-verification rule differs from CLAUDE.md's`);
  for (const phrase of [
    'in `live` mode, before the Envelope is final',
    '(`snow_core_records_query`, `snow_disco_table_discover`)',
    'eight reads per Envelope by default; past that, say which items remain unread and continue',
    'Under the Ultracode or max-effort opt-in there is no cap',
    'since sub-agents make no MCP call, and declares the count',
    '"measured on instance <label>, <date>"',
    'with the instance label and the date, never a URL or an account',
    'and no other tool is tried',
    'under `LICENCE_NOT_VALID` none run',
    '"none found on <label>", never "absent"',
    'What is not an instance fact',
    'In `design-only` nothing changes: no call is made.',
  ]) assert.ok(first.includes(phrase), `the live-verification rule lacks: ${phrase}`);
});

// ARC-09-C125 — a read that comes back cut. The tool says so now (`truncated`, with `total` and `offset`), so the
// rule names the field instead of asking the session to notice a count equal to its limit, which it could not
// (measured on develop a4d2cb6). The sentence replaces "a capped read cites only what it returned", which it
// subsumes: the architect's ruling, 2026-10-12, with the owner's approval of the exact text.
export const TRUNCATED = 'A read whose answer says `truncated: true` is read to its end within the budget — its next pages, '
  + 'counted against the eight — or cited with what it returned and its `total`.';

test('ARC-09-C125 — every copy names the truncated field, and the clause it replaces is gone', () => {
  for (const r of liveRules(real)) {
    assert.ok(r.words?.includes(TRUNCATED), `${r.file}: the truncated sentence is missing`);
    assert.doesNotMatch(r.words ?? '', /a capped read cites only what it returned/, `${r.file}: the replaced clause is still there`);
  }
});

test('ARC-09-C117 — it sits in Phase 1 Step 5, and in each gateway\'s Part 2 under the grounding rule', () => {
  const claude = real('CLAUDE.md');
  const step5 = claude.indexOf('\n5. **Apply the Domain Expert gateway.**');
  const step6 = claude.indexOf('\n6. **Resolve ambiguity**');
  const at = claude.indexOf(`**${LEAD}**`);
  assert.ok(step5 > 0 && at > step5 && at < step6, 'CLAUDE.md: the rule is not inside Phase 1 Step 5');
  for (const f of GATEWAYS) {
    const t = real(f);
    const part2 = t.indexOf('\n## Part 2 — Data Model Alignment');
    const part3 = t.indexOf('\n## Part 3', part2);
    const ground = t.indexOf('\n[Ground an Envelope directly:', part2);
    const live = t.indexOf(`\n[${LEAD}`, part2);
    assert.ok(part2 > 0 && ground > part2 && live > ground && live < part3,
      `${f}: the rule is not in Part 2 under the grounding rule`);
  }
});

test('ARC-09-C117 — a copy that drifts is found', () => {
  const drifted = (f) => (f.includes('csm-specialist')
    ? real(f).replace('eight reads per Envelope by default', 'six reads per Envelope by default') : real(f));
  const rules = liveRules(drifted);
  const differ = rules.filter((r) => r.words !== rules[0].words).map((r) => r.file);
  assert.deepEqual(differ, ['.claude/skills/csm-specialist/SKILL.md'],
    'a drifted copy was not found, or another copy was taken for it');
});
