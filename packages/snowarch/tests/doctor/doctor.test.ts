import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import {
  chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHECK_IDS } from '../../src/doctor/types.js';

/**
 * The doctor as a user runs it: the built CLI, in a child process, against a fixture store.
 *
 * Driven through `dist/cli/index.js` rather than by calling `runServerDoctor` in-process,
 * because half of what these criteria assert is the *process* behaviour — exit codes, what
 * lands on stdout when `--json` is passed, and SV-05/SV-06 spawning a real server. An
 * in-process test would assert the report object and none of that.
 */
const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(HERE, '../../dist/cli/index.js');
const isWindows = process.platform === 'win32';

const FIXTURE_USER = 'fixture.user';
const FIXTURE_PASS = 'Fixture-Secret-1';

let home: string;

const instance = (over: Record<string, unknown> = {}) => ({
  url: 'https://dev12345.service-now.com',
  environment: 'pdi',
  auth: { method: 'basic', username: FIXTURE_USER, password: FIXTURE_PASS },
  preset: 'pdi-developer',
  toolPackage: 'full',
  maxRecords: 100,
  prodWriteAck: false,
  ...over,
});

function writeStore(instances: Record<string, unknown> = { pdi: instance() }, mode = 0o600): string {
  const dir = join(home, '.local');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const p = join(dir, 'instances.json');
  writeFileSync(p, JSON.stringify({
    version: 1, defaultInstance: Object.keys(instances)[0], instances,
  }, null, 2), { mode });
  chmodSync(p, mode);
  return p;
}

interface DoctorRun { code: number; stdout: string; stderr: string }

async function doctorAt(
  cli: string,
  args: string[] = ['--no-network'],
  extraEnv: Record<string, string> = {},
): Promise<DoctorRun> {
  const env = { ...process.env, HOME: home, APPDATA: home, CLAUDE_PROJECT_DIR: home,
    SNOW_LOG_LEVEL: 'error', ...extraEnv } as Record<string, string>;
  for (const k of ['SNOW_STORE', 'SERVICENOW_INSTANCE_URL', 'SERVICENOW_BASIC_USERNAME',
    'SERVICENOW_BASIC_PASSWORD', 'SNOW_ENV_FILE']) delete env[k];
  try {
    const { stdout, stderr } = await run(process.execPath, [cli, 'doctor', ...args],
      { encoding: 'utf8', env, timeout: 90_000, maxBuffer: 10 * 1024 * 1024 });
    return { code: 0, stdout, stderr };
  } catch (e) {
    const err = e as { code?: number; stdout?: string; stderr?: string };
    return { code: err.code ?? -1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

const doctor = (args?: string[], extraEnv?: Record<string, string>): Promise<DoctorRun> =>
  doctorAt(CLI, args, extraEnv);

const parse = (r: DoctorRun) => JSON.parse(r.stdout) as {
  mode: string;
  checks: Array<{ id: string; status: string; detail: string; remedy?: string }>;
  summary: { ok: number; warn: number; fail: number; skip: number };
  instances: Array<{ label: string; preset: string; environment: string }>;
};
const check = (r: DoctorRun, id: string) => parse(r).checks.find((c) => c.id === id)!;

beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'snowarch-doctor-')); });
afterEach(() => { rmSync(home, { recursive: true, force: true }); });

describe('criterion 1 - a valid store', () => {
  it('reports every check id, SV-04 skipped, no failures, and the store preset', async () => {
    writeStore();
    const r = await doctor(['--no-network', '--json']);
    const report = parse(r);

    expect(report.checks.map((c) => c.id)).toEqual([...CHECK_IDS]);
    expect(check(r, 'SV-04').status).toBe('skip');
    expect(check(r, 'SV-04').detail).toContain('--no-network');
    expect(report.summary.fail).toBe(0);
    expect(report.instances[0]!.preset).toBe('pdi-developer');
    expect(report.mode).toBe('configured');
    expect(r.code).toBe(0);
  }, 120_000);

  it('SV-05 compares against the contract and SV-06 against the store', async () => {
    writeStore();
    const r = await doctor(['--no-network', '--json']);
    expect(check(r, 'SV-05').status).toBe('ok');
    expect(check(r, 'SV-05').detail).toMatch(/\d+ tools advertised, matching the contract/);
    expect(check(r, 'SV-06').status).toBe('ok');
    expect(check(r, 'SV-06').detail).toContain('pdi-developer');
  }, 120_000);

  it('the human rendering carries a summary line and the remedies', async () => {
    writeStore();
    const r = await doctor(['--no-network']);
    expect(r.stdout).toMatch(/^SV-00 ok/m);
    expect(r.stdout).toMatch(/SERVER DOCTOR: \d+ ok, \d+ warn, \d+ fail, \d+ skip \(mode: configured\)/);
  }, 120_000);
});

