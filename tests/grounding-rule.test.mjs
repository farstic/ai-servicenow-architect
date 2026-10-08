// ARC-09-C112 — one grounding rule, in the same words wherever a session reads it.
//
// The owner's ruling: grounding is a budget with a declaration, not a cap — eight corpus pages by
// default, and past that the answer says which construct is still unverified and what it will open —
// and parallel readers are for an Ultracode or max-effort session only, said so in the answer. The
// rule is written once in CLAUDE.md (always loaded) and once in each gateway skill's Part 2, where an
// Envelope is grounded. Seven copies drift unless something compares them, so this does: the same
// words in all seven, formatting aside, and the capped wording it replaced nowhere.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITES = ['CLAUDE.md', ...['itsm-specialist', 'csm-specialist', 'hrsd-specialist', 'itom-discovery-specialist',
  'fso-insurance-specialist', 'cmdb-csdm-specialist'].map((s) => `.claude/skills/${s}/SKILL.md`)];
const LEAD = 'Ground an Envelope directly:';

/** The rule as each site states it: the line that starts with the lead, its formatting taken off. */
export function groundingRules(read) {
  return SITES.map((f) => {
    const lines = read(f).split('\n').filter((l) => l.replace(/^[-\s[]*(\*\*)?/, '').startsWith(LEAD));
    const words = lines.map((l) => l.replace(/^\s*-\s+/, '').replace(/^\[/, '').replace(/\]\s*$/, '').replace(/\*\*/g, '').trim());
    return { file: f, count: lines.length, words: words[0] ?? null };
  });
}

const real = (f) => readFileSync(resolve(ROOT, f), 'utf8');

test('ARC-09-C112 — the grounding rule is one sentence, in the same words in CLAUDE.md and the six gateways', () => {
  const rules = groundingRules(real);
  for (const r of rules) assert.equal(r.count, 1, `${r.file}: the grounding rule appears ${r.count} time(s), not once`);
  const first = rules[0].words;
  for (const r of rules) assert.equal(r.words, first, `${r.file}: the grounding rule differs from CLAUDE.md's`);
  assert.match(first, /eight by default; past that, say which construct is still unverified/, 'the budget and its declaration');
  assert.match(first, /only when the user has enabled Ultracode or max effort for the session, said so in the answer; never otherwise/,
    'the parallel-reader exception and its bound');
  for (const f of SITES) {
    assert.doesNotMatch(real(f), /Ground this part directly and boundedly|open at most eight corpus pages/,
      `${f}: the capped wording this rule replaced is back`);
  }
});

test('ARC-09-C112 — a copy that drifts is found', () => {
  const drifted = (f) => (f.includes('hrsd-specialist') ? real(f).replace('eight by default', 'six by default') : real(f));
  const rules = groundingRules(drifted);
  const differ = rules.filter((r) => r.words !== rules[0].words).map((r) => r.file);
  assert.deepEqual(differ, ['.claude/skills/hrsd-specialist/SKILL.md'], 'a drifted copy was not found, or another copy was taken for it');
});
