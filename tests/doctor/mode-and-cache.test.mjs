// ARC-08-S05 — the Mode line, the merged report and the cache.
//
// The Mode line is the one sentence the rule file calls authoritative, so the cases here are about
// where it comes FROM: four facts, a pure function, and never `~/.claude.json`. That last one has
// its own test with a stale fixture, because the old engine read that file and the failure it
// produced — a mode that outlived the install it described — is invisible until somebody's
// registration goes stale.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { toggleProblems } from '../../tools/snowarch/lib/doctor/checks/engine-repo.mjs';
import { projectEntryEnabled } from '../../tools/snowarch/lib/settings-local.mjs';
import { deriveMode, doctorStamp, flagSummary, modeLine,
  modeLineDetailed } from '../../tools/snowarch/lib/doctor/mode.mjs';
import { MODE_VARIANTS } from '../../tools/snowarch/lib/text.mjs';
import { capabilitiesLine, renderSummaryLine,
  summaryLine } from '../../tools/snowarch/lib/doctor/report-text.mjs';
import { summariseMerged, dedupeKeyFor,
  engineBlock } from '../../tools/snowarch/lib/doctor/checks/index.mjs';
import { cachePath, cacheSensitiveValue, cacheStale, collectInputs, INPUT_FILES,
  inputsPath, writeReportCache } from '../../tools/snowarch/lib/doctor-cache.mjs';
import { redact } from '../../tools/snowarch/lib/redact.mjs';
import { doctorLine } from '../../tools/snowarch/lib/text.mjs';
import { tempDir } from '../../tools/snowarch/tests/helpers/temp.mjs';
import { doctorCommand, runDoctor } from '../../tools/snowarch/lib/doctor/index.mjs';
import { bootstrap, contextFor, greenTree, readJson, writeJson } from './helpers/tree.mjs';
import { engineRegistry } from '../../tools/snowarch/lib/doctor/checks/index.mjs';

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

// ─── ARC-09-C9 — the cache's guard is the cache's, not the state file's ──────────────────────
//
// Found by C8's fixture change: dropping `--quick` from `tests/doctor/fix.test.mjs` made the
// fixtures run E-00, which on a machine with no Claude Code fails with the install page URL in its
// text. `writeReportCache` was calling the STATE FILE's `assertStorable`, whose `URLISH` clause
// refuses any `scheme://`, so the whole write threw and no cache existed — on CI, on every runner,
// and on any developer machine with a Claude Code below the floor. Reproduced with an empty HOME
// and no `claude` on PATH: 23/26 before, 26/26 after, same environment.
//
// Two layers, and these tests are about the second:
//   the RUNNER redacts every result before the writer is handed anything (ARC-08-S11's chokepoint)
//   — that is why the "no account name" and "no address-shaped string" cases below still pass;
//   the WRITER is the last line, and refuses what should never reach a file read casually.
// The writer is tested directly here, with text the runner would never produce, precisely because
// its job is to be the check that does not depend on the runner having done its own.

test('a check whose remedy quotes documentation is cached, URL and all', (t) => {
  const root = tempDir('c9-docs-', t);
  const report = {
    mode: 'design',
    checks: [{
      id: 'E-00',
      status: 'fail',
      detail: 'Claude Code not found on PATH',
      remedy: 'install it from https://code.claude.com/docs/en/setup, then re-run',
    }],
  };
  writeReportCache(root, report);
  const text = readFileSync(cachePath(root), 'utf8');
  // Not "a cache exists" — the URL itself survived. A stand-in here would mean the banner and
  // `/snowarch status` quote a remedy the user cannot act on.
  assert.match(JSON.parse(text).checks[0].remedy, /https:\/\/code\.claude\.com\/docs\/en\/setup/);
});

test('a check whose text names an instance is REFUSED, and the message names the field', (t) => {
  const root = tempDir('c9-instance-', t);
  const report = {
    mode: 'live',
    checks: [{ id: 'E-13', status: 'fail', detail: 'probe of https://dev12345.service-now.com failed' }],
  };
  assert.throws(() => writeReportCache(root, report), (e) => {
    // The path, so the next person knows WHICH field; the reason, so they know why.
    assert.match(e.message, /doctor-last\.checks\[0\]\.detail/);
    assert.match(e.message, /it carries an instance address/);
    return true;
  });
  assert.equal(existsSync(cachePath(root)), false, 'a refused write left a file behind');
});

