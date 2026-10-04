/**
 * ARC-09-C80 — a test file cleans up the directories it makes in the machine's temp location.
 *
 * THE DEFECT, MEASURED. A full `npm test` left four `w17-win32-*` directories in TMPDIR, one per
 * case in `tests/doctor/win32-remedies.test.mjs`: its `bareRoot()` called `mkdtempSync` and nothing
 * removed the result — no `rmSync`, no `t.after`, not the tracked `tempDir()` the other doctor
 * fixtures use. The same run, with TMPDIR pointed at an empty directory, left nothing else of its
 * own: every other file in `tests/` removed what it made when its test PASSED.
 *
 * THAT IS WHY THE CLASS IS NOT "files that leak today". The other bare `mkdtempSync` sites removed
 * what they made when their test PASSED — by a `try/finally`, a `t.after`, or an `rmSync` at the end
 * of the test body. Only the last is skipped by a failed assertion (the helper's own header says
 * so), and none of the three has the exit and signal backstop the helper adds, so a killed run leaves
 * the directory. How many of them a FAILING test would have leaked was not counted: they were
 * converted to one rule rather than audited one by one. The helper removes at test end, passing or
 * failing, and again at exit for the sites that have no test context. So the rule that closes the
 * class is one sentence: no file under `tests/` makes a directory in the temp location except
 * through `tempDir()` / `trackTempDir()`.
 *
 * TWO CASES, because they answer different questions.
 *
 *   1. The file that leaked, run as a child with a private TMPDIR, listing the sandbox before and
 *      after. This is the row's own acceptance, and it fails on the BEHAVIOUR — whatever the fix
 *      looks like, and whatever prefix a leak is made under.
 *   2. A scan of every source file under `ROOTS` for the SPELLING, by syntax tree
 *      (`tests/lib/temp-sites.mjs`). It fails on the NEXT bare site, before there is a run that
 *      leaks, and names the file and the line.
 *
 * WHAT THIS DOES NOT COVER, said here so nobody reads the scan as wider than it is:
 * `tools/snowarch/tests/` (apart from its `helpers/`) and `packages/snowarch/tests/` are separate
 * trees with their own bare sites and are not scanned — see the ARC-09-C80 row. `ROOTS` below is the
 * one line that widens it. And a directory made by PRODUCT code that a test imports or spawns is not
 * a spelling in a test file at all; case 1 and a whole-suite count against a private TMPDIR cover it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { countCalls, findSites, violations } from './lib/temp-sites.mjs';
import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WIN32_FILE = join(root, 'tests/doctor/win32-remedies.test.mjs');

/** A tree-relative path with `/` separators on every platform — exemptions are written with `/`. */
const rel = (p) => relative(root, p).split('\\').join('/');

// ---------------------------------------------------------------------------------------------
// 1. THE FILE THAT LEAKED, RUN AND COUNTED
// ---------------------------------------------------------------------------------------------

/**
 * Entries that sit in a temp directory without a test having made them. Node writes its compile
 * cache under TMPDIR on some lines (`tests/never-commit.test.mjs` explains the same entry), and a
 * list entry nobody made is not a leak. Everything else in the sandbox counts, under ANY name — a
 * listing that looked for one prefix would pass a leak made under another.
 */
const NOT_A_FIXTURE = ['node-compile-cache'];

/**
 * Run one test file as a child whose temp location is `sandbox`.
 *
 * TMPDIR, TMP and TEMP together: `os.tmpdir()` reads the first on POSIX and the other two on
 * Windows, and setting one alone would silently measure the real temp directory. `NODE_TEST_CONTEXT`
 * is deleted so the child decides its own exit code instead of reporting up to this runner (the
 * reason `tools/snowarch/tests/fixture-cleanup.test.mjs` gives at length). The reporter is named
 * because the default differs between Node lines and the assertions below read the TAP summary.
 *
 * The bound is the SPAWN's, not a comparison against a number (CONTRIBUTING, C24): `timeout` plus
 * `killSignal`, and the caller asserts the child was not killed.
 */
function runTestFile(file, sandbox) {
  const env = { ...process.env, TMPDIR: sandbox, TMP: sandbox, TEMP: sandbox };
  delete env.NODE_TEST_CONTEXT;
  return spawnSync(process.execPath, ['--test', '--test-reporter=tap', file],
    { encoding: 'utf8', env, timeout: 120_000, killSignal: 'SIGKILL' });
}

/** Everything in `dir` a test could have left — directories AND their `.owner` records. */
function listing(dir) {
  return readdirSync(dir).filter((name) => !NOT_A_FIXTURE.includes(name)).sort();
}

