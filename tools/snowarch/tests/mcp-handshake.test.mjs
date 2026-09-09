import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { HandshakeError, expand, handshake, parseToolResult, serverCommand } from '../lib/mcp-handshake.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const STUB = join(repoRoot, 'tools/snowarch/tests/fixtures/mcp-stub.mjs');
const stub = (env = {}) => ({ command: process.execPath, args: [STUB], cwd: repoRoot,
  env: { SNOWARCH_STUB_MODE: 'pages', ...env }, protocolVersion: 'test-1', timeoutMs: 5000 });

/** No child may outlive a handshake. Asked of the OS, not of the promise. */
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

test('AC 7 — three pages of tools/list come back as one list, in order', async () => {
  const r = await handshake({ ...stub({ SNOWARCH_STUB_TOOLS: 'a,b,c,d,e', SNOWARCH_STUB_PAGE_SIZE: '2' }) });
  assert.deepEqual(r.tools, ['a', 'b', 'c', 'd', 'e']);
  assert.equal(r.serverInfo.name, 'stub');
  assert.equal(r.protocolVersion, 'test-1', 'the version the client offered came back');
  assert.equal(typeof r.initializeMs, 'number');
  assert.equal(r.exited, 'clean', 'the child ended when stdin closed, without a signal');
});

test('a single page still terminates — the loop is not a page-count assumption', async () => {
  const r = await handshake({ ...stub({ SNOWARCH_STUB_TOOLS: 'only', SNOWARCH_STUB_PAGE_SIZE: '10' }) });
  assert.deepEqual(r.tools, ['only']);
});

test('AC 7 — a server that never answers rejects on the timeout, and leaves no child', async () => {
  let pid = null;
  const spawnFn = (...args) => { const child = spawn(...args); pid = child.pid; return child; };
  await assert.rejects(
    handshake({ ...stub({ SNOWARCH_STUB_MODE: 'silent' }), timeoutMs: 400, spawnFn }),
    (e) => {
      assert.ok(e instanceof HandshakeError);
      assert.equal(e.phase, 'timeout');
      assert.match(e.message, /did not answer within 400 ms/);
      return true;
    });
  // The reap lesson: a rejected handshake that left a process behind would be a leak the caller
  // has no handle to clean up, and on Windows it holds a file lock on `dist/`.
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(alive(pid), false, `child ${pid} outlived the timeout`);
});

test('AC 7 — an EPIPE at spawn is retried exactly once, and the retry can succeed', async () => {
  // Tested at the SEAM, not with a fixture process: a child cannot be made to close its stdin read
  // end reliably on every platform, and a fixture whose premise holds only on some of them is the
  // trap this project keeps re-learning. What is asserted is the policy — one retry, and a second
  // failure is a real failure — plus the outcome that matters: the retry can actually recover.
  const epipeChild = () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = Object.assign(new EventEmitter(), { write() {}, end() {} });
    child.kill = () => {};
    child.exitCode = null;
    child.signalCode = null;
    queueMicrotask(() => {
      const e = new Error('write EPIPE');
      e.code = 'EPIPE';
      child.stdin.emit('error', e);
    });
    return child;
  };

  let attempts = 0;
  const flaky = (...args) => {
    attempts += 1;
    return attempts === 1 ? epipeChild() : spawn(...args);
  };
  const r = await handshake({ ...stub({ SNOWARCH_STUB_TOOLS: 'a,b' }), spawnFn: flaky });
  assert.equal(attempts, 2, 'exactly one retry');
  assert.deepEqual(r.tools, ['a', 'b'], 'and the second attempt is the one that answers');

  // Twice is not a policy — a second EPIPE is a real failure, and retrying for ever would turn a
  // broken install into a hang.
  attempts = 0;
  await assert.rejects(handshake({ ...stub(), spawnFn: () => { attempts += 1; return epipeChild(); } }),
    (e) => { assert.equal(e.code, 'EPIPE'); assert.equal(e.phase, 'spawn'); return true; });
  assert.equal(attempts, 2);

  attempts = 0;
  await assert.rejects(handshake({ ...stub(), retryOnEpipe: false,
    spawnFn: () => { attempts += 1; return epipeChild(); } }));
  assert.equal(attempts, 1, 'and none when the caller says so');
});

