// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C245 — which instance a session is on, across the read that comes before every write, and across a resume.
 *
 * Driven through the built server by a real MCP client, as a session drives it. In one process a switch has to hold
 * through `snow_core_capabilities_read`, the §2.0 pre-flight read, which reloads the store and used to put the
 * session back on the store's default. A resumed session is a NEW process, and it starts on the store's default:
 * the read says so, which is what the write question then quotes. A previous process's switch is not known to it,
 * and nothing claims otherwise.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reapServerChildren, removeTempDir, trackServerChild, trackTempDir } from '../helpers/server-child.js';
import { licensedEnv } from '../../../../tools/snowarch/tests/helpers/licence-hook/index.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SERVER = resolve(here, '../../dist/server.js');

let base: string;
let checkout: string;
let home: string;

const entry = (url: string) => ({
  url, environment: 'pdi',
  auth: { method: 'basic', username: 'fixture.user', password: 'Fixture-Secret-1' },
  preset: 'pdi-developer', toolPackage: 'full', maxRecords: 100, prodWriteAck: false,
});
const STORE = {
  version: 1,
  defaultInstance: 'pdi',
  instances: { pdi: entry('https://fixture.example'), x: entry('https://x.fixture.example') },
};

function writeStore(): void {
  const dir = join(checkout, '.local');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const p = join(dir, 'instances.json');
  writeFileSync(p, JSON.stringify(STORE, null, 2), { mode: 0o600 });
  chmodSync(p, 0o600);
}

function env(): Record<string, string> {
  const clean = { ...process.env } as Record<string, string>;
  for (const k of ['SNOW_STORE', 'SERVICENOW_INSTANCE_URL', 'SERVICENOW_BASIC_USERNAME',
    'SERVICENOW_BASIC_PASSWORD', 'SNOW_ENV_FILE']) delete clean[k];
  return licensedEnv({ ...clean, HOME: home, APPDATA: home, CLAUDE_PROJECT_DIR: checkout, SNOW_LOG_LEVEL: 'error' });
}

async function connect(): Promise<Client> {
  const client = new Client({ name: 'session-instance-test', version: '0' }, { capabilities: {} });
  const transport = new StdioClientTransport({
    command: process.execPath, args: [SERVER], env: env(), stderr: 'ignore',
  });
  await client.connect(transport);
  // After `connect`: the transport spawns the child there, and until it does its `pid` is null.
  trackServerChild(transport);
  return client;
}

const json = (r: unknown): Record<string, unknown> =>
  JSON.parse((r as { content: Array<{ text: string }> }).content[0].text);
const call = async (client: Client, name: string, args: Record<string, unknown> = {}) =>
  json(await client.callTool({ name, arguments: args }));

beforeEach(() => {
  base = trackTempDir(mkdtempSync(join(tmpdir(), 'snowarch-session-')));
  home = join(base, 'home');
  checkout = join(base, 'volume', 'repo');   // outside HOME, per the S02 lesson
  mkdirSync(home, { recursive: true });
  mkdirSync(checkout, { recursive: true });
  writeStore();
});

afterEach(async () => {
  try {
    await reapServerChildren();
  } finally {
    removeTempDir(base);
  }
});

describe('ARC-09-C245 — the instance a session is on', () => {
  it('a switch holds through the pre-flight read; a resumed session starts on the store default', async () => {
    const first = await connect();
    try {
      expect((await call(first, 'snow_core_instance_switch', { name: 'x' })).active_instance).toBe('x');
      const caps = await call(first, 'snow_core_capabilities_read');
      expect(caps.instance).toBe('x');
      expect(caps.instanceChanged).toBeUndefined();
    } finally {
      await first.close();
    }

    // The resume: a new server process. It knows nothing of the first one's switch, and says where it is.
    const resumed = await connect();
    try {
      const caps = await call(resumed, 'snow_core_capabilities_read');
      expect(caps.instance).toBe('pdi');
      expect(caps.instanceChanged).toBeUndefined();
    } finally {
      await resumed.close();
    }
  });
});
