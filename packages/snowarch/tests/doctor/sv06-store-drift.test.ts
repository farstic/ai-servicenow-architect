import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// FROM `dist/`, NOT `src/`, and every import of the three has to agree or the test asserts nothing.
// SV-05 and SV-06 look for `server.js` and `contract.json` beside their own module — `distDir()` is
// the parent of the file's own directory — so a check imported from `src/` looks in `src/`, finds no
// contract, and SKIPS. That is exactly what the first version of this file measured: a skip that
// reads like a pass. `tests/doctor/doctor.test.ts` drives `dist/cli/index.js` for the same reason.
// `instanceManager` must come from `dist/` too: the same module loaded twice is two module
// instances, and the check would then read a store this file never wrote.
// @ts-expect-error - the built JS carries no declarations; this file asserts behaviour, not types.
import { ALL_CHECKS, resetHandshakeCache } from '../../dist/doctor/checks.js';
// @ts-expect-error - as above.
import { stubProbes } from '../../dist/doctor/types.js';
// @ts-expect-error - as above.
import { instanceManager } from '../../dist/servicenow/instances.js';

/**
 * ARC-08-S04 AC 7, second half — acceptance item B08-02.
 *
 * "Editing the store's `maxRecords` to 50 AFTER THE SERVER WAS STARTED (test controls the spawn)
 * makes SV-06 FAIL naming `maxRecords`." The first half (a tool dropped from `contract.json` makes
 * SV-05 fail naming it) and SV-06's green path were covered; this half was not, and `maxRecords`
 * appeared in the suite only as fixture data.
 *
 * WHY IT IS IN PROCESS, and why it is its own file. The window SV-06 exists to catch is between the
 * server reading the store and the doctor reading it — inside one CLI run. A child-process test
 * could only reach it by editing the file while the run is in flight, which is a race, and this
 * repository does not write tests that depend on a clock. In process, the two reads are separate
 * calls and the test makes them disagree on purpose: the handshake is CACHED across SV-05 and SV-06
 * (`resetHandshakeCache` is the seam that exists for fixtures), so priming it, rewriting the store
 * and reloading gives exactly the state the criterion describes — a server started before the edit.
 *
 * It costs one real server spawn, which is why it is not folded into a flag-matrix file.
 */
const FIXTURE_USER = 'fixture.user';
const FIXTURE_PASS = 'Fixture-Secret-1';

let home: string;

const entry = (maxRecords: number) => ({
  url: 'https://dev12345.service-now.com',
  environment: 'pdi',
  auth: { method: 'basic', username: FIXTURE_USER, password: FIXTURE_PASS },
  preset: 'pdi-developer',
  toolPackage: 'full',
  maxRecords,
  prodWriteAck: false,
});

function writeStore(maxRecords: number): void {
  const dir = join(home, '.local');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const p = join(dir, 'instances.json');
  writeFileSync(p, JSON.stringify({
    version: 1, defaultInstance: 'pdi', instances: { pdi: entry(maxRecords) },
  }, null, 2), { mode: 0o600 });
  // SV-02 refuses a group/world-readable store, and a refused store loads no instance at all —
  // every assertion below would then be true of an empty report.
  chmodSync(p, 0o600);
}

const runCheck = async (id: string) => {
  const saved = { ...process.env };
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.APPDATA = home;
  process.env.CLAUDE_PROJECT_DIR = home;
  process.env.SNOW_STORE = join(home, '.local', 'instances.json');
  for (const k of ['SERVICENOW_INSTANCE_URL', 'SERVICENOW_BASIC_USERNAME',
    'SERVICENOW_BASIC_PASSWORD', 'SERVICENOW_OAUTH_USERNAME', 'SERVICENOW_OAUTH_PASSWORD',
    'SNOW_ENV_FILE']) delete process.env[k];
  try {
    instanceManager.reload();
    return await ALL_CHECKS.find((c: { id: string }) => c.id === id)!.run({
      noNetwork: true, cwd: home, probes: stubProbes, fluent: () => ({ installed: false }),
    });
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
};

describe('SV-06 — the running server against the store on disk (ARC-08-S04 AC 7)', () => {
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'snowarch-sv06-'));
    resetHandshakeCache();
  });
  afterEach(() => {
    resetHandshakeCache();
    rmSync(home, { recursive: true, force: true });
  });

  it('a store edited after the server started makes SV-06 fail, naming maxRecords', async () => {
    // 1. The server starts against a store that says 100. SV-05 is what spawns it, and the
    //    handshake it performs is cached — that cache IS "the server that is already running".
    writeStore(100);
    const handshake = await runCheck('SV-05');
    expect(handshake.status, `SV-05 did not reach the server: ${handshake.detail}`).toBe('ok');

    // The green path first, or a later fail proves nothing about maxRecords in particular.
    const agreeing = await runCheck('SV-06');
    expect(agreeing.status).toBe('ok');
    expect(agreeing.detail).toContain('maxRecords 100');

    // 2. The edit, with the server left exactly as it was: no reset of the handshake cache.
    writeStore(50);

    // 3. The doctor now reads 50 where the running server reported 100.
    const drifted = await runCheck('SV-06');
    expect(drifted.status).toBe('fail');
    expect(drifted.detail).toContain('maxRecords');
    expect(drifted.detail).toMatch(/server 100 vs store 50/);
    // The remedy is the actionable half — a difference with no instruction is a puzzle.
    expect(drifted.remedy).toMatch(/restart/i);
  }, 120_000);

  it('the same edit with the server restarted is not a difference', async () => {
    // The other direction, and it is what stops this test from passing on a check that simply
    // fails whenever the store says 50: restart the server against the edited store and SV-06 is
    // green again. Without this, "SV-06 fails" and "SV-06 is broken" look identical.
    writeStore(100);
    expect((await runCheck('SV-05')).status).toBe('ok');
    writeStore(50);
    expect((await runCheck('SV-06')).status).toBe('fail');

    resetHandshakeCache();                 // the restart
    expect((await runCheck('SV-05')).status).toBe('ok');
    const after = await runCheck('SV-06');
    expect(after.status, `still failing after a restart: ${after.detail}`).toBe('ok');
    expect(after.detail).toContain('maxRecords 50');
  }, 120_000);
});
