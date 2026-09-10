import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { modeCommand } from '../lib/mode.mjs';
import { CLAUDE_ABSENT, CREATED_BY_US, flagsChanged, get, isShim, parseGet, register, shimTarget,
  unregister } from '../lib/registration-claude.mjs';
import { EXIT_OK } from '../lib/exit.mjs';
import { emptyState, loadState, saveState } from '../lib/state.mjs';
import { tempDir } from './helpers/temp.mjs';
import { makeCheckout, recorder } from './helpers/workspace.mjs';

/**
 * ARC-06-S12 — the `--register` fallback, driven by a fake `claude`.
 *
 * Everything this story does to `~/.claude.json` goes through the CLI that owns it, so the unit
 * under test is the ARGV: the scope flag, the working directory local scope is keyed on, the
 * environment the child gets, and the fact that the JSON crosses as ONE element. A test that
 * asserted the file's contents instead would be testing Claude Code.
 *
 * The `get` fixtures below are the real 2.1.258 output, captured on 2026-09-09 — the parser has to
 * survive a format nobody here controls, so it is checked against what the CLI actually prints.
 */
const GET_PROJECT = `servicenow:
  Scope: Project config (shared via .mcp.json)
  Status: ⏸ Pending approval (run \`claude\` to approve)
  Type: stdio
  Command: node
  Args: \${CLAUDE_PROJECT_DIR:-.}/packages/snowarch/dist/server.js
  Environment:
    SNOW_STORE=\${SNOW_STORE:-}
    SNOW_LOG_LEVEL=\${SNOW_LOG_LEVEL:-info}
  Timeout: 600000ms

To remove this server, run: claude mcp remove servicenow -s project
`;

const getAt = (scope) => GET_PROJECT
  .replace('Project config (shared via .mcp.json)',
    scope === 'local' ? 'Local config (private to you in this project)'
      : 'User config (available in all your projects)')
  .replace('-s project', `-s ${scope}`);

const ABSENT = 'No MCP server named "servicenow". Configured servers: context-mode\n';

/** A `claude` that records what it was asked and answers from a script. */
function fakeClaude({ addStatus = 0, getAfterAdd = null, removeStatus = 0, getInitial = ABSENT } = {}) {
  const calls = [];
  let added = false;
  let removed = false;
  const exec = (file, args, options) => {
    calls.push({ file, args, cwd: options?.cwd, env: options?.env });
    const sub = args[1];
    if (sub === 'add-json') { added = true; return { status: addStatus, stdout: 'Added\n', stderr: '' }; }
    if (sub === 'remove') { removed = true; return { status: removeStatus, stdout: 'Removed\n', stderr: '' }; }
    if (sub === 'get') {
      if (removed) return { status: 0, stdout: GET_PROJECT, stderr: '' };
      if (added) return { status: 0, stdout: getAfterAdd ?? getAt('local'), stderr: '' };
      return { status: 0, stdout: getInitial, stderr: '' };
    }
    return { status: 0, stdout: '2.1.258 (Claude Code)\n', stderr: '' };
  };
  return { exec, calls, of: (sub) => calls.filter((c) => c.args[1] === sub) };
}

const bootstrapped = (root, patch = {}) => {
  mkdirSync(join(root, '.local'), { recursive: true });
  saveState(root, { ...emptyState({ engineVersion: '0.0.0-test' }), mode: 'design-only', ...patch });
};

/** `mode` with the fake, stopped after the registration by a registry that fails at B00. */
const runRegister = async (root, flags, { fake = fakeClaude(), state = {} } = {}) => {
  bootstrapped(root, state);
  writeFileSync(join(root, '.local', 'instances.json'), '{"defaultInstance":"dev1"}\n');
  const log = recorder();
  const code = await modeCommand({
    root, positional: ['live'], flags: { yes: true, ...flags }, log, env: {}, cwd: root,
    claudePath: '/fake/bin/claude', execClaude: fake.exec,
    registry: [{ id: 'B00', title: 'preflight', needsNode: false, runsWhen: () => true,
      cacheable: false, inputs: () => [], run: async () => ({ status: 'fail', detail: 'stub stop' }) }],
  });
  return { code, log, fake, text: log.lines.join('\n'), state: loadState(root) };
};

