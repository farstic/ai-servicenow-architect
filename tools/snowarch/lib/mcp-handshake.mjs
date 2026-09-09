// ARC-06-S08 — start the server the way Claude Code will, and see what it says.
//
// The point is the SPAWN. The server package has its own in-process doctor, and reusing it would
// prove that a library works when imported — which is not the thing that fails. What fails is the
// child process: a cold start slower than `MCP_TIMEOUT`, a `dist/` that does not match the pinned
// contract, an `SNOW_STORE` in the operator's shell pointing somewhere else. So this speaks
// newline-delimited JSON-RPC over a real child's stdio, exactly as the MCP stdio transport does.
//
// Stdlib only, and every exit goes through one `settle` under one deadline: a handshake that hangs
// is worse than one that fails, because the bootstrap then has nothing to report and no way out.
import { spawn } from 'node:child_process';
import { redact } from './redact.mjs';
import { childEnv } from './spawn-env.mjs';

export const CLIENT_NAME = 'snowarch-bootstrap';
export const SHUTDOWN_GRACE_MS = 5_000;

export class HandshakeError extends Error {
  constructor(message, { phase, code = null } = {}) {
    super(message);
    this.name = 'HandshakeError';
    this.phase = phase;
    this.code = code;
  }
}

/**
 * `${VAR:-default}` as Claude Code expands it, with `CLAUDE_PROJECT_DIR` bound to the checkout.
 *
 * Every placeholder in `.mcp.json` carries a default — ARC-06-S01's test enforces that — so an
 * unset variable becomes the default rather than the literal characters `${SNOW_STORE}`, which is
 * what a naive expansion would hand the server as a path.
 *
 * `CLAUDE_PROJECT_DIR` is bound to `root` UNCONDITIONALLY, and that is the whole point of it being
 * special-cased here. Claude Code sets that variable to the project root of the session that spawns
 * the server; when WE spawn it, we are that session, so an inherited value is somebody else's
 * answer to our question. Reading it made the bootstrap start a server from whichever repository
 * the surrounding Claude Code session happened to be in — `Cannot find module`, exit 1 — and it was
 * invisible in a plain terminal and in CI, where the variable is unset. Found by running the tests
 * inside a session, which is exactly the context ARC-07-S09 and ARC-08 will live in.
 */
export function expand(value, env, root) {
  return String(value).replace(/\$\{([A-Z_][A-Z0-9_]*)(?::-([^}]*))?\}/g, (whole, name, fallback) => {
    if (name === 'CLAUDE_PROJECT_DIR') return root;
    const found = env[name];
    if (found !== undefined && found !== '') return found;
    return fallback ?? whole;
  });
}

/** The spawn `.mcp.json` describes, with the placeholders resolved. */
export function serverCommand({ mcp, serverKey, root, env = process.env }) {
  const entry = mcp?.mcpServers?.[serverKey];
  if (!entry) throw new HandshakeError(`.mcp.json has no "${serverKey}" server`, { phase: 'config' });
  return {
    command: entry.command,
    args: (entry.args ?? []).map((a) => expand(a, env, root)),
    env: {
      ...Object.fromEntries(Object.entries(entry.env ?? {})
        .map(([k, v]) => [k, expand(v, env, root)])),
      // Set, never inherited — the child resolves its own store path from this, so a stale value
      // from the surrounding session would point the server at another checkout's `.local/`.
      CLAUDE_PROJECT_DIR: root,
    },
  };
}

/** One JSON-RPC frame per line — the MCP stdio transport's framing. */
const frame = (obj) => `${JSON.stringify(obj)}\n`;

/**
 * Spawn, handshake, list, optionally call, and shut down cleanly.
 *
 * `timeoutMs` is `MCP_TIMEOUT` from the committed settings, so a cold start that would fail under
 * Claude Code fails HERE first, where there is a sentence to print instead of a silent absence in
 * the tool list.
 */
export async function handshake({ command, args, cwd, env = {}, timeoutMs = 120_000,
  protocolVersion, clientVersion = '0.0.0', live = false, capabilityTool = null,
  spawnFn = spawn, onStderr = null, retryOnEpipe = true }) {
  try {
    return await once({ command, args, cwd, env, timeoutMs, protocolVersion, clientVersion, live,
      capabilityTool, spawnFn, onStderr });
  } catch (e) {
    // ONE retry, and only for EPIPE at spawn: npm has just written `node_modules`, and a Windows
    // scanner can hold the first read long enough for the write side to close under us. A second
    // failure is a real failure — retrying a timeout would just double the wait.
    if (retryOnEpipe && e?.code === 'EPIPE' && e?.phase === 'spawn') {
      return once({ command, args, cwd, env, timeoutMs, protocolVersion, clientVersion, live,
        capabilityTool, spawnFn, onStderr });
    }
    throw e;
  }
}

