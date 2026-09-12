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

/**
 * A tree-relative path with `/` separators, on every platform.
 *
 * `relative()` returns `tests\\x.test.mjs` on Windows, and every comparison in this file is against
 * a literal written with `/`. Two of them were silently platform-dependent: the `helpers/` filter
 * scanned files on Windows that it skipped everywhere else, and the self-exemption below never
 * fired there — so this file's own planted control was reported as a finding and three Windows
 * cells went red on a green macOS tree. `packages/contract/lint/lib/scan.mjs` carries the same
 * normaliser and the same paragraph; this is the third time in the arc, which is why it is a named
 * function rather than an inline `.split()`.
 */
export const posix = (p) => p.split('\\').join('/');
const rel = (p) => posix(relative(root, p));

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
  return out.filter((f) => !rel(f).includes('helpers/'));
}

/** Every (file, test, mutation) triple, with whether an assertion sits within two lines. */
function sites() {
  const found = [];
  for (const f of testFiles()) {
    const file = rel(f);
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

// ── ARC-09-C14 — a fixture never lets git read the machine ─────────────────────────────────────
//
// Three fixtures in this arc took a default from the machine they ran on and passed locally while
// failing on the runners: ARC-08-S05's harness identity (no global git config on a fresh runner),
// ARC-09-C13's `os.devNull` as a config path (`\\.\nul` on Windows, which git cannot open), and
// ARC-09-C14's bare origin, whose HEAD followed `init.defaultBranch` — `master` — while its only
// branch was `main`, so a clone of it landed on an unborn branch and the push failed with
// `src refspec main does not match any` on twelve cells at once.
//
// The pattern is always the same: the SHORT form of a git command takes a default from somewhere
// outside the test. This scans for the one that is mechanically checkable.

/** The one file exempt from the scan below, because it describes and plants what the scan finds. */
const SELF = 'tests/precondition-asserts.test.mjs';

test('every `git init` in the test tree names its branch (ARC-09-C14)', () => {
  const missing = [];
  for (const file of testFiles()) {
    const name = rel(file);
    // This file names both call shapes in prose and plants one as a control, so it is exempt by
    // name with the reason — the same way `version-literals.test.mjs` exempts itself. A scanner
    // that flags its own description of what it scans for is a scanner nobody can act on.
    if (name === SELF) continue;
    const text = readFileSync(file, 'utf8');
    text.split('\n').forEach((line, i) => {
      // COMMENTS OUT FIRST (the fourth time this arc: ARC-09-S09, C17b, C19, here). In a comment a
      // command is the LESSON; in code it is the call.
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
      // Both call shapes in this repository: git(dir, [init, …]) and run(init, …) — written without
      // the quotes this scan looks for, or the line below would find itself.
      if (!/\[\s*'init'|\(\s*'init'/.test(line)) return;
      if (/'-b'/.test(line)) return;
      missing.push(`${name}:${i + 1} — ${line.trim().slice(0, 80)}`);
    });
  }
  assert.deepEqual(missing, [], 'a `git init` without `-b <branch>` takes `init.defaultBranch` from '
    + "the machine: the fixture then has one branch name here and another on a runner, and the "
    + 'failure arrives as `src refspec … does not match any` in a job nobody was looking at');
});

test('the init scan would catch a bare init, and is not matching everything (ARC-09-C14)', () => {
  // The control on the scan. Without it a regex that stopped matching would report nothing and
  // pass — the exact failure mode `precondition-asserts` was written for.
  const planted = "  git(root, ['init', '-q']);";
  assert.equal(/\[\s*'init'|\(\s*'init'/.test(planted) && !/'-b'/.test(planted), true);
  const fine = "  git(root, ['init', '-q', '-b', 'main']);";
  assert.equal(/\[\s*'init'|\(\s*'init'/.test(fine) && !/'-b'/.test(fine), false);
  // ...and it looks at real files: if the sweep found none, the assertion above proves nothing.
  assert.ok(testFiles().length > 50, `only ${testFiles().length} test files scanned`);
  // The two comparisons that were separator-dependent, asserted on the SHAPE `relative()` returns
  // on Windows — so this runs the same on every platform instead of only proving itself on the one
  // where it already worked. Both were silent: the exemption stopped matching, so the control
  // planted above was reported as a finding on three Windows cells while macOS was green; and the
  // `helpers/` filter scanned files there that it skipped everywhere else.
  assert.equal(posix(String.raw`tests\precondition-asserts.test.mjs`), SELF);
  assert.equal(posix(String.raw`tests\doctor\helpers\tree.mjs`).includes('helpers/'), true);
  // And it is a normalisation rather than a blanket replace of the separator this platform uses.
  assert.equal(posix('tests/doctor/helpers/tree.mjs'), 'tests/doctor/helpers/tree.mjs');
});
