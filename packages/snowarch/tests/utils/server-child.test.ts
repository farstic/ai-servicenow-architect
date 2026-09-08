import { describe, expect, it, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { removeTempDir, reapServerChildren, trackServerChild } from '../helpers/server-child.js';

/**
 * The teardown guard itself, tested against the failure it exists to prevent.
 *
 * The bug it replaces was an `ENOTEMPTY` from `rmSync` on a temp directory that a not-yet-dead
 * server child was still writing into — a red build reported against a test that had passed.
 * Reproducing it needs a child that ignores the polite signal and keeps writing, which no real
 * server does; the fixture below is that child.
 */
const bases: string[] = [];

/** A child that writes a new file every few ms and ignores SIGTERM. */
function stubborn(dir: string): { pid: number } {
  const src = `
    process.on('SIGTERM', () => {});
    let n = 0;
    setInterval(() => {
      require('node:fs').writeFileSync(require('node:path').join(${JSON.stringify(dir)}, 'w' + (n++)), 'x');
    }, 2);
  `;
  const child = spawn(process.execPath, ['-e', src], { stdio: 'ignore' });
  if (child.pid === undefined) throw new Error('the fixture child did not spawn');
  return { pid: child.pid };
}

afterEach(() => {
  for (const b of bases.splice(0)) rmSync(b, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

describe('reapServerChildren', () => {
  it('a child that keeps writing after SIGTERM is still gone, and its directory can be removed', async () => {
    const base = mkdtempSync(join(tmpdir(), 'snowarch-reap-'));
    bases.push(base);
    const { pid } = stubborn(base);
    // A transport is not needed to test the reap — only the pid it would have handed over.
    trackServerChild({ pid } as never);

    // Not vacuous: the child has to be alive and writing, or nothing below is being prevented.
    // Polled rather than slept for — a fixed wait for a node process to boot is a wall-clock
    // budget inside a parallel runner, which is the same class of bug this file is fixing. It
    // failed at 120 ms on the first full-suite run.
    const readyBy = Date.now() + 10_000;
    while (readdirSync(base).length === 0 && Date.now() < readyBy) {
      await new Promise((resolve) => { setTimeout(resolve, 20); });
    }
    expect(readdirSync(base).length, 'the fixture child never wrote anything').toBeGreaterThan(0);
    expect(() => process.kill(pid, 0), 'the fixture child died on its own').not.toThrow();

    await reapServerChildren();

    expect(() => process.kill(pid, 0), 'the child survived the reap').toThrow();
    removeTempDir(base);
    expect(existsSync(base)).toBe(false);
  }, 15_000);

  it('refuses a transport that reports no pid, rather than reaping nothing', () => {
    // The whole guard degrades to a no-op if the pid is ever null, and a silent no-op here
    // would return the ENOTEMPTY flake with the teardown still looking correct.
    expect(() => trackServerChild({ pid: null } as never)).toThrow(/no pid/);
  });

  it('reaping when nothing was tracked is not an error', async () => {
    await expect(reapServerChildren()).resolves.toBeUndefined();
  });
});
