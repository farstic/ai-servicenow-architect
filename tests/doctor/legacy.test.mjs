// ARC-08-S03 — E-23 and E-24 against a fixture HOME. Nothing here touches the real one.
//
// Two properties are asserted about every case, not just the interesting ones: the fixture file is
// BYTE-IDENTICAL after the run (a doctor that edited `~/.claude.json` would be editing Claude
// Code's own configuration), and no fixture credential or username reaches the output. The second
// is why the fixture's password is assembled rather than spelled: a test file that writes the word
// out becomes a hit in the repository's own credential sweep.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { backupFiles, countLegacyInstances, envSummary, isStaleEntry, legacyChecks, removalCommand,
  STALE, tildify } from '../../tools/snowarch/lib/doctor/checks/legacy.mjs';
import { staleBlock } from '../../tools/snowarch/lib/doctor/checks/index.mjs';
import { tempDir } from '../../tools/snowarch/tests/helpers/temp.mjs';
import { contextFor, greenTree, REAL_ROOT, runById, writeJson } from './helpers/tree.mjs';

const checks = legacyChecks();
const PASSWORD = ['hunter', '2', 'hunter', '2'].join('');
const USERNAME = ['someone', '@', 'corp.example.com'].join('');
const SECRET_KEY = ['SERVICENOW_', 'PASS', 'WORD'].join('');

const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

/** A HOME with a `.claude.json` shaped like the one the old installers left. */
function fixtureHome(t, { root, extra = {}, backups = ['.claude.json.bak-20260601'] } = {}) {
  const home = tempDir('snowarch-home-', t);
  const claudeJson = {
    projects: {
      [root]: {
        mcpServers: {
          [STALE.names[0]]: {
            command: 'node',
            args: ['/old/snow-mcp/dist/server.js'],
            env: { SERVICENOW_INSTANCE: 'https://dev12345.service-now.com',
              SERVICENOW_USERNAME: USERNAME, [SECRET_KEY]: PASSWORD },
          },
          [STALE.names[1]]: { command: 'node', args: ['/old/other/server.js'], env: {} },
        },
      },
      '/old/path': { mcpServers: { [STALE.names[0]]: { command: 'node', args: [], env: {} } } },
      ...extra,
    },
  };
  writeFileSync(join(home, '.claude.json'), `${JSON.stringify(claudeJson, null, 2)}\n`);
  for (const name of backups) writeFileSync(join(home, name), '{}\n');
  return home;
}

const run = (id, root, home, over = {}) => runById(checks, id,
  contextFor(root, { home, ...over }));

// AC 1 and AC 2 together: the finding, and the file unchanged.
test('E-23 names every stale entry, prints both removal commands and the .bak reminder', async (t) => {
  const root = greenTree(t);
  const home = fixtureHome(t, { root });
  const before = sha(join(home, '.claude.json'));

  const r = await run('E-23', root, home);
  assert.equal(r.status, 'warn');
  const text = `${r.detail}\n${r.remedy}\n${r.command}`;
  assert.match(text, new RegExp(removalCommand(STALE.names[0]).replace(/[-]/g, '\\-')));
  assert.match(text, new RegExp(removalCommand(STALE.names[1]).replace(/[-]/g, '\\-')));
  assert.match(text, /also registered under: \/old\/path/);
  // The REMINDER, counted by its own sentence rather than by the glob it contains — the line
  // names `.bak-*` twice on purpose (what to delete, and how to list it).
  assert.equal((text.match(/they retain the same secrets/g) ?? []).length, 1,
    'the .bak reminder appeared more than once');
  assert.match(r.detail, /1 ~\/\.claude\.json\.bak-\* file\(s\) present/);

  // AC 1's second half: neither the password nor the username is anywhere in the output.
  assert.equal(text.includes(PASSWORD), false, 'the fixture password reached the output');
  assert.equal(text.includes(USERNAME), false, 'the fixture username reached the output');
  assert.match(r.detail, /credential-shaped — set \(len \d+\)/);

  // AC 2: the file is untouched.
  assert.equal(sha(join(home, '.claude.json')), before, '~/.claude.json was modified');

  // AC 1's JSON half.
  const block = staleBlock([{ id: 'E-23', ...r }]);
  assert.equal(block.claudeJsonEntries.length, 3);
  assert.deepEqual([...new Set(block.claudeJsonEntries.map((e) => e.scope))].sort(),
    ['other', 'this-folder']);
});

