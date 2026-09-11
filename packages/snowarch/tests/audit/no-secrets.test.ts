import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectToolCatalog } from '../../src/tools/index.js';
import { reapServerChildren, removeTempDir, trackServerChild, trackTempDir } from '../helpers/server-child.js';

const SERVER = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist/server.js');

/**
 * The audit trail as the server actually writes it, plus the grep that has to hold.
 *
 * Driven over stdio against the built server rather than by calling `appendAudit` directly,
 * because the claim is about the HOOK: which calls produce a line, what the line contains, and
 * what never reaches it. A unit test on the writer proves the file format and would pass just
 * as happily if `CallTool` never called it.
 *
 * The marker matters. `SECRET-PAYLOAD-MARKER` goes into the field values of a create, so if any
 * part of the request payload reaches the audit line or stderr, one grep finds it — no need to
 * predict WHICH field would have leaked.
 */
const MARKER = 'SECRET-PAYLOAD-MARKER';
const FIXTURE_USER = 'fixture.user';
const FIXTURE_PASS = 'Fixture-Secret-1';

let base: string;
let checkout: string;
let home: string;
let auditFile: string;

function writeStore(preset = 'pdi-developer'): void {
  const dir = join(checkout, '.local');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const p = join(dir, 'instances.json');
  writeFileSync(p, JSON.stringify({
    version: 1,
    defaultInstance: 'pdi',
    instances: {
      pdi: {
        // A port nothing listens on, NOT an unresolvable hostname. `.invalid` costs a DNS
        // round-trip per call — about 1.4 s here — and the whole-catalogue sweep below makes
        // ~130 of them, which turned a security assertion into a four-minute test of the DNS
        // timeout. A refused TCP connection is immediate. `https` because the store schema
        // requires a bare https origin, and TCP refuses before any TLS handshake begins.
        url: 'https://127.0.0.1:1',
        environment: 'pdi',
        auth: { method: 'basic', username: FIXTURE_USER, password: FIXTURE_PASS },
        preset, toolPackage: 'full', maxRecords: 100, prodWriteAck: false,
      },
      other: {
        url: 'https://127.0.0.1:49152',
        environment: 'dev',
        auth: { method: 'basic', username: FIXTURE_USER, password: FIXTURE_PASS },
        preset, toolPackage: 'full', maxRecords: 100, prodWriteAck: false,
      },
    },
  }, null, 2), { mode: 0o600 });
  chmodSync(p, 0o600);
}

function env(over: Record<string, string> = {}): Record<string, string> {
  const clean = { ...process.env } as Record<string, string>;
  for (const k of ['SNOW_STORE', 'SERVICENOW_INSTANCE_URL', 'SERVICENOW_BASIC_USERNAME',
    'SERVICENOW_BASIC_PASSWORD', 'SNOW_ENV_FILE', 'REDACT_SENSITIVE_DATA']) delete clean[k];
  return {
    ...clean, HOME: home, APPDATA: home, CLAUDE_PROJECT_DIR: checkout,
    SNOW_AUDIT_FILE: auditFile, SNOW_LOG_LEVEL: 'debug',
    // No retry backoff. The fixture host never resolves, and three retries with a 1 s delay
    // per tool turned the whole-catalogue sweep below into a four-minute test of setTimeout.
    // No retries, no backoff. These only started working once `client.ts` stopped defaulting
    // them with `||`, under which a configured 0 is falsy and silently became 3 retries with a
    // 1 s base delay — 7 s per call from the exponential backoff alone.
    MAX_RETRIES: '0', RETRY_DELAY_MS: '0', REQUEST_TIMEOUT_MS: '300', ...over,
  };
}

/** A connected client plus everything the server wrote to stderr while it ran. */
async function connect(over: Record<string, string> = {}): Promise<{ client: Client; stderr: () => string }> {
  let captured = '';
  const transport = new StdioClientTransport({
    command: process.execPath, args: [SERVER], env: env(over), stderr: 'pipe',
  });
  const client = new Client({ name: 'audit-test', version: '0' }, { capabilities: {} });
  await client.connect(transport);
  // After `connect`, not before: the transport spawns the child there, and until it does its
  // `pid` is null — which `trackServerChild` refuses rather than silently reaping nothing.
  trackServerChild(transport);
  transport.stderr?.on('data', (c: Buffer) => { captured += c.toString(); });
  return { client, stderr: () => captured };
}

