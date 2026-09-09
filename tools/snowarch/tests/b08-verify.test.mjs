import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  NO_INSTANCE, PROBES_UNAVAILABLE, compareCapabilities, compareTools, differentStore, runProbes,
  timeoutSentence, run as runB08,
} from '../lib/steps/B08.mjs';
import { CACHE_VERSION, COMPATIBILITY_KEYS, cachePath, summarise, writeDoctorCache } from '../lib/doctor-cache.mjs';
import { register, reset } from '../lib/redact.mjs';
import { makeCheckout } from './helpers/workspace.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const isWindows = process.platform === 'win32';
const contract = JSON.parse(readFileSync(join(repoRoot, 'packages/snowarch/dist/contract.json'), 'utf8'));
const pin = JSON.parse(readFileSync(join(repoRoot, 'packages/contract/required-tools.json'), 'utf8'));
const allNames = contract.tools.map((t) => t.name);

test('the counts come from the files, never from this test', () => {
  // The story quotes 398 and the contract has 397 today. A test that hard-coded either would be
  // wrong on one side of the next regeneration, so both sides are read.
  assert.ok(contract.tools.length > 300, 'the contract looks empty');
  assert.ok(pin.tools.length > 0);
  assert.equal(contract.server.suggestedName, JSON.parse(
    readFileSync(join(repoRoot, 'engine.config.json'), 'utf8')).mcp.serverKey);
});

test('a tool the contract does not know means dist/ is ahead of the pin', () => {
  // The name is DERIVED from a real one: written out, this file would carry a `snow_*` token the
  // contract does not declare, which is exactly what the L01 lint exists to find.
  const invented = `${allNames[0]}_${'invented'}`;
  const problems = compareTools({ advertised: [...allNames, invented], contract, pin,
    configured: true });
  assert.match(problems[0], new RegExp(`server advertises "${invented}" which is not in the pinned contract`));
  assert.match(problems[0], /dist\/ and contract out of sync/);
});

test('AC 5 — a pinned tool the server does not advertise names its used_by', () => {
  const fictitious = `${allNames[0]}_${'pinned'}`;
  const problems = compareTools({
    advertised: allNames, contract,
    pin: { tools: [...pin.tools, { name: fictitious, used_by: ['governance §2.1', 'developer'] }] },
    configured: true,
  });
  assert.match(problems[0], new RegExp(`server does not advertise "${fictitious}"`));
  // The `used_by` entries are the FILES that will break, which is what makes this actionable.
  assert.match(problems[0], /governance §2\.1, developer/);

  const noConsumer = compareTools({ advertised: allNames, contract,
    pin: { tools: [{ name: fictitious }] }, configured: true });
  assert.match(noConsumer[0], /an unrecorded consumer/);
});

test('a configured server must advertise the whole catalogue, gated or not', () => {
  const short = compareTools({ advertised: allNames.slice(0, -1), contract,
    pin: { tools: [] }, configured: true });
  assert.match(short[0], new RegExp(`advertises ${allNames.length - 1} tools, the contract has ${allNames.length}`));
  assert.deepEqual(compareTools({ advertised: allNames, contract, pin: { tools: [] }, configured: true }), []);
});

test('unconfigured is a different expectation, not a relaxed one', async () => {
  const { CORE_TOOLS_UNCONFIGURED } = await import(
    join(repoRoot, 'packages/snowarch/dist/tools/status.js'));
  const core = [...CORE_TOOLS_UNCONFIGURED];
  assert.deepEqual(compareTools({ advertised: core, contract, pin, configured: false,
    coreTools: core }), []);

  // More than the core set without a store would be offering tools the server cannot serve.
  const extra = compareTools({ advertised: [...core, allNames[0]], contract, pin, configured: false,
    coreTools: core });
  assert.match(extra[0], new RegExp(`unconfigured server advertises ${core.length + 1} tools, expected the ${core.length} core tools`));
});

test('AC 3 — capabilities that describe another store get the sentence naming SNOW_STORE', () => {
  const entry = { environment: 'pdi', preset: 'full', flags: { WRITE_ENABLED: 'true' } };
  assert.deepEqual(compareCapabilities({ label: 'pdi', environment: 'pdi', preset: 'full',
    flags: { WRITE_ENABLED: 'true' } }, entry, 'pdi'), []);

  const wrongLabel = compareCapabilities({ label: 'other' }, entry, 'pdi');
  assert.match(wrongLabel[0], /server reports instance "other", the store's default is "pdi"/);

  const wrongFlag = compareCapabilities({ label: 'pdi', flags: { WRITE_ENABLED: 'false' } }, entry, 'pdi');
  assert.match(wrongFlag[0], /server reports WRITE_ENABLED=false, the store says true/);

  assert.match(differentStore('~/elsewhere/instances.json'),
    /^server sees a different store than the bootstrap wrote \(~\/elsewhere\/instances\.json\) — SNOW_STORE set in your shell\?$/);
  // A server that answered nothing is not a mismatch — it is a server with no instance.
  assert.deepEqual(compareCapabilities(null, entry, 'pdi'), []);
});

test('AC 4 — the timeout sentence names MCP_TIMEOUT and where to read about it', () => {
  assert.equal(timeoutSentence(1),
    'server did not answer initialize within 1 ms — cold start too slow for MCP_TIMEOUT; '
    + 'see docs/TROUBLESHOOTING.md "MCP_TIMEOUT"');
});

test('the probes path degrades to a WARN while ARC-07-S06 is unwritten', () => {
  const root = makeCheckout();
  mkdirSync(join(root, 'packages/snowarch/dist/cli'), { recursive: true });
  writeFileSync(join(root, 'packages/snowarch/dist/cli/index.js'), '// placeholder\n');

  const withoutTest = runProbes(root, { run: () => ({ stdout: 'Usage: instance list', stderr: '' }) });
  assert.equal(withoutTest.status, 'unavailable');
  assert.equal(withoutTest.probes, null);
  assert.equal(PROBES_UNAVAILABLE, 'probes: not available in this build');

  // ...and runs them once the sub-command exists. This flips when ARC-07-S06 lands.
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
  assert.equal(cache.mode, 'live');
});
