// ARC-08-S02 — E-05…E-11 against trees built from this checkout's own committed wiring.
//
// Every negative is a MUTATION of the green tree, applied to a copy, so each case says exactly one
// thing: this file, changed this way, produces this finding. The green tree itself is the control —
// if it ever stops passing, the wiring changed and these checks are the first to know.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { engineRepoChecks, configProblems, placeholdersWithoutDefault, sessionStartProblems,
  toggleProblems } from '../../tools/snowarch/lib/doctor/checks/engine-repo.mjs';
import { bootstrap, contextFor, copyTree, greenTree, readJson, runById,
  writeJson } from './helpers/tree.mjs';

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
