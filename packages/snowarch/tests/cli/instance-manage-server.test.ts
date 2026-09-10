import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runSetPreset, type AddIo, type ManageDeps } from '../../src/cli/instance.js';
import { reapServerChildren, removeTempDir, trackServerChild, trackTempDir } from '../helpers/server-child.js';
import { scriptedTty } from '../helpers/scripted-tty.js';

/**
 * ARC-07-S06, AC 5 — the CLI raised production, and the SERVER agrees.
 *
 * Everything else in this story is asserted against the store file. This one is asserted against
 * the program that reads it: `set-preset --ack-prod` writes `prodWriteAck: true`, and the claim
 * that matters is that ARC-04-S03's load-time posture check then admits the instance — and that
 * flipping that one field back to `false` in the file makes the same server refuse it by name.
 * Two states of one field, read by a real process over stdio.
 */
const here = dirname(fileURLToPath(import.meta.url));
const SERVER = resolve(here, '../../dist/server.js');
const PASSWORD = ['pw', '-', 'fixture'].join('');

let base: string;
let checkout: string;
let home: string;
let store: string;

const entry = {
  url: 'https://acme.service-now.com',
  environment: 'prod',
  auth: { method: 'basic', username: 'svc.snowarch', password: PASSWORD },
  preset: 'read-only',
  flags: { WRITE_ENABLED: 'false', CMDB_WRITE_ENABLED: 'false', SCRIPTING_ENABLED: 'false',
    ATF_ENABLED: 'false', NOW_ASSIST_ENABLED: 'false', FLUENT_ENABLED: 'false' },
  toolPackage: 'full',
  maxRecords: 100,
  prodWriteAck: false,
};

const io = (answers: readonly string[]): AddIo => {
  const tty = scriptedTty(answers);
  return { ask: tty.ask, write: tty.write, secret: async () => '' };
};

function env(): Record<string, string> {
  const clean = { ...process.env } as Record<string, string>;
  for (const k of ['SERVICENOW_INSTANCE_URL', 'SERVICENOW_BASIC_USERNAME',
    'SERVICENOW_BASIC_PASSWORD', 'SNOW_ENV_FILE']) delete clean[k];
  return { ...clean, HOME: home, APPDATA: home, CLAUDE_PROJECT_DIR: checkout,
    SNOW_STORE: store, SNOW_LOG_LEVEL: 'error' };
}

async function connect(): Promise<Client> {
  const client = new Client({ name: 'ac5-test', version: '0' }, { capabilities: {} });
  const transport = new StdioClientTransport({
    command: process.execPath, args: [SERVER], env: env(), stderr: 'ignore',
  });
  await client.connect(transport);
  trackServerChild(transport);
  return client;
}

const text = (r: unknown): string => ((r as { content: Array<{ text: string }> }).content[0].text);

beforeEach(() => {
  base = trackTempDir(mkdtempSync(join(tmpdir(), 'snowarch-ac5-')));
  home = join(base, 'home');
  checkout = join(base, 'volume', 'repo');
  mkdirSync(home, { recursive: true });
  mkdirSync(join(checkout, '.local'), { recursive: true, mode: 0o700 });
  store = join(checkout, '.local', 'instances.json');
  writeFileSync(store, `${JSON.stringify({ version: 1, defaultInstance: 'prod-acme',
    instances: { 'prod-acme': entry } }, null, 2)}\n`, { mode: 0o600 });
  chmodSync(store, 0o600);
});

afterEach(async () => {
  // In a `finally`: a reap that throws must not take the removal with it.
  try {
    await reapServerChildren();
  } finally {
    removeTempDir(base);
  }
});

const raise = async (): Promise<void> => {
  const deps: ManageDeps = { storePath: store, configPath: join(checkout, '.local', 'config.json'),
    now: () => '2026-09-10T08:00:00.000Z' };
  const code = await runSetPreset(
    { label: 'prod-acme', preset: 'full', ackProd: true, confirmLabel: 'prod-acme', yes: true },
    io([]), deps);
  expect(code, 'precondition: the raise itself succeeded').toBe(0);
};

describe('AC 5 — the server reads what set-preset --ack-prod wrote', () => {
  it('loads the raised production instance and reports its flags on', async () => {
    await raise();
    expect(JSON.parse(readFileSync(store, 'utf8')).instances['prod-acme'].prodWriteAck).toBe(true);

    const client = await connect();
    try {
      const index = text(await client.callTool({ name: 'snow_core_instances_index', arguments: {} }));
      expect(index).toContain('prod-acme');
      expect(index).not.toContain('PROD_WRITE_NOT_ACKNOWLEDGED');
      expect(index).not.toContain(PASSWORD);
    } finally { await client.close(); }
  }, 40_000);

  it('refuses it by name when that one field is edited back to false', async () => {
    await raise();
    // The FIELD, not the preset: everything else the raise wrote stays exactly as it was, so the
    // only difference between this case and the one above is the acknowledgement itself.
    const raw = JSON.parse(readFileSync(store, 'utf8')) as
      { instances: Record<string, { prodWriteAck: boolean }> };
    (raw.instances['prod-acme'] as { prodWriteAck: boolean }).prodWriteAck = false;
    writeFileSync(store, `${JSON.stringify(raw, null, 2)}\n`, { mode: 0o600 });
    chmodSync(store, 0o600);

    const client = await connect();
    try {
      const index = text(await client.callTool({ name: 'snow_core_instances_index', arguments: {} }));
      expect(index).toContain('PROD_WRITE_NOT_ACKNOWLEDGED');
      // The remedy names the command that would fix it — this story's own.
      expect(index).toContain('instance set-preset prod-acme full --ack-prod');
      expect(index).not.toContain(PASSWORD);
    } finally { await client.close(); }
  }, 40_000);
});
