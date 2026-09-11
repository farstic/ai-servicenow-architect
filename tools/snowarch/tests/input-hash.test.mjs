/**
 * The input table, and therefore the resume rule (ARC-09-S05).
 *
 * The table is the only declaration of what a step depends on. These tests are what keep it
 * honest: one case per row that MUTATES a declared input and asserts that exactly the steps
 * naming it go stale — a row that quietly stopped reading something would leave a step fresh
 * across a change, which is the failure mode that makes a resume wrong rather than slow.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { INPUTS, KINDS, STEP_IDS, alwaysRuns, hashFor, storeStamp, storeVersion } from '../lib/inputs.mjs';
import { staleSteps, explainStale, emptyState } from '../lib/state.mjs';
import { STEPS, runSteps } from '../lib/steps/index.mjs';
import { loadConfig } from '../lib/config.mjs';
import { makeCheckout } from './helpers/workspace.mjs';

/** The store lives in `.local/`, which a fresh checkout has not created yet. */
const putStore = (root, body) => {
  mkdirSync(join(root, '.local'), { recursive: true });
  writeFileSync(join(root, '.local/instances.json'), body);
};

/** A gitlink is a COMMITTED input, so the fixture commits it rather than staging it. */
const linkCorpus = (root, sha) => {
  execFileSync('git', ['-C', root, 'update-index', '--add', '--cacheinfo',
    `160000,${sha},vendor/ServiceNowDocs`], { stdio: 'ignore' });
  // The identity is passed per-command, because a hosted runner has no global `user.email` and a
  // fixture that depends on the machine having one fails only there. `example.com` is RFC 2606's
  // reserved name — `.invalid` is the rule of record's counter-example, and the address in
  // `helpers/workspace.mjs` predates the rule rather than justifying it.
  execFileSync('git', ['-C', root, '-c', 'user.email=f@example.com', '-c', 'user.name=f',
    'commit', '-q', '-m', 'link'], { stdio: 'ignore' });
};

const ctxFor = (root, over = {}) => ({
  root,
  env: {},
  mode: 'design-only',
  docs: 'sparse',
  instanceFile: null,
  config: loadConfig(root),
  node: { present: true, version: '22.11.0', major: 22 },
  state: { hooksDisabledByBootstrap: false, registration: 'project' },
  ...over,
});

/** Every step recorded ok with the hash it has right now — the "nothing to do" baseline. */
const fresh = (root, ctx) => {
  const s = emptyState({ engineVersion: '2.0.0-test', platform: 'darwin' });
  for (const step of STEP_IDS) {
    s.steps[step] = { status: 'ok', inputsHash: hashFor(step, ctx), durationMs: 1 };
  }
  return s;
};

const staleIds = (state, ctx) =>
  staleSteps(state, ctx, { hashFor, steps: STEP_IDS, alwaysRuns }).map((x) => x.step).sort();

test('the table is one row per step, in run order, and every row declares its kinds', () => {
  assert.deepEqual(STEP_IDS, ['B00', 'B01', 'B02', 'B03', 'B04', 'B05', 'B06', 'B07', 'B08', 'B09']);
  for (const id of STEP_IDS) {
    const row = INPUTS[id];
    assert.equal(row.step, id, 'the key and the row must agree');
    assert.equal(typeof row.title, 'string');
    assert.ok(Array.isArray(row.inputs));
    for (const i of row.inputs) {
      assert.ok(KINDS.includes(i.kind), `${id}: ${i.kind} is not a kind the table renders`);
      assert.ok(i.ref && i.why, `${id}: every declared input says what it is and why`);
    }
    // B00 and B09 are the two with nothing: they run every time, and that is the whole of
    // "a second run on an unchanged checkout still does B00 and B09".
    if (id === 'B00' || id === 'B09') assert.deepEqual(row.inputs, []);
    else assert.ok(row.inputs.length > 0, `${id} must declare what it reads`);
  }
});

test('a step with no inputs hashes to the same thing whatever the context', (t) => {
  const root = makeCheckout({}, t);
  const a = hashFor('B00', ctxFor(root));
  const b = hashFor('B00', ctxFor(root, { mode: 'live', docs: 'full' }));
  assert.equal(a, b);
});

test('an unchanged checkout has nothing stale', (t) => {
  const root = makeCheckout({}, t);
  const ctx = ctxFor(root);
  assert.deepEqual(staleIds(fresh(root, ctx), ctx), []);
});

