import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DESIGN_CACHE_STEPS, doctorCounts, run as runB09, warningsFrom } from '../lib/steps/B09.mjs';
import { EXPECTED_DIALOGS, spellings, summaryBlock, ADD_INSTANCE } from '../lib/text.mjs';
import { cachePath } from '../lib/doctor-cache.mjs';
import { bootstrapCommand } from '../lib/bootstrap.mjs';
import { commandArgs, makeCheckout, recorder } from './helpers/workspace.mjs';

const sink = () => { const s = []; return { write: (x) => s.push(x), text: () => s.join('') }; };
const config = (root) => JSON.parse(readFileSync(join(root, 'engine.config.json'), 'utf8'));

const stateWith = (steps) => ({ steps, registration: 'project' });
const ctxFor = (root, over = {}) => ({
  root, config: config(root), mode: 'design-only', node: { present: true }, env: {}, plat: 'linux',
  state: stateWith({ B01: { status: 'ok' }, B05: { status: 'ok' }, B07: { status: 'ok' } }),
  line: () => {}, hasDoctor: false, ...over,
});

test('B09 returns the block rather than printing it — the step line comes first', async () => {
  // The runner prints a step's line AFTER `run()` returns, so a block written from inside would be
  // followed by `[B09/09] summary … ok` and the closing five lines would not be the last five.
  const root = makeCheckout();
  const lines = [];
  const r = await runB09(ctxFor(root, { line: (l) => lines.push(l) }));
  assert.deepEqual(lines, [], 'B09 printed the block itself');
  assert.equal(typeof r.next, 'string');
  assert.equal(r.next.split('\n').length, 5);
});

test('the counts come from this run when no doctor exists, and from the doctor when one does', () => {
  const state = stateWith({
    B00: { status: 'ok' }, B01: { status: 'ok' }, B02: { status: 'warn' },
    B04: { status: 'skipped' }, B05: { status: 'fail' }, B09: { status: 'ok' },
  });
  const own = doctorCounts(state, { root: '/repo', hasDoctor: false });
  assert.deepEqual(own, { ok: 3, warn: 1, fail: 1, source: 'bootstrap' });

  // An interrupt records `failed`; the summary counts it as a failure rather than ignoring it.
  assert.equal(doctorCounts(stateWith({ B04: { status: 'failed', reason: 'interrupted' } }),
    { root: '/repo', hasDoctor: false }).fail, 1);

  const fromDoctor = doctorCounts(state, { root: '/repo', hasDoctor: true,
    run: () => ({ stdout: JSON.stringify({ summary: { ok: 41, warn: 0, fail: 0 } }) }) });
  // ARC-08-C37 added `checks`, and `null` here is the measurement: this stub's JSON has a `summary`
  // and no `checks` at all, so there is nothing to name and the key says so rather than being
  // absent. `deepEqual` is kept — it is what caught the new key, and a loosened assertion would
  // stop noticing the next one.
  assert.deepEqual(fromDoctor,
    { ok: 41, warn: 0, fail: 0, source: 'doctor', failures: [], checks: null });

  // Sitting A — the FAILING CHECKS travel with the count. The summary printed `1 fail` and named
  // nothing, and by the time anyone ran the full doctor the failure had gone: the only run that
  // saw it is the only run that could have said what it was. They were already in this JSON.
  const withFailure = doctorCounts(state, { root: '/repo', hasDoctor: true,
    run: () => ({ stdout: JSON.stringify({
      summary: { ok: 8, warn: 0, fail: 1 },
      checks: [
        { id: 'E-10', status: 'fail', title: 'settings.local toggles match the recorded mode',
          detail: 'mode is live but servicenow is disabled', remedy: './snowarch doctor --fix' },
        { id: 'SV-02', status: 'ok', title: 'store' },
      ],
    }) }) });
  assert.deepEqual(withFailure.failures,
    ['E-10 FAIL settings.local toggles match the recorded mode: mode is live but servicenow is '
      + 'disabled — ./snowarch doctor --fix'],
    'a count with nothing named is a number nobody can act on');
  assert.equal(withFailure.failures.length, withFailure.fail,
    'both directions: every counted failure is named, and nothing else is');

  // A doctor that answers nothing usable falls back rather than printing zeros.
  const unparsable = doctorCounts(state, { root: '/repo', hasDoctor: true,
    run: () => ({ stdout: 'not json' }) });
  assert.equal(unparsable.source, 'bootstrap');
});

