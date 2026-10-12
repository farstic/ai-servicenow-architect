// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectToolCatalog } from '../../src/tools/index.js';
import { reapServerChildren, removeTempDir, trackServerChild, trackTempDir } from '../helpers/server-child.js';
import { fromToday, licence, licenceText } from './fixtures.js';
import { licenceFixture, licensedEnv } from '../../../../tools/snowarch/tests/helpers/licence-hook/index.mjs';

/**
 * ARC-11-C1 — the licence gate in the BUILT server, over stdio, as Claude Code runs it.
 *
 * THE CLASS CASE FIRST. With no licence, on every build (ARC-11-C6): all 399 tools are still listed, the
 * refusal is at the call (R1), and every call, a switch included, is refused with `LICENCE_NOT_VALID` and one
 * audit line.
 *
 * THEN THE LICENSED CASES, against the same build. The shipped key list is the owner's alone, so the
 * server runs under the test hook (`licensedEnv`, shape A), which resolves the build's keys module to the
 * helper's fixture keys for the run, and each case signs with that fixture's primary key. That is how a
 * valid licence reaches the real CallTool handler without a key ever entering the repository. Until
 * ARC-11-C6 step 9 these cases ran a copy of `dist/` with its keys module rewritten; the hook is the one
 * mechanism now, and `licence-key-sources.test.mjs` holds every test to it.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = resolve(HERE, '../../dist/server.js');

// The fixture the hook trusts: this process's, made once and removed after the file (the package's setup).
const { primary } = licenceFixture();

let base: string;
let checkout: string;
let home: string;

const instance = (host: string, environment: string) => ({
  url: `https://${host}.test-only`, environment,
  auth: { method: 'basic', username: 'fixture.user', password: 'Fixture-Secret-1' },
  preset: 'pdi-developer', toolPackage: 'full', maxRecords: 100, prodWriteAck: false,
});

function writeStore(): void {
  const dir = join(checkout, '.local');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const p = join(dir, 'instances.json');
  writeFileSync(p, JSON.stringify({ version: 1, defaultInstance: 'pdi',
    instances: { pdi: instance('pdi-host', 'pdi'), other: instance('other-host', 'dev') } }, null, 2), { mode: 0o600 });
  chmodSync(p, 0o600);
}

function writeLicence(body: Record<string, unknown>): void {
  mkdirSync(join(checkout, '.local'), { recursive: true });
  writeFileSync(join(checkout, '.local', 'licence.json'), licenceText(body, primary));
}

function env(extra: Record<string, string> = {}): Record<string, string> {
  const clean = { ...process.env } as Record<string, string>;
  for (const k of ['SNOW_STORE', 'SERVICENOW_INSTANCE_URL', 'SERVICENOW_BASIC_USERNAME', 'SERVICENOW_BASIC_PASSWORD',
    'SNOW_ENV_FILE', 'SNOW_AUDIT_FILE', 'SNOW_LICENCE_ENFORCE']) delete clean[k];
  // ARC-11-C6: each case writes the licence it is about, so the helper adds the hook and writes none.
  return licensedEnv({ ...clean, HOME: home, APPDATA: home, CLAUDE_PROJECT_DIR: checkout, SNOW_LOG_LEVEL: 'error', ...extra },
    { licence: false });
}

async function connect(server: string, extra: Record<string, string> = {}): Promise<Client> {
  const client = new Client({ name: 'licence-test', version: '0' }, { capabilities: {} });
  const transport = new StdioClientTransport({ command: process.execPath, args: [server], env: env(extra), stderr: 'ignore' });
  await client.connect(transport);
  trackServerChild(transport);
  return client;
}

type Answer = { content: Array<{ type: string; text: string }>; isError?: boolean };
const call = async (client: Client, name: string, args: Record<string, unknown> = {}): Promise<Answer> =>
  (await client.callTool({ name, arguments: args })) as unknown as Answer;

const auditLines = (): Array<Record<string, unknown>> => {
  const p = join(checkout, '.local', 'audit.jsonl');
  return existsSync(p) ? readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
};

beforeEach(() => {
  base = trackTempDir(mkdtempSync(join(tmpdir(), 'snowarch-licence-server-')));
  home = join(base, 'home');
  checkout = join(base, 'volume', 'repo');
  mkdirSync(home, { recursive: true });
  mkdirSync(checkout, { recursive: true });
});
afterEach(async () => {
  try { await reapServerChildren(); } finally { removeTempDir(base); }
});

describe('ARC-11-C6 — the class case: no licence, on every build', () => {
  it('every tool is still listed, 399 of them: the refusal is at the call (R1), and a switch is refused too', async () => {
    writeStore();
    const client = await connect(SERVER);
    try {
      expect((await client.listTools()).tools.length).toBe(collectToolCatalog().length);
      const first = await call(client, 'snow_core_current_instance_read');
      expect(first.isError).toBe(true);
      expect(first.content[0].text).toMatch(/^Error: licence missing — .*\(Code: LICENCE_NOT_VALID\)/s);
      const switched = await call(client, 'snow_core_instance_switch', { name: 'other' });
      expect(switched.isError).toBe(true);
      expect(auditLines().map((l) => [l.tool, l.result])).toEqual([['snow_core_current_instance_read', 'LICENCE_NOT_VALID'],
        ['snow_core_instance_switch', 'LICENCE_NOT_VALID']]);
    } finally { await client.close(); }
  }, 40_000);
});

describe('ARC-11-C1 and C6 — with no licence: every tool refused (R1), on every build', () => {
  it('refuses the five instance-free tools of an unconfigured server', async () => {
    const client = await connect(SERVER);
    try {
      for (const name of ['snow_core_capabilities_read', 'snow_core_status_read', 'snow_core_instances_reload',
        'snow_core_instances_index', 'snow_core_current_instance_read']) {
        const r = await call(client, name);
        expect(r.isError, name).toBe(true);
        expect(r.content[0].text, name).toMatch(/^Error: licence missing — .*\(Code: LICENCE_NOT_VALID\)/s);
      }
      // Polish 2: one line per refused call, and no instance to name on an unconfigured server.
      expect(auditLines().map((l) => [l.tool, l.instance, l.state])).toEqual(['snow_core_capabilities_read',
        'snow_core_status_read', 'snow_core_instances_reload', 'snow_core_instances_index',
        'snow_core_current_instance_read'].map((name) => [name, '(none)', 'missing']));
    } finally { await client.close(); }
  }, 40_000);
});

/** The keys of a licence refusal's audit line, and no others (polish 2). */
const REFUSAL_KEYS = ['gate', 'instance', 'licence', 'result', 'state', 'tool', 'ts'];

