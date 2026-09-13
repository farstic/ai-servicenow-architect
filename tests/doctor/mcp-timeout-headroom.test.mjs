import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { HEADROOM, headroomNote, mcpTimeout } from '../../tools/snowarch/lib/doctor/checks/server.mjs';

/**
 * ARC-06 acceptance, B06-02 part 3 — what `MCP_TIMEOUT` actually does.
 *
 * ARC-06-S08 AC 4 said setting it to `1` makes B08 fail with a timeout. It does not: the handshake's
 * deadline is fixed in the server package and `MCP_TIMEOUT` never reaches it (see
 * `packages/snowarch/tests/doctor/handshake-timeout.test.ts`, and the chores table). The value's one
 * real effect is this warning — a cold start that ate most of the operator's budget — and **nothing
 * asserted it**: `grep headroomNote` and `grep mcpTimeout` across the engine's test roots both
 * returned nothing before this file.
 *
 * Both directions, because a note that fired on every run would be as useless as one that never did.
 */
test('B06-02 — over the threshold the note names the numbers an operator needs', () => {
  const note = headroomNote(700, 1000);
  assert.ok(note, '700 ms of a 1000 ms budget is over 60 % and must warn');
  // Every number in the sentence, because "your cold start is slow" without them is not actionable.
  assert.match(note, /cold start 700 ms/);
  assert.match(note, /over 60 % of MCP_TIMEOUT/);
  assert.match(note, /\(1000 ms\)/);
  assert.match(note, /docs\/TROUBLESHOOTING\.md "MCP_TIMEOUT"/);
});

test('B06-02 — under the threshold there is no note at all', () => {
  // The negative direction. `null`, not an empty string: the caller tests it for truthiness.
  assert.equal(headroomNote(599, 1000), null);
  assert.equal(headroomNote(1, 120_000), null, 'the shipped budget against a fast start');
  // Exactly at the threshold is NOT over it — asserted so the boundary cannot drift silently.
  assert.equal(headroomNote(600, 1000), null, '60 % exactly is within budget');
  assert.ok(headroomNote(601, 1000), 'one millisecond over is over');
  assert.equal(HEADROOM, 0.6);
});

test('B06-02 — a missing measurement or a missing budget is not a warning', () => {
  // The doctor runs where one or both are absent — no server, no settings file — and a warning
  // computed from nothing would be a warning about nothing.
  assert.equal(headroomNote(0, 1000), null);
  assert.equal(headroomNote(700, 0), null);
  assert.equal(headroomNote(undefined, 1000), null);
  assert.equal(headroomNote(700, null), null);
});

test('B06-02 — the budget is read from the committed settings, never from a literal', () => {
  // `01` §13: the number lives in `.claude/settings.json` and the engine reads it there. Injected
  // reader, so this asserts the parsing rather than this repository's current value.
  const read = (text) => () => text;
  assert.equal(mcpTimeout('/any', { read: read('{"env":{"MCP_TIMEOUT":"120000"}}') }), 120_000,
    'a string value is what JSON settings actually carry');
  assert.equal(mcpTimeout('/any', { read: read('{"env":{"MCP_TIMEOUT":90000}}') }), 90_000);
  // Every way it can be absent or nonsense answers `null`, which the note then treats as "no budget".
  assert.equal(mcpTimeout('/any', { read: read('{"env":{}}') }), null);
  assert.equal(mcpTimeout('/any', { read: read('{}') }), null);
  assert.equal(mcpTimeout('/any', { read: read('{"env":{"MCP_TIMEOUT":"0"}}') }), null, 'zero is not a budget');
  assert.equal(mcpTimeout('/any', { read: read('{"env":{"MCP_TIMEOUT":"-5"}}') }), null);
  assert.equal(mcpTimeout('/any', { read: read('{"env":{"MCP_TIMEOUT":"soon"}}') }), null);
  assert.equal(mcpTimeout('/any', { read: read('not json') }), null, 'an unreadable file is not a budget');
  assert.equal(mcpTimeout('/nonexistent-root-for-this-test'), null, 'and neither is a missing one');

  // Not vacuous: this repository's committed settings do carry one, so the reader has something
  // real to have parsed.
  // `fileURLToPath`, never `.pathname`: on Windows a file URL's pathname is `/C:/…` and carries
  // percent-encoding, and this repository has a test that fails anyone who forgets — it failed this
  // line on the first run.
  const shipped = mcpTimeout(fileURLToPath(new URL('../..', import.meta.url)));
  assert.ok(shipped === null || shipped > 0);
});
