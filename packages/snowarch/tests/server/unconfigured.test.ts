import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectToolCatalog } from '../../src/tools/index.js';
import { removeTempDir, reapServerChildren, trackServerChild } from '../helpers/server-child.js';

const here = dirname(fileURLToPath(import.meta.url));
const SERVER = resolve(here, '../../dist/server.js');

/**
 * Derived, not pinned. These assertions are about the SHAPE — "the full catalogue is
 * advertised once an instance loads" — and a literal here means every story that adds or
 * removes a tool edits this file for no reason. The count itself is pinned once, in
 * tests/contract.test.ts (e).
 */
const FULL_CATALOGUE = collectToolCatalog().length;

/**
 * The unconfigured server, driven by a real MCP client over stdio.
 *
 * A real `Client` on `StdioClientTransport` rather than hand-rolled JSON-RPC, because
 * criterion 3 is specifically that a CLIENT receives `notifications/tools/list_changed` —
 * inferring it from the tool's own `listChangedSent: true` would be asserting that the
 * server thinks it sent something, which is not the same claim.
 *
 * Every case runs under a temp HOME and APPDATA so the developer's real global store is
 * never read; without that, this suite would pass or fail depending on whose machine it ran
 * on, which is the failure mode S02 spent two rounds removing.
 */
let base: string;
let checkout: string;
let home: string;

const FIXTURE_USER = 'fixture.user';
const FIXTURE_PASS = 'Fixture-Secret-1';

const STORE = {
  version: 1,
  defaultInstance: 'pdi',
  instances: {
    pdi: {
      url: 'https://dev12345.service-now.com',
      environment: 'pdi',
      auth: { method: 'basic', username: FIXTURE_USER, password: FIXTURE_PASS },
      preset: 'pdi-developer',
      toolPackage: 'full',
      maxRecords: 100,
      prodWriteAck: false,
    },
  },
};

function writeStore(body: unknown = STORE): string {
  const dir = join(checkout, '.local');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const p = join(dir, 'instances.json');
  writeFileSync(p, JSON.stringify(body, null, 2), { mode: 0o600 });
  chmodSync(p, 0o600);
  return p;
}

function env(): Record<string, string> {
  const clean = { ...process.env } as Record<string, string>;
  for (const k of ['SNOW_STORE', 'SERVICENOW_INSTANCE_URL', 'SERVICENOW_BASIC_USERNAME',
    'SERVICENOW_BASIC_PASSWORD', 'SNOW_ENV_FILE']) delete clean[k];
  return { ...clean, HOME: home, APPDATA: home, CLAUDE_PROJECT_DIR: checkout, SNOW_LOG_LEVEL: 'error' };
}

async function connect(): Promise<{ client: Client; notifications: string[] }> {
  const notifications: string[] = [];
  const client = new Client({ name: 'unconfigured-test', version: '0' }, { capabilities: {} });
  client.setNotificationHandler(ToolListChangedNotificationSchema, () => {
    notifications.push('notifications/tools/list_changed');
  });
  const transport = new StdioClientTransport({
    command: process.execPath, args: [SERVER], env: env(), stderr: 'ignore',
  });
  await client.connect(transport);
  // After `connect`, not before: the transport spawns the child there, and until it does its
  // `pid` is null — which `trackServerChild` refuses rather than silently reaping nothing.
  trackServerChild(transport);
  return { client, notifications };
}

const text = (r: unknown): string =>
  ((r as { content: Array<{ text: string }> }).content[0].text);
const json = (r: unknown): Record<string, never> => JSON.parse(text(r));

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'snowarch-unconf-'));
  home = join(base, 'home');
  checkout = join(base, 'volume', 'repo');   // outside HOME, per the S02 lesson
  mkdirSync(home, { recursive: true });
  mkdirSync(checkout, { recursive: true });
});

afterEach(async () => {
  // Reap first: the removal is only safe once nothing can still write into the directory.
  await reapServerChildren();
  removeTempDir(base);
});

