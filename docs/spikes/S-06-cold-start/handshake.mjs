#!/usr/bin/env node
// spikes/S-06-cold-start/handshake.mjs — measure a stdio MCP server's cold start (ARC-00-S08, S-06).
// Zero dependencies. ARC-06's lib/mcp-handshake.mjs reuses this as its reference implementation.
//
//   node spikes/S-06-cold-start/handshake.mjs <path-to-server.js> [--json] [--repeat N]
//
// Spawns the server with a PLACEHOLDER environment — SERVICENOW_INSTANCE_URL only, no credentials and
// no capability flags — sends `initialize`, then `tools/list`, and prints the two latencies and the tool
// count. A placeholder start may log errors to stderr while still advertising its tools; that is
// expected here and is what ARC-04's unconfigured mode later replaces.

import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const server = args.find((a) => !a.startsWith('--'));
const asJson = args.includes('--json');
const repeat = Number((args.find((a) => a.startsWith('--repeat=')) || '--repeat=1').split('=')[1]) || 1;
const inheritEnv = args.includes('--inherit-env');
const expect = Number((args.find((a) => a.startsWith('--expect-tools=')) || '--expect-tools=0').split('=')[1]) || 0;
if (!server) { console.error('usage: handshake.mjs <server.js> [--json] [--repeat=N] [--expect-tools=N] [--inherit-env]'); process.exit(2); }

const INIT = { jsonrpc: '2.0', id: 1, method: 'initialize',
  params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'arc00-handshake', version: '0' } } };
const LIST = { jsonrpc: '2.0', id: 2, method: 'tools/list' };

function once() {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let tInit = null, tList = null, tools = null, buf = '', stderr = '', settled = false;
    // The story specifies a PLACEHOLDER environment: `SERVICENOW_INSTANCE_URL` alone, no credentials
    // and no capability flags. Inheriting process.env would make the tool count and the latency depend
    // on whatever the operator's shell happens to export — on a machine with a live instance configured,
    // a stray SNOW_* or MCP_TOOL_PACKAGE would silently change the headline number. Only the variables a
    // Node process genuinely needs to run are carried over. `--inherit-env` restores the old behaviour
    // for anyone who wants to measure their own shell deliberately.
    const KEEP = ['PATH', 'HOME', 'USERPROFILE', 'SystemRoot', 'windir', 'COMSPEC', 'TMPDIR', 'TEMP', 'TMP',
                  'LANG', 'LC_ALL', 'NODE_OPTIONS', 'APPDATA', 'LOCALAPPDATA', 'PATHEXT'];
    const base = inheritEnv ? { ...process.env } : Object.fromEntries(
      Object.entries(process.env).filter(([k]) => KEEP.includes(k)));
    const child = spawn(process.execPath, [server], {
      env: { ...base, SERVICENOW_INSTANCE_URL: 'https://example.invalid' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const finish = (error) => {
      if (settled) return; settled = true;
      try { child.kill('SIGTERM'); } catch {}
      resolve({ initializeMs: tInit, toolsListMs: tList, tools, error, stderrHead: stderr.split('\n').filter(Boolean).slice(0, 3) });
    };
    const timer = setTimeout(() => finish('timeout after 120000 ms'), 120000);
    child.stderr.on('data', (d) => { stderr += d; });
    child.stdout.on('data', (d) => {
      buf += d;
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
        if (!line) continue;
        let msg; try { msg = JSON.parse(line); } catch { continue; }   // ignore non-JSON log lines
        if (msg.id === 1 && tInit === null) {
          if (msg.error) { clearTimeout(timer); return finish(`initialize returned a JSON-RPC error: ${JSON.stringify(msg.error)}`); }
          tInit = Date.now() - t0;
          child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
          child.stdin.write(JSON.stringify(LIST) + '\n');
        } else if (msg.id === 2) {
          tList = Date.now() - t0;
          if (msg.error) { clearTimeout(timer); return finish(`tools/list returned a JSON-RPC error: ${JSON.stringify(msg.error)}`); }
          if (!Array.isArray(msg.result?.tools)) { clearTimeout(timer); return finish('tools/list result has no tools array'); }
          tools = msg.result.tools.length;
          clearTimeout(timer); finish(null);
        }
      }
    });
    child.on('error', (e) => { clearTimeout(timer); finish(String(e)); });
    child.on('close', () => { clearTimeout(timer); finish(tList === null ? 'server exited before tools/list' : null); });
    child.stdin.write(JSON.stringify(INIT) + '\n');
  });
}

const runs = [];
for (let i = 0; i < repeat; i++) runs.push(await once());

const ok = runs.filter((r) => !r.error);
const out = {
  server,
  node: process.version,
  platform: `${process.platform}-${process.arch}`,
  runs: runs.map((r) => ({ initializeMs: r.initializeMs, toolsListMs: r.toolsListMs, tools: r.tools, error: r.error })),
  initializeMsMax: ok.length ? Math.max(...ok.map((r) => r.initializeMs)) : null,
  toolsListMsMax: ok.length ? Math.max(...ok.map((r) => r.toolsListMs)) : null,
  tools: ok.length ? ok[0].tools : null,
  stderrHead: runs[0].stderrHead,
};

if (asJson) console.log(JSON.stringify(out, null, 2));
else {
  for (const r of out.runs) {
    console.log(r.error ? `ERROR: ${r.error}` :
      `initialize: ${r.initializeMs} ms · tools/list: ${r.toolsListMs} ms · tools: ${r.tools}`);
  }
  if (out.stderrHead.length) console.log(`stderr (first ${out.stderrHead.length} line(s)): ${out.stderrHead.join(' | ')}`);
}
const failures = runs.length - ok.length;
const countWrong = expect > 0 && ok.some((r) => r.tools !== expect);
if (failures) console.error(`FAIL: ${failures} of ${runs.length} run(s) did not complete a handshake`);
if (countWrong) console.error(`FAIL: expected ${expect} tools, observed ${[...new Set(ok.map((r) => r.tools))].join('/')}`);
process.exit(failures === 0 && !countWrong ? 0 : 1);
