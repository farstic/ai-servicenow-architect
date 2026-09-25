import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildReport, checkToJson, SCHEMA_KEYS, SCHEMA_VERSION, validateReport }
  from '../../tools/snowarch/lib/doctor/report-json.mjs';
import { tempDir } from '../../tools/snowarch/tests/helpers/temp.mjs';
import { REAL_ROOT } from './helpers/tree.mjs';

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

// ─── ARC-08-C35 — the key list is authoritative in BOTH directions ─────────────────────────────
//
// `CHECK_KEYS` was a REQUIRED-keys list and nothing else: the validator asked `if (!(key in c))`
// and never asked the reverse, so a field added to `checkToJson`'s literal travelled with nothing
// objecting. That is not hypothetical — it is how ARC-08-C34's control was written. Adding
// `textDetail` to `CHECK_KEYS` alone changed nothing that travels (the list does not strip), while
// adding it to the literal put a terminal-only string, and the folder path inside it, into the
// `--json` a stranger is asked to paste. Only two per-check boundary cases in the legacy section
// stood against that, and only for the checks they name.
//
// The top level already had this property, asserted in the first test above
// (`Object.keys(report)` deep-equals `SCHEMA_KEYS`). The per-check entries did not.
//
// `data` IS allowed, and measured rather than assumed: on a real 41-check report the only key
// outside `CHECK_KEYS` is `data`, present on all 41. It is the check's own payload — the thing
// consumers read — and it is spread conditionally in the literal, so it is optional rather than
// required. Everything else is a mistake until somebody names it here.

test('ARC-08-C35 — an unexpected key on a check entry is refused, naming it', () => {
  const report = valid();
  report.checks[0].textDetail = 'a terminal-only string with /a/user/folder in it';
  const problems = validateReport(report);
  assert.ok(problems.length > 0,
    'an unexpected key on a check entry was accepted — the list is still one-directional');
  assert.ok(problems.some((p) => /checks\[0\]\.textDetail/.test(p)),
    `the problem does not name the offending key: ${problems.join(' | ')}`);
});

test('ARC-08-C35 — `data` is the one key allowed beyond the required list', () => {
  // Both directions, because a guard that refused `data` would refuse every real report, and one
  // that allowed anything would be the defect restated.
  const withData = valid();
  withData.checks[0].data = { entries: [] };
  assert.deepEqual(validateReport(withData), [], 'a check carrying its own payload was refused');

  const withoutData = valid();
  delete withoutData.checks[0].data;
  assert.deepEqual(validateReport(withoutData), [],
    '`data` was treated as required — the literal spreads it conditionally, so it may be absent');
});

test('ARC-08-C35 — the guard holds on a REAL report, through the script CI runs', async (t) => {
  // THE SITE, not the mechanism. ARC-08-C34 was green at the unit level for as long as the property
  // was dead on the real path, because every case called the function directly. So this one produces
  // an actual `--json` report from the CLI and hands it to `scripts/ci/validate-report.mjs`, which is
  // what the release job runs.
  const dir = tempDir('snowarch-schema-cli-', t);
  const file = join(dir, 'doctor.json');
  const produced = spawnSync(process.execPath,
    [join(REAL_ROOT, 'tools/snowarch/bin/snowarch.mjs'), 'doctor', '--quick', '--json', '--no-cache'],
    { cwd: REAL_ROOT, encoding: 'utf8' });
  assert.ok(produced.stdout.length > 0, `the CLI produced no report: ${produced.stderr}`);
  writeFileSync(file, produced.stdout);

  const validate = (p) => spawnSync(process.execPath,
    [join(REAL_ROOT, 'scripts/ci/validate-report.mjs'), p], { cwd: REAL_ROOT, encoding: 'utf8' });

  // Not vacuous: today's real report passes, `data` and all.
  const clean = validate(file);
  assert.equal(clean.status, 0,
    `a real report was refused — the allowed set is wrong: ${clean.stdout}${clean.stderr}`);

  // ...and the same report with one unexpected key is refused, by the script, by name.
  const report = JSON.parse(produced.stdout);
  report.checks[0].textDetail = 'terminal-only, with /a/user/folder in it';
  writeFileSync(file, JSON.stringify(report));
  const dirty = validate(file);
  assert.notEqual(dirty.status, 0, 'the script accepted a report carrying an unexpected key');
  assert.match(`${dirty.stdout}${dirty.stderr}`, /textDetail/,
    `the script did not name the offending key: ${dirty.stdout}${dirty.stderr}`);
});
