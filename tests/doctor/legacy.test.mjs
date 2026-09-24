// ARC-08-S03 — E-23 and E-24 against a fixture HOME. Nothing here touches the real one.
//
// Two properties are asserted about every case, not just the interesting ones: the fixture file is
// BYTE-IDENTICAL after the run (a doctor that edited `~/.claude.json` would be editing Claude
// Code's own configuration), and no fixture credential or username reaches the output. The second
// is why the fixture's password is assembled rather than spelled: a test file that writes the word
// out becomes a hit in the repository's own credential sweep.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { backupFiles, countLegacyInstances, envSummary, isStaleEntry, legacyChecks, removalCommand,
  STALE, tildify } from '../../tools/snowarch/lib/doctor/checks/legacy.mjs';
import { staleBlock } from '../../tools/snowarch/lib/doctor/checks/index.mjs';
import { tempDir } from '../../tools/snowarch/tests/helpers/temp.mjs';
import { contextFor, greenTree, REAL_ROOT, runById, writeJson } from './helpers/tree.mjs';
// The fixture HOME moved to its own module at ARC-10-S01: `tests/migration-doc.test.mjs` asserts
// that the commands E-23 and E-24 print for THIS tree appear in `docs/MIGRATION.md`, and a second
// copy would let the page be checked against a tree these detectors never see.
import { fixtureHome, PASSWORD, SECRET_KEY, USERNAME } from './helpers/legacy-home.mjs';

const checks = legacyChecks();

const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

const run = (id, root, home, over = {}) => runById(checks, id,
  contextFor(root, { home, ...over }));

