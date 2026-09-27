// ARC-08-S02 — E-00…E-04. Every probe is INJECTED: no test here spawns `claude`, `git` or `npm`.
//
// The machine running the tests is not the machine being diagnosed, and a test that shelled out
// would assert whatever this laptop happens to have installed — passing here and failing on a CI
// cell for a reason that says nothing about the check. So `exec` is a parameter, and the Windows
// branches are provable from a POSIX machine by naming the platform.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeExec } from '../../tools/snowarch/lib/steps/B00.mjs';
import { StateError } from '../../tools/snowarch/lib/state.mjs';
import { capabilityPacks, DRAWIO_CANDIDATES, enginePrereqChecks, recordedMode,
  SOFFICE_CANDIDATES } from '../../tools/snowarch/lib/doctor/checks/engine-prereqs.mjs';
import { contextFor, greenTree, runById } from './helpers/tree.mjs';
import { spellings } from '../../tools/snowarch/lib/text.mjs';

/** ARC-07-C37 — any valid spelling: this case is about the THROW, not the rendering. */
const SPELL = spellings();

const checks = enginePrereqChecks();

/** An `exec` that answers from a table, and records what it was asked. */
const execFrom = (table, asked = []) => Object.assign((name, args) => {
  asked.push([name, ...args].join(' '));
  const answer = table[[name, ...args].join(' ')] ?? table[name];
  if (answer === undefined) return { found: false, ok: false, stdout: '', stderr: '' };
  return { found: true, ok: answer.ok !== false, stdout: answer.stdout ?? '', stderr: answer.stderr ?? '' };
}, { asked });

const ctx = (root, over = {}) => contextFor(root, over);

test('E-00 reports the version and the login when Claude Code answers both', async (t) => {
  const root = greenTree(t);
  const exec = execFrom({
    'claude --version': { stdout: '2.9.0 (Claude Code)' },
    'claude --help': { stdout: 'Commands:\n  auth   manage authentication' },
    'claude auth status': { stdout: 'Logged in' },
  });
  const r = await runById(checks, 'E-00', ctx(root, { exec }));
  assert.equal(r.status, 'ok');
  assert.match(r.detail, /login: ok/);
});

test('E-00 fails a Claude Code below the configured floor, quoting the floor', async (t) => {
  const root = greenTree(t);
  const exec = execFrom({ 'claude --version': { stdout: '1.0.0' } });
  const r = await runById(checks, 'E-00', ctx(root, { exec }));
  assert.equal(r.status, 'fail');
  const floor = ctx(root).config.floors.claudeCode;
  assert.match(r.detail, new RegExp(floor.replace(/\./g, '\\.')));
});

test('E-00 says "not verified" rather than guessing when the CLI has no auth sub-command', async (t) => {
  const root = greenTree(t);
  const exec = execFrom({
    'claude --version': { stdout: '2.9.0' },
    'claude --help': { stdout: 'Commands:\n  mcp' },
  });
  const r = await runById(checks, 'E-00', ctx(root, { exec }));
  assert.equal(r.status, 'ok');
  assert.match(r.detail, /login: not verified/);
  assert.equal(exec.asked.includes('claude auth status'), false, 'it probed a sub-command it was told is absent');
});

test('E-01 fails a git below the floor and never reports the floor as a literal', async (t) => {
  const root = greenTree(t);
  const exec = execFrom({ 'git --version': { stdout: 'git version 2.20.1' } });
  const r = await runById(checks, 'E-01', ctx(root, { exec }));
  assert.equal(r.status, 'fail');
  assert.match(r.detail, new RegExp(ctx(root).config.floors.git.replace(/\./g, '\\.')));
});

test('E-01 is in --quick: git is the one child a quick check may spawn', () => {
  const git = checks.find((c) => c.id === 'E-01');
  assert.equal(git.quick, true);
  assert.equal(git.spawns, false);
});

test('E-02 is the floor check, not a presence check', async (t) => {
  const root = greenTree(t);
  const okResult = await runById(checks, 'E-02', ctx(root, { nodeVersion: '22.11.0' }));
  assert.equal(okResult.status, 'ok');
  assert.match(okResult.detail, /floor 20\.0\.0/);
  const low = await runById(checks, 'E-02', ctx(root, { nodeVersion: '18.20.0' }));
  assert.equal(low.status, 'fail');
  assert.match(low.detail, /below the floor/);
});

