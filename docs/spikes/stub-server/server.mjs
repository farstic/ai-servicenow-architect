#!/usr/bin/env node
// spikes/stub-server/server.mjs
//
// Zero-dependency MCP stdio stub server for the ARC-00 spikes.
// Node >= 20, node:readline over stdin, newline-delimited JSON-RPC 2.0, no packages.
// Spec: ARC-00-S01 "Design notes" in docs/plans/ARC-00-spikes-and-gating-decisions/STORIES.md.
//
// Environment switches
//   STUB_CONFIGURED=1        advertise tool set B (8 tools) instead of set A (5 tools)
//   STUB_STARTUP_DELAY_MS=n  delay the `initialize` reply by n ms (S-06 cold-start / MCP_TIMEOUT)
//   STUB_EXIT_ON_START=1     exit(1) before `initialize` (negative control for S-17)
//
// Redaction (spike-record rule): the four proxy/CA variables are never printed by value,
// only as `unset` or `set (len n)` -- a proxy URL can carry credentials. Path-valued keys
// (CLAUDE_PROJECT_DIR, SNOW_STORE) and the STUB_CONFIGURED flag are printed verbatim, and an
// empty string is reported as `(set, empty string)` so that S-20 can tell "inherited empty"
// from "not inherited at all".

import { createInterface } from 'node:readline';

if (process.env.STUB_EXIT_ON_START === '1') process.exit(1);

const STARTUP_DELAY_MS = Number(process.env.STUB_STARTUP_DELAY_MS || 0) || 0;

// ---------------------------------------------------------------- tool sets

const schema = { type: 'object', properties: {}, additionalProperties: false };

// Set A -- the five tools the ARC-04 server advertises when it starts unconfigured
// (01 section 9, the ARC-04 README item 2, and the 03 section A S-17 row, which also lists five).
const SET_A = [
  { name: 'snow_core_instances_index',      description: 'Stub: list configured instances.',   inputSchema: schema },
  { name: 'snow_core_instances_reload',     description: 'Stub: reload the instance store.',   inputSchema: schema },
  { name: 'snow_core_current_instance_read',description: 'Stub: read the current instance.',   inputSchema: schema },
  { name: 'snow_core_capabilities_read',    description: 'Stub: read server capabilities.',    inputSchema: schema },
  { name: 'snow_core_status_read',          description: 'Stub: read server status.',          inputSchema: schema },
];

// Set B -- set A plus the three tools a configured server adds.
const SET_B_EXTRA = [
  { name: 'snow_core_records_query',        description: 'Stub: query records.',               inputSchema: schema },
  { name: 'snow_core_record_add',           description: 'Stub: create a record (mutates).',   inputSchema: schema },
  { name: 'snow_probe_env_read',            description: 'Stub: report cwd, argv and selected environment variables.', inputSchema: schema },
];

let configured = process.env.STUB_CONFIGURED === '1';
const tools = () => (configured ? [...SET_A, ...SET_B_EXTRA] : [...SET_A]);

// ---------------------------------------------------------------- env probe

const REDACTED_KEYS = ['HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'NODE_EXTRA_CA_CERTS'];
const VERBATIM_KEYS = ['CLAUDE_PROJECT_DIR', 'SNOW_STORE', 'STUB_CONFIGURED'];

function envLine(key) {
  const v = process.env[key];
  if (v === undefined) return `${key}: unset`;
  if (REDACTED_KEYS.includes(key)) return `${key}: set (len ${v.length})`;
  if (v === '') return `${key}: (set, empty string)`;
  return `${key}: ${v}`;
}

function probeEnvText() {
  const lines = [
    'snow_probe_env_read (stub)',
    `cwd: ${process.cwd()}`,
    `argv: ${JSON.stringify(process.argv)}`,
    'env:',
  ];
  for (const k of [...VERBATIM_KEYS, ...REDACTED_KEYS]) lines.push(envLine(k));
  return lines.join('\n');
}

// ---------------------------------------------------------------- transport

// A delayed `initialize` (STUB_STARTUP_DELAY_MS) must still be flushed when stdin closes,
// so the process only exits once no reply is outstanding.
let pending = 0;
let stdinEnded = false;
// process.exit() would discard stdout writes still queued by libuv (writes to a pipe are
// asynchronous), so the process is ended by letting the event loop drain instead.
function maybeExit() { if (stdinEnded && pending === 0) { process.exitCode = 0; process.stdin.destroy(); } }

function write(obj) { process.stdout.write(JSON.stringify(obj) + '\n'); }
function result(id, res) { write({ jsonrpc: '2.0', id, result: res }); }
function error(id, code, message) { write({ jsonrpc: '2.0', id, error: { code, message } }); }
function text(id, s) { result(id, { content: [{ type: 'text', text: s }] }); }

function callTool(id, name) {
  switch (name) {
    case 'snow_probe_env_read':
      return text(id, probeEnvText());                       // S-03 and S-20
    case 'snow_core_record_add':
      return text(id, 'stub: would create record');          // S-18
    case 'snow_core_instances_reload': {                     // S-02
      const wasConfigured = configured;
      configured = true;
      text(id, wasConfigured
        ? 'stub: reloaded (tool set B already advertised)'
        : 'stub: reloaded (tool set B now advertised)');
      write({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' });
      return;
    }
    default:
      return text(id, `stub: ${name} ok`);                   // every other tool
  }
}

function handle(msg) {
  const { id, method, params } = msg;
  const isNotification = id === undefined || id === null;

  if (isNotification) return;                                // never answer a notification

  switch (method) {
    case 'initialize': {
      const payload = {
        protocolVersion: params?.protocolVersion ?? '2025-06-18',   // echo the client's version
        capabilities: { tools: { listChanged: true } },
        serverInfo: { name: 'servicenow-stub', version: '0.0.0' },
      };
      if (STARTUP_DELAY_MS > 0) {
        pending++;
        setTimeout(() => { result(id, payload); pending--; maybeExit(); }, STARTUP_DELAY_MS);
      } else result(id, payload);
      return;
    }
    case 'ping':            return result(id, {});
    case 'tools/list':      return result(id, { tools: tools() });
    case 'tools/call': {
      const name = params?.name;
      if (!tools().some((t) => t.name === name)) return error(id, -32602, `Unknown tool: ${name}`);
      return callTool(id, name);
    }
    // Not advertised in `capabilities`; answered with empty lists rather than -32601 so that
    // a client that probes them anyway shows no error in /mcp (S-17 wants a clean panel).
    case 'resources/list':  return result(id, { resources: [] });
    case 'prompts/list':    return result(id, { prompts: [] });
    default:                return error(id, -32601, `Method not found: ${method}`);
  }
}

createInterface({ input: process.stdin, crlfDelay: Infinity }).on('line', (line) => {
  const s = line.trim();
  if (!s) return;
  let msg;
  try { msg = JSON.parse(s); } catch { return write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); }
  for (const m of Array.isArray(msg) ? msg : [msg]) handle(m);
});

process.stdin.on('end', () => { stdinEnded = true; maybeExit(); });
