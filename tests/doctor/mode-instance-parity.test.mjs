// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C309 — the Mode line, the CLI and the loader name the same instance: the one a new session starts on.
 *
 * The banner said `Mode: live — alpha` about a store whose default is `beta` (second in the store), because the line took the FIRST instance of what it was given.
 * A user could believe the session was on another instance, which is worse than a wording issue. The rule for where a session starts is one, written in
 * `packages/snowarch/src/store/start.ts` (ARC-09-C308) and followed by the server's loader; the Mode line now asks it too, and this holds the two answers to each
 * other over the stores the C308 test holds the CLI to: ten shapes the messages are about, and generated ones (seeded). It runs the line's own readers, the ones
 * the SessionStart hook's quick run uses (`readStoreSummaries`, `readDefaultLabel`), against the real loader on the same file.
 *
 * The one place it does not compare: a store in which nothing loads. The loader names nothing, and the line keeps naming the first instance of the store (the SV
 * checks say why none loads), as it always did.
 */
import { before, after, test as nodeTest } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { deriveMode } from '../../tools/snowarch/lib/doctor/mode.mjs';
import { spellings } from '../../tools/snowarch/lib/text.mjs';
import { tempDir } from '../../tools/snowarch/tests/helpers/temp.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const href = (rel) => pathToFileURL(join(root, rel)).href;
const SPELL = spellings();
const { readDefaultLabel, readStoreSummaries } = await import(href('packages/snowarch/dist/store/label.js'));

// The loader needs its installed dependencies. CI's stdlib-only step runs this folder on a machine with no node_modules at all, where the Mode line has to work and
// the loader cannot be asked. The comparisons with the loader skip ONLY there, and only because that step says so: .github/workflows/ci.yml sets SNOWARCH_STDLIB_ONLY=1
// in both of its variants, and it is read by name. Anywhere else a missing dependency FAILS the tests, so a step that lost its node_modules cannot skip them in silence
// (tests/doctor/stdlib-marker.test.mjs holds both).
const STDLIB_ONLY_STEP = process.env.SNOWARCH_STDLIB_ONLY === '1';
let loaderUnavailable = null;
const test = (name, fn) => nodeTest(name, async (t) => (loaderUnavailable ? t.skip(loaderUnavailable) : fn(t)));

const FLAGS = ['WRITE_ENABLED', 'CMDB_WRITE_ENABLED', 'SCRIPTING_ENABLED', 'ATF_ENABLED', 'NOW_ASSIST_ENABLED', 'FLUENT_ENABLED'];
const allFlags = (v) => Object.fromEntries(FLAGS.map((f) => [f, v]));
const PDI_DEVELOPER = { ...allFlags('false'), WRITE_ENABLED: 'true', CMDB_WRITE_ENABLED: 'true', SCRIPTING_ENABLED: 'true', ATF_ENABLED: 'true' };
const inst = (label, environment, preset = 'read-only', over = {}) => ({
  url: `https://${label}.service-now.com`, environment, preset,
  flags: preset === 'full' ? allFlags('true') : preset === 'pdi-developer' ? PDI_DEVELOPER : allFlags('false'),
  prodWriteAck: false, auth: { method: 'basic', username: 'u.probe', password: 'probe-only' }, toolPackage: 'full', maxRecords: 100, ...over,
});
const store = (defaultInstance, instances) => ({ version: 1, ...(defaultInstance ? { defaultInstance } : {}), instances });

let dir;
let storePath;
let instanceManager;
const saved = {};
const KEYS = ['SNOW_STORE', 'CLAUDE_PROJECT_DIR', 'HOME', 'USERPROFILE', 'SERVICENOW_INSTANCE_URL', 'SERVICENOW_BASIC_USERNAME', 'SERVICENOW_BASIC_PASSWORD', 'SN_INSTANCE_ALPHA_URL', 'SNOW_ENV_FILE'];