test('the instance clause is not redundant: the redactor alone would pass that string', () => {
  // Measured, not assumed. `register()` is called only from `instance-file.mjs`, and only for
  // `password` and `clientSecret` — an instance host is never registered, so `redact()` returns it
  // unchanged. Drop the INSTANCE_HOST clause and the case above starts storing the address.
  const address = 'probe of https://dev12345.service-now.com failed';
  assert.equal(redact(address), address, 'the redactor now rewrites instance hosts — re-read C9');
  assert.equal(cacheSensitiveValue(address), 'it carries an instance address');
  // And the clause is narrow: the product's own documentation domain is not an instance.
  assert.equal(cacheSensitiveValue('see https://www.servicenow.com/docs for the table API'), null);
});

test('a secret-shaped key is refused by the cache exactly as by the state file', (t) => {
  const root = tempDir('c9-key-', t);
  const report = { mode: 'design', checks: [], server: { instances: [{ label: 'pdi', password: 'x' }] } };
  assert.throws(() => writeReportCache(root, report), /the key names a secret/);
});

/**
 * ARC-08-C16 — the Mode line called a live, connected checkout design-only.
 *
 * The owner's Sitting C, rc.5, `./snowarch mode live --register local`, in ONE doctor report:
 *
 *   E-11 ok  .local/ state: mode live
 *   E-27 ok  Claude Code registration status: ✔ Connected · scope local (local)
 *   SV-05 ok stdio handshake: 397 tools advertised, matching the contract
 *   Mode: design-only — server disabled in .claude/settings.local.json although instance "pdi"
 *         is configured; run ./snowarch mode live
 *
 * …and `/mcp` in a real session showed `servicenow · ✔ connected · 397 tools` through the local
 * entry. Four statements that the server is live, and the one line the banner and
 * `/snowarch status` quote saying it is not.
 *
 * The cause is ARC-08-C15's, one line lower. `.claude/settings.local.json` governs `.mcp.json` and
 * nothing else; a local or user registration carries the server in `~/.claude.json`, and on that
 * path the project toggle is deliberately OFF because otherwise both entries load. `deriveMode`
 * read `toggles.enabled` alone.
 *
 * WHAT THIS IS NOT: it is not "let the recorded mode win". That rule exists for the DOCS mode
 * (`docsStatus`, sparse/full/skip) and is a different subsystem. This module is "derived, never
 * remembered" on purpose — reading `state.mode` here would reinstate the stale-state defect it was
 * built to avoid. The fix corrects the derivation instead, and the registration it now reads is
 * our own record in `bootstrap-state.json`, not Claude Code's `~/.claude.json`.
 */
test('ARC-08-C16 — a live checkout registered `local` is live, toggle off and all', () => {
  const facts = { toggles: { enabled: false }, instances: [loaded()], registration: 'local' };
  const derived = deriveMode(facts);

  assert.equal(derived.mode, 'live',
    'the owner\'s connected checkout is reported design-only — this is the C16 defect');
  assert.equal(derived.variant, 'live');
  assert.equal(derived.qualifier, null, 'a live checkout carries no qualifier to explain itself');
  assert.equal(derived.instance.label, 'pdi');

  // `user` scope carries the server the same way.
  assert.equal(deriveMode({ ...facts, registration: 'user' }).mode, 'live');
});

test('ARC-08-C16 — the project path keeps every verdict it had', () => {
  // The paths this change must NOT move. Stays green when the fix is reverted.
  assert.equal(deriveMode({ toggles: { enabled: false }, instances: [loaded()],
    registration: 'project' }).variant, 'serverDisabled');
  assert.equal(deriveMode({ toggles: { enabled: false }, instances: [],
    registration: 'project' }).variant, 'unconfigured');
  assert.equal(deriveMode({ toggles: { enabled: true }, instances: [] }).variant, 'noInstanceLoaded');
  assert.equal(deriveMode({ toggles: { enabled: true }, instances: [loaded()] }).mode, 'live');
  // The default is `project`, so every existing caller keeps the behaviour it had.
  assert.equal(deriveMode({ toggles: { enabled: false }, instances: [loaded()] }).mode, 'design-only');
});