// The two consequences of one fact.
test('E-03 warns in design-only and fails in live when npm is absent', async (t) => {
  const root = greenTree(t);
  const exec = execFrom({});
  const design = await runById(checks, 'E-03', ctx(root, { exec, mode: 'design' }));
  assert.equal(design.status, 'warn');
  assert.match(design.detail, /needed only for live mode/);
  const live = await runById(checks, 'E-03', ctx(root, { exec, mode: 'live' }));
  assert.equal(live.status, 'fail');
});

/**
 * ARC-07-C37 — THE RETHROW, HELD IN BOTH DIRECTIONS, and this case exists because a control was inert.
 *
 * `recordedMode` wraps its state read in a `catch` so that an unreadable `bootstrap-state.json` is
 * E-11's finding and not reported twice. That also swallowed a `TypeError` from a programming error:
 * when `loadState`'s spelling became required, this call site passed one argument, the `catch` turned
 * the missing one into `null`, and the only symptom was E-03 reporting `warn` where the recorded mode
 * said `fail` — two files away from the defect.
 *
 * ARC-07-C31 added `if (e instanceof TypeError) throw e;` and I claimed a control proved it. IT DID
 * NOT. That control's degradation changed TWO things at once — it removed the rethrow AND dropped the
 * argument — so the red it produced was the dropped argument's. Decomposed on 2026-09-27: removing
 * ONLY the rethrow is INERT across the whole root and engine suite (1266 + 419 cases), and dropping
 * ONLY the argument fails E-03. A compound degradation proves that at least one of its edits matters,
 * and says nothing about which — which is a way for a control to look valid while testing nothing.
 *
 * BOTH HALVES, so the rethrow cannot be widened into swallowing nothing: a `TypeError` propagates, and
 * a read error is still tolerated. The second half is what keeps E-11 the owner of the sentence.
 *
 * ARC-07-C37 DELIVERED changes two things here. The rule moved into `loadStateOrReason`, so the
 * tolerated failure is now precisely the one `loadState` RAISES — a `StateError` — and everything else
 * propagates, which is C31's rethrow generalised rather than repeated at seven sites. And the return is
 * a PAIR, because swallowing was only half the defect: E-03 turns a missing npm into a `warn` in
 * design-only and a `fail` in live, so a mode it could not read is a mode it must not assume.
 *
 * THE OLD FIXTURE FOR THE SECOND HALF WAS UNFAITHFUL, and finding that out is what produced the
 * `loadState` change in this PR: it planted a bare `Error('EACCES: …')`, which `loadState` never
 * throws. Measured — `chmod 000` on a valid state file comes back as a `StateError`, because the read
 * and the parse were inside one `try`, and the sentence said the file `is not valid JSON` when it was
 * intact and merely unreadable. So the fixture here plants what the product actually raises, and the
 * read/parse split gives the unreadable case its own sentence.
 */