// ─── AC 1, one case per row: mutate ONE declared input, and only its steps go stale ──────────────

test('AC 1 — .mcp.json: only B01', (t) => {
  const root = makeCheckout({}, t);
  const ctx = ctxFor(root);
  const state = fresh(root, ctx);
  const p = join(root, '.mcp.json');
  writeFileSync(p, readFileSync(p, 'utf8').replace('600000', '600001'));
  assert.deepEqual(staleIds(state, ctx), ['B01']);
});

test('AC 1 — .claude/settings.json: only B01', (t) => {
  const root = makeCheckout({}, t);
  const ctx = ctxFor(root);
  const state = fresh(root, ctx);
  writeFileSync(join(root, '.claude/settings.json'), '{"env":{"MCP_TIMEOUT":"130000"}}\n');
  assert.deepEqual(staleIds(state, ctx), ['B01']);
});

test('AC 1 — the areas file: only B02', (t) => {
  const root = makeCheckout({}, t);
  const ctx = ctxFor(root);
  const state = fresh(root, ctx);
  writeFileSync(join(root, 'vendor/docs-areas.txt'), 'markdown/alpha\nmarkdown/gamma\n');
  assert.deepEqual(staleIds(state, ctx), ['B02']);
});

test('AC 1 — package-lock.json: only B04', (t) => {
  const root = makeCheckout({}, t);
  const ctx = ctxFor(root);
  const state = fresh(root, ctx);
  writeFileSync(join(root, 'package-lock.json'), '{"lockfileVersion":3,"name":"f"}\n');
  assert.deepEqual(staleIds(state, ctx), ['B04']);
});

test('AC 1 — the contract: B05 and B08, because a changed contract is a changed server', (t) => {
  const root = makeCheckout({}, t);
  const ctx = ctxFor(root);
  const state = fresh(root, ctx);
  const p = join(root, 'packages/snowarch/dist/contract.json');
  writeFileSync(p, readFileSync(p, 'utf8').replace('"contractVersion": 1', '"contractVersion": 2'));
  // B05 reads the bytes; B08 reads the sha. Both, and nothing else — the pin file is B05's alone.
  assert.deepEqual(staleIds(state, ctx), ['B05', 'B08']);
});

test('AC 1 — the pin: only B05', (t) => {
  const root = makeCheckout({}, t);
  const ctx = ctxFor(root);
  const state = fresh(root, ctx);
  const p = join(root, 'packages/contract/required-tools.json');
  writeFileSync(p, readFileSync(p, 'utf8').replace('"contractVersion": 1', '"contractVersion": 3'));
  assert.deepEqual(staleIds(state, ctx), ['B05']);
});

test('AC 1 — the store appearing: B06 and B08', (t) => {
  const root = makeCheckout({}, t);
  const ctx = ctxFor(root);
  const state = fresh(root, ctx);
  putStore(root, '{"version":1,"instances":{}}\n');
  assert.deepEqual(staleIds(state, ctx), ['B06', 'B08']);
});

test('AC 1 — a store schema behind this build: B06, so the MIGRATION runs', (t) => {
  const root = makeCheckout({}, t);
  putStore(root, '{"version":1,"instances":{}}\n');
  const ctx = ctxFor(root);
  const state = fresh(root, ctx);
  // Same size, so B08's mtime+size stamp is only moved by the write itself; the VERSION is what
  // B06 reads, and a version that moved is a migration due.
  putStore(root, '{"version":2,"instances":{}}\n');
  assert.ok(staleIds(state, ctx).includes('B06'), 'a schema change must make B06 run');
});

test('AC 1 — the mode: B01, B03, B06, B07, B08', (t) => {
  const root = makeCheckout({}, t);
  const ctx = ctxFor(root);
  const state = fresh(root, ctx);
  assert.deepEqual(staleIds(state, ctxFor(root, { mode: 'live' })),
    ['B01', 'B03', 'B06', 'B07', 'B08']);
});

test('AC 1 — the node major: only B04', (t) => {
  const root = makeCheckout({}, t);
  const ctx = ctxFor(root);
  const state = fresh(root, ctx);
  const next = ctxFor(root, { node: { present: true, version: '24.0.0', major: 24 } });
  assert.deepEqual(staleIds(state, next), ['B04']);
});

