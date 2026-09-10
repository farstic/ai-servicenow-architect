import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildReport, checkToJson, SCHEMA_KEYS, SCHEMA_VERSION, validateReport }
  from '../../tools/snowarch/lib/doctor/report-json.mjs';

/**
 * ARC-08-S01 — schema v1, and the validator that holds it.
 *
 * A hand-written validator rather than a schema library, because `tools/snowarch/` has no
 * dependencies and this would be the first. Its own negatives matter more than its positives: a
 * validator that accepts everything passes every fixture, and the first sign of that is a consumer
 * breaking on a report CI called valid.
 */
const valid = () => buildReport({
  results: [{ id: 'E-00', status: 'ok', detail: 'fine', durationMs: 3 }],
  checks: [{ id: 'E-00', section: 'prereqs', title: 't', severity: 'fail', quick: true, fixable: false }],
  summary: { ok: 1, warn: 0, fail: 0, skip: 0, fixable: 0 },
  ranAt: '2026-09-10T10:00:12Z',
});

test('a report built by the builder validates, and carries every v1 key', () => {
  const report = valid();
  assert.deepEqual(validateReport(report), []);
  assert.equal(report.schema, SCHEMA_VERSION);
  assert.deepEqual(Object.keys(report).sort(), [...SCHEMA_KEYS].sort());
});

test('the negatives — each one breaks the report in exactly one way', () => {
  const cases = [
    ['schema', (r) => { r.schema = 2; }, /schema/],
    ['product', (r) => { r.product = 'other'; }, /product/],
    ['ranAt', (r) => { r.ranAt = 'yesterday'; }, /ranAt/],
    ['a missing key', (r) => { delete r.summary; }, /summary: missing/],
    ['summary counts', (r) => { r.summary.ok = 'one'; }, /summary\.ok/],
    ['options', (r) => { r.options.quick = 'yes'; }, /options\.quick/],
    ['a check status', (r) => { r.checks[0].status = 'fine'; }, /checks\[0\]\.status/],
    ['a check key', (r) => { delete r.checks[0].fixable; }, /checks\[0\]\.fixable/],
    ['a filled-later key', (r) => { r.server = 'yes'; }, /server/],
    ['the mode line', (r) => { r.modeLine = 42; }, /modeLine/],
  ];
  for (const [name, breakIt, expected] of cases) {
    const report = valid();
    breakIt(report);
    const problems = validateReport(report);
    assert.ok(problems.length > 0, `${name} was accepted`);
    assert.ok(problems.some((p) => expected.test(p)),
      `${name}: expected a problem matching ${expected}, got ${problems.join(' | ')}`);
  }
});

test('a check result takes its section, title and severity from the CHECK, not from itself', () => {
  // A result that carried them could describe itself differently in the report than in the
  // registry — and the registry is what the filtering used.
  const json = checkToJson(
    { id: 'E-00', status: 'ok', detail: 'd', durationMs: 1, section: 'lies', title: 'lies' },
    { id: 'E-00', section: 'repo', title: 'the real title', severity: 'warn', quick: false, fixable: true });
  assert.equal(json.section, 'repo');
  assert.equal(json.title, 'the real title');
  assert.equal(json.severity, 'warn');
  assert.equal(json.fixable, true);
});

test('every optional field is NULL rather than absent — a consumer guards one shape, not two', () => {
  const json = checkToJson({ id: 'E-00', status: 'ok', detail: 'd', durationMs: 1 }, undefined);
  for (const key of ['remedy', 'command', 'code', 'section', 'title', 'severity']) {
    assert.ok(key in json, `${key} is missing`);
    assert.equal(json[key], key === 'severity' || key === 'section' || key === 'title' ? null : null);
  }
  assert.equal('data' in json, false, 'data appears only when a check produced some');
});