test('criterion 4 — add-json gets the scope, the cwd, and the entry as ONE argv element', async () => {
  const root = makeCheckout();
  const r = await runRegister(root, { register: 'local' });
  const [add] = r.fake.of('add-json');
  assert.ok(add, 'add-json was never called');
  assert.deepEqual(add.args.slice(0, 3), ['mcp', 'add-json', 'servicenow']);
  assert.deepEqual(add.args.slice(4), ['-s', 'local']);
  assert.equal(add.args.length, 6, `the JSON must be one element: ${JSON.stringify(add.args)}`);
  // Local scope is keyed on the working directory: the same command from elsewhere would register
  // the server for a different project.
  assert.equal(add.cwd, root);
  // The S08 rule — our spawn, so the session variable is SET, never inherited.
  assert.equal(add.env.CLAUDE_PROJECT_DIR, root);
});

test('...and that element is .mcp.json\'s entry verbatim, placeholders unexpanded', async () => {
  const root = makeCheckout();
  const r = await runRegister(root, { register: 'local' });
  const sent = JSON.parse(r.fake.of('add-json')[0].args[3]);
  const committed = JSON.parse(readFileSync(join(root, '.mcp.json'), 'utf8')).mcpServers.servicenow;
  assert.deepEqual(sent, committed);
  assert.equal(sent.args[0], '${CLAUDE_PROJECT_DIR:-.}/packages/snowarch/dist/server.js');
  // An entry resolved to an absolute path at registration time would break the moment the
  // checkout moved, and it is not the same server the project entry describes.
  assert.equal(sent.args[0].includes(root), false);
});

test('...and it carries no credential-shaped key or value, asserted rather than promised', async () => {
  const root = makeCheckout();
  const r = await runRegister(root, { register: 'local' });
  const json = r.fake.of('add-json')[0].args[3];
  const walk = (v, out = []) => {
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.push(k); walk(x, out); }
    return out;
  };
  const keys = walk(JSON.parse(json));
  assert.deepEqual(keys.filter((k) => /PASSWORD|SECRET|TOKEN/i.test(k)), []);
  assert.equal(/Basic\s|Bearer\s|:\/\/[^/]*@/.test(json), false);
  // Not vacuous — the same check on a credential-bearing entry must fail.
  assert.equal(walk({ env: { SNOW_PASSWORD: 'x' } }).some((k) => /PASSWORD/i.test(k)), true);
});

test('the registration is verified with `get`, and a silent no-op is a failure', async () => {
  const root = makeCheckout();
  // add-json says 0, and the entry is nowhere. The only thing standing between that and a state
  // file claiming `registration: local` is this check.
  const fake = fakeClaude({ getAfterAdd: ABSENT });
  const r = await runRegister(root, { register: 'local' }, { fake });
  assert.notEqual(r.code, EXIT_OK);
  assert.match(r.text, /reported success but claude mcp get servicenow shows nothing/);
  assert.equal(r.state.registration, 'project', 'the state must not record a registration that is not there');
});

test('a scope that is not the one asked for is reported, not recorded', async () => {
  const root = makeCheckout();
  const fake = fakeClaude({ getAfterAdd: getAt('user') });
  const r = await runRegister(root, { register: 'local' }, { fake });
  assert.notEqual(r.code, EXIT_OK);
  assert.match(r.text, /registered at local scope but claude mcp get servicenow reports user/);
});