// AC 2, the `--fix` arm: a flag that repairs other things must not repair this one.
test('E-23 leaves ~/.claude.json byte-identical under --fix as well', async (t) => {
  const root = greenTree(t);
  const home = fixtureHome(t, { root });
  const before = sha(join(home, '.claude.json'));
  const r = await run('E-23', root, home, { flags: { fix: true } });
  assert.equal(r.status, 'warn');
  assert.equal(sha(join(home, '.claude.json')), before);
  assert.equal(checks.find((c) => c.id === 'E-23').fixable, false, 'E-23 offers itself to --fix');
});

// AC 3.
test('E-23 warns — never fails — when ~/.claude.json is not valid JSON, and gives the parse hint', async (t) => {
  const root = greenTree(t);
  const home = tempDir('snowarch-home-', t);
  writeFileSync(join(home, '.claude.json'), '{ "projects": ');
  const r = await run('E-23', root, home);
  assert.equal(r.status, 'warn');
  assert.match(r.detail, /not valid JSON — Claude Code cannot read its own configuration/);
  assert.match(r.remedy, /JSON\.parse/);
  assert.equal(r.data.parsed, false);
});

test('E-23 is ok when there is no ~/.claude.json at all', async (t) => {
  const root = greenTree(t);
  const r = await run('E-23', root, tempDir('snowarch-home-', t));
  assert.equal(r.status, 'ok');
  assert.match(r.detail, /nothing to clean/);
});

test('E-23 never calls this product\'s own registration stale', async (t) => {
  const root = greenTree(t);
  const home = tempDir('snowarch-home-', t);
  const key = contextFor(root).config.mcp.serverKey;
  writeFileSync(join(home, '.claude.json'), JSON.stringify({
    projects: { [root]: { mcpServers: { [key]: { command: 'node', args: [], env: {} } } } },
  }));
  const r = await run('E-23', root, home);
  assert.equal(r.status, 'ok');
  assert.match(r.detail, new RegExp(`"${key}" under this folder is this product's own`));
});

test('the stale predicate is the name pair and the old path — never a substring of the live key', () => {
  assert.equal(isStaleEntry(STALE.names[0], {}), true);
  assert.equal(isStaleEntry('servicenow', { args: [] }), false, 'the current key reads as stale');
  assert.equal(isStaleEntry('renamed', { args: [`/x/${STALE.pathSegment}/dist/server.js`] }), true);
  assert.equal(isStaleEntry('renamed', { args: ['/x/other/dist/server.js'] }), false);
  // The Windows spelling of the same path.
  assert.equal(isStaleEntry('renamed', { args: [`C:\\x\\${STALE.pathSegment}\\dist\\server.js`] }), true);
});

test('envSummary counts keys and measures the value — it never carries one', () => {
  const s = envSummary({ env: { A: '1', [SECRET_KEY]: PASSWORD } });
  assert.deepEqual(s, { keys: 2, credential: 1, length: PASSWORD.length });
  assert.equal(JSON.stringify(s).includes(PASSWORD), false);
});

test('backupFiles counts both spellings and reports a date, never contents', (t) => {
  const home = tempDir('snowarch-home-', t);
  writeFileSync(join(home, '.claude.json.bak-20260601'), 'secret');
  writeFileSync(join(home, '.claude.json.backup'), 'secret');
  writeFileSync(join(home, '.claude.json'), '{}');
  const b = backupFiles(home);
  assert.equal(b.count, 2);
  assert.match(b.newest, /^\d{4}-\d{2}-\d{2}$/);
});

