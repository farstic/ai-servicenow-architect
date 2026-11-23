// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C309 — the server doctor's instances say which one the server is on.
 *
 * The engine's Mode line names an instance, and for a full run it takes it from this list. The list carried the instances the server loaded, in store order,
 * and nothing said which of them the server started on, so the line named the first (`Mode: live — alpha` for a store whose default is `beta`). The entry the
 * server is on is marked `active`, from the manager's own `listAll()`, so that the line does not have to guess it.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { doctorInstances } from '../../src/doctor/index.js';
import { instanceManager } from '../../src/servicenow/instances.js';
import { FLAG_NAMES } from '../../src/utils/permissions.js';
import { removeTempDir, trackTempDir } from '../helpers/server-child.js';

const KEYS = ['SNOW_STORE', 'CLAUDE_PROJECT_DIR', 'HOME', 'USERPROFILE', 'SERVICENOW_INSTANCE_URL', 'SERVICENOW_BASIC_USERNAME', 'SERVICENOW_BASIC_PASSWORD', 'SN_INSTANCE_ALPHA_URL', 'SNOW_ENV_FILE'] as const;
let saved: Record<string, string | undefined>;
let dir: string;
let storePath: string;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  dir = trackTempDir(mkdtempSync(join(tmpdir(), 'report-instances-')));
  mkdirSync(join(dir, '.local'), { recursive: true, mode: 0o700 });
  storePath = join(dir, '.local', 'instances.json');
  process.env.SNOW_STORE = storePath;
  process.env.CLAUDE_PROJECT_DIR = dir;
  process.env.HOME = dir;
  process.env.USERPROFILE = dir;
});
afterEach(() => {
  for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  instanceManager.reload();
  removeTempDir(dir);
});

const flags = (value: 'true' | 'false'): Record<string, string> => Object.fromEntries(FLAG_NAMES.map((f) => [f, value]));
const inst = (label: string, environment: string, preset = 'read-only') => ({
  url: `https://${label}.service-now.com`, environment, preset, flags: preset === 'full' ? flags('true') : flags('false'), prodWriteAck: false,
  auth: { method: 'basic', username: 'u.probe', password: 'probe-only' }, toolPackage: 'full', maxRecords: 100,
});
function store(defaultInstance: string | undefined, instances: Record<string, unknown>): void {
  writeFileSync(storePath, `${JSON.stringify({ version: 1, ...(defaultInstance ? { defaultInstance } : {}), instances }, null, 2)}\n`, { mode: 0o600 });
  chmodSync(storePath, 0o600);
  instanceManager.reload();
}

describe('ARC-09-C309 — the instances the server doctor reports', () => {
  it('the instance the server started on is active, and only that one', () => {
    store('beta', { alpha: inst('alpha', 'pdi'), beta: inst('beta', 'dev') });
    expect(doctorInstances().map((i) => [i.label, i.active])).toEqual([['alpha', false], ['beta', true]]);
  });

  it('with no default, the first that loads is active; an instance that was refused is listed, and is not', () => {
    store(undefined, { prodr: inst('prodr', 'prod', 'full'), devy: inst('devy', 'dev'), alpha: inst('alpha', 'pdi') });
    expect(doctorInstances().map((i) => [i.label, i.status, i.active])).toEqual([
      ['devy', 'loaded', true], ['alpha', 'loaded', false], ['prodr', 'not_loaded', false],
    ]);
  });

  it('what an entry already carried is still there, and no credential came with the marker', () => {
    store('alpha', { alpha: inst('alpha', 'pdi') });
    const [entry] = doctorInstances();
    expect(entry).toMatchObject({ label: 'alpha', environment: 'pdi', preset: 'read-only', status: 'loaded', active: true });
    expect(JSON.stringify(doctorInstances())).not.toContain('probe-only');
    expect(JSON.stringify(doctorInstances())).not.toContain('u.probe');
  });

  it('nothing is configured: nothing is reported', () => {
    store(undefined, {});
    expect(doctorInstances()).toEqual([]);
  });
});
