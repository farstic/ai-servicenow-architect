import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createRegistry, defineCheck, SECTIONS } from '../../tools/snowarch/lib/doctor/registry.mjs';
import { applyContractRemedy, planRun, runChecks, summarise } from '../../tools/snowarch/lib/doctor/runner.mjs';
import { buildReport, SCHEMA_KEYS, validateReport } from '../../tools/snowarch/lib/doctor/report-json.mjs';
import {
  headerLine, renderText, statusLabel, summaryLine, useColour,
} from '../../tools/snowarch/lib/doctor/report-text.mjs';
import { collectPrereqs, guessShell, SHELLS } from '../../tools/snowarch/lib/doctor/prereqs.mjs';
import { doctorCommand, findRoot, notAtRoot } from '../../tools/snowarch/lib/doctor/index.mjs';
import { tempDir } from '../../tools/snowarch/tests/helpers/temp.mjs';

/**
 * ARC-08-S01 — the doctor framework, before any check exists.
 *
 * The registry ships EMPTY on purpose, and that is what makes these tests the specification: every
 * one of them registers the check it needs. What is proved here is the HARNESS — that a check which
 * throws becomes a failing result rather than a stack trace, that `--no-network` is a promise about
 * what RAN and not about what was reported, that the JSON has every key of schema v1 from the first
 * commit, and that a check cannot reach the output without passing the redactor.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLI = join(root, 'tools/snowarch/bin/snowarch.mjs');
const ESC = String.fromCharCode(27);

const check = (over = {}) => defineCheck({
  id: 'E-00', section: 'prereqs', title: 'a check', severity: 'fail',
  quick: true, network: false, spawns: false, fixable: false,
  run: async () => ({ status: 'ok', detail: 'fine' }),
  ...over,
});

const run = (args, cwd = root, env = {}) => spawnSync(process.execPath, [CLI, 'doctor', ...args],
  { encoding: 'utf8', cwd, env: { ...process.env, ...env } });

// S02 filled the registry, so the empty case is now asked of the COMMAND with an empty one passed
// in rather than of the CLI: "a run that reports zero checks and exits 0" is a statement about the
// harness, and the harness is what stays true after twenty-three checks are registered.
test('AC 1 — an empty registry is a valid report, zero checks, exit 0', async () => {
  const out = { chunks: [], write(text) { this.chunks.push(text); } };
  const code = await doctorCommand({ flags: { json: true, 'no-cache': true }, out,
    cwd: root, registry: createRegistry() });
  assert.equal(code, 0);
  const report = JSON.parse(out.chunks.join(''));
  assert.deepEqual(validateReport(report), []);
  assert.equal(report.summary.ok, 0);
  assert.deepEqual(report.checks, []);
  // Every key of schema v1 exists on day one, `null` where a later story fills it.
  assert.deepEqual(Object.keys(report).sort(), [...SCHEMA_KEYS].sort());
  for (const key of ['mode', 'modeLine', 'modeLineDetailed', 'server', 'stale']) {
    assert.equal(report[key], null, `${key} must be null until its story fills it`);
  }
});

test('AC 1 — a failing check exits 1, and one that THROWS is a result, not a stack trace', async () => {
  const registry = createRegistry([
    check({ id: 'E-00', run: async () => ({ status: 'fail', detail: 'broken' }) }),
    check({ id: 'E-01', section: 'repo', run: async () => { throw new Error('nope'); } }),
  ]);
  const { results, summary } = await runChecks(registry.all(), { contract: null }, {});
  assert.equal(summary.fail, 2);
  const crashed = results.find((r) => r.id === 'E-01');
  assert.equal(crashed.status, 'fail');
  assert.match(crashed.detail, /^check crashed: nope/);
  // The other check still ran: one bad answer does not end the report.
  assert.equal(results.find((r) => r.id === 'E-00').status, 'fail');
});

test('AC 2 — a run from a sub-directory is exit 3 and names the directory to cd to', (t) => {
  const dir = tempDir('doctor-subdir-', t);
  mkdirSync(join(dir, 'clients', 'acme'), { recursive: true });
  writeFileSync(join(dir, 'engine.config.json'), JSON.stringify({
    docs: { pin: 'a'.repeat(40), family: 'australia', areasFile: 'vendor/docs-areas.txt', upstream: 'file:///dev/null' },
    mcp: { serverKey: 'servicenow', packageDir: 'packages/snowarch' },
    floors: { node: '20.0.0', claudeCode: '2.1.214', git: '2.34.1' },
  }, null, 2));

  const r = run(['--no-cache'], join(dir, 'clients', 'acme'));
  assert.equal(r.status, 3, r.stdout + r.stderr);
  // The exact sentence, with the root it found — a remedy naming the wrong directory sends the
  // reader somewhere they cannot fix it.
  assert.ok(`${r.stdout}${r.stderr}`.includes('DOCTOR: not at the repository root — run: cd '),
    `${r.stdout}${r.stderr}`);
  assert.equal(notAtRoot('/x/y'), 'DOCTOR: not at the repository root — run: cd /x/y');
  assert.equal(findRoot(join(dir, 'clients', 'acme')), dir);
});

test('AC 2 — Node below the floor is exit 3, before anything else runs', (t) => {
  const dir = tempDir('doctor-floor-', t);
  writeFileSync(join(dir, 'engine.config.json'), JSON.stringify({
    docs: { pin: 'a'.repeat(40), family: 'australia', areasFile: 'vendor/docs-areas.txt', upstream: 'file:///dev/null' },
    mcp: { serverKey: 'servicenow', packageDir: 'packages/snowarch' },
    // A floor no current Node meets. The shim is the CONFIG, never a different Node: a test that
    // needed an old runtime would be a test that never runs.
    floors: { node: '99.0.0', claudeCode: '2.1.214', git: '2.34.1' },
  }, null, 2));
  const r = run(['--no-cache'], dir);
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.match(r.stdout, /below the floor 99\.0\.0/);
  assert.match(r.stdout, /brew install node@22/);
});

test('AC 4 — --section filters, and an unknown one is exit 2 with the list', () => {
  const bogus = run(['--section', 'bogus', '--no-cache']);
  assert.equal(bogus.status, 2);
  assert.equal(bogus.stdout.trim(), `unknown section "bogus"; valid: ${SECTIONS.join(', ')}`);

  const good = run(['--section', 'prereqs,docs', '--json', '--no-cache']);
  // NOT `status === 0`. S02 filled the registry, so the exit code of a real run is a fact about the
  // MACHINE — a CI cell has no `claude` on PATH and may have no corpus, and both are FAILs the
  // doctor is right to report. What `--section` promises is which checks ran, and that the flag is
  // echoed back; asserting a health verdict here made this test a check on the runner's laptop.
  assert.ok([0, 1].includes(good.status), `unexpected exit ${good.status}`);
  const report = JSON.parse(good.stdout);
  assert.equal(report.options.section, 'prereqs,docs');
  const ran = report.checks.filter((c) => c.status !== 'skip');
  assert.ok(ran.length > 0, 'the section selected nothing at all');
  assert.deepEqual([...new Set(ran.map((c) => c.section))].sort(), ['docs', 'prereqs']);
  for (const c of report.checks.filter((c) => !['docs', 'prereqs'].includes(c.section))) {
    assert.equal(c.detail, 'not in --section', `${c.id} ran outside the selected sections`);
  }
});

test('the filtering rules: --quick excludes spawns and network, and implies --no-network', () => {
  const checks = [
    check({ id: 'E-00', quick: true }),
    check({ id: 'E-01', section: 'repo', quick: true, spawns: true }),
    check({ id: 'E-02', section: 'host', quick: true, network: true }),
    check({ id: 'E-03', section: 'docs', quick: false }),
  ];
  const quick = planRun(checks, { quick: true });
  assert.deepEqual(quick.selected.map((c) => c.id), ['E-00']);
  assert.deepEqual(quick.skipped.map((s) => `${s.check.id}:${s.reason}`),
    ['E-01:not in the --quick subset', 'E-02:not in the --quick subset', 'E-03:not in the --quick subset']);

  const offline = planRun(checks, { noNetwork: true });
  assert.deepEqual(offline.selected.map((c) => c.id), ['E-00', 'E-01', 'E-03']);
  assert.equal(offline.skipped[0].reason, '--no-network');

  // `server` selects every SV- check whatever section it declares.
  const withServer = [...checks, check({ id: 'SV-00', section: 'server' })];
  assert.deepEqual(planRun(withServer, { sections: ['server'] }).selected.map((c) => c.id), ['SV-00']);
});

test('a skipped check is REPORTED, with the reason — absence would read as a pass', async () => {
  const registry = createRegistry([check({ id: 'E-02', section: 'host', network: true })]);
  const { results, summary } = await runChecks(registry.all(), { contract: null }, { noNetwork: true });
  assert.equal(results[0].status, 'skip');
  assert.equal(results[0].detail, '--no-network');
  assert.equal(summary.skip, 1);
});

test('report order is REGISTRY order, whatever order the run took', async () => {
  const registry = createRegistry([
    check({ id: 'SV-00', section: 'server' }),
    check({ id: 'E-05', section: 'docs' }),
    check({ id: 'E-00', section: 'prereqs' }),
  ]);
  const { results } = await runChecks(registry.all(), { contract: null }, {});
  // prereqs, then docs, then server — `SECTIONS` order, not registration order.
  assert.deepEqual(results.map((r) => r.id), ['E-00', 'E-05', 'SV-00']);
});

test("a check may set `code` OR `remedy`, never both — a code's remedy is the contract's", () => {
  const contract = { errorCodes: [{ code: 'X_FAILED', remedy: 'do the thing', command: './snowarch x' }] };
  const filled = applyContractRemedy({ id: 'E-00', status: 'fail', detail: 'd', code: 'X_FAILED' }, contract);
  assert.equal(filled.remedy, 'do the thing');
  assert.equal(filled.command, './snowarch x');
  assert.throws(
    () => applyContractRemedy({ id: 'E-00', code: 'X_FAILED', remedy: 'my own words' }, contract),
    /may set `code` or `remedy`, not both/);
});

test('defineCheck refuses a check that has not said what it does', () => {
  for (const [field, value] of [['id', 'E00'], ['section', 'nowhere'], ['severity', 'loud'],
    ['network', undefined], ['quick', 'yes'], ['run', null]]) {
    assert.throws(() => check({ [field]: value }), new RegExp(field === 'id' ? 'id must be' : field),
      `${field} was accepted`);
  }
  // And an id may not be registered twice: a retired check keeps its number (S07).
  const registry = createRegistry([check({ id: 'E-00' })]);
  assert.throws(() => registry.add(check({ id: 'E-00' })), /duplicate check id/);
});

test('the summary counts fixable FAILURES, not fixable checks', () => {
  const checks = [check({ id: 'E-00', fixable: true }), check({ id: 'E-01', section: 'repo', fixable: true })];
  const summary = summarise([{ id: 'E-00', status: 'fail' }, { id: 'E-01', status: 'ok' }], checks);
  assert.equal(summary.fixable, 1, 'a fixable check that PASSED is nothing to fix');
});

test('the renderer: FAIL shouts, the Mode line is last, colour only on a TTY', () => {
  const checks = [check({ id: 'E-00', fixable: true })];
  const report = buildReport({
    results: [{ id: 'E-00', status: 'fail', detail: 'broken', remedy: 'run the thing', durationMs: 1 }],
    checks,
    summary: { ok: 0, warn: 0, fail: 1, skip: 0, fixable: 1 },
    ranAt: '2026-09-10T10:00:12Z',
    modeLine: 'Mode: design-only',
  });
  const text = renderText({ report, checks, colour: false });
  const lines = text.split('\n');
  assert.match(text, /E-00 FAIL {2}a check: broken/);
  assert.match(text, /→ run the thing {3}\[fixable: \.\/snowarch doctor --fix\]/);
  assert.equal(lines.at(-1), 'Mode: design-only', 'the Mode line must be the last line');
  assert.equal(lines.at(-2), 'DOCTOR: 0 ok, 0 warn, 1 fail (1 fixable — run ./snowarch doctor --fix)');
  assert.equal(statusLabel('fail'), 'FAIL');
  assert.equal(statusLabel('ok'), 'ok');

  // Colour: only on a TTY, and never when NO_COLOR is set. Asserted on the escape byte itself,
  // built from its code point so this file carries no control character.
  assert.equal(useColour({ stream: { isTTY: false }, env: {} }), false);
  assert.equal(useColour({ stream: { isTTY: true }, env: {} }), true);
  assert.equal(useColour({ stream: { isTTY: true }, env: { NO_COLOR: '1' } }), false);
  assert.ok(!text.includes(ESC), 'a piped report must carry no escape codes');
  assert.ok(renderText({ report, checks, colour: true }).includes(ESC));

  assert.match(headerLine({ version: '2.0.0', ranAt: '2026-09-10T10:00:12Z', options: { quick: true } }),
    /quick: yes · network: yes · section: all/);
  assert.equal(summaryLine({ ok: 1, warn: 0, fail: 0, skip: 2, fixable: 0 }),
    'DOCTOR: 1 ok, 0 warn, 0 fail, 2 skipped');
});

test('the prereqs object answers the six fields ARC-07-S09 branches on', (t) => {
  const dir = tempDir('doctor-prereqs-', t);
  mkdirSync(join(dir, '.claude'), { recursive: true });
  writeFileSync(join(dir, '.claude', 'settings.local.json'), '{"disabledMcpjsonServers":["servicenow"]}');
  const config = { mcp: { serverKey: 'servicenow' }, floors: { node: '20.0.0' } };

  const prereqs = collectPrereqs({ root: dir, config, platform: 'darwin', shell: 'zsh' });
  assert.deepEqual(Object.keys(prereqs).sort(), ['deps', 'mode', 'node', 'os', 'shell', 'store']);
  assert.equal(prereqs.os, 'darwin');
  assert.equal(prereqs.mode.toggle, 'disabled');
  assert.equal(prereqs.store.exists, false);
  assert.equal(prereqs.node.ok, true);

  // Three toggle states, three different answers: a checkout that never ran the bootstrap and one
  // that deliberately turned the server off need different sentences.
  writeFileSync(join(dir, '.claude', 'settings.local.json'), '{"disabledMcpjsonServers":[]}');
  assert.equal(collectPrereqs({ root: dir, config }).mode.toggle, 'enabled');
  assert.equal(collectPrereqs({ root: tempDir('doctor-prereqs-bare-', t), config }).mode.toggle, 'absent');

  // `unknown` is a first-class answer — this one is a guess, and a wrong guess sends a reader a
  // command their shell cannot run.
  assert.ok(SHELLS.includes(guessShell({ platform: 'win32', env: {} })));
  assert.equal(guessShell({ platform: 'win32', env: { PSModulePath: 'x' } }), 'powershell');
  assert.equal(guessShell({ platform: 'linux', exec: () => { throw new Error('no ps'); } }), 'unknown');
});
