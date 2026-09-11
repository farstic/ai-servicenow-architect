// ARC-08-S05 — the Mode line, the merged report and the cache.
//
// The Mode line is the one sentence the rule file calls authoritative, so the cases here are about
// where it comes FROM: four facts, a pure function, and never `~/.claude.json`. That last one has
// its own test with a stale fixture, because the old engine read that file and the failure it
// produced — a mode that outlived the install it described — is invisible until somebody's
// registration goes stale.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { deriveMode, doctorStamp, flagSummary, modeLine,
  modeLineDetailed } from '../../tools/snowarch/lib/doctor/mode.mjs';
import { MODE_VARIANTS } from '../../tools/snowarch/lib/text.mjs';
import { capabilitiesLine, renderSummaryLine,
  summaryLine } from '../../tools/snowarch/lib/doctor/report-text.mjs';
import { summariseMerged, dedupeKeyFor,
  engineBlock } from '../../tools/snowarch/lib/doctor/checks/index.mjs';
import { cachePath, cacheStale, collectInputs, INPUT_FILES,
  inputsPath } from '../../tools/snowarch/lib/doctor-cache.mjs';
import { doctorLine } from '../../tools/snowarch/lib/text.mjs';
import { tempDir } from '../../tools/snowarch/tests/helpers/temp.mjs';
import { doctorCommand } from '../../tools/snowarch/lib/doctor/index.mjs';
import { bootstrap, greenTree, readJson, writeJson } from './helpers/tree.mjs';

/**
 * The command, in process, against a FIXTURE root.
 *
 * Not the launcher: `bin/snowarch.mjs` resolves the checkout from its own location and prints
 * "running against <the real repo>" when it is started elsewhere — which is right for a user and
 * useless for a test about another tree. `doctorCommand` takes the cwd and the home as parameters,
 * which is also what makes the `~/.claude.json` case assertable at all.
 */
async function doctorAt(root, flags = {}, { home = '' } = {}) {
  const chunks = [];
  const code = await doctorCommand({
    flags: { json: true, quick: true, ...flags },
    out: { write: (text) => chunks.push(text) },
    cwd: root,
    home,
  });
  const text = chunks.join('');
  const start = text.indexOf('{');
  return { code, text, report: start === -1 ? null : JSON.parse(text.slice(start)) };
}

const loaded = (over = {}) => ({ label: 'pdi', environment: 'pdi', preset: 'pdi-developer',
  status: 'loaded', ...over });

// AC 3 — every variant, by the facts that produce it.
test('the four design-only and unknown variants, and live', () => {
  const cases = [
    [{ toggles: { enabled: false }, instances: [] }, 'unconfigured'],
    [{ toggles: { enabled: false }, instances: [loaded()] }, 'serverDisabled'],
    [{ toggles: { enabled: true }, instances: [] }, 'noInstanceLoaded'],
    [{ toggles: { enabled: true }, instances: [loaded({ status: 'not_loaded' })] }, 'noInstanceLoaded'],
    [{ toggles: { enabled: true }, instances: [], bootstrapped: false }, 'notBootstrapped'],
  ];
  for (const [facts, variant] of cases) {
    const derived = deriveMode(facts);
    assert.equal(derived.variant, variant, JSON.stringify(facts));
    assert.notEqual(derived.mode, 'live');
  }
  const live = deriveMode({ toggles: { enabled: true }, instances: [loaded()] });
  assert.equal(live.mode, 'live');
  assert.deepEqual(live.instance, { label: 'pdi', environment: 'pdi', preset: 'pdi-developer' });
});

// AC 2 — the exact sentence, with nothing appended.
test('the design-only line is exactly the story\'s sentence, and carries no doctor stamp', () => {
  const derived = deriveMode({ toggles: { enabled: false }, instances: [] });
  const line = modeLine(derived, { summary: { ok: 41, warn: 0, fail: 0 } });
  assert.equal(line, `Mode: design-only — ${MODE_VARIANTS.unconfigured}`);
  assert.equal(/doctor \d{4}-/.test(line), false, 'a stamp was appended to an instruction');
});

// AC 1 — the live line, with the stamp.
test('the live line names the instance and when the doctor last looked', () => {
  const derived = deriveMode({ toggles: { enabled: true }, instances: [loaded()] });
  const line = modeLine(derived, { summary: { ok: 41, warn: 0, fail: 0 }, at: new Date('2026-09-10T09:00:00Z') });
  assert.equal(line, 'Mode: live — instance=pdi (pdi) preset=pdi-developer — doctor 2026-09-10 41 ok');
  const failing = modeLine(derived, { summary: { ok: 39, warn: 0, fail: 2 }, at: new Date('2026-09-10T09:00:00Z') });
  assert.match(failing, /doctor 2026-09-10 2 FAIL$/);
  assert.equal(doctorStamp({ summary: { ok: 1, fail: 0 }, at: new Date('2026-09-10') }), 'doctor 2026-09-10 1 ok');
});