function once({ command, args, cwd, env, timeoutMs, protocolVersion, clientVersion, live,
  capabilityTool, spawnFn, onStderr }) {
  return new Promise((resolve, reject) => {
    const child = spawnFn(command, args, {
      // `childEnv`, so the session variable is SET rather than inherited — the server resolves its
      // own store path from it.
      cwd, env: childEnv(cwd, env), stdio: ['pipe', 'pipe', 'pipe'],
    });

    let settled = false;
    // Set before stdin is closed. Without it the exit handler below fires during the SHUTDOWN we
    // asked for and reports "the server exited before the handshake finished" — about a handshake
    // that had just succeeded. Found by running it against the real server.
    let shuttingDown = false;
    const pending = new Map();          // id → { resolve, reject }
    let nextId = 1;
    let buffer = '';
    const stderr = [];
    const started = Date.now();
    let initializeMs = null;

    const timer = setTimeout(() => fail(new HandshakeError(
      `the server did not answer within ${timeoutMs} ms`, { phase: 'timeout' })), timeoutMs);
    timer.unref?.();

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    const fail = (e) => {
      // The child is ended before the promise settles, so a rejected handshake never leaves a
      // process behind — the caller has no handle to clean up with.
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
      finish(reject, e);
    };

    child.on('error', (e) => fail(new HandshakeError(
      `could not start ${command}: ${e.message}`, { phase: 'spawn', code: e.code })));
    child.stdin.on('error', (e) => {
      if (e?.code === 'EPIPE') fail(new HandshakeError('the server closed its input',
        { phase: 'spawn', code: 'EPIPE' }));
    });
    child.stderr.on('data', (c) => {
      const line = redact(String(c));
      stderr.push(line);
      onStderr?.(line);
    });
    child.on('exit', (code, signal) => {
      if (!settled && !shuttingDown) {
        fail(new HandshakeError(
          `the server exited (${signal ?? `code ${code}`}) before the handshake finished`
          + (stderr.length > 0 ? `: ${stderr.join('').trim().split('\n').slice(-3).join(' ')}` : ''),
          { phase: 'exit' }));
      }
    });

    child.stdout.on('data', (chunk) => {
      buffer += String(chunk);
      let cut = buffer.indexOf('\n');
      while (cut !== -1) {
        const line = buffer.slice(0, cut).trim();
        buffer = buffer.slice(cut + 1);
        if (line !== '') {
          let message;
          try { message = JSON.parse(line); } catch { message = null; }
          // A non-JSON line on stdout is not fatal: a dependency that logs there is a nuisance, not
          // a protocol violation, and the frames that matter still parse.
          if (message && message.id !== undefined && pending.has(message.id)) {
            const { resolve: ok, reject: no } = pending.get(message.id);
            pending.delete(message.id);
            if (message.error) no(new HandshakeError(`${message.error.message ?? 'error'}`,
              { phase: 'rpc', code: message.error.code }));
            else ok(message.result);
          }
        }
        cut = buffer.indexOf('\n');
      }
    });

    const call = (method, params) => new Promise((ok, no) => {
      const id = nextId; nextId += 1;
      pending.set(id, { resolve: ok, reject: no });
      child.stdin.write(frame({ jsonrpc: '2.0', id, method, params }));
    });
    const notify = (method, params) => child.stdin.write(frame({ jsonrpc: '2.0', method, params }));

    (async () => {
      const init = await call('initialize', {
        protocolVersion,
        capabilities: {},
        clientInfo: { name: CLIENT_NAME, version: clientVersion },
      });
      initializeMs = Date.now() - started;
      notify('notifications/initialized', {});

      const tools = [];
      let cursor;
      do {
        const page = await call('tools/list', cursor ? { cursor } : {});
        for (const t of page?.tools ?? []) tools.push(t.name);
        cursor = page?.nextCursor;
      } while (cursor);

      let capabilities = null;
      if (live && capabilityTool) {
        const out = await call('tools/call', { name: capabilityTool, arguments: {} });
        capabilities = parseToolResult(out);
      }

      // Close stdin and let it go. A server that does not exit gets SIGTERM after the grace period;
      // the promise does not settle until the child is actually gone, so nothing is left running.
      shuttingDown = true;
      child.stdin.end();
      const exited = await waitForExit(child, SHUTDOWN_GRACE_MS);

      finish(resolve, {
        serverInfo: init?.serverInfo ?? null,
        protocolVersion: init?.protocolVersion ?? null,
        tools,
        initializeMs,
        capabilities,
        stderr: stderr.join(''),
        exited,
      });
    })().catch((e) => fail(e instanceof HandshakeError ? e
      : new HandshakeError(e.message, { phase: 'rpc' })));
  });
}

/** MCP tool results carry their payload as content parts; JSON comes back as text. */
export function parseToolResult(result) {
  const text = (result?.content ?? [])
    .filter((c) => c?.type === 'text').map((c) => c.text).join('');
  if (text.trim() === '') return null;
  try { return JSON.parse(text); } catch { return { text }; }
}

function waitForExit(child, graceMs) {
  return new Promise((done) => {
    if (child.exitCode !== null || child.signalCode !== null) { done('already'); return; }
    const t = setTimeout(() => {
      try { child.kill('SIGTERM'); } catch { /* gone */ }
      done('sigterm');
    }, graceMs);
    t.unref?.();
    child.once('exit', () => { clearTimeout(t); done('clean'); });
  });
}
