// ARC-08-S03 — E-25, E-26, E-27. Every input is injected: no test here reads this machine.
//
// E-27 is the one that could not be tested without a fixture at all — it runs `claude`, and the
// answer it parses is Claude Code's. So the fixture is a fake `claude` on PATH (a POSIX script and
// a `.cmd` twin, because `which` resolves by extension on Windows) printing the exact status lines
// the S-01 spike recorded on two Claude Code versions. What is proved is the RULE, not the
// wording: a wording nobody has seen degrades to a WARN that says so.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';

import { which } from '../../tools/snowarch/lib/which.mjs';

import { classifyStatus, hostChecks, inspectCa, PEM_HEADER,
  readVar } from '../../tools/snowarch/lib/doctor/checks/host.mjs';
import { tempDir } from '../../tools/snowarch/tests/helpers/temp.mjs';
import { bootstrap, contextFor, greenTree, runById } from './helpers/tree.mjs';

const checks = hostChecks();
const run = (id, root, over = {}) => runById(checks, id, contextFor(root, over));

// The three lines `docs/spikes/S-01-preseeded-approval/README.md` recorded, character for
// character, on 2.1.214 and 2.1.258 — quoted here as DATA about Claude Code's output.
const REJECTED = '✘ Rejected (see disabledMcpjsonServers in settings)';
const PENDING = '⏸ Pending approval (run `claude` to approve)';
const CONNECTED = '✔ Connected';

/** The transcript a real `claude mcp get` prints, in the S-01 record's exact shape. */
function transcript(statusLine, scope = 'Project config (shared via .mcp.json)') {
  const word = /^local/i.test(scope) ? 'local' : 'project';
  return ['servicenow:', `  Scope: ${scope}`, `  Status: ${statusLine}`, '  Type: stdio',
    '  Command: node', '', `To remove this server, run: claude mcp remove servicenow -s ${word}`]
    .join('\n');
}

/** A fake `claude` on PATH: the POSIX script and its `.cmd` twin, as a Windows install would have. */
function fakeClaude(t, statusLine, { scope = 'Project config (shared via .mcp.json)' } = {}) {
  const dir = tempDir('snowarch-bin-', t);
  // The trailer's `-s <scope>` agrees with the `Scope:` line, because the real output does and
  // because `parseGet` prefers the trailer — a fixture whose two halves disagreed would be
  // testing the parser's tie-break rather than this check.
  const word = /^local/i.test(scope) ? 'local' : 'project';
  const body = ['servicenow:', `  Scope: ${scope}`, `  Status: ${statusLine}`, '  Type: stdio',
    '  Command: node', '', `To remove this server, run: claude mcp remove servicenow -s ${word}`];
  const script = `#!/bin/sh\ncat <<'OUT'\n${body.join('\n')}\nOUT\n`;
  writeFileSync(join(dir, 'claude'), script);
  chmodSync(join(dir, 'claude'), 0o755);
  writeFileSync(join(dir, 'claude.cmd'), `@echo off\r\n${body.map((l) => `echo ${l}`).join('\r\n')}\r\n`);
  return dir;
}

/**
 * The context for one E-27 case: the recorded mode, and the transcript the CLI would print.
 *
 * The transcript is returned through the `exec` seam rather than by executing a script, on EVERY
 * platform. What this story owns is the RULE — which mode, against which status, produces which
 * verdict — and driving it through a shell makes that rule's coverage depend on cmd.exe's echo
 * semantics and its code page. The execution path itself belongs to `registration-claude.mjs`,
 * which has its own tests, and one POSIX case below still runs the real script end to end.
 */
function withClaude(t, { statusLine, mode = 'design', scope } = {}) {
  const root = greenTree(t, { mode });
  const out = transcript(statusLine, scope);
  return { root, over: { env: {}, claudePath: '/fixture/claude',
    exec: () => ({ status: 0, stdout: out, stderr: '' }) } };
}

test('the fake is what a PATH lookup would find on either platform', (t) => {
  const dir = fakeClaude(t, REJECTED);
  // `PATHEXT` is given rather than defaulted: the default list is upper-case, and a case-sensitive
  // filesystem — every Linux cell — has no `claude.CMD`. What is being proved is that a Windows
  // lookup finds the twin, not that a Linux disk is case-insensitive.
  assert.equal(which('claude', { env: { PATH: dir, PATHEXT: '.cmd' }, platform: 'win32' }),
    join(dir, 'claude.cmd'));
  if (process.platform !== 'win32') {
    assert.equal(which('claude', { env: { PATH: dir }, platform: process.platform }),
      join(dir, 'claude'));
  }
});

