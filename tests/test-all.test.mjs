/**
 * ARC-09-C64 — the gate cannot short-circuit, and the cases are about the COMBINING, not the suites.
 *
 * The row's control is the first case here: a failure in the FIRST half still lets the second half run and
 * be counted. Everything else exists because a runner that "runs both halves" has four ways to be wrong —
 * it can stop early, it can lose a failure, it can invent one, or it can report a half it never ran.
 *
 * `run` IS INJECTED, and not to be clever: the real halves take about four minutes together, and what is
 * being asserted is the rule that combines their statuses. The two real commands are asserted separately,
 * against `package.json`, because that is where the `&&` lived — a runner with perfect combining that
 * nothing calls would be the same defect wearing a nicer coat.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runAll, STEPS, runSteps } from '../scripts/ci/test-all.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

/** Two named halves, so a case can say which one failed rather than counting calls. */
const TWO = [
  { id: 'first', label: 'node tests/run.mjs', command: 'node', args: ['a'] },
  { id: 'second', label: 'npm test --workspaces', command: 'npm', args: ['b'] },
];

/** A `spawnSync` that records what it was asked to do and answers from a table. */
const fakeRun = (byArg) => {
  const calls = [];
  return {
    calls,
    run: (command, args, options) => {
      calls.push({ command, args, options });
      return byArg[args[0]] ?? { status: 0 };
    },
  };
};

const collect = () => {
  const lines = [];
  return { lines, write: (s) => lines.push(s) };
};

test('ARC-09-C64 — a failure in the FIRST half still lets the second half run and be counted', () => {
  // THE ROW'S CONTROL. `node tests/run.mjs && …` meant that S-13 — one environment-bound case — withdrew
  // 1463 vitest cases from the gate with nothing in the output saying so.
  const { calls, run } = fakeRun({ a: { status: 1 } });
  const { lines, write } = collect();
  const r = runSteps({ steps: TWO, run, write, platform: 'linux' });

  assert.equal(calls.length, 2, 'the second half did not run after the first failed');
  assert.deepEqual(calls.map((c) => c.args[0]), ['a', 'b']);
  assert.equal(r.ok, false, 'a failed half was not counted as a failure');
  assert.deepEqual(r.results.map((x) => x.outcome), ['FAIL (exit 1)', 'ok']);

  // ...and the output says which half was which. A number in the scrollback is only attributable if
  // something named the half before it printed.
  const text = lines.join('');
  assert.match(text, /\[1\/2\] first: node tests\/run\.mjs/);
  assert.match(text, /\[2\/2\] second: npm test --workspaces/);
  assert.match(text, /first\s+node tests\/run\.mjs\s+→\s+FAIL \(exit 1\)/);
  assert.match(text, /second\s+npm test --workspaces\s+→\s+ok/);
  assert.match(text, /FAIL: 1 of 2 half\(s\) failed \(first\)/);
  // The sentence that makes the table readable: `ok` means it RAN, and absence means it did not.
  assert.match(text, /a half missing from this table did not run/);
});

test('ARC-09-C64 — a failure in the SECOND half is not lost either', () => {
  // The direction a naive fix gets right by accident: `&&` already reported this one. It is asserted so
  // that "run everything" cannot be implemented as "ignore everything".
  const { run } = fakeRun({ b: { status: 2 } });
  const { lines, write } = collect();
  const r = runSteps({ steps: TWO, run, write, platform: 'linux' });
  assert.equal(r.ok, false);
  assert.deepEqual(r.results.map((x) => x.outcome), ['ok', 'FAIL (exit 2)']);
  assert.match(lines.join(''), /FAIL: 1 of 2 half\(s\) failed \(second\)/);
});

test('ARC-09-C64 — both halves failing names both, and both halves passing is a pass', () => {
  const both = fakeRun({ a: { status: 1 }, b: { status: 1 } });
  const first = collect();
  assert.equal(runSteps({ steps: TWO, run: both.run, write: first.write, platform: 'linux' }).ok, false);
  assert.match(first.lines.join(''), /FAIL: 2 of 2 half\(s\) failed \(first, second\)/);

  // The green direction, which is what stops this runner from being a check that always fails.
  const green = fakeRun({});
  const second = collect();
  const r = runSteps({ steps: TWO, run: green.run, write: second.write, platform: 'linux' });
  assert.equal(r.ok, true);
  assert.match(second.lines.join(''), /all 2 half\(s\) passed/);
  assert.doesNotMatch(second.lines.join(''), /FAIL/);
});

