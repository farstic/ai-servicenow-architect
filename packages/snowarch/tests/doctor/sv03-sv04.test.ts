import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, chmodSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runServerDoctor } from '../../src/doctor/index.js';
import { ALL_CHECKS } from '../../src/doctor/checks.js';
import { stubProbes } from '../../src/doctor/types.js';
import { instanceManager } from '../../src/servicenow/instances.js';
import { makeProbes, describeProbes, statusOf } from '../../src/doctor/probes-binding.js';
import { ROPC_ERROR_TABLE } from '../../src/servicenow/probes.js';
import { FLAG_NAMES } from '../../src/utils/permissions.js';
import { remedyFor } from '../../src/errors/codes.js';

/**
 * ARC-08-S04 — SV-03's new branches and SV-04's probe binding, in process.
 *
 * `tests/doctor/doctor.test.ts` drives the CLI because half of what IT asserts is process
 * behaviour. These cases assert the RULES, so they call the runner directly: a flag matrix
 * expressed as sixteen child processes is sixteen chances for a fixture to be the thing under
 * test. Nothing here reaches a network or spawns `npm`; every seam is injected.
 */
const FIXTURE_USER = 'fixture.user';
const FIXTURE_PASS = 'Fixture-Secret-1';

let home: string;

const entry = (over: Record<string, unknown> = {}) => ({
  url: 'https://dev12345.service-now.com',
  environment: 'pdi',
  auth: { method: 'basic', username: FIXTURE_USER, password: FIXTURE_PASS },
  preset: 'pdi-developer',
  toolPackage: 'full',
  maxRecords: 100,
  prodWriteAck: false,
  ...over,
});

const allFlags = (value: string) => Object.fromEntries(FLAG_NAMES.map((f) => [f, value]));

function writeStore(instances: Record<string, unknown>): string {
  const dir = join(home, '.local');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const p = join(dir, 'instances.json');
  writeFileSync(p, `${JSON.stringify({ version: 1,
    defaultInstance: Object.keys(instances)[0], instances }, null, 2)}\n`, { mode: 0o600 });
  chmodSync(p, 0o600);
  return p;
}

/**
 * The runner, with the environment pointed at the fixture and no SDK spawn.
 *
 * `SNOW_STORE` is set EXPLICITLY rather than relying on the project-path rule, and the
 * `SERVICENOW_*` variables are removed: `tests/setup.ts` sets `SERVICENOW_INSTANCE_URL` for every
 * suite, which makes the manager build an environment instance called `default` — and a case about
 * a store entry that silently asserted an env instance would pass for the wrong reason. It did:
 * three of these read `ok` from a fixture nobody was looking at.
 */
const runDoctor = async (opts: Parameters<typeof runServerDoctor>[0] = {}) => {
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
    return await runServerDoctor({ noNetwork: true, cwd: home,
      fluent: () => ({ installed: false }), ...opts });
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
};

/**
 * ONE check, against the fixture — not the whole runner.
 *
 * SV-05 and SV-06 spawn a real server, which costs ten seconds a run; a flag-matrix case that
 * paid for that twice hit the suite timeout, and it was paying for a handshake nobody was
 * asserting. The rules under test are SV-03's, so SV-03 is what runs.
 */
const runCheck = async (id: string, opts: { fluent?: () => { installed: boolean; where?: string; version?: string } } = {}) => {
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
    return await ALL_CHECKS.find((c) => c.id === id)!.run({
      noNetwork: true, cwd: home, probes: stubProbes,
      fluent: opts.fluent ?? (() => ({ installed: false })),
    });
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
};

beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'snowarch-sv-')); });
afterEach(() => { rmSync(home, { recursive: true, force: true }); });

