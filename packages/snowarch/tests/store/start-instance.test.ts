// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C308 — which instance a new session starts on is ONE rule, written once, and what `instance remove` and `instance set-default` say about it is
 * that rule's answer, not a sentence that was true when it was written.
 *
 * The rule is in the loader (`servicenow/instances.ts`, from ARC-04-S02): the store's default when it is there and loads; otherwise the FIRST instance, in the
 * order the store holds them, that loads; otherwise nothing, and the server starts unconfigured. Two messages said something else. `remove` said that without its
 * default "the server will start unconfigured until you run set-default", which is true only when no instance is left (and then set-default cannot help); with
 * others left it starts on the first that loads, which depends on the order they were added and can be a production instance. `set-default` said that the
 * running server picks the new default up after a reload; a reload keeps an open session where it is (ARC-09-C245).
 *
 * The architect's ruling (2026-11-22, option A): the BEHAVIOUR stays, and the messages say it. So the rule moves into `store/start.ts` (no zod: the Mode line of
 * the doctor, C309, and the installer ask it without `node_modules`), the loader asks it, the commands ask it, and the test below holds them to each other: the
 * answer the CLI gives is the answer the loader gives, over stores of every shape, so that neither can change without the other.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { instanceManager } from '../../src/servicenow/instances.js';
import { entryLoads, startInstance, startOfStore } from '../../src/store/start.js';
import { FLAG_NAMES } from '../../src/store/schema.js';
import { expandPreset } from '../../src/utils/permissions.js';
import { removeTempDir, trackTempDir } from '../helpers/server-child.js';

const KEYS = [
  'SNOW_STORE', 'CLAUDE_PROJECT_DIR', 'SERVICENOW_INSTANCE_URL', 'SERVICENOW_BASIC_USERNAME',
  'SERVICENOW_BASIC_PASSWORD', 'SN_INSTANCE_ALPHA_URL', 'WRITE_ENABLED', 'SNOW_ENV_FILE', 'HOME', 'USERPROFILE',
] as const;

let saved: Record<string, string | undefined>;
let dir: string;
let storePath: string;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  dir = trackTempDir(mkdtempSync(join(tmpdir(), 'start-instance-')));
  mkdirSync(join(dir, '.local'), { recursive: true, mode: 0o700 });
  storePath = join(dir, '.local', 'instances.json');
  process.env.CLAUDE_PROJECT_DIR = dir;
  process.env.HOME = dir;
  process.env.USERPROFILE = dir;
  process.env.SNOW_STORE = storePath;
});
afterEach(() => {
  for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  instanceManager.reload();
  removeTempDir(dir);
});

type Env = 'pdi' | 'dev' | 'test' | 'prod';
interface Raw {
  url: string; environment: Env; preset: string; flags: Record<string, string>; prodWriteAck: boolean;
  auth: { method: 'basic'; username: string; password: string }; toolPackage: 'full'; maxRecords: number;
}
interface RawStore { version: 1; defaultInstance?: string; instances: Record<string, Raw> }

const allFlags = (value: 'true' | 'false'): Record<string, string> => Object.fromEntries(FLAG_NAMES.map((f) => [f, value]));
const inst = (label: string, environment: Env, preset = 'read-only', over: Partial<Raw> = {}): Raw => ({
  url: `https://${label}.service-now.com`, environment, preset,
  flags: preset === 'full' ? allFlags('true') : preset === 'read-only' ? allFlags('false') : { ...allFlags('false'), ...(preset === 'pdi-developer' ? expandPreset('pdi-developer') : {}) },
  prodWriteAck: false, auth: { method: 'basic', username: 'u.probe', password: 'probe-only' }, toolPackage: 'full', maxRecords: 100, ...over,
});

