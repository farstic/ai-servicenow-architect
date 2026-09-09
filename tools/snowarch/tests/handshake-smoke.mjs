#!/usr/bin/env node
/**
 * ARC-06-S14 — the committed `dist/server.js` answers a handshake, on every OS.
 *
 * A design-only install never reaches B08: the handshake is live-only, so without this the
 * committed artefact would be exercised on one machine (the maintainer's, at build time) and
 * shipped to three. This runs the SAME module B08 runs — `lib/mcp-handshake.mjs` — against the
 * server with NO store, and expects exactly the core tools an unconfigured server offers.
 *
 * A thin runner, on purpose. A second implementation of the protocol would be a second opinion
 * about what a correct handshake looks like, and this one runs on machines the other does not.
 *
 *   node tools/snowarch/tests/handshake-smoke.mjs
 *
 * Exit 0 ok · 1 the server, the contract and the core set do not agree · 2 cannot run.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { HandshakeError, handshake, serverCommand } from '../lib/mcp-handshake.mjs';
import { compareTools } from '../lib/steps/B08.mjs';
import { childEnv } from '../lib/spawn-env.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (rel) => JSON.parse(readFileSync(join(root, rel), 'utf8'));

const cannotRun = (message) => {
  process.stderr.write(`handshake-smoke: ${message}\n`);
  process.exit(2);
};

const config = read('engine.config.json');
const mcp = read('.mcp.json');
const contract = read('packages/snowarch/dist/contract.json');
const settings = read('.claude/settings.json');

/** The core set, from the build that decides it — never a list typed here. */
const coreTools = await (async () => {
  try {
    const mod = await import(pathToFileURL(
      join(root, 'packages/snowarch/dist/tools/status.js')).href);
    return mod.CORE_TOOLS_UNCONFIGURED;
  } catch (e) { return cannotRun(`dist/tools/status.js does not load: ${e.message}`); }
})();

const protocolVersion = await (async () => {
  try {
    const mod = await import(pathToFileURL(
      join(root, 'node_modules/@modelcontextprotocol/sdk/dist/esm/types.js')).href);
    return mod.LATEST_PROTOCOL_VERSION;
  } catch { return cannotRun('the MCP SDK is not installed — run npm ci first'); }
})();

const cmd = serverCommand({ mcp, serverKey: config.mcp.serverKey, root, env: process.env });
let result;
try {
  result = await handshake({
    ...cmd,
    cwd: root,
    // Our spawn, so the session variable is SET rather than inherited (S08). Without this, a run
    // inside a Claude Code session pointed elsewhere would start another repository's server.
    env: childEnv(root, { SNOW_STORE: '' }),
    timeoutMs: Number(settings.env?.MCP_TIMEOUT ?? 120_000),
    protocolVersion,
    clientVersion: read('package.json').version,
    live: false,
    onStderr: (line) => process.stderr.write(`  server: ${line}`),
  });
} catch (e) {
  if (!(e instanceof HandshakeError)) throw e;
  process.stderr.write(`handshake-smoke: the committed dist/server.js failed the handshake `
    + `(${e.phase}): ${e.message}\n`);
  process.exit(1);
}

// The comparison is B08's own, imported rather than repeated: "what an unconfigured server should
// advertise" is one question, and a second answer here would be the one that is wrong.
const problems = compareTools({
  advertised: result.tools,
  contract,
  pin: read('packages/contract/required-tools.json'),
  configured: false,
  coreTools,
});

if (problems.length > 0) {
  process.stderr.write('handshake-smoke: the committed dist/ and the contract disagree:\n');
  for (const p of problems) process.stderr.write(`  ✗ ${p}\n`);
  process.exit(1);
}
process.stdout.write(`handshake-smoke: ${result.tools.length} core tools, contract match, `
  + `initialize ${result.initializeMs} ms\n`);