/**
 * ARC-08-C37 — the WARNING the owner met at the end of a bootstrap, named.
 *
 * `failures` above is Sitting A's fix and covers FAILs. A doctor WARNING had no route to this block
 * at all: `warnings` in `summaryBlock` is `warningsFrom(state)`, which is the bootstrap STEPS' own
 * warnings — a different source, deliberately not conflated with the doctor's checks. So `1 warn`
 * was counted here and named nowhere, and the owner had to run a second command to learn it was
 * E-23. The id rides on the counts object; the remedy still lives in `./snowarch doctor`.
 */
test('ARC-08-C37 — a doctor warning is named in the block, not just counted', () => {
  const state = stateWith({ B01: { status: 'ok' }, B05: { status: 'ok' } });
  const counts = doctorCounts(state, { root: '/repo', hasDoctor: true,
    run: () => ({ stdout: JSON.stringify({
      summary: { ok: 14, warn: 1, fail: 0, skip: 26 },
      checks: [
        { id: 'E-23', status: 'warn', title: 'stale MCP registrations in ~/.claude.json',
          // A PLACEHOLDER name, not the one this machine's store happens to hold: the real remedy
          // names a retired product, and P-06's ratchet caught it here — correctly.
          detail: '4 stale registration(s)', remedy: 'claude mcp remove <name> -s local' },
        { id: 'SV-02', status: 'ok', title: 'store' },
      ],
    }) }) });
  assert.deepEqual(counts.checks?.map((c) => c.id), ['E-23', 'SV-02'],
    'the checks did not travel with the counts');
  assert.deepEqual(counts.failures, [], 'a warning is not a failure and must not be listed as one');

  const block = summaryBlock({ mode: 'design', counts, nodeUsable: true,
    dialogs: EXPECTED_DIALOGS, serverKey: 'servicenow', platform: 'linux', env: {},
    warnings: warningsFrom(state), failures: counts.failures ?? [] });
  const lines = block.split('\n');
  assert.equal(lines[0], 'DOCTOR: 14 ok, 1 warn (E-23), 0 fail, 26 skipped');
  // NAMED, NOT LISTED: the warning's own remedy line stays out of the block, exactly as the panel
  // keeps it out. E-23's remedy is several `claude mcp remove …` continuations and this block is
  // already the longest thing a first install prints.
  assert.equal(lines.some((l) => l.startsWith('E-23')), false, 'the warning was listed in full');
  assert.equal(block.includes('claude mcp remove'), false, 'the remedy leaked into the block');
});

test('the doctor is spawned through childEnv, like every other child', () => {
  let observed = null;
  doctorCounts(stateWith({}), { root: '/repo', hasDoctor: true,
    run: (exec, args, options) => { observed = options; return { stdout: '{}' }; } });
  assert.equal(observed.env.CLAUDE_PROJECT_DIR, '/repo',
    'a session variable is set for our children, never inherited');
  assert.equal(observed.cwd, '/repo');
});

test('only the two warnings worth repeating are repeated', () => {
  const state = stateWith({
    B01: { status: 'warn', data: { cloudSync: 'this checkout is inside a cloud-synced folder (Dropbox) — …' } },
    B02: { status: 'warn', detail: '2 dead citation(s) — see ./snowarch docs verify' },
    B00: { status: 'warn', detail: '1 warning(s)' },
    B06: { status: 'skipped', detail: 'design-only' },
  });
  assert.deepEqual(warningsFrom(state), [
    'this checkout is inside a cloud-synced folder (Dropbox) — …',
    '2 dead citation(s) — see ./snowarch docs verify',
  ]);
  // B00's own warning is not repeated: the operator read it seven lines ago, and a recap that
  // repeats everything is a recap nobody reads.
  assert.equal(warningsFrom(stateWith({ B00: { status: 'warn', detail: 'x' } })).length, 0);
});

