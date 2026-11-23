// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C309 — the comparisons with the loader skip ONLY on the stdlib-only step's own marker.
 *
 * `tests/doctor/mode-instance-parity.test.mjs` asks the real loader, which needs the installed dependencies. CI's stdlib-only step runs that folder on a machine with
 * no node_modules at all (so that the doctor is shown to work before any install), and there the comparisons have nobody to ask. They skip there because that step
 * says so (SNOWARCH_STDLIB_ONLY=1, set in both variants of the step in .github/workflows/ci.yml, and read by name), and nowhere else: a step that lost its node_modules
 * by accident has to FAIL them, not skip them in silence.
 *
 * This file runs the real test file in a copy of the tree that has no node_modules (the copy sits in the temporary folder, with none above it), three ways, and reads
 * ci.yml for the marker. It needs no dependency itself, so it runs on the stdlib-only step too.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { tempDir } from '../../tools/snowarch/tests/helpers/temp.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MARKER = 'SNOWARCH_STDLIB_ONLY';
const FILE = 'tests/doctor/mode-instance-parity.test.mjs';
// what that file imports, and nothing else; a node_modules inside any of these is left behind, so that the copy has no package at all
const PARTS = ['tools', 'packages/contract', 'packages/snowarch/dist', 'packages/snowarch/package.json', 'package.json', FILE];

function runFile(dir, env) {
  const inherited = { ...process.env };
  delete inherited[MARKER];
  delete inherited.NODE_TEST_CONTEXT; // this process is itself a test file: a child that inherited it would not be a runner
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', FILE], { cwd: dir, env: { ...inherited, ...env }, encoding: 'utf8', timeout: 180000 });
  const out = `${r.stdout}${r.stderr}`;
  const num = (name) => Number(new RegExp(`^# ${name} (\\d+)`, 'm').exec(out)?.[1] ?? NaN);
  return { status: r.status, out, tests: num('tests'), pass: num('pass'), fail: num('fail'), skipped: num('skipped') };
}

test('ARC-09-C309 — the loader comparisons skip only on the stdlib-only step\'s marker: without it a missing dependency fails, with it they skip, and a missing file fails either way', (t) => {
  const dir = tempDir('snowarch-c309-marker-', t);
  for (const part of PARTS) cpSync(join(root, part), join(dir, part), { recursive: true, filter: (src) => !src.split(sep).includes('node_modules') });
  assert.equal(existsSync(join(dir, 'node_modules')), false, 'the copy must have no node_modules');

  // 1. no marker, no dependencies: the comparisons FAIL, and the failure says what is missing
  const bare = runFile(dir, {});
  assert.notEqual(bare.status, 0, `without the marker a missing dependency passed:\n${bare.out}`);
  assert.ok(bare.fail >= 1, `no test failed without the marker:\n${bare.out}`);
  assert.equal(bare.skipped, 0, `a test skipped without the marker:\n${bare.out}`);
  assert.match(bare.out, /Cannot find package '/, 'the failure does not name the missing package');

  // 2. the marker, the same copy: they skip and nothing fails, and every test that failed in 1 is one that skips here: the missing package alone made the failure of 1
  const marked = runFile(dir, { [MARKER]: '1' });
  assert.equal(marked.status, 0, `with the marker the run did not pass:\n${marked.out}`);
  assert.equal(marked.fail, 0, marked.out);
  assert.equal(marked.skipped, bare.fail, 'the tests that failed without the marker are not the ones that skip with it');
  assert.match(marked.out, /# SKIP /, 'a skip is said in words');

  // 3. the marker is no licence to skip any failure: a missing FILE of the repository ("Cannot find module") still fails with it
  rmSync(join(dir, 'packages/snowarch/dist/servicenow/instances.js'));
  const missing = runFile(dir, { [MARKER]: '1' });
  assert.notEqual(missing.status, 0, `with the marker a missing file of the repository passed:\n${missing.out}`);
  assert.equal(missing.skipped, 0, missing.out);
  assert.match(missing.out, /Cannot find module '/, 'the failure does not name the missing file');
});

test('ARC-09-C309 — both stdlib-only steps of ci.yml set the marker the loader comparisons read', () => {
  const yml = readFileSync(join(root, '.github', 'workflows', 'ci.yml'), 'utf8');
  const steps = yml.split(/^ {6}- name: /m).slice(1);
  const stdlib = steps.filter((s) => s.startsWith('The doctor\'s stdlib-only tests, before any install'));
  assert.equal(stdlib.length, 2, 'the POSIX and the Windows variant of the step');
  for (const step of stdlib) {
    const keys = step.slice(0, step.indexOf('        run: '));
    assert.match(keys, new RegExp(`^ {8}env:\\n {10}${MARKER}: '1'$`, 'm'), `the step does not set ${MARKER}: ${step.split('\n')[0]}`);
  }
});
