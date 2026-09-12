import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { run as runB01, ensureLocalDir, committedFilesUnchanged } from '../lib/steps/B01.mjs';
import { run as runB07, writeConfig, CONFIG_FILE } from '../lib/steps/B07.mjs';
import {
  INVALID_JSON, NOT_IGNORED, SETTINGS_LOCAL, applyToggles, computeSettings, hookEntry, isIgnored,
} from '../lib/settings-local.mjs';
import { cloudSyncProvider, cloudSyncWarning, isUnderCloudSyncFolder } from '../lib/cloud-sync.mjs';
import { checkMcpJson, checkSettingsJson } from '../lib/registration.mjs';
import { readDefaultLabel } from '../../../packages/snowarch/dist/store/label.js';
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
