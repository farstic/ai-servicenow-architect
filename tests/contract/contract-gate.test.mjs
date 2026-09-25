import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
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
 * `dist` under `--skip-build`". It does not, and must not — `dist` is step 2 and still runs. The
 * step `--skip-build` skips is step 1, whose id is **`server`** and whose subject is the committed
 * `dist/` directory; the proposal confused the step's id with what it checks. Asserting "omits
 * dist" would have demanded the opposite of the criterion.
 *
 * **And a correction to my own first version of this file, found by the architect on the first run
 * (ARC-05-C3).** It ran the real gate twice, in the real tree. Step 1 spawns
 * `scripts/build-dist.mjs`, which removes `packages/snowarch/dist` before it writes it —
 * deliberately. `node:test` runs files CONCURRENTLY, so for the seconds between the remove and the
 * rebuild that directory does not exist, and whichever other test happened to read it in that
 * window failed with ENOENT: `docs-family.test.mjs` on one machine, `docs-links.test.mjs` on
 * another, none on mine. **A unit test must not delete and rebuild a committed directory of the
 * tree it runs in.** The ~19 s it cost was the symptom, not the problem. The gate now has a `--plan`
 * mode that prints the selection and executes nothing, and this file asserts that; the gate's full
 * EXECUTION is proven on every push by CI's `contract` cell, which is where it belongs.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const GATE = join(root, 'scripts/contract-gate.mjs');
const DIST = join(root, 'packages/snowarch/dist');