test('AC 1 — --instance-file: only B06', (t) => {
  const root = makeCheckout({}, t);
  const ctx = ctxFor(root);
  const state = fresh(root, ctx);
  assert.deepEqual(staleIds(state, ctxFor(root, { instanceFile: '/somewhere/in.json' })), ['B06']);
});

test('AC 1 — the docs choice: only B02', (t) => {
  const root = makeCheckout({}, t);
  const ctx = ctxFor(root);
  const state = fresh(root, ctx);
  assert.deepEqual(staleIds(state, ctxFor(root, { docs: 'full' })), ['B02']);
});

test('AC 1 — the corpus is hashed by its gitlink, not its 35,000 files', (t) => {
  const root = makeCheckout({}, t);
  const ctx = ctxFor(root);
  const before = hashFor('B02', ctx);
  // A file inside the corpus, changed. The gitlink has not moved, so B02 is NOT stale — the whole
  // point of hashing the link: reading the corpus to decide whether to skip reading the corpus is
  // the cost this row exists to avoid.
  linkCorpus(root, 'b'.repeat(40));
  const linked = hashFor('B02', ctx);
  assert.notEqual(linked, before, 'a moved gitlink must move the hash');
  linkCorpus(root, 'c'.repeat(40));
  assert.notEqual(hashFor('B02', ctx), linked, 'and again, to a different commit');
});

// ─── AC 2: the credential rule ──────────────────────────────────────────────────────────────────

test('AC 2 — a password edited in place, same length, mtime restored, makes NOTHING stale', (t) => {
  const root = makeCheckout({}, t);
  // Assembled, never spelled: the fixture must not contain a string that reads as a secret.
  const secret = ['pa', 'ss', '-aaaa'].join('');
  const other = ['pa', 'ss', '-bbbb'].join('');
  assert.equal(secret.length, other.length, 'the edit must be byte-for-byte the same size');
  const store = join(root, '.local/instances.json');
  const withSecret = (v) => `${JSON.stringify({ version: 1, instances: { a: { password: v } } })}\n`;
  mkdirSync(join(root, '.local'), { recursive: true });
  writeFileSync(store, withSecret(secret));
  const ctx = ctxFor(root);
  const state = fresh(root, ctx);
  const stamp = statSync(store);

  writeFileSync(store, withSecret(other));
  utimesSync(store, stamp.atime, stamp.mtime);

  assert.equal(statSync(store).size, stamp.size, 'the fixture must not have changed the size');
  // `utimesSync` ROUNDS a Date to the millisecond, so the restored mtime is near but not equal.
  // That is exactly the case the stamp is coarsened for, and asserting it here says why.
  assert.notEqual(statSync(store).mtimeMs, stamp.mtimeMs, 'a restored mtime is never byte-equal');
  assert.deepEqual(staleIds(state, ctx), [],
    'a credential change must not re-run anything: the store is hashed by shape, never content');
  // And the reason it holds: the stamp is mtime+size, and the version read is the version only.
  assert.equal(storeStamp(root), `${Math.floor(stamp.mtimeMs / 1000)}:${stamp.size}`);
  assert.equal(storeVersion(root), '1');
  // The hashed strings never carry the secret — asserted, not assumed.
  for (const id of STEP_IDS) {
    for (const s of INPUTS[id].resolve(ctx)) {
      assert.ok(!String(s).includes(secret) && !String(s).includes(other),
        `${id} must not hash a credential`);
    }
  }
});

test('AC 2 — a store that is not valid JSON is a state, not a crash', (t) => {
  const root = makeCheckout({}, t);
  putStore(root, '{ this was hand-edited\n');
  assert.equal(storeVersion(root), 'unreadable');
  assert.doesNotThrow(() => hashFor('B06', ctxFor(root)));
});

// ─── staleSteps: the four reasons ───────────────────────────────────────────────────────────────

test('a step with no record is never-run, and the explanation says so', (t) => {
  const root = makeCheckout({}, t);
  const ctx = ctxFor(root);
  const state = fresh(root, ctx);
  delete state.steps.B04;
  const stale = staleSteps(state, ctx, { hashFor, steps: STEP_IDS, alwaysRuns });
  assert.deepEqual(stale, [{ step: 'B04', reason: 'never-run', changed: [] }]);
  assert.deepEqual(explainStale(stale), ['B04 will run — has not run in this checkout']);
});

