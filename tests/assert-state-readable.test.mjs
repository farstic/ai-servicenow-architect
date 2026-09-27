/**
 * ARC-07-C35 — the assertion two `ci.yml` steps make, driven on a laptop.
 *
 * THIS FILE IS THE POINT OF MOVING THE SCRIPT. `scripts/ci/assert-state-readable.mjs` was a
 * `node --input-type=module -e "…"` block inside `ci.yml`, and code that lives in YAML is covered by no
 * local instrument: not `lint`, not `type-check`, not the suite, not `gen:check`, and not a grep of the
 * source trees. When ARC-07-C31 made `loadState`'s spelling required, those two steps were the TWELFTH
 * caller and CI was the first reader — three red `launcher` cells, twenty minutes after the push.
 *
 * The last case below is the one that would have caught it: `checkState` must PASS A SPELLING to
 * `loadState`. Everything else here is the behaviour the two steps assert, which is now assertable
 * without a runner.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkState } from '../scripts/ci/assert-state-readable.mjs';
import { spellings } from '../tools/snowarch/lib/text.mjs';

/** Pinned, because none of these cases is about the RENDERING — only about what is threaded. */
const SPELL = spellings({ platform: 'linux', env: {} });

/** The shape `bootstrap.sh` and `bootstrap.ps1` write, reduced to what these two assertions read. */
const stateFrom = (writer) => ({ version: 1, writer, mode: 'design-only', steps: { B00: {}, B09: {} } });

test('the writer it expects, storable, is ok — and the line names the writer', () => {
  const r = checkState('/irrelevant',
    { writer: 'bash', spell: SPELL, read: () => stateFrom('bash') });
  assert.equal(r.ok, true, r.error);
  // The unified success line: `state ok: <version> <writer> <n> steps`. It carries the writer, which
  // the PowerShell step's old line did not, so that step gained information in the move.
  assert.equal(r.line, 'state ok: 1 bash 2 steps');
});

test('the powershell writer is the same assertion, not a second one', () => {
  const r = checkState('/irrelevant',
    { writer: 'powershell', spell: SPELL, read: () => stateFrom('powershell') });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.line, 'state ok: 1 powershell 2 steps');
});

test('a state written by someone else is refused, and the error names who', () => {
  const r = checkState('/irrelevant',
    { writer: 'bash', spell: SPELL, read: () => stateFrom('powershell') });
  assert.equal(r.ok, false);
  assert.match(r.error, /^writer is powershell$/);
});

test('no state at all is refused as no state, not as the wrong writer', () => {
  // `loadState` returns `null` when there is no file. Reported as its own thing: "writer is undefined"
  // would send a maintainer looking for a writer bug when nothing ran.
  const r = checkState('/irrelevant', { writer: 'bash', spell: SPELL, read: () => null });
  assert.equal(r.ok, false);
  assert.match(r.error, /nothing wrote \.local\/bootstrap-state\.json/);
});

test('a state carrying a secret throws rather than passing — assertStorable, unchanged', () => {
  const withSecret = { ...stateFrom('bash'), instance: { password: 'hunter2' } };
  assert.throws(() => checkState('/irrelevant',
    { writer: 'bash', spell: SPELL, read: () => withSecret }),
  /the key names a secret/,
  'a state naming a credential was accepted — that is the one thing this must never do');
});

test('ARC-07-C31 — checkState passes a SPELLING to loadState, which is the twelfth caller\'s defect', () => {
  // THE CASE THAT WOULD HAVE CAUGHT IT. The inline version called `loadState(process.cwd())` with one
  // argument; `loadState` now refuses that, and nothing local could see the call because it lived in
  // YAML. Here the read is injected and its second argument is inspected.
  const seen = [];
  checkState('/irrelevant', { writer: 'bash', spell: SPELL,
    read: (root, spell) => { seen.push({ root, spell }); return stateFrom('bash'); } });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].root, '/irrelevant');
  assert.deepEqual(seen[0].spell, SPELL,
    'checkState called loadState without the spelling it was given');

  // ...and with no `spell` argument it still passes ONE — the runner's own shell, which is what those
  // two steps are asserting about. A `undefined` here is the twelfth caller all over again.
  const bare = [];
  checkState('/irrelevant', { writer: 'bash',
    read: (root, spell) => { bare.push(spell); return stateFrom('bash'); } });
  assert.equal(typeof bare[0]?.cli, 'string', 'no spelling was passed at all');
  assert.equal(typeof bare[0]?.bootstrap, 'string');
});