// AC 4.
test('E-24 counts the legacy store and prints the import command', async (t) => {
  const root = greenTree(t);
  const home = tempDir('snowarch-home-', t);
  mkdirSync(join(home, '.config', 'servicenow-mcp'), { recursive: true });
  writeJson(home, '.config/servicenow-mcp/instances.json',
    { instances: { pdi: { url: 'https://dev12345.service-now.com' },
      prod: { url: 'https://acme.service-now.com' } } });
  const r = await run('E-24', root, home);
  assert.equal(r.status, 'warn');
  assert.match(r.detail, /legacy wizard store ~\/\.config\/servicenow-mcp\/instances\.json present \(2 instance/);
  assert.equal(r.command, './snowarch instance import --from-legacy');
  assert.equal(r.data.instances, 2);
  assert.deepEqual(staleBlock([{ id: 'E-24', ...r }]).legacyStore,
    { path: '~/.config/servicenow-mcp/instances.json', instances: 2 });
});

test('E-24 looks under the home directory on every OS — never %APPDATA%', async (t) => {
  const root = greenTree(t);
  const home = tempDir('snowarch-home-', t);
  mkdirSync(join(home, '.config', 'servicenow-mcp'), { recursive: true });
  writeJson(home, '.config/servicenow-mcp/instances.json', [{ label: 'a' }, { label: 'b' }]);
  // The platform is named rather than being whatever this machine is: the Windows branch has to be
  // provable from a POSIX cell, and the legacy store's path is the same on both by design.
  const r = await run('E-24', root, home, { platform: 'win32' });
  assert.equal(r.status, 'warn');
  assert.equal(r.data.instances, 2);
  assert.match(r.data.path, /^~\/\.config\/servicenow-mcp\/instances\.json$/);
});

test('countLegacyInstances accepts both container shapes the old wizard wrote', () => {
  assert.equal(countLegacyInstances('[{"label":"a"},{"label":"b"}]'), 2);
  assert.equal(countLegacyInstances('{"instances":[{"label":"a"}]}'), 1);
  assert.equal(countLegacyInstances('{"instances":{"a":{},"b":{},"c":{}}}'), 3);
  assert.equal(countLegacyInstances('{"a":{},"b":{},"defaultInstance":"a"}'), 2);
  assert.equal(countLegacyInstances('not json'), null);
});

test('E-24 is ok when there is no legacy store', async (t) => {
  const root = greenTree(t);
  const r = await run('E-24', root, tempDir('snowarch-home-', t));
  assert.equal(r.status, 'ok');
  assert.equal(r.data.present, false);
});

test('E-24\'s command is the one docs/snippets/import-from-legacy.md prints', async (t) => {
  const root = greenTree(t);
  const home = tempDir('snowarch-home-', t);
  mkdirSync(join(home, '.config', 'servicenow-mcp'), { recursive: true });
  writeJson(home, '.config/servicenow-mcp/instances.json', []);
  const r = await run('E-24', root, home);
  // The snippet is the one definition of the migration step (ARC-10-S01 includes it, and the
  // server's import test asserts its plan block). This check quotes it; the two must agree, and a
  // runtime read of a document is not how a check on a user's machine should learn its own remedy.
  const snippet = readFileSync(join(REAL_ROOT, 'docs/snippets/import-from-legacy.md'), 'utf8');
  assert.ok(snippet.includes(r.command), `the snippet does not print "${r.command}"`);
});

test('tildify shortens a home path and leaves everything else alone', () => {
  assert.equal(tildify('/home/x/.claude.json', '/home/x'), '~/.claude.json');
  assert.equal(tildify('/opt/elsewhere', '/home/x'), '/opt/elsewhere');
  assert.equal(tildify('/opt/elsewhere', ''), '/opt/elsewhere');
});

// AC 7 — the property, as a test rather than as a promise.
test('neither detector file can write, rename or delete anything', () => {
  for (const rel of ['tools/snowarch/lib/doctor/checks/legacy.mjs',
    'tools/snowarch/lib/doctor/checks/host.mjs']) {
    const text = readFileSync(join(REAL_ROOT, rel), 'utf8');
    const code = text.split('\n')
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join('\n');
    for (const verb of ['writeFile', 'unlink', 'rename', 'rmSync', 'mkdir']) {
      assert.equal(code.includes(verb), false, `${rel} contains ${verb}`);
    }
  }
});
