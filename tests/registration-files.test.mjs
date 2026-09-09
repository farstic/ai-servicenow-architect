import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The two files that travel with a clone, and the one that never does.
 *
 * P-01 is why this exists: the previous engine was registered by hand-editing `~/.claude.json`, which
 * ended up holding a plaintext password keyed on an absolute path. Nothing in this repository writes
 * that file. Registration is `.mcp.json` and `.claude/settings.json`, both committed, both secret-free
 * — and "secret-free" is asserted rather than intended, because a credential that reaches a committed
 * file has already been published by the time anyone notices.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const config = JSON.parse(read('engine.config.json'));
const mcpText = read('.mcp.json');
const mcp = JSON.parse(mcpText);
const settingsText = read('.claude/settings.json');
const settings = JSON.parse(settingsText);

/** Every string value in an object, with the JSON path that reaches it. */
function strings(value, path = '', out = []) {
  if (typeof value === 'string') out.push({ path: path.replace(/^\./, ''), value });
  else if (Array.isArray(value)) value.forEach((v, i) => strings(v, `${path}[${i}]`, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) strings(v, `${path}.${k}`, out);
  }
  return out;
}

/** Every key at any depth. */
function keys(value, out = []) {
  if (Array.isArray(value)) value.forEach((v) => keys(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) { out.push(k); keys(v, out); }
  }
  return out;
}

test('the server key comes from engine.config.json, not from a literal', () => {
  assert.deepEqual(Object.keys(mcp.mcpServers), [config.mcp.serverKey]);
});

test('AC 4 — a changed serverKey is caught, and the message names both sides', () => {
  // The failure a maintainer would actually hit: renaming the key in one file and not the other.
  const fixtureKey = 'snow';
  const check = (cfgKey, mcpKeys) => {
    if (!(mcpKeys.length === 1 && mcpKeys[0] === cfgKey)) {
      return `server key mismatch: engine.config.json=${cfgKey} .mcp.json=${mcpKeys.join(',')}`;
    }
    return null;
  };
  assert.equal(check(config.mcp.serverKey, Object.keys(mcp.mcpServers)), null);
  assert.equal(check(fixtureKey, Object.keys(mcp.mcpServers)),
    'server key mismatch: engine.config.json=snow .mcp.json=servicenow');
});

test('the server is spawned the way ARC-04 built it', () => {
  const s = mcp.mcpServers[config.mcp.serverKey];
  assert.equal(s.type, 'stdio');
  assert.equal(s.command, 'node');
  assert.equal(s.args.length, 1);
  assert.ok(s.args[0].startsWith('${CLAUDE_PROJECT_DIR:-.}'), s.args[0]);
  // The path comes from the config too: `packageDir` is where ARC-04 puts the server.
  assert.ok(s.args[0].endsWith(`/${config.mcp.packageDir}/dist/server.js`), s.args[0]);
  // Forward slashes only — Node accepts them on Windows, and a backslash in JSON is an escape
  // waiting to be got wrong.
  assert.ok(!s.args[0].includes('\\'), 'the path uses backslashes');
  assert.equal(typeof s.timeout, 'number');
});

test('every placeholder has a default, so an unset variable is never passed literally', () => {
  // `${VAR}` without `:-` is passed through as the literal characters, which would hand the server
  // a path or a store location that is the text `${SNOW_STORE}`. Every one carries a default.
  const bad = strings(mcp)
    .flatMap(({ path, value }) => (value.match(/\$\{[^}]*\}/g) ?? []).map((p) => ({ path, p })))
    .filter(({ p }) => !/^\$\{[A-Z_][A-Z0-9_]*:-[^}]*\}$/.test(p));
  assert.deepEqual(bad.map(({ path, p }) => `${path}: ${p}`), []);
  // Not vacuous: there ARE placeholders to check.
  assert.ok(strings(mcp).some(({ value }) => value.includes('${')), 'no placeholder found at all');
});

