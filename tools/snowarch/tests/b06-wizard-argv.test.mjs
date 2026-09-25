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
// The module that owns the wizard's constants and sentences (ARC-07-C10). The dispatcher above
// re-exports neither, so reading them from it yields `undefined`.
const WIZARD_MODULE = pathToFileURL(join(root, 'packages/snowarch/dist/cli/instance.js')).href;

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
  //
  // ARC-07-C10 — AND IT IS ASKED AGAIN. This case used to assert `code === 2` after ONE bad answer
  // and stop, which is the behaviour the owner met at the S06 sitting: `testPDI` ended the wizard,
  // and B06 reported it as a bootstrap defect. The assertion was true of the defect, so it held it
  // in place — the exit code alone cannot tell "gave up immediately" from "asked again and then ran
  // out of input", which is why the count is asserted here and not just the code.
  const bad = io({ isTty: true, answers: ['NOT A LABEL'] });
  const code = await runInstance([...SUB_ARGV], bad);
  assert.match(bad.written, /is not a valid label/);
  assert.equal(bad.prompts.filter((p) => /Label for this instance/.test(p)).length, 2,
    'a bad label did not produce a second question — the wizard still gives up on one answer');
  assert.equal(code, 2, 'running out of input is still a cancel, not a save');
});

test('ARC-07-C10 — a bad label then a good one installs, and the wizard gets past the question', async () => {
  // THE CASE THE OWNER SHOULD HAVE HAD. One typo must cost a re-type, not the install.
  const { runInstance } = await import(CLI);
  const t = io({ isTty: true, answers: ['testPDI', 'pdi'] });
  await runInstance([...SUB_ARGV], t);

  assert.match(t.written, /"testPDI" is not a valid label/,
    'the rejection sentence is gone — the reader needs to know WHY it was refused');
  assert.equal(t.prompts.filter((p) => /Label for this instance/.test(p)).length, 2,
    'the label was not asked exactly twice for one bad answer and one good one');
  // PAST the label: the next thing it asks is the wizard's own question, not this one a third time.
  assert.equal(t.written.includes('No valid label after'), false,
    'a valid second answer was treated as an exhausted prompt');
});

test('ARC-07-C10 — three bad labels exit 1, the code that means the operator\'s answer', async () => {
  // BOUNDED, and bounded at the wizard's own `MAX_ATTEMPTS` — the credential prompt six hundred
  // lines down has re-asked three times and returned EXIT_FAILED since ARC-07, and `EXIT_CODES`
  // documents 1 as "nothing saved — a refusal, an abort, three failed attempts, or a probe that
  // failed". The label prompt was the one interactive answer not following that convention.
  //
  // EXIT 1 AND NOT 2 is the half B06 needs: it sees only the status, so while a rejected ANSWER and
  // a bad ARGV both exited 2 its message had to guess, and it guessed "a defect in the bootstrap,
  // not in what you typed".
  // `MAX_ATTEMPTS` and the give-up sentence come from `instance.js`, which OWNS them; `CLI` is the
  // dispatcher and re-exports neither. Read from the wrong module they arrive as `undefined`, and a
  // comparison against `undefined` is the shape that has produced three confident wrong answers in
  // this programme — so this asserts the value rather than using it bare.
  const { runInstance } = await import(CLI);
  const { MAX_ATTEMPTS, LABEL_EXHAUSTED } = await import(WIZARD_MODULE);
  assert.equal(MAX_ATTEMPTS, 3, 'the retry bound moved — this case drives the wizard\'s own constant');
  assert.match(LABEL_EXHAUSTED, /No valid label after 3 attempts/,
    'the give-up sentence moved — this case quotes the product\'s own words');

  const t = io({ isTty: true, answers: ['BAD', 'alsoBad', '9nope'] });
  const code = await runInstance([...SUB_ARGV], t);

  assert.equal(code, 1, 'exhausted attempts still exit 2 — B06 cannot tell them from bad argv');
  assert.equal(t.prompts.filter((p) => /Label for this instance/.test(p)).length, MAX_ATTEMPTS,
    `the label was not asked exactly ${MAX_ATTEMPTS} times`);
  assert.match(t.written, /No valid label after 3 attempts — nothing saved/,
    'the give-up line does not say how many attempts were spent, or that nothing was saved');
  assert.match(t.written, /lower case, starting with a letter/,
    'the give-up line does not restate the rule the reader kept missing');
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