/**
 * The same listing, once the child has had a chance to finish leaving.
 *
 * `spawnSync` returns when the process is gone, but a recursive removal on a loaded Windows runner
 * can still be settling its directory entry (fixture-cleanup.test.mjs measured this on two cells).
 * The wait is on a CONDITION with a bound, never an assertion about time: it returns as soon as the
 * listing is empty, and a directory still there after the last look is a failure.
 */
function settledListing(dir) {
  let names = listing(dir);
  for (let look = 0; look < 10 && names.length > 0; look += 1) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    names = listing(dir);
  }
  return names;
}

/**
 * What the child's exit sweep said about a removal that FAILED, on whichever stream it landed.
 *
 * `temp.mjs` reports a survivor as `temp.mjs: N fixture(s) survived on node X: <dir>: ENOTEMPTY`,
 * and `fixture-cleanup.test.mjs` records at length that an assertion which dropped exactly this made
 * three CI occurrences undiagnosable: the reason had been printed, captured and thrown away.
 */
function sweepOutput(child) {
  const said = [child.stdout, child.stderr].filter(Boolean).join('\n').split('\n')
    .filter((line) => line.includes('temp.mjs:') || /: E[A-Z]+\b/.test(line)).join('\n');
  return said || '(neither stream mentioned the sweep)';
}

test('ARC-09-C80 — win32-remedies.test.mjs leaves no w17-win32-* directory in TMPDIR', (t) => {
  const sandbox = tempDir('c80-sandbox-', t);
  const before = listing(sandbox);

  const child = runTestFile(WIN32_FILE, sandbox);
  assert.equal(child.signal, null, `the child was killed (${child.signal}) — the run did not finish`);
  assert.equal(child.status, 0, `the file itself failed:\n${child.stdout}${child.stderr}`);

  // THE FLOOR. Zero leftovers is also what a run that created nothing leaves, and absence read as
  // correctness is the defect this programme keeps finding. A skipped case ends its line in `# SKIP`
  // and an early return still prints `ok`, so the floor asks for three things together: nothing was
  // skipped, nothing failed, and each of the four cases that call `bareRoot()` has its own passing
  // line (the `$` rejects ` # SKIP`).
  assert.match(child.stdout, /^# skipped 0$/m, 'the child skipped cases, so an empty listing proves less');
  assert.match(child.stdout, /^# fail 0$/m, 'the child reported failures');
  for (const family of ['engine-repo', 'engine-docs', 'server', 'engine-contract']) {
    assert.match(child.stdout,
      new RegExp(`^ok \\d+ - .*${family}'s remedies read the Windows spelling on a Windows shell$`, 'm'),
      `the child never passed the ${family} case, so an empty listing proves nothing:\n${child.stdout}`);
  }

  const after = settledListing(sandbox);
  const w17 = after.filter((name) => name.startsWith('w17-win32-')).length;
  assert.deepEqual(after, before,
    `${after.length} entr(ies) left in TMPDIR after the file ran (${w17} of them w17-win32-*): `
    + `${after.join(', ')}\nthe exit sweep said: ${sweepOutput(child)}`);
});

/** A test file that makes one directory under `prefix` and removes nothing. */
const leakingProbe = (prefix) => [
  "import test from 'node:test';",
  "import { mkdtempSync } from 'node:fs';",
  "import { tmpdir } from 'node:os';",
  "import { join } from 'node:path';",
  `test('leaks', () => { mkdtempSync(join(tmpdir(), '${prefix}')); });`,
  '',
].join('\n');

test('control — the listing sees a directory a test file leaves behind, under any name', (t) => {
  // A probe that does what `bareRoot()` used to do. If this reads zero, the case above could not
  // have told a leak from a clean run and its pass would be worth nothing. The second probe leaks
  // under a name nothing here looks for, because a listing keyed on one prefix would pass it.
  for (const prefix of ['w17-win32-', 'a-name-the-case-never-heard-of-']) {
    const sandbox = tempDir('c80-control-sandbox-', t);
    const probeDir = tempDir('c80-control-probe-', t);
    const probe = join(probeDir, 'leaks.test.mjs');
    writeFileSync(probe, leakingProbe(prefix));

    const child = runTestFile(probe, sandbox);
    assert.equal(child.status, 0, `the probe itself failed:\n${child.stdout}${child.stderr}`);
    assert.equal(settledListing(sandbox).length, 1,
      `a probe that leaks one directory under "${prefix}" must be listed as one`);
  }
});

// ---------------------------------------------------------------------------------------------
// 2. THE SPELLING, SCANNED
// ---------------------------------------------------------------------------------------------

/**
 * The trees the scan covers. One line widens it; the follow-up row names the trees left out.
 * `tools/snowarch/tests/helpers` is here because 67 files in `tests/` import from it, so a bare site
 * added there would be everyone's — and it is the one place the sanctioned spelling is DEFINED.
 */
const ROOTS = ['tests', 'tools/snowarch/tests/helpers'];

/**
 * Sites that are allowed, each with the reason. `needle` is a substring of the line, never a line
 * number, and it exempts every site on the lines it matches — keep it to one statement. Every entry
 * must still exempt something: the next case fails on a dead one.
 */
const EXEMPT = [
  {
    file: 'tests/upgrade/plan-agrees.test.mjs',
    needle: 'assert.equal(tmpdir(), privateTmp',
    reason: 'the case is ABOUT the temp location: it re-points TMPDIR and asserts os.tmpdir() followed',
  },
];

/** Files the walk must have seen — a walk that quietly dropped a tree would report nothing and pass. */
const SENTINELS = [
  'tests/doctor/win32-remedies.test.mjs',
  'tests/contract/engine-lint.test.mjs',
  'tests/upgrade/plan-agrees.test.mjs',
  'tests/helpers/docs-fixture.mjs',
  'tools/snowarch/tests/helpers/temp.mjs',
];

/** Every source file under `ROOTS`, minus data. */
function sourceFiles() {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        // `fixtures/` is data a test reads, not code that runs; `node_modules` is not ours.
        if (!['node_modules', 'fixtures'].includes(entry.name)) walk(path);
      } else if (/\.(?:[cm]?[jt]s|[jt]sx)$/.test(entry.name)) {
        out.push(path);
      }
    }
  };
  for (const r of ROOTS) walk(join(root, r));
  return out.sort();
}

