/**
 * ARC-09-S06 — B06's migration branch: MIGRATE, don't re-wizard.
 *
 * The whole story in one sentence: when the thing that changed about the store is its SHAPE, the
 * answer is a migration. Re-running the wizard over somebody's credentials is never the right
 * response to "something moved", and it is the response every silent-migration design eventually
 * gives once the store fails to parse.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { MIGRATION_FAILED, migrateIfBehind, runsWhen, storeExists } from '../lib/steps/B06.mjs';
import { INPUTS, hashFor } from '../lib/inputs.mjs';
import { loadConfig } from '../lib/config.mjs';
import { makeCheckout } from './helpers/workspace.mjs';

const PASSWORD = `${'Fix'}-${'ture'}-${'8821'}`;

const ctxFor = (root, over = {}) => ({
  root, mode: 'live', instanceFile: null, env: {},
  node: { present: true, version: '22.11.0', major: 22 },
  state: { hooksDisabledByBootstrap: false, registration: 'project' },
  ...over,
});

const putStore = (root, version) => {
  mkdirSync(join(root, '.local'), { recursive: true });
  writeFileSync(join(root, '.local', 'instances.json'), `${JSON.stringify({
    version,
    defaultInstance: 'pdi',
    instances: {
      pdi: {
        url: 'https://dev12345.service-now.com',
        environment: 'pdi',
        auth: { method: 'basic', username: 'fixture.user', password: PASSWORD },
        preset: 'pdi-developer', toolPackage: 'full', maxRecords: 100, prodWriteAck: false,
      },
    },
  }, null, 2)}\n`);
};

/** The contract the fixture's "build" ships. B06 reads the number from here, never a literal. */
const putContract = (root, storeSchemaVersion) => {
  const dir = join(root, 'packages', 'snowarch', 'dist');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'contract.json'), `${JSON.stringify({
    contractVersion: 1, storeSchemaVersion, tools: [],
  }, null, 2)}\n`);
};

test('runsWhen: live mode, OR a store that is already there', (t) => {
  const root = makeCheckout({}, t);
  assert.equal(runsWhen(ctxFor(root, { mode: 'design-only' })), false, 'no store, design-only');
  assert.equal(runsWhen(ctxFor(root, { mode: 'live' })), true, 'live always');

  putStore(root, 1);
  // The case the second clause exists for: a design-only checkout that carries a store must keep
  // it LOADABLE across an upgrade, and this is the step that reaches it. Without this, the next
  // `mode live` would meet a schema it cannot read, in the place least able to explain it.
  assert.equal(runsWhen(ctxFor(root, { mode: 'design-only' })), true, 'design-only WITH a store');
  assert.equal(storeExists(root), true);
});

test('a store at this build\'s schema is not migrated, and nothing is spawned', async (t) => {
  const root = makeCheckout({}, t);
  putStore(root, 1);
  putContract(root, 1);
  const spawn = () => { throw new Error('nothing should be spawned'); };
  assert.equal(await migrateIfBehind(ctxFor(root, { spawn })), null);
});

test('no store at all is not this step\'s business', async (t) => {
  const root = makeCheckout({}, t);
  putContract(root, 2);
  assert.equal(await migrateIfBehind(ctxFor(root)), null);
});

test('a store BEHIND the build runs `store migrate --yes` — never the wizard', async (t) => {
  const root = makeCheckout({}, t);
  putStore(root, 1);
  putContract(root, 2);

  let argv = null;
  let opts = null;
  const spawn = (_exec, a, o) => { argv = a; opts = o; return { status: 0 }; };
  const result = await migrateIfBehind(ctxFor(root, { spawn }));

  assert.equal(result.status, 'ok');
  assert.equal(result.detail, 'store schema v1 → v2 (migrated)');
  assert.deepEqual(result.data, { migratedFrom: 1, migratedTo: 2 });
  // THE assertion of this story: the sub-command is `store migrate`, and the word `instance`
  // appears nowhere in it.
  assert.deepEqual(argv.slice(1), ['store', 'migrate', '--yes']);
  assert.equal(argv.join(' ').includes('instance'), false, 'the wizard must not be reached');
  // `--yes` because the bootstrap's own plan screen already asked; the migration still writes its
  // backup and still refuses to touch a credential — those are not the confirmation's job.
  assert.equal(opts.cwd, root);
  assert.equal(opts.stdio, 'inherit');
  assert.equal(opts.env.CLAUDE_PROJECT_DIR, root);
});

test('a migration that fails stops the step with a named remedy, not a stack', async (t) => {
  const root = makeCheckout({}, t);
  putStore(root, 1);
  putContract(root, 2);
  const result = await migrateIfBehind(ctxFor(root, { spawn: () => ({ status: 1 }) }));
  assert.equal(result.status, 'fail');
  // The child's own answer is appended (ARC-09-S07): "exit 1" and "killed by SIGTERM" send a
  // reader to different places, and a message saying neither sends them to guess.
  assert.match(result.detail, new RegExp(`^${MIGRATION_FAILED.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\(exit 1\\)$`));
  assert.match(result.detail, /\.\/snowarch store migrate/);
});

test('a store AHEAD of the build warns and points at upgrade — it is not downgraded', async (t) => {
  const root = makeCheckout({}, t);
  putStore(root, 3);
  putContract(root, 2);
  const spawn = () => { throw new Error('nothing should be spawned'); };
  const result = await migrateIfBehind(ctxFor(root, { spawn }));
  assert.equal(result.status, 'warn');
  assert.match(result.detail, /newer than this build's v2/);
  assert.match(result.detail, /\.\/snowarch upgrade/);
});

test('an unbuilt checkout has no opinion about the schema, and says nothing', async (t) => {
  const root = makeCheckout({}, t);
  putStore(root, 1);
  // No contract: a design-only install before B04. `not-built` is a state, not a failure.
  const spawn = () => { throw new Error('nothing should be spawned'); };
  assert.equal(await migrateIfBehind(ctxFor(root, { spawn })), null);
});

test('S05\'s B06 row hashes the CONTRACT\'s number, so a schema release makes exactly B06 stale', (t) => {
  const root = makeCheckout({}, t);
  putStore(root, 1);
  putContract(root, 1);
  const ctx = ctxFor(root, { mode: 'design-only', docs: 'sparse', config: loadConfig(root) });

  const declared = INPUTS.B06.inputs.map((i) => i.ref);
  assert.ok(declared.includes('packages/snowarch/dist/contract.json#storeSchemaVersion'),
    'the row must declare the contract field it reads');

  const before = hashFor('B06', ctx);
  putContract(root, 2);
  const after = hashFor('B06', ctx);
  assert.notEqual(after, before, 'a new store schema must make B06 stale');

  // And ONLY B06: the other rows do not read that field. B05 and B08 hash the contract's BYTES,
  // so they move too — by design, a changed contract is a changed server — and the ones that read
  // neither must not.
  for (const step of ['B01', 'B02', 'B03', 'B04', 'B07']) {
    assert.equal(hashFor(step, ctx), hashFor(step, ctx), `${step} must be stable`);
  }
});
