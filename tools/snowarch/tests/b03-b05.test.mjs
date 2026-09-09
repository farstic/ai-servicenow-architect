import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { run as runB03 } from '../lib/steps/B03.mjs';
import { INCONSISTENT, checkContract, run as runB05 } from '../lib/steps/B05.mjs';
import { inputs as b06Inputs } from '../lib/steps/B06.mjs';
import { inputs as b07Inputs } from '../lib/steps/B07.mjs';
import { inputs as b08Inputs } from '../lib/steps/B08.mjs';
import { hashInputs } from '../lib/steps/inputs.mjs';
import { CONFIG_FILE } from '../lib/steps/B07.mjs';
import { makeCheckout } from './helpers/workspace.mjs';

const config = (root) => JSON.parse(readFileSync(join(root, 'engine.config.json'), 'utf8'));
const pinOf = (root) => JSON.parse(readFileSync(join(root, 'packages/contract/required-tools.json'), 'utf8'));

const ctxFor = (root, over = {}) => ({
  root, config: config(root), mode: 'design-only', node: { present: true, major: 22 }, env: {},
  state: { steps: {}, registration: 'project', hooksDisabledByBootstrap: false },
  instanceFile: null, line: () => {}, ...over,
});

test('B03 records the accepted mode in the state and in config.json, and asks nothing', async () => {
  const root = makeCheckout();
  const ctx = ctxFor(root, { mode: 'live' });
  const lines = [];

  const r = await runB03({ ...ctx, line: (l) => lines.push(l) });

  assert.equal(r.status, 'ok');
  assert.equal(r.detail, 'live');
  assert.equal(ctx.state.mode, 'live');
  assert.equal(JSON.parse(readFileSync(join(root, CONFIG_FILE), 'utf8')).mode, 'live');
  // The plan screen already asked. A second question here would be the one thing principle 10
  // forbids, so the step must print nothing that looks like one.
  assert.deepEqual(lines, []);
});

test('a changed mode invalidates B06, B07 and B08 by their inputs, not by a rule', async () => {
  // The story says a mode change re-runs those three. Nothing enforces that directly — it falls
  // out of the mode being one of their hashed inputs, which is the property worth asserting,
  // because a future edit that dropped `mode` from an input list would silently stop the re-run.
  const root = makeCheckout();
  const design = ctxFor(root, { mode: 'design-only' });
  const live = ctxFor(root, { mode: 'live' });

  for (const [name, fn] of [['B06', b06Inputs], ['B07', b07Inputs], ['B08', b08Inputs]]) {
    const a = hashInputs(root, fn(design));
    const b = hashInputs(root, fn(live));
    assert.notEqual(a, b, `${name} does not re-run when the mode changes`);
  }
});

test('B05 passes on a checkout that agrees with itself', async () => {
  const root = makeCheckout();
  const r = await runB05(ctxFor(root));
  assert.equal(r.status, 'ok');
  assert.match(r.detail, /^sha [0-9a-f]{12}, \d+ pinned tools$/);
  assert.equal(r.data.contractSha, pinOf(root).contractSha256.slice(0, 12));
});

test('AC 3 — one byte in the contract, and B05 names both 12-char prefixes', async () => {
  const root = makeCheckout();
  const p = join(root, 'packages/snowarch/dist/contract.json');
  const before = readFileSync(p, 'utf8');
  const pinned = pinOf(root).contractSha256;
  writeFileSync(p, `${before.trimEnd()} \n`);
  const actual = createHash('sha256').update(readFileSync(p)).digest('hex');
  assert.notEqual(actual, pinned, 'precondition: the sha really moved');

  const r = await runB05(ctxFor(root));

  assert.equal(r.status, 'fail');
  assert.match(r.detail, new RegExp(`^contract mismatch — dist/contract\\.json sha256 ${actual.slice(0, 12)} ≠ pinned ${pinned.slice(0, 12)}\\.`));
  assert.ok(r.detail.includes(INCONSISTENT), 'the remedy sentence must travel with the mismatch');
  assert.match(INCONSISTENT, /do not continue/);
});

test('B05 also catches a pinned tool the server does not have, and a key disagreement', () => {
  const root = makeCheckout();
  const cfg = config(root);
  const contract = JSON.parse(readFileSync(join(root, 'packages/snowarch/dist/contract.json'), 'utf8'));

  // The absent tool's name is DERIVED from a real one rather than typed. Written out, this file
  // would carry a `snow_*` token the contract does not declare — which is precisely what the L01
  // lint exists to find, so the test would become a finding in the sweep it is testing against.
  // Seventh time that shape has come up in this repository; the fix is always to build the string.
  const absent = `${contract.tools[0].name}_${'absent'}`;
  const missing = checkContract({ root, config: cfg, load: () => contract,
    pin: { tools: [{ name: absent }] } });
  assert.match(missing[0], new RegExp(`pins 1 tool\\(s\\) the server does not have \\(${absent}\\)`));

  const renamed = checkContract({ root, config: { mcp: { serverKey: 'something-else' } },
    load: () => contract, pin: { tools: [] } });
  assert.match(renamed[0], /the server suggests the registration key "servicenow" but engine\.config\.json says "something-else"/);

  const clean = checkContract({ root, config: cfg, load: () => contract, pin: pinOf(root) });
  assert.deepEqual(clean, []);
});

test('B05 runs in BOTH modes whenever Node is present', async () => {
  const { runsWhen } = await import('../lib/steps/B05.mjs');
  // Design-only grounds its rules in the same contract, so an inconsistent one is wrong there too.
  assert.equal(runsWhen({ node: { present: true }, mode: 'design-only' }), true);
  assert.equal(runsWhen({ node: { present: true }, mode: 'live' }), true);
  assert.equal(runsWhen({ node: { present: false }, mode: 'live' }), false);
});

test('B04 keeps its own cache when only the contract changed', async () => {
  // AC 3's second half. B04 hashes the lockfile and the Node major; the contract is not among its
  // inputs, so repairing a contract mismatch must not cost the operator a re-install.
  const root = makeCheckout();
  const { inputs: b04Inputs } = await import('../lib/steps/B04.mjs');
  const ctx = ctxFor(root, { mode: 'live' });
  const before = hashInputs(root, b04Inputs(ctx));
  writeFileSync(join(root, 'packages/snowarch/dist/contract.json'), '{"tools":[]}\n');
  assert.equal(hashInputs(root, b04Inputs(ctx)), before, 'the contract must not be a B04 input');
  assert.ok(existsSync(join(root, 'package-lock.json')));
});