test('a successful local registration reaches the state, the config and the toggles', async () => {
  const root = makeCheckout();
  const fake = fakeClaude();
  bootstrapped(root);
  writeFileSync(join(root, '.local', 'instances.json'), '{"defaultInstance":"dev1"}\n');
  const log = recorder();
  // The real B07 and B09, because the toggle write is half of criterion 4.
  const code = await modeCommand({
    root, positional: ['design'], flags: { register: 'local' }, log, env: {}, cwd: root,
    claudePath: '/fake/bin/claude', execClaude: fake.exec,
  });
  assert.equal(code, EXIT_OK, log.lines.join('\n'));
  const state = loadState(root);
  assert.equal(state.registration, 'local');
  assert.equal(state.registrationReason, CREATED_BY_US);
  const config = JSON.parse(readFileSync(join(root, '.local', 'config.json'), 'utf8'));
  assert.equal(config.registration, 'local');
  const settings = JSON.parse(readFileSync(join(root, '.claude', 'settings.local.json'), 'utf8'));
  // The project entry must be REJECTED, or both would load and a user would see the server twice.
  assert.deepEqual(settings.disabledMcpjsonServers, ['servicenow']);
});

test('criterion 5 — --register project removes the entry this tool created, with -s', async () => {
  const root = makeCheckout();
  const fake = fakeClaude();
  const r = await runRegister(root, { register: 'project' },
    { fake, state: { registration: 'local', registrationReason: CREATED_BY_US } });
  const [remove] = r.fake.of('remove');
  assert.ok(remove, 'remove was never called');
  // WITHOUT `-s`, `claude mcp remove` deletes from whichever scope it finds — which for this key
  // would be the committed project entry. The flag is the whole point of the call.
  assert.deepEqual(remove.args, ['mcp', 'remove', 'servicenow', '-s', 'local']);
  assert.equal(r.state.registration, 'project');
  assert.equal(r.state.registrationReason, 'default');
});

test('...and never one it did not create', async () => {
  const root = makeCheckout();
  const fake = fakeClaude();
  const r = await runRegister(root, { register: 'project' },
    { fake, state: { registration: 'local', registrationReason: 'default' } });
  assert.deepEqual(r.fake.of('remove'), [], 'a legacy entry was removed');
  assert.match(r.text, /was not created by this tool — leaving it alone/);
  // ...and the user is given the command, because that is ARC-08-S03's contract: print it, do not
  // run it.
  assert.match(r.text, /claude mcp remove servicenow -s local/);
  assert.equal(r.state.registration, 'project');
});

test('--register project on a project checkout calls nothing at all', async () => {
  const root = makeCheckout();
  const fake = fakeClaude();
  const r = await runRegister(root, { register: 'project' }, { fake });
  assert.deepEqual(fake.calls, [], 'the default registration must not touch ~/.claude.json');
});

test('no claude on PATH is a named prerequisite, not a stack trace', async () => {
  const root = makeCheckout();
  bootstrapped(root);
  const log = recorder();
  const code = await modeCommand({ root, positional: ['design'], flags: { register: 'local' },
    log, env: {}, cwd: root, claudePath: null });
  assert.notEqual(code, EXIT_OK);
  assert.equal(log.lines.join('\n').includes(CLAUDE_ABSENT), true);
});

test('a renamed flag is reported as a renamed flag, with the CLI version', () => {
  const exec = (file, args) => (args[0] === '--version'
    ? { status: 0, stdout: '9.9.9 (Claude Code)\n', stderr: '' }
    : { status: 1, stdout: '', stderr: "error: unknown option '-s'\n" });
  const r = register({ root: '/r', serverKey: 'servicenow', scope: 'local', entry: { type: 'stdio' },
    claudePath: '/fake/claude', exec, env: {} });
  assert.equal(r.ok, false);
  assert.equal(r.reason, flagsChanged('add-json', '9.9.9'));
  assert.match(r.reason, /flag spelling has changed/);
});

test('unregister refuses project scope outright — that entry is committed', () => {
  assert.throws(() => unregister({ root: '/r', serverKey: 'servicenow', scope: 'project',
    ownedByUs: true, claudePath: '/fake/claude', exec: () => ({ status: 0 }) }),
  /expects local or user/);
});