test('ARC-09-C64 — a half that could not be spawned is a failure, not a silence', () => {
  // The shape that would otherwise pass: `spawnSync` returns `status: null` with an `error` when the
  // command does not exist. A truthiness check on `status` would read that as success — and on Windows
  // this is exactly how a `.cmd` spawned without a shell fails (`EINVAL`), which is a real historic
  // failure in this repository rather than a hypothetical.
  const { run } = fakeRun({ b: { status: null, error: new Error('spawn npm.cmd EINVAL') } });
  const { lines, write } = collect();
  const r = runSteps({ steps: TWO, run, write, platform: 'linux' });
  assert.equal(r.ok, false, 'a half that never started was reported as passing');
  assert.match(r.results[1].outcome, /FAIL \(could not run: spawn npm\.cmd EINVAL\)/);
  assert.match(lines.join(''), /could not run/);

  // A half killed by a signal is the same story: no status, still a failure.
  const killed = fakeRun({ a: { status: null, signal: 'SIGKILL' } });
  const out = collect();
  assert.equal(runSteps({ steps: TWO, run: killed.run, write: out.write, platform: 'linux' }).ok, false);
  assert.match(out.lines.join(''), /FAIL \(killed by SIGKILL\)/);
});

test('ARC-09-C64 — `npm test` calls this runner, and cannot chain suites with an operator again', () => {
  // WHERE THE DEFECT ACTUALLY LIVED. The combining rule above is worthless if `package.json` still says
  // `a && b`, so the script is asserted here — and not by equality, because a future half added to the
  // runner must not have to edit this case.
  assert.equal(pkg.scripts.test, 'node scripts/ci/test-all.mjs');
  for (const [name, script] of Object.entries(pkg.scripts)) {
    if (!/(^|:)test/.test(name)) continue;
    assert.doesNotMatch(script, /&&|\|\||;/,
      `the "${name}" script chains commands with a shell operator: a failure in one would withdraw the `
      + `rest of the gate without saying so — put the steps in scripts/ci/test-all.mjs instead\n  ${script}`);
  }
});

test('ARC-09-C64 — the two real halves are the two that were chained, and the second is not re-declared', () => {
  // The product's own steps, asserted once so a later edit cannot quietly drop a half.
  assert.deepEqual(STEPS.map((s) => s.id), ['engine', 'workspaces']);

  const [engine, workspaces] = STEPS;
  // The first half is `process.execPath` on a JS entry point, with NO shell — `scripts/build-dist.mjs`
  // records why: a shell brings cmd.exe quoting rules with it, and `npx`/`.cmd` cannot be spawned without
  // one. Nothing here needs either.
  assert.equal(engine.command, process.execPath);
  assert.match(engine.args[0], /tests[/\\]run\.mjs$/);
  // ARC-09-C69 — a step no longer DECLARES a shell. It used to carry `shell: false` here and
  // `shell: process.platform === 'win32'` below, and the second of those is DEP0190 on Node 24 with an
  // args array — this script printed one of the three warnings that survived C67, after both halves had
  // finished. The decision moved to `spawnFor` at the call, so there is nothing here to get wrong.
  assert.equal('shell' in engine, false, 'a step declaring a shell is the shape C69 removed');

  // The second half stays npm's own iteration rather than a `vitest` line copied out of the workspace:
  // `packages/snowarch` declares `vitest run --coverage`, and a copy of that here would be a second
  // declaration to drift from the first.
  assert.deepEqual(workspaces.args, ['test', '--workspaces', '--if-present']);
  assert.match(workspaces.command, /^npm(\.cmd)?$/);
  assert.equal('shell' in workspaces, false, 'the npm half must not declare a shell either');

  /*
   * AND THE CALL IS WHAT IS ASSERTED NOW, not the data — which is the stronger claim: what mattered was
   * never the field, it was what reached `spawnSync`. Driven through `runSteps`'s `run` seam so it is
   * knowable on any platform: on win32 the npm half goes through `cmd.exe /d /s /c` with one quoted
   * command line, and nowhere does a shell option appear beside an args array.
   */
  /*
   * BOTH PLATFORMS, PINNED — not `if (process.platform === 'win32')`. ARC-09-C71: a case that branches on
   * the host asserts one half of its subject and takes the other on trust, and the half nobody runs is
   * the half that breaks. `runSteps` takes the platform, so both are knowable from either machine.
   */
  const drive = (platform) => {
    const calls = [];
    runSteps({ steps: STEPS, platform, write: () => {},
      run: (file, args, options) => { calls.push({ file, args, options }); return { status: 0 }; } });
    return calls;
  };

  for (const platform of ['linux', 'win32']) {
    const calls = drive(platform);
    assert.equal(calls.length, 2, `${platform}: both halves have to be spawned`);
    for (const c of calls) {
      assert.equal(c.options.shell, undefined, `${platform}: ${c.file} was spawned with a shell option`);
    }
    assert.equal(calls[0].file, process.execPath, `${platform}: the engine half is node on a JS entry point`);
  }

  // The npm half is the one that differs, and this is the difference: on Windows npm IS a batch file.
  const posix = drive('linux');
  assert.deepEqual(posix[1].args, ['test', '--workspaces', '--if-present']);
  assert.equal(posix[1].options.windowsVerbatimArguments, undefined, 'a POSIX spawn needs no such thing');

  const win = drive('win32');
  assert.match(win[1].file, /cmd\.exe$/i, 'npm.cmd on Windows has to go through the command processor');
  assert.deepEqual(win[1].args.slice(0, 3), ['/d', '/s', '/c']);
  // `npm.cmd` has no space in it, so `quoteForCmd` leaves it bare — quoting a token that needs no
  // quoting would be noise, and the outer pair is cmd's own. A path WITH a space is asserted in
  // `tools/snowarch/tests/spawn-batch.test.mjs`, where that is the subject.
  assert.equal(win[1].args[3], '"npm.cmd test --workspaces --if-present"');
  // And the tripwire is doing its job: STEPS was built on THIS machine, so `command` is the bare `npm`,
  // and the win32 call still reaches `npm.cmd` rather than a name Windows cannot start.
  assert.equal(win[1].args[3].includes('npm.cmd'), true);
  assert.equal(win[1].options.windowsVerbatimArguments, true);

  // ...and the workspace that half runs still has a test script, so `--if-present` is not silently
  // covering nothing. This is the floor: if `packages/snowarch` lost its script, the second half would
  // pass by running zero suites, and the table above would still print `ok`.
  const ws = JSON.parse(readFileSync(resolve(root, 'packages/snowarch/package.json'), 'utf8'));
  assert.equal(typeof ws.scripts?.test, 'string',
    'packages/snowarch has no test script — the workspaces half would report ok over nothing');
  assert.match(ws.scripts.test, /vitest/);
});

