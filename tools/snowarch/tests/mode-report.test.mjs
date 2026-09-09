import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { modeCommand, NOT_BOOTSTRAPPED, userScopeRefusal, USER_SCOPE_REFUSAL } from '../lib/mode.mjs';
import { LIVE_YES_WITHOUT_FILE } from '../lib/bootstrap.mjs';
import { EXIT_OK, EXIT_PREREQ, EXIT_USAGE } from '../lib/exit.mjs';
import { emptyState, saveState } from '../lib/state.mjs';
import { modeLine, registrationLine } from '../lib/text.mjs';
import { makeCheckout, recorder } from './helpers/workspace.mjs';

/**
 * ARC-06-S12 — `snowarch mode`, the reporting form and every refusal.
 *
 * The refusals are the interesting half. Each one exists because the alternative is worse than an
 * error message: registering a server for every project on the machine without being asked (user
 * scope), a live switch that will sit waiting for a password nobody can type (`--yes` with no
 * instance file), or a mode switch on a checkout that was never installed.
 */
const withState = (root, patch = {}) => {
  mkdirSync(join(root, '.local'), { recursive: true });
  const state = { ...emptyState({ engineVersion: '0.0.0-test' }), mode: 'design-only', ...patch };
  saveState(root, state);
  return state;
};

const run = async (root, positional = [], flags = {}) => {
  const log = recorder();
  const code = await modeCommand({ root, positional, flags, log, env: {}, cwd: root });
  return { code, log, text: log.lines.join('\n') };
};

test('a checkout that was never bootstrapped is a prerequisite failure, not a mode', async () => {
  const root = makeCheckout();
  const r = await run(root);
  assert.equal(r.code, EXIT_PREREQ);
  assert.match(r.text, /has not been bootstrapped/);
  assert.equal(r.text.includes(NOT_BOOTSTRAPPED), true);
});

test('mode prints the S09 Mode line and the registration kind — one definition each', async () => {
  const root = makeCheckout();
  withState(root);
  const r = await run(root);
  assert.equal(r.code, EXIT_OK);
  // Asserted against the FUNCTIONS, not against a copy of their output: the banner, /snowarch
  // status and the launchers print the same two lines, and a literal here would be a fifth
  // opinion about what they say.
  assert.equal(r.log.lines[0], modeLine({ mode: 'design-only' }));
  assert.equal(r.log.lines[1], registrationLine('project'));
});

test('...and names the instance when the store has one and the mode is live', async () => {
  const root = makeCheckout();
  withState(root, { mode: 'live',
    steps: { B08: { status: 'ok',
      data: { instance: { label: 'dev1', environment: 'dev', preset: 'read-only' } } } } });
  writeFileSync(join(root, '.local', 'instances.json'), '{"defaultInstance":"dev1"}\n');
  const r = await run(root);
  assert.match(r.log.lines[0], /^Mode: live — instance=dev1 \(dev\) preset=read-only$/);
});

test('each registration kind prints its consequence, not just its name', async () => {
  const root = makeCheckout();
  for (const [kind, expected] of [
    ['project', 'registration: project (.mcp.json)'],
    ['local', 'registration: local (~/.claude.json, this checkout only)'],
    ['user', 'registration: user (~/.claude.json, every project — not recommended)'],
  ]) {
    withState(root, { registration: kind });
    const r = await run(root);
    assert.equal(r.log.lines[1], expected, kind);
  }
});

test('--json carries both lines and the label, and nothing else', async () => {
  const root = makeCheckout();
  withState(root, { registration: 'local' });
  writeFileSync(join(root, '.local', 'instances.json'), '{"defaultInstance":"dev1"}\n');
  const r = await run(root, [], { json: true });
  const payload = JSON.parse(r.log.lines[0]);
  assert.deepEqual(Object.keys(payload).sort(),
    ['defaultInstance', 'mode', 'modeLine', 'registration', 'registrationLine']);
  assert.equal(payload.registration, 'local');
  assert.equal(payload.defaultInstance, 'dev1');
  // The label is the ONLY thing from the store that appears. A URL or a username here would end up
  // in whatever pipeline reads this object.
  assert.equal(JSON.stringify(payload).includes('http'), false);
});

test('--register user is refused without the acknowledgement, in the story\'s words', async () => {
  const root = makeCheckout();
  withState(root);
  const r = await run(root, ['live'], { register: 'user' });
  assert.equal(r.code, EXIT_USAGE);
  assert.equal(r.text.includes(USER_SCOPE_REFUSAL), true);
  assert.match(r.text, /every project on this machine/);
  assert.match(r.text, /prefer --register local/);
});

test('...and the sentence names the configured server key, not a literal', () => {
  // A checkout that renamed the server in engine.config.json must not be told about "servicenow".
  assert.match(userScopeRefusal('acme_now'), /"acme_now" server to every project/);
  assert.equal(userScopeRefusal('acme_now').includes('servicenow'), false);
});

test('an unknown scope and an unknown target are usage errors that name what is allowed', async () => {
  const root = makeCheckout();
  withState(root);
  const scope = await run(root, ['live'], { register: 'global' });
  assert.equal(scope.code, EXIT_USAGE);
  assert.match(scope.text, /--register must be project, local, user/);
  const target = await run(root, ['sideways']);
  assert.equal(target.code, EXIT_USAGE);
  assert.match(target.text, /mode takes live or design/);
});

test('criterion 7 — mode live --yes with no store and no --instance-file is S03\'s sentence', async () => {
  const root = makeCheckout();
  withState(root);
  const r = await run(root, ['live'], { yes: true });
  assert.equal(r.code, EXIT_USAGE);
  // Imported from bootstrap.mjs, not retyped: one reason, one phrasing, whichever command hits it.
  assert.equal(r.text.includes(LIVE_YES_WITHOUT_FILE), true);
});

test('...and the same command WITH a store is allowed to proceed past that check', async () => {
  // Otherwise the test above would pass for a `mode live --yes` that refuses unconditionally.
  const root = makeCheckout();
  withState(root);
  writeFileSync(join(root, '.local', 'instances.json'), '{"defaultInstance":"dev1"}\n');
  const log = recorder();
  const code = await modeCommand({ root, positional: ['live'], flags: { yes: true }, log,
    env: {}, cwd: root,
    // Stopped at the preflight on purpose: this asserts which check refused, not a whole run.
    registry: [{ id: 'B00', title: 'preflight', needsNode: false, runsWhen: () => true,
      cacheable: false, inputs: () => [], run: async () => ({ status: 'fail', detail: 'stub' }) }],
  });
  assert.notEqual(code, EXIT_USAGE);
  assert.equal(log.lines.join('\n').includes(LIVE_YES_WITHOUT_FILE), false);
});

test('a missing --instance-file is refused before anything runs', async () => {
  const root = makeCheckout();
  withState(root);
  const r = await run(root, ['live'], { 'instance-file': join(root, 'nope.json') });
  assert.equal(r.code, EXIT_USAGE);
  assert.match(r.text, /does not exist/);
});