before(async (t) => {
  for (const k of KEYS) saved[k] = process.env[k];
  for (const k of Object.keys(process.env)) if (/^SN_INSTANCE_|^SERVICENOW_/.test(k)) delete process.env[k];
  dir = tempDir('snowarch-c309-', t);
  mkdirSync(join(dir, '.local'), { recursive: true, mode: 0o700 });
  storePath = join(dir, '.local', 'instances.json');
  process.env.SNOW_STORE = storePath;
  process.env.CLAUDE_PROJECT_DIR = dir;
  process.env.HOME = dir;
  process.env.USERPROFILE = dir;
  try {
    ({ instanceManager } = await import(href('packages/snowarch/dist/servicenow/instances.js')));
  } catch (e) {
    // a missing PACKAGE on the stdlib-only step is expected; a missing package anywhere else, or a missing FILE of the repository ("Cannot find module"), is a failure
    if (!STDLIB_ONLY_STEP || e?.code !== 'ERR_MODULE_NOT_FOUND' || !/Cannot find package/.test(String(e.message))) throw e;
    loaderUnavailable = `the loader's dependencies are not installed (${String(e.message).split('\n')[0]})`;
  }
});
after(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

function write(body) {
  writeFileSync(storePath, `${JSON.stringify(body, null, 2)}\n`, { mode: 0o600 });
  chmodSync(storePath, 0o600);
}

/** What the loader does with this store: the instance a session starts on, or null when nothing loads. */
function loaderStart(body) {
  write(body);
  instanceManager.reload();
  return instanceManager.loadedCount() > 0 ? instanceManager.getCurrentName() : null;
}

/** What the Mode line of a quick run (the SessionStart hook's) derives for this store, through the readers it uses. */
function quickDerived(body) {
  write(body);
  const summaries = readStoreSummaries(storePath).map((i) => ({ ...i, status: 'configured' }));
  return deriveMode({ toggles: { enabled: true }, instances: summaries, defaultInstance: readDefaultLabel(storePath)?.label ?? null,
    probed: false, bootstrapped: true, registration: 'project', spell: SPELL });
}
const quickLine = (body) => quickDerived(body).instance?.label ?? null;

/** What the Mode line of a full run derives, given the server's answer as `listAll()` makes it (the instances the server loaded, with the one it is on). */
function fullDerived(body) {
  write(body);
  instanceManager.reload();
  const answer = instanceManager.listAll().map((i) => ({ label: i.name, environment: i.environment, preset: i.preset, status: i.status, active: i.active }));
  return deriveMode({ toggles: { enabled: true }, instances: answer, defaultInstance: readDefaultLabel(storePath)?.label ?? null,
    bootstrapped: true, registration: 'project', spell: SPELL });
}
const fullLine = (body) => fullDerived(body).instance?.label ?? null;

const CASES = [
  ['two that load, no default, alpha first', store(undefined, { alpha: inst('alpha', 'pdi'), beta: inst('beta', 'dev') })],
  ['the same two, beta first', store(undefined, { beta: inst('beta', 'dev'), alpha: inst('alpha', 'pdi') })],
  ['a production instance first, a dev instance second, no default', store(undefined, { prodx: inst('prodx', 'prod'), devy: inst('devy', 'dev') })],
  ['one instance, no default', store(undefined, { only: inst('only', 'pdi') })],
  ['the first is a production instance raised without acknowledgement (does not load)', store(undefined, { prodr: inst('prodr', 'prod', 'full'), devy: inst('devy', 'dev') })],
  ['the first is a production instance raised through its own flags (a custom preset with a write flag on), without acknowledgement (does not load)',
    store(undefined, { prodc: inst('prodc', 'prod', 'custom', { flags: { ...allFlags('false'), WRITE_ENABLED: 'true' } }), devy: inst('devy', 'dev') }), 'devy'],
  ['a default that is not in the store', store('gone', { alpha: inst('alpha', 'pdi'), beta: inst('beta', 'dev') })],
  ['a default that does not load', store('prodr', { prodr: inst('prodr', 'prod', 'full'), devy: inst('devy', 'dev') })],
  ['a default that loads and is not first (the banner named the first)', store('beta', { alpha: inst('alpha', 'pdi'), beta: inst('beta', 'dev') })],
  ['a default that loads and is last of three', store('gamma', { alpha: inst('alpha', 'pdi'), beta: inst('beta', 'dev'), gamma: inst('gamma', 'test') })],
];

for (const [name, body, expected] of CASES) {
  test(`ARC-09-C309 — ${name}: the line names what the loader starts on, quick and full`, () => {
    const want = loaderStart(body);
    assert.ok(want !== null, 'the case is about a store in which something loads');
    if (expected !== undefined) assert.equal(want, expected, 'the premise of the case: the loader starts on another instance than the first entry');
    assert.equal(quickLine(body), want, 'the quick run (the SessionStart banner) names another instance than the session starts on');
    assert.equal(fullLine(body), want, 'the full run names another instance than the session starts on');
  });
}

const NOTHING_LOADS = [
  ['every entry a production instance raised without acknowledgement', store('prodr', { prodr: inst('prodr', 'prod', 'full'), prodw: inst('prodw', 'prod', 'pdi-developer') })],
  ['one such entry, no default', store(undefined, { prodr: inst('prodr', 'prod', 'full') })],
];

for (const [name, body] of NOTHING_LOADS) {
  test(`ARC-09-C309 — ${name}: the loader starts on nothing, and neither line names an instance, quick or full, and both say it is not live`, () => {
    assert.equal(loaderStart(body), null, 'the case is about a store in which nothing loads');
    const quick = quickDerived(body);
    const full = fullDerived(body);
    for (const [which, derived] of [['quick', quick], ['full', full]]) {
      assert.equal(derived.mode, 'design-only', `${which}: the line is live about a session that has no instance`);
      assert.equal(derived.instance, null, `${which}: the line names an instance the session will not use`);
    }
    assert.equal(quick.variant, 'noSavedInstanceLoads');
    assert.equal(full.variant, 'noInstanceLoaded');       // the verdict the full run always gave; the two agree on the mode and on naming nothing
  });
}

test('ARC-09-C309 — the readers the quick run uses say which instances load, and which is the default', () => {
  // `newer` names a preset this build does not know (a store written by a newer build): it cannot tell, and says so with null. It does not say `false`, which
  // would make the Mode line call the entry one that does not load and the line design-only (ARC-08-C21 keeps it live, with the flags unknown).
  write(store('beta', { alpha: inst('alpha', 'pdi'), prodr: inst('prodr', 'prod', 'full'), prodx: inst('prodx', 'prod'), beta: inst('beta', 'dev'),
    newer: inst('newer', 'dev', 'a-preset-from-a-newer-build'),
    // a custom preset takes its flags from the entry: with a write flag on a production instance needs the acknowledgement, and with none on it does not
    prodc: inst('prodc', 'prod', 'custom', { flags: { ...allFlags('false'), WRITE_ENABLED: 'true' } }), prodk: inst('prodk', 'prod', 'custom', { flags: allFlags('false') }) }));
  const loads = Object.fromEntries(readStoreSummaries(storePath).map((i) => [i.label, i.loads]));
  assert.deepEqual(loads, { alpha: true, prodr: false, prodx: true, beta: true, newer: null, prodc: false, prodk: true });
  assert.equal(readDefaultLabel(storePath)?.label, 'beta');
  // nothing of a credential rides on the entries: the key set is still named fields, now four, and not a spread
  assert.deepEqual(Object.keys(readStoreSummaries(storePath)[0]).sort(), ['effectiveFlags', 'environment', 'label', 'loads', 'preset']);
});

/** A small seeded generator (mulberry32): the same stores on every run and every machine. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const LABELS = ['alpha', 'beta', 'gamma', 'delta', 'acme', 'prodx', 'uat', 'sandbox'];
const ENVS = ['pdi', 'dev', 'test', 'prod'];
const PRESETS = ['read-only', 'pdi-developer', 'full', 'custom'];

function generated(seed) {
  const r = rng(seed);
  const pick = (xs) => xs[Math.floor(r() * xs.length)];
  const labels = [...LABELS].sort(() => r() - 0.5).slice(0, 1 + Math.floor(r() * 5));
  const instances = {};
  for (const label of labels) {
    const preset = pick(PRESETS);
    const flags = preset === 'custom' ? Object.fromEntries(FLAGS.map((f) => [f, r() < 0.4 ? 'true' : 'false'])) : undefined;
    instances[label] = inst(label, pick(ENVS), preset, { ...(flags ? { flags } : {}), prodWriteAck: r() < 0.3 });
  }
  const roll = r();
  return store(roll < 0.4 ? undefined : roll < 0.8 ? pick(labels) : 'gone', instances);
}

test('ARC-09-C309 — 150 generated stores: the line names what the loader starts on, whenever something loads', () => {
  let compared = 0;
  let noneLoad = 0;
  for (let seed = 1; seed <= 150; seed += 1) {
    const body = generated(seed);
    const want = loaderStart(body);
    if (want === null) {
      // nothing loads: neither line names an instance (an empty store is the case `unconfigured` already covers)
      if (Object.keys(body.instances).length > 0) {
        assert.equal(quickLine(body), null, `seed ${seed} (quick, nothing loads): ${JSON.stringify(body)}`);
        assert.equal(fullLine(body), null, `seed ${seed} (full, nothing loads): ${JSON.stringify(body)}`);
        noneLoad += 1;
      }
      continue;
    }
    compared += 1;
    assert.equal(quickLine(body), want, `seed ${seed} (quick): ${JSON.stringify(body)}`);
    assert.equal(fullLine(body), want, `seed ${seed} (full): ${JSON.stringify(body)}`);
  }
  assert.ok(compared >= 80, `the generator gave ${compared} stores in which something loads: too few to hold the two to each other`);
  assert.ok(noneLoad >= 1, 'the generator never gave a store with instances in which nothing loads');
});

test('ARC-09-C309 — the comparison can fail: the old reading, the first instance of the store, disagrees with the loader on some store', () => {
  let disagreements = 0;
  for (let seed = 1; seed <= 150; seed += 1) {
    const body = generated(seed);
    const want = loaderStart(body);
    if (want !== null && Object.keys(body.instances)[0] !== want) disagreements += 1;
  }
  assert.ok(disagreements > 0);
});