test('AC 1 — the design-only block, and the Node-absent first line', async () => {
  const root = makeCheckout();
  const r = await runB09(ctxFor(root));
  // Built from `text.mjs`, never spelled twice: a snapshot typed out here would be a second
  // definition of the thing this story exists to have one of.
  assert.equal(r.next, summaryBlock({ mode: 'design-only', counts: { ok: 3, warn: 0, fail: 0 },
    serverKey: config(root).mcp.serverKey, platform: 'linux', env: {} }));

  const noNode = await runB09(ctxFor(root, { node: { present: false } }));
  assert.equal(noNode.next.split('\n')[0],
    'DOCTOR: unavailable until Node 20+ is installed (design-only is complete)');
  assert.equal(noNode.next.split('\n')[1], 'Mode: design-only');
});

test('AC 2 — the live block names the instance and one dialog per expected dialog', async () => {
  const root = makeCheckout();
  const state = stateWith({
    B01: { status: 'ok' },
    B08: { status: 'ok', data: { instance: { label: 'pdi', environment: 'pdi', preset: 'full' } } },
  });
  const r = await runB09(ctxFor(root, { mode: 'live', state }));
  const lines = r.next.split('\n');
  assert.equal(lines[1], 'Mode: live — instance=pdi (pdi) preset=full');
  assert.equal(lines.filter((l) => /answer Yes\./.test(l)).length, EXPECTED_DIALOGS);
  assert.match(r.next, new RegExp(`/mcp should show: ${config(root).mcp.serverKey} ✔ connected`));
  // Nothing that identifies a host or an account reaches the block.
  assert.ok(!r.next.includes('service-now') && !r.next.includes('admin'));

  // ARC-07-W12 — END TO END, because the unit case proves the renderer and this proves the ROUTE.
  // `changeLaterBlock` takes a label and defaults to `<label>` when it has none, so a B09 that
  // passed `instance: null` in live mode would render a block full of placeholders and every unit
  // case would still be green. What is asserted here is that the label the handshake recorded is
  // the label a real run prints.
  assert.match(r.next, /^Change later, /m);
  assert.match(r.next, /instance set-preset pdi <preset>/);
  assert.doesNotMatch(r.next, /<label>/, 'the label did not reach the block through B09');
  // ...and the design-only run above has no such block: four of its five rows name an instance.
  const design = await runB09(ctxFor(root, { state: stateWith({ B01: { status: 'ok' } }) }));
  assert.doesNotMatch(design.next, /Change later/);
});

test('a design-only run leaves the banner a cache; a live run\'s is not overwritten', async () => {
  const root = makeCheckout();
  await runB09(ctxFor(root, { state: stateWith({
    B01: { status: 'ok', detail: '.local/ created (0700)' },
    B02: { status: 'warn', detail: '2 dead citation(s)' },
    B05: { status: 'ok', detail: 'sha abc' },
    B07: { status: 'ok', detail: 'settings updated' },
  }) }));

  const cache = JSON.parse(readFileSync(cachePath(root), 'utf8'));
  assert.equal(cache.version, 1);
  assert.equal(cache.writer, 'bootstrap');
  assert.equal(cache.mode, 'design-only');
  assert.deepEqual(cache.checks.map((c) => c.id), [...DESIGN_CACHE_STEPS]);
  assert.deepEqual(cache.summary, { ok: 3, warn: 1, fail: 0 });

  // B08 wrote a richer one in live mode; B09 must not replace a handshake's findings with a
  // summary's.
  const before = readFileSync(cachePath(root), 'utf8');
  await runB09(ctxFor(root, { mode: 'live' }));
  assert.equal(readFileSync(cachePath(root), 'utf8'), before);
});

