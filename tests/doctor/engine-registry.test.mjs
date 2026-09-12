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

test('E-00 … E-28 and SV-00 … SV-09, once each, in section order', () => {
  assert.equal(checks.length, 39);
  assert.deepEqual(ids.filter((id) => id.startsWith('E-')),
    Array.from({ length: 29 }, (_, i) => `E-${String(i).padStart(2, '0')}`));
  assert.deepEqual(ids.filter((id) => id.startsWith('SV-')),
    Array.from({ length: 10 }, (_, i) => `SV-${String(i).padStart(2, '0')}`));
  assert.equal(new Set(ids).size, ids.length);
  const order = engineRegistry().all().map((c) => c.section);
  assert.deepEqual([...new Set(order)],
    ['prereqs', 'repo', 'docs', 'roster', 'contract', 'legacy', 'host', 'server']);
  for (const s of new Set(order)) assert.ok(SECTIONS.includes(s));
});

// S02's AC 8, extended by S03's detectors — the subset, still read from the flags.
test('--quick is fourteen checks: the ones that cost nothing to run (ARC-09-C8)', () => {
  const { selected } = planRun(checks, { quick: true });
  // ARC-09-C8 moved three GROUPS out — the docs checks that share `docsStatus`, the whole server
  // section (one in-process run of the server's own doctor), and the lint checks that share
  // `buildLintContext`. What is left is bounded: 89 ms of check time locally, slowest 20 ms.
  assert.deepEqual(selected.map((c) => c.id), [
    'E-01', 'E-02',
    'E-05', 'E-06', 'E-07', 'E-08', 'E-10', 'E-11',
    'E-17', 'E-18',
    'E-23', 'E-24', 'E-25', 'E-26',
  ]);
  // AC 8 of S03: `claude mcp get` is a process, so `--quick` never reaches it.
  assert.equal(selected.some((c) => c.id === 'E-27'), false);
});

test('the four checks --quick leaves out say why in their own flags', () => {
  const by = new Map(checks.map((c) => [c.id, c]));
  for (const id of ['E-00', 'E-03', 'E-04', 'E-21']) {
    const c = by.get(id);
    assert.ok(c.spawns || !c.quick, `${id} is excluded from --quick for no declared reason`);
  }
  assert.equal(by.get('E-16').quick, false);
});

test('two checks touch the network, and each says which question it is asking', () => {
  // ARC-09-S07 added E-28: the release-currency check asks the git REMOTE what tags exist, which
  // is a different network from SV-04's (the ServiceNow instance). Both are `network: true`, so
  // `--no-network` covers both, and nothing else in the engine reaches off the machine.
  assert.deepEqual(checks.filter((c) => c.network).map((c) => c.id), ['E-28', 'SV-04']);
  assert.deepEqual(checks.filter((c) => c.network).map((c) => c.section), ['host', 'server']);
});

test('only the checks with a repair declare fixable, and each carries a fix hint or a null', () => {
  assert.deepEqual(checks.filter((c) => c.fixable).map((c) => c.id),
    ['E-10', 'E-11', 'E-12', 'E-13', 'E-15', 'SV-01', 'SV-02', 'SV-03']);
});

test('--section selects exactly one section\'s checks', () => {
  const { selected } = planRun(checks, { sections: ['contract'] });
  assert.deepEqual(selected.map((c) => c.id), ['E-19', 'E-20', 'E-21', 'E-22']);
  // `server` is the section every SV check belongs to, and the runner also treats it as "every
  // SV- id, whatever section they declare" — the two agree here because they must.
  const server = planRun(checks, { sections: ['server'] });
  assert.deepEqual(server.selected.map((c) => c.id),
    checks.filter((c) => c.id.startsWith('SV-')).map((c) => c.id));
});

test('the detectors warn and the capability packs inform — only the engine\'s own state fails', () => {
  // SV-04 is a warn for the same reason the detectors are: a machine that is offline, or an
  // instance that is down, is not a broken installation.
  // A leftover, a synced folder, a proxy variable and an approval are things the USER chose. The
  // doctor names them and prints the command; failing a run over one would be this tool deciding
  // something that is theirs to decide.
  // E-28 joins them (ARC-09-S07): a checkout one release behind is a checkout that works, and a
  // doctor that FAILED over an available upgrade would be this tool deciding when a user upgrades.
  assert.deepEqual(checks.filter((c) => c.severity === 'warn').map((c) => c.id),
    ['E-23', 'E-24', 'E-25', 'E-26', 'E-27', 'E-28', 'SV-04']);
  assert.deepEqual(checks.filter((c) => c.severity === 'info').map((c) => c.id), ['E-04']);
});

