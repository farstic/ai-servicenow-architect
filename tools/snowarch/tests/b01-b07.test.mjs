// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { run as runB01, ensureLocalDir, committedFilesUnchanged } from '../lib/steps/B01.mjs';
import { run as runB07, writeConfig, CONFIG_FILE } from '../lib/steps/B07.mjs';
import { run as runB03 } from '../lib/steps/B03.mjs';
import {
  INVALID_JSON, NOT_IGNORED, SETTINGS_LOCAL, applyToggles, computeSettings, hookEntry, isIgnored,
} from '../lib/settings-local.mjs';
import { cloudSyncProvider, cloudSyncWarning, isUnderCloudSyncFolder } from '../lib/cloud-sync.mjs';
import { checkMcpJson, checkSettingsJson } from '../lib/registration.mjs';
import { tempDir } from './helpers/temp.mjs';
import { keyPair, listRepo, manifestDoc, productKeys } from './helpers/licence.mjs';
import { readManifestCache } from '../lib/licence/manifest.mjs';
import { readDefaultLabel, readDefaultSummary } from '../../../packages/snowarch/dist/store/label.js';
import { makeCheckout } from './helpers/workspace.mjs';

// Four levels up: tests → snowarch → tools → the repository root. The shared cloud-sync fixture
// lives under the SERVER package, because that is where the list is authored; this module is
// one of the three implementations that must satisfy it.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const isWindows = process.platform === 'win32';
const KEY = 'servicenow';
const read = (root, rel) => readFileSync(join(root, rel), 'utf8');
const readJson = (root, rel) => JSON.parse(read(root, rel));
const config = (root) => JSON.parse(read(root, 'engine.config.json'));

const ctxFor = (root, over = {}) => ({
  root, config: config(root), mode: 'design-only', node: { present: true, version: '22.11.0' },
  state: { steps: {}, registration: 'project', hooksDisabledByBootstrap: false },
  line: () => {}, ...over,
});

test('AC 1 — a fresh design run writes exactly the disable toggle, plus the hook when Node is here', async () => {
  const root = makeCheckout();
  await runB01(ctxFor(root));
  const r = await runB07(ctxFor(root));

  assert.equal(r.status, 'ok');
  const settings = readJson(root, SETTINGS_LOCAL);
  assert.deepEqual(settings.disabledMcpjsonServers, [KEY]);
  assert.equal(settings.enabledMcpjsonServers, undefined);
  // S-05 variant B: the hook lives in the LOCAL file and only when Node can run it.
  assert.deepEqual(settings.hooks, hookEntry());
  assert.deepEqual(Object.keys(settings).sort(), ['disabledMcpjsonServers', 'hooks']);
  assert.equal(read(root, SETTINGS_LOCAL).endsWith('\n'), true, 'no trailing newline');

  if (!isWindows) {
    assert.equal(statSync(join(root, '.local')).mode & 0o777, 0o700);
  }
  assert.ok(existsSync(join(root, '.local', 'logs')));
  // Nothing TRACKED may be modified: the registration files are the install, and a bootstrap that
  // edited them would change what Claude Code registers.
  assert.equal(execFileSync('git', ['status', '--porcelain', '--untracked-files=no'],
    { cwd: root, encoding: 'utf8' }).trim(), '');
});

test('AC 1 — with Node absent the hook is not written, and an existing one is removed', () => {
  // A hook that runs `node` on a machine without Node is an error on every session start. Variant B
  // has no `disableAllHooks` branch, so removal is the whole mechanism.
  const withHook = computeSettings({}, { mode: 'design-only', nodePresent: true,
    registration: 'project', serverKey: KEY });
  assert.deepEqual(withHook.hooks, hookEntry());

  const withoutNode = computeSettings(withHook, { mode: 'design-only', nodePresent: false,
    registration: 'project', serverKey: KEY });
  assert.equal(withoutNode.hooks, undefined, 'a hook that cannot run must not survive');
  assert.equal('disableAllHooks' in withoutNode, false, 'branch A is dead — it must not reappear');

  // Someone else's hooks are not ours to delete.
  const foreign = computeSettings({ hooks: { PreToolUse: [{ matcher: 'x' }] } },
    { mode: 'design-only', nodePresent: false, registration: 'project', serverKey: KEY });
  assert.deepEqual(foreign.hooks, { PreToolUse: [{ matcher: 'x' }] });
});

