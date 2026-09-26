/**
 * ARC-08-C22 — the frame's help lists every sub-command its dispatcher accepts.
 *
 * `./snowarch instance --help` printed ONE line — `add <label> … add an instance (the wizard)` —
 * while the server CLI's own `instanceHelp()` lists nine. Both are real help for the same command,
 * and the one a user gets by typing the obvious thing was the poorer of the two: `list`, `test`,
 * `set-credentials`, `set-preset`, `set-flags`, `set-default`, `remove` and `import` were
 * documented nowhere a user would look. `store` was the same shape — three sub-commands written in
 * three places (`storeHelp()`, the dispatcher's `switch`, and the "unknown command" message).
 *
 * WHAT THIS TEST REFUSES TO BE: a fourth list. Every expectation here is read from the dispatcher's
 * own table, so a sub-command added tomorrow fails this test until the help carries it — rather
 * than passing because somebody remembered to update two places and not the third.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { USAGE as INSTANCE_USAGE } from '../tools/snowarch/lib/instance.mjs';
import { USAGE as STORE_USAGE } from '../tools/snowarch/lib/store.mjs';
import { SUB_COMMANDS } from '../packages/snowarch/dist/cli/instance-command.js';
import { runStore, STORE_SUB_COMMANDS, storeSubCommandList }
  from '../packages/snowarch/dist/cli/store-command.js';
import * as tables from '../packages/snowarch/dist/cli/help-tables.js';
import { region, TARGETS } from '../scripts/gen-cli-help.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('the instance frame names every sub-command the dispatcher accepts', () => {
  // `add` is the wizard and lives in the frame's own line; the table holds the other eight… nine.
  for (const name of Object.keys(SUB_COMMANDS)) {
    assert.ok(new RegExp(`^  ${name}\\b`, 'm').test(INSTANCE_USAGE),
      `\`./snowarch instance --help\` does not mention "${name}"`);
  }
  assert.match(INSTANCE_USAGE, /^  add\b/m, 'the wizard is not listed');
  // …and its summary is the dispatcher's, not a paraphrase written here.
  for (const [name, meta] of Object.entries(SUB_COMMANDS)) {
    assert.ok(INSTANCE_USAGE.includes(meta.summary), `"${name}" carries a different summary`);
  }
});

test('the store frame names every sub-command, with the dispatcher\'s own usage and summary', () => {
  for (const [name, meta] of Object.entries(STORE_SUB_COMMANDS)) {
    assert.ok(STORE_USAGE.includes(meta.usage), `\`store --help\` does not show "${meta.usage}"`);
    assert.ok(STORE_USAGE.includes(meta.summary), `"${name}" carries a different summary`);
  }
});

test('the store dispatcher accepts exactly the table, and offers exactly the table', async () => {
  // BOTH DIRECTIONS. A help that lists a command the dispatcher rejects is as wrong as a command
  // the help omits, and only one of the two is visible from the help alone.
  const errors = [];
  const io = { write: () => {}, error: (t) => errors.push(t), ask: async () => '' };

  for (const name of Object.keys(STORE_SUB_COMMANDS)) {
    errors.length = 0;
    await runStore([name, '--help'], io);
    assert.deepEqual(errors, [], `the dispatcher rejects "${name}", which the help offers`);
  }

  errors.length = 0;
  await runStore(['definitely-not-a-command'], io);
  assert.equal(errors.length, 1);
  // The list in the refusal is the table's, so a new sub-command is offered the day it exists.
  assert.ok(errors[0].includes(storeSubCommandList()), errors[0]);
  assert.equal(storeSubCommandList(), 'migrate, backups or restore');
});

test('the generated region is what the generator would write, today', () => {
  // The frame CANNOT import the dispatcher's help: it runs in design-only, where `node_modules`
  // does not exist, and the dist help reaches `zod` and `undici` through its import graph. So the
  // lines are generated in — and this is what stops the generated copy from drifting, the same way
  // `launcher-parity` holds the sentences bash prints.
  for (const target of TARGETS) {
    const source = readFileSync(join(ROOT, target.path), 'utf8');
    assert.ok(source.includes(region(tables[target.lines](), target.word)),
      `${target.path} has drifted from ${target.lines}() — run \`npm run gen\``);
  }

  // …and the module the generator reads imports NOTHING, which is what lets `gen-all --check` run
  // on a clone with no dependencies. Asserted on the source, because an import added tomorrow
  // would only fail on the depless clone, which is the one place nobody runs by hand.
  const table = readFileSync(join(ROOT, 'packages/snowarch/src/cli/help-tables.ts'), 'utf8');
  assert.equal(/^import /m.test(table), false,
    'help-tables.ts has grown an import — the generator can no longer run without node_modules');
});

test('the frame keeps its own sentence, which the dispatcher has no reason to know', () => {
  // "everything after this word belongs to the server CLI" is a fact about the FRAME. It is
  // deliberately outside the generated region: a generator that carried it would be putting the
  // frame's words in the dispatcher's mouth.
  assert.match(INSTANCE_USAGE, /Everything after `instance` is passed to the server CLI unchanged\./);
  assert.match(STORE_USAGE, /Everything after `store` is passed to the server CLI unchanged\./);
});

/**
 * ARC-07-W17 — the doctor's usage is a FUNCTION, and something has to run it.
 *
 * The architect's control found this: with `cli.mjs`'s `usageOf` degraded to a bare `c.usage`, every
 * `tests/doctor` file and this one stayed green — 386 pass, 0 fail. So nothing exercised the function
 * path, and a regression would print the function's SOURCE on `doctor --help` while no test noticed.
 * That is the shape this programme keeps finding: a mechanism with no reader.
 */
