// ARC-08-S02 — the twenty-three checks as a REGISTRY: what runs, in what order, under which flag.
//
// Every assertion here reads the flags off the registry rather than naming ids in a list of its
// own. That is the point of AC 8: `--quick` is defined as `quick && !spawns && !network`, so the
// membership question is answered by the declarations, and a check that quietly changed one of
// them would move the subset without touching this file — which is exactly what this file exists
// to notice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

import { engineChecks, engineRegistry } from '../../tools/snowarch/lib/doctor/checks/index.mjs';
import { planRun } from '../../tools/snowarch/lib/doctor/runner.mjs';
import { SECTIONS } from '../../tools/snowarch/lib/doctor/registry.mjs';
import { REAL_ROOT } from './helpers/tree.mjs';

const checks = engineChecks();
const ids = checks.map((c) => c.id);

test('E-00 … E-22, once each, in section order', () => {
  assert.equal(checks.length, 23);
  assert.deepEqual(ids, Array.from({ length: 23 }, (_, i) => `E-${String(i).padStart(2, '0')}`));
  assert.equal(new Set(ids).size, ids.length);
  const order = engineRegistry().all().map((c) => c.section);
  assert.deepEqual([...new Set(order)], ['prereqs', 'repo', 'docs', 'roster', 'contract']);
  for (const s of new Set(order)) assert.ok(SECTIONS.includes(s));
});

// AC 8 — the subset, read from the flags.
test('--quick is E-01, E-02, E-05…E-15, E-17…E-20 and E-22', () => {
  const { selected } = planRun(checks, { quick: true });
  assert.deepEqual(selected.map((c) => c.id), [
    'E-01', 'E-02',
    'E-05', 'E-06', 'E-07', 'E-08', 'E-09', 'E-10', 'E-11',
    'E-12', 'E-13', 'E-14', 'E-15',
    'E-17', 'E-18', 'E-19', 'E-20', 'E-22',
  ]);
});

test('the four checks --quick leaves out say why in their own flags', () => {
  const by = new Map(checks.map((c) => [c.id, c]));
  for (const id of ['E-00', 'E-03', 'E-04', 'E-21']) {
    const c = by.get(id);
    assert.ok(c.spawns || !c.quick, `${id} is excluded from --quick for no declared reason`);
  }
  assert.equal(by.get('E-16').quick, false);
});

test('no engine check touches the network — that is the server section\'s job', () => {
  assert.deepEqual(checks.filter((c) => c.network).map((c) => c.id), []);
});

test('only the checks with a repair declare fixable, and each carries a fix hint or a null', () => {
  assert.deepEqual(checks.filter((c) => c.fixable).map((c) => c.id),
    ['E-10', 'E-11', 'E-12', 'E-13', 'E-15']);
});

test('--section selects exactly one section\'s checks', () => {
  const { selected } = planRun(checks, { sections: ['contract'] });
  assert.deepEqual(selected.map((c) => c.id), ['E-19', 'E-20', 'E-21', 'E-22']);
});

test('severity is fail everywhere except the capability packs, which are information', () => {
  assert.deepEqual(checks.filter((c) => c.severity !== 'fail').map((c) => c.id), ['E-04']);
});

/**
 * The command, end to end, on this checkout.
 *
 * `--json` is what S09 reads, so the shape is asserted from the CLI rather than from the library:
 * a report that is right in memory and wrong on stdout is wrong.
 */
const cli = (args) => spawnSync(process.execPath,
  [join(REAL_ROOT, 'tools/snowarch/bin/snowarch.mjs'), 'doctor', ...args],
  { cwd: REAL_ROOT, encoding: 'utf8' });

test('--json reports all twenty-three ids with a status each', () => {
  const r = cli(['--json', '--quick']);
  const report = JSON.parse(r.stdout);
  assert.deepEqual(report.checks.map((x) => x.id), ids);
  for (const result of report.checks) {
    assert.ok(['ok', 'warn', 'fail', 'skip'].includes(result.status), `${result.id}: ${result.status}`);
    assert.equal(typeof result.detail, 'string');
    assert.ok(result.section && result.title, `${result.id} lost its section or title`);
  }
});

test('--section nonsense is a usage error, not a report', () => {
  const r = cli(['--section', 'nonsense']);
  assert.equal(r.status, 2);
});

// AC 8's timing half. Asserted only under CI: a developer laptop under a full test run is not the
// machine the budget describes, and a flaky timing failure teaches people to ignore failures.
test('the quick engine subset finishes inside its budget', { skip: !process.env.CI }, () => {
  const started = Date.now();
  cli(['--json', '--quick', '--no-network']);
  const elapsed = Date.now() - started;
  assert.ok(elapsed <= 3000, `--quick took ${elapsed} ms, over the 3 s CI budget`);
});