test('S-20: the env block carries exactly the two variables the inherit verdict allows', () => {
  // S-20 CONFIRMED that the spawned server inherits the launching shell's environment, so proxy and
  // CA variables do not need repeating here. The story's other branch — listing them — applies only
  // to the "forward" verdict, which is not the one we got. The key set is asserted so the branch
  // cannot drift back in without someone changing this line.
  assert.deepEqual(Object.keys(mcp.mcpServers[config.mcp.serverKey].env).sort(),
    ['SNOW_LOG_LEVEL', 'SNOW_STORE']);
});

test('S-05: the committed settings.json is hook-free', () => {
  // A SessionStart hook in the committed file runs before Node is known to exist. It belongs in the
  // gitignored settings.local.json, written by the bootstrap once Node ≥ 20 is confirmed.
  assert.equal(settings.hooks, undefined, 'a hook is committed — it would run before Node is proven');
  assert.deepEqual(Object.keys(settings).sort(), ['env', 'permissions']);
});

test('settings.json carries no placeholder at all', () => {
  assert.deepEqual(strings(settings).filter(({ value }) => value.includes('${')), []);
});

test('S-06: MCP_TIMEOUT is the measured value, not a guess', () => {
  // 120 000 ms against a worst observed handshake of 750 ms (tools/list, 27 runs over 9 CI cells):
  // about 160× headroom. What S-06 did NOT establish is that this env block is the mechanism that
  // governs startup — that half is documentary, and ARC-06-S08's interactive run is where it lands.
  assert.equal(settings.env.MCP_TIMEOUT, '120000');
});

test('neither file has a credential-shaped key or a credential-shaped value', () => {
  for (const [name, obj] of [['.mcp.json', mcp], ['.claude/settings.json', settings]]) {
    const suspicious = keys(obj).filter((k) => /PASSWORD|SECRET|TOKEN|_KEY$/i.test(k));
    assert.deepEqual(suspicious, [], `${name} has a credential-shaped key`);
    const values = strings(obj).filter(({ value }) =>
      /^[0-9a-f]{32,}$/i.test(value) || /^Basic\s/.test(value) || /^Bearer\s/.test(value)
      || /^https?:\/\/[^/]*@/.test(value));
    assert.deepEqual(values.map((v) => v.path), [], `${name} has a credential-shaped value`);
  }
});

test('both files are tracked, and the local ones are not', () => {
  const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n');
  for (const f of ['.mcp.json', '.claude/settings.json']) {
    assert.ok(tracked.includes(f), `${f} is not committed — it must travel with the clone`);
  }
  // And the two that must never travel: one holds a machine's hook, the other its credentials.
  for (const f of ['.claude/settings.local.json', '.local/instances.json']) {
    const r = execFileSync('git', ['check-ignore', '-q', f], { cwd: root, stdio: 'pipe' , encoding: 'utf8'});
    assert.equal(r, '', `${f} is not gitignored`);
  }
});

test('LF only, and one trailing newline', () => {
  for (const [name, text] of [['.mcp.json', mcpText], ['.claude/settings.json', settingsText]]) {
    assert.ok(!text.includes('\r'), `${name} has CRLF`);
    assert.ok(text.endsWith('\n') && !text.endsWith('\n\n'), `${name}: trailing newline`);
  }
});

test('the generator rewrites permissions and leaves env alone', () => {
  // The one renderer that edits PART of a file it does not own. `env` is ARC-06's; if a regeneration
  // dropped it, the MCP timeout would silently return to the default on the next contract change.
  const dir = mkdtempSync(join(tmpdir(), 'snowarch-settings-'));
  try {
    mkdirSync(join(dir, '.claude'), { recursive: true });
    const seeded = { permissions: { allow: ['stale'], ask: [] }, env: { MCP_TIMEOUT: '1' }, custom: { keep: true } };
    writeFileSync(join(dir, '.claude/settings.json'), `${JSON.stringify(seeded, null, 2)}\n`);
    // Precondition: the file really does hold the keys whose survival is being tested.
    assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(dir, '.claude/settings.json'), 'utf8'))),
      ['permissions', 'env', 'custom']);

    // The real generator, against the real repository — then compare what it kept.
    const after = JSON.parse(read('.claude/settings.json'));
    assert.ok(after.permissions.allow.length > 100, 'permissions is generated from the contract');
    assert.deepEqual(after.env, { MCP_TIMEOUT: '120000' }, 'env did not survive generation');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
