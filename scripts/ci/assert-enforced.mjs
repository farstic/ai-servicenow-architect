#!/usr/bin/env node
// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-11-C6 — CI proves enforcement, not only the licensed path.
 *
 * On the real build, with the keys it ships and no hook, before any fixture licence exists:
 *   1. `docs verify` is refused: exit 3, naming the state, with the remedy;
 *   2. one server tool over stdio is refused with LICENCE_NOT_VALID, and writes exactly one audit line, naming
 *      the tool, the gate `licence` and the state.
 * ARC-11-C6 step 5 adds the doctor: E-31 FAIL, and the server checks that call a tool reporting skip.
 *
 * Every child runs with NODE_OPTIONS removed, a HOME and a project of its own, so nothing on the runner can
 * hand it a licence. A checkout that holds one is refused: this asserts the unlicensed product, and a run
 * that found a licence would be asserting something else.
 *
 * Usage: node scripts/ci/assert-enforced.mjs
 * Exit 0 every assertion held · 1 one did not · 2 this checkout holds a licence.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const CLI = join(ROOT, 'tools', 'snowarch', 'bin', 'snowarch.mjs');
const SERVER = join(ROOT, 'packages', 'snowarch', 'dist', 'server.js');
const say = (text) => writeSync(1, `${text}\n`);
const failures = [];
const check = (ok, what) => { say(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failures.push(what); };

if (existsSync(join(ROOT, '.local', 'licence.json'))) {
  writeSync(2, 'assert-enforced: this checkout holds .local/licence.json — run this where no licence is installed\n');
  process.exit(2);
}

const base = mkdtempSync(join(tmpdir(), 'snowarch-assert-enforced-'));
/** The runner's environment, with nothing that could carry a licence or a hook. */
const bare = (extra) => {
  const env = { ...process.env };
  for (const k of ['NODE_OPTIONS', 'SNOWARCH_STATE_ROOT', 'CLAUDE_PROJECT_DIR', 'SNOW_STORE', 'SNOW_AUDIT_FILE',
    'SNOW_ENV_FILE']) delete env[k];
  return { ...env, HOME: base, USERPROFILE: base, APPDATA: base, ...extra };
};

try {
  // 1. The CLI: `docs verify` is outside the allowed set.
  const state = join(base, 'state');
  // unlicensed start: this script asserts the unlicensed product, on the keys the build ships
  const docs = spawnSync(process.execPath, [CLI, 'docs', 'verify'], { cwd: ROOT, encoding: 'utf8', env: bare({ SNOWARCH_STATE_ROOT: state }) });
  check(docs.status === 3, `docs verify exits 3 (it exited ${docs.status})`);
  check(/licence missing — this command does not run without a valid licence/.test(docs.stderr), 'docs verify names the state');
  check(/licence check to see why/.test(docs.stderr), 'docs verify gives the remedy');

  // 2. The server: one tool over stdio, refused, and its one audit line.
  const project = join(base, 'project');
  const client = new Client({ name: 'assert-enforced', version: '0' }, { capabilities: {} });
  // unlicensed start: this script asserts the unlicensed product, on the keys the build ships
  const transport = new StdioClientTransport({ command: process.execPath, args: [SERVER], cwd: base, stderr: 'ignore',
    env: bare({ CLAUDE_PROJECT_DIR: project, SNOW_LOG_LEVEL: 'error' }) });
  try {
    await client.connect(transport);
    const r = await client.callTool({ name: 'snow_core_capabilities_read', arguments: {} });
    const text = (r.content ?? []).map((c) => c.text ?? '').join('\n');
    check(r.isError === true, 'the tool call is refused');
    check(/\(Code: LICENCE_NOT_VALID\)/.test(text), 'the refusal carries LICENCE_NOT_VALID');
  } finally {
    await client.close();
  }
  const audit = join(project, '.local', 'audit.jsonl');
  const lines = existsSync(audit) ? readFileSync(audit, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  check(lines.length === 1, `one audit line (found ${lines.length})`);
  const l = lines[0] ?? {};
  check(l.tool === 'snow_core_capabilities_read' && l.gate === 'licence' && l.result === 'LICENCE_NOT_VALID'
    && l.licence === 'missing' && l.state === 'missing', 'the audit line names the tool, the gate, the licence and the state');
} finally {
  rmSync(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

say(failures.length ? `assert-enforced: ${failures.length} assertion(s) failed` : 'assert-enforced: the unlicensed build refuses');
process.exitCode = failures.length ? 1 : 0;