// ─── ARC-11-C1 — a fixture left in the run's TMPDIR fails the run ──────────────────────────────────────

test('ARC-11-C1 — both halves run in one private TMPDIR, as TMPDIR, TMP and TEMP, and it is removed after', () => {
  const { calls, run } = fakeRun({});
  const out = collect();
  const removed = [];
  const r = runAll({ steps: TWO, run, write: out.write, platform: 'linux', makeTemp: () => '/fixture/run-tmp',
    read: () => [], remove: (dir) => removed.push(dir) });
  assert.equal(r.ok, true);
  assert.equal(calls.length, 2);
  for (const c of calls) {
    for (const key of ['TMPDIR', 'TMP', 'TEMP']) assert.equal(c.options.env[key], '/fixture/run-tmp', `${c.args[0]}: ${key}`);
  }
  assert.deepEqual(removed, ['/fixture/run-tmp']);
  assert.ok(out.lines.join('').includes('fixture leftovers: 0'));
});

test('ARC-11-C1 — a fixture left behind fails the run and is named, even when both halves passed', () => {
  const { run } = fakeRun({});
  const out = collect();
  const r = runAll({ steps: TWO, run, write: out.write, platform: 'linux', makeTemp: () => '/fixture/run-tmp',
    read: () => ['snowarch-licence-AbC123', 'node-compile-cache', 'snowarch-gone-x1y2z3'], remove: () => {} });
  assert.equal(r.ok, false);
  assert.deepEqual(r.leftovers, ['snowarch-gone-x1y2z3', 'snowarch-licence-AbC123']);
  const text = out.lines.join('');
  assert.match(text, /FAIL: fixture leftovers: 2 in this run's TMPDIR/);
  assert.ok(text.includes('  snowarch-licence-AbC123\n'));
  assert.equal(text.includes('node-compile-cache'), false, 'only this product\'s fixtures are counted');
});

test('ARC-11-C1 — measured on a real directory: a planted leftover fails, and the run directory is gone after', () => {
  let seen = null;
  // A "half" that leaks the way #403's licence fixtures did: it makes a fixture and never removes it.
  const run = (file, args, options) => {
    seen = options.env.TMPDIR;
    mkdirSync(join(options.env.TMPDIR, 'snowarch-planted-1'));
    return { status: 0 };
  };
  const r = runAll({ steps: TWO.slice(0, 1), run, write: () => {}, platform: 'linux' });
  assert.equal(r.ok, false);
  assert.deepEqual(r.leftovers, ['snowarch-planted-1']);
  assert.ok(seen, 'the half was given a TMPDIR');
  assert.equal(existsSync(seen), false, 'the run directory outlived the run');
});
