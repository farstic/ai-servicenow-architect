/**
 * ARC-07-W17 — the doctor's remedies, RENDERED on a Windows shell.
 *
 * THE GAP THIS CLOSES, and it is a gap in a guard rather than in the product. The widened spelling
 * guard proves that no shipped file CONTAINS a launcher literal; it proves nothing about what a check
 * PRINTS. Reverting one remedy to `ctx.platform === 'win32' ? 'bootstrap.cmd' : './bootstrap.sh'`
 * would fail the guard and nothing else — and the guard is red by design until the sweep finishes, so
 * on those heads that control lands on an already-red test and says nothing. The architect caught it.
 *
 * `env: {}` IS LOAD-BEARING, for the reason `tests/windows-spellings.test.mjs` writes out at length:
 * `isWindowsShell` is `platform === 'win32' && !env.SHELL && !env.MSYSTEM`, and `env` defaults to
 * `process.env` — so a ctx of `{ platform: 'win32' }` alone renders the POSIX spellings on any machine
 * with SHELL set, and a case written that way asserts POSIX while believing it asked about Windows.
 *
 * AND THE FLOOR IS THE OTHER HALF: each family must produce at least one launcher-bearing remedy, or
 * the case would pass on a family that emitted nothing at all — absence read as correctness, which is
 * the defect this programme keeps finding in checks that cannot tell the two apart.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { engineRepoChecks } from '../../tools/snowarch/lib/doctor/checks/engine-repo.mjs';
import { engineDocsChecks } from '../../tools/snowarch/lib/doctor/checks/engine-docs.mjs';
import { hostChecks } from '../../tools/snowarch/lib/doctor/checks/host.mjs';
import { serverChecks } from '../../tools/snowarch/lib/doctor/checks/server.mjs';
import { legacyChecks } from '../../tools/snowarch/lib/doctor/checks/legacy.mjs';
import { engineContractChecks } from '../../tools/snowarch/lib/doctor/checks/engine-contract.mjs';
import { spellings } from '../../tools/snowarch/lib/text.mjs';

const WIN = { platform: 'win32', env: {} };
const WIN_CLI = spellings(WIN).cli;              // .\snowarch.cmd
const WIN_BOOTSTRAP = spellings(WIN).bootstrap;  // .\bootstrap.cmd

/** A checkout that answers almost nothing, so most checks reach their remedy branch. */
function bareRoot() {
  const root = mkdtempSync(join(tmpdir(), 'w17-win32-'));
  mkdirSync(join(root, '.local'), { recursive: true });
  writeFileSync(join(root, 'engine.config.json'), JSON.stringify({
    mcp: { serverKey: 'servicenow' }, docs: { pin: 'a'.repeat(40), family: 'australia' },
  }));
  return root;
}

/** Every remedy and command a family produced, as one list. */
async function remediesOf(checks, root) {
  const ctx = { ...WIN, root, config: JSON.parse('{"mcp":{"serverKey":"servicenow"}}') };
  const out = [];
  for (const check of checks) {
    let result;
    try { result = await check.run(ctx); } catch { continue; }
    for (const value of [result?.remedy, result?.command]) {
      if (typeof value === 'string' && value !== '') out.push(`${check.id}: ${value}`);
    }
  }
  return out;
}

/**
 * ONE ENTRY PER FIXED CHECK FAMILY — the architect's condition, and all six rather than the two I
 * started with. A family whose remedies were swept and whose rendering is unasserted is a family where
 * reverting one line fails only the spelling guard, and that guard is red by design until the sweep
 * finishes: the control would land on an already-red test and say nothing.
 */
for (const [name, checks] of [
  ['engine-repo', engineRepoChecks()],
  ['engine-docs', engineDocsChecks()],
  ['server', serverChecks()],
  ['engine-contract', engineContractChecks()],
  // `host` AND `legacy` ARE NOT HERE, and the FLOOR is what said so rather than my judgement: on a
  // bare root neither reaches a remedy branch — host's need a cached release check or a registration
  // state, legacy's need a legacy store — so both came back with no launcher-bearing remedy at all and
  // the floor refused to certify them. That is the assertion working: a family this loop cannot
  // exercise must not be listed as covered.
  //
  // THEY ARE COVERED, by their own files under the mirror rule: `host.test.mjs` and `legacy.test.mjs`
  // assert their remedies against `spellings()` with no fixture, so on the three Windows cells those
  // cases hold `.\snowarch.cmd` and on a mac they hold `./snowarch`. What is missing is win32 coverage
  // from a MAC, which is a fixture job and goes with the rest of the sweep.
]) {
  test(`ARC-07-W17 — ${name}'s remedies read the Windows spelling on a Windows shell`, async () => {
    const lines = await remediesOf(checks, bareRoot());

    // THE FLOOR: this family must actually have produced a launcher-bearing remedy.
    const bearing = lines.filter((l) => /snowarch|bootstrap/i.test(l));
    assert.ok(bearing.length > 0,
      `${name} produced no launcher-bearing remedy, so this case proved nothing:\n  ${lines.join('\n  ')}`);

    // ...and not one of them may carry a POSIX spelling on a Windows shell.
    for (const line of bearing) {
      assert.doesNotMatch(line, /\.\/snowarch\b/, `POSIX launcher on a win32 ctx: ${line}`);
      assert.doesNotMatch(line, /\.\/bootstrap\.sh\b/, `POSIX bootstrap on a win32 ctx: ${line}`);
      // A BARE name is the spelling PowerShell refuses — ARC-07-C1's whole finding.
      assert.doesNotMatch(line, /(?<!\.\\)\bsnowarch\.cmd\b/, `bare snowarch.cmd: ${line}`);
      assert.doesNotMatch(line, /(?<!\.\\)\bbootstrap\.cmd\b/, `bare bootstrap.cmd: ${line}`);
    }

    // ...and at least one says the Windows spelling out loud, so the assertions above are not vacuous.
    assert.ok(bearing.some((l) => l.includes(WIN_CLI) || l.includes(WIN_BOOTSTRAP)),
      `no remedy rendered ${WIN_CLI} or ${WIN_BOOTSTRAP}:\n  ${bearing.join('\n  ')}`);
  });
}

test('ARC-07-W17 — the same ctx on a POSIX shell renders the POSIX spellings', () => {
  // THE OTHER DIRECTION, so a renderer that hard-coded the WINDOWS spelling would not pass the cases
  // above by accident. Git Bash on Windows is included because it is the case the predicate exists for.
  assert.equal(spellings({ platform: 'darwin', env: {} }).cli, './snowarch');
  assert.equal(spellings({ platform: 'win32', env: { SHELL: '/bin/bash' } }).cli, './snowarch');
  assert.equal(spellings(WIN).cli, '.\\snowarch.cmd');
});