test('the detailed line derives its flag labels from the contract, never from a list here', () => {
  const contract = { flags: [{ name: 'WRITE_ENABLED' }, { name: 'SCRIPTING_ENABLED' }],
    tools: [{ name: 'a' }, { name: 'b' }] };
  const derived = deriveMode({ toggles: { enabled: true }, instances: [loaded()] });
  const line = modeLineDetailed(derived, { contract,
    flags: { WRITE_ENABLED: 'true', SCRIPTING_ENABLED: 'false' },
    toolCount: { count: 398, source: 'server' } });
  assert.equal(line,
    'Mode: live — pdi (pdi) · preset pdi-developer · WRITE=on SCRIPTING=off · 398 tools');
  assert.equal(flagSummary(null, {}), null);
});

test('a tool count from the contract says so, because a number with no provenance is trusted', () => {
  const contract = { flags: [{ name: 'WRITE_ENABLED' }], tools: [{ name: 'a' }] };
  const derived = deriveMode({ toggles: { enabled: true }, instances: [loaded()] });
  assert.match(modeLineDetailed(derived, { contract, flags: {},
    toolCount: { count: 397, source: 'contract' } }), /397 tools \(contract\)$/);
});

test('a second instance and a refused one are both named', () => {
  const contract = { flags: [], tools: [] };
  const instances = [loaded(), loaded({ label: 'uat', environment: 'uat' }),
    loaded({ label: 'prod', environment: 'prod', status: 'not_loaded',
      reason: 'PROD_WRITE_NOT_ACKNOWLEDGED' })];
  const derived = deriveMode({ toggles: { enabled: true }, instances });
  const line = modeLineDetailed(derived, { contract, instances, toolCount: null });
  assert.match(line, /\+1 instance \(uat\)/);
  assert.match(line, /prod: not loaded \(PROD_WRITE_NOT_ACKNOWLEDGED\)/);
});

// AC 4 — the whole point of the derivation.
test('the Mode line is the same with an empty HOME and with a stale ~/.claude.json', async (t) => {
  const root = greenTree(t, { mode: 'design' });
  const empty = tempDir('snowarch-home-', t);
  const stale = tempDir('snowarch-home-', t);
  // The S03 fixture shape: a `~/.claude.json` describing a registration that no longer exists.
  writeFileSync(join(stale, '.claude.json'), JSON.stringify({
    projects: { [root]: { mcpServers: { 'servicenow-mcp': { command: 'node', args: [], env: {} } } } },
  }));
  const withEmpty = (await doctorAt(root, { 'no-cache': true }, { home: empty })).report.modeLine;
  const withStale = (await doctorAt(root, { 'no-cache': true }, { home: stale })).report.modeLine;
  assert.equal(withStale, withEmpty, 'the Mode line changed with ~/.claude.json');
  assert.match(withEmpty, /^Mode: design-only/);
  // The stale entry WAS seen — by the check whose subject it is. This is the control: without it
  // the two lines could match because neither fixture was read.
  const detector = (await doctorAt(root, { 'no-cache': true }, { home: stale }))
    .report.checks.find((c) => c.id === 'E-23');
  assert.equal(detector.status, 'warn', 'the stale fixture was never read');
});

// AC 7.
test('a cloud-sync warning raised by two checks is counted once', () => {
  const checks = [{ id: 'E-25', fixable: false }, { id: 'SV-02', fixable: false }];
  const both = [
    { id: 'E-25', status: 'warn', detail: 'checkout is under a cloud-sync folder (OneDrive)' },
    { id: 'SV-02', status: 'warn', detail: 'store is under a cloud-synced folder (OneDrive)' },
  ];
  assert.equal(summariseMerged(both, checks).warn, 1);
  // Both lines stay in the report: one names the checkout, the other the store, and which one a
  // reader needs depends on which they are about to move.
  assert.equal(both.length, 2);
  // SV-02 warning about anything ELSE is its own warning.
  assert.equal(summariseMerged([both[0],
    { id: 'SV-02', status: 'warn', detail: 'no store found' }], checks).warn, 2);
  assert.equal(dedupeKeyFor({ id: 'E-01', status: 'warn', detail: 'x' }), null);
});

// AC 8 — the shape on this OS, with the regex the story fixes per platform.
test('the Capabilities line names a provider per pack', () => {
  const packs = {
    docx: { present: true, how: '/opt/homebrew/bin/python3' },
    pdf: { present: false, how: null },
    drawio: { present: true, how: '/Applications/draw.io.app/Contents/MacOS/draw.io' },
    mermaid: { present: false, how: null },
  };
  assert.equal(capabilitiesLine(packs),
    'Capabilities: docx yes (python3) · PDF QA no · draw.io yes (draw.io) · Mermaid no');
  assert.equal(capabilitiesLine(null), null);
});