const auditLines = (): Array<Record<string, unknown>> => (existsSync(auditFile)
  ? readFileSync(auditFile, 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l))
  : []);

const auditText = (): string => (existsSync(auditFile) ? readFileSync(auditFile, 'utf8') : '');

beforeEach(() => {
  base = trackTempDir(mkdtempSync(join(tmpdir(), 'snowarch-nosecrets-')));
  home = join(base, 'home');
  checkout = join(base, 'volume', 'repo');
  auditFile = join(base, 'audit.jsonl');
  mkdirSync(home, { recursive: true });
  mkdirSync(checkout, { recursive: true });
});

afterEach(async () => {
  // Reap first: the removal is only safe once nothing can still write into the directory. In a
  // `finally`, because a reap that throws must not take the removal with it — that is one of the
  // two ways these trees survived a run.
  try {
    await reapServerChildren();
  } finally {
    removeTempDir(base);
  }
});

describe('criterion 1 - a mutating call writes one line, and the payload is not in it', () => {
  it('record_add under pdi-developer', async () => {
    writeStore();
    const { client } = await connect();
    try {
      // `fields`, not `data`: the tool answers "table and fields are required" (the story's
      // `data:` is a plan typo, confirmed by the architect). Named here because getting it
      // wrong would produce an INVALID_REQUEST line that still passes the marker grep, for
      // the wrong reason.
      await client.callTool({
        name: 'snow_core_record_add',
        arguments: { table: 'incident', fields: { short_description: MARKER } },
      });

      const lines = auditLines();
      expect(lines).toHaveLength(1);
      expect(lines[0]!.tool).toBe('snow_core_record_add');
      expect(lines[0]!.table).toBe('incident');
      expect(lines[0]!.instance).toBe('pdi');
      expect(lines[0]!.gate).toBe('write');
      expect(lines[0]!.source).toBe('mcp');
      expect(typeof lines[0]!.ms).toBe('number');
      // Nothing is listening, so `result` is the network code rather than `ok`. Which code
      // depends on whether the connection is refused or times out first, and that varies by
      // platform — so what is asserted is that the RESULT FIELD carries the failure rather
      // than reporting success. The criterion's literal `ok` needs a reachable instance, and
      // that half is the owner's live sitting; the line shape is what this proves.
      expect(lines[0]!.result).not.toBe('ok');
      expect(String(lines[0]!.result)).toMatch(/^[A-Z_]+$/);
      expect(auditText()).not.toContain(MARKER);
    } finally { await client.close(); }
  }, 40_000);

  it('no payload-shaped key appears in the line at all', async () => {
    writeStore();
    const { client } = await connect();
    try {
      await client.callTool({
        name: 'snow_core_record_add',
        arguments: { table: 'incident', fields: { short_description: MARKER }, script: MARKER },
      });
      const keys = Object.keys(auditLines()[0]!);
      for (const forbidden of ['fields', 'data', 'script', 'payload', 'record', 'body']) {
        expect(keys, forbidden).not.toContain(forbidden);
      }
    } finally { await client.close(); }
  }, 40_000);
});

describe('criterion 2 - refusals are recorded, reads are not', () => {
  it('read-only records the refusal with its code', async () => {
    writeStore('read-only');
    const { client } = await connect();
    try {
      await client.callTool({
        name: 'snow_core_record_add',
        arguments: { table: 'incident', fields: { short_description: MARKER } },
      });
      const lines = auditLines();
      expect(lines).toHaveLength(1);
      expect(lines[0]!.result).toBe('WRITE_NOT_ENABLED');
      // A refused write is arguably the most audit-worthy event there is: it is what an
      // after-the-fact reviewer looks for.
      expect(auditText()).not.toContain(MARKER);
    } finally { await client.close(); }
  }, 40_000);

  it('a mutates:false tool appends nothing', async () => {
    writeStore();
    const { client } = await connect();
    try {
      await client.callTool({ name: 'snow_core_records_query', arguments: { table: 'incident' } });
      expect(auditLines()).toEqual([]);
    } finally { await client.close(); }
  }, 40_000);

  it('an unknown tool appends nothing - a typo is not an attempted write', async () => {
    writeStore();
    const { client } = await connect();
    try {
      await client.callTool({ name: 'snow_not_a_tool', arguments: {} }).catch(() => undefined);
      expect(auditLines()).toEqual([]);
    } finally { await client.close(); }
  }, 40_000);
});