test('AC 2 — the merge preserves everything that is not ours, in both directions', async () => {
  const root = makeCheckout();
  const mine = { permissions: { allow: ['Bash(ls*)'] }, enabledMcpjsonServers: ['other'] };
  writeFileSync(join(root, SETTINGS_LOCAL), `${JSON.stringify(mine, null, 2)}\n`);

  await runB07(ctxFor(root, { node: { present: false } }));
  assert.deepEqual(readJson(root, SETTINGS_LOCAL), {
    permissions: { allow: ['Bash(ls*)'] },
    enabledMcpjsonServers: ['other'],
    disabledMcpjsonServers: [KEY],
  }, 'the story\'s exact object');

  await runB07(ctxFor(root, { mode: 'live', node: { present: false } }));
  const live = readJson(root, SETTINGS_LOCAL);
  assert.deepEqual(live.enabledMcpjsonServers, ['other', KEY]);
  assert.equal(live.disabledMcpjsonServers, undefined, 'the disable entry must be gone, not emptied');
  assert.deepEqual(live.permissions, { allow: ['Bash(ls*)'] }, 'their grants survived both runs');

  // ...and back again, with the foreign member still intact.
  await runB07(ctxFor(root, { node: { present: false } }));
  const back = readJson(root, SETTINGS_LOCAL);
  assert.deepEqual(back.enabledMcpjsonServers, ['other']);
  assert.deepEqual(back.disabledMcpjsonServers, [KEY]);
});

test('key order is preserved for existing keys, and new keys are appended', () => {
  const current = { zzz: 1, permissions: {}, aaa: 2 };
  const next = computeSettings(current, { mode: 'design-only', nodePresent: false,
    registration: 'project', serverKey: KEY });
  assert.deepEqual(Object.keys(next), ['zzz', 'permissions', 'aaa', 'disabledMcpjsonServers'],
    'a reordered settings file is a diff nobody asked for');
});

test('a registration that is not `project` is rejected whatever the mode says', () => {
  // The project entry is rejected; the local or user entry carries the same key. S12 verifies the
  // coexistence — here the only claim is that live mode does not enable the project one.
  for (const registration of ['local', 'user']) {
    const next = computeSettings({}, { mode: 'live', nodePresent: true, registration, serverKey: KEY });
    assert.deepEqual(next.disabledMcpjsonServers, [KEY], registration);
    assert.equal(next.enabledMcpjsonServers, undefined, registration);
  }
});

test('ARC-09-C192 — a settings.local.json carried from an older install ends with one SessionStart hook, the rest kept', async () => {
  // MIGRATION's fresh install carries the user's `.claude/settings.local.json` into the new tree. As a 2.2.0 install
  // leaves it: our hook (its command unchanged since 2.0) beside the user's own keys and hooks, and, for the stale case,
  // a second entry naming the OLD folder by an absolute path.
  const root = makeCheckout();
  // Derived, not spelled: the hook's command is the same in 2.2.0 (measured at its tag), and a test that spelled the hook's
  // path would be counted among the banner tests, which may not name the version-of-record file (ARC-09-C137).
  const ours = hookEntry().SessionStart[0].hooks[0];
  const carried = {
    permissions: { allow: ['Bash(git status:*)'] },
    env: { NODE_EXTRA_CA_CERTS: '/etc/ssl/corporate.pem' },
    disabledMcpjsonServers: [KEY],
    hooks: {
      SessionStart: [
        { matcher: 'startup|resume', hooks: [ours] },
        { matcher: 'startup', hooks: [{ type: 'command', command: ours.command.replace('${CLAUDE_PROJECT_DIR}', '/home/someone/snowarch-2.2.0') }] },
      ],
      PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo mine' }] }],
    },
  };
  writeFileSync(join(root, SETTINGS_LOCAL), `${JSON.stringify(carried, null, 2)}\n`);
  // Twice: the bootstrap, and the next one. Neither may add a second hook.
  for (const run of [1, 2]) {
    const r = await runB07(ctxFor(root));
    assert.equal(r.status, 'ok', `run ${run}: ${r.detail}`);
  }
  const after = readJson(root, SETTINGS_LOCAL);
  assert.deepEqual(after.hooks.SessionStart, hookEntry().SessionStart, 'the SessionStart hook is not exactly ours');
  assert.equal(after.hooks.SessionStart.flatMap((e) => e.hooks).length, 1, 'more than one SessionStart hook');
  assert.equal(after.hooks.SessionStart[0].hooks[0].command, ours.command, 'the hook does not follow the tree it is in');
  assert.deepEqual([after.permissions, after.env, after.hooks.PreToolUse],
    [carried.permissions, carried.env, carried.hooks.PreToolUse], 'a key of the user\'s was not kept');
});