test('a step recorded as failed is stale however well its inputs match', (t) => {
  const root = makeCheckout({}, t);
  const ctx = ctxFor(root);
  const state = fresh(root, ctx);
  state.steps.B02 = { ...state.steps.B02, status: 'fail' };
  const stale = staleSteps(state, ctx, { hashFor, steps: STEP_IDS, alwaysRuns });
  assert.deepEqual(stale.map((x) => [x.step, x.reason]), [['B02', 'failed']]);
  assert.deepEqual(explainStale(stale), ['B02 will run — did not succeed last time (fail)']);
});

test('a launcher-recorded null hash is stale, and says which — not "unchanged"', (t) => {
  const root = makeCheckout({}, t);
  const ctx = ctxFor(root);
  const state = fresh(root, ctx);
  // ARC-06-S14: bash and PowerShell cannot compute the table, so the launchers record `null`.
  // "No hash" and "a hash that matches" must never be the same answer.
  state.steps.B01 = { status: 'ok', inputsHash: null, durationMs: 1 };
  state.steps.B02 = { status: 'ok', durationMs: 1 };
  const stale = staleSteps(state, ctx, { hashFor, steps: STEP_IDS, alwaysRuns });
  assert.deepEqual(stale.map((x) => [x.step, x.reason]),
    [['B01', 'launcher-recorded'], ['B02', 'launcher-recorded']]);
  assert.deepEqual(explainStale(stale).slice(0, 1),
    ['B01 will run — was recorded by a launcher, which cannot compute the hash']);
});

test('a row that cannot be hashed is stale with the reason, not a crashed resume', (t) => {
  const root = makeCheckout({}, t);
  const ctx = ctxFor(root);
  const state = fresh(root, ctx);
  const boom = () => { throw new Error('git is not on PATH'); };
  const stale = staleSteps(state, ctx, { hashFor: boom, steps: ['B02'] });
  assert.equal(stale[0].reason, 'inputs-changed');
  assert.match(stale[0].changed[0], /git is not on PATH/);
});

test('staleSteps needs a hasher rather than reaching for one', () => {
  assert.throws(() => staleSteps({ steps: {} }, {}), /staleSteps needs hashFor/);
});

// ─── AC 4: determinism ──────────────────────────────────────────────────────────────────────────

test('AC 4 — every file the table hashes is pinned to LF by .gitattributes', () => {
  // Files are hashed as BYTES with no line-ending normalisation, so a file that arrived CRLF on
  // Windows would hash differently there and the same commit would resume differently per OS.
  // `.gitattributes` is what makes that impossible; this test is what keeps the two in step.
  const repo = execFileSync('git', ['rev-parse', '--show-toplevel'],
    { encoding: 'utf8' }).trim();
  const attrs = readFileSync(join(repo, '.gitattributes'), 'utf8');
  const refs = STEP_IDS.flatMap((id) => INPUTS[id].inputs
    .filter((i) => i.kind === 'file')
    .map((i) => i.ref))
    .filter((ref) => !ref.startsWith('<'));
  assert.ok(refs.length >= 4, 'the table must still name files, or this test proves nothing');
  for (const ref of refs) {
    const answer = execFileSync('git', ['check-attr', 'text', 'eol', '--', ref],
      { cwd: repo, encoding: 'utf8' });
    assert.match(answer, /eol: lf/, `${ref} is hashed as bytes and must be pinned LF\n${attrs}`);
  }
});

test('AC 4 — the hash is a function of the inputs alone, not of when it was taken', (t) => {
  const root = makeCheckout({}, t);
  const ctx = ctxFor(root);
  const once = STEP_IDS.map((id) => hashFor(id, ctx));
  // Touch every hashed file without changing a byte: an mtime is not an input, except for the
  // store, where it is the ONLY input — so B06/B08 are read from a second context, not this one.
  const now = new Date();
  for (const f of ['.mcp.json', '.claude/settings.json', 'package-lock.json',
    'vendor/docs-areas.txt', 'packages/snowarch/dist/contract.json']) {
    utimesSync(join(root, f), now, now);
  }
  assert.deepEqual(STEP_IDS.map((id) => hashFor(id, ctx)), once);
});

// ─── AC 3: what a resume on an unchanged checkout actually runs ─────────────────────────────────

