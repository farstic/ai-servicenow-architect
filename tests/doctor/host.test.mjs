// ARC-08-S03 — E-25, E-26, E-27. Every input is injected: no test here reads this machine.
//
// E-27 is the one that could not be tested without a fixture at all — it runs `claude`, and the
// answer it parses is Claude Code's. So the fixture is a fake `claude` on PATH (a POSIX script and
// a `.cmd` twin, because `which` resolves by extension on Windows) printing the exact status lines
// the S-01 spike recorded on two Claude Code versions. What is proved is the RULE, not the
// wording: a wording nobody has seen degrades to a WARN that says so.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { which } from '../../tools/snowarch/lib/which.mjs';

import { classifyStatus, hostChecks, inspectCa, PEM_HEADER,
  readVar } from '../../tools/snowarch/lib/doctor/checks/host.mjs';
import { tempDir } from '../../tools/snowarch/tests/helpers/temp.mjs';
import { bootstrap, contextFor, greenTree, runById } from './helpers/tree.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

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
  // ARC-07-S07 AC 3, acceptance item B07-02. This case used to carry THREE hand-written segments
  // while claiming to answer to the shared list — the claim was true of those three and unchecked
  // for the rest. The fixture is the list: the server's `detectCloudSync()`, the bootstrap's
  // `cloudSyncProvider()` and this check all answer to it, and three tables that merely look alike
  // would drift exactly when it mattered.
  const fixture = JSON.parse(readFileSync(
    join(repoRoot, 'packages/snowarch/tests/fixtures/cloud-sync-paths.json'), 'utf8'));
  assert.ok(fixture.synced.length > 5, 'the fixture is not empty — every loop below depends on it');
  assert.ok(fixture.quiet.length > 3, 'the fixture has no quiet rows — half the table is missing');

  for (const { path, provider, why } of fixture.synced) {
    const r = await atPath(path);
    assert.equal(r.status, 'warn', `${path} — ${why}`);
    // WHETHER is the shared answer and is asserted exactly. WHICH is asserted except where the
    // fixture itself says the provider is unknown — the engine names the mount where the server
    // names the vendor, and the warning reads correctly either way.
    if (provider !== 'CloudStorage (unknown provider)') {
      assert.equal(r.data.provider, provider, `${path} — ${why}`);
    } else {
      assert.ok(r.data.provider, `${path}: detected but with no provider — ${why}`);
    }
  }

  for (const { path, why } of fixture.quiet) {
    const r = await atPath(path);
    assert.equal(r.status, 'ok', `${path} — ${why}`);
    assert.equal(r.data.provider, null, `${path} — ${why}`);
  }
});

test('E-25 reads the Windows environment roots — the only detector Known Folder Move has', async () => {
  // ARC-08-C2, and this case is the one the recorded gap was written to become. It stood here as
  // `E-25 does NOT read the Windows environment roots — a recorded gap, not a passing case`,
  // asserting the miss with the message "make this a passing case", and it failed the moment the
  // detector learned `env` — which is what a pinned gap is for. It is the passing case now.
  //
  // `env[]` is enterprise Known Folder Move: the policy redirects Documents into OneDrive, the word
  // OneDrive appears nowhere in the path, and `%OneDrive%` is — in the fixture's own words — "the
  // only detector there is". The server's `detectCloudSync(path, { env })` has always read it; the
  // bootstrap's `cloudSyncProvider` did not, so E-25 could not.
  const fixture = JSON.parse(readFileSync(
    join(repoRoot, 'packages/snowarch/tests/fixtures/cloud-sync-paths.json'), 'utf8'));
  assert.ok(fixture.env.length > 2, 'the fixture lost its environment rows');

  // THE SECTION CARRIES ITS OWN NEGATIVE, and reading it rather than assuming is the point: row 3
  // is `C:\Users\me\work\x` with `%OneDrive%` set to a DIFFERENT folder — "a set variable is not
  // a blanket yes". A loop that expected three warns would have demanded exactly the bug where a
  // set variable syncs the whole disk. So each row is asserted against ITS OWN expected provider.
  const positive = fixture.env.filter((r) => r.provider !== null);
  assert.ok(positive.length >= 2, 'the fixture lost its positive environment rows');
  assert.ok(fixture.env.some((r) => r.provider === null), 'the fixture lost its negative row');

  for (const { path, set, provider, why } of fixture.env) {
    const r = await runById(checks, 'E-25',
      { root: path, platform: 'win32', env: set, config: {}, home: '' });
    if (provider === null) {
      assert.equal(r.status, 'ok', `${path} — ${why}`);
      assert.equal(r.data.provider, null, `${path} — ${why}`);
    } else {
      assert.equal(r.status, 'warn', `${path} — ${why}`);
      assert.equal(r.data.provider, provider, `${path} — ${why}`);
      assert.match(r.detail, /cloud-sync folder/);
    }
  }

  // BOTH DIRECTIONS on the positives: the SAME paths with the variable UNSET are not synced.
  // Without this, a detector that warned about every Windows path would pass the loop above.
  for (const { path, why } of positive) {
    const r = await runById(checks, 'E-25',
      { root: path, platform: 'win32', env: {}, config: {}, home: '' });
    assert.equal(r.status, 'ok', `${path} warns with no %OneDrive% set — ${why}`);
    assert.equal(r.data.provider, null);
  }
});

test('ARC-08-C2 — the bootstrap\'s two halves agree about a redirected folder', async () => {
  // The disagreement this closes, and the reason it went unnoticed. `lib/cloud-sync.mjs` imports
  // the server's `isUnderCloudSyncFolder` precisely so the two "cannot disagree about a path
  // exactly when it mattered" — its own words. But that function delegates to `detectCloudSync`
  // with DEFAULT options, so it read the ambient environment and answered TRUE, while
  // `cloudSyncProvider` had no env at all and answered null. Measured before the fix:
  //
  //   isUnderCloudSyncFolder("C:/Users/me/Documents/work/x")  → true
  //   cloudSyncProvider(same)                                 → null
  //   cloudSyncWarning(same)                                  → null   ← the bootstrap said nothing
  //
  // The fixture's `env[]` rows were read by nobody, which is why nothing caught it.
  const { cloudSyncProvider, cloudSyncWarning } = await import('../../tools/snowarch/lib/cloud-sync.mjs');
  const { detectCloudSync } = await import('../../packages/snowarch/dist/store/paths.js');
  const fixture = JSON.parse(readFileSync(
    join(repoRoot, 'packages/snowarch/tests/fixtures/cloud-sync-paths.json'), 'utf8'));

  for (const { path, set, provider, why } of fixture.env) {
    assert.equal(cloudSyncProvider(path, { env: set }), provider, `${path} — ${why}`);
    // The warning follows the provider, in both directions — including the row where the variable
    // is set and the path is not under it, which must stay silent.
    assert.equal(Boolean(cloudSyncWarning(path, { env: set })), provider !== null,
      `${path}: the warning disagrees with the provider — ${why}`);
    // ...and both agree with the server, which is the invariant the module exists to hold.
    assert.equal(detectCloudSync(path, { env: set, realpath: (x) => x })?.provider ?? null, provider,
      `${path}: the two detectors disagree`);
  }

  // The env is a PARAMETER, defaulting to the ambient one — so every existing caller gains the
  // case without being changed, and a test can still say what it means without touching
  // `process.env`. Asserted rather than assumed: an injected empty env overrides the ambient one.
  const row = fixture.env.find((r) => r.provider !== null);
  assert.equal(cloudSyncProvider(row.path, { env: {} }), null);
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
