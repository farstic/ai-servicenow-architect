#!/usr/bin/env node
// A minimal MCP stdio responder, for testing the handshake without the real server.
//
// Three behaviours, chosen by `SNOWARCH_STUB_MODE`, and each one exists because a real server can
// do it: PAGES answers `tools/list` in three pages (the pagination the protocol allows and most
// servers never exercise); SILENT accepts the connection and never answers (the cold-start-too-slow
// case); DIE closes stdin immediately (the EPIPE a just-written `node_modules` can produce).
import { createInterface } from 'node:readline';

const MODE = process.env.SNOWARCH_STUB_MODE ?? 'pages';
// A child that survives `child.kill()`'s SIGTERM — the CONTROL for "no hung child". Without a
// stub that can linger, an "is it gone" assertion passes against a handshake that never kills
// anything, and proves nothing. The test that sets this is responsible for SIGKILLing it.
if (process.env.SNOWARCH_STUB_IGNORE_SIGTERM === '1') process.on('SIGTERM', () => {});
const PAGE_SIZE = Number(process.env.SNOWARCH_STUB_PAGE_SIZE ?? 2);
const TOOLS = (process.env.SNOWARCH_STUB_TOOLS ?? 'a,b,c,d,e').split(',').filter(Boolean);

const send = (obj) => process.stdout.write(`${JSON.stringify(obj)}\n`);

createInterface({ input: process.stdin }).on('line', (line) => {
  if (line.trim() === '') return;
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.id === undefined) return;                       // a notification: nothing to answer
  if (MODE === 'silent') return;                          // accepted, never answered

  if (msg.method === 'initialize') {
    send({ jsonrpc: '2.0', id: msg.id, result: {
      protocolVersion: msg.params?.protocolVersion ?? 'test',
      capabilities: { tools: {} },
      serverInfo: { name: 'stub', version: '0.0.0' },
    } });
    return;
  }
  if (msg.method === 'tools/list') {
    const from = Number(msg.params?.cursor ?? 0);
    const page = TOOLS.slice(from, from + PAGE_SIZE);
    const next = from + PAGE_SIZE;
    send({ jsonrpc: '2.0', id: msg.id, result: {
      tools: page.map((name) => ({ name })),
      ...(next < TOOLS.length ? { nextCursor: String(next) } : {}),
    } });
    return;
  }
  if (msg.method === 'tools/call') {
    send({ jsonrpc: '2.0', id: msg.id, result: {
      content: [{ type: 'text', text: process.env.SNOWARCH_STUB_CAPABILITIES ?? '{}' }],
    } });
    return;
  }
  send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `no method ${msg.method}` } });
});

// Exit when stdin closes, the way a stdio server does.
process.stdin.on('end', () => process.exit(0));