describe('SV-09 — the store schema (ARC-09-S06)', () => {
  it('a current store is ok, and says which version that is', async () => {
    writeStore();
    const r = await doctor(['--no-network', '--json']);
    expect(check(r, 'SV-09').status).toBe('ok');
    expect(check(r, 'SV-09').detail).toMatch(/store schema v\d+ \(current\)/);
  }, 120_000);

  it('a store from the PAST fails with the migrate command, and is NOT auto-fixable', async () => {
    const p = writeStore();
    const raw = JSON.parse(readFileSync(p, 'utf8')) as { version: number };
    writeFileSync(p, JSON.stringify({ ...raw, version: 0 }, null, 2), { mode: 0o600 });

    const r = await doctor(['--no-network', '--json']);
    const sv09 = check(r, 'SV-09') as { status: string; detail: string; command?: string;
      fixable?: boolean };
    expect(sv09.status).toBe('fail');
    expect(sv09.detail).toMatch(/store schema v0 < server v\d+/);
    // The command is what `--fix` reports under REFUSED, and `fixable: false` is what keeps the
    // whitelist away from the credential file. Both, because either alone would let the other move.
    expect(sv09.command).toBe('./snowarch store migrate');
    expect(sv09.fixable).toBe(false);
  }, 120_000);

  it('a store from the FUTURE fails pointing at upgrade, not migrate', async () => {
    const p = writeStore();
    const raw = JSON.parse(readFileSync(p, 'utf8')) as { version: number };
    writeFileSync(p, JSON.stringify({ ...raw, version: raw.version + 3 }, null, 2), { mode: 0o600 });

    const r = await doctor(['--no-network', '--json']);
    const sv09 = check(r, 'SV-09') as { status: string; detail: string; command?: string };
    expect(sv09.status).toBe('fail');
    expect(sv09.detail).toMatch(/> server v\d+/);
    expect(sv09.command).toBe('./snowarch upgrade');
  }, 120_000);

  it('no store means nothing to check — a skip, not a failure', async () => {
    const r = await doctor(['--no-network', '--json']);
    expect(check(r, 'SV-09').status).toBe('skip');
  }, 120_000);
});

describe('criterion 2 - no store at all', () => {
  it('unconfigured mode, SV-02 warn with the setup remedy, SV-05 five tools, exit 0', async () => {
    const r = await doctor(['--no-network', '--json']);
    const report = parse(r);

    expect(report.mode).toBe('unconfigured');
    expect(check(r, 'SV-02').status).toBe('warn');
    expect(check(r, 'SV-02').remedy).toBe('/snowarch setup-instance');
    // Five, not 397: unconfigured mode advertises the core tools deliberately, and comparing
    // against the full contract there would report a 392-name difference for correct behaviour.
    expect(check(r, 'SV-05').status).toBe('ok');
    expect(check(r, 'SV-05').detail).toContain('5 core tools');
    expect(check(r, 'SV-06').status).toBe('skip');
    expect(r.code).toBe(0);
  }, 120_000);
});

describe('criterion 3 - a world-readable store', () => {
  it.skipIf(isWindows)('SV-02 fails with a chmod remedy and the process exits 1', async () => {
    // POSIX only. On Windows permissions are ACL-inherited and the check skips with that note,
    // which the Windows CI cells assert by this suite passing there at all.
    writeStore({ pdi: instance() }, 0o644);
    const r = await doctor(['--no-network', '--json']);

    expect(check(r, 'SV-02').status).toBe('fail');
    expect(check(r, 'SV-02').detail).toContain('0644');
    expect(check(r, 'SV-02').remedy).toMatch(/^chmod 600 /);
    // And the path in the remedy is masked, not absolute: this line gets pasted into tickets.
    expect(check(r, 'SV-02').remedy).not.toContain(home);
    expect(r.code).toBe(1);
  }, 120_000);

  it.skipIf(!isWindows)('on Windows the mode check is skipped with the ACL note', async () => {
    writeStore({ pdi: instance() }, 0o644);
    const r = await doctor(['--no-network', '--json']);
    expect(check(r, 'SV-02').status).not.toBe('fail');
    expect(check(r, 'SV-02').detail).toContain('ACL-inherited');
  }, 120_000);
});

