import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { removeTempDir, reapServerChildren, trackServerChild } from '../helpers/server-child.js';

const SERVER = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist/server.js');

/**
 * Two claims that only the real CallTool handler can settle, driven over stdio.
 *
 * Both were asserted in the unit suites at the level of the functions involved
 * (`tests/utils/result-size.test.ts`) or by a grep (criterion 6). Neither of those shows that
 * the handler USES them — a `capResult` with no caller passes every unit test it has, and a
 * grep proves only that one spelling of the routing is absent.
 *
 * The two instances below use `.invalid` hosts on purpose: the name is guaranteed never to
 * resolve, so the DNS failure is deterministic and its message names the host that was
 * contacted. That name is the evidence — a call that had honoured `instance: "other"` would
 * fail against the other host, and the assertion would read the difference.
 */
let base: string;
let checkout: string;
let home: string;

const instance = (host: string, environment: string) => ({
  url: `https://${host}.example.invalid`,
  environment,
  auth: { method: 'basic', username: 'fixture.user', password: 'Fixture-Secret-1' },
  preset: 'pdi-developer',
  toolPackage: 'full',
  maxRecords: 100,
  prodWriteAck: false,
});

function writeStore(): void {
  const dir = join(checkout, '.local');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const p = join(dir, 'instances.json');
  writeFileSync(p, JSON.stringify({
    version: 1,
    defaultInstance: 'pdi',
    instances: { pdi: instance('pdi-host', 'pdi'), other: instance('other-host', 'dev') },
  }, null, 2), { mode: 0o600 });
  chmodSync(p, 0o600);
}

function env(): Record<string, string> {
  const clean = { ...process.env } as Record<string, string>;
  for (const k of ['SNOW_STORE', 'SERVICENOW_INSTANCE_URL', 'SERVICENOW_BASIC_USERNAME',
    'SERVICENOW_BASIC_PASSWORD', 'SNOW_ENV_FILE', 'SNOW_MAX_RESULT_CHARS']) delete clean[k];
  return { ...clean, HOME: home, APPDATA: home, CLAUDE_PROJECT_DIR: checkout, SNOW_LOG_LEVEL: 'error' };
}

async function connect(extraEnv: Record<string, string> = {}): Promise<Client> {
  const client = new Client({ name: 'routing-test', version: '0' }, { capabilities: {} });
  const transport = new StdioClientTransport({
    command: process.execPath, args: [SERVER], env: { ...env(), ...extraEnv }, stderr: 'ignore',
  });
  await client.connect(transport);
  // After `connect`, not before: the transport spawns the child there, and until it does its
  // `pid` is null — which `trackServerChild` refuses rather than silently reaping nothing.
  trackServerChild(transport);
  return client;
}

const text = (r: unknown): string => ((r as { content: Array<{ text: string }> }).content[0].text);

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'snowarch-routing-'));
  home = join(base, 'home');
  checkout = join(base, 'volume', 'repo');
  mkdirSync(home, { recursive: true });
  mkdirSync(checkout, { recursive: true });
  writeStore();
});

afterEach(async () => {
  // Reap first: the removal is only safe once nothing can still write into the directory.
  await reapServerChildren();
  removeTempDir(base);
});

describe('criterion 4 - a per-call `instance` argument does not route', () => {
  it('the call goes to the CURRENT instance even when another is named', async () => {
    const client = await connect();
    try {
      const r = text(await client.callTool({
        name: 'snow_core_records_query',
        arguments: { table: 'incident', instance: 'other' },
      }));
      expect(r).toContain('pdi-host.example.invalid');
      expect(r).not.toContain('other-host');
    } finally { await client.close(); }
  }, 40_000);

  it('and the argument is ignored silently, not refused', async () => {
    // It was never in any inputSchema, so refusing it would break a caller for using something
    // the server never offered. The failure below is DNS, not a rejected argument.
    const client = await connect();
    try {
      const r = text(await client.callTool({
        name: 'snow_core_records_query',
        arguments: { table: 'incident', instance: 'other' },
      }));
      expect(r).not.toMatch(/unknown argument|unexpected|instance is not allowed/i);
      expect(r).toContain('ENOTFOUND');
    } finally { await client.close(); }
  }, 40_000);

  it('a control: with no instance argument, the same host is reached', async () => {
    // Without this, the assertion above would also pass if `instance` were honoured and the
    // fixture happened to name the current instance.
    const client = await connect();
    try {
      expect(text(await client.callTool({
        name: 'snow_core_records_query', arguments: { table: 'incident' },
      }))).toContain('pdi-host.example.invalid');
    } finally { await client.close(); }
  }, 40_000);
});

describe('criterion 5 - CallTool applies the result cap', () => {
  it('_meta["anthropic/maxResultSizeChars"] is honoured end to end', async () => {
    const client = await connect();
    try {
      const capped = text(await client.callTool({
        name: 'snow_core_status_read', arguments: {},
        _meta: { 'anthropic/maxResultSizeChars': 120 },
      }));
      const full = text(await client.callTool({ name: 'snow_core_status_read', arguments: {} }));

      expect(capped.length).toBe(120);
      expect(capped).toContain('[truncated at 120 chars]');
      // Not vacuous: the same call without the cap is much longer, so 120 is a real cut and
      // not simply the length this tool always returns.
      expect(full.length).toBeGreaterThan(400);
      expect(full).not.toContain('truncated');
    } finally { await client.close(); }
  }, 40_000);

  it('SNOW_MAX_RESULT_CHARS caps when the client sends no _meta', async () => {
    const client = await connect({ SNOW_MAX_RESULT_CHARS: '150' });
    try {
      const r = text(await client.callTool({ name: 'snow_core_status_read', arguments: {} }));
      expect(r.length).toBe(150);
      expect(r).toContain('[truncated at 150 chars]');
    } finally { await client.close(); }
  }, 40_000);

  it('_meta wins over the environment', async () => {
    const client = await connect({ SNOW_MAX_RESULT_CHARS: '150' });
    try {
      const r = text(await client.callTool({
        name: 'snow_core_status_read', arguments: {},
        _meta: { 'anthropic/maxResultSizeChars': 300 },
      }));
      expect(r.length).toBe(300);
    } finally { await client.close(); }
  }, 40_000);
});
