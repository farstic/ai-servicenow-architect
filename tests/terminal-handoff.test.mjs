import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { handoffBody } from '../scripts/gen-readme.mjs';

/**
 * ARC-06-S13 — the terminal hand-off exists once.
 *
 * It is the procedure that keeps a credential out of a chat transcript, and it appears in two
 * places a user can read: the install page and the `/snowarch setup-instance` skill. A stale copy
 * of THIS text is not a documentation defect — it is a user typing a password somewhere it was not
 * meant to go, on the strength of instructions that used to be right.
 *
 * The story allowed this assertion to be `test.todo` until ARC-07-S09 wrote the skill body. The
 * skill body exists (ARC-02-S11), so the clause does not apply and this runs for real.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const FRAGMENT = 'docs/snippets/terminal-handoff.md';
const SKILL = '.claude/skills/snowarch/SKILL.md';

/** The fenced block's content, without the fence — what both readers actually show. */
const blockOf = (text) => {
  const m = /```\n([\s\S]*?)```/.exec(text);
  assert.ok(m, 'no fenced block');
  return m[1].trimEnd();
};

test('the skill carries the fragment verbatim, allowing for its own indentation', () => {
  const fragment = blockOf(handoffBody(read(FRAGMENT)));
  const skill = read(SKILL);
  // The skill indents the block three spaces, inside a numbered list. That is formatting, not
  // wording: the comparison is line by line with the indentation removed, so a change to ANY word
  // in either copy fails here.
  const indented = fragment.split('\n').map((l) => (l === '' ? '' : `   ${l}`)).join('\n');
  assert.ok(skill.includes(indented),
    `${SKILL} does not contain the fragment from ${FRAGMENT} — one of the two has drifted`);
});

test('...and the assertion is not vacuous — one changed word fails it', () => {
  const fragment = blockOf(handoffBody(read(FRAGMENT)));
  const tampered = fragment.replace('never pass through this chat', 'may pass through this chat');
  assert.notEqual(tampered, fragment, 'the sentence being checked for is not in the fragment');
  const indented = tampered.split('\n').map((l) => (l === '' ? '' : `   ${l}`)).join('\n');
  assert.equal(read(SKILL).includes(indented), false);
});

test('the install page includes the fragment byte-equal, through the generator', () => {
  const install = read('docs/INSTALL.md');
  const region = /<!-- generated:terminal-handoff -->\n([\s\S]*?)<!-- \/generated:terminal-handoff -->/
    .exec(install);
  assert.ok(region, 'docs/INSTALL.md has no terminal-handoff region');
  assert.equal(region[1].trimEnd(), handoffBody(read(FRAGMENT)));
});

test('the fragment says the two things that make it a safety procedure', () => {
  // A future edit may reword it. These two facts are why it exists, and losing either one silently
  // would leave a procedure that still reads fine and no longer protects anything.
  const fragment = read(FRAGMENT);
  assert.match(fragment, /credentials never pass through this chat/);
  assert.match(fragment, /masked; nothing is echoed/);
  // ...and it never asks the reader to type a credential where the model can see it.
  assert.equal(/paste (your )?(password|credential)/i.test(fragment), false);
});