test('ARC-09-C80 — no file under tests/ makes a temp directory outside the tracked helper', () => {
  const files = sourceFiles();
  const names = files.map(rel);

  // THE FLOORS. A walk that found nothing, or a parser that stopped seeing calls, would report no
  // violations and pass — so both halves are asserted to have been SEEN: named files were read, and
  // the sanctioned form was found in most of them. The numbers sit within about 10% of what the tree
  // holds, so losing a tenth of the files or of the calls fails here instead of passing quietly.
  for (const sentinel of SENTINELS) assert.ok(names.includes(sentinel), `the walk never reached ${sentinel}`);
  assert.ok(files.length > 125, `only ${files.length} source file(s) scanned — the walk is wrong`);
  const tracked = files.filter((f) => countCalls(readFileSync(f, 'utf8'), ['tempDir', 'trackTempDir'], f) > 0);
  assert.ok(tracked.length > 64, `the tracked helper is called in only ${tracked.length} file(s) — `
    + 'the parser stopped seeing the sanctioned form');

  const bad = files.flatMap((f) => violations(rel(f), readFileSync(f, 'utf8'), EXEMPT));
  assert.deepEqual(bad.map((v) => `${v.file}:${v.line}  ${v.text}`), [],
    `${bad.length} site(s) make a temp directory outside tempDir()/trackTempDir(). Use `
    + 'tempDir(prefix, t) from tools/snowarch/tests/helpers/temp.mjs — it removes the directory when '
    + 'the test ends, passing or failing, and again at exit.');
});

test('every exemption still exempts a site (a dead entry is a decision nobody is reading)', () => {
  const dead = EXEMPT.filter((e) => {
    const source = readFileSync(join(root, e.file), 'utf8');
    return violations(e.file, source, []).filter((s) => s.text.includes(e.needle)).length === 0;
  });
  assert.deepEqual(dead.map((e) => `${e.file}  «${e.needle}»`), [], 'these exemptions match no site');
  for (const e of EXEMPT) {
    assert.ok(e.needle.length > 0, `${e.file}: an empty needle exempts the whole file`);
    assert.ok(e.reason.split(/\s+/).length >= 6, `${e.file}: an exemption without a reason a person could argue with`);
  }
});