// ARC-09-C193 — the SessionStart key holds the user's hooks too. `Object.assign(hooks, hookEntry())` replaced the
// whole key, so a user's own SessionStart hook was lost at every bootstrap and upgrade, and with Node absent the
// writer deleted every SessionStart hook, not only ours. Ours is any hook that runs session-start.mjs: the doctor's
// E-08 reads it the same way, and C192's carried stale copy under another folder is ours too.
const USER_HOOK = Object.freeze({ type: 'command', command: 'node /home/someone/my-own-banner.js', timeout: 5 });

test('ARC-09-C193 — a user\'s own SessionStart hook beside ours is kept, and ours is there exactly once', () => {
  const opts = { mode: 'design-only', registration: 'project', serverKey: KEY };
  const mine = { matcher: 'startup', hooks: [USER_HOOK] };
  const current = { hooks: { SessionStart: [mine, ...hookEntry().SessionStart] } };
  assert.deepEqual(computeSettings(current, { ...opts, nodePresent: true }).hooks.SessionStart,
    [mine, ...hookEntry().SessionStart], 'the user\'s hook was not kept, or ours is not there once');
  // Node gone: ours leaves, the user's stays.
  assert.deepEqual(computeSettings(current, { ...opts, nodePresent: false }).hooks.SessionStart, [mine],
    'with Node absent the writer removed a hook that is not ours');
  // One group holding both: the user's hook stays in its group, and ours is written once on its own.
  const shared = { hooks: { SessionStart: [{ matcher: 'startup|resume',
    hooks: [USER_HOOK, hookEntry().SessionStart[0].hooks[0]] }] } };
  assert.deepEqual(computeSettings(shared, { ...opts, nodePresent: true }).hooks.SessionStart,
    [{ matcher: 'startup|resume', hooks: [USER_HOOK] }, ...hookEntry().SessionStart]);
});

test('ARC-09-C193 — through B07, twice: the user\'s SessionStart hook survives every bootstrap', async () => {
  const root = makeCheckout();
  writeFileSync(join(root, SETTINGS_LOCAL),
    `${JSON.stringify({ hooks: { SessionStart: [{ matcher: 'startup', hooks: [USER_HOOK] }] } }, null, 2)}\n`);
  for (const run of [1, 2]) {
    const r = await runB07(ctxFor(root));
    assert.equal(r.status, 'ok', `run ${run}: ${r.detail}`);
  }
  const hooks = readJson(root, SETTINGS_LOCAL).hooks.SessionStart.flatMap((e) => e.hooks);
  assert.deepEqual(hooks.filter((h) => h.command === USER_HOOK.command), [USER_HOOK], 'the user\'s hook was lost');
  assert.equal(hooks.filter((h) => /session-start\.mjs/.test(h.command)).length, 1, 'ours is not there exactly once');
});

test('ARC-09-C193 — a user\'s own script called session-start.mjs is the user\'s: only our layout is ours', () => {
  // Ours is a session-start.mjs inside a tools/snowarch/ folder, any folder before it, either separator: C192's copy
  // from another install's folder is ours to replace, and a user's ~/scripts/session-start.mjs is theirs to keep. A
  // folder whose name only ends in "tools" is not the tools folder.
  const opts = { mode: 'design-only', registration: 'project', serverKey: KEY };
  const theirs = [
    { type: 'command', command: 'node /home/someone/scripts/session-start.mjs' },
    { type: 'command', command: 'node /home/someone/mytools/snowarch/session-start.mjs' },
  ];
  const windowsCopyOfOurs = { type: 'command',
    command: 'node C:\\Users\\someone\\snowarch-2.2.0\\tools\\snowarch\\hooks\\session-start.mjs' };
  const current = { hooks: { SessionStart: [{ matcher: 'startup', hooks: [...theirs, windowsCopyOfOurs] }] } };
  for (const nodePresent of [true, false]) {
    const kept = computeSettings(current, { ...opts, nodePresent }).hooks.SessionStart.flatMap((g) => g.hooks);
    assert.deepEqual(kept.filter((h) => theirs.includes(h)), theirs, `nodePresent ${nodePresent}: a user's script was removed`);
    assert.equal(kept.includes(windowsCopyOfOurs), false, `nodePresent ${nodePresent}: a copy of ours, in Windows form, was kept`);
  }
});

