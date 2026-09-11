import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SERVER = resolve(here, '../../dist/server.js');

/**
 * Criterion 7: the MCP handshake against the BUILT server, over stdio, as a client sees it.
 *
 * It spawns dist/server.js rather than importing src — an import would prove the module
 * evaluates, not that the published entry point answers `initialize`. `pretest` builds it,
 * so this runs on every CI cell including Windows, where the path separators and the shell
 * differ and a src-only test would have proved nothing about either.
 */
function initialize(): Promise<any> {
  return new Promise((ok, fail) => {
    const child = spawn(process.execPath, [SERVER], {
      // A loopback URL, not a reserved-TLD hostname. The unconfigured handshake never contacts
      // it — the variable exists only so `instances.ts` sees one configured instance — but the
      // legacy env path DOES still read this variable, so it cannot simply be dropped, and a
      // hostname whose non-resolution is a promise the network keeps only usually has no place in
      // a suite that touches no network.
      env: { ...process.env, SERVICENOW_INSTANCE_URL: 'https://127.0.0.1:9' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '';
    let done = false;
    const timer = setTimeout(() => { if (!done) { child.kill(); fail(new Error(`no initialize response; stdout so far: ${out}`)); } }, 30_000);
    child.stdout.on('data', (b) => {
      out += b.toString();
      for (const line of out.split('\n')) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id === 1) { done = true; clearTimeout(timer); child.kill(); ok(msg); }
        } catch { /* a partial frame — wait for the rest */ }
      }
    });
    child.on('error', (e) => { clearTimeout(timer); fail(e); });
    child.stdin.write(`${JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'handshake-test', version: '0' } },
    })}\n`);
  });
}

describe('MCP handshake over stdio', () => {
  it('the built server exists — pretest built it', () => {
    expect(existsSync(SERVER), `${SERVER} missing; npm run build must precede npm test`).toBe(true);
  });

  it('answers initialize with the product identity', async () => {
    const msg = await initialize();
    expect(msg.error).toBeUndefined();
    expect(msg.result.serverInfo.name).toBe('snowarch');
    // The version comes from package.json via getPackageVersion(), so this also fails if the
    // package version drifts from the root version of record (tests/version-consistency.test.mjs).
    expect(msg.result.serverInfo.version).toBe('2.0.0-dev');
  }, 40_000);

  it('advertises tools and resources, and no longer advertises prompts', async () => {
    const caps = (await initialize()).result.capabilities;
    expect(caps.tools).toBeDefined();
    expect(caps.resources).toBeDefined();
    expect(caps.prompts).toBeUndefined();
  }, 40_000);
});
