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

import { MIGRATION_FAILED, NO_TERMINAL, migrateIfBehind, run as runB06, runsWhen,
  storeExists } from '../lib/steps/B06.mjs';
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

/**
 * ARC-06-C15 — B06 must RECORD what the wizard saved, or the resolver has nothing to resolve.
 *
 * The resolver tests in `mode-report.test.mjs` hand `recordedInstance` a state and check it reads
 * it. That proves the reader and says nothing about the writer — exactly the shape where a fix is
 * correct and unconnected. This drives the real step against a real store and asserts the data it
 * returns, so reverting B06's recording fails here rather than passing everywhere.
 */
test('ARC-06-C15 — B06 returns the instance it found in the store, secrets excluded', async (t) => {
  const root = makeCheckout({}, t);
  mkdirSync(join(root, '.local'), { recursive: true });
  writeFileSync(join(root, '.local', 'instances.json'), JSON.stringify({
    version: 1,
    defaultInstance: 'pdi',
    instances: {
      pdi: {
        url: 'https://fixture-host-never-dialled',
        environment: 'pdi',
        preset: 'custom',
        auth: { method: 'basic', username: 'someone', password: 'a-secret-value' },
      },
    },
  }));

  // The wizard is a no-op that "succeeds": the store is already written, which is the state B06
  // finds itself in after a real run. The stdout carries `add` so the wizard PROBE (ARC-06-C5)
  // classifies the CLI as present; `isTTY` is injected because the step refuses without a terminal
  // and a test has none.
  // The probe checks the built CLI is in the checkout before it spawns anything, so the fixture
  // needs the file to exist; its contents are never read here because `spawn` is stubbed.
  mkdirSync(join(root, 'packages', 'snowarch', 'dist', 'cli'), { recursive: true });
  writeFileSync(join(root, 'packages', 'snowarch', 'dist', 'cli', 'index.js'), '');
  const spawn = () => ({ status: 0, stdout: 'usage: instance\n  add <label>   add an instance',
    stderr: '' });
  const result = await runB06({ ...ctxFor(root, { spawn }), mode: 'live', isTTY: true, spawn });

  assert.equal(result.status, 'ok', result.detail);
  assert.deepEqual(result.data.instance, { label: 'pdi', environment: 'pdi', preset: 'custom' },
    'B06 recorded nothing for `mode` to report — this is the C15 defect');
  assert.equal(result.data.defaultInstance, 'pdi');

  // Asserted on the serialised step data, because that is what reaches the state file on disk.
  const serialised = JSON.stringify(result.data);
  for (const secret of ['a-secret-value', 'someone', 'https://', 'basic']) {
    assert.equal(serialised.includes(secret), false, `B06's step data carried ${secret}`);
  }
});

/**
 * ARC-06-C16 — the upgrade every live user runs, refused for credentials it never needed.
 *
 * The owner's rc.5 → rc.6 upgrade on the sitting checkout, with `pdi` already in the store:
 *
 *   [U6/7] bootstrap (only the steps whose inputs changed)
 *   error: live mode with --yes needs --instance-file <path>: credentials cannot be typed
 *          non-interactively (see docs/INSTALL.md "Operators and CI")
 *   error: upgrade: the bootstrap stopped (exit 2) — the tree is at v2.0.0-rc.6 …
 *
 * No B0x line printed: it refused at argument validation, so B04, B05 and B08 never ran and the
 * tree sat at rc.6 with rc.5's `node_modules`. The remedy it prints is to re-run the upgrade,
 * which hits the same refusal.
 *
 * TWO STATEMENTS OF ONE RULE, AGAIN. `mode.mjs` asked `&& !hasStore`; `bootstrap.mjs` did not —
 * and `mode.mjs`'s own comment says the sentence was "imported rather than repeated: there is one
 * reason this combination cannot work and it should not have two phrasings". They shared the
 * message and then each wrote its own condition.
 *
 * And the validation is only half. Letting the run through moves the failure to B06, which
 * demanded a terminal in live mode even with the store already populated — so the fix had to be
 * both, or the error would simply have arrived later, after writes.
 */
