/**
 * ARC-06-C6 / ARC-06-C5 — the wizard probe: the right SHAPE first, then the right CLASS.
 *
 * The defect these close is not that the probe was wrong about a build. It is that the probe was
 * handed the runner's ASYNCHRONOUS `spawn` (ARC-06-S03) and read it as if `spawnSync` had returned:
 * `${r.stdout}` on a live `ChildProcess` is the string `"[object Object]"`, so /\badd\b/ was false
 * before the child had run. `mode live` therefore could not reach the wizard on ANY machine, and
 * only a person at a TTY could find it, because every machine path enters B06 through
 * `--instance-file`. ARC-09-S07 had already fixed exactly this confusion at B06's two other spawn
 * sites by awaiting the child; the probe was the third site and was missed.
 *
 * So the first test here drives the probe through the runner's REAL `spawn` — the production shape,
 * not a synchronous double. Every test that caught nothing last time used a double.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn as nodeSpawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

import { tempDir } from './helpers/temp.mjs';

import { WIZARD, awaitProbe, firstLine, probeWizard, wizardProbeFailure, WIZARD_ABSENT }
  from '../lib/steps/B06.mjs';

const CLI = join('packages', 'snowarch', 'dist', 'cli', 'index.js');

/**
 * A checkout whose "CLI" is a script we control, so the probe's five answers are reachable.
 *
 * Through `tempDir`, never a bare `mkdtempSync`: the helper tracks the directory and removes it
 * after the test that made it. The first version of this file called `mkdtempSync` directly and
 * left six directories in TMPDIR — every recorded run before it left none.
 */
function fixture(body, t) {
  const root = tempDir('snowarch-probe-', t);
  const cli = join(root, CLI);
  mkdirSync(dirname(cli), { recursive: true });
  writeFileSync(cli, body);
  return root;
}

/** EXACTLY what the runner hands a step (`lib/steps/index.mjs`): async spawn, ChildProcess back. */
const runnerSpawn = (cmd, args, opts) => nodeSpawn(cmd, args, opts);

test('ARC-06-C6 — the probe answers OK through the RUNNER\'s real spawn, not only through spawnSync', async (t) => {
  const root = fixture('console.log("usage: instance\\n  add <label>   add an instance");\n', t);

  const viaRunner = await probeWizard(root, { run: runnerSpawn });
  assert.equal(viaRunner.klass, WIZARD.OK,
    'the probe failed through the runner\'s asynchronous spawn — this is the ARC-06-C6 defect');

  // Both shapes, same answer. The sync one is what a hand-run gets, and is why the defect read as
  // intermittent: by hand the probe fell back to its `run = spawnSync` default and said true.
  const viaSync = await probeWizard(root, { run: spawnSync });
  assert.equal(viaSync.klass, WIZARD.OK);
});

test('ARC-06-C6 control — a live ChildProcess is never stringified into the match', async (t) => {
  // The regression, named: interpolating the ChildProcess is what produced "[object Object]".
  // If someone reinstates the old one-liner, `klass` goes back to ABSENT and this fails.
  const root = fixture('console.log("usage: instance\\n  add <label>");\n', t);
  const child = runnerSpawn(process.execPath, [join(root, CLI)], { stdio: 'pipe', encoding: 'utf8' });
  assert.equal(`${child.stdout}`, '[object Object]',
    'the premise of this control moved: a ChildProcess stdout no longer stringifies this way');
  assert.equal(/\badd\b/.test(`${child.stdout ?? ''}${child.stderr ?? ''}`), false,
    'the old expression must still be provably false, or this control proves nothing');
  child.kill();

  // ...and the probe, given the same async spawn, is NOT fooled by it.
  assert.equal((await probeWizard(root, { run: runnerSpawn })).klass, WIZARD.OK);
});

test('ARC-06-C5 — each failure is classified, through the runner\'s spawn', async (t) => {
  const crashed = await probeWizard(
    fixture('console.error("Error [ERR_MODULE_NOT_FOUND]: Cannot find package \'commander\'");\nprocess.exit(1);\n', t),
    { run: runnerSpawn });
  assert.equal(crashed.klass, WIZARD.CRASHED);
  assert.equal(crashed.status, 1);
  assert.match(crashed.detail, /Cannot find package 'commander'/,
    'the first stderr line is the one thing that says WHY, and it must survive');

  const absent = await probeWizard(
    fixture('console.log("usage: instance\\n  list   list instances");\n', t), { run: runnerSpawn });
  assert.equal(absent.klass, WIZARD.ABSENT, 'a healthy CLI without `add` is the only genuine absence');

  const spawnError = await probeWizard(fixture('console.log("unused");\n', t), {
    run: () => ({ error: Object.assign(new Error('spawn EAGAIN'), { code: 'EAGAIN' }) }),
  });
  assert.equal(spawnError.klass, WIZARD.SPAWN_ERROR);
  assert.equal(spawnError.detail, 'EAGAIN');

  const signal = await probeWizard(fixture('console.log("unused");\n', t), {
    run: () => ({ status: null, signal: 'SIGKILL', stdout: '', stderr: '' }),
  });
  assert.equal(signal.klass, WIZARD.SIGNAL);
  assert.equal(signal.signal, 'SIGKILL');
});

test('ARC-06-C5 — the "re-bootstrap this build" sentence appears for ABSENT and for nothing else', () => {
  const classes = [WIZARD.SPAWN_ERROR, WIZARD.SIGNAL, WIZARD.CRASHED, WIZARD.ABSENT];
  const saying = classes.map((klass) => [klass,
    wizardProbeFailure({ klass, status: 1, signal: 'SIGKILL', detail: 'x' })]);

  for (const [klass, result] of saying) {
    assert.equal(result.status, 'fail');
    if (klass === WIZARD.ABSENT) {
      assert.equal(result.detail, WIZARD_ABSENT);
      continue;
    }
    assert.notEqual(result.detail, WIZARD_ABSENT,
      `${klass} still tells the user to re-bootstrap a build that is not the problem`);
    assert.ok(result.remedy, `${klass} has no remedy — "none recorded" is what ARC-06-C5 exists to remove`);
  }

  // Both directions: exactly one class carries that text, so the count cannot drift silently.
  assert.equal(saying.filter(([, r]) => r.detail === WIZARD_ABSENT).length, 1);
});

test('awaitProbe normalises both shapes, and keeps what was printed', async () => {
  const sync = await awaitProbe({ status: 0, stdout: 'out', stderr: 'err' });
  assert.deepEqual([sync.status, sync.stdout, sync.stderr], [0, 'out', 'err']);

  // The async shape is the one the old code could not read at all.
  const child = runnerSpawn(process.execPath, ['-e', 'console.log("hello"); process.exit(3);'],
    { stdio: 'pipe', encoding: 'utf8' });
  const async_ = await awaitProbe(child);
  assert.equal(async_.status, 3, 'the exit code is read AFTER the child finished, not off a live handle');
  assert.match(async_.stdout, /hello/, 'the child\'s output was collected, not lost to a stream');

  assert.equal(firstLine('\n\n  the reason  \nthe stack\n'), 'the reason');
  assert.equal(firstLine(null), '');
});