describe('ruling 2 - sessionMutates tools are audited, with a note', () => {
  it('instance_switch writes a line with null table/sysId/query and a note', async () => {
    writeStore();
    const { client } = await connect();
    try {
      await client.callTool({ name: 'snow_core_instance_switch', arguments: { name: 'other' } });
      const lines = auditLines();
      expect(lines).toHaveLength(1);
      expect(lines[0]!.tool).toBe('snow_core_instance_switch');
      expect(lines[0]!.table).toBeNull();
      expect(lines[0]!.sysId).toBeNull();
      expect(lines[0]!.query).toBeNull();
      // The destination label, read back from the manager — never `args.name`. The sweep in
      // criterion 4 passes the payload marker as every argument, and it found the marker in
      // this field when the note was built from the request.
      expect(lines[0]!.note).toBe(`switch ${String.fromCharCode(8594)} other`);
      expect(lines[0]!.result).toBe('ok');
    } finally { await client.close(); }
  }, 40_000);

  it('and a later write shows the new instance, which is the point of the line', async () => {
    writeStore();
    const { client } = await connect();
    try {
      await client.callTool({ name: 'snow_core_instance_switch', arguments: { name: 'other' } });
      await client.callTool({
        name: 'snow_core_record_add',
        arguments: { table: 'incident', fields: { short_description: MARKER } },
      });
      const lines = auditLines();
      expect(lines).toHaveLength(2);
      // The switch line names where it switched FROM, and the note where it went. Reading the
      // instance after the switch had run said "other" twice and lost the origin.
      expect(lines[0]!.instance).toBe('pdi');
      expect(lines[0]!.note).toContain('other');
      // Without that line, this second entry naming a different instance would be unexplained
      // - which is exactly why sessionMutates is audited.
      expect(lines[1]!.instance).toBe('other');
    } finally { await client.close(); }
  }, 40_000);
});

