import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ARC-05 acceptance, B05-07 — `contract-gate.mjs --skip-build` skips step 1 and runs 2 to 4.
 *
 * `tests/release.test.mjs` asserts that the RELEASE script invokes the gate with `--skip-build`,
 * through a mock — which proves the caller passes the flag and says nothing about what the flag
 * does. Nothing tested the gate's own step selection.
 *
 * **A correction the row needs:** its proposed check says to assert the printed step list "omits
 * `dist` under `--skip-build`". It does not, and must not — `dist` is step 2's id and step 2 still
 * runs. The step `--skip-build` skips is step 1, whose id is **`server`** and whose subject is the
 * committed `dist/` directory; the proposal confused the step's id with what it checks. Asserting
 * "omits dist" would have demanded the opposite of the criterion.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const GATE = join(root, 'scripts/contract-gate.mjs');

const summary = (out) => (out.split('\n').find((l) => l.startsWith('CONTRACT GATE: ')) ?? '').trim();

test('B05-07 — --skip-build skips step 1 by name, and steps 2 to 4 still run', () => {
  const r = spawnSync(process.execPath, [GATE, '--skip-build'], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  // The four steps are named in order, and exactly one of them is skipped.
  assert.equal(summary(r.stdout), 'CONTRACT GATE: server skipped · dist ok · generated ok · engine ok');
  // Stated as its own claim: `dist` RUNS under --skip-build. The row's proposed check said the
  // opposite, and a test written to it would have locked in the wrong behaviour.
  assert.match(summary(r.stdout), /dist ok/);
});

test('B05-07 — without the flag the same four steps run, and step 1 is not skipped', () => {
  // The other direction. Without it the first test would pass against a gate that skipped step 1
  // unconditionally — which is a different defect wearing the same summary line.
  const r = spawnSync(process.execPath, [GATE], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(summary(r.stdout), 'CONTRACT GATE: server ok · dist ok · generated ok · engine ok');
  assert.doesNotMatch(summary(r.stdout), /skipped/);
});

test('B05-07 — the flag is wired to step 1 alone, in the source', () => {
  // Read out of the file so a fifth step, or a second `skip:`, cannot arrive unnoticed: the two
  // runs above would both still pass if `--skip-build` silently started skipping a second step
  // that happened to be fast.
  const src = readFileSync(GATE, 'utf8');
  const ids = [...src.matchAll(/^ {4}id: '([a-z]+)',$/gm)].map((m) => m[1]);
  assert.deepEqual(ids, ['server', 'dist', 'generated', 'engine'], 'the four steps, in order');
  const skips = [...src.matchAll(/^ {4}skip: (\w+),$/gm)].map((m) => m[1]);
  assert.deepEqual(skips, ['skipBuild'], 'exactly one step declares a skip, and it is the build');
  // And that one `skip:` belongs to the FIRST step — position matters, and `deepEqual` on the list
  // above would not notice it moving.
  assert.ok(src.indexOf("id: 'server'") < src.indexOf('skip: skipBuild'));
  assert.ok(src.indexOf('skip: skipBuild') < src.indexOf("id: 'dist'"));
});
