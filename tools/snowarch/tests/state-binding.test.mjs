// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C198 — a `.local/bootstrap-state.json` carried from another folder is not this checkout's record.
 *
 * Found by the cross-version sweep: a 2.2.0 record copied into a fresh checkout marked B02, B03 and B07 cached, so the
 * new install had no corpus and no `settings.local.json` while E-29 said "all current". Those steps' inputs are the
 * same files in every checkout of a release, so their hashes matched; what the record could not say is that the steps
 * had run HERE.
 *
 * The runner's half, and `staleSteps`, are here. E-29's half is in `tests/doctor/bootstrap-finished.test.mjs`, and the
 * upgrade plan's in `tests/upgrade/plan-agrees.test.mjs`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { assertStorable, checkoutKey, emptyState, explainStale, loadState, notHereReason, staleSteps }
  from '../lib/state.mjs';
import { pathKey } from '../lib/path-key.mjs';
import { register, reset as forgetSecrets } from '../lib/redact.mjs';
import { samePath } from '../lib/steps/B00.mjs';
import { runSteps } from '../lib/steps/index.mjs';
import { STEP_IDS, alwaysRuns, hashFor } from '../lib/inputs.mjs';
import { loadConfig, root as REPO } from '../lib/config.mjs';
import { spellings } from '../lib/text.mjs';
import { makeCheckout, stub } from './helpers/workspace.mjs';
import { tempDir } from './helpers/temp.mjs';

const base = (root) => ({ root, mode: 'design-only', docs: 'sparse', env: {},
  node: { present: true, version: '22.11.0', major: 22 } });
const state = () => emptyState({ engineVersion: '2.0.0-test', platform: 'darwin' });

/**
 * Two cacheable steps whose inputs hash the same in every folder, as B02's, B03's and B07's did, and a count of what
 * ran. Nothing is saved: the record under test is the object the runs share.
 */
function twoSteps() {
  const ran = [];
  const steps = ['B02', 'B07'].map((id) => stub(id, { onRun: () => { ran.push(id); return { status: 'ok' }; } }));
  const run = (root, s) => runSteps({ root, ctx: base(root), state: s, steps, save: () => {},
    hash: () => 'sha256:the-same-inputs-in-every-folder' });
  return { ran, run };
}

test('ARC-09-C198 — a record carried from another folder marks nothing cached', async (t) => {
  const from = makeCheckout({}, t);
  const root = makeCheckout({}, t);
  const { ran, run } = twoSteps();
  const s = state();
  await run(from, s);
  assert.deepEqual(ran, ['B02', 'B07'], 'precondition: the first run ran both steps');

  ran.length = 0;
  const r = await run(root, s);
  assert.equal(r.summary.cached, 0, 'a step recorded in another folder was taken as done here');
  assert.deepEqual(ran, ['B02', 'B07']);
});

test('ARC-09-C198 — a record written before the binding existed is not trusted either', async (t) => {
  const root = makeCheckout({}, t);
  const { ran, run } = twoSteps();
  const s = state();
  await run(root, s);
  // Every record written before this release has no binding, in this folder or any other, and it cannot say which.
  delete s.checkout;

  ran.length = 0;
  const r = await run(root, s);
  assert.equal(r.summary.cached, 0, 'a record that does not say where its steps ran was taken as this folder\'s');
  assert.deepEqual(ran, ['B02', 'B07']);
});

test('ARC-09-C198 — the control: in its own folder the record is cached, and a run in the new folder makes it that '
  + 'folder\'s', async (t) => {
  const from = makeCheckout({}, t);
  const root = makeCheckout({}, t);
  const { ran, run } = twoSteps();
  const s = state();
  await run(from, s);
  ran.length = 0;
  assert.equal((await run(from, s)).summary.cached, 2, 'the record of this folder is no longer trusted here');
  assert.deepEqual(ran, []);

  await run(root, s);
  ran.length = 0;
  assert.equal((await run(root, s)).summary.cached, 2, 'a run in the new folder did not make the record its own');
  assert.deepEqual(ran, []);
});

test('ARC-09-C198 — the control: one folder reached through a link is one folder', async (t) => {
  const root = makeCheckout({}, t);
  // A junction on Windows, which needs no privilege; a directory link elsewhere.
  const link = join(tempDir('snowarch-link-', t), 'checkout');
  symlinkSync(root, link, process.platform === 'win32' ? 'junction' : 'dir');
  const { ran, run } = twoSteps();
  const s = state();
  await run(root, s);

  ran.length = 0;
  assert.equal((await run(link, s)).summary.cached, 2, 'the same folder, reached through a link, was taken for another');
  assert.deepEqual(ran, []);
});

/** `fn` with `SNOWARCH_STATE_ROOT` set, as CI's licence step sets it for the doctor, and the variable put back after. */
async function underStateRoot(dir, fn) {
  const saved = process.env.SNOWARCH_STATE_ROOT;
  process.env.SNOWARCH_STATE_ROOT = dir;
  try { return await fn(); } finally {
    if (saved === undefined) delete process.env.SNOWARCH_STATE_ROOT;
    else process.env.SNOWARCH_STATE_ROOT = saved;
  }
}

