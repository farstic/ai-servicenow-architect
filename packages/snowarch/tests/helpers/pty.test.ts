import { describe, expect, it } from 'vitest';
import { platform } from 'node:process';

import { ptyAvailable, runInPty } from './pty.js';

/**
 * ARC-07-C8 — the driver itself, not just the wizard it happens to be exercised through.
 *
 * `instance-wizard.e2e.test.ts` only runs behind `RUN_LIVE_E2E=1` and a real instance, so nothing
 * in CI proved `runInPty` worked on its own until this file: a small echo child that prompts, waits
 * for an answer and echoes it back is the same prompt→answer→transcript shape case 1 depends on,
 * without needing a PDI to get there. It runs on both POSIX platforms in the normal `npm test`
 * matrix (`ptyAvailable()` is `false` on Windows, same as the live suite).
 */
describe.skipIf(!ptyAvailable())('runInPty — the python3 driver', () => {
  it('drives a prompt, sends the answer once it appears, and returns the whole transcript', async () => {
    const child = [
      'python3', '-c',
      'import os, sys\n'
      + "print('Name? ', end='', flush=True)\n"
      + 'name = sys.stdin.readline().strip()\n'
      + "print(f'Hello, {name}! tty={os.isatty(0)}')\n",
    ];
    const run = await runInPty(child, {
      script: [{ waitFor: /Name\? $/, send: 'Ada\n' }],
      timeoutMs: 15_000,
    });

    expect(run.code, run.output).toBe(0);
    // The prompt was there to be waited for, and the answer was echoed back — a blind write that
    // ignored the prompt would produce the same greeting, so the prompt itself is asserted too.
    expect(run.output).toContain('Name? ');
    expect(run.output).toContain('Hello, Ada!');
    // The whole point of forkpty over a pipe: the child's stdin is a REAL tty, not a socket or a
    // /dev/null. A driver that silently fell back to a plain pipe would still pass every assertion
    // above and only this one would catch it.
    expect(run.output).toContain('tty=True');
    expect(typeof run.pid).toBe('number');
  }, 20_000);

  it('reports the exit code of a child that fails, with no answer to send', async () => {
    const run = await runInPty(['python3', '-c', 'import sys; sys.exit(7)'], { timeoutMs: 15_000 });
    expect(run.code).toBe(7);
  }, 20_000);

  it('never calls tcgetattr on this process\'s own stdio, so a socket/pipe stdin is fine', async () => {
    // The regression this whole row exists for: Node's default child stdio is a socketpair on
    // darwin. `script(1)` called `tcgetattr` on it and failed with "Operation not supported on
    // socket"; this driver must not reproduce that failure mode under the same stdio shape, which
    // is exactly what `runInPty` gives it (default `spawn` stdio, no tty of its own).
    const run = await runInPty(['python3', '-c', "print('ok')"], { timeoutMs: 15_000 });
    expect(run.output).not.toMatch(/tcgetattr|Operation not supported on socket/);
    expect(run.output).toContain('ok');
    expect(run.code).toBe(0);
  }, 20_000);
});

describe('ptyAvailable', () => {
  it('is false only on win32', () => {
    expect(ptyAvailable()).toBe(platform !== 'win32');
  });
});