test('parseGet reads the real 2.1.258 output, scope from the remove hint', () => {
  const p = parseGet(GET_PROJECT);
  assert.equal(p.found, true);
  assert.equal(p.name, 'servicenow');
  assert.equal(p.scope, 'project');
  assert.equal(p.type, 'stdio');
  assert.equal(p.command, 'node');
  assert.equal(p.args, '${CLAUDE_PROJECT_DIR:-.}/packages/snowarch/dist/server.js');
  assert.deepEqual(p.env, { SNOW_STORE: '${SNOW_STORE:-}', SNOW_LOG_LEVEL: '${SNOW_LOG_LEVEL:-info}' });
  assert.match(p.status, /Pending approval/);
  for (const scope of ['local', 'user']) assert.equal(parseGet(getAt(scope)).scope, scope);
});

test('...and the hint wins over the prose, which is written for a human', () => {
  // If a release rewords `Scope:` — "Local config (private to you…)" is prose, not an API — the
  // command in the remove hint still has to work, so that is what the scope is read from.
  const reworded = GET_PROJECT.replace('Project config (shared via .mcp.json)', 'Shared with the team');
  assert.equal(parseGet(reworded).scope, 'project');
  const noHint = GET_PROJECT.split('To remove')[0];
  assert.equal(parseGet(noHint).scope, 'project', 'the prose must still answer when the hint is gone');
});

test('an absent server is `found: false`, never an exception', () => {
  const r = get('servicenow', { root: '/r', claudePath: '/fake/claude', env: {},
    exec: () => ({ status: 1, stdout: ABSENT, stderr: '' }) });
  assert.equal(r.found, false);
  assert.equal(r.scope, null);
  assert.equal(parseGet('').found, false);
  assert.equal(parseGet(undefined).found, false);
});

/**
 * ARC-08-S04 deliverable 0 — a `.cmd` shim is redirected, never spawned.
 *
 * `claude` installed from npm on Windows IS `claude.cmd`, and `child_process` has refused to spawn
 * one without a shell since the CVE-2024-27980 fix. Every `claude mcp` call on such a machine
 * failed with EINVAL: the S-03 fallback registration, `mode live`, and the doctor's E-27. The
 * repository's rule for this is B04's — resolve the shim's own entry point and run it under this
 * Node — and it is applied here rather than re-invented.
 *
 * The end-to-end case runs on EVERY platform on purpose: the redirect means the extension stops
 * mattering, so what Windows exercises is the same code path this cell just proved.
 */
test('a .cmd shim is run through its own entry point, on every platform', (t) => {
  const dir = tempDir('snowarch-shim-', t);
  const modules = join(dir, 'node_modules', 'claude-code');
  mkdirSync(modules, { recursive: true });
  writeFileSync(join(modules, 'cli.js'),
    "process.stdout.write('servicenow:\\n  Scope: Project config (shared via .mcp.json)\\n'\n"
    + "  + '  Status: connected\\n');\n");
  writeFileSync(join(dir, 'claude.cmd'),
    '@ECHO off\r\nnode  "%~dp0\\node_modules\\claude-code\\cli.js" %*\r\n');

  const entry = shimTarget(join(dir, 'claude.cmd'));
  assert.equal(entry, join(modules, 'cli.js'), 'the shim\'s entry point was not resolved');

  const shown = get('servicenow', { root: dir, claudePath: join(dir, 'claude.cmd') });
  assert.equal(shown.found, true, `the shim did not run: ${shown.reason ?? ''}`);
  assert.equal(shown.name, 'servicenow');
  assert.equal(shown.scope, 'project');
});

test('a shim whose entry point cannot be read is refused with a sentence, not an errno', (t) => {
  const dir = tempDir('snowarch-shim-', t);
  writeFileSync(join(dir, 'claude.cmd'), '@ECHO off\r\nsomething-else %*\r\n');
  const shown = get('servicenow', { root: dir, claudePath: join(dir, 'claude.cmd') });
  assert.equal(shown.found, false);
  assert.match(shown.reason, /command shim whose entry point could not be read/);
  assert.equal(/EINVAL|spawnSync/.test(shown.reason), false, 'an errno reached the sentence');
});

