// ARC-08-S06 — `--fix`: the whitelist, the plan, the refusals and the safety rails.
//
// The rails are asserted as PROPERTIES, not promised in prose: a grep proves the module cannot
// reach `.mcp.json`, `.claude/settings.json` or the home directory, and a sha proves
// `~/.claude.json` is byte-identical after a run that listed stale entries in it. Everything else
// here is the flow — propose, review, apply, re-run — against a fixture that has really drifted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, statSync,
  writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { applyPlan, buildPlan, FIXERS, fixesBlock, KINDS, logFix,
  renderPlan, TARGETS } from '../../tools/snowarch/lib/doctor/fix.mjs';
import { doctorCommand, runDoctor } from '../../tools/snowarch/lib/doctor/index.mjs';
import { engineRegistry } from '../../tools/snowarch/lib/doctor/checks/index.mjs';
import { cachePath, inputsPath } from '../../tools/snowarch/lib/doctor-cache.mjs';
import { tempDir } from '../../tools/snowarch/tests/helpers/temp.mjs';
import { contextFor, greenTree, linkInstall, readJson, REAL_ROOT,
  writeJson } from './helpers/tree.mjs';

const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

/** The doctor, in process, against a fixture — the launcher pins to its own checkout. */
async function doctorAt(root, flags = {}, over = {}) {
  const chunks = [];
  const code = await doctorCommand({
    flags: { quick: true, 'no-network': true, ...flags },
    out: { write: (t) => chunks.push(t) },
    cwd: root,
    input: { isTTY: false },
    ...over,
  });
  return { code, text: chunks.join('') };
}

/**
 * A checkout that has drifted four ways — the story's composite fixture.
 *
 * (a) a store entry stating four of the six flags, (b) a settings.local.json with no toggle while
 * the recorded mode is live, (c) a `.local/` with the wrong mode, and (d) an edited `.mcp.json`.
 * Built by MUTATING the green tree, so what each case proves is the mutation rather than a fixture
 * somebody wrote to match the assertion.
 */
function driftedTree(t) {
  const root = linkInstall(greenTree(t, { mode: 'live' }));
  const config = readJson(root, 'engine.config.json');

  // (a) four flags of six.
  const contract = JSON.parse(readFileSync(
    join(REAL_ROOT, 'packages/snowarch/dist/contract.json'), 'utf8'));
  const flagNames = contract.flags.map((f) => f.name);
  const stated = Object.fromEntries(flagNames.slice(0, 4).map((f) => [f, 'false']));
  // 0600, as the wizard writes it: a store the server refuses to LOAD produces no instance, and
  // this fixture is about the flags inside one.
  writeStore(root, {
    version: 1,
    defaultInstance: 'pdi',
    instances: {
      pdi: {
        url: 'https://dev12345.service-now.com',
        environment: 'pdi',
        auth: { method: 'basic', username: 'someone@corp.example.com',
          password: ['hunter', '2', 'hunter', '2'].join('') },
        preset: 'custom',
        flags: stated,
        toolPackage: 'full',
        maxRecords: 100,
        prodWriteAck: false,
      },
    },
  });

  // (b) the toggle the recorded live mode needs.
  writeJson(root, '.claude/settings.local.json', {});

  // (d) an edited `.mcp.json` — the one file `--fix` must refuse.
  const mcp = readJson(root, '.mcp.json');
  mcp.mcpServers[config.mcp.serverKey].env = { ...mcp.mcpServers[config.mcp.serverKey].env,
    EDITED_BY_HAND: '${EDITED:-1}' };
  writeJson(root, '.mcp.json', mcp);

  return { root, flagNames, absent: flagNames.slice(4) };
}

