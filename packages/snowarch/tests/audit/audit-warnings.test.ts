import { describe, expect, it, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createServer, type Server } from 'node:https';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import selfsigned from 'selfsigned';
import { reapServerChildren, removeTempDir, trackServerChild, trackTempDir } from '../helpers/server-child.js';

const SERVER = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist/server.js');

/**
 * ARC-09-C101 (b) — the audit trail tells the truth about a write that stored a cut value.
 *
 * Until now a create the platform cut at its column was recorded as a plain `ok`: the result a
 * caller read carried `warnings`, and the one record meant to answer "what happened to the writes in
 * this engagement" said nothing. These drive the BUILT server over stdio against a local HTTPS
 * fixture standing in for the instance — the claim is about the hook in the CallTool handler, and a
 * unit test of the summariser would pass just as happily if the handler never called it.
 *
 * The fixture is a platform that cuts `name` at 40 characters, answers 201 with the cut value, and
 * states `max_length` 40 in the dictionary. The certificate is generated here (as in tls.test.ts),
 * never committed, and trusted by the child through NODE_EXTRA_CA_CERTS, which Node reads once at
 * process start — which is why the server is a child process at all.
 */
const MARKER = 'SECRET-PAYLOAD-MARKER';
const LONG = `${MARKER}-${'n'.repeat(50)}`;            // 72 characters; the platform keeps 40
const SYS_ID = 'c'.repeat(32);

let server: Server;
let port: number;
let caDir: string;
let caPath: string;
let base: string;
let checkout: string;
let home: string;
let auditFile: string;

/** Every request the fixture saw: `METHOD /path`. */
let seen: string[] = [];
/** What the fixture answers for a POST to a table; a test sets it. */
let postAnswer: (table: string, body: Record<string, unknown>) => { status: number; body: unknown };

const cutName = (body: Record<string, unknown>): Record<string, unknown> => ({
  sys_id: SYS_ID, ...body, name: String(body.name).slice(0, 40),
});

beforeAll(async () => {
  const pems = await selfsigned.generate(
    [{ name: 'commonName', value: 'localhost' }],
    {
      notAfterDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      keySize: 2048,
      extensions: [{
        name: 'subjectAltName',
        altNames: [{ type: 2, value: 'localhost' }, { type: 7, ip: '127.0.0.1' }],
      }],
    },
  );
  caDir = mkdtempSync(join(tmpdir(), 'snowarch-audit-ca-'));
  caPath = join(caDir, 'fixture-ca.pem');
  writeFileSync(caPath, pems.cert);

  server = createServer({ key: pems.private, cert: pems.cert }, (req, res) => {
    const url = new URL(req.url ?? '/', 'https://127.0.0.1');
    const table = url.pathname.split('/').pop() ?? '';
    seen.push(`${req.method} ${url.pathname}`);
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const send = (status: number, body: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
      };
      if (req.method === 'GET' && table === 'sys_dictionary') {
        return send(200, { result: [{ element: 'name', max_length: '40' }] });
      }
      if (req.method === 'POST') {
        const answer = postAnswer(table, raw ? JSON.parse(raw) : {});
        return send(answer.status, answer.body);
      }
      return send(200, { result: [] });
    });
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((ok) => server.close(() => ok()));
  rmSync(caDir, { recursive: true, force: true });
});

function writeStore(preset: string): void {
  const dir = join(checkout, '.local');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const p = join(dir, 'instances.json');
  writeFileSync(p, JSON.stringify({
    version: 1,
    defaultInstance: 'pdi',
    instances: {
      pdi: {
        url: `https://127.0.0.1:${port}`, environment: 'pdi',
        auth: { method: 'basic', username: 'fixture.user', password: 'Fixture-Secret-1' },
        preset, toolPackage: 'full', maxRecords: 100, prodWriteAck: false,
      },
    },
  }, null, 2), { mode: 0o600 });
  chmodSync(p, 0o600);
}

function env(): Record<string, string> {
  const clean = { ...process.env } as Record<string, string>;
  for (const k of ['SNOW_STORE', 'SERVICENOW_INSTANCE_URL', 'SERVICENOW_BASIC_USERNAME',
    'SERVICENOW_BASIC_PASSWORD', 'SNOW_ENV_FILE', 'REDACT_SENSITIVE_DATA',
    // The fixture is on loopback. An ambient proxy would send the request to the proxy instead,
    // which is how five other tests fail in a sandbox that sets one.
    'HTTPS_PROXY', 'HTTP_PROXY', 'https_proxy', 'http_proxy', 'ALL_PROXY', 'all_proxy']) delete clean[k];
  return {
    ...clean, HOME: home, APPDATA: home, CLAUDE_PROJECT_DIR: checkout, SNOW_AUDIT_FILE: auditFile,
    SNOW_LOG_LEVEL: 'error', NODE_EXTRA_CA_CERTS: caPath, NO_PROXY: '127.0.0.1,localhost',
    MAX_RETRIES: '0', RETRY_DELAY_MS: '0', REQUEST_TIMEOUT_MS: '5000',
  };
}

