// ARC-08-S02 — E-00…E-04. Every probe is INJECTED: no test here spawns `claude`, `git` or `npm`.
//
// The machine running the tests is not the machine being diagnosed, and a test that shelled out
// would assert whatever this laptop happens to have installed — passing here and failing on a CI
// cell for a reason that says nothing about the check. So `exec` is a parameter, and the Windows
// branches are provable from a POSIX machine by naming the platform.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { capabilityPacks, DRAWIO_CANDIDATES, enginePrereqChecks,
  SOFFICE_CANDIDATES } from '../../tools/snowarch/lib/doctor/checks/engine-prereqs.mjs';
import { contextFor, greenTree, runById } from './helpers/tree.mjs';

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