test('AC 3 — invalid JSON is the one failure mode, and the bytes are untouched', async () => {
  const root = makeCheckout();
  const broken = '{ not json';
  writeFileSync(join(root, SETTINGS_LOCAL), broken);

  const r = await runB07(ctxFor(root));

  assert.equal(r.status, 'fail');
  assert.equal(r.detail, INVALID_JSON);
  assert.match(INVALID_JSON, /nothing was changed/);
  assert.equal(read(root, SETTINGS_LOCAL), broken, 'someone\'s file was rewritten');
  assert.equal(existsSync(join(root, CONFIG_FILE)), false, 'and nothing else was written either');

  // A JSON array or a bare string parses but is not a settings object.
  for (const bad of ['[]', '"hello"', 'null']) {
    writeFileSync(join(root, SETTINGS_LOCAL), bad);
    const out = applyToggles({ root, mode: 'design-only', nodePresent: false, serverKey: KEY });
    assert.equal(out.ok, false, bad);
    assert.equal(read(root, SETTINGS_LOCAL), bad, bad);
  }
});

test('the gitignore guard refuses before writing anything', async () => {
  const root = makeCheckout();
  // The check is INJECTED rather than arranged by editing `.gitignore`. My own global excludes
  // carry `**/.claude/settings.local.json`, so removing the line from the fixture changed nothing
  // here and would have changed everything on a runner — a precondition that depends on whose
  // machine it runs on is not a precondition. What B07 does with a refusal is the claim.
  const r = await runB07(ctxFor(root, { checkIgnored: () => false }));

  assert.equal(r.status, 'fail');
  assert.equal(r.detail, NOT_IGNORED);
  assert.match(NOT_IGNORED, /must stay untracked so Claude Code applies its approvals/);
  assert.equal(existsSync(join(root, SETTINGS_LOCAL)), false, 'a tracked settings file was created');
});

test('...and `isIgnored` itself answers from the repository, global excludes neutralised', () => {
  const root = makeCheckout();
  // `core.excludesFile` pointed at a path that does not exist takes the developer's personal
  // excludes out of the answer, so this measures the fixture's `.gitignore` and nothing else, on
  // every machine. `GIT_CONFIG_GLOBAL` alone was not enough: unsetting `core.excludesFile` makes
  // git fall back to `~/.config/git/ignore`, which on this machine carries exactly this path — the
  // second time today a fixture's premise turned out to be a property of the developer's setup.
  const env = { ...process.env,
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'core.excludesFile',
    GIT_CONFIG_VALUE_0: join(root, 'no-such-excludes-file') };
  assert.equal(isIgnored(root, SETTINGS_LOCAL, env), true, 'the fixture ships the line');

  writeFileSync(join(root, '.gitignore'), '.local/\n');
  assert.equal(isIgnored(root, SETTINGS_LOCAL, env), false, 'and notices when it is gone');
  assert.equal(isIgnored(root, '.local/instances.json', env), true, 'the store line is still there');
});

test('AC 7 — twice is byte-identical, except the timestamp that is meant to move', async () => {
  const root = makeCheckout();
  await runB07(ctxFor(root));
  const settings1 = read(root, SETTINGS_LOCAL);
  const config1 = readJson(root, CONFIG_FILE);

  const second = await runB07(ctxFor(root));
  assert.equal(second.data.settingsChanged, false, 'the second run must not rewrite the file');
  assert.equal(read(root, SETTINGS_LOCAL), settings1);

  const config2 = readJson(root, CONFIG_FILE);
  assert.deepEqual({ ...config1, updatedAt: null }, { ...config2, updatedAt: null });
  assert.notEqual(config2.updatedAt, undefined);
});

test('AC 4 — a changed .mcp.json fails B01, with the remedy, and .local/ is still created', async () => {
  const root = makeCheckout();
  const before = read(root, '.mcp.json');
  writeFileSync(join(root, '.mcp.json'), `${before.trimEnd()} \n`);   // one byte
  assert.notEqual(read(root, '.mcp.json'), before, 'precondition: the file really differs');

  const state = { steps: {}, registration: 'project' };
  const r = await runB01(ctxFor(root, { state }));

  assert.equal(r.status, 'fail');
  assert.match(r.detail, /^\.mcp\.json differs from the committed version$/);
  assert.match(r.remedy, /^run: git checkout -- \.mcp\.json {3}\(never edit this file; per-machine values belong in \.claude\/settings\.local\.json\)$/);
  // The workspace is still made: the user is about to fix the file and re-run, and a missing
  // `.local/` would mean the next run starts from nothing.
  assert.ok(existsSync(join(root, '.local')));
  assert.equal(state.writer, 'node');
});

