// ARC-08-S02 — E-05…E-11 against trees built from this checkout's own committed wiring.
//
// Every negative is a MUTATION of the green tree, applied to a copy, so each case says exactly one
// thing: this file, changed this way, produces this finding. The green tree itself is the control —
// if it ever stops passing, the wiring changed and these checks are the first to know.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { engineRepoChecks, configProblems, placeholdersWithoutDefault, sessionStartProblems,
  toggleProblems } from '../../tools/snowarch/lib/doctor/checks/engine-repo.mjs';
import { computeSettings, projectEntryEnabled } from '../../tools/snowarch/lib/settings-local.mjs';
import { bootstrap, contextFor, copyTree, greenTree, readJson, runById,
  writeJson } from './helpers/tree.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * `git add` inside a fixture tree (ARC-09-C10). E-09 scans TRACKED files, so a fixture that only
 * writes the file proves nothing — `git ls-files` would not name it and the check would pass for
 * the wrong reason. The identity is per-command so no global git config has to exist (ARC-08-S05).
 */
const trackInFixture = (root, rel) => execFileSync('git',
  ['-c', 'user.email=f@example.invalid', '-c', 'user.name=Fixture', 'add', '--', rel],
  { cwd: root, encoding: 'utf8' });

const checks = engineRepoChecks();
const run = (id, root, over = {}) => runById(checks, id, contextFor(root, over));

test('the green tree passes every repo check', async (t) => {
  const root = greenTree(t);
  for (const id of ['E-05', 'E-06', 'E-07', 'E-08', 'E-09', 'E-10', 'E-11']) {
    const r = await run(id, root);
    assert.equal(r.status, 'ok', `${id}: ${r.detail}`);
    assert.ok(r.data, `${id} carries no data — S09 renders it without re-deriving anything`);
  }
});

test('E-05 fails when a root marker is missing, and names it', async (t) => {
  const root = copyTree(t, greenTree(t));
  rmSync(join(root, 'CLAUDE.md'));
  const r = await run('E-05', root);
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /CLAUDE\.md/);
});

test('E-06 names every structural problem in engine.config.json', async (t) => {
  const root = copyTree(t, greenTree(t));
  const config = readJson(root, 'engine.config.json');
  config.mcp.serverKey = 'service now';
  config.docs.pin = 'ba513f2';
  delete config.floors.git;
  writeJson(root, 'engine.config.json', config);
  const r = await run('E-06', root, { config });
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /serverKey contains whitespace/);
  assert.match(r.detail, /docs\.pin is not a 40-character sha/);
  assert.match(r.detail, /floors\.git is missing/);
  assert.equal(r.command, 'git checkout -- engine.config.json');
});

test('E-06 catches a package name that no longer matches the package it points at', async (t) => {
  const root = copyTree(t, greenTree(t));
  const config = readJson(root, 'engine.config.json');
  config.mcp.package = '@someone/other';
  assert.match(configProblems(config, root).join(' '), /≠ packages\/snowarch\/package\.json name/);
});

// AC 3.
test('E-07 fails on a changed server key, and E-20 will name the file too', async (t) => {
  const root = copyTree(t, greenTree(t));
  const mcp = readJson(root, '.mcp.json');
  const [key] = Object.keys(mcp.mcpServers);
  mcp.mcpServers = { 'servicenow-mcp': mcp.mcpServers[key] };
  writeJson(root, '.mcp.json', mcp);
  const r = await run('E-07', root);
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /mcpServers key "servicenow-mcp"/);
  assert.match(r.detail, /differs from HEAD/);
  assert.equal(r.command, 'git checkout -- .mcp.json');
});

// AC 3, second half.
test('E-07 fails on a placeholder that lost its ":-" default, and names the placeholder', () => {
  const bare = placeholdersWithoutDefault({ env: { SNOW_STORE: '${SNOW_STORE}' } });
  assert.deepEqual(bare, ['${SNOW_STORE}']);
  assert.deepEqual(placeholdersWithoutDefault({ env: { SNOW_STORE: '${SNOW_STORE:-}' } }), []);
});

test('E-07 is never fixable — the command is printed for a human to run', () => {
  assert.equal(checks.find((c) => c.id === 'E-07').fixable, false);
  assert.equal(checks.find((c) => c.id === 'E-08').fixable, false);
});

test('E-08 wants MCP_TIMEOUT and reads the hook from settings.local.json', async (t) => {
  const root = copyTree(t, greenTree(t));
  const settings = readJson(root, '.claude/settings.json');
  delete settings.env.MCP_TIMEOUT;
  writeJson(root, '.claude/settings.json', settings);
  const r = await run('E-08', root);
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /MCP_TIMEOUT is absent/);
  assert.match(r.detail, /differs from HEAD/);
});