describe('ARC-11-C1 polish 2 — a licence refusal writes one audit line, and nothing else changes', () => {
  // The owner's rc.1 sitting found .local/audit.jsonl empty after two refusals: the router refuses before
  // the writer runs, and a read writes no line. For the owner's control story a refused attempt is evidence.
  it('a refused read writes exactly one line: the tool, the label, gate licence, the licence and why', async () => {
    writeStore();
    const client = await connect(SERVER);
    try {
      expect((await call(client, 'snow_core_capabilities_read')).isError).toBe(true);
      const lines = auditLines();
      expect(lines).toHaveLength(1);
      expect(Object.keys(lines[0]).sort()).toEqual(REFUSAL_KEYS);
      expect(lines[0]).toMatchObject({ instance: 'pdi', tool: 'snow_core_capabilities_read', gate: 'licence',
        result: 'LICENCE_NOT_VALID', licence: 'missing', state: 'missing' });
    } finally { await client.close(); }
  }, 40_000);

  it('a refused write records no argument: no table, no sys_id, no query, no value', async () => {
    writeStore();
    const MARKER = 'POLISH2-PAYLOAD-MARKER';
    const client = await connect(SERVER);
    try {
      const r = await call(client, 'snow_core_record_add', { table: 'incident', fields: { short_description: MARKER } });
      expect(r.isError).toBe(true);
      const lines = auditLines();
      expect(lines).toHaveLength(1);
      expect(Object.keys(lines[0]).sort()).toEqual(REFUSAL_KEYS);
      expect(lines[0]).toMatchObject({ tool: 'snow_core_record_add', gate: 'licence', result: 'LICENCE_NOT_VALID' });
      expect(readFileSync(join(checkout, '.local', 'audit.jsonl'), 'utf8')).not.toContain(MARKER);
    } finally { await client.close(); }
  }, 40_000);

  it('a licensed build names the licence and why: design-only on live, expired, and a forged file', async () => {
    writeStore();
    const forged = JSON.parse(licenceText(licence(), primary));
    forged.licence.org = 'Another Org';
    const cases: Array<[string, Record<string, string>]> = [
      [licenceText(licence({ scope: 'design-only' }), primary), { licence: 'LIC-2026-0002', state: 'scope' }],
      [licenceText(licence({ valid_until: fromToday(-3) }), primary), { licence: 'LIC-2026-0002', state: 'expired' }],
      // A forged file's id is unverified text, so the line names no licence.
      [JSON.stringify(forged), { licence: 'missing', state: 'invalid' }],
    ];
    for (const [file, want] of cases) {
      writeFileSync(join(checkout, '.local', 'licence.json'), file);
      rmSync(join(checkout, '.local', 'audit.jsonl'), { force: true });
      const client = await connect(SERVER);
      try {
        expect((await call(client, 'snow_core_capabilities_read')).isError, want.state).toBe(true);
        const lines = auditLines();
        expect(lines, want.state).toHaveLength(1);
        expect(lines[0], want.state).toMatchObject({ gate: 'licence', result: 'LICENCE_NOT_VALID', ...want });
      } finally { await client.close(); }
    }
  }, 60_000);

  it('a notice writes no line, and neither does a refused argument (C121, unchanged)', async () => {
    writeStore();
    // An expiring licence: served, with the notice on the first answer, in a build that trusts it.
    writeFileSync(join(checkout, '.local', 'licence.json'), licenceText(licence({ valid_until: fromToday(10) }), primary));
    const client = await connect(SERVER);
    try {
      expect((await call(client, 'snow_core_current_instance_read')).content).toHaveLength(2);
      const bad = await call(client, 'snow_core_current_instance_read', { instance: 'other' });
      expect(bad.isError).toBe(true);
      expect(bad.content[0].text).toMatch(/\(Code: INVALID_REQUEST\)/);
      expect(auditLines()).toEqual([]);
    } finally { await client.close(); }
  }, 40_000);
});