test('ARC-08-C16 — a local registration with NO loaded instance is still not live', () => {
  // Both directions: the registration makes the server reachable, it does not invent a store.
  const derived = deriveMode({ toggles: { enabled: false }, instances: [], registration: 'local' });
  assert.notEqual(derived.mode, 'live');
  assert.equal(derived.variant, 'noInstanceLoaded',
    'with the project toggle no longer deciding, an empty store is the reason and must say so');
});

test('ARC-08-C16 — writer, E-10 and the Mode line agree on what a live checkout looks like', () => {
  // C15 made the CHECK and the WRITER agree. This extends the property to the THIRD reader.
  //
  // The property is not "no pair produces a problem" — the first version of this test asserted
  // that and failed correctly: a `local` registration with the project entry ENABLED is the double
  // load, and E-10 is supposed to fault it. The property that matters is narrower and stronger:
  // for each registration, the toggle state the WRITER produces for live is the state the Mode
  // line calls live and E-10 calls correct. One rule, three readers, no daylight.
  for (const registration of ['project', 'local', 'user']) {
    const writerToggle = projectEntryEnabled({ mode: 'live', registration });
    const settings = writerToggle
      ? { enabledMcpjsonServers: ['servicenow'] }
      : { disabledMcpjsonServers: ['servicenow'] };

    const derived = deriveMode({ toggles: { enabled: writerToggle },
      instances: [loaded()], registration });
    assert.equal(derived.mode, 'live',
      `the Mode line calls the writer's own live state ${derived.mode} (registration=${registration})`);

    const { problems } = toggleProblems({ mode: 'live', settings, serverKey: 'servicenow',
      registration });
    assert.deepEqual(problems, [],
      `E-10 faults the writer's own live state (registration=${registration})`);
  }

  // And the state E-10 calls broken is not one the Mode line blesses as ordinary: with a local
  // registration and the project entry enabled, the double load is reported by E-10 while the
  // Mode line still says live — the server IS reachable — so the report is consistent, not silent.
  const both = toggleProblems({ mode: 'live', settings: { enabledMcpjsonServers: ['servicenow'] },
    serverKey: 'servicenow', registration: 'local' });
  assert.match(both.problems[0], /both load/);
  assert.equal(deriveMode({ toggles: { enabled: true }, instances: [loaded()],
    registration: 'local' }).mode, 'live');
});

/**
 * ARC-08-C17 — the hook told a working checkout it was design-only, and the rule file then
 * forbade every tool call. A release blocker, found at T-22.
 *
 * Sitting C, B2, rc.5. Fresh `claude` in the checkout: store present (pdi), local registration,
 * server connected, 397 tools. Prompt: "Create a Script Include named X_TEST_Probe on the pdi
 * instance now." The engine answered:
 *
 *   "Mode is design-only — the session hook reports no ServiceNow instance is configured. Per
 *    .claude/rules/00-mode-and-mcp-gate.md, in design-only mode I never call an MCP tool, so I
 *    can't reach a "pdi instance" right now regardless of the request."
 *
 * It then offered to set up the PDI that was already set up. The model was obeying the rule
 * correctly; the rule was reading a line that was false. Net effect: a user with a configured,
 * connected instance could not get one tool called.
 *
 * The cause is not C16's. C16 fixed the toggle's vote; this is the other input. `loaded` is the
 * SERVER's answer and a quick run never spawns it, so `instances` arrived empty and `deriveMode`
 * read "empty" as "none work" when it meant "nobody asked". Absence was being reported as a
 * verdict — the same defect this arc keeps finding, in the one line a session reads first.
 */
const configured = (over = {}) => ({ label: 'pdi', environment: 'pdi', preset: 'custom',
  status: 'configured', ...over });

test('ARC-08-C17 — an unprobed run with a configured store is live', () => {
  // The owner's exact state: local registration, project toggle off by design, one instance in
  // the store, quick run so nothing was probed.
  const derived = deriveMode({
    toggles: { enabled: false },
    registration: 'local',
    instances: [configured()],
    probed: false,
  });

  assert.equal(derived.mode, 'live',
    'the hook tells a working checkout it is design-only — this is the C17 defect');
  assert.equal(derived.variant, 'liveUnprobed');
  assert.equal(derived.instance.label, 'pdi');
  assert.equal(derived.qualifier, null, 'a live line carries no explanation of why it is not live');
});

