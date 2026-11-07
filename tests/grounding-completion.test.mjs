// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C263 — Part 2 of every Envelope ends with a bare count of the corpus pages the Architect Read. The grounding rule
// has no page limit any more (tests/grounding-rule.test.mjs); what it leaves a reader to check is the count, so the Stop
// hook can compare it with the pages the session did Read (`overclaim`, tools/snowarch/lib/docs/grounding-check.mjs). A
// number has no path slot, no "unverified" slot and no "searched, not found" slot, which is why it is a number and not a
// `Grounding:` line (CLAUDE.md already uses that word for a path). The line is the same in the six gateways, after the
// Live line and before Part 3, so seven places do not drift from each other.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GATEWAYS = ['itsm-specialist', 'csm-specialist', 'hrsd-specialist', 'itom-discovery-specialist',
  'fso-insurance-specialist', 'cmdb-csdm-specialist'];
const LEAD = '[Completing Part 2:';

/** The completion line as each gateway states it, with where it sits relative to the Live line and Part 3. */
export function completionLines(read) {
  return GATEWAYS.map((g) => {
    const file = `.claude/skills/${g}/SKILL.md`;
    const lines = read(file).split('\n');
    const at = lines.flatMap((l, i) => (l.startsWith(LEAD) ? [i] : []));
    return {
      file,
      count: at.length,
      words: at.length ? lines[at[0]] : null,
      afterLive: at.length > 0 && at[0] > lines.findIndex((l) => l.startsWith('[Live mode, read what the corpus cannot settle:')),
      beforePart3: at.length > 0 && at[0] < lines.findIndex((l) => l.startsWith('## Part 3')),
    };
  });
}

const real = (f) => readFileSync(resolve(ROOT, f), 'utf8');

test('ARC-09-C263 — Part 2 ends with the pages read: one line per gateway, the same words, after the Live line', () => {
  const found = completionLines(real);
  for (const c of found) {
    assert.equal(c.count, 1, `${c.file}: the Part 2 completion line appears ${c.count} time(s), not once`);
    assert.ok(c.afterLive, `${c.file}: the completion line is not after the Live line`);
    assert.ok(c.beforePart3, `${c.file}: the completion line is not before Part 3`);
    assert.equal(c.words, found[0].words, `${c.file}: the completion line differs from ${found[0].file}'s`);
  }
  const words = found[0].words;
  assert.ok(words.endsWith('.]'), 'the line is a bracketed paragraph, like its neighbours');
  for (const phrase of [
    'it ends with `Pages read: <n>`, the number of corpus pages you Read for this Envelope',
    'Search with Grep over `vendor/ServiceNowDocs/markdown`, never the whole checkout, each `_` written `\\\\?_`',
    'Two pages that disagree are both cited, and the difference becomes an OPEN QUESTION',
    'A field, column or table that a page creates in an example or procedure belongs to that example, not to baseline',
  ]) assert.ok(words.includes(phrase), `the completion line lacks: ${phrase}`);
});

// The words C263 keeps out: a resting label, a budget, "in words" (R4's resting label), and a path slot — the count is a
// number, and a Grep scope names the folder without a page path under it.
test('ARC-09-C263 — the completion line has no resting label, no budget and no page path', () => {
  const { words } = completionLines(real)[0];
  assert.doesNotMatch(words, /unverified|budget|in words|markdown\/[a-z]/, 'the completion line has a slot the rule removed');
});

test('ARC-09-C263 — a completion line that drifts is found', () => {
  const drifted = (f) => (f.includes('csm-specialist') ? real(f).replace('Two pages that disagree', 'Two pages that differ') : real(f));
  const found = completionLines(drifted);
  assert.deepEqual(found.filter((c) => c.words !== found[0].words).map((c) => c.file), ['.claude/skills/csm-specialist/SKILL.md']);
});
