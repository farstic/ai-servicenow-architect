// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DISK_FULL, DISK_SPARSE, checkClaudeCode, checkDisk, checkGit, checkNetwork, checkNode,
  checkPlatform, checkRoot, checkLine, makeExec, samePath, run as runB00,
} from '../lib/steps/B00.mjs';
import { TIMED_OUT } from '../lib/probe-net.mjs';
import { CHECK_IDS, TABLE, remedyFor } from '../lib/remedies.mjs';
import { compareVersion, formatVersion, meetsFloor, parseVersion } from '../lib/versions.mjs';
import { which } from '../lib/which.mjs';
import { tempDir } from './helpers/temp.mjs';
import { makeCheckout } from './helpers/workspace.mjs';

/** The upstream `engine.config.json` ships, shared by every network case below. */
const CORPUS_UPSTREAM = 'https://github.com/ServiceNow/ServiceNowDocs.git';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const FLOORS = JSON.parse(readFileSync(join(repoRoot, 'engine.config.json'), 'utf8')).floors;

/** An `exec` whose answers the test dictates. No real binary runs in this file. */
const execWith = (answers) => (name, args) => {
  const key = `${name} ${args.join(' ')}`;
  const hit = Object.entries(answers).find(([k]) => key.startsWith(k));
  if (!hit) return { found: false, ok: false, stdout: '', stderr: '' };
  const v = hit[1];
  return v === null
    ? { found: false, ok: false, stdout: '', stderr: '' }
    : { found: true, ok: v.ok !== false, stdout: v.stdout ?? String(v), stderr: v.stderr ?? '' };
};

const GOOD = {
  'git --version': 'git version 2.39.5 (Apple Git-146)',
  'git -C': '/repo',
  'claude --version': '2.1.258 (Claude Code)',
  'claude --help': 'commands: auth, mcp, doctor',
  'claude auth status': 'Logged in',
  'node --version': 'v22.11.0',
  'npm --version': '10.9.0',
};

test('the version parsers survive every vendor suffix the three OSes produce', () => {
  const cases = [
    ['git version 2.39.5 (Apple Git-146)', '2.39.5'],
    ['git version 2.47.0.windows.1', '2.47.0'],
    ['git version 2.34.1', '2.34.1'],
    ['v22.11.0\n', '22.11.0'],
    ['2.1.258 (Claude Code)', '2.1.258'],
    ['10.9.0\n', '10.9.0'],
  ];
  for (const [text, want] of cases) {
    assert.equal(formatVersion(parseVersion(text)), want, text);
  }
  assert.equal(parseVersion('no version here'), null);
  assert.equal(parseVersion(''), null);
  assert.equal(compareVersion(parseVersion('2.34.1'), parseVersion('2.34.0')), 1);
  assert.equal(compareVersion(parseVersion('2.9.0'), parseVersion('2.10.0')), -1, 'not string order');
  assert.equal(compareVersion(parseVersion('v1.2.3'), parseVersion('1.2.3')), 0);
});

test('AC 7 — the floors come from the config, and nothing in the code remembers them', () => {
  // Half of the criterion: the threshold moves when the configured value moves.
  const below = 'git version 2.25.0';
  assert.equal(meetsFloor(below, FLOORS.git).ok, false, 'precondition: 2.25.0 is below the real floor');
  assert.equal(meetsFloor(below, '2.0.0').ok, true, 'a lowered floor must change the verdict');

  // The other half, and the one that would actually rot: no source file spells a floor. The values
  // are read from the config here rather than typed, so this test cannot go stale against it.
  const files = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(mjs|json)$/.test(e)) files.push(p);
    }
  };
  walk(join(repoRoot, 'tools', 'snowarch', 'lib'));
  // COMMENTS ARE STRIPPED FIRST, and the distinction is the point: ARC-03's modules name git
  // 2.34.1 in prose as the version where ADR-0008's behaviour was observed. That is history, and
  // history is allowed to name a version. What must not exist is a floor used as a THRESHOLD in
  // code, because that is a value the config no longer controls.
  const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const hits = [];
  for (const f of files) {
    const text = stripComments(readFileSync(f, 'utf8'));
    for (const [name, value] of Object.entries(FLOORS)) {
      if (text.includes(value)) hits.push(`${f.replace(`${repoRoot}/`, '')} spells floors.${name}`);
    }
  }
  assert.deepEqual(hits, [], 'a floor typed into the code is a floor the config no longer controls');
  // ...and the scan is not vacuous: it sees a planted one.
  assert.ok(stripComments(`const floor = '${FLOORS.git}';`).includes(FLOORS.git));
  assert.ok(!stripComments(`// observed on git ${FLOORS.git}`).includes(FLOORS.git));
});