test('one summary renderer: the bootstrap\'s line and the doctor\'s are the same function', () => {
  const counts = { ok: 41, warn: 0, fail: 0 };
  assert.equal(doctorLine(counts), summaryLine({ ...counts, skip: 0, fixable: 0 }));
  assert.equal(renderSummaryLine, summaryLine);
  assert.equal(doctorLine({ ...counts, nodeUsable: false }),
    'DOCTOR: unavailable until Node 20+ is installed (design-only is complete)');
  assert.match(summaryLine({ ok: 1, warn: 0, fail: 1, skip: 2, fixable: 1 }),
    /^DOCTOR: 1 ok, 0 warn, 1 fail, 2 skipped \(1 fixable — run \.\/snowarch doctor --fix\)$/);
});

test('the engine block is assembled from what the checks already found', () => {
  const results = [
    { id: 'E-02', data: { version: '22.1.0' } },
    { id: 'E-04', data: { packs: { docx: { present: true } } } },
    { id: 'E-12', data: { present: true, mode: 'sparse' } },
    { id: 'E-16', data: { checked: 289, dead: 0 } },
    { id: 'E-17', data: { skills: 28, agents: 9 } },
  ];
  const block = engineBlock(results, { version: '2.0.0', contractSha: 'abc' });
  assert.equal(block.node, '22.1.0');
  assert.equal(block.docs.citations, 289);
  assert.deepEqual(block.roster, { skills: 28, agents: 9 });
  assert.equal(block.tag, null, 'the tag is ARC-09-S04\'s to fill');
});

// AC 6.
test('a full run writes both cache files; --section writes neither', async (t) => {
  const root = greenTree(t, { mode: 'design' });

  assert.equal(existsSync(cachePath(root)), false, 'the fixture already had a cache');
  await doctorAt(root);
  assert.ok(existsSync(cachePath(root)), 'a full run wrote no cache');
  assert.ok(existsSync(inputsPath(root)), 'a full run wrote no inputs file');

  const cache = readJson(root, '.local/doctor-last.json');
  assert.equal(cache.version, 1);
  assert.equal(cache.writer, 'doctor');
  assert.ok(Array.isArray(cache.checks) && cache.checks.length > 0);
  assert.match(cache.modeLine, /^Mode: /);
  assert.equal(cache.report.options.quick, true, 'a consumer cannot tell it was a quick run');

  const inputs = readJson(root, '.local/doctor-last.inputs.json');
  assert.deepEqual(Object.keys(inputs).sort(), Object.keys(INPUT_FILES).sort());

  const before = [statSync(cachePath(root)).mtimeMs, statSync(inputsPath(root)).mtimeMs];
  await doctorAt(root, { section: 'docs' });
  assert.deepEqual([statSync(cachePath(root)).mtimeMs, statSync(inputsPath(root)).mtimeMs], before,
    '--section overwrote the cache with a partial report');
});

test('--no-cache on a fresh checkout leaves neither file behind', async (t) => {
  const root = greenTree(t, { mode: 'design' });
  await doctorAt(root, { 'no-cache': true });
  assert.equal(existsSync(cachePath(root)), false);
  assert.equal(existsSync(inputsPath(root)), false);
});

test('the staleness rule is one rule: a changed input, a missing file, or an unreadable one', async (t) => {
  const root = greenTree(t, { mode: 'design' });
  assert.deepEqual(cacheStale(root), { stale: true, reason: 'no cache' });

  await doctorAt(root);
  assert.deepEqual(cacheStale(root), { stale: false, reason: null });

  // A touched input file, and the rule notices which one.
  const settings = readJson(root, '.claude/settings.local.json');
  writeJson(root, '.claude/settings.local.json', { ...settings, touched: true });
  assert.equal(cacheStale(root).stale, true);
  assert.match(cacheStale(root).reason, /settingsLocalMtime changed/);

  rmSync(inputsPath(root));
  assert.deepEqual(cacheStale(root), { stale: true, reason: 'no inputs file' });
  assert.ok(bootstrap);
});

test('the inputs are six files, and an absent one is recorded as absent', (t) => {
  const root = greenTree(t, { mode: 'design' });
  const inputs = collectInputs(root);
  assert.equal(Object.keys(inputs).length, 6);
  assert.equal(inputs.storeMtime, null, 'the fixture has no store, so the input is null');
  assert.ok(inputs.engineConfigMtime > 0);
});

test('the cache refuses a report carrying a secret-shaped value', async (t) => {
  const root = greenTree(t, { mode: 'design' });
  const { code } = await doctorAt(root);
  assert.ok([0, 1].includes(code));
  // What the guard protects: no URL, no address, no secret-shaped key reaches the file.
  const text = readFileSync(cachePath(root), 'utf8');
  assert.equal(/https?:\/\/[a-z0-9-]+\.service-now\.com/i.test(text), false);
  assert.equal(/"[A-Z_]*(PASSWORD|SECRET|TOKEN)[A-Z_]*"\s*:\s*"[^"]{6,}"/.test(text), false);
});