test('E-08 fails a SessionStart hook whose timeout is over the 10 s the settings file allows', () => {
  const local = { hooks: { SessionStart: [{ hooks: [{ type: 'command',
    command: 'node ${CLAUDE_PROJECT_DIR}/tools/snowarch/hooks/session-start.mjs', timeout: 30 }] }] } };
  const { problems, present } = sessionStartProblems(local, process.cwd());
  assert.equal(present, true);
  assert.match(problems.join(' '), /timeout is 30/);
});

test('E-09 finds a credential-shaped KEY at any depth, and never prints the value', async (t) => {
  const root = copyTree(t, greenTree(t));
  const local = readJson(root, '.claude/settings.local.json');
  // Assembled, never spelled: a fixture that writes the word out becomes a hit in the sweep that
  // reads this very file.
  const key = ['SNOW_BASIC_', 'PASS', 'WORD'].join('');
  local.env = { [key]: 'hunter2hunter2' };
  writeJson(root, '.claude/settings.local.json', local);
  const r = await run('E-09', root);
  assert.equal(r.status, 'fail');
  assert.match(r.detail, new RegExp(`env\\.${key}`));
  assert.equal(r.detail.includes('hunter2hunter2'), false, 'the value reached the report');
});

// ARC-09-C10 — the `.env` family is scanned, and these two cases are the pair that proves it.
//
// `ENVISH` has always existed to match `SERVICENOW_BASIC_PASSWORD=…`, and until C10 the only files
// it could ever see were `.sh` scripts: `CREDENTIAL_EXT` listed nine extensions and none of them
// was the one named after the thing being hunted. A committed `.env` with a real value is THE
// classic credential leak. Found by asking whether `packages/snowarch/.env.example`, which ships
// in the npm tarball, was covered. It was not.
test('E-09 fails a TRACKED .env file carrying a real-looking value (ARC-09-C10)', async (t) => {
  const root = copyTree(t, greenTree(t));
  // Assembled, never spelled — the same rule as the case above: a fixture that writes a
  // credential-shaped literal out becomes a hit in the sweep that reads this very file. And it
  // must not look like documentation either, or `isPlaceholder` clears it and the test passes for
  // the wrong reason: mixed case, digits and punctuation, no placeholder prefix.
  const key = ['SERVICENOW_BASIC_', 'PASS', 'WORD'].join('');
  const value = ['Sn0w', 'Q4t', '!x', 'Zr7'].join('');
  writeFileSync(join(root, '.env.example'), `${key}=${value}\n`);
  trackInFixture(root, '.env.example');

  const r = await run('E-09', root);
  assert.equal(r.status, 'fail', `E-09 did not see the tracked .env.example: ${r.detail}`);
  assert.match(r.detail, /\.env\.example:1/);
  assert.equal(r.detail.includes(value), false, 'the value reached the report');
});

test('E-09 passes the .env.example this repository actually ships (ARC-09-C10)', async (t) => {
  // The positive control, and the reason the widened filter is safe to ship: the real file's
  // credential variables are all EMPTY, so scanning it changes nothing for this repository. A
  // widening that turned the product red on its own tree would be a different conversation.
  const root = copyTree(t, greenTree(t));
  const real = readFileSync(join(repoRoot, 'packages/snowarch/.env.example'), 'utf8');
  writeFileSync(join(root, '.env.example'), real);
  trackInFixture(root, '.env.example');
  const r = await run('E-09', root);
  assert.equal(r.status, 'ok', `the shipped .env.example would now fail E-09: ${r.detail}`);
});

// AC 4.
test('E-10 fails when the server is in BOTH lists, and reports fixable', async (t) => {
  const root = copyTree(t, greenTree(t));
  const key = readJson(root, 'engine.config.json').mcp.serverKey;
  writeJson(root, '.claude/settings.local.json',
    { enabledMcpjsonServers: [key], disabledMcpjsonServers: [key] });
  const r = await run('E-10', root);
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /BOTH/);
  assert.equal(checks.find((c) => c.id === 'E-10').fixable, true);
  assert.equal(r.data.fix.kind, 'toggles-mismatch');
});

test('E-10 fails when the server is in NEITHER list', () => {
  const { problems } = toggleProblems({ mode: 'design', settings: {}, serverKey: 'servicenow' });
  assert.match(problems.join(' '), /NEITHER/);
});

