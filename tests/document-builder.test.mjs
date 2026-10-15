// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C152 — a document is a builder's artefact, however short, and the Architect proposes it before anyone writes it.
//
// The owner's rc.3 sitting, T-33 turn 2 ("Write a short process design note, 3 to 4 pages … Deliver the markdown and a
// Word (.docx) version"): the Architect wrote the note in its own thread, without proposing the HLD/LLD Writer and
// waiting. The architect measured it on develop c542e253, Sonnet, deliverable mode: proposed 0 of 3, written in-thread
// 3 of 3. The class of ARC-09-C151: the Architect skips its own routing proposal. The rule existed once, as the HLD/LLD
// row of CLAUDE.md's "Artefact standards" table, and was lost with that table in the ARC-02-S08 rewrite (36351d2c).
// Three surfaces now say it: CLAUDE.md beside the figure rule, the skill's "When to use", and the taxonomy's trigger row
// for design documents (the architect's ruling, 2026-10-15).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const real = (rel) => readFileSync(join(ROOT, rel), 'utf8');

test('ARC-09-C152 — CLAUDE.md, beside the figure rule: a document is proposed at Step 8 and never written by the Architect', () => {
  const lines = real('CLAUDE.md').split('\n');
  const figure = lines.findIndex((l) => l.startsWith('| Diagramming Specialist |') && l.includes('one figure is the skill, a pack the sub-agent'));
  assert.ok(figure > 0, 'the figure rule is gone from §8');
  const rule = lines.slice(figure + 1).find((l) => l.trim() !== '') ?? '';
  assert.match(rule, /^\*\*A document, however short, is a builder's:\*\* /, `the line after the figure rule is not the document rule:\n${rule}`);
  assert.match(rule, /a design note, HLD, LLD or PDD the HLD\/LLD Writer sub-agent's, a runbook or KBA Operational Documentation's/);
  assert.match(rule, /proposed at Step 8, dispatched only after approval, never written by the Architect/);
  // After the sub-agent returns, the house scripts are still the main thread's: a sub-agent has no shell (the D1 rule).
  assert.match(rule, /you then run §3's scripts\.$/);
  const scripts = lines.find((l) => l.startsWith('- `scripts/` — you run these, never the user.')) ?? '';
  assert.match(scripts, /scripts\/render-drawio\.sh <diagrams-dir> svg` \(`png` too for Word or PDF\)/);
  assert.match(scripts, /python3 scripts\/md-to-docx\.py --src <md> --out <docx> --footer-text "<text>"/);
});

test('ARC-09-C152 — the HLD/LLD Writer skill names the short design note as its own', () => {
  const text = real('.claude/skills/hld-lld-writer/SKILL.md');
  const from = text.indexOf('## When to use this skill');
  assert.ok(from > 0, 'no "When to use this skill"');
  const when = text.slice(from, text.indexOf('\n## ', from + 1));
  assert.match(when, /^- "Write a short process design note, 3 to 4 pages\." — a design note is a design document however short, /m);
  assert.match(when, /the Architect proposes the HLD\/LLD Writer for it and dispatches the sub-agent after approval; it is never written in the main thread\.$/m);
});

test('ARC-09-C152 — the taxonomy routes a design note to the HLD/LLD Writer sub-agent, after approval', () => {
  const row = real('governance/taxonomy.md').split('\n').find((l) => l.startsWith('| "HLD", "LLD", "design document"')) ?? '';
  assert.match(row, /"design note", "process design note"/, `the design-document trigger row lacks the design note:\n${row}`);
  assert.match(row, /\| HLD\/LLD Writer \(sub-agent, after approval\) \|/);
});
