import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { DESIGN_STEPS, modeCommand, stepsFor } from '../lib/mode.mjs';
import { STEPS } from '../lib/steps/index.mjs';
import { hashInputs } from '../lib/steps/inputs.mjs';
import { EXIT_OK } from '../lib/exit.mjs';
import { computeSettings, hookEntry, HOOKS_LEFT_ALONE } from '../lib/settings-local.mjs';
import { emptyState, loadState, saveState } from '../lib/state.mjs';
import { instanceKeptNote, restartSentence } from '../lib/text.mjs';
import { makeCheckout, recorder, stub } from './helpers/workspace.mjs';

/**
 * ARC-06-S12 — which steps each form runs, and what the toggle does on the way through.
 *
 * The selection is asserted against the REAL registry; the run is driven with stubs. Proving the
 * list by running it would mean `npm ci`, a wizard and a handshake in a unit test — S14's
 * integration suite is where those belong, and a test that slow is a test people skip.
 */
const STORE = '{"defaultInstance":"dev1","instances":{}}\n';

const bootstrapped = (root, patch = {}) => {
  mkdirSync(join(root, '.local'), { recursive: true });
  saveState(root, {
    ...emptyState({ engineVersion: '0.0.0-test' }),
    mode: 'design-only',
    docs: { mode: 'skip', pin: 'a'.repeat(40) },
    ...patch,
  });
};

test('the live form runs everything after the preflight; the design form runs two steps', () => {
  assert.deepEqual(stepsFor('live', STEPS).map((s) => s.id),
    ['B01', 'B02', 'B03', 'B04', 'B05', 'B06', 'B07', 'B08', 'B09']);
  assert.deepEqual(stepsFor('design', STEPS).map((s) => s.id), ['B07', 'B09']);
  assert.deepEqual([...DESIGN_STEPS], ['B07', 'B09']);
  // B00 is absent from the live list because it has already run as the preflight — not because
  // `mode live` skips it. `mode-report.test.mjs` covers the case where it fails.
  assert.equal(stepsFor('live', STEPS).some((s) => s.id === 'B00'), false);
});

test('criterion 1 — a live switch caches B01–B03 and runs B04 onwards', async () => {
  const root = makeCheckout();
  const ran = [];
  const registry = STEPS.map((s) => stub(s.id, {
    runsWhen: () => true, inputs: () => [], onRun: async () => { ran.push(s.id); return { status: 'ok' }; },
  }));
  // B01–B03 have a recorded `ok` whose hash still matches, so the runner stands on them. That is
  // the runner's rule, exercised here rather than restated.
  //
  // The hasher is injected with the stubs (ARC-09-S05): the runner hashes a step from the INPUTS
  // table by id, and these stubs only borrow the real ids — asking the table about them would
  // hash the real rows, which is a fact about the checkout rather than about the rule under test.
  // One constant for every stub, so what decides the outcome is whether a step has a RECORD.
  const hash = hashInputs(root, []);          // computed, never typed — the runner's own function
  const cached = Object.fromEntries(['B01', 'B02', 'B03'].map((id) => [id,
    { status: 'ok', inputsHash: hash, finishedAt: new Date().toISOString(), durationMs: 1 }]));
  bootstrapped(root, { steps: cached });
  writeFileSync(join(root, '.local', 'instances.json'), STORE);

  const log = recorder();
  const code = await modeCommand({ root, positional: ['live'], flags: { yes: true }, log,
    env: {}, cwd: root, registry, hash: () => hash });
  assert.equal(code, EXIT_OK, log.lines.join('\n'));
  const text = log.lines.join('\n');
  for (const id of ['B01', 'B02', 'B03']) {
    assert.match(text, new RegExp(`\\[${id}/09\\][^\\n]*ok \\(cached\\)`), `${id} was not cached`);
    assert.equal(ran.includes(id), false, `${id} ran anyway`);
  }
  for (const id of ['B04', 'B05', 'B06', 'B07', 'B08', 'B09']) {
    assert.equal(ran.includes(id), true, `${id} did not run`);
  }
  assert.equal(loadState(root).mode, 'live');
});