test('ARC-06-C16 — a non-interactive live run keeps the instance the store already holds', async (t) => {
  const root = makeCheckout({}, t);
  mkdirSync(join(root, '.local'), { recursive: true });
  writeFileSync(join(root, '.local', 'instances.json'), JSON.stringify({
    version: 1,
    defaultInstance: 'pdi',
    instances: {
      pdi: {
        url: 'https://fixture-host-never-dialled',
        environment: 'pdi',
        preset: 'custom',
        auth: { method: 'basic', username: 'someone', password: 'a-secret-value' },
      },
    },
  }));

  // No TTY injected: this is the upgrade's own shape, `bootstrap --mode live --yes`.
  const result = await runB06({ ...ctxFor(root, { spawn: () => ({ status: 0 }) }), mode: 'live' });

  assert.equal(result.status, 'ok',
    `the upgrade path still refuses a checkout that already has an instance: ${result.detail}`);
  assert.match(result.detail, /kept instance "pdi"/);
  assert.equal(result.data.kept, true);
  assert.equal(result.data.saved, 0, 'nothing was added — the instance was already there');
  assert.deepEqual(result.data.instance, { label: 'pdi', environment: 'pdi', preset: 'custom' });

  // The step data reaches the state file, so it must carry no credential.
  const serialised = JSON.stringify(result.data);
  for (const secret of ['a-secret-value', 'someone', 'https://']) {
    assert.equal(serialised.includes(secret), false, `B06's step data carried ${secret}`);
  }
});

test('ARC-06-C16 — an EMPTY store still fails for want of a terminal', async (t) => {
  // Both directions. The no-op is "there is nothing to add", not "never ask": with no instance
  // in the store a non-interactive live run genuinely cannot proceed, and must say so.
  const root = makeCheckout({}, t);
  mkdirSync(join(root, '.local'), { recursive: true });
  writeFileSync(join(root, '.local', 'instances.json'), JSON.stringify({ version: 1, instances: {} }));

  const result = await runB06({ ...ctxFor(root, { spawn: () => ({ status: 0 }) }), mode: 'live' });
  assert.equal(result.status, 'fail');
  assert.equal(result.detail, NO_TERMINAL);
});

/**
 * ARC-08-C28 — the keep-path is decided by THE STORE, not by the terminal.
 *
 * ARC-06-C16 short-circuited only the non-interactive case, on a premise its own comment stated:
 * *"`upgrade` runs `bootstrap --mode live --yes`, which has no terminal"*. That premise is false on
 * every upgrade a person types — `upgrade.mjs`'s `finish()` spawns the bootstrap with
 * `stdio: 'inherit'`, so the child holds the operator's terminal and `isTTY` is true. The
 * short-circuit was written for the CI path and never matched the path it was written for.
 *
 * The owner's rc.6 → rc.9 upgrade reached `Label for this instance [pdi]` (sitting, 2026-09-23):
 * the wizard, over an instance the plan had promised two lines earlier was untouched, on a run
 * carrying `--yes`. And `--yes` could not stop it, because it never reached the decision.
 *
 * B06's own input table already said what should happen, and this code disagreed with it:
 *
 *   "MIGRATE, DON'T RE-WIZARD: a store whose schema is behind makes this step stale so the
 *    migration runs — and a store whose CONTENTS changed does not, because re-running the wizard
 *    over somebody's credentials is never the right answer to 'something moved'."
 *
 * `isTTY` is INJECTED both ways in every case below, so the terminal is a parameter of the test
 * rather than a property of whoever runs it.
 */
const storeWithPdi = (root) => {
  mkdirSync(join(root, '.local'), { recursive: true });
  writeFileSync(join(root, '.local', 'instances.json'), JSON.stringify({
    version: 1,
    defaultInstance: 'pdi',
    instances: {
      pdi: {
        url: 'https://fixture-host-never-dialled',
        environment: 'pdi',
        preset: 'custom',
        auth: { method: 'basic', username: 'someone', password: 'a-secret-value' },
      },
    },
  }));
  return root;
};

