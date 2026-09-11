/**
 * ARC-09-C11 — a release never installs through a link.
 *
 * `tests/upgrade/harness.mjs` links `node_modules` into its fixtures, which is right for every
 * test that only READS them and wrong for any command that installs: `npm ci` deletes and
 * recreates the directory, and through a symlink it does that to whatever the link points at. The
 * ARC-09-S11 release walkthrough ran the install gate inside a fixture and emptied the developer's
 * real checkout — 215 packages to 0. No tracked file was lost and `npm ci --ignore-scripts` put it
 * back, but nothing warned, and the damage was outside the tree the command was pointed at.
 *
 * Two mechanisms, and this file is the proof of both: the harness can COPY on request, and the
 * release script REFUSES to install into a linked tree rather than trusting every future caller to
 * have read the harness's header.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { gatePlan, modulesAreLinked, runGates } from '../scripts/lib/release/gates.mjs';
import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** A tree with `node_modules` in one of the two shapes, and nothing else. */
function treeWith(t, shape) {
  const dir = tempDir('snowarch-c11-', t);
  const real = join(dir, 'elsewhere');
  mkdirSync(join(real, 'node_modules', 'commander'), { recursive: true });
  writeFileSync(join(real, 'node_modules', 'commander', 'package.json'), '{}\n');
  const work = join(dir, 'work');
  mkdirSync(work);
  if (shape === 'link') {
    symlinkSync(join(real, 'node_modules'), join(work, 'node_modules'),
      process.platform === 'win32' ? 'junction' : 'dir');
  } else {
    mkdirSync(join(work, 'node_modules', 'commander'), { recursive: true });
    writeFileSync(join(work, 'node_modules', 'commander', 'package.json'), '{}\n');
  }
  return { work, real };
}

test('a linked node_modules is recognised, a real one is not (ARC-09-C11)', (t) => {
  const linked = treeWith(t, 'link');
  const copied = treeWith(t, 'copy');
  assert.equal(modulesAreLinked(linked.work), true);
  assert.equal(modulesAreLinked(copied.work), false);
  // Absent is not linked: the install gate is the thing that creates it, and refusing a tree that
  // has never installed would break the first release anyone cuts from a fresh clone.
  assert.equal(modulesAreLinked(join(copied.work, 'nope')), false);
});

test('the install gate REFUSES a linked tree, naming the harness option (ARC-09-C11)', (t) => {
  const { work } = treeWith(t, 'link');
  const ran = [];
  const outcome = runGates({
    plan: gatePlan({ platform: 'linux' }),
    run: (argv) => { ran.push(argv.join(' ')); return 0; },
    diffDist: () => false,
    linked: () => modulesAreLinked(work),
  });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.gate, 'install');
  assert.match(outcome.message, /node_modules is a symlink/);
  // The message has to say what to do — the point of the guard is that the next person meets it
  // without knowing this file exists.
  assert.match(outcome.message, /buildWorld\(\{ modules: 'copy' \}\)/);
  assert.match(outcome.message, /--no-install/);
  // AND NOTHING RAN. A guard that refuses after `npm ci` has already deleted the directory is a
  // message, not a guard.
  assert.deepEqual(ran, []);
});

test('an unlinked tree proceeds, and the plan still starts with the install (ARC-09-C11)', (t) => {
  const { work } = treeWith(t, 'copy');
  const ran = [];
  const outcome = runGates({
    plan: gatePlan({ platform: 'linux' }),
    run: (argv) => { ran.push(argv.join(' ')); return 0; },
    diffDist: () => false,
    linked: () => modulesAreLinked(work),
  });
  assert.equal(outcome.ok, true);
  assert.equal(ran[0], 'npm ci --ignore-scripts');
  // The negative control on the control: with `--no-install` there is no install gate to refuse,
  // so a linked tree is free to run the rest — which is what a fixture that only builds wants.
  const noInstall = runGates({
    plan: gatePlan({ noInstall: true, platform: 'linux' }),
    run: () => 0,
    diffDist: () => false,
    linked: () => true,
  });
  assert.equal(noInstall.ok, true);
});

test('the real checkout is not linked, so a real release is never refused (ARC-09-C11)', () => {
  // The guard must not fire on the thing it protects. If this ever fails, someone has made the
  // developer checkout itself a link, and the release script would refuse for a good reason.
  assert.equal(modulesAreLinked(root), false);
  assert.ok(readdirSync(join(root, 'node_modules')).length > 50, 'the checkout has no dependencies');
});

test('buildWorld({ modules: "copy" }) leaves the real node_modules untouched (ARC-09-C11)', async (t) => {
  // The harness end of the fix, exercised for real. Copying the dependencies costs seconds, which
  // is exactly why `'link'` stays the default — and why this is the only test that asks for
  // `'copy'` rather than every test doing it to be safe.
  const before = readdirSync(join(root, 'node_modules')).length;
  const { buildWorld } = await import('./upgrade/harness.mjs');
  const world = await buildWorld(t, { modules: 'copy' });
  const work = typeof world === 'string' ? world : world.work;

  assert.equal(modulesAreLinked(work), false, 'the copy is still a link');
  assert.ok(readdirSync(join(work, 'node_modules')).length > 50, 'the copy has no dependencies');
  // THE assertion: the thing the incident destroyed is the thing this counts.
  assert.equal(readdirSync(join(root, 'node_modules')).length, before,
    'the real checkout gained or lost dependencies while a fixture was built');
});