describe('SV-03 — the flag matrix', () => {
  // AC 4, first half.
  it('names the flags that are not stated, and marks itself fixable', async () => {
    const stated = FLAG_NAMES.slice(0, 4);
    const absent = FLAG_NAMES.slice(4);
    expect(absent.length).toBe(2);          // the precondition this case is about
    // `custom`, deliberately: with a named preset the loader ALSO reports PRESET_FLAGS_MISMATCH,
    // and this case is about a flag nobody stated rather than one that disagrees with a preset.
    writeStore({ pdi: entry({ preset: 'custom',
      flags: Object.fromEntries(stated.map((f) => [f, 'false'])) }) });

    const sv03 = await runCheck('SV-03');
    expect(sv03.status).toBe('warn');
    expect(sv03.detail).toContain('FLAGS_INCOMPLETE');
    for (const flag of absent) expect(sv03.detail).toContain(flag);
    expect(sv03.fixable).toBe(true);
    expect(sv03.data?.fix).toMatchObject({ kind: 'flags-incomplete', label: 'pdi' });
  });

  // AC 4, second half.
  it('warns about a dependent flag with write off, and never offers to fix it', async () => {
    const scripting = FLAG_NAMES.find((f) => f.startsWith('SCRIPTING'))!;
    const write = FLAG_NAMES.find((f) => f.startsWith('WRITE'))!;
    writeStore({ pdi: entry({ preset: 'custom',
      flags: { ...allFlags('false'), [scripting]: 'true' } }) });

    const sv03 = await runCheck('SV-03');
    expect(sv03.status).toBe('warn');
    expect(sv03.detail).toContain('FLAG_DEPENDENCY_VIOLATION');
    expect(sv03.detail).toContain(scripting);
    expect(sv03.detail).toContain(write);
    // Which of the two the user meant is not in the file, so this is never repaired.
    expect(sv03.data?.fixes ?? []).not.toContainEqual(
      expect.objectContaining({ kind: 'flag-dependency' }));
  });

  // AC 4, third part.
  it('fails a production entry whose write preset was never acknowledged, with the label', async () => {
    writeStore({ prod: entry({ environment: 'prod', preset: 'full',
      flags: allFlags('true'), prodWriteAck: false }) });
    const sv03 = await runCheck('SV-03');
    expect(sv03.status).toBe('fail');
    expect(sv03.remedy).toContain('--ack-prod');
    expect(sv03.remedy).toContain('prod');
  });

  // AC 5.
  it('warns when the SDK is not resolvable and the entry says it is used', async () => {
    const fluent = FLAG_NAMES.find((f) => f.startsWith('FLUENT'))!;
    const write = FLAG_NAMES.find((f) => f.startsWith('WRITE'))!;
    writeStore({ pdi: entry({ preset: 'custom',
      flags: { ...allFlags('false'), [write]: 'true', [fluent]: 'true' } }) });

    const missing = await runCheck('SV-03', { fluent: () => ({ installed: false }) });
    expect(missing.status).toBe('warn');
    expect(missing.detail).toContain('FLUENT_NOT_INSTALLED');
    expect(remedyFor('FLUENT_NOT_INSTALLED')?.command).toContain('@servicenow/sdk');

    // B08-03: AC 5's second clause is "with the SDK present it is ok and prints its VERSION", and
    // the check printed only the location until the acceptance pass. Both now — the version is what
    // a support conversation asks for, the location answers which of two installs is in use.
    const present = await runCheck('SV-03', {
      fluent: () => ({ installed: true, where: join(home, 'sdk'), version: '3.0.0' }),
    });
    expect(present.detail).toContain('SDK present');
    expect(present.detail).toMatch(/3\.0\.0/);
    expect(present.status).toBe('ok');

    // A version the probe could not read is not a failure: the SDK is still installed, and a doctor
    // that crashed on a malformed dependency would be worse than one that says less.
    const noVersion = await runCheck('SV-03', {
      fluent: () => ({ installed: true, where: join(home, 'sdk') }),
    });
    expect(noVersion.status).toBe('ok');
    expect(noVersion.detail).toContain('SDK present');
    expect(noVersion.detail).not.toMatch(/3\.0\.0/);
    expect(present.detail).not.toContain('FLUENT_NOT_INSTALLED');
  });

  it('does not ask about the SDK when the entry does not use it', async () => {
    let asked = 0;
    writeStore({ pdi: entry({ preset: 'custom', flags: allFlags('false') }) });
    await runCheck('SV-03', { fluent: () => { asked += 1; return { installed: false }; } });
    expect(asked).toBe(0);
  });
});