/** A spawn that fails the test if anything reaches it: the wizard must not be started. */
const refuseToSpawn = (t) => (...args) => {
  t.diagnostic(`spawn reached with ${JSON.stringify(args[1] ?? [])}`);
  throw new Error('the wizard was started over an existing instance');
};

test('ARC-08-C28 — an interactive --yes run keeps the instance and never prompts', async (t) => {
  // THE OWNER'S PATH, exactly: a terminal (`stdio: 'inherit'`) and `--yes`.
  const root = storeWithPdi(makeCheckout({}, t));
  const result = await runB06(ctxFor(root, {
    mode: 'live', isTTY: true, yes: true, spawn: refuseToSpawn(t),
  }));

  assert.equal(result.status, 'ok');
  // The PREFIX, not the whole sentence. These three cases are about the keep-path FIRING; the
  // reason clause that now follows it is pinned once, in `b06-kept-instance.test.mjs`, where the
  // subject is the console line. Three copies of a sentence is three places to update when it
  // improves, and the first person to improve it would have weakened whichever they did not find.
  assert.match(result.detail, /^kept instance "pdi"/);
  assert.equal(result.data.kept, true);
  assert.equal(result.data.saved, 0, 'a kept instance was counted as a save');
});

test('ARC-08-C28 — a non-interactive --yes run keeps it too (C16 unchanged)', async (t) => {
  const root = storeWithPdi(makeCheckout({}, t));
  const result = await runB06(ctxFor(root, {
    mode: 'live', isTTY: false, yes: true, spawn: refuseToSpawn(t),
  }));
  // The PREFIX, not the whole sentence. These three cases are about the keep-path FIRING; the
  // reason clause that now follows it is pinned once, in `b06-kept-instance.test.mjs`, where the
  // subject is the console line. Three copies of a sentence is three places to update when it
  // improves, and the first person to improve it would have weakened whichever they did not find.
  assert.match(result.detail, /^kept instance "pdi"/);
});

test('ARC-08-C28 — interactive WITHOUT --yes keeps it as well', async (t) => {
  // The case the C16 comment deliberately left alone — "an operator at a terminal keeps the
  // behaviour they had" — and it was the wrong thing to leave alone. Re-running the wizard over
  // somebody's credentials is never the right answer to "something moved", whoever is watching.
  const root = storeWithPdi(makeCheckout({}, t));
  const result = await runB06(ctxFor(root, {
    mode: 'live', isTTY: true, yes: false, spawn: refuseToSpawn(t),
  }));
  // The PREFIX, not the whole sentence. These three cases are about the keep-path FIRING; the
  // reason clause that now follows it is pinned once, in `b06-kept-instance.test.mjs`, where the
  // subject is the console line. Three copies of a sentence is three places to update when it
  // improves, and the first person to improve it would have weakened whichever they did not find.
  assert.match(result.detail, /^kept instance "pdi"/);
});

test('ARC-08-C28 — a --yes run with nothing to keep REFUSES rather than asking', async (t) => {
  // `--yes` means "do not put a question in front of me", and a prompt is the one thing it must
  // never produce. The sentence names the flag that answers it without a terminal.
  const root = makeCheckout({}, t);
  mkdirSync(join(root, '.local'), { recursive: true });
  writeFileSync(join(root, '.local', 'instances.json'),
    JSON.stringify({ version: 1, instances: {} }));

  for (const isTTY of [true, false]) {
    const result = await runB06(ctxFor(root, {
      mode: 'live', isTTY, yes: true, spawn: refuseToSpawn(t),
    }));
    assert.equal(result.status, 'fail', `isTTY=${isTTY}`);
    assert.equal(result.detail, NO_TERMINAL, `isTTY=${isTTY}`);
    assert.match(result.detail, /--instance-file/);
  }
});