describe('criterion 4 - a prod instance without acknowledgement', () => {
  it('SV-03 fails naming --ack-prod, and the process exits 1', async () => {
    writeStore({ prod: instance({ environment: 'prod', preset: 'full', prodWriteAck: false }) });
    const r = await doctor(['--no-network', '--json']);

    expect(check(r, 'SV-03').status).toBe('fail');
    expect(check(r, 'SV-03').remedy).toContain('--ack-prod');
    expect(check(r, 'SV-03').remedy).toContain('prod');
    expect(r.code).toBe(1);
  }, 120_000);

  it('and with prodWriteAck true the same store passes', async () => {
    // The control. Without it, the case above would pass against a check that failed every
    // prod instance regardless of acknowledgement.
    writeStore({ prod: instance({ environment: 'prod', preset: 'full', prodWriteAck: true }) });
    const r = await doctor(['--no-network', '--json']);
    expect(check(r, 'SV-03').status).not.toBe('fail');
  }, 120_000);
});

describe('criterion 5 - the contract and the build disagree', () => {
  it('removing one tool from contract.json makes SV-05 fail, naming it', async () => {
    // A COPY of dist/, and one that lives INSIDE the package.
    //
    // Two things were learned getting here. The first version edited `dist/contract.json` in
    // place and restored it in a `finally`, which worked — for this test. It also made
    // `tests/contract.test.ts` fail intermittently in full-suite runs: vitest runs files in
    // parallel workers, so that suite read the contract mid-edit and saw 396 tools. Two red
    // tests in one run out of six, in a file this story never touched. A test that mutates a
    // shared build artefact cannot be isolated by cleaning up afterwards; the window is the
    // problem, not the residue.
    //
    // The second: the copy cannot live in a temp directory. Node resolves `commander` and the
    // MCP SDK by walking UP from the module, so a `dist/` outside the package fails with
    // ERR_MODULE_NOT_FOUND before the doctor runs at all.
    const distCopy = resolve(HERE, '../../.tmp-doctor-dist');
    rmSync(distCopy, { recursive: true, force: true });
    cpSync(resolve(HERE, '../../dist'), distCopy, { recursive: true });

    try {
      const contractPath = join(distCopy, 'contract.json');
      const contract = JSON.parse(readFileSync(contractPath, 'utf8')) as { tools: Array<{ name: string }> };
      const removed = contract.tools[10]!.name;
      contract.tools = contract.tools.filter((t) => t.name !== removed);
      writeFileSync(contractPath, JSON.stringify(contract, null, 2));

      writeStore();
      const r = await doctorAt(join(distCopy, 'cli', 'index.js'), ['--no-network', '--json']);

      expect(check(r, 'SV-05').status).toBe('fail');
      // The NAME, not a count: "1 tool differs" tells nobody which build is stale.
      expect(check(r, 'SV-05').detail).toContain(removed);
      expect(check(r, 'SV-05').detail).toContain('advertised but not in the contract');
      expect(r.code).toBe(1);
    } finally {
      rmSync(distCopy, { recursive: true, force: true });
    }
  }, 180_000);

  it('the real contract is untouched - the same check passes against dist/', async () => {
    // The control, and the proof that the copy above isolated anything.
    writeStore();
    expect(check(await doctor(['--no-network', '--json']), 'SV-05').status).toBe('ok');
  }, 120_000);
});

describe('criterion 6 - no credential in the JSON output', () => {
  it('neither the fixture password nor the clear username appears', async () => {
    writeStore();
    const r = await doctor(['--no-network', '--json']);

    expect(r.stdout).not.toContain(FIXTURE_PASS);
    expect(r.stdout).not.toContain(FIXTURE_USER);
    expect(r.stdout).not.toMatch(/Basic\s+[A-Za-z0-9+/=]{8,}/);
    // Not vacuous: the report must actually describe the instance.
    expect(parse(r).instances[0]!.label).toBe('pdi');
    expect(r.stdout.length).toBeGreaterThan(500);
  }, 120_000);

  it('and no absolute path from the fixture HOME leaks either', async () => {
    writeStore();
    const r = await doctor(['--no-network', '--json']);
    expect(r.stdout).not.toContain(home);
  }, 120_000);
});