test('ARC-07-C37 — recordedMode rethrows a TypeError and still tolerates a StateError', () => {
  const programmingError = () => { throw new TypeError('loadState needs a spellings object — …'); };
  assert.throws(() => recordedMode('/nonexistent', SPELL, { load: programmingError }),
    { name: 'TypeError', message: /needs a spellings object/ },
    'a TypeError was swallowed — a finding about this code became a silent null');

  // ...and the half that must NOT change: an unreadable state file is E-11's to report. It is
  // TOLERATED — no throw — and the reason comes back so a caller in another section can say something
  // instead of inventing a default. A `StateError`, because that is what `loadState` raises for every
  // file-level failure: measured on `chmod 000` (EACCES) and on a directory in its place (EISDIR).
  const unreadable = () => {
    throw new StateError('.local/bootstrap-state.json could not be read (EACCES: permission denied)');
  };
  const read = recordedMode('/nonexistent', SPELL, { load: unreadable });
  assert.equal(read.mode, null, 'a read error now propagates — E-11 owns that sentence, not E-03');
  assert.match(read.reason, /could not be read \(EACCES/,
    'the reason was discarded — a caller outside E-11\'s section then has nothing to say');

  // A third: a state file with no mode is not an error at all, so there is no reason to report.
  assert.deepEqual(recordedMode('/nonexistent', SPELL, { load: () => ({ steps: {} }) }),
    { mode: null, reason: null });
});

test('E-03 reads the mode from the recorded state when the caller does not name one', async (t) => {
  const root = greenTree(t, { mode: 'live' });
  const r = await runById(checks, 'E-03', ctx(root, { exec: execFrom({}) }));
  assert.equal(r.status, 'fail', 'the live tree\'s recorded mode was not read');
  assert.equal(r.data.mode, 'live');
});

test('E-04 is info: it can never warn or fail, whatever is missing', async (t) => {
  const root = greenTree(t);
  assert.equal(checks.find((c) => c.id === 'E-04').severity, 'info');
  const r = await runById(checks, 'E-04',
    ctx(root, { env: { PATH: '' }, platform: 'linux', exists: () => false }));
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.data.missing, ['docx', 'pdf', 'drawio', 'mermaid']);
  assert.match(r.detail, /drawio no/);
});

test('E-04 finds draw.io at the paths the renderer itself looks in', () => {
  const seen = [];
  const packs = capabilityPacks({
    env: { PATH: '' },
    platform: 'darwin',
    exists: (p) => { seen.push(p); return p === DRAWIO_CANDIDATES.posix[1]; },
  });
  assert.equal(packs.drawio.how, DRAWIO_CANDIDATES.posix[1]);
  for (const candidate of DRAWIO_CANDIDATES.posix.slice(0, 2)) assert.ok(seen.includes(candidate));
  assert.ok(seen.includes(SOFFICE_CANDIDATES[0]));
});

test('E-04 looks for the Windows tooling when the platform is Windows', () => {
  const packs = capabilityPacks({ env: { PATH: '' }, platform: 'win32', exists: () => false });
  assert.match(packs.docx.need, /PowerShell/);
  assert.match(packs.pdf.need, /Word/);
});

test('E-00, E-03 and E-04 declare that they spawn, so --quick never runs them', () => {
  for (const id of ['E-00', 'E-03', 'E-04']) {
    assert.equal(checks.find((c) => c.id === id).spawns, true, `${id} does not declare its spawn`);
  }
});

/**
 * ARC-08-S11 — the Windows batch-file spawn, found by the first CI run of E-03 on Windows.
 *
 * Node closed CVE-2024-27980 by refusing to exec a `.cmd` or `.bat` without a shell, and the
 * refusal arrives as EINVAL from `spawnSync`. `npm` on Windows IS `npm.CMD`, so E-03 reported "npm
 * found but did not answer --version" on every Windows machine, and had since the check was
 * written — nothing ran it there until the doctor joined the bootstrap cells.
 *
 * Asserted on the OPTIONS rather than by spawning: a real `.cmd` cannot be run on the POSIX
 * machines where this suite mostly runs, and the property under test is which options `makeExec`
 * chooses, which is knowable everywhere.
 */
test('makeExec spawns a Windows .cmd through a shell, and everything else directly', () => {
  const seen = [];
  const spy = (bin, args, options) => { seen.push({ bin, options }); return ''; };

  const win = makeExec({ plat: 'win32', env: {}, resolve: () => 'C:\\x\\npm.CMD', exec: spy });
  win('npm', ['--version']);
  assert.equal(seen.at(-1).options.shell, true, 'a .cmd spawned without a shell is EINVAL on Windows');

  const winExe = makeExec({ plat: 'win32', env: {}, resolve: () => 'C:\\x\\git.exe', exec: spy });
  winExe('git', ['--version']);
  assert.equal(seen.at(-1).options.shell, undefined, 'an .exe does not need the shell, and its quoting rules');

  const posix = makeExec({ plat: 'linux', env: {}, resolve: () => '/usr/bin/npm', exec: spy });
  posix('npm', ['--version']);
  assert.equal(seen.at(-1).options.shell, undefined, 'nothing on POSIX is a batch file');
});
