// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C271 — what a user sees on a Node that deprecates more than the older ones do.
 *
 * Node 26 is in CI from this change (Linux and Windows). Its first run of the suite found Node's DEP0205 warning on stderr, from the test-only
 * licence hook, which was installed through `module.register()`. That proved the harness; this holds the PRODUCT. With no hook, no
 * `NODE_OPTIONS` and no `NODE_NO_WARNINGS` (which would hide what is being looked for), the engine entry and the launcher each answer a
 * command that needs no licence, and print NOTHING on stderr: no deprecation, no experimental-feature notice, no warning from a dependency.
 * It runs on every cell, so on the Node 26 cells it is the case that says a user on 26 sees a clean screen.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { useStateRoot } from './helpers/state-root.mjs';

// `status` renders the quick doctor in-process and writes its cache and log; they go to a state root of this run's own.
useStateRoot();

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/** The entries a user types: the engine's, and the launcher the platform's shell reads. */
const ENTRIES = [
  { name: 'the engine entry', argv0: process.execPath, lead: [join(root, 'tools/snowarch/bin/snowarch.mjs')] },
  ...(process.platform === 'win32'
    ? [{ name: 'snowarch.cmd', argv0: process.env.COMSPEC || 'cmd.exe', lead: ['/c', join(root, 'snowarch.cmd')] }]
    : [{ name: './snowarch', argv0: join(root, 'snowarch'), lead: [] }]),
];

/** This process's environment without anything that would load the test hook or hide a warning. */
function bareEnv() {
  const env = { ...process.env };
  for (const name of ['NODE_OPTIONS', 'NODE_NO_WARNINGS', 'NODE_PENDING_DEPRECATION', 'NODE_TEST_CONTEXT']) delete env[name];
  return env;
}

for (const entry of ENTRIES) {
  for (const [args, statuses] of [[['version'], [0]], [['status'], [0, 1]]]) {
    test(`ARC-09-C271 — ${entry.name} \`${args.join(' ')}\` on Node ${process.versions.node} prints nothing on stderr`, () => {
      // unlicensed start: version and status are the commands that run with no licence, and a clean screen is what a user on this Node sees first.
      const r = spawnSync(entry.argv0, [...entry.lead, ...args], { encoding: 'utf8', cwd: root, env: bareEnv(), timeout: 120_000 });
      assert.ok(statuses.includes(r.status), `exit ${r.status} (wanted ${statuses.join(' or ')}): ${r.stdout}${r.stderr}`);
      assert.equal(r.stderr, '', `stderr is not empty on Node ${process.versions.node}:\n${r.stderr}`);
      assert.ok(r.stdout.length > 0, 'the command printed nothing at all, so a clean stderr proves nothing');
    });
  }
}