describe('SV-04 — the probe binding', () => {
  const probeResult = (over: Record<string, unknown> = {}) => ({
    at: '2026-09-10T00:00:00.000Z',
    auth: { status: 'ok' as const },
    capabilities: FLAG_NAMES.map((flag) => ({ flag, status: 'ok' as const, detail: 'ok' })),
    ...over,
  });

  it('renders one line of statuses and nothing else', () => {
    const line = describeProbes(probeResult() as never);
    expect(line.startsWith('auth ok')).toBe(true);
    expect(line).toContain('write ok');
    expect(line).not.toContain('_ENABLED');
    expect(line).not.toContain(FIXTURE_USER);
  });

  it('is a fail on a refused login and a warn on one that could not be attempted', () => {
    expect(statusOf(probeResult({ auth: { status: 'auth failed' } }) as never)).toBe('fail');
    expect(statusOf(probeResult({ auth: { status: 'unreachable' } }) as never)).toBe('warn');
    expect(statusOf(probeResult() as never)).toBe('ok');
  });

  // AC 6.
  it('forwards a ROPC code so the remedy is the registry\'s, and carries no second one', async () => {
    const row = ROPC_ERROR_TABLE.find((r) => r.code === 'OAUTH_ROPC_DISABLED')!;
    const probes = makeProbes({
      readEntry: () => entry({ auth: { method: 'oauth_ropc', username: FIXTURE_USER,
        password: FIXTURE_PASS, clientId: 'id', clientSecret: 'secret' } }) as never,
      makeClient: () => ({}) as never,
      probe: (async () => probeResult({
        auth: { status: row.status, code: row.code, hint: row.hint },
        capabilities: FLAG_NAMES.map((flag) => ({ flag, status: 'skipped', detail: 'auth failed' })),
      })) as never,
    });
    const r = await probes.runAll('pdi');
    expect(r.code).toBe('OAUTH_ROPC_DISABLED');
    expect(r.remedy).toBeUndefined();
    expect(remedyFor('OAUTH_ROPC_DISABLED')?.remedy).toBeTruthy();
    expect(r.detail).not.toContain(FIXTURE_PASS);
  });

  it('says there is nothing to probe when the store has no such entry', async () => {
    const probes = makeProbes({ readEntry: () => undefined });
    const r = await probes.runAll('missing');
    expect(r.status).toBe('skip');
    expect(r.detail).toContain('nothing to probe');
  });

  // AC 8, without a network: the doctor reads the store and never writes it.
  it('leaves the store byte-identical after a probe run', async () => {
    const path = writeStore({ pdi: entry({ preset: 'custom', flags: allFlags('false') }) });
    const before = createHash('sha256').update(readFileSync(path)).digest('hex');
    const probes = makeProbes({
      readEntry: () => entry({ flags: allFlags('false') }) as never,
      makeClient: () => ({}) as never,
      probe: (async () => probeResult()) as never,
    });
    const r = await probes.runAll('pdi');
    expect(r.status).toBe('ok');
    expect(createHash('sha256').update(readFileSync(path)).digest('hex')).toBe(before);
  });
});

describe('the report ARC-07-S09 reads', () => {
  // The four fields `--resume` branches on, with the username masked at the source.
  it('lists each instance with a masked username', async () => {
    writeStore({ pdi: entry({ preset: 'custom', flags: allFlags('false'),
      auth: { method: 'basic', username: 'someone@corp.example.com', password: FIXTURE_PASS } }) });
    const report = await runDoctor();
    expect(report.instances).toHaveLength(1);
    const [first] = report.instances;
    expect(first).toMatchObject({ label: 'pdi', environment: 'pdi', preset: 'custom' });
    expect(first?.username).toBe('s***@corp.example.com');
    expect(JSON.stringify(report)).not.toContain(FIXTURE_PASS);
  });
});
