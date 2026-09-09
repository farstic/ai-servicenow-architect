import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DESIGN_CACHE_STEPS, doctorCounts, run as runB09, warningsFrom } from '../lib/steps/B09.mjs';
import { EXPECTED_DIALOGS, spellings, summaryBlock } from '../lib/text.mjs';
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
  assert.deepEqual(fromDoctor, { ok: 41, warn: 0, fail: 0, source: 'doctor' });

  // A doctor that answers nothing usable falls back rather than printing zeros.
  const unparsable = doctorCounts(state, { root: '/repo', hasDoctor: true,
    run: () => ({ stdout: 'not json' }) });
  assert.equal(unparsable.source, 'bootstrap');
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
  assert.equal(last[4], `      Add a live instance later with ${spellings().cli} mode live, `
    + 'or /snowarch setup-instance inside Claude.');
  // ...and the step line is above them, not below.
  assert.match(log.lines.at(-6), /^\[B09\/09\] summary … ok/);
});