test('ARC-07-W17 — the doctor\'s usage resolves to text, through the path cli.mjs takes', async () => {
  const { USAGE: DOCTOR_USAGE } = await import('../tools/snowarch/lib/doctor/index.mjs');
  const { spellings } = await import('../tools/snowarch/lib/text.mjs');

  // THROUGH `cli.mjs`'s OWN PATH, not a restatement of it. My first version defined its own
  // `typeof usage === 'function' ? usage() : usage` here — which would have stayed green under exactly
  // the degradation this case exists to catch, because it never touched the code being degraded. A
  // control that cannot fail, in the case written to close a control that could not fail.
  const { main } = await import('../tools/snowarch/lib/cli.mjs');
  const captured = [];
  const sink = { write: (t) => { captured.push(t); return true; } };
  const code = await main(['doctor', '--help'], { out: sink, err: sink });
  assert.equal(code, 0);
  const text = captured.join('');

  assert.equal(typeof text, 'string');
  // A function printed by `${}` leaves its source in the output — the exact regression.
  assert.doesNotMatch(text, /=>/, 'the usage printed a function body, not its text');
  assert.doesNotMatch(text, /\bfunction\b/, 'the usage printed a function body, not its text');
  assert.match(text, /^usage: /);
  assert.ok(text.includes(`${spellings().cli} doctor`), `the launcher is missing:\n${text}`);
  assert.match(text, /--section/);

  // ...AND THE WINDOWS RENDERING, driven by argument rather than by forcing `process.platform` —
  // ARC-07 measured that as unusable locally, because `win32.resolve` on POSIX paths fails everything.
  // `env: {}` is load-bearing: `isWindowsShell` reads SHELL and MSYSTEM, and `env` defaults to
  // `process.env`, so `{ platform: 'win32' }` alone renders POSIX on any machine with SHELL set.
  const win = DOCTOR_USAGE({ platform: 'win32', env: {} });
  assert.ok(win.includes('.\\snowarch.cmd doctor'), `the Windows rendering is missing:\n${win}`);
  assert.doesNotMatch(win.split('\n')[0], /\.\/snowarch/, 'a POSIX launcher on a Windows shell');
});
