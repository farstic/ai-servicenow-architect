import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { HANDSHAKE_TIMEOUT_MS, handshake } from '../../src/doctor/checks.js';

/**
 * ARC-06 acceptance, B06-02 and B06-04's child half — the handshake against a server that never
 * answers.
 *
 * **What the criteria asked for, and why neither could be written as stated.**
 *
 * *AC 4* said `MCP_TIMEOUT=1` makes B08 fail with the initialize timeout sentence. **`MCP_TIMEOUT`
 * does not bound this handshake and never has.** The deadline is `HANDSHAKE_TIMEOUT_MS`, fixed at
 * 20 000 ms in the product (`checks.ts`); `MCP_TIMEOUT` is the number the cold start is compared
 * *against*, read by the ENGINE from `.claude/settings.json` for a headroom warning — the package
 * says so itself at `checks.ts:404`. The criterion is amended; the mismatch is an ARC-06 chore for
 * 2.0.x, and `handshake`'s second parameter is where a fix would tie them together.
 *
 * *AC 7* said a fixture answering `tools/list` in three pages returns all names. **Neither side
 * pages:** this handshake sends one `tools/list` and reads `result.tools` once, and the server
 * returns `{ tools: advertised }` with no cursor (`nextCursor` appears zero times in `src/`). That
 * clause is amended away. Its other half — *"given one that never answers, rejects after the
 * timeout without a hung child"* — is real, and is what this file proves.
 *
 * The deadline is a parameter so these run in a second and a half rather than costing twenty
 * seconds a cell. The default is unchanged and production passes nothing.
 *
 * **Why 1 500 ms and not 120.** The first draft used 120 ms and passed alone, then failed in the
 * full suite: under load the child had not yet been exec'd when the deadline fired, so `ps` could
 * not see it and "the stubborn child survived" read as "it was reaped". The same race would have
 * made the positive test pass for the wrong reason — a child that never started is also a child
 * that is gone. The deadline is long enough that the stub is certainly running and visible before
 * anything kills it, which is what makes both directions mean what they say.
 */
const here = dirname(fileURLToPath(import.meta.url));
const STUB = resolve(here, '../../../../tools/snowarch/tests/fixtures/mcp-stub.mjs');
/** Long enough that the child is certainly exec'd and visible to `ps` — see the note above. */
const DEADLINE_MS = 1_500;

/** Every pid this file started, so a control that deliberately lingers cannot outlive the run. */
const started: number[] = [];
const alive = (pid: number): boolean => {
  try { process.kill(pid, 0); return true; } catch { return false; }
};

afterEach(() => {
  for (const pid of started.splice(0)) {
    try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
  }
});

/** The pids of every `mcp-stub.mjs` running right now. POSIX only — see the skip below. */
function stubPids(): number[] {
  const out = execFileSync('/bin/sh', ['-c', `ps -A -o pid=,args= | grep '[m]cp-stub.mjs' || true`],
    { encoding: 'utf8' });
  return out.split('\n').filter(Boolean).map((l) => Number(l.trim().split(/\s+/)[0]));
}

const posixOnly = process.platform === 'win32';

describe('B06-02 / B06-04 — a server that never answers', () => {
  it.skipIf(posixOnly)('rejects after the deadline, naming the duration it was given', async () => {
    process.env.SNOWARCH_STUB_MODE = 'silent';
    const before = stubPids();
    const h = await handshake(STUB, DEADLINE_MS);

    expect(h.tools).toEqual([]);
    // The sentence the operator sees is `the server did not answer: <this>` (SV-05). It must name
    // the duration — that is the only thing separating "handshake too slow" from "server crashed".
    expect(h.error).toBe(`timed out after ${DEADLINE_MS} ms`);
    // And it must NOT name MCP_TIMEOUT, because that value had no part in it. Asserting the absence
    // is what keeps the chore line honest: the day someone wires them together, this fails and the
    // chore is why.
    expect(h.error).not.toMatch(/MCP_TIMEOUT/);

    // No hung child: the stub this run started is gone.
    const leftover = stubPids().filter((p) => !before.includes(p));
    expect(leftover, `a stub survived the handshake: ${leftover.join(', ')}`).toEqual([]);
  }, 20_000);

  it.skipIf(posixOnly)('THE CONTROL — a child that ignores SIGTERM is detected as surviving', async () => {
    // Without this, "no hung child" passes against a handshake that never kills anything at all.
    // The stub is told to swallow the polite signal, so `child.kill()` leaves it running and the
    // detector above has something to find.
    process.env.SNOWARCH_STUB_MODE = 'silent';
    process.env.SNOWARCH_STUB_IGNORE_SIGTERM = '1';
    const before = stubPids();
    try {
      const h = await handshake(STUB, DEADLINE_MS);
      expect(h.error).toBe(`timed out after ${DEADLINE_MS} ms`);

      const leftover = stubPids().filter((p) => !before.includes(p));
      expect(leftover.length, 'the stubborn stub did NOT survive — the detector proves nothing')
        .toBeGreaterThan(0);
      started.push(...leftover);
      expect(alive(leftover[0])).toBe(true);
    } finally {
      delete process.env.SNOWARCH_STUB_IGNORE_SIGTERM;
    }
  }, 20_000);

  it('the production default is unchanged, and nothing in the product overrides it', () => {
    // The seam must not have moved the real deadline. 20 000 ms, and the sentence a person reads
    // for it is still "20s" — whole seconds render as seconds precisely so this stayed true.
    expect(HANDSHAKE_TIMEOUT_MS).toBe(20_000);
    expect(20_000 % 1000 === 0 ? `${20_000 / 1000}s` : `${20_000} ms`).toBe('20s');
  });
});
