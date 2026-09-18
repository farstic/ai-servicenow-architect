/**
 * ARC-07-C2 — B06's argv, driven through the CLI parser that has to accept it.
 *
 * WHAT HAPPENED: `./snowarch mode live --register local` on an owner's machine reached B06 and
 * died with `instance add needs a label`, exit 2, before asking anything. B06 spawns
 * `instance add --from-bootstrap` with no label; the CLI required one as a positional even on a
 * terminal. **The interactive install had never worked** — and CI never saw it, because CI has no
 * TTY and rc.2 never reached B06 at all.
 *
 * The gap is ARC-06-C6's exactly: nothing ever ran B06's spawn against the REAL command line. A
 * probe test with a fake CLI proves the step can spawn something; it cannot prove the thing it
 * spawns accepts what it is given. So this drives `WIZARD_ARGV` — the same frozen array the step
 * passes — through the built CLI's own `runInstance`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { WIZARD_ARGV } from '../lib/steps/B06.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CLI = pathToFileURL(join(root, 'packages/snowarch/dist/cli/instance-command.js')).href;

/**
 * B06 passes the whole argv to the CLI BINARY, whose commander strips the command word and hands
 * the rest to `runInstance` (`cli/index.ts`: `runInstance(command.args)`). This test drives
 * `runInstance`, so it does the same split — and pins the assumption rather than hiding it, because
 * an argv whose first element stopped being `instance` would route somewhere else entirely and this
 * test would otherwise still pass.
 */
const [COMMAND_WORD, ...SUB_ARGV] = WIZARD_ARGV;

/** An `AddIo` that answers from a script and never needs a terminal. */
function io({ isTty, answers = [] }) {
  const prompts = []; const writes = []; const remaining = [...answers];
  return {
    isTty,
    prompts,
    get written() { return writes.join(''); },
    ask: async (p) => { prompts.push(p); return remaining.length ? remaining.shift() : null; },
    write: (t) => { writes.push(t); },
    secret: async () => 'unused — this test never reaches the password prompt',
  };
}

test('ARC-07-C2 — B06\'s argv on a terminal asks for the label instead of refusing', async () => {
  const { runInstance } = await import(CLI);
  assert.equal(COMMAND_WORD, 'instance', 'B06 no longer invokes the `instance` command');
  assert.deepEqual(SUB_ARGV, ['add', '--from-bootstrap'],
    'B06\'s argv changed shape — this test drives what the step actually passes');
  const t = io({ isTty: true, answers: [] });     // no answer: end-of-input, so it stops cleanly
  const code = await runInstance([...SUB_ARGV], t);

  assert.equal(t.prompts.length >= 1, true, 'it refused without asking anything — the C2 defect');
  assert.match(t.prompts[0], /Label for this instance \[pdi\]/,
    `the first question is not the label: ${JSON.stringify(t.prompts[0])}`);
  assert.doesNotMatch(t.written, /instance add needs a label/,
    'the usage error was printed on a terminal that could have been asked');
  assert.equal(code, 2, 'end-of-input still ends the run rather than proceeding with no label');
});

test('ARC-07-C2 — the same argv WITHOUT a terminal is the usage error it always was', async () => {
  const { runInstance } = await import(CLI);
  const t = io({ isTty: false });
  const code = await runInstance([...SUB_ARGV], t);

  assert.equal(code, 2);
  assert.match(t.written, /instance add needs a label/);
  assert.deepEqual(t.prompts, [],
    'a run with no terminal asked a question nobody could answer — it would hang in CI');
});

test('ARC-07-C2 — Enter accepts the proposed label, and a typed one wins', async () => {
  const { runInstance, DEFAULT_LABEL } = await import(CLI);
  assert.equal(DEFAULT_LABEL, 'pdi');

  // ADR-0005, propose don't impose: the empty answer takes the proposal, and the run gets PAST the
  // label — the next question is the wizard's own, not this one again.
  const accepted = io({ isTty: true, answers: [''] });
  await runInstance([...SUB_ARGV], accepted);
  assert.doesNotMatch(accepted.written, /instance add needs a label/);
  assert.equal(accepted.prompts.filter((p) => /Label for this instance/.test(p)).length, 1,
    'the label was asked more than once — the answer did not take');

  // A typed label that breaks the rule is refused by the SAME validator as one typed on the command
  // line, which is why the label is re-parsed rather than patched into the options.
  const bad = io({ isTty: true, answers: ['NOT A LABEL'] });
  const code = await runInstance([...SUB_ARGV], bad);
  assert.equal(code, 2);
  assert.match(bad.written, /is not a valid label/);
});

test('ARC-07-C2 — --yes with no label never asks, on a terminal or without one', async () => {
  const { runInstance } = await import(CLI);
  for (const isTty of [true, false]) {
    const t = io({ isTty, answers: ['pdi'] });
    const code = await runInstance([...SUB_ARGV, '--yes'], t);
    assert.equal(code, 2, `--yes with no label should stay a usage error (isTty=${isTty})`);
    assert.deepEqual(t.prompts, [],
      `--yes means "do not ask me anything", and it asked (isTty=${isTty})`);
  }
});