describe('SV-07 and SV-08', () => {
  it('SV-07 warns when the audit trail is switched off', async () => {
    writeStore();
    const r = await doctor(['--no-network', '--json'], { SNOW_AUDIT_FILE: 'off' });
    expect(check(r, 'SV-07').status).toBe('warn');
    expect(check(r, 'SV-07').detail).toContain('§2.1');
  }, 120_000);

  it('SV-08 is a warning, never a failure, and names the remedy', async () => {
    // The checkout still works with ancestor skill directories — the roster is just larger than
    // this repository defines. A failure here would block a working installation.
    writeStore();
    const r = await doctor(['--no-network', '--json']);
    const sv08 = check(r, 'SV-08');
    expect(['ok', 'warn']).toContain(sv08.status);
    if (sv08.status === 'warn') expect(sv08.remedy).toContain('/skills');
  }, 120_000);
});

describe('the criterion-5 copy leaves no residue', () => {
  it('.tmp-doctor-dist is gone, and the working tree is clean', () => {
    // ARC-04-S13 commits `dist/`, so a stray copy beside it would show up in `git status` and
    // in any size or file-count check over the package. The `finally` removes it; this asserts
    // that it did, because "cleaned up in a finally" is a claim, not a guarantee — a killed run
    // skips it, which is why the path is also gitignored.
    expect(existsSync(resolve(HERE, '../../.tmp-doctor-dist'))).toBe(false);

    // The git half is a bonus, and it does not get to fail this test on its own. `git status`
    // throws while another process holds `.git/index.lock` — a concurrent `git add` in the same
    // checkout is enough — and a test that shells out to git can then go red for a reason that
    // has nothing to do with its subject. The filesystem check above is the actual claim.
    let status: string;
    try {
      status = execFileSync('git', ['status', '--porcelain', '--', resolve(HERE, '../..')],
        { encoding: 'utf8', cwd: resolve(HERE, '../../../..'), stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      return;
    }
    expect(status.split('\n').filter((l) => l.includes('.tmp-doctor-dist'))).toEqual([]);
  });
});

describe('no module derives a path from a file URL pathname', () => {
  it('nothing uses `new URL(import.meta.url).pathname`', () => {
    // A cross-platform guard for a Windows-only defect. `distDir()` used that form, so on every
    // Windows cell the pathname was `/C:/…` — a leading slash before the drive letter, which is
    // not a filesystem path. `dist/contract.json` was never found: SV-05 skipped and SV-01
    // failed, and the doctor reported a broken installation on a perfectly good one. It passed
    // on macOS and Linux, which is exactly why the guard scans the source instead of relying on
    // the platform that has the bug being in the matrix.
    const src = resolve(HERE, '../../src');
    const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
      .flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name))
        : (e.name.endsWith('.ts') ? [join(dir, e.name)] : [])));

    const offenders = walk(src)
      .filter((f) => /new URL\([^)]*import\.meta\.url[^)]*\)\s*\.pathname/.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(src.length + 1).split(sep).join('/'));

    expect(offenders, 'use fileURLToPath(import.meta.url) instead').toEqual([]);
  });
});

describe('criterion 7 - importable through the exports map', () => {
  it('the doctor module resolves as @farstic/snowarch/doctor', async () => {
    const pkg = JSON.parse(readFileSync(resolve(HERE, '../../package.json'), 'utf8')) as {
      exports: Record<string, string>;
    };
    expect(pkg.exports['./doctor']).toBe('./dist/doctor/index.js');

    // And the target really exports what ARC-08 imports — a map entry pointing at a module
    // without `runServerDoctor` would satisfy the assertion above and fail at the hand-off.
    const mod = await import(resolve(HERE, '../../dist/doctor/index.js')) as Record<string, unknown>;
    expect(typeof mod.runServerDoctor).toBe('function');
    expect(typeof mod.exitCodeFor).toBe('function');
    expect(typeof mod.formatReport).toBe('function');
    expect(mod.CHECK_IDS).toEqual([...CHECK_IDS]);
  });
});