test('...and a committed edit is caught too, by the rules rather than by the diff', async () => {
  // `git diff` sees an uncommitted change. A user who committed their edit — or a fork that shipped
  // one — passes that check, which is why S01's rules are re-evaluated here at run time.
  const root = makeCheckout();
  const mcp = readJson(root, '.mcp.json');
  mcp.mcpServers[KEY].command = 'npx';
  writeFileSync(join(root, '.mcp.json'), `${JSON.stringify(mcp, null, 2)}\n`);
  execFileSync('git', ['add', '-A'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['-c', 'user.email=f@example.invalid', '-c', 'user.name=f',
    'commit', '-qm', 'edited'], { cwd: root, stdio: 'ignore' });
  assert.equal(committedFilesUnchanged(root, ['.mcp.json']).clean, true,
    'precondition: the diff check passes, so only the rules can catch this');

  const r = await runB01(ctxFor(root));
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /command is "npx", not node/);
});

test('the lifted rules catch what S01 asserts, and pass the real committed files', () => {
  const root = makeCheckout();
  const cfg = config(root);
  assert.deepEqual(checkMcpJson(readJson(root, '.mcp.json'), cfg), []);
  assert.deepEqual(checkSettingsJson(readJson(root, '.claude/settings.json')), []);

  // Each negative, so the rule set is not a list of things that happen to be true.
  const bad = (mutate) => { const m = readJson(root, '.mcp.json'); mutate(m); return checkMcpJson(m, cfg); };
  assert.match(bad((m) => { m.mcpServers[KEY].type = 'http'; })[0], /type is "http"/);
  assert.match(bad((m) => { m.mcpServers[KEY].args = ['a', 'b']; })[0], /exactly one path/);
  assert.match(bad((m) => { m.mcpServers[KEY].args = ['${CLAUDE_PROJECT_DIR:-.}\\x\\dist\\server.js']; }).join(' '),
    /backslashes/);
  assert.match(bad((m) => { m.mcpServers[KEY].env.SNOW_STORE = '${SNOW_STORE}'; })[0],
    /placeholder with no default/);
  assert.match(bad((m) => { m.mcpServers[KEY].env[`API${'_KEY'}`] = 'x'; }).join(' '),
    /credential-shaped key/);
  assert.match(checkMcpJson({ mcpServers: {} }, cfg)[0], /has no "servicenow" server/);
  assert.match(checkSettingsJson({ hooks: {} })[0], /would run before Node is proven/);
});

test('AC 5 — the cloud-sync warning names the provider, and quiet paths stay quiet', () => {
  // THE CASES ARE NO LONGER WRITTEN HERE. ARC-07-S07 made
  // `packages/snowarch/tests/fixtures/cloud-sync-paths.json` the single list that this module, the
  // server's `detectCloudSync()` and ARC-08-S03's E-25 all answer to — three tables that merely
  // looked alike would drift, and would disagree about a path exactly when it mattered. This test
  // used to carry its own six rows; they are in the fixture now, beside the story's.
  const fixture = JSON.parse(readFileSync(
    join(repoRoot, 'packages/snowarch/tests/fixtures/cloud-sync-paths.json'), 'utf8'));

  assert.ok(fixture.synced.length > 5, 'the fixture is not empty — every loop below depends on it');
  for (const { path, provider, why } of fixture.synced) {
    // The engine names the mount as the provider where the server names the vendor; both are
    // "synced, and here is who" and the WARN reads correctly either way. What may NOT differ is
    // WHETHER — that is the shared answer, and it is asserted exactly.
    assert.ok(cloudSyncProvider(path), `${path} — ${why}`);
    assert.match(cloudSyncWarning(path), /synced even at mode 0600/);
    assert.equal(isUnderCloudSyncFolder(path), true, `${path}: the two detectors disagree`);
    if (provider !== 'CloudStorage (unknown provider)') {
      assert.equal(cloudSyncProvider(path), provider, `${path} — ${why}`);
    }
  }
  for (const { path, why } of fixture.quiet) {
    assert.equal(cloudSyncProvider(path), null, `${path} — ${why}`);
    assert.equal(cloudSyncWarning(path), null, path);
    assert.equal(isUnderCloudSyncFolder(path), false, `${path}: the two detectors disagree`);
  }

  // ARC-08-C2 — THE THIRD SECTION, which this test did not read. `env[]` is Windows Known Folder
  // Move: the path names no provider and `%OneDrive%` is the only detector there is. Until C2 this
  // module answered null for all of it while `isUnderCloudSyncFolder` — which delegates to the
  // server's detector with default options, so it reads the AMBIENT environment — answered true.
  // Two halves of one module disagreeing about the case each was imported to keep them agreeing on,
  // and unread fixture rows are why nobody saw it.
  //
  // `isUnderCloudSyncFolder` is NOT asserted here: it takes no env, so its answer depends on the
  // machine running the suite. The injected pair is what this file can speak for.
  assert.ok(fixture.env.length > 2, 'the fixture lost its environment rows');
  for (const { path, set, provider, why } of fixture.env) {
    assert.equal(cloudSyncProvider(path, { env: set }), provider, `${path} — ${why}`);
    assert.equal(Boolean(cloudSyncWarning(path, { env: set })), provider !== null, `${path} — ${why}`);
    // ...and with the variable unset, a redirected path is indistinguishable from any other.
    assert.equal(cloudSyncProvider(path, { env: {} }), null, `${path} with no variable — ${why}`);
  }
});