test('AC 3 — --json.next is the same string the human run printed', async () => {
  const root = makeCheckout();
  // A warm-up run first, so both runs below are steady-state. Without it the DOCTOR counts differ
  // legitimately — a first run does work a second one finds cached — and the test would be
  // comparing two different runs rather than two renderings of one.
  await bootstrapCommand({ ...commandArgs(root, { mode: 'design', yes: true }), log: recorder(),
    out: sink(), err: sink() });

  const human = recorder();
  await bootstrapCommand({ ...commandArgs(root, { mode: 'design', yes: true }), log: human,
    out: sink(), err: sink() });
  const printed = human.lines.slice(-5).join('\n');

  const jsonLog = recorder();
  await bootstrapCommand({ ...commandArgs(root, { mode: 'design', yes: true, json: true }),
    log: jsonLog, out: sink(), err: sink() });
  const payload = JSON.parse(jsonLog.lines.at(-1));

  assert.equal(payload.next, printed, '--json.next and the printed block have drifted');
  assert.equal(printed.split('\n').length, 5);
  assert.match(printed, /^DOCTOR: /);
});

test('AC 1 — the last five lines of a real run are the block', async () => {
  const root = makeCheckout();
  const log = recorder();
  const code = await bootstrapCommand({ ...commandArgs(root, { mode: 'design', yes: true }),
    log, out: sink(), err: sink() });
  assert.equal(code, 0);
  const last = log.lines.slice(-5);
  assert.match(last[0], /^DOCTOR: \d+ ok, \d+ warn, \d+ fail$/);
  assert.equal(last[1], 'Mode: design-only');
  assert.match(last[2], /^Next: run `claude` here\./);
  // The spelling comes from `spellings()` for THIS shell, not from a POSIX literal: on the Windows
  // runner the block correctly says `snowarch.cmd`, and asserting `./snowarch` there was the test
  // choosing a platform and then checking a different one.
  // Built from ADD_INSTANCE rather than retyped: ARC-05-S06 criterion 3 is that this remedy has ONE
  // definition, and a test that spells its own copy is a second one that drifts the same way the
  // doctor's Mode line did.
  assert.equal(last[4], `      Add a live instance later: run ${ADD_INSTANCE(spellings().cli)}.`);
  // ...and the step line is above them, not below.
  assert.match(log.lines.at(-6), /^\[B09\/09\] summary … ok/);
});


/**
 * ARC-08 (Sitting A) — the gate asked whether `snowarch` is on PATH; the spawn needs the launcher
 * in THIS checkout.
 *
 * Nobody installs `snowarch` globally to use a checkout, so the gate was false in ordinary use, the
 * doctor was never asked, and B09 printed its fallback tally under a line that says DOCTOR. That
 * tally counts `state.steps`, which PERSISTS between runs — so a step that failed in an earlier run
 * was reported by a later, successful one. Sitting A watched `mode design` succeed and print
 * `1 fail`, and the failure was B06's, from the `mode live` before it.
 */
test('ARC-08 — the doctor is asked because the launcher is in the checkout, not because it is on PATH', () => {
  const state = stateWith({ B00: { status: 'ok' }, B06: { status: 'fail' } });
  let spawned = null;

  const counts = doctorCounts(state, {
    root: '/repo',
    hasDoctor: true,
    run: (exec, args) => { spawned = args; return { stdout: JSON.stringify({ summary: { ok: 9, warn: 0, fail: 0 } }) }; },
  });

  // Separators normalised: `join()` gives backslashes on Windows, and a forward-slash substring
  // check would fail there for a reason that has nothing to do with what this test is about.
  assert.ok(spawned.some((a) => String(a).replaceAll('\\', '/').includes('tools/snowarch/bin/snowarch.mjs')),
    'the spawn runs the checkout\'s own launcher by absolute path — so PATH is the wrong question');
  assert.equal(counts.source, 'doctor');
  assert.equal(counts.fail, 0,
    'a step that failed in an EARLIER run must not be reported by a later, successful one');
});

test('ARC-08 control — without the doctor, the tally is the persisted steps, and that is the defect', () => {
  // Kept as a control so the fix above cannot be mistaken for cosmetics: this is what the user saw.
  const state = stateWith({ B00: { status: 'ok' }, B06: { status: 'fail' } });
  const fallback = doctorCounts(state, { root: '/repo', hasDoctor: false });

  assert.equal(fallback.source, 'bootstrap');
  assert.equal(fallback.fail, 1,
    'the fallback counts state.steps, which persists — which is why it must not be the usual path');
});