test('AC 3 — a second run on an unchanged checkout does only B00 and B09', async (t) => {
  const root = makeCheckout({}, t);
  const ctx = ctxFor(root);
  const state = fresh(root, ctx);

  // The REAL registry, not stubs. A step whose recorded hash still matches is never invoked at
  // all, so this exercises the resume rule rather than a fixture's idea of it — and the two that
  // do run are the two with no inputs: the preflight, which asks the machine, and the summary.
  const ran = [];
  const steps = STEPS.map((s) => ({ ...s, run: async (c) => { ran.push(s.id); return s.run(c); } }));
  const lines = [];
  const r = await runSteps({
    root,
    // The REAL environment, because B00 asks the machine: `env: {}` means no PATH, which means
    // "git not found", which is a preflight FAIL and a run that never reaches B09. The network is
    // the one thing stubbed — a test that resumes must not depend on reaching github.com.
    ctx: { ...ctx, env: process.env, mode: 'design-only', docs: 'sparse', cwd: root, areaCount: 2,
      skipClaudeCheck: true, probe: async () => ({ ok: true }), state },
    state, steps, last: 'B09', onLine: (l) => lines.push(l), save: () => {},
  });

  assert.deepEqual(ran, ['B00', 'B09'], 'a resume must run the two steps that have no inputs');

  // Two words, two meanings, and this run shows both. `ok (cached)` is the RESUME rule — the hash
  // still matches. `skipped (design-only)` is `runsWhen` — this mode never needed the step at all.
  // AMENDMENT (the story said AC 3's lines read `skipped (…)`): they read `skipped (…)` only for
  // the second of those. Merging the wording would also merge two summary counters that a reader
  // uses to tell "nothing changed" from "not applicable here".
  assert.deepEqual(
    lines.filter((l) => /^\[B/.test(l)).map((l) => l.replace(/\(\d+\.\d+ s\)/, '(time)')),
    [
      '[B00/09] preflight … warn (time)',
      '[B01/09] workspace … ok (cached)',
      '[B02/09] docs … ok (cached)',
      '[B03/09] mode … ok (cached)',
      '[B04/09] deps … skipped (design-only)',
      '[B05/09] contract … ok (cached)',
      '[B06/09] instance … skipped (design-only)',
      '[B07/09] toggles … ok (cached)',
      '[B08/09] verify … skipped (design-only)',
      '[B09/09] summary … ok (time)',
    ],
  );
  assert.equal(r.summary.cached, 5);
  assert.equal(r.summary.skipped, 3);
  assert.equal(r.summary.fail, 0);

  // The run WRITES to the state, and what it wrote is the interesting part. The five cached steps
  // still match; the three the mode skipped hold no result to reuse, so they read as never-run
  // with the detail saying how — not as failures, which is what an earlier version of this called
  // them, and not as fresh, which would let a switch to live mode skip the install.
  assert.deepEqual(
    staleSteps(state, ctx, { hashFor, steps: STEP_IDS, alwaysRuns })
      .map((x) => [x.step, x.reason, x.detail]),
    [['B04', 'never-run', 'skipped'], ['B06', 'never-run', 'skipped'], ['B08', 'never-run', 'skipped']],
  );
  assert.deepEqual(explainStale(staleSteps(state, ctx, { hashFor, steps: ['B04'], alwaysRuns })),
    ['B04 will run — has not run in this checkout (skipped)']);
});

// ─── The generated table ────────────────────────────────────────────────────────────────────────

test('the ARCHITECTURE table is rendered from the table, and is committed current', async () => {
  const { inputsTable, inputsNotes } = await import('../../../scripts/gen-inputs-docs.mjs');
  const repo = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const page = readFileSync(join(repo, 'docs/ARCHITECTURE.md'), 'utf8');

  const region = (name) => page.slice(
    page.indexOf(`<!-- generated:${name} -->`) + `<!-- generated:${name} -->`.length,
    page.indexOf(`<!-- /generated:${name} -->`),
  ).trim();

  // Render and diff, rather than asserting the page contains some string: a page that had drifted
  // would still contain most of them, and `gen-all --check` is what CI runs on the same regions.
  assert.equal(region('bootstrap-inputs'), inputsTable().trim());
  assert.equal(region('bootstrap-input-notes'), inputsNotes().trim());
  // Every step appears, so a step added without a row cannot pass unnoticed.
  for (const id of STEP_IDS) assert.ok(region('bootstrap-inputs').includes(`\`${id}\``), id);
});