test('check 1 — the root check agrees with git, and names the platform\'s own command', () => {
  const exec = execWith({ ...GOOD, 'git -C': '/repo' });
  assert.equal(checkRoot({ root: '/repo', cwd: '/repo', exec, plat: 'darwin' }).status, 'ok');

  const wrongCwd = checkRoot({ root: '/repo', cwd: '/repo/clients', exec, plat: 'darwin' });
  assert.equal(wrongCwd.status, 'fail');
  assert.equal(wrongCwd.detail, 'not at the repository root — run: cd "/repo" && ./bootstrap.sh');

  // ARC-07-C1, closed by W7. This was `cd /d "C:\repo" && .\bootstrap.cmd` — cmd.exe syntax, and a
  // PARSE ERROR in PowerShell 5.1, which is the shell a Windows reader is most likely pasting into:
  // `cd /d` is cmd-only and `&&` arrived in PowerShell 7. No single line runs in both (`&` is
  // PowerShell's call operator), so it is two steps, and `pushd` is the one that changes drive in
  // both shells. The POSIX line above is untouched and still asserted, which is how this case shows
  // the change is confined to the platform it names.
  const onWindows = checkRoot({ root: 'C:\\repo', cwd: 'C:\\repo\\clients', exec, plat: 'win32' });
  assert.equal(onWindows.detail,
    'not at the repository root — run: pushd "C:\\repo"\n.\\bootstrap.cmd');

  // EVERY LINE OF THE WIN32 REMEDY IS A COMMAND, and this is the assertion the first two attempts
  // needed. `cd /d "<root>" && .\bootstrap.cmd` was cmd.exe syntax and a parse error in PowerShell
  // 5.1; my replacement said `pushd "<root>" then .\bootstrap.cmd`, which put PROSE inside a command
  // — a PowerShell user copying it gets `pushd : A positional parameter cannot be found that accepts
  // argument 'then'`. That is the same defect class this row closes, committed while closing it.
  //
  // Two lines is the only form both shells run: `&&` arrived in PowerShell 7, `&` is its call
  // operator, and `;` is not a separator in cmd. So the shape is asserted rather than the string
  // alone — no prose, no cmd-only syntax, and each line something you can paste.
  const winRemedy = remedyFor('root', { platform: 'win32', values: { root: 'C:\\repo' } });
  for (const forbidden of [' then ', '&&', 'cd /d']) {
    assert.ok(!winRemedy.includes(forbidden), `the win32 remedy contains "${forbidden}": ${winRemedy}`);
  }
  const lines = winRemedy.split('\n');
  assert.equal(lines.length, 2, `two steps, one per line: ${JSON.stringify(winRemedy)}`);
  for (const line of lines) {
    assert.match(line, /^(?:pushd "|\.\\)/, `not a command on its own: ${JSON.stringify(line)}`);
  }

  // git disagreeing about the toplevel is also a failure — a checkout inside another checkout.
  const nested = checkRoot({ root: '/repo', cwd: '/repo',
    exec: execWith({ 'git -C': '/somewhere/else' }), plat: 'darwin' });
  assert.equal(nested.status, 'fail');

  // ...but git being ABSENT is check 2's finding, reported once, not twice.
  const noGit = checkRoot({ root: '/repo', cwd: '/repo', exec: execWith({}), plat: 'darwin' });
  assert.equal(noGit.status, 'warn');
});

test('AC 3 — git absent is a FAIL that names the platform remedy', () => {
  for (const [plat, expected] of [['darwin', /xcode-select --install/], ['win32', /winget install Git\.Git/],
    ['linux', /apt install git/]]) {
    const r = checkGit({ exec: execWith({}), floors: FLOORS, plat });
    assert.equal(r.status, 'fail');
    assert.equal(r.detail, 'git not found');
    assert.match(r.remedy, expected, plat);
    assert.equal(checkLine(r), 'FAIL B00: git not found');
  }
});

test('check 2 — a git below the floor says which floor and why, both from the config', () => {
  const r = checkGit({ exec: execWith({ 'git --version': 'git version 2.25.0' }),
    floors: FLOORS, plat: 'darwin' });
  assert.equal(r.status, 'fail');
  assert.match(r.detail, new RegExp(`git 2\\.25\\.0 found, ≥ ${FLOORS.git.replace(/\./g, '\\.')} required`));
  assert.match(r.detail, /sparse-checkout set --cone` stores `--cone` as a pattern/);
  assert.equal(checkGit({ exec: execWith(GOOD), floors: FLOORS, plat: 'darwin' }).status, 'ok');
});

test('check 3 — Claude Code: found, missing, below floor, and the login probe', () => {
  const okCase = checkClaudeCode({ exec: execWith(GOOD), floors: FLOORS, plat: 'darwin', skip: false });
  assert.equal(okCase.status, 'ok');
  assert.match(okCase.detail, /2\.1\.258 · login: ok/);

  const missing = checkClaudeCode({ exec: execWith({}), floors: FLOORS, plat: 'darwin', skip: false });
  assert.equal(missing.status, 'fail');
  assert.match(missing.detail, /^Claude Code not found on PATH — install it from https:\/\/code\.claude\.com\/docs\/en\/setup, then re-run$/);

  const old = checkClaudeCode({ exec: execWith({ ...GOOD, 'claude --version': '2.0.1' }),
    floors: FLOORS, plat: 'darwin', skip: false });
  assert.equal(old.status, 'fail');
  assert.match(old.detail, new RegExp(`≥ ${FLOORS.claudeCode.replace(/\./g, '\\.')} required`));

  // A CLI too old to have `auth` is reported as unverified, never as a failure: signing in is
  // Claude Code's own first-run flow, and refusing to install an engine over it is refusing the
  // wrong thing.
  const noAuthCmd = checkClaudeCode({ exec: execWith({ ...GOOD, 'claude --help': 'commands: mcp, doctor',
    'claude auth status': null }), floors: FLOORS, plat: 'darwin', skip: false });
  assert.equal(noAuthCmd.status, 'ok');
  assert.match(noAuthCmd.detail, /login: not verified \(claude auth status unavailable\)/);

  const loggedOut = checkClaudeCode({ exec: execWith({ ...GOOD,
    'claude auth status': { ok: false, stdout: '' } }), floors: FLOORS, plat: 'darwin', skip: false });
  assert.equal(loggedOut.status, 'warn', 'not logged in must never stop an installation');
  assert.equal(loggedOut.detail, 'Claude Code is not logged in — run: claude');
});

test('AC 6 — --skip-claude-check is a WARN, and asks the CLI nothing', () => {
  const r = checkClaudeCode({ exec: () => { throw new Error('must not be called'); },
    floors: FLOORS, plat: 'linux', skip: true });
  assert.equal(r.status, 'warn');
  assert.equal(r.detail, 'Claude Code check skipped (--skip-claude-check)');
  assert.equal(checkLine(r), 'WARN B00: Claude Code check skipped (--skip-claude-check)');
});

// ── ARC-09-C269 — "not found" was three cases: not on PATH, there and silent, there and failed ─────────────────────
//
// A Windows end user's first `upgrade` printed `installed: not found — install Claude Code` and refused, and 0.18 s later
// `claude --version` printed 2.1.319. Node's own shape for the child it killed at the budget is `code` ETIMEDOUT, a signal,
// and no status (measured on this Mac, and by the real-child case in tests/doctor/engine-prereqs.test.mjs on every CI OS).
// Every `exec` below is the tests' own: no case spawns a `claude`.

/** Where the fake Claude Code is, the way the platform spells a path: the words quote it, so the expectations take it from here. */
const CLAUDE_FILE = process.platform === 'win32' ? 'claude.cmd' : 'claude';
const CLAUDE_BIN = resolve('/', 'snowarch-c269', CLAUDE_FILE);
const NOT_ON_PATH = { found: false, ok: false, stdout: '', stderr: '' };
const silentAt = (bin = CLAUDE_BIN) => ({ found: true, ok: false, stdout: '', stderr: '', bin, timedOut: true, status: null });
const exitedAt = (status, stderr, bin = CLAUDE_BIN) => ({ found: true, ok: false, stdout: '', stderr, bin, timedOut: false, status });
const answeredAt = (stdout, bin = CLAUDE_BIN) => ({ found: true, ok: true, stdout, stderr: '', bin });

/** An `exec` whose successive `claude --version` answers are the list (the last one repeats); the rest comes from the table. */
function claudeSays(answers, rest = {}) {
  const asked = [];
  let n = 0;
  const exec = (name, args) => {
    asked.push(`${name} ${args.join(' ')}`);
    return name === 'claude' && args[0] === '--version' ? answers[Math.min(n++, answers.length - 1)] : execWith(rest)(name, args);
  };
  return Object.assign(exec, { asked });
}
const REST = { 'claude --help': 'commands: auth, mcp', 'claude auth status': 'Logged in' };
const claudeCheck = (exec, plat = 'darwin') => checkClaudeCode({ exec, floors: FLOORS, plat, skip: false });

test('ARC-09-C269 — a Claude Code that is not on PATH keeps its words and is asked once', () => {
  const exec = claudeSays([NOT_ON_PATH]);
  const r = claudeCheck(exec);
  assert.equal(r.status, 'fail');
  assert.equal(r.detail, 'Claude Code not found on PATH — install it from https://code.claude.com/docs/en/setup, then re-run');
  assert.equal(r.remedy, remedyFor('claudeCode', { platform: 'darwin' }));
  assert.deepEqual(exec.asked, ['claude --version'], 'there is nothing to ask a second time');
});

test('ARC-09-C269 — a Claude Code that is on PATH and gave no answer twice is named with its path, the budget and a remedy that is not to install it', () => {
  const exec = claudeSays([silentAt()], REST);
  const r = claudeCheck(exec);
  assert.equal(r.status, 'fail', 'found but silent still stops the preflight');
  assert.ok(r.detail.includes(CLAUDE_BIN), `the path it was found at is not in: ${r.detail}`);
  assert.match(r.detail, /\b10 s\b/, 'the budget is said');
  assert.match(r.detail, /twice/, 'and that it was asked twice');
  assert.match(r.detail, /`claude --version`/);
  assert.equal(r.remedy, 'run `claude --version` once, then re-run');
  assert.doesNotMatch(`${r.detail}\n${r.remedy}`, /\binstall\b|not found|\bPATH\b/i, 'it is installed: nothing here may tell the reader to install it');
  assert.deepEqual(exec.asked, ['claude --version', 'claude --version'], 'twice, and not on to the help and the login');
  assert.equal(checkLine(r).startsWith('FAIL B00: Claude Code'), true);
});

test('ARC-09-C269 — one silent start is absorbed by the retry: the second answer is judged, and the login is asked after it', () => {
  const exec = claudeSays([silentAt(), answeredAt('2.1.319 (Claude Code)')], REST);
  const r = claudeCheck(exec);
  assert.equal(r.status, 'ok', r.detail);
  assert.match(r.detail, /2\.1\.319 · login: ok/);
  assert.deepEqual(exec.asked, ['claude --version', 'claude --version', 'claude --help', 'claude auth status']);
  // The retry is for anything found that did not answer, an exit status included: a first run that fails and a second that works passes.
  const flaky = claudeSays([exitedAt(1, 'EBUSY: resource busy or locked'), answeredAt('2.1.319 (Claude Code)')], REST);
  assert.equal(claudeCheck(flaky).status, 'ok');
  assert.equal(flaky.asked.filter((q) => q === 'claude --version').length, 2);
});

test('ARC-09-C269 — a Claude Code that exits with a code says the code and the first line it printed on stderr, and never to install it', () => {
  const exec = claudeSays([exitedAt(1, 'Error: cannot load the module\n    at Object.<anonymous> (x.js:1:1)\n')], REST);
  const r = claudeCheck(exec);
  assert.equal(r.status, 'fail');
  assert.ok(r.detail.includes(CLAUDE_BIN), r.detail);
  assert.match(r.detail, /\bcode 1\b/);
  assert.ok(r.detail.includes('Error: cannot load the module'), 'the first stderr line is quoted');
  assert.ok(!r.detail.includes('at Object.<anonymous>'), 'and only the first');
  assert.ok(!r.detail.includes('\n'), 'the detail is one line, as checkLine prints it');
  assert.doesNotMatch(`${r.detail}\n${r.remedy}`, /\binstall\b|not found|\bPATH\b/i);
  assert.equal(r.remedy, 'run `claude --version` once, then re-run');
  assert.equal(exec.asked.length, 2, 'asked twice');
  // No stderr at all: the code alone, with no dangling colon.
  const bare = claudeCheck(claudeSays([exitedAt(3, '')], REST));
  assert.match(bare.detail, /\bcode 3$/, bare.detail);
  // A long line is cut, and colour codes and other control characters are not printed.
  const long = claudeCheck(claudeSays([exitedAt(2, `${'x'.repeat(400)}\n`)], REST));
  assert.ok(long.detail.length < 400, `${long.detail.length} characters`);
  const coloured = claudeCheck(claudeSays([exitedAt(2, '\u001b[31mError: broke\u001b[0m\u0007\n')], REST));
  assert.ok(coloured.detail.endsWith('code 2: Error: broke'), coloured.detail);
});

test('ARC-09-C269 — a Claude Code that could not be started says what Node said, and not a status it never had', () => {
  const refused = { found: true, ok: false, stdout: '', stderr: 'spawnSync claude EACCES', bin: CLAUDE_BIN, timedOut: false, status: null, signal: null, code: 'EACCES' };
  const r = claudeCheck(claudeSays([refused], REST));
  assert.equal(r.status, 'fail');
  assert.ok(r.detail.includes(CLAUDE_BIN), r.detail);
  assert.ok(r.detail.includes('EACCES'), r.detail);
  assert.doesNotMatch(r.detail, /code null|code undefined|no answer|\binstall\b|not found/i);
  assert.equal(r.remedy, 'run `claude --version` once, then re-run');
});

test('ARC-09-C269 — a version that is not understood, and one below the floor, keep their words and are asked once', () => {
  const odd = claudeSays([answeredAt('some build')], REST);
  const r = claudeCheck(odd);
  assert.equal(r.status, 'fail');
  assert.equal(r.detail, 'Claude Code version not understood: some build');
  assert.deepEqual(odd.asked, ['claude --version'], 'an answer is not asked for again');
  const old = claudeSays([answeredAt('2.0.1 (Claude Code)')], REST);
  assert.match(claudeCheck(old).detail, new RegExp(`Claude Code 2\\.0\\.1 found, ≥ ${FLOORS.claudeCode.replace(/\./g, '\\.')} required`));
  assert.equal(old.asked.length, 1);
});

test('ARC-09-C269 — the recorded Claude Code version is never read out of a path or a stderr line', async () => {
  // A native install keeps its builds under a version folder, so the path the words quote can hold a version.
  const versioned = resolve('/', 'claude', 'versions', '2.1.319', CLAUDE_FILE);
  for (const answer of [silentAt(versioned), exitedAt(1, 'cannot start 9.9.9 build', versioned)]) {
    const r = await runB00({
      root: '/repo', cwd: '/repo', config: { floors: FLOORS }, docs: 'sparse', mode: 'design-only',
      env: {}, plat: 'darwin', line: () => {}, exec: claudeSays([answer], GOOD),
      locate: (n) => `/usr/bin/${n}`,
      statfs: () => ({ bavail: 1e9, bsize: 4096 }),
      probe: async () => ({ ok: true, status: 200, proxy: null }),
    });
    assert.equal(r.status, 'fail');
    assert.equal(r.data.checks.claudeCode, 'fail');
    assert.equal(r.data.claudeCode, null, 'a version the tool did not state is not recorded');
    assert.equal(r.data.git, '2.39.5', 'the other versions are still read');
  }
});

test('ARC-09-C269 — on Windows the path in the words is the one the product resolved, from the same which() and the same extension rule', (t) => {
  const dir = tempDir('snowarch-c269-', t);
  // PATHEXT holds one entry and the file has exactly that spelling, so this resolves on a case-sensitive file system too.
  writeFileSync(join(dir, 'claude.CMD'), '@echo off\r\n');
  const env = { PATH: dir, PATHEXT: '.CMD', ComSpec: join(dir, 'cmd.exe') };
  const hung = Object.assign(new Error('spawnSync cmd.exe ETIMEDOUT'), { code: TIMED_OUT, signal: 'SIGTERM', status: null, stdout: '', stderr: '' });
  const asked = [];
  const exec = makeExec({ env, plat: 'win32', exec: (file, args) => { asked.push([file, ...args]); throw hung; } });
  const r = checkClaudeCode({ exec, floors: FLOORS, plat: 'win32', skip: false });
  const resolved = which('claude', { env, platform: 'win32' });
  assert.equal(resolved, join(dir, 'claude.CMD'), 'the fixture resolves where the product looks');
  assert.equal(r.status, 'fail');
  assert.ok(r.detail.includes(resolved), `the resolved path is not in: ${r.detail}`);
  assert.match(r.detail, /\b10 s\b/);
  assert.match(r.detail, /twice/);
  assert.equal(asked.length, 2, 'the batch file was run twice, through cmd.exe');
  assert.ok(asked.every(([file]) => file === env.ComSpec));
  assert.doesNotMatch(`${r.detail}\n${r.remedy}`, /\binstall\b|not found|\bPATH\b/i);
});

test('check 4 — disk, with the full corpus asking for more than the sparse one', () => {
  const statfs = (free) => () => ({ bavail: free / 4096, bsize: 4096 });
  assert.ok(DISK_FULL > DISK_SPARSE, 'the whole corpus must cost more than a cone of it');

  assert.equal(checkDisk({ root: '/r', docs: 'sparse', plat: 'darwin',
    statfs: statfs(DISK_SPARSE * 2) }).status, 'ok');

  const tight = checkDisk({ root: '/r', docs: 'full', plat: 'darwin',
    statfs: statfs(DISK_SPARSE * 1.1) });
  assert.equal(tight.status, 'fail', '--docs full raises the requirement');
  assert.match(tight.remedy, /free up \d+ MB on \/r/);

  // ARC-09-C244 — the whole corpus is the default. A fresh install fetches all of it and needs DISK_FULL; one that
  // already holds a corpus keeps the floor every run asks for, since what a sparse corpus lacks (151 MB on disk,
  // measured) fits in that floor's headroom, and the move to the whole corpus must not stop an upgrade that would pass.
  assert.equal(checkDisk({ root: '/r', docs: 'full', plat: 'darwin', hasCorpus: true,
    statfs: statfs(DISK_SPARSE * 1.1) }).status, 'ok', 'a corpus already on disk keeps the floor');
  assert.equal(checkDisk({ root: '/r', docs: 'full', plat: 'darwin', hasCorpus: true,
    statfs: statfs(DISK_SPARSE * 0.9) }).status, 'fail', 'and the floor still holds');
  assert.equal(checkDisk({ root: '/r', docs: 'full', plat: 'darwin', hasCorpus: false,
    statfs: statfs(DISK_SPARSE * 1.1) }).status, 'fail', 'a fresh whole corpus needs DISK_FULL');

  // An unmeasurable filesystem is a warning, not a failure: refusing to install because statfs is
  // unsupported would be refusing over the measurement rather than the thing measured.
  const unmeasured = checkDisk({ root: '/r', docs: 'sparse', plat: 'darwin',
    statfs: () => { const e = new Error('nope'); e.code = 'ENOSYS'; throw e; } });
  assert.equal(unmeasured.status, 'warn');
});

test('ARC-09-C259 — the disk check counts gigabytes of 10^9 bytes: the floors are 1 GB and 1.5 GB, and 12,000,000,000 free bytes read 12.0 GB', () => {
  // The floors were 1 GiB and 1.5 GiB and the detail printed GiB as "GB", so a Mac with 11.2 GiB free said "11.2 GB" where the
  // drive's own label says 12 GB. The refusal point moves with the unit, down by 6.9%, and the launchers hold the same bytes
  // (tests/size-unit.test.mjs reads all three files).
  const statfs = (free) => () => ({ bavail: free / 4096, bsize: 4096 });
  assert.equal(DISK_SPARSE, 1_000_000_000);
  assert.equal(DISK_FULL, 1_500_000_000);
  const roomy = checkDisk({ root: '/r', docs: 'sparse', plat: 'darwin', statfs: statfs(12_000_000_000) });
  assert.equal(roomy.status, 'ok');
  assert.equal(roomy.detail, '12.0 GB free');
  const tight = checkDisk({ root: '/r', docs: 'sparse', plat: 'darwin', statfs: statfs(900_000_000) });
  assert.equal(tight.status, 'fail');
  assert.equal(tight.detail, '0.9 GB free, 1.0 GB needed');
  assert.match(tight.remedy, /free up 100 MB on \/r/);
  // A fresh whole corpus: 1.4 GB is under its 1.5 GB floor, 1.6 GB is over it.
  assert.equal(checkDisk({ root: '/r', docs: 'full', plat: 'darwin', hasCorpus: false, statfs: statfs(1_400_000_000) }).status, 'fail');
  assert.equal(checkDisk({ root: '/r', docs: 'full', plat: 'darwin', hasCorpus: false, statfs: statfs(1_600_000_000) }).status, 'ok');
});

/**
 * ARC-09-C40 — the preflight probe retries, on the same schedule B02's checkout has had since
 * ARC-03-C1.
 *
 * WHAT HAPPENED: `bootstrap (macos-latest, node 24)` on #193 exited 3 — EXIT_PREREQ — with no log,
 * leaving disk and network as the only two candidates and no way to tell which. A preflight that
 * fails a whole install on ONE unlucky HTTP probe is the ARC-03-C1 defect one step earlier in the
 * same run: the flaky minute B02 survives by waiting 3 s used to stop the bootstrap before it
 * started.
 *
 * The schedule is PROVEN WITHOUT BEING SPENT — `sleep` is injected, as ARC-03-C1 injects it — so
 * these cases cost nothing and still assert the waits.
 */
test('ARC-09-C40 — a transient probe failure is retried and the check passes', async () => {
  const slept = [];
  let call = 0;
  const probe = async () => {
    call += 1;
    if (call === 1) return { ok: false, status: 503, detail: 'github.com answered HTTP 503' };
    return { ok: true, status: 200, proxy: null };
  };
  const r = await checkNetwork({ env: {}, plat: 'darwin', upstream: CORPUS_UPSTREAM,
    probe, sleep: async (ms) => { slept.push(ms); } });

  assert.equal(r.status, 'ok', r.detail);
  assert.equal(call, 2, 'it did not try again after a retryable answer');
  assert.deepEqual(slept, [3000], 'it waited something other than the planned first pause');
  // The ok line says the retry happened. A run that recovered silently tells a CI reader nothing
  // about a network that is degrading.
  assert.match(r.detail, /after 2 attempts/, r.detail);
});

test('ARC-09-C40 — a permanent probe failure stops at once, and says what it was', async () => {
  const slept = [];
  let call = 0;
  const probe = async () => {
    call += 1;
    return { ok: false, code: 'ENOTFOUND', detail: 'cannot reach github.com (DNS) — check your network and re-run' };
  };
  const r = await checkNetwork({ env: {}, plat: 'darwin', upstream: CORPUS_UPSTREAM,
    probe, sleep: async (ms) => { slept.push(ms); } });

  assert.equal(r.status, 'fail');
  assert.equal(call, 1, 'a name that does not resolve was probed more than once');
  assert.deepEqual(slept, [], 'it waited for a failure that will never change');
  // A single attempt reports no count at all — the rule #186 set, shared through `attemptSuffix`
  // rather than re-worded here.
  assert.doesNotMatch(r.detail, /attempts/, r.detail);
  assert.match(r.detail, /cannot reach github\.com \(DNS\)/);
});

test('ARC-09-C40 — the schedule runs out, and the count says so', async () => {
  const slept = [];
  let call = 0;
  const probe = async () => { call += 1; return { ok: false, status: 503, detail: 'github.com answered HTTP 503' }; };
  const r = await checkNetwork({ env: {}, plat: 'darwin', upstream: CORPUS_UPSTREAM,
    probe, sleep: async (ms) => { slept.push(ms); } });

  assert.equal(r.status, 'fail');
  assert.equal(call, 3, `it made ${call} attempts, not three`);
  assert.deepEqual(slept, [3000, 9000], 'it slept a schedule it had not planned');
  assert.match(r.detail, / \(3 attempts\)$/, r.detail);
});

test('ARC-09-C40 — a failure that CHANGES CLASS says it stopped, not that it ran out', async () => {
  // The case ARC-03-C3 found in the corpus checkout, at the probe: retryable first, settled second.
  // The count alone would read as a third attempt owed and skipped.
  const slept = [];
  let call = 0;
  const probe = async () => {
    call += 1;
    return call === 1
      ? { ok: false, status: 503, detail: 'github.com answered HTTP 503' }
      : { ok: false, code: 'ENOTFOUND', detail: 'cannot reach github.com (DNS) — check your network and re-run' };
  };
  const r = await checkNetwork({ env: {}, plat: 'darwin', upstream: CORPUS_UPSTREAM,
    probe, sleep: async (ms) => { slept.push(ms); } });

  assert.equal(call, 2);
  assert.deepEqual(slept, [3000], 'it waited once, for the retryable answer, and not again');
  assert.match(r.detail, / \(stopped after 2 attempts — this failure is not retried\)$/, r.detail);
  assert.doesNotMatch(r.detail, /\(2 attempts\)/, 'it reads again as a third attempt owed and skipped');
});

test('check 5 — the network check turns a probe failure into a named remedy', async () => {
  // ARC-09-C29: the check needs to be told what this run will fetch. The upstream here is the one
  // `engine.config.json` ships, so these cases exercise the default configuration.
  const good = await checkNetwork({ env: {}, plat: 'darwin', upstream: CORPUS_UPSTREAM,
    probe: async () => ({ ok: true, status: 200, proxy: null }) });
  assert.equal(good.status, 'ok');
  assert.match(good.detail, /github\.com reachable \(HTTP 200\)/);

  const viaProxy = await checkNetwork({ env: {}, plat: 'darwin', upstream: CORPUS_UPSTREAM,
    probe: async () => ({ ok: true, status: 200, proxy: 'http://***@p:8080' }) });
  assert.match(viaProxy.detail, /via proxy http:\/\/\*\*\*@p:8080/);

  const bad = await checkNetwork({ env: {}, plat: 'darwin', upstream: CORPUS_UPSTREAM,
    probe: async () => ({ ok: false, detail: 'cannot reach github.com (DNS) — check your network and re-run' }) });
  assert.equal(bad.status, 'fail');
  assert.match(bad.remedy, /HTTPS_PROXY \/ NO_PROXY/);

  // ...and the host it names is the CONFIGURED one, not a constant. A mirror is the case the old
  // check could not see: it passed on github.com and said nothing about the host B02 would fetch.
  const mirror = await checkNetwork({ env: {}, plat: 'darwin',
    upstream: 'https://git.corp.example/mirror/ServiceNowDocs.git',
    probe: async () => ({ ok: true, status: 200, proxy: null }) });
  assert.match(mirror.detail, /^git\.corp\.example reachable/);
});

test('ARC-09-C29 — an upstream that needs no network is skipped OUT LOUD', async () => {
  // Both halves matter. A local upstream must not be probed -- that is the ten hermetic fixture
  // tests -- and it must SAY it was not, because a check that quietly stops checking is worse than
  // one that never existed.
  let probed = 0;
  const count = async () => { probed += 1; return { ok: true, status: 200, proxy: null }; };

  for (const upstream of ['file:///tmp/corpus.git', '/tmp/corpus.git', '']) {
    const r = await checkNetwork({ env: {}, plat: 'darwin', upstream, probe: count });
    assert.equal(r.status, 'ok', `${upstream || '<empty>'} did not pass`);
    assert.match(r.detail, /no probe$/, `${upstream || '<empty>'}: ${r.detail}`);
  }
  assert.equal(probed, 0, 'a local upstream was probed anyway');

  // A remote this probe cannot speak to is NOT called local: same outcome, different claim, and
  // saying "local" about an ssh remote would be the untrue-statement bug one scheme further along.
  const ssh = await checkNetwork({ env: {}, plat: 'darwin',
    upstream: 'ssh://git@example.com/x.git', probe: count });
  assert.equal(ssh.status, 'ok');
  assert.match(ssh.detail, /corpus upstream is ssh — not probed/);
  assert.equal(probed, 0, 'an ssh upstream was probed over HTTPS');

  // The other direction, or "nothing was probed" would be true of a check that cannot probe at all.
  const https = await checkNetwork({ env: {}, plat: 'darwin',
    upstream: 'https://github.com/ServiceNow/ServiceNowDocs.git', probe: count });
  assert.equal(probed, 1, 'a remote HTTPS upstream was not probed');
  assert.match(https.detail, /^github\.com reachable/);
});

test('AC 5 — Node absent is a note in design-only and a FAIL for live', () => {
  const noNode = execWith({ ...GOOD, 'node --version': null, 'npm --version': null });

  const design = checkNode({ exec: noNode, floors: FLOORS, plat: 'darwin', mode: 'design-only' });
  assert.equal(design.status, 'ok', 'design-only does not need Node — the launchers do that path');
  assert.match(design.detail, /^note: Node\.js not found — design-only only; live mode needs Node \d+\+/);
  assert.match(design.detail, /brew install node@22/);

  const live = checkNode({ exec: noNode, floors: FLOORS, plat: 'darwin', mode: 'live' });
  assert.equal(live.status, 'fail');
  assert.match(live.detail, /^live mode needs Node\.js \d+\+ — brew install node@22$/);
  assert.match(checkLine(live), /^FAIL B00: live mode needs Node\.js \d+\+/);

  // Below the floor behaves the same way, in both modes.
  const oldNode = execWith({ ...GOOD, 'node --version': 'v18.20.0' });
  assert.equal(checkNode({ exec: oldNode, floors: FLOORS, plat: 'linux', mode: 'live' }).status, 'fail');
  assert.equal(checkNode({ exec: oldNode, floors: FLOORS, plat: 'linux', mode: 'design-only' }).status, 'ok');

  // npm missing is the same finding: live cannot work, design-only is unaffected. Presence is
  // located rather than executed, so `locate` is what the test controls.
  const noNpm = { exec: execWith(GOOD), locate: (n) => (n === 'npm' ? null : `/usr/bin/${n}`) };
  assert.equal(checkNode({ ...noNpm, floors: FLOORS, plat: 'win32', mode: 'live' }).status, 'fail');
  assert.match(checkNode({ ...noNpm, floors: FLOORS, plat: 'win32', mode: 'design-only' }).detail,
    /npm is not on PATH/);

  const present = { exec: execWith(GOOD), locate: (n) => `/usr/bin/${n}` };
  const fine = checkNode({ ...present, floors: FLOORS, plat: 'darwin', mode: 'live' });
  assert.equal(fine.status, 'ok');
  assert.equal(fine.detail, '22.11.0 · npm 10.9.0');

  // On Windows npm is a `.cmd`, which Node ≥ 20.12 refuses to spawn without a shell — so it is
  // located and NOT run. Reading its version is a nicety; reading it wrongly is a wrong FAIL on
  // every Windows machine, which is what the runner showed.
  const onWindows = checkNode({
    exec: (name, a) => {
      if (name === 'npm') throw new Error('npm.cmd must not be spawned');
      return execWith(GOOD)(name, a);
    },
    locate: (n) => (n === 'npm' ? 'C:\\npm.cmd' : 'C:\\node.exe'),
    floors: FLOORS, plat: 'win32', mode: 'live' });
  assert.equal(onWindows.status, 'ok');
  assert.equal(onWindows.detail, '22.11.0 · npm present', 'located, not executed');
});

test('check 7 — the machine is recorded, and only 32-bit is worth saying anything about', () => {
  assert.equal(checkPlatform({ plat: 'darwin', cpu: 'arm64', rel: '25.5.0' }).status, 'ok');
  assert.equal(checkPlatform({ plat: 'darwin', cpu: 'arm64', rel: '25.5.0' }).detail, 'darwin arm64 25.5.0');
  assert.equal(checkPlatform({ plat: 'win32', cpu: 'ia32', rel: '10.0' }).status, 'warn');
});

/**
 * ARC-06-C11 — the install page's preflight count, pinned to the runner's own list.
 *
 * The page said *"Six preflight checks print a line each"* and named six. The Node path prints
 * SEVEN — the sentence omitted `root` — and the Node-free launcher prints FIVE, because it reports
 * no `platform` line and checks the root silently, speaking only when it fails. A number that is
 * right for neither path a reader can be on is worse than no number: it is the kind of almost-right
 * a reader trusts once and then has to re-count. Found by following Path A on Ubuntu and counting.
 *
 * The count comes from `Object.keys(result.data.checks)` — the runner's own answer, not a copy of
 * it — so **adding a check fails this test and the page together**, which is the only arrangement
 * that keeps a prose number true over time.
 */
test('ARC-06-C11 — docs/INSTALL.md states the preflight count the runner actually prints', async () => {
  const r = await runB00({
    root: '/repo', cwd: '/repo', docs: 'sparse', mode: 'design-only',
    config: { floors: FLOORS, docs: { upstream: CORPUS_UPSTREAM } },
    env: {}, plat: 'darwin', line: () => {},
    exec: execWith({ 'claude --version': '2.1.258', 'claude --help': 'auth', 'claude auth status': 'ok',
      'node --version': 'v22.11.0', 'npm --version': '10.9.0', 'git --version': 'git version 2.39.5',
      'git -C': '/repo' }),
    statfs: () => ({ bavail: 20_000_000, bsize: 4096 }),
    probe: async () => ({ ok: true, status: 200, proxy: null }),
  });

  const ids = Object.keys(r.data.checks);
  const onNode = ids.length;
  // The two the Node path reports and the Node-free launcher does not. Named rather than counted,
  // so a rename shows up here instead of silently keeping the arithmetic right.
  const nodeOnly = ['root', 'platform'];
  for (const id of nodeOnly) assert.ok(ids.includes(id), `${id} is no longer a B00 check`);
  const onLauncher = onNode - nodeOnly.length;

  // Spelled numbers, because the sentence is prose. One lowercase table and a capitaliser, rather
  // than two tables that could disagree about the same number.
  const WORD = { 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine' };
  const Cap = (n) => WORD[n][0].toUpperCase() + WORD[n].slice(1);
  const page = readFileSync(join(repoRoot, 'docs/INSTALL.md'), 'utf8');
  const sentence = page.split('\n').find((l) => l.includes('preflight checks print a line each'));
  assert.ok(sentence, 'the preflight sentence is gone from docs/INSTALL.md');

  assert.ok(sentence.startsWith(`${Cap(onLauncher)} preflight checks print a line each`),
    `the page opens with a count that is not the ${onLauncher} both paths print:\n${sentence}`);
  assert.ok(sentence.includes(`prints ${WORD[onNode]}`),
    `the page does not say the Node path prints ${WORD[onNode]}:\n${sentence}`);
  assert.ok(sentence.includes(`Node-free one prints ${WORD[onLauncher]}`),
    `the page does not say the Node-free path prints ${WORD[onLauncher]}:\n${sentence}`);
  // The silence is the fact that made the old number wrong, so the page has to keep saying it.
  assert.match(sentence, /root is checked on both/,
    'the page no longer says the root is checked on the Node-free path too');
});

test('every check runs even after one has failed, and the summary counts them', async () => {
  // The rule this is about: an operator missing git AND behind a broken proxy should learn both in
  // one pass. A short-circuiting preflight makes that two runs, and the second failure feels like
  // the tool moving the goalposts.
  const lines = [];
  const r = await runB00({
    // ARC-09-C29: the config carries the corpus upstream, because that is what B00 probes now —
    // and a fixture config without one is a checkout that would skip the probe, which is a
    // different case (covered by its own test) rather than this one.
    root: '/repo', cwd: '/repo', docs: 'sparse', mode: 'design-only',
    config: { floors: FLOORS, docs: { upstream: 'https://github.com/ServiceNow/ServiceNowDocs.git' } },
    env: {}, plat: 'darwin', line: (l) => lines.push(l),
    exec: execWith({ 'claude --version': '2.1.258', 'claude --help': 'auth', 'claude auth status': 'ok',
      'node --version': 'v22.11.0', 'npm --version': '10.9.0', 'git -C': '/repo' }),
    statfs: () => ({ bavail: 1, bsize: 4096 }),
    probe: async () => ({ ok: false, detail: 'no route to github.com — are you offline, or is a firewall blocking 443?' }),
  });

  assert.equal(r.status, 'fail');
  assert.equal(r.code, 3, 'a missing prerequisite is not the same number as a failed step');
  // ARC-06-C10 — NAMED, not counted. This assertion used to pin the count alone, which is exactly
  // the shape ARC-08-C3 found in B09's summary: a number with nothing under it. The three names
  // are the three checks that failed, in the order they ran.
  assert.equal(r.detail, '3 prerequisite(s) missing: git, disk, network');
  assert.ok(lines.some((l) => l.startsWith('FAIL B00: git not found')));
  assert.ok(lines.some((l) => l.includes('free,')), 'the disk check still ran after git failed');
  assert.ok(lines.some((l) => l.includes('no route to github.com')), 'and so did the network check');
  assert.equal(r.data.checks.git, 'fail');
  assert.equal(r.data.checks.platform, 'ok', 'the last check ran too');
});

test('the recorded data is versions and a machine — never a path beyond the root', async () => {
  const r = await runB00({
    root: '/repo', cwd: '/repo', config: { floors: FLOORS }, docs: 'sparse', mode: 'design-only',
    env: {}, plat: 'darwin', line: () => {}, exec: execWith(GOOD),
    locate: (n) => `/usr/bin/${n}`,
    statfs: () => ({ bavail: 1e9, bsize: 4096 }),
    probe: async () => ({ ok: true, status: 200, proxy: null }),
  });
  assert.equal(r.status, 'ok');
  assert.deepEqual(Object.keys(r.data).sort(),
    ['arch', 'checks', 'claudeCode', 'git', 'node', 'nodeUsable', 'platform', 'release'].sort());
  assert.equal(r.data.nodeUsable, true, 'the plan screen reads this, so it must be recorded');
  assert.equal(r.data.node, '22.11.0');
  assert.equal(r.data.git, '2.39.5');
  assert.equal(r.data.claudeCode, '2.1.258');
  const serialised = JSON.stringify(r.data);
  assert.ok(!serialised.includes('/Users/'), serialised);
  assert.ok(!serialised.includes('http'), serialised);
});

test('the remedy table has a row for every check, on every platform, with nothing left unfilled', () => {
  const ids = ['root', 'git', 'claudeCode', 'disk', 'network', 'node', 'platform'];
  assert.deepEqual([...CHECK_IDS].sort(), ids.sort(), 'a check without a remedy is a status, not help');
  for (const id of CHECK_IDS) {
    for (const plat of ['darwin', 'win32', 'linux', 'default']) {
      const sentence = TABLE[id][plat];
      assert.equal(typeof sentence, 'string', `${id}.${plat}`);
      assert.ok(sentence.length > 0 && sentence.length < 160, `${id}.${plat} is not one sentence`);
    }
  }
  // The placeholders that exist are supplied by their caller; anything else is a brace shown to a
  // user, which is a bug with punctuation.
  const supplied = { root: { root: '/r' }, disk: { needed: '1 MB', mount: '/r' } };
  for (const id of CHECK_IDS) {
    for (const plat of ['darwin', 'win32', 'linux']) {
      assert.doesNotThrow(() => remedyFor(id, { platform: plat, values: supplied[id] ?? {} }),
        `${id}.${plat} has a placeholder nothing fills`);
    }
  }
  assert.throws(() => remedyFor('no-such-check'), /add one to remedies\.json/);
});

test('which() resolves on PATH and honours PATHEXT — the Windows half proven from here', () => {
  const root = makeCheckout();
  // A POSIX resolve against a real directory, then the Windows extension rule asserted through the
  // platform parameter, which is why it is a parameter.
  assert.equal(which('nothing-by-this-name', { env: { PATH: root }, platform: 'linux' }), null);
  const found = which('engine.config.json', { env: { PATH: root }, platform: 'win32' });
  assert.ok(found === null || found.endsWith('engine.config.json'));
  assert.equal(which('git', { env: { PATH: '' }, platform: process.platform }), null,
    'an empty PATH finds nothing — no ambient fallback');
});

test('two spellings of one directory are one directory — the Windows half proven from here', () => {
  // Every command on Windows exited 3 with "not at the repository root" because git prints
  // `C:/Users/...` with forward slashes and Node hands back `C:\\Users\\...`. The platform is a
  // parameter so the branch is provable from the machine that is not it — the same seam the
  // tree-kill uses, and for the same reason: a branch only one runner can reach is a branch that
  // is discovered in CI rather than in a test.
  assert.equal(samePath('C:/Users/runner/repo', 'C:\\Users\\runner\\repo', 'win32'), true,
    'forward and back slashes name one place');
  assert.equal(samePath('D:\\A\\repo', 'D:\\a\\repo', 'win32'), true,
    'Windows paths are case-insensitive');
  assert.equal(samePath('/repo/a', '/repo/b', 'win32'), false, 'and different places stay different');

  // POSIX keeps its case sensitivity: `/repo` and `/REPO` are two directories there.
  assert.equal(samePath('/repo', '/REPO', 'linux'), false);
  assert.equal(samePath('/repo/./sub/..', '/repo', 'linux'), true, 'normalised, not compared raw');

  // And a path that does not exist still normalises rather than throwing.
  assert.equal(samePath('/no/such/path', '/no/such/path', 'linux'), true);
});