/** What the loader does with this store: the instance a session starts on, or null when nothing loads. */
function loaderStart(store: RawStore): { label: string; environment: string } | null {
  writeFileSync(storePath, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
  chmodSync(storePath, 0o600);
  instanceManager.reload();
  if (instanceManager.loadedCount() === 0) return null;
  const label = instanceManager.getCurrentName();
  return { label, environment: instanceManager.getEntry(label)!.environment };
}

describe('startInstance — the rule, once', () => {
  const ENTRIES = [{ label: 'alpha', loads: true }, { label: 'beta', loads: true }, { label: 'gamma', loads: false }];

  it('the default, when it is an instance that loads', () => {
    expect(startInstance('beta', ENTRIES)).toBe('beta');
  });

  it('no default: the first that loads, in the order given', () => {
    expect(startInstance(undefined, ENTRIES)).toBe('alpha');
    expect(startInstance(undefined, [...ENTRIES].reverse())).toBe('beta');
    expect(startInstance(null, [{ label: 'gamma', loads: false }, { label: 'beta', loads: true }])).toBe('beta');
  });

  it('a default that does not load, or is not in the store, is no default', () => {
    expect(startInstance('gamma', ENTRIES)).toBe('alpha');
    expect(startInstance('gone', ENTRIES)).toBe('alpha');
    expect(startInstance('', ENTRIES)).toBe('alpha');
  });

  it('nothing loads, or nothing is there: nothing', () => {
    expect(startInstance('alpha', [{ label: 'alpha', loads: false }])).toBeNull();
    expect(startInstance(undefined, [])).toBeNull();
  });

  it('the environment does not decide: a production instance that loads is first like any other', () => {
    expect(startInstance(undefined, [{ label: 'prodx', loads: true }, { label: 'devy', loads: true }])).toBe('prodx');
  });
});

describe('entryLoads — the loader\'s own refusal, asked without building a client', () => {
  it('an instance that is not production loads, whatever its flags', () => {
    expect(entryLoads('pdi', inst('pdi', 'pdi', 'full'))).toBe(true);
    expect(entryLoads('uat', inst('uat', 'test', 'pdi-developer'))).toBe(true);
  });

  it('a production instance loads read-only, and raised only with the acknowledgement', () => {
    expect(entryLoads('prodx', inst('prodx', 'prod'))).toBe(true);
    expect(entryLoads('prodr', inst('prodr', 'prod', 'full'))).toBe(false);
    expect(entryLoads('prodr', inst('prodr', 'prod', 'full', { prodWriteAck: true }))).toBe(true);
  });

  it('a custom production instance whose flags are in effect read-only is not raised: SCRIPTING without WRITE is not a write', () => {
    expect(entryLoads('prodc', inst('prodc', 'prod', 'custom', { flags: { ...allFlags('false'), SCRIPTING_ENABLED: 'true' } }))).toBe(true);
    expect(entryLoads('prodw', inst('prodw', 'prod', 'custom', { flags: { ...allFlags('false'), WRITE_ENABLED: 'true' } }))).toBe(false);
  });
});

describe('startOfStore — the answer a command gives for a store, with the environment it names', () => {
  it('names the instance and its environment', () => {
    const store: RawStore = { version: 1, instances: { prodx: inst('prodx', 'prod'), devy: inst('devy', 'dev') } };
    expect(startOfStore(store)).toEqual({ label: 'prodx', environment: 'prod' });
  });

  it('nothing is left, or nothing loads: null', () => {
    const empty: RawStore = { version: 1, instances: {} };
    const raised: RawStore = { version: 1, instances: { prodr: inst('prodr', 'prod', 'full') } };
    expect(startOfStore(empty)).toBeNull();
    expect(startOfStore(raised)).toBeNull();
  });
});

describe('the CLI\'s answer is the loader\'s, over stores of every shape', () => {
  const store = (defaultInstance: string | undefined, instances: Record<string, Raw>): RawStore =>
    ({ version: 1, ...(defaultInstance ? { defaultInstance } : {}), instances });

  const CASES: ReadonlyArray<[string, RawStore]> = [
    ['two that load, no default, alpha first', store(undefined, { alpha: inst('alpha', 'pdi'), beta: inst('beta', 'dev') })],
    ['the same two, beta first', store(undefined, { beta: inst('beta', 'dev'), alpha: inst('alpha', 'pdi') })],
    ['a production instance first, a dev instance second, no default', store(undefined, { prodx: inst('prodx', 'prod'), devy: inst('devy', 'dev') })],
    ['one instance, no default', store(undefined, { only: inst('only', 'pdi') })],
    ['the first is a production instance raised without acknowledgement (does not load)', store(undefined, { prodr: inst('prodr', 'prod', 'full'), devy: inst('devy', 'dev') })],
    ['no instance, no default', store(undefined, {})],
    ['a default that is not in the store', store('gone', { alpha: inst('alpha', 'pdi'), beta: inst('beta', 'dev') })],
    ['a default that does not load', store('prodr', { prodr: inst('prodr', 'prod', 'full'), devy: inst('devy', 'dev') })],
    ['a default that loads and is not first', store('beta', { alpha: inst('alpha', 'pdi'), beta: inst('beta', 'dev') })],
    ['instances, and none of them loads', store('prodr', { prodr: inst('prodr', 'prod', 'full'), prodw: inst('prodw', 'prod', 'pdi-developer') })],
  ];

  for (const [name, body] of CASES) {
    it(name, () => {
      expect(startOfStore(body)).toEqual(loaderStart(body));
    });
  }

  /** A small seeded generator (mulberry32): the same stores on every run and every machine. */
  function rng(seed: number): () => number {
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
  const ENVS: Env[] = ['pdi', 'dev', 'test', 'prod'];
  const PRESETS = ['read-only', 'pdi-developer', 'full', 'custom'];

  function generated(seed: number): RawStore {
    const r = rng(seed);
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
    const count = Math.floor(r() * 6);
    const labels = [...LABELS].sort(() => r() - 0.5).slice(0, count);
    const instances: Record<string, Raw> = {};
    for (const label of labels) {
      const preset = pick(PRESETS);
      const flags = preset === 'custom'
        ? Object.fromEntries(FLAG_NAMES.map((f) => [f, r() < 0.4 ? 'true' : 'false']))
        : undefined;
      instances[label] = inst(label, pick(ENVS), preset, { ...(flags ? { flags } : {}), prodWriteAck: r() < 0.3 });
    }
    const roll = r();
    const defaultInstance = roll < 0.4 ? undefined : roll < 0.8 ? (labels.length ? pick(labels) : undefined) : 'gone';
    return store(defaultInstance, instances);
  }

  it('300 generated stores: the same instance, or nothing, every time', () => {
    const seen = { noDefaultTwoLoad: 0, prodFirst: 0, defaultNotLoading: 0, noneLoads: 0, empty: 0, defaultLoads: 0 };
    for (let seed = 1; seed <= 300; seed += 1) {
      const body = generated(seed);
      const mine = startOfStore(body);
      const theirs = loaderStart(body);
      expect(mine, `seed ${seed}: ${JSON.stringify(body)}`).toEqual(theirs);

      // The instrument is only worth something when the generator reaches the cases the messages are about.
      const loads = Object.entries(body.instances).filter(([label, e]) => entryLoads(label, e));
      if (!body.defaultInstance && loads.length >= 2) seen.noDefaultTwoLoad += 1;
      if (!body.defaultInstance && loads.length > 0 && loads[0]![1].environment === 'prod') seen.prodFirst += 1;
      if (body.defaultInstance && body.instances[body.defaultInstance] && !entryLoads(body.defaultInstance, body.instances[body.defaultInstance]!)) seen.defaultNotLoading += 1;
      if (Object.keys(body.instances).length > 0 && loads.length === 0) seen.noneLoads += 1;
      if (Object.keys(body.instances).length === 0) seen.empty += 1;
      if (body.defaultInstance && body.instances[body.defaultInstance] && entryLoads(body.defaultInstance, body.instances[body.defaultInstance]!)) seen.defaultLoads += 1;
    }
    for (const [what, n] of Object.entries(seen)) expect(n, `the generator never made a store with: ${what}`).toBeGreaterThan(0);
  });

  it('the comparison can fail: "the first entry, whether it loads or not" disagrees with the loader on some store', () => {
    let disagreements = 0;
    for (let seed = 1; seed <= 300; seed += 1) {
      const body = generated(seed);
      const wrong = Object.keys(body.instances)[0] ?? null;
      const theirs = loaderStart(body)?.label ?? null;
      if (!body.defaultInstance && wrong !== theirs) disagreements += 1;
    }
    expect(disagreements).toBeGreaterThan(0);
  });
});
