import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectToolCatalog } from '../../src/tools/index.js';
import { reapServerChildren, removeTempDir, trackServerChild, trackTempDir } from '../helpers/server-child.js';
import { fromToday, keysOf, licence, licenceText, pair } from './fixtures.js';

/**
 * ARC-11-C1 — the licence gate in the BUILT server, over stdio, as Claude Code runs it.
 *
 * THE CLASS CASE FIRST. With no licence and enforcement off — every user's state today — the only
 * changes are one extra content block on the first answer of a session (its first block byte-identical
 * to what it always was), no `licence` key in the audit trail, and the same 399 tools.
 *
 * THEN THE LICENSED CASES, against a COPY of `dist/` that trusts a key this test generated. The shipped
 * key list is the owner's alone, so no committed build can verify a test's licence; the copy is how a
 * valid licence reaches the real CallTool handler without a key ever entering the repository. It lives
 * INSIDE the package for the reason `tests/doctor/doctor.test.ts` gives — Node resolves the SDK by
 * walking up from the module — and is gitignored and removed after the run.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = resolve(HERE, '../../dist/server.js');
const LICENSED_DIST = resolve(HERE, '../../.tmp-licence-dist');
const LICENSED_SERVER = join(LICENSED_DIST, 'server.js');

const primary = pair();
const KEYS = keysOf(primary, pair());

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
  return { ...clean, HOME: home, APPDATA: home, CLAUDE_PROJECT_DIR: checkout, SNOW_LOG_LEVEL: 'error', ...extra };
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

beforeAll(() => {
  rmSync(LICENSED_DIST, { recursive: true, force: true });
  cpSync(resolve(HERE, '../../dist'), LICENSED_DIST, { recursive: true });
  writeFileSync(join(LICENSED_DIST, 'licence', 'keys.js'), `export const PRODUCT_KEYS = Object.freeze(${JSON.stringify(KEYS)});\n`);
});
afterAll(() => {
  rmSync(LICENSED_DIST, { recursive: true, force: true });
});
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

describe('ARC-11-C1 — the class case: no licence, enforcement off', () => {
  it('one block more on the first answer, the first block unchanged, no audit key, 399 tools', async () => {
    writeStore();
    const client = await connect(SERVER);
    try {
      expect((await client.listTools()).tools.length).toBe(collectToolCatalog().length);
      const first = await call(client, 'snow_core_current_instance_read');
      const second = await call(client, 'snow_core_current_instance_read');
      expect(first.content).toHaveLength(2);
      expect(second.content).toHaveLength(1);
      expect(first.content[0]).toEqual(second.content[0]);
      expect(first.content[1].text).toMatch(/^Licence: missing · warn only — /);
      const switched = await call(client, 'snow_core_instance_switch', { name: 'other' });
      expect(switched.isError ?? false).toBe(false);
      expect(switched.content).toHaveLength(1);
      const lines = auditLines();
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) expect(Object.keys(line)).not.toContain('licence');
    } finally { await client.close(); }
  }, 40_000);
});

describe('ARC-11-C1 — enforced, with no licence: every tool refused (R1)', () => {
  it('refuses the five instance-free tools of an unconfigured server', async () => {
    const client = await connect(SERVER, { SNOW_LICENCE_ENFORCE: 'true' });
    try {
      for (const name of ['snow_core_capabilities_read', 'snow_core_status_read', 'snow_core_instances_reload',
        'snow_core_instances_index', 'snow_core_current_instance_read']) {
        const r = await call(client, name);
        expect(r.isError, name).toBe(true);
        expect(r.content[0].text, name).toMatch(/^Error: licence missing — .*\(Code: LICENCE_NOT_VALID\)/s);
      }
    } finally { await client.close(); }
  }, 40_000);
});

describe('ARC-11-C1 — a build that trusts the licence (a test copy of dist/)', () => {
  it('a live licence in force: served under enforcement, no notice, and its id in the audit line', async () => {
    writeStore();
    writeLicence(licence());
    const client = await connect(LICENSED_SERVER, { SNOW_LICENCE_ENFORCE: 'true' });
    try {
      const switched = await call(client, 'snow_core_instance_switch', { name: 'other' });
      expect(switched.isError ?? false).toBe(false);
      expect(switched.content).toHaveLength(1);
      const lines = auditLines();
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) expect(line.licence).toBe('LIC-2026-0002');
    } finally { await client.close(); }
  }, 40_000);

  it('a design-only licence on a live server under enforcement: refused, naming the scope (ruling (d))', async () => {
    writeStore();
    writeLicence(licence({ scope: 'design-only' }));
    const client = await connect(LICENSED_SERVER, { SNOW_LICENCE_ENFORCE: 'true' });
    try {
      const r = await call(client, 'snow_core_capabilities_read');
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toMatch(/^Error: licence LIC-2026-0002 covers design-only; live needs a live-scope licence/);
    } finally { await client.close(); }
  }, 40_000);

  it('an expiring licence under enforcement: served, with the notice on the first answer', async () => {
    writeStore();
    writeLicence(licence({ valid_until: fromToday(10) }));
    const client = await connect(LICENSED_SERVER, { SNOW_LICENCE_ENFORCE: 'true' });
    try {
      const r = await call(client, 'snow_core_current_instance_read');
      expect(r.isError ?? false).toBe(false);
      expect(r.content).toHaveLength(2);
      expect(r.content[1].text).toMatch(/^Licence: expiring · LIC-2026-0002 · until \d{4}-\d{2}-\d{2} · enforced — 10 days left/);
    } finally { await client.close(); }
  }, 40_000);
});
