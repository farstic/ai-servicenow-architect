import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { NO_INSTANCE, PROBES_UNAVAILABLE, SERVER_IDS, runProbes, run as runB08 }
  from '../lib/steps/B08.mjs';
import { CACHE_VERSION, COMPATIBILITY_KEYS, cachePath, summarise, writeDoctorCache } from '../lib/doctor-cache.mjs';
import { register, reset } from '../lib/redact.mjs';
import { makeCheckout } from './helpers/workspace.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const isWindows = process.platform === 'win32';
const contract = JSON.parse(readFileSync(join(repoRoot, 'packages/snowarch/dist/contract.json'), 'utf8'));
const pin = JSON.parse(readFileSync(join(repoRoot, 'packages/contract/required-tools.json'), 'utf8'));
const allNames = contract.tools.map((t) => t.name);

/**
 * ARC-08-S05 moved the comparisons out of this step.
 *
 * B08 used to speak MCP itself and compare the tool list and the capabilities against the pin;
 * the doctor's `server` section now does both, with the same child. The six tests that asserted
 * those comparisons moved to `tests/doctor/server.test.mjs`, where the code they describe lives.
 * What stays here is what B08 still owns: the probes it runs through the CLI, the cache the
 * install leaves for the banner, and the step's own verdict.
 */
test('the counts come from the files, never from this test', () => {
  // The story quotes 398 and the contract has 397 today. A test that hard-coded either would be
  // wrong on one side of the next regeneration, so both sides are read.
  assert.ok(contract.tools.length > 300, 'the contract looks empty');
  assert.ok(pin.tools.length > 0);
  assert.equal(contract.server.suggestedName, JSON.parse(
    readFileSync(join(repoRoot, 'engine.config.json'), 'utf8')).mcp.serverKey);
});

test('the probes path RUNS now that ARC-07-S06 exists — and still degrades if it ever does not', () => {
  const root = makeCheckout();
  mkdirSync(join(root, 'packages/snowarch/dist/cli'), { recursive: true });
  writeFileSync(join(root, 'packages/snowarch/dist/cli/index.js'), '// placeholder\n');

  const withoutTest = runProbes(root, { run: () => ({ stdout: 'Usage: instance list', stderr: '' }) });
  assert.equal(withoutTest.status, 'unavailable');
  assert.equal(withoutTest.probes, null);
  assert.equal(PROBES_UNAVAILABLE, 'probes: not available in this build');

  // THE FLIP (ARC-07-S06). The arm above is now hypothetical — the real built CLI lists `test`,
  // so a real installation takes the arm below and B08 records probes instead of a WARN. The
  // detection is a regex over `instance --help`, so the assertion is made against the help text
  // the shipped CLI actually prints rather than against a fixture that agrees with itself.
  const realHelp = spawnSync(process.execPath,
    [join(repoRoot, 'packages/snowarch/dist/cli/index.js'), 'instance', '--help'],
    { encoding: 'utf8' });
  assert.match(`${realHelp.stdout ?? ''}`, /\btest\b/,
    'the shipped CLI must list `test`, or B08 goes back to reporting probes as unavailable');

  const calls = [];
  const withTest = runProbes(root, { run: (exec, args) => {
    calls.push(args.slice(-3).join(' '));
    if (args.includes('--help')) return { stdout: 'Usage: instance list|test', stderr: '' };
    if (args.includes('list')) return { stdout: '{"instances":[{"label":"pdi"}]}', stderr: '' };
    return { stdout: '{"auth":"ok","write":"ok"}', stderr: '' };
  } });
  assert.equal(withTest.status, 'ok');
  assert.deepEqual(withTest.probes, { pdi: { auth: 'ok', write: 'ok' } });
  assert.ok(calls.some((c) => c.includes('test pdi --json')), calls.join(' | '));

  // No CLI at all is "unavailable" too, not a crash.
  assert.equal(runProbes(makeCheckout()).status, 'unavailable');
});

test('the cache is v1, 0600, and carries the keys ARC-08 is allowed to rely on', () => {
  const root = makeCheckout();
  const written = writeDoctorCache(root, {
    mode: 'live', engineVersion: '2.0.0-test', contractSha: 'abc123def456',
    instance: { label: 'pdi', environment: 'pdi', preset: 'full', flags: {}, probes: 'unavailable' },
    server: { initializeMs: 120, toolCount: 5, protocolVersion: '2025-11-25' },
    checks: [{ id: 'B08-handshake', status: 'ok', detail: '5 tools' },
      { id: 'B08-probes', status: 'warn', detail: PROBES_UNAVAILABLE }],
  });

  assert.equal(written.version, CACHE_VERSION);
  for (const key of COMPATIBILITY_KEYS) {
    assert.ok(key in written, `${key} is a compatibility key ARC-08 relies on`);
  }
  assert.deepEqual(written.summary, { ok: 1, warn: 1, fail: 0 });
  assert.deepEqual(summarise([{ status: 'fail' }, { status: 'fail' }]), { ok: 0, warn: 0, fail: 2 });

  const onDisk = JSON.parse(readFileSync(cachePath(root), 'utf8'));
  assert.deepEqual(onDisk, written);
  assert.equal(onDisk.instance.label, 'pdi', 'a label is not a secret');
  if (!isWindows) assert.equal(statSync(cachePath(root)).mode & 0o777, 0o600);
});