test('E-10 fails when live mode has the server disabled', () => {
  const { problems } = toggleProblems({ mode: 'live',
    settings: { disabledMcpjsonServers: ['servicenow'] }, serverKey: 'servicenow' });
  assert.match(problems.join(' '), /mode is live but servicenow is disabled/);
});

test('E-10 warns about the bootstrap\'s own disableAllHooks, and leaves the user\'s alone', async (t) => {
  const byBootstrap = copyTree(t, greenTree(t));
  const local = readJson(byBootstrap, '.claude/settings.local.json');
  writeJson(byBootstrap, '.claude/settings.local.json', { ...local, disableAllHooks: true });
  const state = readJson(byBootstrap, '.local/bootstrap-state.json');
  writeJson(byBootstrap, '.local/bootstrap-state.json', { ...state, hooksDisabledByBootstrap: true });
  const warned = await run('E-10', byBootstrap);
  assert.equal(warned.status, 'warn');
  assert.match(warned.detail, /Node is present now/);

  // The same key, set by the user: their choice, reported as an ordinary pass.
  const byUser = copyTree(t, greenTree(t));
  const l2 = readJson(byUser, '.claude/settings.local.json');
  writeJson(byUser, '.claude/settings.local.json', { ...l2, disableAllHooks: true });
  const okResult = await run('E-10', byUser);
  assert.equal(okResult.status, 'ok');
  assert.match(okResult.detail, /by choice/);
});

test('E-11 fails an unbootstrapped tree with "not bootstrapped", not with a mode complaint', async (t) => {
  const root = copyTree(t, greenTree(t));
  rmSync(join(root, '.local'), { recursive: true, force: true });
  const r = await run('E-11', root);
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /not bootstrapped/);
});

// AC 9 — asserted from a POSIX machine by naming the platform, never by running on Windows.
test('E-11 on Windows reports ACL-inherited modes and never runs chmod', async (t) => {
  const root = greenTree(t);
  const r = await run('E-11', root, { platform: 'win32' });
  assert.equal(r.status, 'ok');
  assert.match(r.detail, /file modes: ACL-inherited/);
  assert.equal(r.data.mode, 'acl-inherited');
});

test('E-11 fails a world-readable .local/ on POSIX, and offers the chmod as the fix', async (t) => {
  if (process.platform === 'win32') return;
  const root = copyTree(t, greenTree(t));
  chmodSync(join(root, '.local'), 0o755);
  const r = await run('E-11', root);
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /mode 755, not 700/);
  assert.deepEqual(r.data.fix, { kind: 'store-mode', path: '.local', to: '700' });
});

test('E-11 turns an unparsable state file into one sentence, not a crash', async (t) => {
  const root = copyTree(t, greenTree(t));
  writeFileSync(join(root, '.local', 'bootstrap-state.json'), '{ not json');
  const r = await run('E-11', root);
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /not valid JSON/);
});

test('a bootstrapped live tree passes E-10 with the enabled toggle', async (t) => {
  const root = greenTree(t, { mode: 'live' });
  const r = await run('E-10', root);
  assert.equal(r.status, 'ok');
  assert.match(r.detail, /live · enabled/);
});

test('the fixture is built from the committed files, not from a copy in the test', async (t) => {
  const root = greenTree(t);
  for (const rel of ['.mcp.json', '.claude/settings.json']) {
    assert.equal(readFileSync(join(root, rel), 'utf8'),
      readFileSync(join(process.cwd(), rel), 'utf8'), `${rel} drifted from the real file`);
  }

  // `engine.config.json` is the real file with ONE field overridden (ARC-09-C2): the docs upstream,
  // so a fixer that decided to repair a corpus cannot clone 305 MB from github.com inside a unit
  // test. Asserted field by field rather than as bytes, so the override stays the only difference —
  // a second one would be a fixture drifting from the product again, which is what this test is for.
  const real = JSON.parse(readFileSync(join(process.cwd(), 'engine.config.json'), 'utf8'));
  const fixture = JSON.parse(readFileSync(join(root, 'engine.config.json'), 'utf8'));
  assert.deepEqual(Object.keys(fixture).sort(), Object.keys(real).sort());
  for (const key of Object.keys(real)) {
    if (key !== 'docs') assert.deepEqual(fixture[key], real[key], `${key} drifted from the real file`);
  }
  const { upstream: fixtureUpstream, ...fixtureDocs } = fixture.docs;
  const { upstream: realUpstream, ...realDocs } = real.docs;
  assert.deepEqual(fixtureDocs, realDocs, 'docs drifted beyond the upstream override');
  assert.notEqual(fixtureUpstream, realUpstream);
  assert.equal(/^https?:|github\.com/.test(fixtureUpstream), false,
    `a fixture may not carry a network upstream: ${fixtureUpstream}`);
  assert.ok(bootstrap);
});

