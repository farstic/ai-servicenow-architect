// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C112 — one grounding rule, in the same words wherever a session reads it.
//
// The rule is written once in CLAUDE.md (always loaded) and once in each gateway skill's Part 2, where an Envelope is
// grounded. Seven copies drift unless something compares them, so this does: the same words in all seven, formatting
// aside, and the wording each ruling replaced nowhere. C112 (2026-10-08) made grounding a budget with a declaration, eight
// corpus pages by default, with parallel readers for an Ultracode or max-effort session only; ARC-09-C256 (2026-10-29)
// made the eight twelve. ARC-09-C263 (2026-11-07) takes the number out: "twelve by default … past that, say …" was read as
// a ceiling (README.md:358 of the ARC-09 plan: 38 of 41 Envelopes under twelve pages, 3 at exactly twelve, none above),
// so the Architect reads with no page limit, until each construct is cited from a page it Read or an escape-safe search
// did not find it.
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
  // ARC-09-C263 — a completion criterion, not a count; the marker only after a search misses; only sourced names printed.
  for (const phrase of [
    'with no page limit, until each construct is cited from a page you Read or an escape-safe corpus search did not find it',
    'a construct a search finds is opened, never labelled',
    'Only a construct that search did not find carries "not documented in the bundled corpus — verify on the instance", with no citation',
    'never a coined name',
    'print a platform name only as one of them or an instance read gives it',
  ]) assert.ok(first.includes(phrase), `the grounding rule lacks: ${phrase}`);
  assert.match(first, /only when the user has enabled Ultracode or max effort for the session, said so in the answer; never otherwise/,
    'the parallel-reader exception and its bound');
  for (const f of SITES) {
    assert.doesNotMatch(real(f), /Ground this part directly and boundedly|open at most eight corpus pages/,
      `${f}: the capped wording this rule replaced is back`);
  }
});

// ARC-09-C114 — the owner's ruling (2026-10-08): Ultracode is the scoping mode, and it is NOT capped.
// Its 3 h 14 min F1 Envelope carried 89 citations (0 dead), 0 invented names and a blocking risk the
// one-minute run did not see. What was missing was knowing whether it was still working, and a second
// review round run whether or not the first changed anything. So the one sentence after the opt-in
// declares the plan, reports each workflow, and makes round 2 conditional — with the progress line
// verbatim, so a session prints exactly that.
test('ARC-09-C114 — under the opt-in: the plan is declared, and round 2 runs only on a material finding', () => {
  const [{ words }] = groundingRules(real);
  for (const phrase of [
    'Under that opt-in, before the first workflow say how many workflows you will run and roughly how long',
    'print one line as each completes',
    'run a second review round only when the first returned a material finding — one that changed a verdict, a table, a citation or an OPEN QUESTION',
    '"review round 1: no material finding, finalizing"',
  ]) assert.ok(words.includes(phrase), `the grounding rule lacks: ${phrase}`);
  // It qualifies the opt-in, so it comes after it; and the opt-in's own bound is unchanged.
  assert.ok(words.indexOf('never otherwise.') < words.indexOf('Under that opt-in'), 'the sentence is not after the opt-in');
  assert.doesNotMatch(words, /ceiling|at most \w+ readers|minutes/, 'a cap is back: the owner ruled C114 uncapped');
});

// ARC-09-C263 — the reading rule has no number and no resting place. The measured cause: the marker keyed on "opened in
// this turn", not on a search that found nothing, so a page the Architect did not open was reported as missing from the
// corpus; and a number with a declaration at it is the slot R3's dead paths sat in. So no site carries a number word, a
// page count, "by default", "past that", a budget, a checkpoint, "unverified" or "in words" in the rule, and none carries
// the wording C263 removed anywhere in the file.
test('ARC-09-C263 — the grounding rule has no page number, no checkpoint and no resting label, at any site', () => {
  const RULE_BANNED = /\b(?:eight|ten|twelve|twenty|thirty|fifty|hundred)\b|\b\d+ (?:corpus )?pages?\b|by default|past that|budget|checkpoint|unverified|in words/i;
  for (const r of groundingRules(real)) assert.doesNotMatch(r.words, RULE_BANNED, `${r.file}: the rule has a number, a checkpoint or a resting label again`);
  const REMOVED = /cited by path as unverified|found but unopened|with no path|not settled|opened in this turn|grounding budget|twelve pages/;
  for (const f of SITES) assert.doesNotMatch(real(f), REMOVED, `${f}: wording ARC-09-C263 removed is back`);
});

test('ARC-09-C112 — a copy that drifts is found', () => {
  const drifted = (f) => (f.includes('hrsd-specialist') ? real(f).replace('with no page limit', 'with a page limit') : real(f));
  const rules = groundingRules(drifted);
  const differ = rules.filter((r) => r.words !== rules[0].words).map((r) => r.file);
  assert.deepEqual(differ, ['.claude/skills/hrsd-specialist/SKILL.md'], 'a drifted copy was not found, or another copy was taken for it');
});