test('E-27 reads a real `claude` process end to end (POSIX)',
  { skip: process.platform === 'win32' && 'the .cmd twin is covered by the PATH lookup above' },
  async (t) => {
    const root = greenTree(t, { mode: 'design' });
    const dir = fakeClaude(t, REJECTED);
    // PREPENDED, not replaced: the fake shells out to `cat`, and a PATH holding only the fixture
    // has no `cat` — the script would then fail with 127 and the test would prove the error path.
    const PATH = `${dir}${delimiter}${process.env.PATH ?? ''}`;
    const r = await run('E-27', root, { env: { ...process.env, PATH } });
    assert.equal(r.status, 'ok');
    assert.match(r.data.statusLine, /Rejected/);
    assert.equal(r.data.approved, false);
  });

// E-25 reads ONE thing — the path — so its cases are paths. A checkout is not built for them: a
// directory that does not exist is exactly what a user's synced folder looks like to this check.
const atPath = (root) => runById(checks, 'E-25',
  { root, platform: process.platform, env: {}, config: {}, home: '' });

// AC 5.
test('E-25 names the provider, and is quiet outside a synced tree', async (t) => {
  const plain = greenTree(t);
  assert.equal((await run('E-25', plain)).status, 'ok');

  const parent = tempDir('snowarch-OneDrive-', t);
  const synced = join(parent, 'OneDrive', 'repo');
  const r = await atPath(synced);
  assert.equal(r.status, 'warn');
  assert.match(r.detail, /OneDrive/);
  assert.equal(r.data.provider, 'OneDrive');
});

test('E-25 answers to the same provider list as the server and the bootstrap', async (t) => {
  const parent = tempDir('snowarch-cloud-', t);
  for (const [segment, provider] of [['Dropbox', 'Dropbox'], ['Google Drive', 'Google Drive'],
    ['Mobile Documents', 'iCloud Drive']]) {
    const r = await atPath(join(parent, segment, 'repo'));
    assert.equal(r.data.provider, provider, `${segment} read as ${r.data.provider}`);
  }
});

// AC 6.
test('E-26 masks the proxy credential and warns about a CA file that is not one', async (t) => {
  const root = greenTree(t);
  // Assembled: a test file that spells a credential becomes a hit in the credential sweep that
  // reads this very file.
  const user = 'someone';
  const secret = ['hunter', '2', 'hunter', '2'].join('');
  const env = {
    HTTPS_PROXY: `http://${user}:${secret}@proxy.corp.example:8080`,
    NODE_EXTRA_CA_CERTS: join(root, 'nonexistent.pem'),
  };
  const r = await run('E-26', root, { env });
  assert.equal(r.status, 'warn');
  const text = `${r.detail}\n${r.remedy}\n${JSON.stringify(r.data)}`;
  assert.equal(text.includes(secret), false, 'the proxy password reached the output');
  assert.equal(text.includes(`${user}:`), false, 'the proxy username reached the output');
  assert.match(r.data.vars.HTTPS_PROXY, /http:\/\/\*\*\*@proxy\.corp\.example:8080/);
  assert.match(r.detail, /NODE_EXTRA_CA_CERTS points at a file where the file does not exist/);
  assert.match(r.detail, /as seen by this shell/);
});

test('E-26 warns about a variable set to an empty string', async (t) => {
  const root = greenTree(t);
  const r = await run('E-26', root, { env: { HTTPS_PROXY: '' } });
  assert.equal(r.status, 'warn');
  assert.match(r.detail, /HTTPS_PROXY is set to an empty string — treated as unset/);
});

test('E-26 accepts a real PEM and reads the lowercase spelling too', async (t) => {
  const root = greenTree(t);
  const pem = join(root, 'corp.pem');
  writeFileSync(pem, `${PEM_HEADER}\nMIIB\n-----END CERTIFICATE-----\n`);
  const r = await run('E-26', root, { env: { https_proxy: 'http://proxy.corp.example:8080',
    NODE_EXTRA_CA_CERTS: pem } });
  assert.equal(r.status, 'ok');
  assert.match(r.detail, /https_proxy=http:\/\/proxy\.corp\.example:8080/);
  assert.equal(inspectCa(pem).ok, true);
  assert.deepEqual(readVar({ https_proxy: 'x' }, 'HTTPS_PROXY'), { key: 'https_proxy', value: 'x' });
});

