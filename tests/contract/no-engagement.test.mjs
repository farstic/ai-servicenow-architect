// ARC-09-C105 — a session with no engagement named, about to write to an instance.
//
// The rule is ONE sentence in an always-loaded file, worded for the owner and approved by them, so it is
// pinned here character for character beside the generator's constant — a rewording is a change to every
// live session's behaviour and should fail a test rather than slip through a regeneration. The same
// constant is rendered into the long form (`governance/mcp-protocols.md`), so the two cannot disagree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NO_ENGAGEMENT_QUESTION, NO_ENGAGEMENT_RULE } from '../../packages/contract/gen/rule-file.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const RULE = '.claude/rules/00-mode-and-mcp-gate.md';
const LONG = 'governance/mcp-protocols.md';

const OWNERS_QUESTION = 'Which engagement is this for?';
const OWNERS_RULE = 'With no engagement named, once §2.0 passes for the session\'s first mutating call, ask once — '
  + '`Which engagement is this for?` — and wait. The answer is the `<engagement>` of the §2.2 update-set name '
  + 'and the engagement whose state file records the change; a change to an instance is never recorded under '
  + '`clients/_unfiled/`.';

/** From a heading to the next heading of the same level — never the whole file. */
function between(text, from, to) {
  const a = text.indexOf(from);
  assert.notEqual(a, -1, `${from} is gone`);
  const b = text.indexOf(to, a + from.length);
  assert.notEqual(b, -1, `${to} is gone`);
  return text.slice(a, b);
}

test('ARC-09-C105 — the question and the rule are the owner\'s, character for character', () => {
  assert.equal(NO_ENGAGEMENT_QUESTION, OWNERS_QUESTION);
  assert.equal(NO_ENGAGEMENT_RULE, OWNERS_RULE, 'the generator\'s sentence is not the one the owner approved');
});

test('ARC-09-C105 — the rule file carries it as a §2.1 bullet, ahead of the update-set steps', () => {
  const gate = between(read(RULE), '## §2.1 — Write gate', '## §2.2');
  assert.ok(gate.split('\n').includes(`- ${OWNERS_RULE}`), 'the §2.1 section does not carry the rule on a line of its own');
  assert.equal(read(RULE).split(OWNERS_QUESTION).length - 1, 1, 'the question is stated more than once in the rule file');
});

test('ARC-09-C105 — the long form says the same, and gives the reason', () => {
  const gate = between(read(LONG), '## §2.1 — The write gate', '## §2.2');
  assert.ok(gate.includes(`\`${OWNERS_QUESTION}\``), 'the long form does not quote the question');
  assert.ok(gate.includes('`clients/_unfiled/`'));
  assert.match(gate, /never recorded|never filed/);
  assert.match(gate, /update-set name/, 'the reason — the §2.2 name needs an engagement — is not given');
});

test('ARC-09-C105 — CLAUDE.md points at the write gate and does not restate it', () => {
  const doc = read('CLAUDE.md');
  assert.ok(!doc.includes(OWNERS_QUESTION), 'the write-gate question was copied into CLAUDE.md (§2 says it is not restated)');
  assert.ok(!doc.includes('first mutating call'), 'CLAUDE.md restates the gate');
});
