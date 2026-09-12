import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootstrapCommand } from '../lib/bootstrap.mjs';
import { which } from '../lib/which.mjs';
import { makeCheckout, recorder } from './helpers/workspace.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const isWindows = process.platform === 'win32';
const sink = () => { const s = []; return { write: (x) => s.push(x), text: () => s.join('') }; };

/**
 * A checkout that is a real git repository, because the root check asks git where the top is.
 *
 * `SNOWARCH_TEST_NET_URL` is honoured by B00 and is TEST-ONLY: it exists so these run with no
 * network at all. It is documented here and nowhere else in the product.
 */
function gitCheckout() {
  const root = makeCheckout();
  execFileSync('git', ['init', '-q'], { cwd: root });
  return root;
}

/** The probe, stubbed at the command's seam so nothing here opens a socket. */
const noNetwork = { probe: async () => ({ ok: true, status: 200, proxy: null }) };

const args = (root, extra = {}) => ({
  // `--docs skip`: ARC-06-S06's B02 really syncs now, and these fixtures have no upstream to clone
  // from. A preflight test should not become a corpus test by accident.
  flags: { mode: 'design', yes: true, 'skip-claude-check': true, docs: 'skip', ...extra },
  log: recorder(), root, out: sink(), err: sink(),
});

test('AC 1 — seven check lines, all ok, and the versions reach the state', async () => {
  const root = gitCheckout();
  const a = args(root);
  const code = await bootstrapCommand({ ...a, cwd: root, ...noNetwork });

  // The failing CHECK first, then the exit code. `3 !== 0` names nothing, and a preflight that
  // fails on one runner and not another is precisely the case where the message has to carry the
  // evidence — otherwise the only way to find out is another push.
  assert.deepEqual(a.log.lines.filter((l) => l.startsWith('FAIL B00:')), [],
    `a preflight check failed on ${process.platform}:\n${a.log.lines.join('\n')}`);
  assert.equal(code, 0);
  const checks = a.log.lines.filter((l) => /^(ok B00 |WARN B00: |FAIL B00: )/.test(l));
  assert.equal(checks.length, 7, `expected seven check lines, got:\n${checks.join('\n')}`);
  // Six ok and the skipped Claude check, which is a WARN on a runner that has no Claude Code.
  assert.equal(checks.filter((l) => l.startsWith('ok B00 ')).length, 6);


  const state = JSON.parse(
    execFileSync(process.execPath, ['-p', `JSON.stringify(require(${JSON.stringify(join(root, '.local', 'bootstrap-state.json'))}))`],
      { encoding: 'utf8' }));
  assert.match(state.steps.B00.data.node, /^\d+\.\d+\.\d+$/, 'the state records node.version');
  assert.equal(state.steps.B00.data.platform, process.platform);
  // AC 1's "< 3 s" is NOT asserted here. This file runs inside a parallel test runner alongside
  // twenty other files, so a wall-clock reading measures contention rather than the preflight —
  // it read 5.6 s under load and 0.2 s alone. The budget is evidenced by the real
  // `./snowarch bootstrap` run recorded in the pull request; what a test can honestly claim is
  // that the step did the work and recorded a duration.
  assert.equal(typeof state.steps.B00.durationMs, 'number');
  assert.equal(state.steps.B00.status, 'warn', '--skip-claude-check is a warning, not a pass');
});

test('AC 2 — from a subdirectory: the root sentence, exit 3, and no .local/', async () => {
  const root = gitCheckout();
  const nested = join(root, 'clients');
  mkdirSync(nested, { recursive: true });
  const a = args(root);

  const code = await bootstrapCommand({ ...a, cwd: nested, ...noNetwork });

  assert.equal(code, 3, 'a missing prerequisite is exit 3, not exit 1');
  assert.ok(a.log.lines.some((l) => l === `FAIL B00: not at the repository root — run: `
    + `${isWindows ? `cd /d "${root}" && .\\bootstrap.cmd` : `cd "${root}" && ./bootstrap.sh`}`),
  a.log.lines.join('\n'));
  assert.equal(existsSync(join(root, '.local')), false, 'a preflight failure writes nothing at all');
  assert.ok(!a.log.lines.some((l) => l.startsWith('Plan —')), 'the plan must not be offered');
});

test('AC 3 — with git off the child\'s PATH: FAIL, the platform remedy, exit 3', async () => {
  // A real PATH with a real hole in it, rather than a stubbed `exec`: this is the one place where
  // "git is not installed" has to be discovered the way a user's machine would discover it.
  const root = gitCheckout();
  const emptyBin = join(root, 'empty-bin');
  mkdirSync(emptyBin, { recursive: true });
  // Node itself must stay reachable, or the test is about something else entirely.
  const nodeDir = dirname(process.execPath);
  // PRECONDITION, and it is not decoration: on the macOS runner git and node share a directory, so
  // a PATH built this way can silently contain the very tool the test removes. Asserting the hole
  // means a runner that collocates them fails loudly instead of testing nothing.
  const builtPath = [emptyBin, nodeDir].join(delimiter);
  assert.equal(which('git', { env: { PATH: builtPath, PATHEXT: '.EXE;.CMD' } }), null,
    'git is still resolvable on the constructed PATH — this test would prove nothing');
  const a = args(root);

  const code = await bootstrapCommand({ ...a, cwd: root, ...noNetwork,
    env: { PATH: builtPath, PATHEXT: '.EXE;.CMD' } });

  assert.equal(code, 3);
  assert.ok(a.log.lines.includes('FAIL B00: git not found'), a.log.lines.join('\n'));
  const remedy = a.log.lines.find((l) => l.startsWith('Remedy: ') && !l.includes('bootstrap'));
  assert.ok(remedy, 'a failure without a remedy is a status, not help');
  assert.match(remedy, isWindows ? /winget install Git\.Git/
    : (process.platform === 'darwin' ? /xcode-select --install/ : /apt install git/));
  assert.equal(existsSync(join(root, '.local')), false);
});

