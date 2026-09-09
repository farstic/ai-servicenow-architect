import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DISK_FULL, DISK_SPARSE, checkClaudeCode, checkDisk, checkGit, checkNetwork, checkNode,
  checkPlatform, checkRoot, checkLine, run as runB00,
} from '../lib/steps/B00.mjs';
import { CHECK_IDS, TABLE, remedyFor } from '../lib/remedies.mjs';
import { compareVersion, formatVersion, meetsFloor, parseVersion } from '../lib/versions.mjs';
import { which } from '../lib/which.mjs';
import { makeCheckout } from './helpers/workspace.mjs';

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

  const onWindows = checkRoot({ root: 'C:\\repo', cwd: 'C:\\repo\\clients', exec, plat: 'win32' });
  assert.equal(onWindows.detail,
    'not at the repository root — run: cd /d "C:\\repo" && .\\bootstrap.cmd');

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

test('check 4 — disk, with the full corpus asking for more than the sparse one', () => {
  const statfs = (free) => () => ({ bavail: free / 4096, bsize: 4096 });
  assert.ok(DISK_FULL > DISK_SPARSE, 'the whole corpus must cost more than a cone of it');

  assert.equal(checkDisk({ root: '/r', docs: 'sparse', plat: 'darwin',
    statfs: statfs(DISK_SPARSE * 2) }).status, 'ok');

  const tight = checkDisk({ root: '/r', docs: 'full', plat: 'darwin',
    statfs: statfs(DISK_SPARSE * 1.1) });
  assert.equal(tight.status, 'fail', '--docs full raises the requirement');
  assert.match(tight.remedy, /free up \d+ MB on \/r/);

  // An unmeasurable filesystem is a warning, not a failure: refusing to install because statfs is
  // unsupported would be refusing over the measurement rather than the thing measured.
  const unmeasured = checkDisk({ root: '/r', docs: 'sparse', plat: 'darwin',
    statfs: () => { const e = new Error('nope'); e.code = 'ENOSYS'; throw e; } });
  assert.equal(unmeasured.status, 'warn');
});

test('check 5 — the network check turns a probe failure into a named remedy', async () => {
  const good = await checkNetwork({ env: {}, plat: 'darwin',
    probe: async () => ({ ok: true, status: 200, proxy: null }) });
  assert.equal(good.status, 'ok');
  assert.match(good.detail, /github\.com reachable \(HTTP 200\)/);

  const viaProxy = await checkNetwork({ env: {}, plat: 'darwin',
    probe: async () => ({ ok: true, status: 200, proxy: 'http://***@p:8080' }) });
  assert.match(viaProxy.detail, /via proxy http:\/\/\*\*\*@p:8080/);

  const bad = await checkNetwork({ env: {}, plat: 'darwin',
    probe: async () => ({ ok: false, detail: 'cannot reach github.com (DNS) — check your network and re-run' }) });
  assert.equal(bad.status, 'fail');
  assert.match(bad.remedy, /HTTPS_PROXY \/ NO_PROXY/);
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

  // npm missing is the same finding: live cannot work, design-only is unaffected.
  const noNpm = execWith({ ...GOOD, 'npm --version': null });
  assert.equal(checkNode({ exec: noNpm, floors: FLOORS, plat: 'win32', mode: 'live' }).status, 'fail');
  assert.match(checkNode({ exec: noNpm, floors: FLOORS, plat: 'win32', mode: 'design-only' }).detail,
    /npm is not on PATH/);

  const fine = checkNode({ exec: execWith(GOOD), floors: FLOORS, plat: 'darwin', mode: 'live' });
  assert.equal(fine.status, 'ok');
  assert.equal(fine.detail, '22.11.0 · npm 10.9.0');
});

test('check 7 — the machine is recorded, and only 32-bit is worth saying anything about', () => {
  assert.equal(checkPlatform({ plat: 'darwin', cpu: 'arm64', rel: '25.5.0' }).status, 'ok');
  assert.equal(checkPlatform({ plat: 'darwin', cpu: 'arm64', rel: '25.5.0' }).detail, 'darwin arm64 25.5.0');
  assert.equal(checkPlatform({ plat: 'win32', cpu: 'ia32', rel: '10.0' }).status, 'warn');
});

test('every check runs even after one has failed, and the summary counts them', async () => {
  // The rule this is about: an operator missing git AND behind a broken proxy should learn both in
  // one pass. A short-circuiting preflight makes that two runs, and the second failure feels like
  // the tool moving the goalposts.
  const lines = [];
  const r = await runB00({
    root: '/repo', cwd: '/repo', config: { floors: FLOORS }, docs: 'sparse', mode: 'design-only',
    env: {}, plat: 'darwin', line: (l) => lines.push(l),
    exec: execWith({ 'claude --version': '2.1.258', 'claude --help': 'auth', 'claude auth status': 'ok',
      'node --version': 'v22.11.0', 'npm --version': '10.9.0', 'git -C': '/repo' }),
    statfs: () => ({ bavail: 1, bsize: 4096 }),
    probe: async () => ({ ok: false, detail: 'no route to github.com — are you offline, or is a firewall blocking 443?' }),
  });

  assert.equal(r.status, 'fail');
  assert.equal(r.code, 3, 'a missing prerequisite is not the same number as a failed step');
  assert.equal(r.detail, '3 prerequisite(s) missing');
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