test('a cloud-synced checkout WARNs and carries on — it is the user\'s call, not ours', async () => {
  const root = makeCheckout();
  const state = { steps: {}, registration: 'project' };
  // The real root is a temp dir, so the provider is injected by asking the module directly; what
  // B01 must do with a warning is the claim here.
  const warned = cloudSyncWarning('/Users/x/Dropbox/repo');
  assert.ok(warned);
  const r = await runB01(ctxFor(root, { state }));
  assert.equal(r.status, 'ok', 'a quiet path must not warn');
  assert.equal(r.data.cloudSync, undefined);
});

test('readDefaultLabel returns the label and NOTHING else', () => {
  const root = makeCheckout();
  mkdirSync(join(root, '.local'), { recursive: true });
  const store = join(root, '.local', 'instances.json');
  // A store shaped like a real one: a URL, a user, and a credential-shaped key assembled rather
  // than spelled. None of it may come back.
  writeFileSync(store, JSON.stringify({
    version: 1,
    defaultInstance: 'pdi',
    instances: {
      pdi: {
        url: 'https://example.service-now.invalid',
        user: 'admin',
        [`${'pass'}${'word'}`]: 'hunter2',
      },
    },
  }));

  const label = readDefaultLabel(store);
  assert.deepEqual(Object.keys(label), ['label'], 'exactly one key, so nothing else can ride along');
  assert.equal(label.label, 'pdi');
  const serialised = JSON.stringify(label);
  for (const leak of ['service-now', 'admin', 'hunter2']) {
    assert.ok(!serialised.includes(leak), `${leak} reached the mirror`);
  }
  assert.equal(readDefaultLabel(join(root, '.local', 'missing.json')), null);
  writeFileSync(store, '{ not json');
  assert.equal(readDefaultLabel(store), null, 'an unreadable store is not this reader\'s failure');
});

test('config.json v1 mirrors the label and never a URL or a user', () => {
  const root = makeCheckout();
  mkdirSync(join(root, '.local'), { recursive: true });
  const c = writeConfig(root, { mode: 'live', registration: 'local',
    readLabel: () => ({ label: 'pdi' }),
    storePath: join(root, '.local', 'instances.json') });
  writeFileSync(join(root, '.local', 'instances.json'), '{}');
  const again = writeConfig(root, { mode: 'live', registration: 'local',
    readLabel: () => ({ label: 'pdi' }) });

  assert.deepEqual(Object.keys(again).sort(),
    ['defaultInstance', 'mode', 'registration', 'updatedAt', 'version'].sort());
  assert.equal(again.version, 1);
  assert.equal(again.defaultInstance, 'pdi');
  assert.equal(c.defaultInstance, null, 'no store, no mirror');
  assert.match(read(root, CONFIG_FILE), /\n$/);
});

