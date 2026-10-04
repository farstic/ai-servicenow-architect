/**
 * ARC-07-C38 — the SERVER's remedies, rendered for a Windows reader, mirroring the engine's case.
 *
 * WHY THIS FILE EXISTS. ARC-07-C31 slice 3 made the server's ten doctor remedies derive their launcher,
 * and had to record them as held by the source sweep and the three Windows cells ALONE — because
 * `CheckContext` carried five fields and no platform, so nothing could drive the other shell. The
 * server's own doctor tests confirmed the gap rather than hiding it: `doctor.test.ts` and
 * `handshake-timeout.test.ts` read `process.platform` and SKIP. C38 gave the contract a `platform` and an
 * `env`; this is the case that spends them.
 *
 * `env: {}` IS LOAD-BEARING. `windowsShell` is `platform === 'win32' && !env.SHELL && !env.MSYSTEM`, so a
 * ctx carrying only a platform renders POSIX on any machine whose SHELL is set — the fixture trap that
 * cost this programme three sittings, written out here because the next reader will otherwise write
 * `{ platform: 'win32' }` and watch it pass for the wrong reason.
 *
 * AND THE FLOOR, copied from the engine's case deliberately: a check family that produced NO
 * launcher-bearing remedy must not be certified by this loop. Without it, a check whose remedy branch
 * this fixture never reaches would pass by emitting nothing, and reverting that remedy to a bare
 * `cliSpelling()` would fail no test at all. The engine's version of this floor is what refused to
 * certify `host` and `legacy`, and it was right to.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ALL_CHECKS } from '../../src/doctor/checks.js';
import { cliSpelling } from '../../src/cli/tty.js';
import { stubProbesFor } from '../../src/doctor/types.js';
import type { CheckContext, CheckResult } from '../../src/doctor/types.js';
import { trackTempDir } from '../helpers/server-child.js';

const WIN = { platform: 'win32' as NodeJS.Platform, env: {} };
const POSIX = { platform: 'linux' as NodeJS.Platform, env: {} };

const WIN_CLI = cliSpelling(WIN.platform, WIN.env); // .\snowarch.cmd
const POSIX_CLI = cliSpelling(POSIX.platform, POSIX.env); // ./snowarch

const ctxFor = (shell: { platform: NodeJS.Platform; env: NodeJS.ProcessEnv }): CheckContext => ({
  noNetwork: true,
  cwd: process.cwd(),
  platform: shell.platform,
  env: shell.env,
  probes: stubProbesFor(shell),
  fluent: () => ({ installed: false }),
});

/**
 * Every launcher-bearing string a run produced: the remedy and the command, never the detail.
 *
 * THE FILTER IS A LAUNCHER, NOT THE WORD `snowarch`, and measuring is how I know: `/snowarch/` matched
 * SV-01's `run npm run build in packages/snowarch` — a PACKAGE PATH with no launcher in it — and the loop
 * then demanded a Windows spelling of a line that should never carry one. A filter that catches the
 * product's own name catches every mention of the product.
 */
const LAUNCHER = /\.\/snowarch\b|\.\\snowarch\.cmd/;
const launcherStrings = (results: readonly CheckResult[]): string[] => {
  const out: string[] = [];
  for (const r of results) {
    for (const value of [r.remedy, r.command]) {
      if (typeof value === 'string' && LAUNCHER.test(value)) out.push(`${r.id}: ${value}`);
    }
  }
  return out;
};

const runAll = async (shell: { platform: NodeJS.Platform; env: NodeJS.ProcessEnv }) => {
  const ctx = ctxFor(shell);
  const results: CheckResult[] = [];
  for (const check of ALL_CHECKS) {
    // NO `catch { continue }` — ARC-07-C31 recorded that swallowing a throwing check is how a family
    // vanishes from a case that claims to cover it. A throw here fails this test, loudly.
    results.push(await check.run(ctx));
  }
  return results;
};

/**
 * THE FIXTURE HAS TO REACH A REMEDY BRANCH, and the FLOOR is what told me it did not.
 *
 * A bare run produced ZERO launcher-bearing remedies: with no store on disk, `svStore`, `svInstances` and
 * `svStoreSchema` all return before the branch that names a command. Every assertion in the loop would
 * have passed over an empty list, and reverting a remedy to a bare `cliSpelling()` would have failed
 * nothing — which is the engine's floor lesson arriving on the server side unchanged.
 *
 * So two scenarios, and MEASURED rather than guessed — my first pair was wrong twice over. A store that
 * is not JSON reaches nothing: SV-02 owns "the file is broken" and SV-09 deliberately skips rather than
 * report it twice. A prod instance without its acknowledgement reaches nothing either, because the entry
 * has to LOAD first and that needs credentials. What does reach a branch is SV-09's own pair: a store
 * from the FUTURE (`STORE_SCHEMA_NEWER` → `upgrade`) and one from the PAST (`STORE_SCHEMA_OUTDATED` →
 * `store migrate`).
 *
 * That is two of the eight remedies this row threaded, and the row says so rather than implying the loop
 * covers all of them. The other six need a loaded instance or a legacy store, which is the same limit the
 * engine's case records for its `host` and `legacy` families.
 */