/**
 * ARC-08-C15 — E-10 judged the toggles without the registration, and failed a correct state.
 *
 * The owner's Sitting C, rc.5, after `./snowarch mode live --register local`:
 *
 *   DOCTOR: 12 ok, 1 warn, 1 fail, 25 skipped (1 fixable — run ./snowarch doctor --fix)
 *   E-10 FAIL settings.local toggles match the recorded mode: mode is live but servicenow is
 *        disabled — ./snowarch mode live
 *
 * The state was right. `mode.mjs` settles a local registration before the steps *because* an
 * enabled project entry plus a local entry would load the server twice, so on that path the
 * project toggle stays DISABLED however live the checkout is — and the writer knows it:
 * `computeSettings` gates on `mode === 'live' && registration === 'project'`. The check gated on
 * `mode === 'live'` alone. Two statements of one rule, and they disagreed.
 *
 * The C4 shape, in full: the FAIL's remedy is `./snowarch mode live` — the command just run — and
 * B09 advertises `--fix`; both write through the registration-aware writer, both reproduce the
 * state already on disk, and the FAIL returns. A user is handed a failure, a remedy that no-ops,
 * and a fix that reports success while nothing changes.
 */
const TOGGLED = { disabledMcpjsonServers: ['servicenow'] };
const ENABLED = { enabledMcpjsonServers: ['servicenow'] };

test('ARC-08-C15 — a live checkout registered `local` is not a failure', () => {
  const r = toggleProblems({ mode: 'live', settings: TOGGLED, serverKey: 'servicenow',
    registration: 'local' });
  assert.deepEqual(r.problems, [],
    'the owner\'s state is reported as broken — this is the C15 defect');
  assert.equal(r.wantEnabled, false);
});

test('ARC-08-C15 — the project path keeps the message it had', () => {
  // Both directions: the fix must not buy the local path by going quiet on the real mismatch.
  const r = toggleProblems({ mode: 'live', settings: TOGGLED, serverKey: 'servicenow',
    registration: 'project' });
  assert.deepEqual(r.problems, ['mode is live but servicenow is disabled']);

  // ...and the design-side message is untouched.
  assert.deepEqual(
    toggleProblems({ mode: 'design-only', settings: ENABLED, serverKey: 'servicenow' }).problems,
    ['mode is design-only but servicenow is enabled']);

});

test('ARC-08-C15 — live + local + an ENABLED project entry is the double load, and is named', () => {
  // Kept apart from the test above on purpose. That one asserts the paths this change must NOT
  // move, so it stays green when the fix is reverted; this one asserts the case the fix adds, so
  // it goes red. Bundled together they would fail as one and say nothing about which half moved.
  const both = toggleProblems({ mode: 'live', settings: ENABLED, serverKey: 'servicenow',
    registration: 'local' });
  assert.equal(both.problems.length, 1);
  assert.match(both.problems[0], /both load/);
});

test('ARC-08-C15 — the check and the writer agree on every (mode, registration) pair', () => {
  // THE PROPERTY THAT WAS MISSING. Two copies of one rule cannot be kept in step by review; this
  // asserts they are the same rule by running both over the whole space. It fails the moment
  // somebody re-states either side.
  const settingsFor = (enabled) => (enabled ? { ...ENABLED } : { ...TOGGLED });
  for (const mode of ['live', 'design-only', 'design']) {
    for (const registration of ['project', 'local', 'user']) {
      const want = projectEntryEnabled({ mode, registration });
      // the writer, on a tree in the OPPOSITE state, must move it to `want`
      const written = computeSettings(settingsFor(!want),
        { mode, nodePresent: true, registration, serverKey: 'servicenow' });
      const writerEnabled = (written.enabledMcpjsonServers ?? []).includes('servicenow');
      assert.equal(writerEnabled, want,
        `writer disagrees at mode=${mode} registration=${registration}`);

      // the check, on a tree already in `want`, must find nothing to complain about
      const { problems, wantEnabled } = toggleProblems({
        mode, settings: settingsFor(want), serverKey: 'servicenow', registration });
      assert.equal(wantEnabled, want, `check disagrees at mode=${mode} registration=${registration}`);
      assert.deepEqual(problems, [],
        `check faults the writer's own output at mode=${mode} registration=${registration}`);
    }
  }
});