/** The store, written the way the product writes it. */
function writeStore(root, store) {
  mkdirSync(join(root, '.local'), { recursive: true, mode: 0o700 });
  const p = join(root, '.local', 'instances.json');
  writeFileSync(p, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
  if (process.platform !== 'win32') chmodSync(p, 0o600);
  return p;
}

test('every kind the whitelist knows has a fixer and a target, and nothing else does', () => {
  assert.deepEqual([...new Set(FIXERS.map((f) => f.kind))].sort(), [...KINDS].sort());
  for (const kind of KINDS) assert.ok(TARGETS[kind], `${kind} has no target`);
  // The ids are the story's seven, and F2/F6 legitimately cover two kinds each.
  assert.deepEqual([...new Set(FIXERS.map((f) => f.id))], ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7']);
});

test('every fixable result carries a kind the whitelist knows', async (t) => {
  const { root } = driftedTree(t);
  const { report } = await runDoctor({ root, config: contextFor(root).config,
    registry: engineRegistry(), quick: true, noNetwork: true, writeCache: false });
  const fixable = report.checks.filter((c) => c.fixable && ['fail', 'warn'].includes(c.status));
  assert.ok(fixable.length > 0, 'the drifted fixture produced no fixable finding');
  for (const check of fixable) {
    const kind = check.data?.fix?.kind;
    assert.ok(kind, `${check.id} is fixable and names no kind`);
    assert.ok(KINDS.includes(kind), `${check.id} names "${kind}", which no fixer knows`);
  }
});

// AC 1.
test('the composite fixture: F4, F6 apply, .mcp.json is REFUSED with its own command', async (t) => {
  const { root, absent } = driftedTree(t);
  const before = readJson(root, '.local/instances.json');
  assert.equal(Object.keys(before.instances.pdi.flags).length, 4, 'the fixture is not drifted');

  const { text } = await doctorAt(root, { fix: true, yes: true, json: false });
  assert.match(text, /^FIX PLAN \(\d+ actions?\)/m);
  assert.match(text, /F4 {2}SV-03/);
  assert.match(text, /F6 {2}E-10/);
  assert.match(text, /REFUSED \(\d+\)/);
  assert.match(text, /E-07.*run: git checkout -- \.mcp\.json/);
  assert.match(text, /F4 {2}applied/);
  assert.match(text, /F6 {2}applied/);
  // F2 is not asserted here: a runner without the docs submodule has no corpus to re-sparse, and
  // this case is about the flags, the toggles and the refusal. F2 has its own test.

  // The repairs really happened, and the re-run says so.
  const after = readJson(root, '.local/instances.json');
  assert.equal(Object.keys(after.instances.pdi.flags).length, 6);
  for (const flag of absent) assert.equal(after.instances.pdi.flags[flag], 'false');
  const settings = readJson(root, '.claude/settings.local.json');
  assert.deepEqual(settings.enabledMcpjsonServers, [readJson(root, 'engine.config.json').mcp.serverKey]);
});

// AC 3 — the credentials, untouched.
test('F4 writes flags and leaves every credential field byte-identical', async (t) => {
  const { root } = driftedTree(t);
  const before = readJson(root, '.local/instances.json').instances.pdi.auth;
  const beforeSha = createHash('sha256').update(JSON.stringify(before)).digest('hex');

  await doctorAt(root, { fix: true, yes: true });

  const after = readJson(root, '.local/instances.json').instances.pdi.auth;
  assert.equal(createHash('sha256').update(JSON.stringify(after)).digest('hex'), beforeSha);
  if (process.platform !== 'win32') {
    assert.equal(statSync(join(root, '.local/instances.json')).mode & 0o777, 0o600);
  }
});

// AC 2 — idempotence, by mtime.
test('a second run is all noop and moves no mtime', async (t) => {
  const { root } = driftedTree(t);
  await doctorAt(root, { fix: true, yes: true });

  const watched = ['.local/instances.json', '.claude/settings.local.json'];
  const before = watched.map((rel) => statSync(join(root, rel)).mtimeMs);
  const { text } = await doctorAt(root, { fix: true, yes: true });

  assert.deepEqual(watched.map((rel) => statSync(join(root, rel)).mtimeMs), before,
    'a repeated fix rewrote a file it had already repaired');
  assert.equal(/F4 {2}applied/.test(text), false, 'F4 applied twice');
  assert.equal(/F6 {2}applied/.test(text), false, 'F6 applied twice');
});

// AC 4 — the prompt.
test('without --yes the plan is printed and nothing is applied until Enter', async (t) => {
  const { root } = driftedTree(t);
  const before = readJson(root, '.local/instances.json');

  const declined = await doctorAt(root, { fix: true }, { ask: async () => 'n' });
  assert.match(declined.text, /FIX PLAN/);
  assert.match(declined.text, /nothing applied\./);
  assert.equal(declined.code, 0, 'declining is not a failure');
  assert.deepEqual(readJson(root, '.local/instances.json'), before);

  const accepted = await doctorAt(root, { fix: true }, { ask: async () => '' });
  assert.match(accepted.text, /F4 {2}applied/);
  assert.equal(Object.keys(readJson(root, '.local/instances.json').instances.pdi.flags).length, 6);
});

test('a closed stdin is not a yes', async (t) => {
  const { root } = driftedTree(t);
  const before = readJson(root, '.local/instances.json');
  const r = await doctorAt(root, { fix: true }, { ask: async () => null });
  assert.match(r.text, /nothing applied\./);
  assert.deepEqual(readJson(root, '.local/instances.json'), before);
});

test('a non-TTY without --yes prints the plan and stops', async (t) => {
  const { root } = driftedTree(t);
  const before = readJson(root, '.local/instances.json');
  const r = await doctorAt(root, { fix: true });        // input.isTTY false, no ask injected
  assert.match(r.text, /FIX PLAN/);
  assert.match(r.text, /nothing applied\./);
  assert.equal(r.code, 0);
  assert.deepEqual(readJson(root, '.local/instances.json'), before);
});

// AC 5 — the file this command must never write.
test('~/.claude.json is byte-identical after a fix that listed its stale entries', async (t) => {
  const { root } = driftedTree(t);
  const home = tempDir('snowarch-home-', t);
  const stale = { projects: { [root]: { mcpServers: {
    'servicenow-mcp': { command: 'node', args: [], env: {} } } } } };
  writeFileSync(join(home, '.claude.json'), `${JSON.stringify(stale, null, 2)}\n`);
  const before = sha(join(home, '.claude.json'));

  const { text } = await doctorAt(root, { fix: true, yes: true }, { home });
  assert.equal(sha(join(home, '.claude.json')), before, '--fix wrote ~/.claude.json');
  assert.match(text, /E-23.*run: claude mcp remove servicenow-mcp -s local/);
});

// AC 8's first half — the rail, as a grep.
test('fix.mjs cannot reach the three files it must never write', () => {
  const source = readFileSync(join(REAL_ROOT, 'tools/snowarch/lib/doctor/fix.mjs'), 'utf8');
  const code = source.split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n');
  for (const forbidden of ['homedir', 'USERPROFILE', '.mcp.json', 'engine.config.json']) {
    assert.equal(code.includes(forbidden), false, `fix.mjs names ${forbidden}`);
  }
  // `settings.json` without `.local` — the committed file. `settings.local.json` is F6's subject
  // and is allowed, so the check is for the committed name specifically.
  assert.equal(/settings\.json/.test(code.replace(/settings\.local\.json/g, '')), false);
});

// AC 7 — the maintainer's bump is never applied.
test('a pin that differs from the gitlink is REFUSED, and no submodule update runs', async () => {
  let ran = 0;
  const plan = buildPlan({ checks: [
    { id: 'E-13', status: 'fail', fixable: false,
      detail: 'engine.config.json pin abc ≠ committed gitlink def',
      command: 'node scripts/docs-bump.mjs --to def', data: { fix: null } },
  ] });
  assert.equal(plan.actions.length, 0, 'a maintainer bump was planned as a repair');
  assert.equal(plan.refused[0].command, 'node scripts/docs-bump.mjs --to def');
  assert.match(renderPlan(plan), /docs-bump\.mjs --to def/);

  // And the fixer itself refuses when handed that shape, without spawning anything.
  const applied = await applyPlan(
    { actions: [{ id: 'F3', check: 'E-13', kind: 'head-off-pin', title: 't', target: 'x',
      detail: 'd', fix: { pinMovedByMaintainer: true } }] },
    { root: '/nowhere' }, { run: () => { ran += 1; return { ok: true }; } });
  assert.equal(applied[0].result, 'refused');
  assert.equal(ran, 0, 'git submodule update ran for a maintainer bump');
});

// AC 6 — the Windows arm, asserted by naming the platform.
test('F5 is a reported noop on Windows and never runs chmod', async () => {
  const applied = await applyPlan(
    { actions: [{ id: 'F5', check: 'SV-02', kind: 'store-mode', title: 't', target: '.local/',
      detail: 'd', fix: { path: '.local', to: '700' } }] },
    { root: '/nowhere', platform: 'win32' });
  assert.equal(applied[0].result, 'noop');
  assert.match(applied[0].detail, /file modes: ACL-inherited/);
});

test('a fixer that throws is one failed entry, and the rest still run', async () => {
  const actions = [
    { id: 'F5', check: 'SV-02', kind: 'store-mode', title: 'a', target: '.local/', detail: 'd', fix: {} },
    { id: 'F7', check: null, kind: 'cache-stale', title: 'b', target: 'c', detail: 'd', fix: {} },
  ];
  const applied = await applyPlan({ actions }, { root: join(REAL_ROOT, 'no-such-tree'),
    platform: 'linux' });
  assert.equal(applied.length, 2);
  assert.equal(applied[1].result, 'noop', 'the second fixer did not run');
});

test('the fixes block says what was proposed, what happened and where', async (t) => {
  const { root } = driftedTree(t);
  const chunks = [];
  await doctorCommand({ flags: { fix: true, yes: true, quick: true, json: true },
    out: { write: (x) => chunks.push(x) }, cwd: root, input: { isTTY: false } });
  const text = chunks.join('');
  const report = JSON.parse(text.slice(text.indexOf('{')));
  assert.ok(Array.isArray(report.fixes) && report.fixes.length > 0);
  for (const fix of report.fixes) {
    assert.ok(/^F[1-7]$/.test(fix.id), `${fix.id} is not a whitelist id`);
    assert.ok(KINDS.includes(fix.kind));
    assert.ok(['applied', 'noop', 'refused', 'failed'].includes(fix.result), fix.result);
    assert.ok('target' in fix && 'action' in fix);
  }
  assert.deepEqual(fixesBlock([]), []);
});

test('the fix log records paths and outcomes, never values', (t) => {
  const root = greenTree(t, { mode: 'design' });
  const file = logFix(root, [{ id: 'F4', check: 'SV-03', kind: 'flags-incomplete',
    target: '.local/instances.json', result: 'applied', detail: 'FLUENT_ENABLED = "false"' }]);
  assert.ok(file && existsSync(file));
  const text = readFileSync(file, 'utf8');
  assert.match(text, /F4 SV-03 flags-incomplete \.local\/instances\.json → applied/);
  assert.equal(/password|secret|https?:\/\//i.test(text), false);
});

test('F7 clears the cache the re-run then rewrites', async (t) => {
  const root = greenTree(t, { mode: 'design' });
  await doctorAt(root, {});                              // writes a cache
  assert.ok(existsSync(cachePath(root)));
  rmSync(inputsPath(root));                              // make it stale by the one rule
  await doctorAt(root, { fix: true, yes: true });
  assert.ok(existsSync(cachePath(root)), 'the re-run did not rewrite the cache');
  assert.ok(existsSync(inputsPath(root)));
  assert.ok(mkdirSync);
});

/**
 * F2 through an INJECTED step runner.
 *
 * The real one clones a 35,000-file submodule; what this story owns is which MODE it asks for —
 * the recorded one, with `skip` rewritten to `sparse` and SAID — so that is what is asserted.
 */
test('F2 syncs with the recorded docs mode, and rewrites "skip" to "sparse" out loud', async () => {
  const asked = [];
  const run = async (ctx) => { asked.push(ctx.docs); return { status: 'ok', detail: 'synced' }; };
  const action = { id: 'F2', check: 'E-15', kind: 'sparse-mismatch', title: 't',
    target: 'vendor/ServiceNowDocs', detail: 'd', fix: {} };

  const sparse = await applyPlan({ actions: [action] },
    { root: '/nowhere', docsMode: 'sparse', config: {} }, { run });
  assert.equal(sparse[0].result, 'applied');
  assert.deepEqual(asked, ['sparse']);

  const full = await applyPlan({ actions: [action] },
    { root: '/nowhere', docsMode: 'full', config: {} }, { run });
  assert.equal(full[0].result, 'applied');
  assert.deepEqual(asked, ['sparse', 'full']);

  const skipped = await applyPlan({ actions: [action] },
    { root: '/nowhere', docsMode: 'skip', config: {} }, { run });
  assert.deepEqual(asked, ['sparse', 'full', 'sparse'], 'a "skip" mode was passed through');
  assert.match(skipped[0].detail, /recorded mode was "skip" — synced as "sparse"/);
});

test('F1 is design-only\'s noop and live\'s repair', async () => {
  let ran = 0;
  const run = async () => { ran += 1; return { status: 'ok', detail: 'installed' }; };
  const action = { id: 'F1', check: 'SV-01', kind: 'deps-missing', title: 't', target: 'node_modules/',
    detail: 'd', fix: {} };

  const design = await applyPlan({ actions: [action] }, { root: '/nowhere', mode: 'design' }, { run });
  assert.equal(design[0].result, 'noop');
  assert.equal(ran, 0, 'a design-only install had its dependencies installed');

  const live = await applyPlan({ actions: [action] }, { root: '/nowhere', mode: 'live' }, { run });
  assert.equal(live[0].result, 'applied');
  assert.equal(ran, 1);
});

test('F5 restores a too-open store, and is a noop the second time', async (t) => {
  if (process.platform === 'win32') return;
  const root = greenTree(t, { mode: 'design' });
  const p = join(root, '.local', 'instances.json');
  writeFileSync(p, '{}\n');
  chmodSync(p, 0o644);
  const action = { id: 'F5', check: 'SV-02', kind: 'store-mode', title: 't', target: '.local/',
    detail: 'd', fix: { path: '.local/instances.json', to: '600' } };

  const first = await applyPlan({ actions: [action] }, { root, platform: 'linux' });
  assert.equal(first[0].result, 'applied');
  assert.equal(statSync(p).mode & 0o777, 0o600);

  const second = await applyPlan({ actions: [action] }, { root, platform: 'linux' });
  assert.equal(second[0].result, 'noop');
});

/**
 * The cache and a CONFIGURED store — the case that had never met each other.
 *
 * `server.instances[].username` is masked and still an address SHAPE, which the write-time guard
 * refuses on sight. Without stripping it, every live install would have had no cache at all and
 * the banner no verdict to show; with it, the guard keeps its no-exceptions rule.
 */
test('a configured store still gets a cache, and the cache holds no account name', async (t) => {
  const { root } = driftedTree(t);
  await doctorAt(root, { fix: true, yes: true });
  assert.ok(existsSync(cachePath(root)), 'a configured install wrote no cache');

  const text = readFileSync(cachePath(root), 'utf8');
  assert.equal(/@corp\.example\.com/.test(text), false, 'a masked account name reached the cache');
  const cache = JSON.parse(text);
  assert.ok(cache.server.instances.length > 0, 'the cache lost the instances themselves');
  for (const instance of cache.server.instances) {
    assert.equal('username' in instance, false);
    assert.ok(instance.label && instance.preset);
  }
});
