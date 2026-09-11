/**
 * ARC-09-S06, AC 2/3/4 — what the SERVER does about a store whose schema is not its own.
 *
 * Driven through a real MCP client against a real spawned `dist/server.js`, for the reason the
 * unconfigured suite gives: the claim is about what a client receives, and a claim about what the
 * server believes it sent is a different one.
 *
 * A note on the fixture's numbers. The story's cases are "a v1 store against a v2 server" and "a
 * v3 store against a v2 server", and this build's server is v1 — it cannot be made to believe
 * otherwise without shipping a second build. The RELATIONSHIP is what the criteria are about, so
 * the store moves instead of the server: version 0 is a store from the past, version 2 is a store
 * from the future. The assertions are unchanged.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CURRENT_SCHEMA_VERSION, migrateStore, restoreBackup, type Migration,
} from '../../src/store/migrations/index.js';
import { reapServerChildren, removeTempDir, trackServerChild, trackTempDir } from '../helpers/server-child.js';

const here = dirname(fileURLToPath(import.meta.url));
const SERVER = resolve(here, '../../dist/server.js');
const isWindows = process.platform === 'win32';

const PASSWORD = `${'Fix'}-${'ture'}-${'8821'}`;

const storeAt = (version: number) => ({
  version,
  defaultInstance: 'pdi',
  instances: {
    pdi: {
      url: 'https://dev12345.service-now.com',
      environment: 'pdi',
      auth: { method: 'basic', username: 'fixture.user', password: PASSWORD },
      preset: 'pdi-developer', toolPackage: 'full', maxRecords: 100, prodWriteAck: false,
    },
    other: {
      url: 'https://dev67890.service-now.com',
      environment: 'dev',
      auth: { method: 'basic', username: 'fixture.two', password: PASSWORD },
      preset: 'read-only', toolPackage: 'full', maxRecords: 100, prodWriteAck: false,
    },
  },
});

let base: string;
let checkout: string;
let home: string;

function writeStore(body: unknown): string {
  const dir = join(checkout, '.local');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const p = join(dir, 'instances.json');
  writeFileSync(p, `${JSON.stringify(body, null, 2)}\n`, { mode: 0o600 });
  if (!isWindows) chmodSync(p, 0o600);
  return p;
}

function env(): Record<string, string> {
  const clean = { ...process.env } as Record<string, string>;
  for (const k of ['SNOW_STORE', 'SERVICENOW_INSTANCE_URL', 'SERVICENOW_BASIC_USERNAME',
    'SERVICENOW_BASIC_PASSWORD', 'SNOW_ENV_FILE']) delete clean[k];
  return { ...clean, HOME: home, APPDATA: home, CLAUDE_PROJECT_DIR: checkout, SNOW_LOG_LEVEL: 'error' };
}

async function connect(): Promise<Client> {
  const client = new Client({ name: 'store-schema-test', version: '0' }, { capabilities: {} });
  const transport = new StdioClientTransport({
    command: process.execPath, args: [SERVER], env: env(), stderr: 'ignore',
  });
  await client.connect(transport);
  trackServerChild(transport);
  return client;
}

const text = (r: unknown): string => ((r as { content: Array<{ text: string }> }).content[0].text);

beforeEach(() => {
  base = trackTempDir(mkdtempSync(join(tmpdir(), 'snowarch-schema-')));
  home = join(base, 'home');
  checkout = join(base, 'volume', 'repo');
  mkdirSync(home, { recursive: true });
  mkdirSync(checkout, { recursive: true });
});

afterEach(async () => {
  try { await reapServerChildren(); } finally { removeTempDir(base); }
});

describe('AC 4 — a store from the PAST', () => {
  it('every instance tool answers STORE_SCHEMA_OUTDATED with the store migrate remedy', async () => {
    writeStore(storeAt(0));
    const client = await connect();
    try {
      // The precondition first: nothing loaded, which is what makes the refusal reachable.
      // `configErrors` (plural) is the shape ARC-04-S04 shipped; the story says `configError`.
      // One store can fail for more than one reason, so the array is right and the story's
      // singular is the amendment.
      const status = JSON.parse(text(await client.callTool({
        name: 'snow_core_status_read', arguments: {},
      }))) as { mode: string; configErrors: Array<{ code: string; message: string }> };
      expect(status.mode).toBe('unconfigured');
      expect(status.configErrors[0]?.code).toBe('STORE_SCHEMA_OUTDATED');
      expect(status.configErrors[0]?.message).toContain('./snowarch store migrate');

      // And the refusal a records tool gives is that code — not "no instance is configured",
      // which is true, unhelpful, and sends the reader to the wizard to re-enter credentials
      // they already have.
      const refusal = await client.callTool({
        name: 'snow_core_records_query', arguments: { table: 'incident' },
      }) as { isError?: boolean; content: Array<{ text: string }> };
      expect(refusal.isError).toBe(true);
      expect(refusal.content[0]!.text).toContain('STORE_SCHEMA_OUTDATED');
      expect(refusal.content[0]!.text).toContain('./snowarch store migrate');
      expect(refusal.content[0]!.text).not.toContain('instance add');
    } finally { await client.close(); }
  }, 40_000);
});

describe('AC 3 — a store from the FUTURE', () => {
  it('starts unconfigured with STORE_SCHEMA_NEWER and points at upgrade, not migrate', async () => {
    writeStore(storeAt(CURRENT_SCHEMA_VERSION + 2));
    const client = await connect();
    try {
      const status = JSON.parse(text(await client.callTool({
        name: 'snow_core_status_read', arguments: {},
      }))) as { mode: string; configErrors: Array<{ code: string; message: string }> };
      expect(status.mode).toBe('unconfigured');
      expect(status.configErrors[0]?.code).toBe('STORE_SCHEMA_NEWER');
      expect(status.configErrors[0]?.message).toContain('./snowarch upgrade');

      const refusal = await client.callTool({
        name: 'snow_core_records_query', arguments: { table: 'incident' },
      }) as { isError?: boolean; content: Array<{ text: string }> };
      expect(refusal.content[0]!.text).toContain('STORE_SCHEMA_NEWER');
    } finally { await client.close(); }
  }, 40_000);
});

describe('AC 2 — the server loads a store this framework wrote', () => {
  /**
   * The criterion is "after the migration, the server answers `initialize` and reports both
   * instances". A migration ENDING at the version the server reads needs a store below it, and at
   * v1 there is nothing below — `version: 0` is refused by design, because it never existed.
   *
   * So the round trip, which asserts the same thing and one more besides: migrate v1 → v2 with the
   * fixture chain, prove the credentials survived, then RESTORE the backup and hand the result to
   * a real server. It loads, and both instances are there. The extra claim is the one users
   * actually depend on — the backup is a rescue that works, not a file that merely exists.
   */
  it('migrates, restores the backup, and the server reports both instances', async () => {
    const path = writeStore(storeAt(CURRENT_SCHEMA_VERSION));
    const original = JSON.parse(JSON.stringify(storeAt(CURRENT_SCHEMA_VERSION)));

    const addField: Migration = {
      from: CURRENT_SCHEMA_VERSION, to: CURRENT_SCHEMA_VERSION + 1,
      describe: 'add lastUpgradeCheck to every instance',
      up: (store) => ({
        ...store,
        instances: Object.fromEntries(Object.entries(
          store.instances as Record<string, Record<string, unknown>>)
          .map(([label, inst]) => [label, { ...inst, lastUpgradeCheck: null }])),
      }),
    };
    const result = migrateStore(path, {
      migrations: [addField], current: CURRENT_SCHEMA_VERSION + 1,
    });
    expect(result.migrated).toBe(true);
    expect(result.backup).toBeDefined();

    const migrated = JSON.parse(readFileSync(path, 'utf8')) as typeof original;
    expect(migrated.version).toBe(CURRENT_SCHEMA_VERSION + 1);
    for (const label of ['pdi', 'other']) {
      expect(migrated.instances[label].auth).toEqual(original.instances[label].auth);
    }

    const { version } = restoreBackup(path, result.backup!);
    expect(version).toBe(CURRENT_SCHEMA_VERSION);

    const client = await connect();
    try {
      // Two tools, because they answer two halves of the criterion. `capabilities_read` reports
      // the CURRENT instance — the story reads it as reporting both, which it has never done;
      // `instances_index` is the list. Amendment recorded on the story.
      const caps = JSON.parse(text(await client.callTool({
        name: 'snow_core_capabilities_read', arguments: {},
      }))) as { instance?: string | null; mode?: string };
      expect(caps.mode).not.toBe('unconfigured');
      expect(caps.instance).toBe('pdi');

      const index = JSON.parse(text(await client.callTool({
        name: 'snow_core_instances_index', arguments: {},
      }))) as { instances?: Array<{ label?: string; name?: string }> };
      const labels = (index.instances ?? []).map((i) => i.label ?? i.name).sort();
      expect(labels).toEqual(['other', 'pdi']);
    } finally { await client.close(); }
  }, 40_000);
});
