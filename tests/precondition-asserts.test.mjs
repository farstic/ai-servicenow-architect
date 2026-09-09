import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A test that sets up a precondition must assert the precondition took effect.
 *
 * This exists because two tests in this repository did not, and one of them was VACUOUS —
 * `docs-sync`'s pattern-mode case set `core.sparseCheckoutCone false` with a plain `git config`,
 * which `config.worktree` outranks, so the checkout was never in pattern mode and the repair the
 * test claimed to exercise never ran. It passed for months of commits while asserting nothing.
 *
 * The rule is narrow on purpose. Building a fixture from nothing is NOT the risky shape: there the
 * write IS the input, and a write that failed makes the subject find nothing and the assertion
 * fail. What is risky is mutating state that ALREADY EXISTS — git config (precedence), a checkout
 * or a sparse set (may silently no-op), the index — because a mutation that quietly does nothing
 * can leave the later assertion passing, or failing for the wrong reason.
 *
 * The check is mechanical: an assertion within two lines of the mutation. That is enough to make
 * the author state what they believe they just did.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const MUTATIONS = [
  [/\[\s*['"]config['"]/, 'git config — outranked by config.worktree and by --global/--system'],
  [/\[\s*['"]checkout['"]/, 'git checkout — silently a no-op when already there'],
  [/['"]sparse-checkout['"]\s*,\s*['"](?:set|disable|init)['"]/, 'sparse-checkout — may not change the tree'],
  [/\[\s*['"]update-index['"]/, 'index mutation'],
];

/** Test files, both suites. Helpers are excluded: they build fixtures, they do not assert. */
function testFiles() {
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); }
      else if (/\.test\.(mjs|ts)$/.test(e.name)) out.push(p);
    }
  };
  for (const r of ['tests', 'packages/snowarch/tests']) walk(join(root, r));
  return out.filter((f) => !relative(root, f).includes('helpers/'));
}

/** Every (file, test, mutation) triple, with whether an assertion sits within two lines. */
function sites() {
  const found = [];
  for (const f of testFiles()) {
    const rel = relative(root, f);
    const lines = readFileSync(f, 'utf8').split('\n');
    let current = null;
    lines.forEach((line, i) => {
      const t = /^\s*(?:it|test)\(\s*['"`](.+?)['"`]/.exec(line);
      if (t) current = t[1];
      const hit = MUTATIONS.find(([re]) => re.test(line));
      if (!hit || current === null) return;
      const near = lines.slice(Math.max(0, i - 2), i + 3).join('\n');
      found.push({
        rel, line: i + 1, test: current, why: hit[1],
        guarded: /assert\.|expect\(/.test(near),
      });
    });
  }
  return found;
}

test('every mutation of pre-existing state is followed by an assertion that it took', () => {
  const unguarded = sites().filter((s) => !s.guarded)
    .map((s) => `${s.rel}:${s.line} «${s.test}» — ${s.why}`);
  assert.deepEqual(unguarded, []);
});

test('the sweep is looking at something — and reports what', () => {
  // Non-vacuous in its own right: if the scan stopped finding files or mutations, the test above
  // would pass by finding nothing, which is precisely the failure it exists to prevent elsewhere.
  const all = sites();
  assert.ok(testFiles().length > 50, `only ${testFiles().length} test files found`);
  assert.ok(all.length > 0, 'no state mutations found at all — the patterns have gone stale');
  console.log(`    ${testFiles().length} test files · ${all.length} mutations of existing state, all guarded`);
});

test('negative — an unguarded mutation is caught', () => {
  // The detector, run against a synthetic file, because the repository is (now) clean.
  // ASSEMBLED, never written out: a file that spells the forbidden shape becomes a detector its
  // own sweep must then exempt. This repository has learned that four times; this is the fifth
  // place it would have applied.
  const mutation = `  git([${JSON.stringify('config')}, 'core.sparseCheckoutCone', 'false'], corpus);`;
  assert.ok(MUTATIONS.some(([re]) => re.test(mutation)), 'the sample is not even a mutation');

  // The vacuous shape: mutate, run the subject twice, assert the state the mutation was supposed to
  // have broken. Nothing between the mutation and the subject says the mutation worked.
  const vacuous = [mutation, '  syncCorpus(w);', '  syncCorpus(w);', '  assert.equal(inspect(w).coneOn, true);'];
  const near = vacuous.slice(0, 3).join('\n');
  assert.ok(!/assert\.|expect\(/.test(near), 'the detector would have let the vacuous shape through');

  // And the guarded shape passes.
  const guarded = [mutation, "  assert.equal(read('core.sparseCheckoutCone'), 'false');", '  syncCorpus(w);'];
  assert.ok(/assert\.|expect\(/.test(guarded.slice(0, 3).join('\n')));
});