describe('criterion 4 - no credential in the audit file or on stderr', () => {
  it('across every mutating tool called under full, with the fixture credentials', async () => {
    writeStore('full');
    const { client, stderr } = await connect();
    try {
      // Every mutating tool, called with the marker in every argument shape they take. Most
      // refuse at validation; that is the point - the audit line and the log are written for
      // refusals too, and a refusal message is a common place for an argument to be echoed.
      // The same two `contract.test.ts` excludes, for the same measured reason: they spawn the
      // `@servicenow/sdk` CLI and wait for it (92 s and 60 s before giving up), so including
      // them makes this a test of how long a build takes rather than of what gets logged. They
      // are covered anyway — under `read-only` the fluent gate refuses long before the spawn,
      // and the case below runs them there.
      const SPAWNS_AN_EXTERNAL_PROCESS = ['snow_fluent_build', 'snow_fluent_validate'];
      const mutating = collectToolCatalog()
        .filter((t) => t.mutates || t.sessionMutates)
        .filter((t) => !SPAWNS_AN_EXTERNAL_PROCESS.includes(t.name));
      expect(mutating.length).toBeGreaterThan(100);

      // The ceiling on this test is 180 s against a suite default of 30 s, and the reason is
      // measured rather than guessed: one stdio round-trip per mutating tool, 160 of them,
      // is ~61 s on an idle developer machine and ~64 s on a CI runner. The margin is for a
      // loaded runner, not for the happy path. The elapsed time is logged so that a future
      // slowdown arrives as a number in the run output rather than as a mystery timeout.
      const started = Date.now();

      for (const t of mutating) {
        await client.callTool({
          name: t.name,
          arguments: { table: 'incident', fields: { x: MARKER }, name: MARKER, script: MARKER },
        }).catch(() => undefined);
      }

      const elapsed = Date.now() - started;
      console.log(`  no-secrets sweep: ${mutating.length} mutating tools in ${elapsed} ms`);

      const audit = auditText();
      const log = stderr();

      // CREDENTIALS: forbidden in both, at any log level. This is the criterion.
      for (const [what, body] of [['audit', audit], ['stderr', log]] as const) {
        expect(body, `${what} contains the fixture password`).not.toContain(FIXTURE_PASS);
        expect(body, `${what} contains the fixture username`).not.toContain(FIXTURE_USER);
        // `Basic ` followed by base64 - the encoded form the password would take in a header.
        expect(body, `${what} contains an Authorization header`).not.toMatch(/Basic\s+[A-Za-z0-9+/=]{8,}/);
      }

      // PAYLOAD: forbidden in the audit file, always. The audit trail is a durable record that
      // outlives the session and gets read by people who were not there; a payload in it is a
      // second copy of client data sitting in a checkout.
      expect(audit, 'the audit file contains the payload marker').not.toContain(MARKER);

      // Deliberately NOT asserted for stderr at this level: the sweep runs at
      // SNOW_LOG_LEVEL=debug, where echoing arguments is what debug logging is FOR and the
      // operator asked for it. The default-level case below is where that line is drawn.

      // Not vacuous: the run must actually have produced a trail and a log, or every
      // assertion above passes against empty strings.
      expect(auditLines().length).toBeGreaterThan(100);
      expect(log.length).toBeGreaterThan(100);
    } finally { await client.close(); }
  }, 180_000);

  it('at the DEFAULT log level, no payload reaches stderr either', async () => {
    // The sweep above runs at debug on purpose - more output means a harder credential test.
    // But an operator who has not opted into debug should not find request payloads in their
    // terminal, so the line between "debug prints arguments" and "normal operation does not"
    // is asserted rather than assumed.
    writeStore('full');
    const { client, stderr } = await connect({ SNOW_LOG_LEVEL: 'info' });
    try {
      for (const name of ['snow_core_record_add', 'snow_core_record_modify', 'snow_scr_business_rule_add']) {
        await client.callTool({
          name, arguments: { table: 'incident', sys_id: 'a'.repeat(32), fields: { x: MARKER }, script: MARKER },
        }).catch(() => undefined);
      }
      const log = stderr();
      expect(log).not.toContain(MARKER);
      expect(log).not.toContain(FIXTURE_PASS);
      // Not vacuous: the calls did produce output at this level.
      expect(log).toContain('Tool called: snow_core_record_add');
    } finally { await client.close(); }
  }, 60_000);

  it('including the two SDK-spawning tools, refused at the gate under read-only', async () => {
    // The half the sweep above cannot run without waiting on an external build. Here the
    // fluent gate refuses before the spawn, so the pair is still exercised with the fixture
    // credentials loaded and the marker in the arguments — which is what the criterion is
    // about. Skipping them entirely would have left two tools no leak test ever touched.
    writeStore('read-only');
    const { client, stderr } = await connect();
    try {
      for (const name of ['snow_fluent_build', 'snow_fluent_validate']) {   // build mutates, validate does not
        await client.callTool({
          name, arguments: { table: 'incident', fields: { x: MARKER }, name: MARKER, script: MARKER },
        }).catch(() => undefined);
      }
      // One line, not two: `snow_fluent_validate` is `mutates: false` (it validates a local
      // source tree and changes nothing), so it appends nothing — which is criterion 2's rule
      // holding for a tool that happens also to be excluded above.
      const lines = auditLines();
      expect(lines).toHaveLength(1);
      expect(lines[0]!.tool).toBe('snow_fluent_build');
      expect(String(lines[0]!.result)).toMatch(/_NOT_ENABLED$/);
      for (const body of [auditText(), stderr()]) {
        expect(body).not.toContain(FIXTURE_PASS);
        expect(body).not.toContain(MARKER);
      }
    } finally { await client.close(); }
  }, 60_000);
});

describe('criterion 6 - SNOW_AUDIT_FILE=off', () => {
  it('warns once at startup, writes nothing, and calls still work', async () => {
    writeStore();
    const { client, stderr } = await connect({ SNOW_AUDIT_FILE: 'off' });
    try {
      const r = await client.callTool({
        name: 'snow_core_record_add',
        arguments: { table: 'incident', fields: { short_description: MARKER } },
      });
      expect((r as { content: Array<{ text: string }> }).content[0]!.text).toContain('Error');
      expect(existsSync(auditFile)).toBe(false);
      const warnings = stderr().split('\n').filter((l) => l.includes('audit trail disabled'));
      expect(warnings).toHaveLength(1);
    } finally { await client.close(); }
  }, 40_000);
});