test('AC 5 — Node absent: design-only passes with a note, live stops at B00', async () => {
  const root = gitCheckout();
  // `exec` is INJECTED here, and the reason is the macOS runner: the first version built a PATH
  // holding git's directory and expected node to be absent from it, which is true on my machine
  // and false on that one — git and node share `/usr/local/bin` there, so "Node absent" quietly
  // became "Node 24 found" and the test asserted nothing. A fixture must make the state it is
  // about rather than hope the environment supplies it. AC 3 above keeps the real-PATH proof, with
  // a precondition guarding the same trap.
  const noNode = (name, cmdArgs) => (name === 'git'
    ? (cmdArgs[0] === '--version'
      ? { found: true, ok: true, stdout: 'git version 2.39.5', stderr: '' }
      : { found: true, ok: true, stdout: root, stderr: '' })
    : { found: false, ok: false, stdout: '', stderr: '' });

  const design = args(root);
  const designCode = await bootstrapCommand({ ...design, cwd: root, ...noNetwork, exec: noNode });
  assert.equal(designCode, 0, 'design-only must not need Node — the launchers do that path');
  assert.ok(design.log.lines.some((l) => /^ok B00 node: note: Node\.js not found/.test(l)),
    design.log.lines.join('\n'));

  const live = args(root, { mode: 'live', yes: undefined });
  const liveCode = await bootstrapCommand({ ...live, cwd: root, ...noNetwork, exec: noNode,
    asker: { ask: async () => '', close: () => {} } });
  assert.equal(liveCode, 3);
  assert.ok(live.log.lines.some((l) => /^FAIL B00: live mode needs Node\.js \d+\+ — /.test(l)),
    live.log.lines.join('\n'));
});

test('AC 6 — without --skip-claude-check on a runner that has none, B00 fails', async () => {
  const root = gitCheckout();
  const a = args(root, { 'skip-claude-check': undefined });

  const code = await bootstrapCommand({ ...a, cwd: root, ...noNetwork });

  // A machine that genuinely has Claude Code passes here, which is the correct outcome and not a
  // vacuous one — so the assertion is on the pair, not on the failure alone.
  const failed = a.log.lines.some((l) => l.startsWith('FAIL B00: Claude Code not found on PATH'));
  assert.equal(code, failed ? 3 : 0);
  if (failed) assert.ok(a.log.lines.some((l) => l.includes('code.claude.com/docs/en/setup')));
});

test('the network failure a preflight reports is the one the clone would have hit', async () => {
  const root = gitCheckout();
  // ARC-09-C29: B00 probes the CORPUS remote, and this fixture's upstream is `file:///dev/null` —
  // a local one, which is correctly not probed at all. This case is about the failure a clone
  // would hit, so it needs a checkout that would actually clone from somewhere.
  const config = JSON.parse(readFileSync(join(root, 'engine.config.json'), 'utf8'));
  writeFileSync(join(root, 'engine.config.json'), `${JSON.stringify({
    ...config, docs: { ...config.docs, upstream: 'https://github.com/ServiceNow/ServiceNowDocs.git' },
  }, null, 2)}\n`);
  const a = args(root);
  const code = await bootstrapCommand({ ...a, cwd: root,
    probe: async () => ({ ok: false, proxy: null,
      detail: 'no route to github.com — are you offline, or is a firewall blocking 443?' }) });

  assert.equal(code, 3);
  assert.ok(a.log.lines.some((l) => l === 'FAIL B00: no route to github.com — are you offline, '
    + 'or is a firewall blocking 443?'), a.log.lines.join('\n'));
  assert.equal(existsSync(join(root, '.local')), false);
});

test('B00 runs before the plan, and never from the cache', async () => {
  const root = gitCheckout();
  const first = args(root);
  await bootstrapCommand({ ...first, cwd: root, ...noNetwork });
  const second = args(root);
  await bootstrapCommand({ ...second, cwd: root, ...noNetwork });

  const planAt = second.log.lines.findIndex((l) => l.startsWith('Plan —'));
  const b00At = second.log.lines.findIndex((l) => l.startsWith('ok B00 '));
  assert.ok(b00At !== -1 && (planAt === -1 || b00At < planAt),
    'offering a plan before knowing the machine can run it asks a decided question');
  assert.ok(!second.log.lines.some((l) => /\[B00\/09\].*cached/.test(l)),
    'a cached preflight is last week\'s answer about this week\'s machine');
  assert.equal(second.log.lines.filter((l) => l.startsWith('ok B00 ')).length, 6);
});