const plan = (...args) => {
  const r = spawnSync(process.execPath, [GATE, '--plan', ...args], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return (r.stdout.split('\n').find((l) => l.startsWith('CONTRACT GATE PLAN: ')) ?? '').trim();
};

test('B05-07 — --skip-build skips step 1 by name, and steps 2 to 4 still run', () => {
  assert.equal(plan('--skip-build'),
    'CONTRACT GATE PLAN: server skipped · dist would run · generated would run · engine would run');
  // Stated as its own claim: `dist` RUNS under --skip-build. The row's proposed check said the
  // opposite, and a test written to it would have locked in the wrong behaviour.
  assert.match(plan('--skip-build'), /dist would run/);
});

test('B05-07 — without the flag no step is skipped', () => {
  // The other direction. Without it the first test would pass against a gate that skipped step 1
  // unconditionally — a different defect wearing the same summary line.
  assert.equal(plan(),
    'CONTRACT GATE PLAN: server would run · dist would run · generated would run · engine would run');
  assert.doesNotMatch(plan(), /skipped/);
});

test('B05-07 — --plan executes nothing: the committed dist/ is still there afterwards', () => {
  // The assertion ARC-05-C3 exists for. `--plan` that quietly ran step 1 would reintroduce the race
  // it was added to remove, and every other assertion here would still pass.
  const before = existsSync(DIST);
  assert.ok(before, 'fixture: the committed dist/ is not present to begin with');
  plan();
  plan('--skip-build');
  assert.ok(existsSync(DIST), '--plan removed or rebuilt the committed dist/');
});

test('B05-07 — the flag is wired to step 1 alone, in the source', () => {
  // Read out of the file so a fifth step, or a second `skip:`, cannot arrive unnoticed: the runs
  // above would both still pass if `--skip-build` silently started skipping a second step.
  const src = readFileSync(GATE, 'utf8');
  const ids = [...src.matchAll(/^ {4}id: '([a-z]+)',$/gm)].map((m) => m[1]);
  assert.deepEqual(ids, ['server', 'dist', 'generated', 'engine'], 'the four steps, in order');
  const skips = [...src.matchAll(/^ {4}skip: (\w+),$/gm)].map((m) => m[1]);
  assert.deepEqual(skips, ['skipBuild'], 'exactly one step declares a skip, and it is the build');
  // And that one `skip:` belongs to the FIRST step — position matters, and `deepEqual` on the list
  // above would not notice it moving.
  assert.ok(src.indexOf("id: 'server'") < src.indexOf('skip: skipBuild'));
  assert.ok(src.indexOf('skip: skipBuild') < src.indexOf("id: 'dist'"));
  // The plan branch must exit before the runner loop, or "executes nothing" is a hope.
  assert.ok(src.indexOf('if (planOnly) {') < src.indexOf('for (const step of STEPS) {'));
  assert.match(src, /if \(planOnly\) \{[\s\S]*?process\.exit\(0\);\n\}/);
});

test('B05-07 — the summary line the RC run order quotes is the one the gate would print', () => {
  // Run-order §3 row 6.2 tells an operator to expect
  // `CONTRACT GATE: server skipped · dist ok · generated ok · engine ok`.
  // Nothing could assert that once this file stopped executing the gate — so the FORMAT is pinned
  // from the source instead: the prefix, the two per-step words, and the separator. A gate that
  // started printing "SKIP" or joining with commas would fail here rather than silently making the
  // RC row wrong, which is the failure mode row 6.2 already had once.
  const src = readFileSync(GATE, 'utf8');
  assert.match(src, /done\.push\(`\$\{step\.id\} skipped`\)/);
  assert.match(src, /done\.push\(`\$\{step\.id\} ok`\)/);
  assert.match(src, /writeSync\(1, `CONTRACT GATE: \$\{done\.join\(' · '\)\}\\n`\)/);

  // And the plan line uses the same words for the same decision, so the two surfaces cannot drift
  // into describing different gates.
  assert.match(plan('--skip-build'), /^CONTRACT GATE PLAN: server skipped · /);
  const expectedSummary = 'CONTRACT GATE: server skipped · dist ok · generated ok · engine ok';
  const fromPlan = plan('--skip-build')
    .replace('CONTRACT GATE PLAN: ', 'CONTRACT GATE: ')
    .replaceAll(' would run', ' ok');
  assert.equal(fromPlan, expectedSummary,
    'the plan line no longer reconstructs the summary the RC run order quotes');
});

test('ARC-09-C59 — the server step\'s remedy does not name the command it just ran', () => {
  // THE DEFECT, measured during the 2.0.3-dev bump. The gate failed with a one-line
  // `dist/contract.json` diff and said `dist/ is stale — run node scripts/build-dist.mjs and commit
  // the result`. Running `build-dist` changed nothing, because step 1's own `run()` spawns it and
  // THEN diffs the result against what is committed — so the first half of that sentence asks the
  // reader to repeat the thing that produced the diff in front of them. The real cause was an
  // uncommitted version bump: HEAD carried 2.0.2-dev while the source built 2.0.3-dev.
  //
  // A remedy that sends a reader to re-run a no-op is worse than none: it costs them the minutes
  // before they stop believing it, and it points away from the only action that fixes the state.
  //
  // ASSERTED ON THE SOURCE, and that is the right level twice over. The remedy is a string, so
  // whether it says the right thing is a question about the file. And the alternative — executing
  // step 1 to read its printed remedy — is exactly what ARC-05-C3 forbids in this file: `run()`
  // removes and rebuilds the committed `packages/snowarch/dist` of the tree the tests run in, which
  // raced other suites to ENOENT. The gate's execution is proven by CI's `contract` cell.
  // COMMENTS STRIPPED FIRST, the way this repository's other source scanners do it. My first cut
  // did not, and an apostrophe inside the comment I had just written (`the gen-* scripts'`) opened a
  // quote region that swallowed the literals — the test failed against a remedy that was already
  // correct. A scanner that reads prose as code is measuring the wrong file.
  const src = readFileSync(GATE, 'utf8');
  const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  const step = code.slice(code.indexOf("id: 'server'"), code.indexOf("id: 'dist'"));
  assert.ok(step.includes('remedy:'),
    'the server step no longer carries a remedy — find it and re-point this test');

  // The whole remedy, however it is wrapped across concatenated string literals.
  const text = [...step.matchAll(/'([^']*)'/g)].map((m) => m[1]).join('');

  assert.doesNotMatch(text, /run node scripts\/build-dist\.mjs and commit the result/,
    'the remedy still tells the reader to run the command this step already ran');
  assert.match(text, /COMMIT/,
    'the remedy does not name the one action that resolves the diff');
  assert.match(text, /bump/i,
    'the remedy does not mention the case that produces this diff most often — an uncommitted bump');

  // NOT VACUOUS, and the distinction the row turns on: the `generated` step's version of this
  // sentence IS correct, because `gen:check` does not run the generator first. So the rule is not
  // "never say run X" — it is "never say run X when this step just ran X".
  const generated = code.slice(code.indexOf("id: 'generated'"), code.indexOf("id: 'engine'"));
  assert.match(generated, /run npm run gen and commit the result/,
    'the generated step\'s remedy changed — it is correct as it stands and this test relies on it');
});