test('criterion 2 — a design switch touches the toggle and leaves the store byte-identical', async () => {
  const root = makeCheckout();
  bootstrapped(root, { mode: 'live', registration: 'project' });
  writeFileSync(join(root, '.local', 'instances.json'), STORE);
  // The live toggle, as B07 would have left it.
  writeFileSync(join(root, '.claude', 'settings.local.json'),
    `${JSON.stringify({ enabledMcpjsonServers: ['servicenow'], permissions: { allow: ['Bash(ls:*)'] } }, null, 2)}\n`);

  const log = recorder();
  const code = await modeCommand({ root, positional: ['design'], flags: {}, log, env: {}, cwd: root });
  assert.equal(code, EXIT_OK, log.lines.join('\n'));

  const ids = log.lines.filter((l) => /^\[B\d\d\//.test(l)).map((l) => l.slice(1, 4));
  assert.deepEqual(ids, ['B07', 'B09'], 'a design switch ran something else');

  const settings = JSON.parse(readFileSync(join(root, '.claude/settings.local.json'), 'utf8'));
  assert.deepEqual(settings.disabledMcpjsonServers, ['servicenow']);
  assert.equal('enabledMcpjsonServers' in settings, false);
  // The operator's own keys survive: this file is theirs, and the bootstrap's business with it is
  // two array members and a hook.
  assert.deepEqual(settings.permissions, { allow: ['Bash(ls:*)'] });

  assert.equal(readFileSync(join(root, '.local', 'instances.json'), 'utf8'), STORE);
  assert.equal(loadState(root).mode, 'design-only');
});

test('...and says so: the instance is kept, and a running Claude has to reconnect', async () => {
  const root = makeCheckout();
  bootstrapped(root, { mode: 'live' });
  writeFileSync(join(root, '.local', 'instances.json'), STORE);
  const log = recorder();
  await modeCommand({ root, positional: ['design'], flags: {}, log, env: {}, cwd: root });
  const text = log.lines.join('\n');
  assert.equal(text.includes(instanceKeptNote({ label: 'dev1', env: {} })), true);
  assert.match(text, /mode live re-enables it/);
  assert.match(text, /instance remove dev1 deletes it/);
  // The sentence that separates "it did not work" from "it works after a reconnect".
  assert.equal(text.includes(restartSentence('servicenow')), true);
});

test('AC 3 — the SessionStart hook follows Node, in both directions', () => {
  // S-05 variant B: no bootstrap and no mode run ever writes `disableAllHooks`, so the story's
  // branch-A removal reduces to this. Asserted on the pure function, where both directions are one
  // line each.
  const withNode = computeSettings({}, { mode: 'design-only', nodePresent: true,
    registration: 'project', serverKey: 'servicenow' });
  assert.deepEqual(withNode.hooks, hookEntry());
  const withoutNode = computeSettings(withNode, { mode: 'design-only', nodePresent: false,
    registration: 'project', serverKey: 'servicenow' });
  assert.equal('hooks' in withoutNode, false, 'a machine that lost Node kept a hook that now fails');
  // And neither direction invents the key the story's branch A was about.
  for (const s of [withNode, withoutNode]) assert.equal('disableAllHooks' in s, false);
});

test('...and a user-set disableAllHooks is left alone, with the note', async () => {
  const root = makeCheckout();
  bootstrapped(root);
  writeFileSync(join(root, '.claude', 'settings.local.json'),
    `${JSON.stringify({ disableAllHooks: true }, null, 2)}\n`);
  const log = recorder();
  const code = await modeCommand({ root, positional: ['design'], flags: {}, log, env: {}, cwd: root });
  assert.equal(code, EXIT_OK);
  assert.equal(log.lines.join('\n').includes(HOOKS_LEFT_ALONE), true);
  const settings = JSON.parse(readFileSync(join(root, '.claude/settings.local.json'), 'utf8'));
  assert.equal(settings.disableAllHooks, true, 'the user\'s key was rewritten');
  // The state never claims authorship of a key this installation does not write.
  assert.equal(loadState(root).hooksDisabledByBootstrap, false);
});

test('...and a checkout without that key gets no note — the guard is not stuck on', async () => {
  const root = makeCheckout();
  bootstrapped(root);
  const log = recorder();
  await modeCommand({ root, positional: ['design'], flags: {}, log, env: {}, cwd: root });
  assert.equal(log.lines.join('\n').includes(HOOKS_LEFT_ALONE), false);
});

test('the live subset is B06\'s until ARC-07 lands: --instance-file is the only way in', async () => {
  // Pinned deliberately. B06's interactive path prints "instance wizard not available in this
  // build" today, and ARC-07-S05 is what flips it; this test is the tripwire that says so when it
  // does.
  const b06 = STEPS.find((s) => s.id === 'B06');
  const source = readFileSync(new URL('../lib/steps/B06.mjs', import.meta.url), 'utf8');
  assert.match(source, /instance wizard not available in this build/);
  assert.equal(b06.runsWhen({ mode: 'live' }), true);
  assert.equal(b06.runsWhen({ mode: 'design-only' }), false);

  // ARC-09-S06 added the second clause: a design-only checkout that CARRIES a store runs B06 too,
  // because a schema change has to reach that file in either mode. Without a root there is no
  // store to find, and asking must not throw — `mode` alone is a ctx a caller really passes.
  const root = makeCheckout();
  assert.equal(b06.runsWhen({ mode: 'design-only', root }), false, 'no store yet');
  mkdirSync(join(root, '.local'), { recursive: true });
  writeFileSync(join(root, '.local', 'instances.json'), '{"version":1,"instances":{}}\n');
  assert.equal(b06.runsWhen({ mode: 'design-only', root }), true, 'a store is there');
});