const SCENARIOS: ReadonlyArray<readonly [string, string]> = [
  ['a store from the future', JSON.stringify({ version: 9999, instances: {} })],
  ['a store from the past', JSON.stringify({ version: 0, instances: {} })],
];

const launchersAcrossScenarios = async (
  shell: { platform: NodeJS.Platform; env: NodeJS.ProcessEnv },
): Promise<string[]> => {
  const out: string[] = [];
  for (const [name, body] of SCENARIOS) {
    const dir = trackTempDir(mkdtempSync(join(tmpdir(), 'c38-')));
    const previous = process.env.SNOW_STORE;
    try {
      const store = join(dir, 'instances.json');
      writeFileSync(store, body);
      process.env.SNOW_STORE = store;
      for (const line of launcherStrings(await runAll(shell))) out.push(`${name} → ${line}`);
    } finally {
      if (previous === undefined) delete process.env.SNOW_STORE;
      else process.env.SNOW_STORE = previous;
      rmSync(dir, { recursive: true, force: true });
    }
  }
  return out;
};

describe('ARC-07-C38 — the server doctor spells the launcher for the ctx it was given', () => {
  it('renders the Windows spelling under a win32 ctx, and no POSIX launcher survives', async () => {
    const said = await launchersAcrossScenarios(WIN);

    // THE FLOOR. A run that produced no launcher-bearing remedy would pass every assertion below by
    // emitting nothing, and the revert-one-remedy control would then land on a test that cannot fail.
    expect(said.length,
      'no check produced a launcher-bearing remedy — this case would certify nothing')
      .toBeGreaterThanOrEqual(2);

    for (const line of said) {
      expect(line, `a POSIX launcher on a Windows shell: ${line}`).not.toContain(POSIX_CLI);
      expect(line, `not the Windows spelling: ${line}`).toContain(WIN_CLI);
    }
  });

  it('...and the same ctx on a POSIX shell renders the POSIX spelling', async () => {
    // The other direction, so a remedy that hard-coded `.\snowarch.cmd` could not pass the first half.
    const said = await launchersAcrossScenarios(POSIX);
    expect(said.length).toBeGreaterThanOrEqual(2);
    for (const line of said) {
      expect(line, `a Windows launcher on a POSIX shell: ${line}`).not.toContain('snowarch.cmd');
      expect(line).toContain(POSIX_CLI);
    }
  });

  it('a win32 ctx with a SHELL set is Git Bash, and keeps the POSIX spelling', async () => {
    // The condition `windowsShell` actually tests, driven: Git Bash on Windows runs `./snowarch`
    // perfectly well, so telling that reader to type `.\snowarch.cmd` would be telling them to type
    // something their shell rejects. A case that only drove `{ platform: 'win32', env: {} }` would
    // never notice this arm being dropped.
    const said = await launchersAcrossScenarios({ platform: 'win32', env: { SHELL: '/usr/bin/bash' } });
    expect(said.length).toBeGreaterThanOrEqual(2);
    for (const line of said) expect(line).not.toContain('snowarch.cmd');
  });

  it('the ACL note follows the ctx, not the process — C38 second item', async () => {
    // `checks.ts` read `process.platform` at MODULE LOAD for this note, so it was fixed at import and
    // undrivable. It reads the ctx now, which this asserts in both directions.
    //
    // THE BRANCH NEEDS A STORE TO EXIST, and measuring is how I know: without one the check returns
    // before reaching the mode question, so both directions came back with no note and the case passed
    // its negative half while proving nothing about its positive one.
    const dir = trackTempDir(mkdtempSync(join(tmpdir(), 'c38-acl-')));
    const previous = process.env.SNOW_STORE;
    try {
      const store = join(dir, 'instances.json');
      writeFileSync(store, JSON.stringify({ version: 1, instances: {} }));
      process.env.SNOW_STORE = store;
      const win = (await runAll(WIN)).map((r) => r.detail).join('\n');
      expect(win, 'the ACL note did not follow a win32 ctx').toContain('ACL-inherited');
      const posix = (await runAll(POSIX)).map((r) => r.detail).join('\n');
      expect(posix, 'the ACL note appeared on a POSIX ctx').not.toContain('ACL-inherited');
    } finally {
      if (previous === undefined) delete process.env.SNOW_STORE;
      else process.env.SNOW_STORE = previous;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