describe('ARC-11-C1 — the build under the test hook, which trusts the fixture\'s key', () => {
  it('a live licence in force: served, no notice, and its id in the audit line', async () => {
    writeStore();
    writeLicence(licence());
    const client = await connect(SERVER);
    try {
      const switched = await call(client, 'snow_core_instance_switch', { name: 'other' });
      expect(switched.isError ?? false).toBe(false);
      expect(switched.content).toHaveLength(1);
      const lines = auditLines();
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) expect(line.licence).toBe('LIC-2026-0002');
    } finally { await client.close(); }
  }, 40_000);

  it('a design-only licence on a live server: refused, naming the scope (ruling (d))', async () => {
    writeStore();
    writeLicence(licence({ scope: 'design-only' }));
    const client = await connect(SERVER);
    try {
      const r = await call(client, 'snow_core_capabilities_read');
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toMatch(/^Error: licence LIC-2026-0002 covers design-only; live needs a live-scope licence/);
    } finally { await client.close(); }
  }, 40_000);

  it('an expiring licence: served, with the notice on the first answer', async () => {
    writeStore();
    writeLicence(licence({ valid_until: fromToday(10) }));
    const client = await connect(SERVER);
    try {
      const r = await call(client, 'snow_core_current_instance_read');
      expect(r.isError ?? false).toBe(false);
      expect(r.content).toHaveLength(2);
      expect(r.content[1].text).toMatch(/^Licence: expiring · LIC-2026-0002 · until \d{4}-\d{2}-\d{2} — 10 days left/);
    } finally { await client.close(); }
  }, 40_000);
});