test('E-26 is ok and says so when nothing is set', async (t) => {
  const root = greenTree(t);
  const r = await run('E-26', root, { env: {} });
  assert.equal(r.status, 'ok');
  assert.equal(r.detail, 'no proxy configured');
});

test('E-26 echoes a live probe\'s code with the contract\'s own remedy', async (t) => {
  const root = greenTree(t);
  const contract = { errorCodes: [{ code: 'PROXY_UNREACHABLE', remedy: 'fix the proxy address' }] };
  const r = await run('E-26', root, { env: {}, contract, networkCode: 'PROXY_UNREACHABLE' });
  assert.equal(r.status, 'warn');
  assert.match(r.detail, /the live probe reported PROXY_UNREACHABLE — fix the proxy address/);
});

// AC 8.
test('E-27 is ok when a design-only install is rejected, which is what disabled looks like', async (t) => {
  const { root, over } = withClaude(t, { statusLine: REJECTED, mode: 'design' });
  const r = await run('E-27', root, over);
  assert.equal(r.status, 'ok');
  assert.equal(r.data.approved, false);
  assert.match(r.data.statusLine, /Rejected/);
});

test('E-27 warns when the recorded mode is live but Claude Code has rejected the server', async (t) => {
  const { root, over } = withClaude(t, { statusLine: REJECTED, mode: 'live' });
  const r = await run('E-27', root, over);
  assert.equal(r.status, 'warn');
  assert.match(r.detail, /rejected in Claude Code although the recorded mode is live/);
  assert.equal(r.command, './snowarch mode live');
});

test('E-27 warns when the recorded mode is design-only but the server is not disabled', async (t) => {
  const { root, over } = withClaude(t, { statusLine: CONNECTED, mode: 'design' });
  const r = await run('E-27', root, over);
  assert.equal(r.status, 'warn');
  assert.match(r.detail, /not disabled in Claude Code although the recorded mode is design-only/);
  assert.equal(r.command, './snowarch mode design');
  assert.equal(r.data.approved, true);
});

test('E-27 treats pending approval in design-only as the toggle not being in force', async (t) => {
  const { root, over } = withClaude(t, { statusLine: PENDING, mode: 'design' });
  const r = await run('E-27', root, over);
  assert.equal(r.status, 'warn');
  assert.equal(r.data.approved, false);
});

test('E-27 reports a wording nobody has seen as "could not read", never as a failure', async (t) => {
  const { root, over } = withClaude(t, { statusLine: '☂ Something new in a later release',
    mode: 'design' });
  const r = await run('E-27', root, over);
  assert.equal(r.status, 'warn');
  assert.match(r.detail, /could not read registration status/);
  assert.equal(r.data.approved, null);
  assert.equal(checks.find((c) => c.id === 'E-27').severity, 'warn', 'E-27 can fail a run');
});

test('E-27 skips when claude is not on PATH, and points at the check that owns that', async (t) => {
  const root = greenTree(t);
  const r = await run('E-27', root, { claudePath: null });
  assert.equal(r.status, 'skip');
  assert.equal(r.detail, 'claude CLI not found (see E-00)');
});

test('E-27 records a local-scope registration beside what the state says', async (t) => {
  const { root, over } = withClaude(t, { statusLine: REJECTED, mode: 'design',
    scope: 'Local config' });
  bootstrap(root, { mode: 'design', state: { registration: 'local (S-03 fallback)' } });
  const r = await run('E-27', root, over);
  assert.equal(r.status, 'ok');
  assert.equal(r.data.scope, 'local');
  assert.match(r.detail, /scope local \(local \(S-03 fallback\)\)/);
});

test('E-27 declares its spawn, so --quick never runs it', () => {
  const e27 = checks.find((c) => c.id === 'E-27');
  assert.equal(e27.spawns, true);
  assert.equal(e27.fixable, false);
});

test('the status table is the S-01 record\'s, and an empty status is not an approval', () => {
  assert.deepEqual(classifyStatus(REJECTED), { kind: 'rejected', approved: false });
  assert.deepEqual(classifyStatus(PENDING), { kind: 'pending', approved: false });
  assert.deepEqual(classifyStatus(CONNECTED), { kind: 'approved', approved: true });
  assert.deepEqual(classifyStatus(''), { kind: 'unknown', approved: null });
  assert.deepEqual(classifyStatus(null), { kind: 'unknown', approved: null });
});