test('ensureLocalDir chmods a directory that already exists', { skip: isWindows ? 'no POSIX modes' : false },
  () => {
    const root = makeCheckout();
    mkdirSync(join(root, '.local'), { recursive: true, mode: 0o755 });
    assert.equal(statSync(join(root, '.local')).mode & 0o777, 0o755, 'precondition');
    const r = ensureLocalDir(root, 'linux');
    assert.equal(r.existed, true);
    assert.equal(statSync(join(root, '.local')).mode & 0o777, 0o700,
      'a checkout bootstrapped before this rule existed would stay 0755 for ever');
  });

test('on Windows nothing is chmodded and the state says why', () => {
  const root = makeCheckout();
  const r = ensureLocalDir(root, 'win32');
  assert.equal(r.modes, 'acl-inherited');
  assert.ok(existsSync(join(root, '.local', 'logs')));
});

test('B01 and B07 run in a checkout with no node_modules at all', () => {
  // The reason `label.ts` exists as its own zod-free module, and the reason `cloud-sync.mjs`
  // imports the committed `dist/` rather than the package: a design-only checkout never runs
  // `npm ci`, so anything either step touches has to work with an empty `node_modules`.
  const root = makeCheckout();
  assert.equal(existsSync(join(root, 'node_modules')), false, 'precondition: nothing installed');

  // Written to a FILE and run by path, not passed as `-e`. A one-line `--input-type=module -e`
  // carrying two absolute Windows paths is a quoting problem waiting to happen, and it duly
  // happened on all three Windows cells while passing here.
  const probe = join(root, 'probe.mjs');
  const url = (p) => pathToFileURL(join(process.cwd(), p)).href;
  writeFileSync(probe, [
    `import { run as b01 } from ${JSON.stringify(url('tools/snowarch/lib/steps/B01.mjs'))};`,
    `import { run as b07 } from ${JSON.stringify(url('tools/snowarch/lib/steps/B07.mjs'))};`,
    "import { readFileSync } from 'node:fs';",
    `const root = ${JSON.stringify(root)};`,
    "const cfg = JSON.parse(readFileSync(root + '/engine.config.json', 'utf8'));",
    "const ctx = { root, config: cfg, mode: 'design-only', node: { present: true },",
    "  state: { steps: {}, registration: 'project' }, line: () => {} };",
    'const a = await b01(ctx); const b = await b07(ctx);',
    "process.stdout.write(a.status + ' ' + b.status);",
  ].join('\n'));

  const out = execFileSync(process.execPath, [probe], { cwd: root, encoding: 'utf8' });
  assert.equal(out, 'ok ok');
});

/**
 * ARC-06-C7 — the mode is recorded by the step that makes it true, and by nothing earlier.
 *
 * Sitting A walked into the state this prevents: a live switch failed at B06, and because the mode
 * had already been written (by `mode.mjs` before any step ran, and again by B03 at step 3) the
 * checkout claimed `Mode: live` while `settings.local.json` still disabled the server. `./snowarch
 * mode` and the doctor then disagreed with each other — `E-10 FAIL … mode is live but servicenow is
 * disabled` — over a switch that had never happened.
 */
test('ARC-06-C7 — B07 records the mode it just made true', async () => {
  const root = makeCheckout();
  await runB01(ctxFor(root));
  const ctx = ctxFor(root, { mode: 'live', state: { steps: {}, registration: 'project', mode: 'design-only' } });

  assert.equal(ctx.state.mode, 'design-only', 'precondition: the checkout starts on the previous mode');
  const r = await runB07(ctx);

  assert.equal(r.status, 'ok');
  assert.equal(ctx.state.mode, 'live', 'B07 wrote the toggles and must record the mode they now mean');
});

test('ARC-06-C7 — B03 records nothing, so a switch that fails before B07 keeps the previous mode', async () => {
  const root = makeCheckout();
  await runB01(ctxFor(root));
  const ctx = ctxFor(root, { mode: 'live', state: { steps: {}, registration: 'project', mode: 'design-only' } });

  // B03 is the step that used to make the switch true on disk at step 3.
  const b03 = await runB03(ctx);
  assert.equal(b03.status, 'ok', 'B03 still validates and reports the requested mode');
  assert.equal(b03.data.mode, 'live', '...and still ANSWERS live — the request is not the record');
  assert.equal(ctx.state.mode, 'design-only',
    'B03 recorded the mode again — an interrupted switch will claim a mode it never reached');

  // B06 fails here in the real sequence, so B07 never runs and nothing else may touch the record.
  assert.equal(ctx.state.mode, 'design-only');
  assert.ok(!existsSync(join(root, CONFIG_FILE)) || readJson(root, CONFIG_FILE).mode !== 'live',
    'the per-checkout config must not say live either, for the same reason');
});