test('nothing in the legacy or host sections offers itself to --fix', () => {
  for (const c of checks.filter((x) => ['legacy', 'host'].includes(x.section))) {
    assert.equal(c.fixable, false, `${c.id} is fixable — S03 removes nothing, not even under --fix`);
  }
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

test('--json reports every id with a status each', () => {
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

// AC 8's timing half is NOT asserted here (ARC-09-C24). `quick: true` is a cost contract with two
// enforcements that do not involve a clock: the shared-context half is static, in this file, with
// its own negative control, and the millisecond half is measured by `scripts/ci/check-timings.mjs`
// on five cells and read from the job summary. A stopwatch inside a parallel matrix cell measures
// the cell.

/**
 * ARC-08-S05 fixes the `--quick` MEMBERSHIP — S01 defined the flags, S02 asserted them from the
 * registry, and this asserts the same set from a REAL run's JSON. Two assertions, because they
 * fail differently: the registry one catches a flag changed by hand, and this one catches a
 * runner that stopped honouring them.
 */
test('--quick membership is the same set in the registry and in a real run', () => {
  const r = cli(['--json', '--quick', '--no-cache']);
  const report = JSON.parse(r.stdout);
  const ran = report.checks.filter((c) => c.detail !== 'not in the --quick subset').map((c) => c.id);
  const { selected } = planRun(checks, { quick: true });
  assert.deepEqual(ran, selected.map((c) => c.id));
  // The story's list, plus SV-08 — which post-dates it (the story predates ARC-08-S04's ninth
  // server check) and belongs where its flags put it: it reads directories and spawns nothing.
  assert.deepEqual(ran, [
    'E-01', 'E-02',
    'E-05', 'E-06', 'E-07', 'E-08', 'E-10', 'E-11',
    'E-17', 'E-18',
    'E-23', 'E-24', 'E-25', 'E-26',
  ]);
  // And the ones the story leaves out, for the reasons it gives: they spawn, walk the corpus or
  // use the network.
  assert.deepEqual(report.checks.filter((c) => c.detail === 'not in the --quick subset')
    // E-28 (ARC-09-S07) is out for BOTH of `--quick`'s reasons at once: it spawns git and it
    // reaches the network. E-09/E-12…E-15/E-19/E-20/E-22 and the whole SV- section left under
    // ARC-09-C8's cost contract.
    .map((c) => c.id), ['E-00', 'E-03', 'E-04', 'E-09', 'E-12', 'E-13', 'E-14', 'E-15', 'E-16',
    'E-19', 'E-20', 'E-21', 'E-22', 'E-27', 'E-28',
    'SV-00', 'SV-01', 'SV-02', 'SV-03', 'SV-04', 'SV-05', 'SV-06', 'SV-07', 'SV-08', 'SV-09']);
});

test('a quick run says so in the report a consumer reads', () => {
  const report = JSON.parse(cli(['--json', '--quick', '--no-cache']).stdout);
  assert.equal(report.options.quick, true);
  assert.equal(report.options.noNetwork, true, '--quick must imply --no-network');
  assert.match(report.modeLine, /^Mode: /);
});

/**
 * ARC-09-C8 — `quick` is a COST contract, and the cost is per SHARED RESOURCE.
 *
 * The banner's re-run path is `doctor({ quick: true, noNetwork: true })`, paid before a user's
 * first word of a session, and on `bootstrap (windows-latest, node 20)` it reached 1014 ms against
 * a 1000 ms budget. C5's phase table said where: 969 of 987 ms was the doctor spawn.
 *
 * What the per-check table then showed is the thing worth writing down. Three expensive contexts
 * are built once and cached on the run's ctx — `docsStatus` (three git spawns), the server
 * package's own doctor (one in-process run), and `buildLintContext` — and whichever check touches
 * one FIRST pays for all of them. So moving the expensive-looking check out does nothing: moving
 * E-12 put 143 ms onto E-13, and moving E-19 put 66 ms onto E-20. Both measured, both times the
 * total was unchanged.
 *
 * The rule is therefore about GROUPS: a check that reaches for a shared context is not quick,
 * whatever its own line in the table says. 776 ms of check time became 89 ms locally, with the
 * slowest remaining check at 20 ms.
 */
const SHARED_CONTEXTS = Object.freeze({
  docsFor: 'docsStatus — three git spawns, shared by E-12…E-15',
  serverReport: "the server package's own doctor, run in-process, shared by every SV- check",
  adopt: "the server package's own doctor, run in-process, shared by every SV- check",
  lintContextFor: 'buildLintContext, shared by E-19…E-22',
  runLint: 'buildLintContext, shared by E-19…E-22',
});

test('no --quick check reaches for a shared context (ARC-09-C8)', async () => {
  const { readFileSync: read, readdirSync: dir } = await import('node:fs');
  const { join: j } = await import('node:path');
  const here = j(REAL_ROOT, 'tools/snowarch/lib/doctor/checks');
  const { selected } = planRun(checks, { quick: true });
  const quickIds = new Set(selected.map((c) => c.id));

  const offenders = [];
  for (const file of dir(here).filter((f) => f.endsWith('.mjs'))) {
    const source = read(j(here, file), 'utf8');
    // Each check's body, from its `id:` to the next one — near enough to attribute a call, and
    // exact enough that a helper defined at the top of the file is not blamed on every check in it.
    const bodies = [...source.matchAll(/id: '([A-Z]+-\d+)',([\s\S]*?)(?=\n\s+id: '[A-Z]+-\d+',|$)/g)];
    for (const [, id, body] of bodies) {
      if (!quickIds.has(id)) continue;
      const code = body.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
      for (const [fn, why] of Object.entries(SHARED_CONTEXTS)) {
        if (new RegExp(`\\b${fn}\\(`).test(code)) offenders.push(`${id} calls ${fn}() — ${why}`);
      }
    }
  }

  assert.deepEqual(offenders, [],
    'a --quick check pays for a shared context; the whole group that shares it must leave --quick, '
    + 'because moving one member just moves the cost to the next');
});

test('the shared-context rule can actually fail (ARC-09-C8)', () => {
  // A negative control on the rule, the way ARC-09-C3's listener counts its own connection first:
  // a regex that stopped matching would report zero offenders for ever.
  const planted = "id: 'E-99',\n      quick: true,\n      run: async (ctx) => docsFor(ctx),\n";
  const body = /id: '([A-Z]+-\d+)',([\s\S]*)/.exec(planted)[2];
  assert.match(body, /\bdocsFor\(/, 'the rule would not catch a check that calls docsFor');
  // …and a comment mentioning it is the LESSON, not the call.
  const commented = "id: 'E-98',\n      // docsFor(ctx) is what E-12 does\n      quick: true,\n";
  const code = commented.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  assert.equal(/\bdocsFor\(/.test(code), false, 'a comment is being read as a call');
});
