// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C160 — a gateway in review mode checks the artefact against its own Envelope, and says cleared or a §1.1
// violation. It is not the Code Reviewer.
//
// The owner's rc.3 sitting (T-01 turn 2, and the T-03 chain on rc.4): the ITSM gateway's review read "ITSM review mode:
// APPROVE-WITH-FIXES" with a findings table — the Code Reviewer's verdict and report, because each gateway's review
// section said its verdict and report were "identical to Code Reviewer". The review answers one question, whether the
// artefact keeps the Envelope (tables, fields, state values, §1.1), with exactly one of two answers; code quality is
// the Code Reviewer's, proposed separately at Phase 2 Step 5 (CLAUDE.md §6).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { gatewayDirs } from './lib/gateways.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The `## Post-Build Review Mode` section of a gateway's skill, to the next `## `. */
function reviewSection(dir) {
  const text = readFileSync(join(ROOT, '.claude/skills', dir, 'SKILL.md'), 'utf8');
  const from = text.indexOf('\n## Post-Build Review Mode');
  assert.ok(from > 0, `${dir}: no Post-Build Review Mode section`);
  const to = text.indexOf('\n## ', from + 1);
  return text.slice(from, to === -1 ? undefined : to);
}

/** The shared answer, with the gateway's own name taken out, so the six can be compared. */
const ANSWER_START = '**What the review returns — exactly one of two (ARC-09-C160).**';

test('ARC-09-C160 — every gateway\'s review mode says cleared or a §1.1 violation, never a Code Reviewer verdict', () => {
  const dirs = gatewayDirs(ROOT);
  assert.ok(dirs.length >= 6, `${dirs.length} gateways found`);
  const answers = new Map();
  for (const dir of dirs) {
    const section = reviewSection(dir);
    for (const word of [/APPROVE-WITH-FIXES/, /\bAPPROVE\b/, /\brework\b/i, /\bfindings?\b/i, /identical to Code Reviewer/i]) {
      assert.doesNotMatch(section, word, `${dir}'s review mode still uses ${word}`);
    }
    assert.match(section, /\*\*Cleared\*\*/, `${dir}: no "Cleared"`);
    assert.match(section, /\*\*§1\.1 violation \(what, where\)\*\*/, `${dir}: no "§1.1 violation (what, where)"`);
    assert.match(section, /It is not a code review\. Style, performance, security and quality are the Code Reviewer's, which the Architect proposes separately at Phase 2 Step 5\./,
      `${dir}: the Code Reviewer is not named as separate`);
    const at = section.indexOf(ANSWER_START);
    assert.ok(at > 0, `${dir}: no shared answer`);
    answers.set(dir, section.slice(at).replace(/^# .+ review — /gm, '# <gateway> review — '));
  }
  // One wording, six copies: the answer is the same text in every gateway, but for the gateway's own name.
  const [first, ...rest] = [...answers.entries()];
  for (const [dir, text] of rest) assert.equal(text, first[1], `${dir}'s answer differs from ${first[0]}'s`);
});