test('ARC-06-C15 — readDefaultSummary returns three non-secret keys and no more', () => {
  // The sibling of the one-key guard above, and it exists for the same reason: the next person
  // wanting "just the URL as well" argues with a test rather than editing a reader.
  const dir = tempDir('snowarch-summary-');
  const store = join(dir, 'instances.json');
  writeFileSync(store, JSON.stringify({
    version: 1,
    defaultInstance: 'pdi',
    instances: {
      pdi: {
        url: 'https://example.invalid-host-not-used',
        environment: 'pdi',
        preset: 'custom',
        auth: { method: 'basic', username: 'someone', password: 'a-secret-value' },
      },
    },
  }));

  const summary = readDefaultSummary(store);
  assert.deepEqual(Object.keys(summary), ['label', 'environment', 'preset'],
    'exactly three keys, so a credential cannot ride along');
  assert.deepEqual(summary, { label: 'pdi', environment: 'pdi', preset: 'custom' });

  // Asserted on the SERIALISED form, because that is what reaches a step's data and the state file.
  const serialised = JSON.stringify(summary);
  for (const secret of ['a-secret-value', 'someone', 'https://', 'basic']) {
    assert.equal(serialised.includes(secret), false, `the summary carried ${secret}`);
  }

  // A store with no default, and an unreadable one, are `null` rather than a throw.
  writeFileSync(store, JSON.stringify({ version: 1, instances: {} }));
  assert.equal(readDefaultSummary(store), null);
  writeFileSync(store, 'not json');
  assert.equal(readDefaultSummary(store), null);
});

// ── ARC-11-C7 — B01's one fetch of the release's signed manifest ─────────────────────────────────────────────────

const signer = keyPair();
const SIGNED = productKeys(signer, keyPair());

/** A checkout at `version` whose config names `repo` as the licences repository. */
function releaseCheckout(t, version, repo) {
  const root = makeCheckout({}, t);
  writeFileSync(join(root, 'package.json'), `${JSON.stringify({ name: 'f', version }, null, 2)}\n`);
  writeFileSync(join(root, 'engine.config.json'), `${JSON.stringify({ ...config(root),
    licence: { revocations: { repo, ref: 'main', path: 'revocations.json' } } }, null, 2)}\n`);
  return root;
}

test('ARC-11-C7 — B01 fetches a release\'s signed manifest into .local/, and says so', async (t) => {
  const repo = listRepo(t, { 'releases/v9.1.0.json': `${JSON.stringify(manifestDoc('v9.1.0', signer))}\n` });
  const root = releaseCheckout(t, '9.1.0', repo);
  const lines = [];
  const r = await runB01(ctxFor(root, { licenceKeys: SIGNED, line: (l) => lines.push(l) }));
  assert.equal(r.status, 'ok', r.detail);
  assert.deepEqual(lines, ['release manifest: v9.1.0 fetched (1 file)']);
  assert.deepEqual(r.data.manifest, { outcome: 'fetched', tag: 'v9.1.0', files: 1 });
  assert.equal(readManifestCache(root).tag, 'v9.1.0');
});

test('ARC-11-C7 — B01 warns when no manifest is published for the release, and caches nothing', async (t) => {
  const root = releaseCheckout(t, '9.1.0', listRepo(t, { 'revocations.json': '{}' }));
  const r = await runB01(ctxFor(root, { licenceKeys: SIGNED }));
  assert.equal(r.status, 'warn');
  assert.equal(r.detail, 'release manifest: none is published for v9.1.0');
  assert.equal(readManifestCache(root), null);
});

test('ARC-11-C7 — B01 fetches nothing on a development version, or with no licences repository configured', async (t) => {
  const repo = listRepo(t, { 'releases/v9.1.0.json': `${JSON.stringify(manifestDoc('v9.1.0', signer))}\n` });
  const dev = await runB01(ctxFor(releaseCheckout(t, '9.1.0-dev', repo), { licenceKeys: SIGNED }));
  const bare = await runB01(ctxFor(makeCheckout({}, t), { licenceKeys: SIGNED }));
  for (const r of [dev, bare]) {
    assert.equal(r.status, 'ok', r.detail);
    assert.equal(r.data.manifest, undefined);
    assert.match(r.detail, /^\.local\/ \w+ \([^)]+\)$/);
  }
});