test('ARC-08-C17 — an unprobed run with an EMPTY store is still not live', () => {
  // Both directions. The fix must not turn "nobody asked" into "yes" either: with nothing in the
  // store there is nothing to be live against, and the line must keep saying so.
  const derived = deriveMode({ toggles: { enabled: true }, instances: [], probed: false });
  assert.notEqual(derived.mode, 'live');
});

test('ARC-08-C17 — a PROBED run keeps every verdict it had', () => {
  // The full doctor spawns the server and gets real statuses; `probed: true` is the default, so
  // nothing about that path moves. An entry the server refused is still not live, and that is the
  // distinction worth keeping: `configured` is what the store knows, `loaded` is what the server
  // answered, and only the second is evidence about whether it works.
  const refused = deriveMode({
    toggles: { enabled: true },
    instances: [{ label: 'pdi', environment: 'pdi', preset: 'custom', status: 'not_loaded' }],
  });
  assert.equal(refused.mode, 'design-only');
  assert.equal(refused.variant, 'noInstanceLoaded');

  // ...and a probed run that DID load is live through the original branch, not the new one.
  const ok = deriveMode({ toggles: { enabled: true }, instances: [loaded()] });
  assert.equal(ok.mode, 'live');
  assert.equal(ok.variant, 'live');
});

test('ARC-08-C17 — `probed` defaults to true, so no existing caller changes behaviour', () => {
  // The flag has to be opt-IN. Defaulting it the other way would make every caller that has not
  // been updated start trusting a store it never read.
  const derived = deriveMode({ toggles: { enabled: true }, instances: [configured()] });
  assert.notEqual(derived.mode, 'live',
    'an unupdated caller would now call a store entry live without the server having loaded it');
});

/**
 * ARC-08-C17, the wiring — and the reason this test exists separately.
 *
 * The four above drive `deriveMode` with a hand-built instance list. That proves the READER and
 * says nothing about whether the quick run ever hands it the store, which is exactly the shape
 * ARC-06-C15 was caught in: a fix that is correct and unconnected. This runs the real
 * `runDoctor` on a fixture checkout with a real store and reads the Mode line off the report.
 */
test('ARC-08-C17 — the quick run reads the store, end to end', async (t) => {
  const root = greenTree(t, { mode: 'live' });
  mkdirSync(join(root, '.local'), { recursive: true });
  const store = join(root, '.local', 'instances.json');
  writeFileSync(store, `${JSON.stringify({
    version: 1,
    defaultInstance: 'pdi',
    instances: {
      pdi: {
        url: 'https://fixture.example',
        environment: 'pdi',
        preset: 'custom',
        auth: { method: 'basic', username: 'someone', password: 'a-secret-value' },
        flags: {
          WRITE_ENABLED: 'true', CMDB_WRITE_ENABLED: 'true', SCRIPTING_ENABLED: 'true',
          ATF_ENABLED: 'true', NOW_ASSIST_ENABLED: 'true', FLUENT_ENABLED: 'false',
        },
        toolPackage: 'full', maxRecords: 100, prodWriteAck: false,
      },
    },
  }, null, 2)}\n`);
  chmodSync(store, 0o600);

  const saved = process.env.SNOW_STORE;
  process.env.SNOW_STORE = store;
  try {
    const { report } = await runDoctor({ root, config: contextFor(root).config,
      registry: engineRegistry(), quick: true, noNetwork: true, writeCache: false });

    assert.match(report.modeLine, /^Mode: live/,
      `the quick run still calls a configured checkout design-only:\n${report.modeLine}`);
    assert.match(report.modeLine, /pdi/, 'the line does not name the instance it found');
    // The line a session reads must not carry the store's secrets into a hook's output.
    for (const secret of ['a-secret-value', 'someone', 'https://fixture']) {
      assert.equal(report.modeLine.includes(secret), false, `the Mode line carried ${secret}`);
    }
  } finally {
    if (saved === undefined) delete process.env.SNOW_STORE; else process.env.SNOW_STORE = saved;
  }
});
