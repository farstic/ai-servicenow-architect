import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The engine pin is well-formed and internally consistent.
 *
 * Note what this file deliberately does NOT check: whether the pin agrees with the server. That
 * split is the point. This side proves the declaration is a valid declaration; ARC-05-S03's
 * lint proves `serverKey` matches `engine.config.json` (L07); ARC-05-S08 proves the gates match
 * the running catalogue. A single test that did all three would go red for three unrelated
 * reasons and tell the reader nothing about which.
 *
 * `node:test` and the standard library only: this runs before anything is installed.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PIN = resolve(root, 'packages/contract/required-tools.json');
const SCHEMA = resolve(root, 'packages/contract/required-tools.schema.json');

const raw = readFileSync(PIN, 'utf8');
const pin = JSON.parse(raw);
const schema = JSON.parse(readFileSync(SCHEMA, 'utf8'));

const GATES = schema.$defs.tool.properties.gate.enum;

test('the file parses and carries the required top-level keys', () => {
  for (const key of schema.required) {
    assert.ok(key in pin, `missing top-level key: ${key}`);
  }
  assert.equal(pin.contractVersion, 1);
});

test('no unexpected top-level key', () => {
  // `additionalProperties: false` in the schema, asserted here too — the CI validator is a
  // separate step and this test must stand on its own.
  const allowed = new Set(Object.keys(schema.properties));
  assert.deepEqual(Object.keys(pin).filter((k) => !allowed.has(k)), []);
});

test('contractSha256 is 64 hex characters', () => {
  assert.match(pin.contractSha256, /^[0-9a-f]{64}$/);
  // And not the placeholder: an all-zero value is syntactically a sha and semantically "never
  // pinned", which would pass a pattern check while meaning the opposite.
  assert.notEqual(pin.contractSha256, '0'.repeat(64), 'still the unpinned placeholder — run pin.mjs');
});

test('serverKey is a legal MCP registration key', () => {
  // `02` D-01 constrains what may be used as an `add-json` key.
  assert.match(pin.serverKey, /^[A-Za-z0-9_-]+$/);
});

test('the seed lists exactly 42 tools', () => {
  // 41 at S01, plus `snow_core_instance_switch` at S02. It changes no ServiceNow record, so it
  // is not `mutates` — but `03` S-23 names it among the 14 that must prompt, and it is the only
  // way to change which instance a write lands on. ARC-05-S07's ask list unions the two fields.
  assert.equal(pin.tools.length, 42);
});

test('every name matches the tool-name convention', () => {
  for (const t of pin.tools) assert.match(t.name, /^snow_[a-z0-9_]+$/);
});

test('names are unique', () => {
  const names = pin.tools.map((t) => t.name);
  assert.equal(new Set(names).size, names.length);
});

test('names are sorted', () => {
  // Sorted so a diff on this file is readable: an unsorted list makes every insertion look like
  // a move, which is exactly the review this file exists to make possible.
  const names = pin.tools.map((t) => t.name);
  assert.deepEqual(names, [...names].sort());
});

test('every gate is in the enum, and alsoRequires too when present', () => {
  for (const t of pin.tools) {
    assert.ok(GATES.includes(t.gate), `${t.name}: gate ${t.gate}`);
    if (t.alsoRequires !== undefined) {
      assert.ok(GATES.includes(t.alsoRequires), `${t.name}: alsoRequires ${t.alsoRequires}`);
      assert.notEqual(t.alsoRequires, t.gate, `${t.name}: alsoRequires repeats gate`);
    }
  }
});

test('mutates is a boolean, and sessionMutates when present', () => {
  for (const t of pin.tools) {
    assert.equal(typeof t.mutates, 'boolean', `${t.name}: mutates`);
    if (t.sessionMutates !== undefined) {
      assert.equal(typeof t.sessionMutates, 'boolean', `${t.name}: sessionMutates`);
      // The two never both hold: `sessionMutates` exists precisely because the tool that has it
      // changes no instance state, so `mutates: true` alongside it would mean one of them is a
      // lie. ARC-04-S10 settled this.
      assert.equal(t.mutates && t.sessionMutates, false, `${t.name}: both mutates and sessionMutates`);
    }
  }
});

test('a gate:none tool never mutates', () => {
  // The invariant a reader relies on: if the engine expects no flag, it expects no change. A
  // row breaking it is either a wrong gate or a wrong `mutates`, and both matter.
  const bad = pin.tools.filter((t) => t.gate === 'none' && t.mutates).map((t) => t.name);
  assert.deepEqual(bad, []);
});

test('every used_by is non-empty and has no blank entries', () => {
  for (const t of pin.tools) {
    assert.ok(Array.isArray(t.used_by) && t.used_by.length > 0, `${t.name}: used_by`);
    for (const u of t.used_by) {
      assert.equal(typeof u, 'string');
      assert.ok(u.trim().length > 0, `${t.name}: blank used_by entry`);
    }
    assert.equal(new Set(t.used_by).size, t.used_by.length, `${t.name}: duplicate used_by`);
  }
});

test('every session-mutating tool is cited by a governance section too', () => {
  // The same rule for the other field. Redirecting where every later write lands is a §2.1
  // concern even though no record changes — and a tool that only a skill claimed would be one
  // the approval rules were never told about, which is the whole point of the citation.
  const bad = pin.tools
    .filter((t) => t.sessionMutates === true)
    .filter((t) => !t.used_by.some((u) => u.startsWith('§')))
    .map((t) => t.name);
  assert.deepEqual(bad, []);
});

test('every mutating tool is cited by a governance section, not only by a skill', () => {
  // §2.1 is the write gate. A mutating tool that only a skill claims is one the approval rules
  // were never told about — which is the shape of the defect this whole ARC exists to prevent.
  // The two [Unsupported] stubs are the exception and say so: they are listed under §2.2 as
  // things NOT to use, and they refuse before any HTTP.
  const STUBS = ['snow_deploy_background_script_exec', 'snow_fluent_script_exec'];
  const bad = pin.tools
    .filter((t) => t.mutates && !STUBS.includes(t.name))
    .filter((t) => !t.used_by.some((u) => u.startsWith('§')))
    .map((t) => t.name);
  assert.deepEqual(bad, []);
});

test('the file is written in the shape pin.mjs writes', () => {
  // 2-space indent, LF, trailing newline. Asserted so a hand edit that reformats the file
  // produces a diff on THIS test rather than a whole-file diff on the next pin run.
  assert.equal(raw, `${JSON.stringify(pin, null, 2)}\n`);
  assert.ok(!raw.includes('\r'), 'CRLF line endings');
});