test('shimTarget reads both slash styles, an absolute target, and refuses a guess', () => {
  const exists = (p) => /cli\.js$/.test(p);
  // The expectation is RESOLVED the same way the function resolves it: on Windows `/x` is
  // drive-relative, so `join('/x', …)` is `\\x\\lib\\cli.js` while the answer is `D:\\x\\lib\\cli.js`
  // — a difference about the cell's drive letter rather than about the parser.
  const expected = resolve('/x', 'lib', 'cli.js');
  const posix = shimTarget('/x/claude.cmd',
    { read: () => 'node "%~dp0/lib/cli.js" %*', exists });
  assert.equal(posix, expected);
  const windows = shimTarget('/x/claude.cmd',
    { read: () => 'node "%~dp0\\lib\\cli.js" %*', exists });
  assert.equal(windows, expected);
  // A target that is not there is not a target: a shim naming a file that has been uninstalled
  // must read as unresolved rather than as a path to spawn.
  assert.equal(shimTarget('/x/claude.cmd', { read: () => 'node "%~dp0/lib/cli.js" %*',
    exists: () => false }), null);
  assert.equal(shimTarget('/x/claude.cmd', { read: () => { throw new Error('ENOENT'); } }), null);
});

test('an executable that is not a shim is spawned exactly as before', () => {
  assert.equal(isShim('/usr/local/bin/claude'), false);
  assert.equal(isShim('C:\\Program Files\\claude\\claude.exe'), false);
  assert.equal(isShim('C:\\npm\\claude.CMD'), true);
  assert.equal(isShim('C:\\npm\\claude.bat'), true);
});

test('nothing under lib/ opens ~/.claude.json, or anything else in the home directory', () => {
  // `fileURLToPath`, never `.pathname` — the repo-wide rule, and `/C:/…` is not a path.
  const dir = fileURLToPath(new URL('../lib/', import.meta.url));
  const files = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.mjs')) files.push(p);
    }
  };
  walk(dir);
  assert.ok(files.length > 20, `only ${files.length} modules scanned — is the walk right?`);

  const FS_VERB = /readFileSync|writeFileSync|existsSync|openSync|rmSync|appendFileSync|join\(|resolve\(/;
  const WRITE_VERB = /writeFileSync|appendFileSync|rmSync|unlinkSync|renameSync|openSync/;
  /**
   * The one file allowed to READ it, and never to write it.
   *
   * ARC-08-S03's E-23 is a detector: its whole subject is the stale registrations the old
   * installers left in `~/.claude.json`, and a detector that may not read what it detects cannot
   * exist. The rule this exception belongs to is about OWNERSHIP — the file is the claude CLI's,
   * so nothing here may change it — and that half is asserted more strictly for this file than
   * for the others: no write verb at all, anywhere in it.
   */
  const READ_ONLY_DETECTOR = 'doctor/checks/legacy.mjs';

  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    if (file.split('\\').join('/').endsWith(READ_ONLY_DETECTOR)) {
      assert.equal(WRITE_VERB.test(text), false,
        `${file} is the read-only detector and it writes something`);
      assert.equal(/\bhomedir\b|USERPROFILE/.test(text), false,
        `${file} reaches into the home directory instead of taking it from ctx`);
      continue;
    }
    assert.equal(/\bhomedir\b|USERPROFILE/.test(text), false, `${file} reaches into the home directory`);
    for (const [i, line] of text.split('\n').entries()) {
      if (!line.includes('.claude.json')) continue;
      const isComment = /^\s*(\/\/|\*|\/\*)/.test(line);
      assert.ok(isComment || !FS_VERB.test(line),
        `${file}:${i + 1} builds a path to .claude.json — it belongs to the claude CLI`);
    }
  }
  // Not vacuous: this is the shape the loop is looking for.
  assert.equal(FS_VERB.test("readFileSync(join(homedir(), '.claude.json'))"), true);
});
