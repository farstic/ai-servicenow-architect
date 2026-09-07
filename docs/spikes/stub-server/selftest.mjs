#!/usr/bin/env node
// spikes/stub-server/selftest.mjs -- self-test for the stub MCP server (ARC-00-S01 test strategy).
// Runs on macOS, Linux and Windows with no packages: `node spikes/stub-server/selftest.mjs`.
// Asserts the acceptance criteria 1 and 2 of the story plus the S-02 / S-17 / S-18 stub behaviours.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SERVER = join(dirname(fileURLToPath(import.meta.url)), 'server.mjs');
const PROXY = 'http://u:p@proxy.invalid:3128';   // fixture only -- an unroutable host, not a real proxy

let failures = 0;
const ok = (cond, label, detail = '') => {
  if (cond) console.log(`  PASS  ${label}`);
  else { failures++; console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ''}`); }
};

// Drive the server with a list of requests, return { lines, ms, code }.
function drive(requests, env = {}) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    // The four proxy/CA keys are reported by presence, so an inherited value would make the AC2
    // assertions a statement about the operator's shell rather than about the stub. They are
    // DELETED, not blanked -- an empty string reports `set (len 0)`, not `unset`. Windows folds
    // environment-variable names, so the match is case-insensitive.
    const base = { ...process.env, STUB_CONFIGURED: '', STUB_STARTUP_DELAY_MS: '', STUB_EXIT_ON_START: '' };
    for (const k of Object.keys(base)) {
      if (['https_proxy', 'http_proxy', 'no_proxy', 'node_extra_ca_certs'].includes(k.toLowerCase())) delete base[k];
    }
    const child = spawn(process.execPath, [SERVER], {
      env: { ...base, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '';
    const stamps = [];
    child.stdout.on('data', (d) => { out += d; stamps.push(Date.now() - t0); });
    child.on('close', (code) => {
      const lines = out.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
      resolve({ lines, firstMs: stamps[0] ?? -1, code, raw: out });
    });
    for (const r of requests) child.stdin.write(JSON.stringify(r) + '\n');
    child.stdin.end();
  });
}

const INIT = { jsonrpc: '2.0', id: 1, method: 'initialize',
  params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } };
const LIST = (id) => ({ jsonrpc: '2.0', id, method: 'tools/list' });
const CALL = (id, name) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: {} } });

const SET_A_NAMES = ['snow_core_instances_index', 'snow_core_instances_reload',
  'snow_core_current_instance_read', 'snow_core_capabilities_read', 'snow_core_status_read'];

console.log('stub-server self-test');

// -- AC 1: unconfigured start, initialize under 200 ms, exactly five tools (set A)
{
  const { lines, firstMs } = await drive([INIT, LIST(2)]);
  const init = lines.find((l) => l.id === 1);
  const list = lines.find((l) => l.id === 2);
  ok(!!init?.result, 'AC1 initialize returns a result');
  ok(firstMs >= 0 && firstMs < 200, `AC1 first line within 200 ms (observed ${firstMs} ms)`);
  ok(init?.result?.protocolVersion === '2025-06-18', 'AC1 initialize echoes the client protocolVersion');
  ok(init?.result?.serverInfo?.name === 'servicenow-stub', 'AC1 serverInfo.name is servicenow-stub');
  ok(init?.result?.capabilities?.tools?.listChanged === true, 'AC1 capabilities.tools.listChanged is true');
  ok(list?.result?.tools?.length === 5, `AC1 tools/list returns 5 tools (set A), observed ${list?.result?.tools?.length}`);
  ok(JSON.stringify(list?.result?.tools?.map((t) => t.name)) === JSON.stringify(SET_A_NAMES),
     'AC1 set A names match 01 section 9 / ARC-04 README item 2');
}

// -- AC 2: STUB_CONFIGURED=1 -> eight tools, and the env probe redacts the proxy value
{
  const { lines } = await drive([INIT, LIST(2), CALL(3, 'snow_probe_env_read'), CALL(4, 'snow_core_record_add')],
    { STUB_CONFIGURED: '1', HTTPS_PROXY: PROXY });
  const names = lines.find((l) => l.id === 2)?.result?.tools?.map((t) => t.name) ?? [];
  const probe = lines.find((l) => l.id === 3)?.result?.content?.[0]?.text ?? '';
  const add = lines.find((l) => l.id === 4)?.result?.content?.[0]?.text ?? '';
  ok(names.length === 8, `AC2 tools/list returns 8 tools (set B), observed ${names.length}`);
  ok(names.includes('snow_core_record_add') && names.includes('snow_probe_env_read'),
     'AC2 set B includes snow_core_record_add and snow_probe_env_read');
  ok(probe.includes(`HTTPS_PROXY: set (len ${PROXY.length})`),
     `AC2 HTTPS_PROXY reported as "set (len ${PROXY.length})"`, probe.split('\n').find((l) => l.startsWith('HTTPS_PROXY')));
  ok(!probe.includes(PROXY) && !probe.includes('proxy.invalid') && !probe.includes('u:p@'),
     'AC2 the proxy value never appears in the probe output');
  ok(probe.includes('HTTP_PROXY: unset') && probe.includes('NO_PROXY: unset') && probe.includes('NODE_EXTRA_CA_CERTS: unset'),
     'AC2 the other three proxy/CA keys report "unset"');
  ok(add === 'stub: would create record', 'S-18 snow_core_record_add returns the fixed string');
}

// -- S-20 discrimination: an inherited empty string must not read as "unset"
{
  const { lines } = await drive([INIT, LIST(2), CALL(3, 'snow_probe_env_read')],
    { STUB_CONFIGURED: '1', SNOW_STORE: '', HTTPS_PROXY: '' });
  const probe = lines.find((l) => l.id === 3)?.result?.content?.[0]?.text ?? '';
  ok(probe.includes('SNOW_STORE: (set, empty string)'), 'S-20 an empty inherited value reads as "(set, empty string)"');
  ok(probe.includes('HTTPS_PROXY: set (len 0)'), 'S-20 an empty redacted value reads as "set (len 0)", not "unset"');
}

// -- S-02: reload from set A switches to set B and emits notifications/tools/list_changed
{
  const { lines } = await drive([INIT, LIST(2), CALL(3, 'snow_core_instances_reload'), LIST(4)]);
  const before = lines.find((l) => l.id === 2)?.result?.tools?.length;
  const after = lines.find((l) => l.id === 4)?.result?.tools?.length;
  const note = lines.find((l) => l.method === 'notifications/tools/list_changed');
  ok(before === 5 && after === 8, `S-02 tool count goes 5 -> 8 after reload (observed ${before} -> ${after})`);
  ok(!!note, 'S-02 notifications/tools/list_changed is emitted');
  ok(note && note.id === undefined, 'S-02 list_changed is a notification (no id)');
}

// -- S-17 negative control: STUB_EXIT_ON_START=1 exits 1 before initialize
{
  const { lines, code } = await drive([INIT], { STUB_EXIT_ON_START: '1' });
  ok(code === 1, `S-17 negative control exits with code 1 (observed ${code})`);
  ok(lines.length === 0, 'S-17 negative control writes nothing to stdout');
}

// -- S-06 lever: STUB_STARTUP_DELAY_MS delays the initialize reply
{
  const { firstMs } = await drive([INIT], { STUB_STARTUP_DELAY_MS: '400' });
  ok(firstMs >= 380, `S-06 STUB_STARTUP_DELAY_MS=400 delays the reply (observed ${firstMs} ms)`);
}

console.log(failures === 0 ? '\nstub-server self-test: OK' : `\nstub-server self-test: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