describe('criterion 1 and 2 - the server starts with no instance', () => {
  it('advertises exactly the five instance-free core tools', async () => {
    const { client } = await connect();
    try {
      const names = (await client.listTools()).tools.map((t) => t.name).sort();
      expect(names).toEqual([
        'snow_core_capabilities_read',
        'snow_core_current_instance_read',
        'snow_core_instances_index',
        'snow_core_instances_reload',
        'snow_core_status_read',
      ]);
      // instance_switch is deliberately NOT among them: there is nothing to switch to.
      expect(names).not.toContain('snow_core_instance_switch');
    } finally { await client.close(); }
  }, 40_000);

  it('any other tool returns NO_INSTANCE_CONFIGURED, naming both remedies', async () => {
    const { client } = await connect();
    try {
      const r = await client.callTool({ name: 'snow_core_records_query', arguments: { table: 'incident' } });
      expect(text(r)).toContain('NO_INSTANCE_CONFIGURED');
      expect(text(r)).toContain('/snowarch setup-instance');
      expect(text(r)).toContain('./snowarch instance add');
    } finally { await client.close(); }
  }, 40_000);

  it('status_read reports unconfigured, three candidates, none existing', async () => {
    const { client } = await connect();
    try {
      const s = json(await client.callTool({ name: 'snow_core_status_read', arguments: {} }));
      expect(s.mode).toBe('unconfigured');
      expect(s.toolsAdvertised).toBe(5);
      const candidates = s.store as unknown as { candidates: Array<{ source: string; exists: boolean }> };
      expect(candidates.candidates.map((c) => c.source)).toEqual(['env', 'project', 'global']);
      expect(candidates.candidates.every((c) => !c.exists)).toBe(true);
      expect(s.product).toBe('snowarch');
    } finally { await client.close(); }
  }, 40_000);

  it('capabilities_read reports no instance and the remedy', async () => {
    const { client } = await connect();
    try {
      const c = json(await client.callTool({ name: 'snow_core_capabilities_read', arguments: {} }));
      expect(c.instance).toBeNull();
      expect(c.mode).toBe('unconfigured');
      expect(c.remedy).toBe('/snowarch setup-instance');
    } finally { await client.close(); }
  }, 40_000);

  it('current_instance_read answers instead of throwing', async () => {
    const { client } = await connect();
    try {
      const c = json(await client.callTool({ name: 'snow_core_current_instance_read', arguments: {} }));
      expect(c.name).toBeNull();
      expect(c.mode).toBe('unconfigured');
    } finally { await client.close(); }
  }, 40_000);

  it('closing stdin exits the process with code 0, not a signal', () => {
    // Asserted on a plain spawn rather than through the SDK client, because the claim is
    // about the PROCESS: a signal-terminated process reports a signal and no code, and a
    // test that only checked "it went away" would pass either way.
    const r = spawnSync(process.execPath, ['-e', `
      const { spawn } = require('child_process');
      const c = spawn(process.execPath, [${JSON.stringify(SERVER)}], { stdio: ['pipe', 'pipe', 'ignore'] });
      setTimeout(() => c.stdin.end(), 800);
      c.on('exit', (code, signal) => { console.log(JSON.stringify({ code, signal })); process.exit(0); });
      setTimeout(() => { console.log(JSON.stringify({ code: 'TIMEOUT', signal: null })); process.exit(0); }, 6000);
    `], { env: env(), encoding: 'utf8', timeout: 30_000 });
    expect(JSON.parse(r.stdout.trim())).toEqual({ code: 0, signal: null });
  }, 40_000);
});

describe('criterion 3 - reload picks up a store written after start', () => {
  it('a real client receives notifications/tools/list_changed and then sees the full catalogue', async () => {
    const { client, notifications } = await connect();
    try {
      expect((await client.listTools()).tools).toHaveLength(5);
      expect(notifications).toEqual([]);

      writeStore();   // the "I ran ./snowarch instance add in another terminal" case
      const r = json(await client.callTool({ name: 'snow_core_instances_reload', arguments: {} }));

      expect(r.action).toBe('reloaded');
      expect(r.loaded).toEqual(['pdi']);
      expect(r.listChangedSent).toBe(true);
      expect(r.toolsAdvertised).toBe(FULL_CATALOGUE);

      // The notification is delivered asynchronously; give the transport a turn.
      await new Promise((res) => { setTimeout(res, 300); });
      expect(notifications).toEqual(['notifications/tools/list_changed']);

      expect((await client.listTools()).tools).toHaveLength(FULL_CATALOGUE);
    } finally { await client.close(); }
  }, 60_000);
});

describe('criterion 5 - reload after the store is deleted', () => {
  it('drops back to five tools and notifies again', async () => {
    writeStore();
    const { client, notifications } = await connect();
    try {
      expect((await client.listTools()).tools).toHaveLength(FULL_CATALOGUE);

      rmSync(join(checkout, '.local', 'instances.json'));
      const r = json(await client.callTool({ name: 'snow_core_instances_reload', arguments: {} }));
      expect(r.loaded).toEqual([]);
      expect(r.toolsAdvertised).toBe(5);
      expect(r.listChangedSent).toBe(true);

      await new Promise((res) => { setTimeout(res, 300); });
      expect(notifications).toEqual(['notifications/tools/list_changed']);

      const q = await client.callTool({ name: 'snow_core_records_query', arguments: { table: 'incident' } });
      expect(text(q)).toContain('NO_INSTANCE_CONFIGURED');
    } finally { await client.close(); }
  }, 60_000);
});

describe('criterion 4 - a refused instance alongside a loaded one', () => {
  it('status_read reports notLoaded with its code, and the catalogue is still full', async () => {
    writeStore({
      version: 1,
      defaultInstance: 'pdi',
      instances: {
        pdi: STORE.instances.pdi,
        prod: { ...STORE.instances.pdi, url: 'https://acme.service-now.com', environment: 'prod', preset: 'full' },
      },
    });
    const { client } = await connect();
    try {
      const s = json(await client.callTool({ name: 'snow_core_status_read', arguments: {} }));
      const instances = s.instances as unknown as { loaded: string[]; notLoaded: Array<{ code: string }> };
      expect(instances.loaded).toEqual(['pdi']);
      expect(instances.notLoaded[0].code).toBe('PROD_WRITE_NOT_ACKNOWLEDGED');
      expect(s.toolsAdvertised).toBe(FULL_CATALOGUE);
    } finally { await client.close(); }
  }, 40_000);
});

describe('criterion 6 - no credential reaches either tool', () => {
  it('neither status_read nor capabilities_read carries the fixture username or password', async () => {
    writeStore();
    const { client } = await connect();
    try {
      const status = text(await client.callTool({ name: 'snow_core_status_read', arguments: {} }));
      const caps = text(await client.callTool({ name: 'snow_core_capabilities_read', arguments: {} }));
      for (const body of [status, caps]) {
        expect(body).not.toContain(FIXTURE_USER);
        expect(body).not.toContain(FIXTURE_PASS);
      }
      // And not empty: an assertion that passes because the tool returned nothing proves
      // nothing. capabilities_read must actually describe the instance.
      expect(JSON.parse(caps).instance).toBe('pdi');
      expect(JSON.parse(caps).preset).toBe('pdi-developer');
    } finally { await client.close(); }
  }, 40_000);
});