// AC 1 and AC 2 together: the finding, and the file unchanged.
test('E-23 names every stale entry, prints both removal commands and the .bak reminder', async (t) => {
  const root = greenTree(t);
  const home = fixtureHome(t, { root });
  const before = sha(join(home, '.claude.json'));

  const r = await run('E-23', root, home);
  assert.equal(r.status, 'warn');
  // `command` is gone (ARC-08, Sitting A D1): it duplicated the first removal onto a line BELOW the
  // "then review and delete …" reminder, so the reminder printed before the step it refers to.
  const text = `${r.textDetail}\n${r.remedy}`;
  assert.match(text, new RegExp(removalCommand(STALE.names[0]).replace(/[-]/g, '\\-')));
  assert.match(text, new RegExp(removalCommand(STALE.names[1]).replace(/[-]/g, '\\-')));
  assert.match(r.textDetail, /also registered under: \/old\/path/,
    'the TERMINAL still names the folder — it is where the user goes to run the command');
  assert.doesNotMatch(String(r.detail), /also registered under/,
    'the travelling detail must not name another project folder');
  // The REMINDER, counted by its own sentence rather than by the glob it contains — the line
  // names `.bak-*` twice on purpose (what to delete, and how to list it).
  assert.equal((text.match(/they retain the same secrets/g) ?? []).length, 1,
    'the .bak reminder appeared more than once');
  assert.match(r.detail, /1 ~\/\.claude\.json\.bak-\* file\(s\) present/);
  assert.match(r.detail, /stale registration\(s\) under \d+ other project folder\(s\)/,
    'the travelling detail carries counts and server names instead');

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

/**
 * ARC-08 / ARC-10-S10 (Sitting A D1) — the `--json` a stranger is asked to paste must not carry
 * the user's other project folders.
 *
 * The Install-problem issue template asks a reporter for `doctor --json`. On the owner's machine
 * that JSON named four of his OTHER project folders — engagement and client folders on a
 * consultant's laptop — nine times. `json-boundary.mjs` masks the HOME PREFIX, which is right for
 * this checkout's own path and useless here: `~/Documents/work/<client>` survives it, and the
 * client name is the whole of the secret.
 *
 * This is the refusal `tests/validation-records.test.mjs` already applies to records, pointed at
 * the JSON — the repository's own rule that a record nobody can publish is a record nobody writes.
 */
test('ARC-08 — E-23 puts no project folder in anything that travels', async (t) => {
  const root = greenTree(t);
  const home = fixtureHome(t, { root });
  const r = await run('E-23', root, home);

  // Everything `checkToJson` copies, plus `data`, which it copies wholesale.
  const travelling = JSON.stringify({ detail: r.detail, remedy: r.remedy, command: r.command,
    data: r.data });

  assert.doesNotMatch(travelling, /\/old\/path/, 'another project folder reached the JSON');
  assert.doesNotMatch(travelling, /"project"/, 'the entries still carry a project path field');
  // `~/.claude.json` and its `.bak-*` siblings are the SUBJECT of this check: a fixed filename
  // every user has, naming nobody. Any OTHER home-relative path is a folder somebody chose, and
  // that is what must not travel — so the refusal is written against those rather than against the
  // tilde, which would have forced the finding to stop naming the file it is about.
  const homePaths = String(travelling).match(/~\/[^"'\s,;)]*/g) ?? [];
  assert.deepEqual(homePaths.filter((h) => !h.startsWith('~/.claude.json')), [],
    'a user-chosen home-relative path reached the JSON');

  // And the finding survives: counts, server names, and the credential SHAPE, which is the half
  // that makes it urgent.
  assert.match(String(r.detail), /stale registration\(s\) under \d+ other project folder\(s\)/);
  assert.match(String(r.detail), /credential-shaped — set \(len \d+\)/);

  // Both directions: the TERMINAL still names the folder, because that is where the user goes.
  assert.match(String(r.textDetail), /\/old\/path/);
});

test('ARC-08-C34 — E-30 puts no project folder in anything that travels either', async (t) => {
  // THE SAME RULE, ASSERTED AT THE SAME LEVEL, for the new check. Written after a control caught the
  // gap: the E-30 case above asserted the folder was absent from `detail`, which is a STRING, while
  // `checkToJson` copies `data` wholesale — so planting `project` back into the entries changed
  // nothing any test could see, and the privacy rule held only for the half I had looked at.
  const root = greenTree(t);
  const r = await run('E-30', root, orphanHome(t, root, 'servicenow'));

  const travelling = JSON.stringify({ detail: r.detail, remedy: r.remedy, command: r.command,
    data: r.data });
  assert.doesNotMatch(travelling, /\/no\/such\/folder\/anywhere/,
    'the orphan folder reached the JSON');
  assert.doesNotMatch(travelling, /\/old\/path/, 'another project folder reached the JSON');
  assert.doesNotMatch(travelling, /"project"/, 'the entries still carry a project path field');
  const homePaths = String(travelling).match(/~\/[^"'\s,;)]*/g) ?? [];
  assert.deepEqual(homePaths.filter((h) => !h.startsWith('~/.claude.json')), [],
    'a user-chosen home-relative path reached the JSON');

  // ...and the finding still travels: counts and keys, which is what a maintainer reads.
  assert.match(String(r.detail), /\d+ registration\(s\) under \d+ folder\(s\) that no longer exist/);
  // Both directions, as E-23 does it: the TERMINAL names the folder, because that is where the
  // user goes to run the command.
  assert.match(String(r.textDetail), /\/no\/such\/folder\/anywhere/);
});

test('ARC-08 — one removal per DISTINCT server name, and the reminder comes last', async (t) => {
  const root = greenTree(t);
  const home = fixtureHome(t, { root });
  const r = await run('E-23', root, home);

  const lines = String(r.remedy).split('\n').map((l) => l.trim());
  const removals = lines.filter((l) => l.includes('mcp remove'));
  const names = new Set(removals.map((l) => l.split('mcp remove ')[1]?.split(' ')[0]));
  assert.equal(removals.length, names.size, 'a server name was offered a removal twice');
  assert.ok(names.size >= 2, 'both stale server names must get their own removal command');

  // Sitting A saw "then review and delete …" printed ABOVE the command it refers to, because the
  // only removal was on the renderer's separate `command` line.
  const reminder = lines.findIndex((l) => l.includes('then review and delete'));
  assert.ok(reminder > 0, 'the reminder is missing');
  assert.ok(removals.every((l) => lines.indexOf(l) < reminder),
    `"then …" must follow the steps it refers to:\n${lines.join('\n')}`);
});

// ─── ARC-08-C34 — E-30: a registration whose folder is gone ───────────────────────────────────
//
// Found during the ARC-10-S06 rehearsal (2026-09-24), in a COPIED home, on a real config. The copy
// carried six project-scope entries; one was `servicenow` — the product's OWN key — under a folder
// the owner had deleted. E-23 printed the four old-name entries and never mentioned it.
//
// That is E-23 behaving exactly as designed. `stale-registrations.json` says so itself: the current
// key is "deliberately absent, because an entry under that name is a registration this product
// made". Under an EXISTING folder that is right — it is another checkout of this product, and
// removing it would be this tool deleting a working install. Under a MISSING folder it is an
// orphan: nothing can start there, and `claude` keeps trying.
//
// So the question E-23 asks (is this key stale?) cannot reach the case, and the answer is a check
// that asks a different question — does the FOLDER exist? — about ANY key, because an entry
// pointing at a folder that is gone is dead whichever product wrote it. Reporting is not removing:
// the line names the key and the folder, and the user decides.
//
// SEPARATE, AND `quick: false`, deliberately. E-23 is `quick: true`, so it runs on the session-start
// path; this one stats every project folder in `~/.claude.json` (40 of them on the owner's machine),
// and a `stat` against a client folder on a network mount that is not up blocks for the mount's
// timeout. No check body in this product branches on `ctx.quick` — quick-ness is a DECLARATION the
// planner acts on — so the honest way to keep it off that path is a check that declares itself.

/** A fixture home carrying an entry under a folder that does not exist, under any key. */
const orphanHome = (t, root, key, project = '/no/such/folder/anywhere') => fixtureHome(t, {
  root,
  extra: { [project]: { mcpServers: { [key]: { command: 'node', args: [], env: {} } } } },
});

test('E-30 names a registration under a folder that no longer exists, under the product\'s own key', async (t) => {
  const root = greenTree(t);
  const key = 'servicenow';
  const home = orphanHome(t, root, key);
  const before = sha(join(home, '.claude.json'));

  const r = await run('E-30', root, home);
  assert.equal(r.status, 'warn', `E-30 did not report the orphan: ${r.status} ${r.detail}`);

  // THE CASE E-23 CANNOT SEE: the product's own key, which is never "stale".
  assert.equal(isStaleEntry(key, {}), false,
    'the fixture no longer uses a key E-23 would ignore — the test has stopped testing the gap');
  // BY EXACT ID, not by substring: `servicenow` is a prefix of `servicenow-mcp`, so
  // `.includes(key)` is true of a detail that names only the OLD key — an assertion that would
  // have "passed" the moment it stopped meaning anything. It failed here first, which is cheaper.
  const e23 = await run('E-23', root, home);
  assert.equal((e23.data?.entries ?? []).some((e) => e.name === key), false,
    'E-23 now names this entry, so this check is asserting a gap that has closed');

  // The TERMINAL names the folder, because that is where the user goes to run the command.
  assert.match(r.textDetail, /\/no\/such\/folder\/anywhere/,
    `the terminal line does not name the folder to re-create: ${r.textDetail}`);
  // ...and the travelling copy never does — ARC-08 / ARC-10-S10's ruling, reused unchanged.
  assert.equal(String(r.detail).includes('/no/such/folder/anywhere'), false,
    'the travelling detail names a project folder — a client name is the whole of the secret');
  // The SHAPE and this entry, not a total: the shared fixture also carries `/old/path`, which is
  // genuinely an orphan too, so a hard count here would be asserting the fixture's internals.
  assert.match(r.detail, /\d+ registration\(s\) under \d+ folder\(s\) that no longer exist/);
  assert.ok((r.data?.entries ?? []).some((e) => e.name === key),
    `the orphan under this product's own key is not in the travelling detail: ${r.detail}`);

  // THE PAGE OWNS THE RECIPE, and this line cites it. The `mkdir` half is deliberately NOT spelled
  // here: the sibling guard below forbids write vocabulary in the detector source, and it cannot
  // tell a string a user types from a call this code makes. So the check prints the removal — in
  // E-23's one spelling of it — and names the page section that carries the folder step.
  const shown = `${r.textDetail}\n${r.remedy}`;
  assert.match(shown, new RegExp(removalCommand(key).replace(/[-]/g, '\\-')),
    `the removal command is not printed: ${r.textDetail}`);
  assert.match(shown, /docs\/MIGRATION\.md/,
    `the folder step is neither printed nor cited: ${shown}`);
  assert.match(r.textDetail, /re-create it/,
    'the terminal line does not say the folder must exist for the command');

  // The file is Claude Code's own: a doctor that edited it would be the defect, not the fix.
  assert.equal(sha(join(home, '.claude.json')), before, 'E-30 modified ~/.claude.json');
});

test('E-30 reports ANY key, not only this product\'s', async (t) => {
  // An entry pointing at a folder that is gone is dead whichever product wrote it, and the owner's
  // 2026-09-24 ruling is about REMOVING other products' entries, not about naming them.
  const root = greenTree(t);
  const r = await run('E-30', root, orphanHome(t, root, 'context-mode'));
  assert.equal(r.status, 'warn');
  assert.match(r.detail, /context-mode/, `the key is not named in the travelling detail: ${r.detail}`);
});

test('E-30 is silent about a registration whose folder still exists', async (t) => {
  // The half that keeps this check honest: another checkout of this product is NOT an orphan, and
  // a check that warned about it would be telling a user to delete a working install.
  const root = greenTree(t);
  const other = tempDir('snowarch-live-checkout-', t);
  const home = fixtureHome(t, {
    root,
    extra: { [other]: { mcpServers: { servicenow: { command: 'node', args: [], env: {} } } } },
  });
  // NOT `status === 'ok'`: the shared fixture always carries `/old/path`, which is itself an
  // orphan and correctly reported. The property under test is narrower and is the one that
  // matters — the folder that EXISTS is not named, whatever else is.
  const r = await run('E-30', root, home);
  assert.equal(String(r.textDetail).includes(other), false,
    `E-30 called a live checkout an orphan: ${r.textDetail}`);
  assert.equal((r.data?.entries ?? []).some((e) => e.name === 'servicenow'), false,
    'the live checkout\'s registration reached the travelling detail');
});

test('E-30 is ok when ~/.claude.json has no projects at all, and never crashes on a bad one', async (t) => {
  const root = greenTree(t);
  const empty = tempDir('snowarch-home-empty-', t);
  writeFileSync(join(empty, '.claude.json'), '{}\n');
  assert.equal((await run('E-30', root, empty)).status, 'ok');

  // Malformed is E-23's own rule: the file is Claude Code's and a doctor must not be what breaks a
  // session over it.
  const broken = tempDir('snowarch-home-broken-', t);
  writeFileSync(join(broken, '.claude.json'), '{ half written');
  const r = await run('E-30', root, broken);
  assert.ok(['ok', 'warn', 'skip'].includes(r.status), `E-30 crashed on a malformed file: ${r.status}`);
});

// ─── ARC-08-C34, second half — the terminal-only detail never reached the terminal ─────────────
//
// The FINDING, and it is inherited rather than new. `report-text.mjs` reads
// `result.textDetail ?? result.detail`, and its comment says why: "E-23 needs to name the other
// project folders here, where the user goes and runs the command". That branch has never been
// taken on the real path. `doctor/index.mjs` builds `report` through `buildReport` — which copies
// `CHECK_KEYS`, a fixed list with no `textDetail` — and then renders the terminal FROM that report.
// So the JSON boundary's field list is applied before the terminal renderer, not only to the copy
// that travels, and E-23's Sitting A D1 property was dead from the day it was written.
//
// Measured on the real CLI, which is the level these cases now run at:
//
//   E-23  warn  …: 1 stale registration(s) under 1 other project folder(s): <old-name> · holds 0 env keys
//               → claude mcp remove <old-name> -s local        (run from that folder)
//
// (the dead name is redacted even here: L03 forbids spelling a retired name anywhere in the
// tree, comments included, which is why this file builds every such string from `STALE.names`)
//
// "that folder" — and no folder is named anywhere in the output. The sitting read that line as
// sufficient, and every test called the check function DIRECTLY, below the seam, which is exactly
// why they were green while the property was dead. Same shape as ARC-09-C56 and C9 and C52: the
// mechanism was proven and its only real caller was not.
//
// It matters most for E-30, whose entire value at the S06 sitting is the folder name: the owner
// cannot re-create a folder the doctor declines to name, and MIGRATION.md § 6 now says "the case
// E-30 reports".

/** A HOME on disk carrying both shapes: an orphan under any key, and an E-23 stale entry. */
function cliHome(t) {
  const home = tempDir('snowarch-cli-home-', t);
  writeFileSync(join(home, '.claude.json'), `${JSON.stringify({
    projects: {
      '/no/such/folder/anywhere': { mcpServers: { servicenow: { command: 'node', args: [], env: {} } } },
      '/old/gone/path': {
        mcpServers: { [STALE.names[1]]: { command: 'node', args: ['/old/snow-mcp/dist/server.js'], env: {} } },
      },
    },
  }, null, 2)}\n`);
  return home;
}

/** The real command, as a user runs it. */
const doctorCli = (home, args) => spawnSync(process.execPath,
  [join(REAL_ROOT, 'tools/snowarch/bin/snowarch.mjs'), 'doctor', ...args],
  { cwd: REAL_ROOT, encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home } });

test('ARC-08-C34 — the terminal names the folder, for E-30 AND E-23, where the user reads it', async (t) => {
  const home = cliHome(t);
  const r = doctorCli(home, ['--section', 'legacy', '--no-cache']);
  const out = `${r.stdout}${r.stderr}`;

  // E-30: the folder is the point. Without it the check reports a count.
  assert.match(out, /\/no\/such\/folder\/anywhere/,
    `the terminal does not name E-30's orphan folder:\n${out}`);
  assert.match(out, /claude mcp remove servicenow -s local/,
    `the terminal does not print E-30's removal command:\n${out}`);

  // E-23: the inherited half. Its own renderer comment promises this line.
  assert.match(out, /also registered under: \/old\/gone\/path/,
    `E-23 still says "that folder" without naming one:\n${out}`);
});

test('ARC-08-C34 — the same run\'s --json and cache still carry no folder', async (t) => {
  const home = cliHome(t);
  const root = tempDir('snowarch-cli-root-', t);
  const r = doctorCli(home, ['--section', 'legacy', '--json', '--no-cache']);
  const report = JSON.parse(r.stdout);
  const legacy = report.checks.filter((c) => ['E-23', 'E-30'].includes(c.id));
  assert.equal(legacy.length, 2, `both legacy checks should be in the report: ${r.stdout.slice(0, 400)}`);

  const travelling = JSON.stringify(legacy);
  assert.doesNotMatch(travelling, /\/no\/such\/folder\/anywhere/, 'the orphan folder reached --json');
  assert.doesNotMatch(travelling, /\/old\/gone\/path/, 'another project folder reached --json');
  assert.doesNotMatch(travelling, /"project"/, 'a project field reached --json');
  // ...and the terminal-only field itself must not become a travelling one while fixing this.
  assert.doesNotMatch(travelling, /"textDetail"/,
    'textDetail is now in the report a stranger pastes — it exists to stay out of it');
  assert.ok(root);
});
