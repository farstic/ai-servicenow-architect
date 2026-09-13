import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { serverReport } from '../lib/doctor/checks/server.mjs';

/**
 * ARC-06 acceptance, B06-01 — ARC-06-S08 AC 3, which asks for a failure the product deliberately
 * stopped producing.
 *
 * **AC 3 as written:** *"With `SNOW_STORE=/nonexistent` exported in the shell, B08 fails with the
 * 'different store' sentence naming `SNOW_STORE`."* Three things are wrong with it, all measured:
 *
 *   1. There is no "different store" sentence anywhere in the product. The only one naming the
 *      variable is SV-06's remedy — *"the running server is not reading the store this doctor read
 *      — restart it, and check SNOW_STORE"* (`packages/snowarch/src/doctor/checks.ts:510`). The
 *      backlog's "why uncovered" grepped for the wrong string and read "no match" as "no coverage".
 *   2. The ambient variable is **neutralised on purpose** since ARC-08-S05. `serverReport` saves it,
 *      replaces it with `ctx.storePath`, and restores it in a `finally` — with its own reason
 *      written above it: *"it makes a doctor run describe the root it was GIVEN, which is what B08,
 *      the CI smoke probe and every fixture-based test rely on."*
 *   3. Measured end to end on this checkout: `./snowarch doctor --json --no-network` with the
 *      variable unset and with `SNOW_STORE=/nonexistent/store.json` returns the SAME status for all
 *      ten SV checks. B08 cannot fail the way AC 3 describes.
 *
 * So the criterion is superseded, and what is asserted here is the invariant the design actually
 * has — **and its positive direction**, which is the half that makes it an assertion at all: two
 * runs can agree because both ignored the store, and a test that only compared them would keep
 * passing if those four lines were deleted and the doctor then read no store at all. So the first
 * case asserts what the server module SEES: the store it was given, never the ambient one.
 *
 * `serverReport` takes `serverAvailability` and `importServer`, so these four lines are exercised
 * without a built `dist/`, without the server's dependencies, and without a cold start.
 */
const REPORT = { checks: [], summary: { ok: 0, warn: 0, fail: 0, skip: 0 } };

/** A server module that records the environment it was imported under, and answers nothing else. */
function recordingServer(seen) {
  return async () => ({
    runServerDoctor: async () => {
      seen.push({
        store: process.env.SNOW_STORE,
        project: process.env.CLAUDE_PROJECT_DIR,
      });
      return REPORT;
    },
  });
}

const ctxFor = (root, seen) => ({
  root,
  storePath: join(root, '.local', 'instances.json'),
  serverAvailability: { state: 'ready', entry: join(root, 'dist', 'doctor', 'index.js'), packageDir: 'packages/snowarch' },
  importServer: recordingServer(seen),
});

/** Set an env var for one call, restoring exactly what was there — including "not set at all". */
async function withEnv(name, value, fn) {
  const had = Object.prototype.hasOwnProperty.call(process.env, name);
  const saved = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try { return await fn(); } finally {
    if (had) process.env[name] = saved;
    else delete process.env[name];
  }
}

test('B06-01 — the server reads the store it was GIVEN, not the one in the shell', async () => {
  const root = join('/tmp', 'b06-01-fixture-root');
  const seen = [];
  await withEnv('SNOW_STORE', '/nonexistent/ambient-store.json', async () => {
    await serverReport(ctxFor(root, seen));
  });

  assert.equal(seen.length, 1, 'the injected server module was not imported');
  // THE POSITIVE DIRECTION. Without this the pair of runs below could agree because BOTH ignored
  // the store, and the comparison would survive deleting the four lines it exists to protect.
  assert.equal(seen[0].store, join(root, '.local', 'instances.json'),
    'the server saw the ambient SNOW_STORE, not the store the doctor was given');
  assert.notEqual(seen[0].store, '/nonexistent/ambient-store.json');
  // The same four lines set the project dir, for the same reason.
  assert.equal(seen[0].project, root);
});

test('B06-01 — with no storePath the variable is DELETED for the child, not left ambient', async () => {
  // The `else` branch: a context with no store must not let the operator's shell decide what the
  // server reads. `undefined` is the assertion — an empty string would still be a value.
  const seen = [];
  await withEnv('SNOW_STORE', '/nonexistent/ambient-store.json', async () => {
    await serverReport({ ...ctxFor('/tmp/b06-01-no-store', seen), storePath: undefined });
  });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].store, undefined, 'the ambient value leaked into a run that has no store');
});

test('B06-01 — the ambient value is restored afterwards, set or unset', async () => {
  // A doctor run is in-process. Leaving the replacement behind would change the environment of
  // whatever called it — the bootstrap, the CLI, the next test in this file.
  const seen = [];
  await withEnv('SNOW_STORE', '/nonexistent/ambient-store.json', async () => {
    await serverReport(ctxFor('/tmp/b06-01-restore', seen));
    assert.equal(process.env.SNOW_STORE, '/nonexistent/ambient-store.json',
      'the doctor kept its replacement after returning');
  });

  await withEnv('SNOW_STORE', undefined, async () => {
    await serverReport(ctxFor('/tmp/b06-01-restore-unset', seen));
    assert.equal(Object.prototype.hasOwnProperty.call(process.env, 'SNOW_STORE'), false,
      'a variable that was NOT set came back set — "restore" must mean absent, not empty');
  });
});

test('B06-01 — the restore happens even when the server module throws', async () => {
  // It is a `finally`, and this is the case that makes it one: a server whose import or doctor call
  // fails must not leave the caller's environment rewritten.
  const root = '/tmp/b06-01-throws';
  await withEnv('SNOW_STORE', '/nonexistent/ambient-store.json', async () => {
    const ctx = {
      ...ctxFor(root, []),
      importServer: async () => ({ runServerDoctor: async () => { throw new Error('boom'); } }),
    };
    const r = await serverReport(ctx);
    // The failure is reported, not thrown — but the environment is what this asserts.
    assert.equal(r.report, null);
    assert.match(String(r.error), /boom/);
    assert.equal(process.env.SNOW_STORE, '/nonexistent/ambient-store.json');
  });
});
