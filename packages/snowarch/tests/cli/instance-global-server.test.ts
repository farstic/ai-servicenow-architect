import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { removeTempDir, reapServerChildren, trackServerChild, trackTempDir } from '../helpers/server-child.js';

/**
 * ARC-07-S07, AC 2 (the server half) — with an instance in BOTH stores, which one does the server
 * read?
 *
 * The CLI's answer is asserted in `instance-global.test.ts` against the store files. This asserts
 * the same thing about the program that actually loads them, over stdio, with both stores present
 * and a temp HOME so the runner's own global store is never involved: `store.source` must be
 * `project`, and the loaded entry must be the project one — the two stores are never merged.
 */
const here = dirname(fileURLToPath(import.meta.url));
const SERVER = resolve(here, '../../dist/server.js');
const PASSWORD = ['pw', '-', 'fixture'].join('');

let base: string;
let home: string;
let checkout: string;

const entry = (preset: string, url: string): Record<string, unknown> => ({
  url,
  environment: 'pdi',
  auth: { method: 'basic', username: 'svc.snowarch', password: PASSWORD },
  preset,
  flags: { WRITE_ENABLED: 'false', CMDB_WRITE_ENABLED: 'false', SCRIPTING_ENABLED: 'false',
    ATF_ENABLED: 'false', NOW_ASSIST_ENABLED: 'false', FLUENT_ENABLED: 'false' },
  toolPackage: 'full',
  maxRecords: 100,
  prodWriteAck: false,
});

function writeStore(path: string, instances: Record<string, unknown>): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify({ version: 1, defaultInstance: 'pdi', instances }, null, 2)}\n`,
    { mode: 0o600 });
  chmodSync(path, 0o600);
}

function env(): Record<string, string> {
  const clean = { ...process.env } as Record<string, string>;
  for (const k of ['SNOW_STORE', 'SERVICENOW_INSTANCE_URL', 'SERVICENOW_BASIC_USERNAME',
    'SERVICENOW_BASIC_PASSWORD', 'SNOW_ENV_FILE']) delete clean[k];
  return { ...clean, HOME: home, USERPROFILE: home, APPDATA: join(home, 'AppData', 'Roaming'),
    XDG_CONFIG_HOME: join(home, '.config'), CLAUDE_PROJECT_DIR: checkout, SNOW_LOG_LEVEL: 'error' };
}

async function connect(): Promise<Client> {
  const client = new Client({ name: 's07-test', version: '0' }, { capabilities: {} });
  const transport = new StdioClientTransport({
    command: process.execPath, args: [SERVER], env: env(), stderr: 'ignore',
  });
  await client.connect(transport);
  trackServerChild(transport);
  return client;
}

const text = (r: unknown): string => ((r as { content: Array<{ text: string }> }).content[0].text);

beforeEach(() => {
  base = trackTempDir(mkdtempSync(join(tmpdir(), 'snowarch-s07-')));
  home = join(base, 'home');
  checkout = join(base, 'volume', 'repo');
  mkdirSync(home, { recursive: true });
  mkdirSync(checkout, { recursive: true });
});

afterEach(async () => {
  try {
    await reapServerChildren();
  } finally {
    removeTempDir(base);
  }
});

describe('AC 2 — the server reads the project store when both exist', () => {
  it('reports store.source project and loads the project entry', async () => {
    const globalStore = join(home, process.platform === 'win32'
      ? join('AppData', 'Roaming', 'snowarch', 'instances.json')
      : join('.config', 'snowarch', 'instances.json'));
    writeStore(join(checkout, '.local', 'instances.json'), { pdi: entry('pdi-developer', 'https://dev11111.service-now.com') });
    writeStore(globalStore, { pdi: entry('read-only', 'https://dev22222.service-now.com'), personal: entry('read-only', 'https://dev33333.service-now.com') });

    const client = await connect();
    try {
      const status = JSON.parse(
        text(await client.callTool({ name: 'snow_core_status_read', arguments: {} })),
      ) as { store: { source: string } };
      expect(status.store.source).toBe('project');

      const index = text(await client.callTool({ name: 'snow_core_instances_index', arguments: {} }));
      expect(index).toContain('pdi');
      // NEVER MERGED: the global-only label is not visible to a server in this checkout.
      expect(index).not.toContain('personal');
      expect(index).not.toContain(PASSWORD);
    } finally { await client.close(); }
  }, 40_000);

  it('falls through to the global store when the checkout has none', async () => {
    const globalStore = join(home, process.platform === 'win32'
      ? join('AppData', 'Roaming', 'snowarch', 'instances.json')
      : join('.config', 'snowarch', 'instances.json'));
    writeStore(globalStore, { personal: entry('read-only', 'https://dev33333.service-now.com') });

    const client = await connect();
    try {
      const status = JSON.parse(
        text(await client.callTool({ name: 'snow_core_status_read', arguments: {} })),
      ) as { store: { source: string } };
      expect(status.store.source).toBe('global');
    } finally { await client.close(); }
  }, 40_000);
});