test('control — the scan sees every spelling of a bare site and passes the sanctioned ones', () => {
  const planted = (source) => violations('planted.mjs', source, []);

  // BOTH DIRECTIONS (CONTRIBUTING, "Every source scan has the same shape"). Caught:
  assert.equal(planted("const d = mkdtempSync(join(tmpdir(), 'x-'));").length, 2, 'bare mkdtempSync + tmpdir()');
  assert.equal(planted("const d = fs.mkdtempSync(path.join(os.tmpdir(), 'x-'));").length, 2, 'namespace form');
  assert.equal(planted("const d = await mkdtemp(join(os.tmpdir(), 'x-'));").length, 2, 'fs/promises form');
  assert.equal(planted("const d = os?.tmpdir();").length, 1, 'optional call');
  assert.equal(planted("mkdirSync(join(tmpdir(), 'x-fixed'));").length, 1, 'a hand-made root with no mkdtemp at all');
  assert.equal(planted('const d = mkdtempDisposableSync(base);').length, 1, 'the Node 24 disposable form');
  // The same function under another name — a scan for the CALL would see none of these:
  assert.equal(planted("import { mkdtempSync as make } from 'node:fs';").length, 1, 'import alias');
  assert.equal(planted("import { tmpdir as where } from 'node:os';").length, 1, 'tmpdir import alias');
  assert.equal(planted("const { mkdtempSync: make } = await import('node:fs');").length, 1, 'destructure rename');
  assert.equal(planted("const make = fs['mkdtempSync'];").length, 1, 'computed access');
  assert.equal(planted('const make = fs[`mkdtempSync`];').length, 1, 'computed access, template literal');
  assert.equal(planted('const make = fs.mkdtempSync;').length, 1, 'a reference that is stored, not called');
  assert.equal(planted("export { mkdtempSync } from 'node:fs';").length, 1, 're-export');

  // THE SHAPES THAT BLANKED REAL CODE when this scan stripped comments with a regex pair, found by
  // an adversarial review of this very file: a `/*` inside a comment or a string paired with a `*/`
  // far below, and everything between them was never scanned. A syntax tree has no such pairing.
  assert.equal(planted("// matches tests/*.test.mjs\nconst d = mkdtempSync(join(tmpdir(), 'x-'));\n/** doc */\nconst e = 1;").length, 2,
    'a /* inside a line comment');
  assert.equal(planted("const g = 'tests/*.mjs'; const d = mkdtempSync(tmpdir()); const re = /a*/;").length, 2,
    'a /* inside a string');
  assert.equal(planted("const u = 'file:///x'; const d = mkdtempSync(tmpdir());").length, 2, 'a // inside a string');

  // ...and not caught:
  assert.equal(planted("const d = tempDir('x-', t);").length, 0, 'the helper');
  assert.equal(planted("const d = trackTempDir(mkdtempSync(join(parent, 'x-')), t);").length, 0,
    'the helper, wrapping a directory somebody else made');
  assert.equal(planted("const d = trackTempDir(realpathSync(mkdtempSync(join(parent, 'x-'))));").length, 0,
    'the helper, around a realpath');
  assert.equal(planted("const d = trackTempDir(fs.realpathSync.native(await mkdtemp(join(parent, 'x'))), t);").length, 0,
    'the helper, around a namespaced realpath and an await');
  assert.equal(planted("const d = mkdtempSync(join(parent, 'x-')); trackTempDir(d, t);").length, 1,
    'the two-step form is NOT recognised — nothing here follows a variable; wrap it');
  assert.equal(planted("import { mkdtempSync, mkdirSync } from 'node:fs';").length, 0,
    'an unaliased import binds no new name — its USES are the sites');
  assert.equal(planted("const { mkdtempSync, tmpdir } = await import('node:fs');").length, 0, 'an unaliased destructure');
  assert.equal(planted('function f(tmpdir) { return join(tmpdir, "x"); }').length, 0, 'a local called tmpdir');
  assert.equal(planted('const o = { tmpdir: dir, mkdtempSync: 1 };').length, 0, 'property keys');
  assert.equal(planted("const s = 'mkdtempSync(tmpdir())';").length, 0, 'a mention in a string');
  assert.equal(planted('const r = /mkdtemp(Sync)?\\(/;').length, 0, 'a mention in a regex');
  assert.equal(planted('const s = `a ${1} mkdtempSync(tmpdir())`;').length, 0, 'a mention in a template literal');
  assert.equal(planted("// const d = mkdtempSync(join(tmpdir(), 'x-'));").length, 0, 'a line comment');
  assert.equal(planted("/* mkdtempSync(tmpdir()) */ const d = tempDir('x-');").length, 0, 'a block comment');

  // An exemption is matched on the line and is per file, so it cannot reach another file.
  const two = "const a = mkdtempSync(join(tmpdir(), 'ok-'));\nconst b = mkdtempSync(join(tmpdir(), 'bad-'));";
  const exempt = [{ file: 'planted.mjs', needle: "'ok-'", reason: 'a reason long enough to count as one' }];
  assert.deepEqual(violations('planted.mjs', two, exempt).map((v) => v.line), [2, 2],
    'only the exempt line is exempt');
  assert.equal(violations('other.mjs', two, exempt).length, 4, 'and only in the file the exemption names');

  // The line number is the line in the file, whatever comments precede it.
  assert.equal(findSites('/* one\ntwo */\nconst d = mkdtempSync(tmpdir());')[0].line, 3);
  assert.equal(countCalls("tempDir('a'); x.trackTempDir(b); other(c);", ['tempDir', 'trackTempDir']), 2);
});