test('a tools/call result comes back parsed, and a non-JSON one is not a crash', async () => {
  const r = await handshake({ ...stub({ SNOWARCH_STUB_CAPABILITIES: '{"label":"pdi","preset":"full"}' }),
    live: true, capabilityTool: 'anything' });
  assert.deepEqual(r.capabilities, { label: 'pdi', preset: 'full' });

  assert.equal(parseToolResult({ content: [] }), null);
  assert.deepEqual(parseToolResult({ content: [{ type: 'text', text: 'not json' }] }), { text: 'not json' });
  assert.deepEqual(parseToolResult(null), null);
});

test('the placeholder expansion is Claude Code\'s, defaults and all', () => {
  assert.equal(expand('${CLAUDE_PROJECT_DIR:-.}/x', {}, '/repo'), '/repo/x');
  assert.equal(expand('${CLAUDE_PROJECT_DIR:-.}/x', { CLAUDE_PROJECT_DIR: '/elsewhere' }, '/repo'),
    '/elsewhere/x');
  // An unset variable becomes its DEFAULT, not the literal characters — which is what a naive
  // expansion hands the server as a path.
  assert.equal(expand('${SNOW_STORE:-}', {}, '/repo'), '');
  assert.equal(expand('${SNOW_LOG_LEVEL:-info}', {}, '/repo'), 'info');
  assert.equal(expand('${SNOW_LOG_LEVEL:-info}', { SNOW_LOG_LEVEL: 'debug' }, '/repo'), 'debug');
  // An empty value is treated as unset, because `.mcp.json` forwards `${SNOW_STORE:-}`.
  assert.equal(expand('${SNOW_STORE:-fallback}', { SNOW_STORE: '' }, '/repo'), 'fallback');
});

test('serverCommand builds the spawn .mcp.json describes, and refuses a key it lacks', () => {
  const mcp = JSON.parse(readFileSync(join(repoRoot, '.mcp.json'), 'utf8'));
  const config = JSON.parse(readFileSync(join(repoRoot, 'engine.config.json'), 'utf8'));
  const cmd = serverCommand({ mcp, serverKey: config.mcp.serverKey, root: '/repo', env: {} });
  assert.equal(cmd.command, 'node');
  assert.deepEqual(cmd.args, ['/repo/packages/snowarch/dist/server.js']);
  assert.deepEqual(Object.keys(cmd.env).sort(), ['SNOW_LOG_LEVEL', 'SNOW_STORE']);
  assert.equal(cmd.env.SNOW_STORE, '', 'the unset default');
  assert.throws(() => serverCommand({ mcp, serverKey: 'not-registered', root: '/repo' }),
    /has no "not-registered" server/);
});

test('AC 2 — the REAL server, unconfigured, advertises exactly the core set', async () => {
  // The committed `dist/server.js`, spawned as Claude Code spawns it. This is the integration the
  // whole step exists for: the in-process doctor would prove a library works, which is not the
  // thing that fails.
  const mcp = JSON.parse(readFileSync(join(repoRoot, '.mcp.json'), 'utf8'));
  const config = JSON.parse(readFileSync(join(repoRoot, 'engine.config.json'), 'utf8'));
  // `pathToFileURL`: a dynamic import of an absolute path is a URL, and a Windows path is not one.
  const { LATEST_PROTOCOL_VERSION } = await import(
    pathToFileURL(join(repoRoot, 'node_modules/@modelcontextprotocol/sdk/dist/esm/types.js')).href);
  const { CORE_TOOLS_UNCONFIGURED } = await import(
    pathToFileURL(join(repoRoot, 'packages/snowarch/dist/tools/status.js')).href);

  const cmd = serverCommand({ mcp, serverKey: config.mcp.serverKey, root: repoRoot,
    // A store path that does not exist: unconfigured is the state under test, and the developer's
    // own `.local/instances.json` must not decide the outcome.
    env: { SNOW_STORE: join(repoRoot, '.local', 'no-such-store-for-this-test.json') } });

  const r = await handshake({ ...cmd, cwd: repoRoot, timeoutMs: 30_000,
    protocolVersion: LATEST_PROTOCOL_VERSION, clientVersion: '0.0.0-test' });

  assert.equal(r.serverInfo.name, 'snowarch');
  assert.deepEqual([...r.tools].sort(), [...CORE_TOOLS_UNCONFIGURED].sort(),
    'the core set comes from the build that decides it, never from a list here');
  assert.equal(r.exited, 'clean');
  // The server logs its store path to stderr; the handshake redacts every line before it is kept.
  assert.ok(!r.stderr.includes('Basic '), r.stderr.slice(0, 120));
});
