// ARC-06-C18 — B06's console line says WHICH instance it kept, and why the wizard did not run.
//
// The owner's sitting (2026-09-23): B06 printed `[B06/09] instance … ok (0.0 s)` while the detail —
// `kept instance "pdi"` — went only into the state file and the doctor's JSON. So the one line a
// person watching an upgrade actually reads said nothing about the decision B06 had just made on
// their behalf, and the decision is the interesting part: it is the keep-path that ARC-08-C28 was
// raised over, where the wizard used to re-prompt over an existing instance.
//
// The line is the user's terminal, so nothing here is masked — the same audience argument as
// ARC-09-C53. The JSON keeps its shape: `data` is unchanged, and consumers of it see no difference.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { runSteps, stepById } from '../lib/steps/index.mjs';
import { emptyState } from '../lib/state.mjs';
import { makeCheckout } from './helpers/workspace.mjs';

/** A live checkout whose store already holds a default instance — the keep-path's precondition. */
function checkoutWithInstance(t, label = 'pdi') {
  const root = makeCheckout({}, t);
  mkdirSync(join(root, '.local'), { recursive: true });
  writeFileSync(join(root, '.local', 'instances.json'), `${JSON.stringify({
    version: 1,
    defaultInstance: label,
    instances: {
      [label]: {
        url: 'https://example.service-now.com',
        environment: 'pdi',
        auth: { method: 'basic', username: 'u', password: 'p' },
        preset: 'read-only',
        flags: { WRITE_ENABLED: 'false', CMDB_WRITE_ENABLED: 'false', SCRIPTING_ENABLED: 'false',
          ATF_ENABLED: 'false', NOW_ASSIST_ENABLED: 'false', FLUENT_ENABLED: 'false' },
        toolPackage: 'full',
        maxRecords: 100,
        prodWriteAck: false,
      },
    },
  }, null, 2)}\n`);
  return root;
}

/** B06 alone, driven through the runner that prints its line — the level a user meets it at. */
async function runB06(t, { label = 'pdi' } = {}) {
  const root = checkoutWithInstance(t, label);
  const lines = [];
  const state = emptyState({ engineVersion: '2.0.0-test', platform: 'darwin' });
  state.mode = 'live';
  const result = await runSteps({
    root,
    ctx: { root, mode: 'live', docs: 'sparse', env: {}, yes: true,
      node: { present: true, version: '22.11.0', major: 22 } },
    state,
    steps: [stepById('B06')],
    save: () => {},
    onLine: (l) => lines.push(l),
  });
  return { lines, state, result, root };
}

test('ARC-06-C18 — the kept-instance line names the instance on the line a person reads', async (t) => {
  const { lines, state } = await runB06(t);
  const line = lines.find((l) => l.includes('[B06')) ?? '';
  assert.notEqual(line, '', `B06 printed no step line: ${JSON.stringify(lines)}`);

  // THE LABEL, on the step line itself — not only in the state file underneath it.
  assert.match(line, /"pdi"/,
    `the console line does not say which instance was kept: ${line}`);
  // ...and WHY the wizard did not run, because "kept" without a reason reads as a status rather
  // than a decision, and the decision is the one ARC-08-C28 was raised over.
  assert.match(line, /store already has one|did not run|no wizard/i,
    `the console line does not say why the wizard did not run: ${line}`);

  // NOTHING IS MASKED: this is the user's own terminal (ARC-09-C53's audience argument).
  assert.equal(line.includes('<label>'), false, `a redaction mask reached the terminal: ${line}`);

  // THE JSON KEEPS ITS SHAPE — `data` is what consumers read and it must not move.
  const entry = state.steps.B06;
  assert.equal(entry.status, 'ok');
  assert.equal(entry.data?.kept, true);
  assert.equal(entry.data?.defaultInstance, 'pdi');
  assert.equal(entry.data?.saved, 0);
});

test('ARC-06-C18 — the label on the line is the store\'s, not a constant', async (t) => {
  // The cheapest way for a line like this to be wrong is to be right once: a second label proves it
  // is read rather than spelled.
  const { lines } = await runB06(t, { label: 'acme-dev' });
  const line = lines.find((l) => l.includes('[B06')) ?? '';
  assert.match(line, /"acme-dev"/, `the line did not carry the store's own label: ${line}`);
  assert.equal(line.includes('"pdi"'), false, 'the line carries a label from somewhere else');
});
