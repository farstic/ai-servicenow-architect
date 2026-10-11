// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ARC-09-C118 — a co-firing gateway writes its Envelope in the same turn, and the rule says so in the same words in
// CLAUDE.md and in each gateway's Part 4. On rc.1, F1 named CSM as co-firing and wrote "Its Envelope is not yet
// written; reconcile before any builder dispatch": three sentences tied the co-fire to the dispatch, not the turn.
// Seven copies drift unless something compares them, as tests/grounding-rule.test.mjs does for C112's rule.

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITES = ['CLAUDE.md', ...['itsm-specialist', 'csm-specialist', 'hrsd-specialist', 'itom-discovery-specialist',
  'fso-insurance-specialist', 'cmdb-csdm-specialist'].map((s) => `.claude/skills/${s}/SKILL.md`)];
const LEAD = 'A co-firing gateway fires in this turn too:';
const END = 'did not fire.';

/** The rule as each site states it: from its lead to its last sentence, formatting taken off. */
export function cofireRules(read) {
  return SITES.map((file) => {
    const found = [];
    for (const line of read(file).split('\n')) {
      const flat = line.replace(/\*\*/g, '');
      const at = flat.indexOf(LEAD);
      if (at === -1) continue;
      const end = flat.indexOf(END, at);
      found.push(end === -1 ? flat.slice(at).trim() : flat.slice(at, end + END.length));
    }
    return { file, count: found.length, words: found[0] ?? null };
  });
}

const real = (f) => readFileSync(resolve(ROOT, f), 'utf8');
const DISPATCH_BOUND = /reconcile the Envelopes before dispatch|reconciled before any builder is dispatched|Reconcile the two envelopes before any builder dispatch/i;

test('ARC-09-C118 — the co-fire rule is one sentence, in the same words in CLAUDE.md and the six gateways', () => {
  const rules = cofireRules(real);
  for (const r of rules) assert.equal(r.count, 1, `${r.file}: the co-fire rule appears ${r.count} time(s), not once`);
  for (const r of rules) assert.equal(r.words, rules[0].words, `${r.file}: the co-fire rule differs from CLAUDE.md's`);
  assert.match(rules[0].words, /load its skill, write its five-part Envelope beside this one, and reconcile (them|the two) before the turn ends/);
  if (rules[0].words.includes('grounding budget')) assert.match(rules[0].words, /Each Envelope has its own grounding budget, eight pages by default, declared per Envelope in the answer\./);
  for (const f of SITES) assert.doesNotMatch(real(f), DISPATCH_BOUND, `${f}: a co-fire is tied to the dispatch again`);
});

test('ARC-09-C118 — a copy that drifts is found', () => {
  const drifted = (f) => (f.includes('csm-specialist') ? real(f).replace('before the turn ends', 'before dispatch') : real(f));
  const rules = cofireRules(drifted);
  assert.deepEqual(rules.filter((r) => r.words !== rules[0].words).map((r) => r.file), ['.claude/skills/csm-specialist/SKILL.md']);
});
