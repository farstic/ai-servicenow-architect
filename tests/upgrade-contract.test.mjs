// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C194 — WHAT AN OLDER RELEASE CALLS IN THE TREE IT HAS JUST CHECKED OUT.
 *
 * `upgrade` runs from the installed release, and after U5 its finish() starts the TARGET's own CLI for U6 and U7. So
 * the target answers calls an older release wrote, for as long as that release is installed: 2.2.1 is the first
 * end-user release, and its upgrade runs every user's first upgrade, to whatever is latest then. A target that moved
 * the CLI, renamed a flag, or put the bootstrap behind the licence would break those upgrades after the tree had moved.
 *
 * THE LIST ONLY GROWS. A call a released finish() makes stays answerable here; a new call is added when finish()
 * learns it, which the second case forces, because finish() may not call anything the list does not hold.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { COMMANDS, parseArgs } from '../tools/snowarch/lib/cli.mjs';
import { allowedCommand } from '../tools/snowarch/lib/licence/state.mjs';
import { buildPlan } from '../tools/snowarch/lib/plan.mjs';
import { finish } from '../tools/snowarch/lib/commands/upgrade.mjs';
import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The CLI every release's finish() starts, relative to the target tree. */
const BIN = 'tools/snowarch/bin/snowarch.mjs';

/** Every call a release's finish() makes into the target tree, 2.2.0's on. */
const CALLS = Object.freeze([
  ['bootstrap', '--mode', 'design', '--yes'],
  ['bootstrap', '--mode', 'live', '--yes'],
  ['bootstrap', '--mode', 'design', '--yes', '--skip-claude-check'],
  ['bootstrap', '--mode', 'live', '--yes', '--skip-claude-check'],
  ['doctor', '--json', '--no-cache', '--write-cache'],
]);

test('ARC-09-C194 — this tree answers every call an installed release\'s upgrade makes into it', () => {
  assert.ok(existsSync(join(root, BIN)), `${BIN} is gone: every installed release's U6 and U7 start it`);
  for (const call of CALLS) {
    const [name, ...args] = call;
    const command = COMMANDS[name];
    assert.ok(command, `"${name}" is no longer a command: ${call.join(' ')}`);
    // A bare flag the command does not declare reads the next argument as its value, or fails as "needs a value".
    const { errors } = parseArgs(args, { booleans: command.booleans ?? [] });
    assert.deepEqual(errors, [], `${call.join(' ')} no longer parses: ${errors.join('; ')}`);
    // A refused licence must not stop the move it is part of: the bootstrap and the doctor are how it is put right.
    assert.ok(allowedCommand(name, []), `${name} is refused without a licence, mid-upgrade`);
  }
  // --mode takes both values an older finish() passes.
  const ctx = { node: { present: true, version: '22.11.0' }, areaCount: 1 };
  assert.equal(buildPlan({ ctx, flags: { mode: 'design' } }).mode, 'design-only');
  assert.equal(buildPlan({ ctx, flags: { mode: 'live' } }).mode, 'live');
});

test('ARC-09-C194 — this release\'s finish() calls nothing in the target tree that the list does not hold', async (t) => {
  for (const [mode, skipClaudeCheck] of [['design', false], ['live', true]]) {
    const dir = tempDir('snowarch-contract-', t);
    const calls = [];
    const run = (cmd, args) => {
      if (cmd === process.execPath) calls.push(args);
      return args.includes('doctor')
        ? { status: 0, stdout: JSON.stringify({ mode, modeLine: 'Mode: design-only', summary: { ok: 1, warn: 0, fail: 0, skip: 0 }, checks: [] }) }
        : { status: 0 };
    };
    const log = { step: () => {}, fail: () => {}, warn: () => {}, ok: () => {} };
    await finish({ root: dir, env: {}, log, run, target: 'v9.1.0', latest: 'v9.1.0', remote: 'origin',
      now: () => new Date('2026-10-20T12:00:00.000Z'), state: { mode }, skipClaudeCheck });
    assert.ok(calls.length >= 2, `finish() started ${calls.length} process(es) in the target tree`);
    for (const args of calls) {
      assert.equal(args[0], join(dir, BIN), `finish() starts ${args[0]}, not the tree's ${BIN}`);
      const call = args.slice(1);
      assert.ok(CALLS.some((c) => c.length === call.length && c.every((a, i) => a === call[i])),
        `finish() calls "${call.join(' ')}", which the cross-release list does not hold — add it there`);
    }
  }
});