test('ARC-09-C198 — the control: a record CI copies into SNOWARCH_STATE_ROOT is still its checkout\'s', async (t) => {
  // CI bootstraps the checkout, then copies `.local/` into a redirected state root for the doctor
  // (`cp -Rn .local/. "$SNOWARCH_STATE_ROOT/.local/"`, held by workflows.test.mjs). The record belongs to the ENGINE
  // root, the checkout, and not to wherever `.local/` is read from, so the copy is still this checkout's record.
  // The redirect moves only the real checkout's state (config.mjs `stateRoot`), so this one case runs on it, and in
  // memory: the runs save nothing, and nothing is written to the repository's own `.local/`.
  const { ran, run } = twoSteps();
  const s = state();
  await run(REPO, s);

  const redirected = tempDir('snowarch-state-root-', t);
  mkdirSync(join(redirected, '.local'), { recursive: true });
  writeFileSync(join(redirected, '.local', 'bootstrap-state.json'), `${JSON.stringify(s, null, 2)}\n`);
  ran.length = 0;
  const r = await underStateRoot(redirected, async () => {
    const copied = loadState(REPO, spellings());
    assert.equal(copied?.startedAt, s.startedAt, 'the doctor\'s read did not go through the redirect');
    return run(REPO, copied);
  });
  assert.equal(r.summary.cached, 2, 'the copy CI reads through its state root was taken for another folder\'s record');
  assert.deepEqual(ran, []);
});

// ── staleSteps, the same question asked from outside the runner ────────────────────────────────────────────────

const ctxFor = (root) => ({ root, env: {}, mode: 'design-only', docs: 'sparse', instanceFile: null,
  config: loadConfig(root), node: { present: true, version: '22.11.0', major: 22 },
  state: { hooksDisabledByBootstrap: false, registration: 'project' } });

/** Every step recorded ok with the hash it has right now. */
function current(root, ctx) {
  const s = state();
  for (const id of STEP_IDS) s.steps[id] = { status: 'ok', inputsHash: hashFor(id, ctx), durationMs: 1 };
  return s;
}

test('ARC-09-C198 — staleSteps names every step of a carried record, and of one that names no folder', (t) => {
  const root = makeCheckout({}, t);
  const ctx = ctxFor(root);
  const reasons = (s) => staleSteps(s, ctx, { hashFor, steps: STEP_IDS, alwaysRuns }).map((x) => `${x.step} ${x.reason}`);
  const cacheable = STEP_IDS.filter((id) => !alwaysRuns(id));

  // What a copy of another folder's `.local/` carries: a binding, and not this folder's.
  const carried = { ...current(root, ctx), checkout: 'a key written in another folder' };
  assert.deepEqual(reasons(carried), cacheable.map((id) => `${id} other-folder`));
  assert.deepEqual(explainStale(staleSteps(carried, ctx, { hashFor, steps: ['B02'], alwaysRuns })),
    ['B02 will run — was recorded in another folder']);

  const unbound = current(root, ctx);
  delete unbound.checkout;
  assert.deepEqual(reasons(unbound), cacheable.map((id) => `${id} no-folder`));
  assert.deepEqual(explainStale(staleSteps(unbound, ctx, { hashFor, steps: ['B02'], alwaysRuns })),
    ['B02 will run — was recorded without a folder']);
});

// ── the key: one folder, one key, and never the path ───────────────────────────────────────────────────────────

test('ARC-09-C198 — on Windows, either separator and either drive-letter case are one folder', () => {
  const key = (p) => checkoutKey(p, 'win32');
  assert.equal(key('C:/Users/runner/snowarch'), key('c:\\Users\\runner\\snowarch'));
  assert.equal(key('D:\\A\\repo'), key('d:/a/repo'));
  assert.notEqual(key('C:\\Users\\runner\\snowarch'), key('C:\\Users\\runner\\other'), 'two folders, one key');
  // The rule is B00's own, moved, so the key and `samePath` cannot come apart.
  assert.equal(pathKey('C:/Users/runner/snowarch', 'win32'), pathKey('c:\\Users\\runner\\snowarch', 'win32'));
  assert.equal(samePath('C:/Users/runner/snowarch', 'c:\\Users\\runner\\snowarch', 'win32'), true);
});

test('ARC-09-C198 — the key is a sha256, never the path, and the state guard takes it where it refuses the path',
  (t) => {
    const root = makeCheckout({}, t);
    const key = checkoutKey(root);
    assert.match(key, /^[A-Za-z0-9_-]{43}$/, 'not a base64url sha256');
    // Why a key and not the path: the bootstrap registers the instance's password with the redactor
    // (instance-file.mjs), and `assertStorable` refuses any value the redactor would rewrite. A folder path that holds
    // the password could not be saved at all; the key of that folder can.
    register(basename(root));
    try {
      assert.throws(() => assertStorable({ checkout: root }), /the redactor would rewrite it/,
        'precondition: the guard does refuse the path itself');
      assert.doesNotThrow(() => assertStorable({ checkout: key }));
    } finally { forgetSecrets(); }
  });

test('ARC-09-C198 — a record says which of the two it is', () => {
  assert.equal(notHereReason({ checkout: 'a key written in another folder' }), 'other-folder');
  assert.equal(notHereReason({ steps: {} }), 'no-folder');
});