async function connect(preset: string): Promise<Client> {
  writeStore(preset);
  const transport = new StdioClientTransport({ command: process.execPath, args: [SERVER], env: env(), stderr: 'ignore' });
  const client = new Client({ name: 'audit-warnings-test', version: '0' }, { capabilities: {} });
  await client.connect(transport);
  trackServerChild(transport);
  return client;
}

const auditLines = (): Array<Record<string, unknown>> => (existsSync(auditFile)
  ? readFileSync(auditFile, 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l))
  : []);

const textOf = (r: unknown): string =>
  ((r as { content: Array<{ text: string }> }).content[0]?.text) ?? '';

beforeEach(() => {
  seen = [];
  base = trackTempDir(mkdtempSync(join(tmpdir(), 'snowarch-auditwarn-')));
  home = join(base, 'home');
  checkout = join(base, 'volume', 'repo');
  auditFile = join(base, 'audit.jsonl');
  mkdirSync(home, { recursive: true });
  mkdirSync(checkout, { recursive: true });
});

afterEach(async () => {
  try { await reapServerChildren(); } finally { removeTempDir(base); }
});

describe('ARC-09-C101 (b) - the audit line carries the warning, not just `ok`', () => {
  it('a Business Rule whose name was cut: result ok, and the line names the code, table, field and count', async () => {
    postAnswer = (_t, body) => ({ status: 201, body: { result: { ...cutName(body), advanced: 'true' } } });
    const client = await connect('pdi-developer');
    const res = await client.callTool({
      name: 'snow_scr_business_rule_add',
      arguments: { name: LONG, table: 'incident', when: 'before', script: 'gs.info(1);' },
    });

    // The caller was told (C93) ...
    expect(textOf(res)).toContain('VALUE_TRUNCATED');
    // ... and so is the trail, in the same call.
    const lines = auditLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      tool: 'snow_scr_business_rule_add', result: 'ok', table: 'incident', sysId: SYS_ID,
      warnings: [{ code: 'VALUE_TRUNCATED', table: 'sys_script', fields: ['name'], count: 1 }],
    });
  });

  it('and never a value: the long name, the marker and the lengths are nowhere in the file', async () => {
    postAnswer = (_t, body) => ({ status: 201, body: { result: { ...cutName(body), advanced: 'true' } } });
    const client = await connect('pdi-developer');
    await client.callTool({
      name: 'snow_scr_business_rule_add',
      arguments: { name: LONG, table: 'incident', when: 'before', script: `gs.info('${MARKER}');` },
    });
    const text = readFileSync(auditFile, 'utf8');
    expect(text).not.toContain(MARKER);
    expect(text).not.toContain('message');
    expect(text).not.toContain('sent_length');
  });

  it('the control: a write that stored everything is a plain line with no warnings key', async () => {
    postAnswer = (_t, body) => ({ status: 201, body: { result: { sys_id: SYS_ID, ...body, advanced: 'true' } } });
    const client = await connect('pdi-developer');
    await client.callTool({
      name: 'snow_scr_business_rule_add',
      arguments: { name: 'Close open tasks', table: 'incident', when: 'before', script: 'gs.info(1);' },
    });
    const [line] = auditLines();
    expect(line).toMatchObject({ tool: 'snow_scr_business_rule_add', result: 'ok' });
    expect(Object.prototype.hasOwnProperty.call(line, 'warnings')).toBe(false);
    // and the dictionary was never read: nothing was cut, so nothing was asked
    expect(seen.filter((s) => s.includes('sys_dictionary'))).toEqual([]);
  });

  it('a tool that wrote a cut value and then FAILED: the line carries the error code AND the warning', async () => {
    postAnswer = (table, body) => (table === 'sys_security_acl'
      ? { status: 403, body: { error: { message: 'User Not Authorized' } } }
      : { status: 201, body: { result: cutName(body) } });
    const client = await connect('full');
    const res = await client.callTool({
      name: 'snow_ai_ai_agent_add',
      arguments: { name: LONG, description: 'd', capabilities: ['a'] },
    });

    expect((res as { isError?: boolean }).isError).toBe(true);
    const [line] = auditLines();
    expect(line!.tool).toBe('snow_ai_ai_agent_add');
    expect(line!.result).not.toBe('ok');                         // the failure is still the headline
    expect(line!.warnings).toEqual([
      { code: 'VALUE_TRUNCATED', table: 'sys_ai_agent', fields: ['name'], count: 1 },
    ]);
    expect(readFileSync(auditFile, 'utf8')).not.toContain(MARKER);
  });
});