test('AC 6 — the cache refuses a URL, an address or a registered secret', () => {
  const root = makeCheckout();
  assert.throws(() => writeDoctorCache(root, { mode: 'live',
    checks: [{ id: 'x', status: 'ok', detail: 'connected to https://example.service-now.invalid' }] }),
  /looks like a URL or an address/);
  assert.equal(existsSync(cachePath(root)), false, 'a refused write must leave nothing behind');

  reset();
  const secret = `${'pw'}-${'Q4t'.repeat(4)}`;
  register(secret);
  assert.throws(() => writeDoctorCache(root, { mode: 'live',
    checks: [{ id: 'x', status: 'ok', detail: `saved with ${secret}` }] }),
  /the redactor would rewrite it/);
  reset();
});

test('AC 2 — B08 against the REAL server with no store: five tools, a WARN, exit 0', async () => {
  // The whole step, end to end, on the committed `dist/server.js`. `runProbes` is stubbed because
  // ARC-07-S06 does not exist yet; everything else is the product.
  const root = repoRoot;
  const lines = [];
  const r = await runB08({
    root, mode: 'live', env: { ...process.env, SNOW_STORE: join(root, '.local', 'no-store-b08-test.json') },
    config: JSON.parse(readFileSync(join(root, 'engine.config.json'), 'utf8')),
    state: { steps: {} }, line: (l) => lines.push(l), log: { debug: () => {} },
    runCli: () => ({ stdout: 'Usage: instance list', stderr: '' }),
  });

  assert.equal(r.status, 'warn', 'no instance is a warning, never a failed installation');
  assert.match(r.detail, /^\d+ tools, contract match$/);
  assert.equal(r.data.configured, false);
  assert.ok(lines.includes(`WARN B08: ${NO_INSTANCE}`), lines.join('\n'));
  assert.match(NO_INSTANCE, /\/snowarch setup-instance/);
  assert.ok(r.data.initializeMs > 0);

  const cache = JSON.parse(readFileSync(cachePath(root), 'utf8'));
  assert.equal(cache.summary.fail, 0);
  assert.equal(cache.server.toolCount, r.data.toolCount);
  // The cache's `mode` is the DERIVED mode now (ARC-08-S05), not the bootstrap's intent: this run
  // asked for live and has no instance, and the banner must print what is true rather than what
  // was requested. The Mode line it will print is in the file beside it.
  assert.equal(cache.writer, 'doctor');
  assert.match(cache.modeLine, /^Mode: /);
  assert.equal(cache.mode, cache.modeLine.startsWith('Mode: live') ? 'live'
    : cache.modeLine.startsWith('Mode: unknown') ? 'unknown' : 'design-only');
});

test('B08 and `doctor --section server` write the same shape', async () => {
  // One writer, one shape: B08 IS the doctor's server section now, so a banner reading a cache
  // written by an install and one written by a `--section server` run cannot meet two layouts.
  const root = repoRoot;
  await runB08({
    root, mode: 'live', env: { ...process.env },
    config: JSON.parse(readFileSync(join(root, 'engine.config.json'), 'utf8')),
    state: { steps: {} }, line: () => {}, log: { debug: () => {} },
    runCli: () => ({ stdout: 'Usage: instance list', stderr: '' }),
  });
  const fromB08 = JSON.parse(readFileSync(cachePath(root), 'utf8'));

  // A `--section` run deliberately does NOT write the cache (a partial report must not look like
  // a full one), so the comparison is against a `--quick` run — which does. Asserting the section
  // rule here too, because without it this test would be comparing a file with itself.
  const before = statSync(cachePath(root)).mtimeMs;
  const sectioned = spawnSync(process.execPath,
    [join(root, 'tools/snowarch/bin/snowarch.mjs'), 'doctor', '--section', 'server', '--json'],
    { cwd: root, encoding: 'utf8', env: { ...process.env } });
  assert.ok([0, 1].includes(sectioned.status), sectioned.stderr);
  assert.equal(statSync(cachePath(root)).mtimeMs, before, '--section wrote the cache');

  const cli = spawnSync(process.execPath,
    [join(root, 'tools/snowarch/bin/snowarch.mjs'), 'doctor', '--quick', '--json'],
    { cwd: root, encoding: 'utf8', env: { ...process.env } });
  assert.ok([0, 1].includes(cli.status), cli.stderr);
  const direct = JSON.parse(readFileSync(cachePath(root), 'utf8'));

  assert.deepEqual(Object.keys(fromB08).sort(), Object.keys(direct).sort());
  assert.deepEqual(SERVER_IDS.filter((id) => !fromB08.checks.some((c) => c.id === id)), [],
    'the step reports on an id the cache does not carry');
  assert.deepEqual(SERVER_IDS.filter((id) => !direct.checks.some((c) => c.id === id)), []);
});
