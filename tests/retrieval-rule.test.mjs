// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C217 — a name is searched for before it is called absent, in the same words in the six gateways.
//
// Measured on 2.2.3-rc.1 (9 labels ×2, Sonnet 5.5, design-only): 11 of 18 gateway runs carried at least one FALSE
// "not documented in the bundled corpus" claim: hold_reason (GlideHTTPResponseAPI.md:132), the CI/SO rule
// (create-an-incident.md:166), caller_id. The grounding rule (ARC-09-C112) gives the marker to a name "neither printed
// in the skill nor opened in this turn", so a page that was not opened printed as a page that does not exist. Each
// gateway's Part 2 now searches first.
//
// The pattern is ripgrep's, as the Grep tool runs it, and it was probed before it was written. On a file holding both
// spellings, `hold\_reason` finds only `hold_reason` (ripgrep drops the backslash), `hold\\_reason` finds only the
// corpus's `hold\_reason`, and `hold\\?_reason` finds both. A label needs the case-insensitive flag, because the corpus
// writes "Awaiting vendor". JavaScript's regular expressions read these patterns the same way, so the probe below runs
// on every CI cell without ripgrep.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MARKER } from '../tools/snowarch/lib/docs/identifiers.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GATEWAYS = ['itsm-specialist', 'csm-specialist', 'hrsd-specialist', 'itom-discovery-specialist',
  'fso-insurance-specialist', 'cmdb-csdm-specialist'].map((s) => `.claude/skills/${s}/SKILL.md`);
const LEAD = 'Before you mark a name absent:';
const real = (f) => readFileSync(resolve(ROOT, f), 'utf8');

/** The block as each gateway states it, inside Part 2: its count, its position and its words, brackets off. */
export function retrievalRules(read) {
  return GATEWAYS.map((file) => {
    const t = read(file);
    const part2 = t.indexOf('\n## Part 2 — Data Model Alignment');
    const part3 = t.indexOf('\n## Part 3', part2);
    const ground = t.indexOf('\n[Ground an Envelope directly:', part2);
    const lines = t.slice(part2, part3).split('\n').filter((l) => l.startsWith(`[${LEAD}`));
    const at = t.indexOf(`\n[${LEAD}`, part2);
    return { file, count: lines.length, placed: part2 > 0 && ground > part2 && at > ground && at < part3,
      words: lines[0]?.replace(/^\[/, '').replace(/\]\s*$/, '').trim() ?? null };
  });
}

test('ARC-09-C217 — each gateway searches before it marks a name absent, in Part 2 after the grounding rule', () => {
  for (const r of retrievalRules(real)) {
    assert.equal(r.count, 1, `${r.file}: the retrieval block appears ${r.count} time(s) in Part 2, not once`);
    assert.ok(r.placed, `${r.file}: the retrieval block is not in Part 2 after the grounding rule`);
  }
});

test('ARC-09-C217 — the six blocks are the same words, with the pattern the Grep tool needs', () => {
  const rules = retrievalRules(real);
  const [first] = rules;
  assert.ok(first.words, `${first.file}: no retrieval block to compare`);
  for (const r of rules) assert.equal(r.words, first.words, `${r.file}: the retrieval block differs from ${first.file}'s`);
  for (const part of ['one case-insensitive Grep', '`vendor/ServiceNowDocs/markdown`', '`\\\\?_`', '`hold\\\\?_reason`',
    'opened and cited, inside the grounding budget', `"${MARKER}" is for a name the search misses`]) {
    assert.ok(first.words.includes(part), `the retrieval block does not say ${part}`);
  }
});

test('ARC-09-C217 — the documented pattern finds both spellings, where an escaped underscore finds one', () => {
  const [{ words, file }] = retrievalRules(real);
  assert.ok(words, `${file}: no retrieval block to read a pattern from`);
  const pattern = words.match(/`(hold[^`]*_reason)`/)?.[1];
  assert.equal(pattern, 'hold\\\\?_reason', 'the block\'s example is not the `\\\\?_` form');
  const re = new RegExp(pattern);
  assert.equal(re.test('hold_reason'), true, 'the pattern misses the name as written');
  assert.equal(re.test('hold\\_reason'), true, 'the pattern misses the name as the corpus writes it');
  // The control: the form that looks right finds only one spelling, which is why the block does not use it.
  assert.equal(new RegExp('hold\\_reason').test('hold\\_reason'), false, 'an escaped underscore now finds the corpus form');
});

test('ARC-09-C217 — the marker keeps the words the identifier check reads, in the block and in the grounding rule', () => {
  const [{ words, file }] = retrievalRules(real);
  assert.ok(words, `${file}: no retrieval block to read the marker from`);
  assert.ok(words.includes(`"${MARKER}"`), 'the retrieval block does not quote the marker word for word');
  assert.ok(real('CLAUDE.md').includes(`"${MARKER}"`), 'the grounding rule no longer quotes the marker word for word');
});

test('ARC-09-C217 — a copy that drifts is found', () => {
  const drifted = (f) => (f.includes('hrsd-specialist')
    ? real(f).replace('one case-insensitive Grep', 'one Grep') : real(f));
  const rules = retrievalRules(drifted);
  const differ = rules.filter((r) => r.words !== rules[0].words).map((r) => r.file);
  assert.deepEqual(differ, ['.claude/skills/hrsd-specialist/SKILL.md'],
    'a drifted copy was not found, or another copy was taken for it');
});
