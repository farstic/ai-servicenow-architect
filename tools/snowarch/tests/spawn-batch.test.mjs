import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BatchArgumentError, batchCommand, comSpec, isBatch, quoteForCmd }
  from '../lib/spawn-batch.mjs';
import { root } from '../lib/config.mjs';
import { scanSpawnShapes } from './helpers/spawn-scan.mjs';
import { tempDir } from './helpers/temp.mjs';

/**
 * ARC-09-C67/C68 — the quoting, and the rule that no caller reintroduces `shell: true` with args.
 *
 * Every case here is about a command LINE rather than a spawned process: a `.cmd` cannot run on the
 * POSIX machines this suite mostly runs on, and the thing that was wrong on Windows was the string.
 */

test('C67 — a path with a space is one quoted token, and the outer quotes are cmd\'s', () => {
  const bin = 'C:\\Program Files\\nodejs\\npm.cmd';
  const call = batchCommand(bin, ['--version'], { env: { ComSpec: 'C:\\Windows\\system32\\cmd.exe' } });

  assert.equal(call.file, 'C:\\Windows\\system32\\cmd.exe');
  // The inner quotes are LITERAL, and that is the point of `/s`: cmd strips exactly the first and last
  // quote of the whole string and runs the remainder — `"C:\Program Files\nodejs\npm.cmd" --version`
  // — so the path's own quotes are what make it one token. CRT-style `\\"` escaping here would be a
  // layer too many: that is the rules the TARGET program applies, not the ones cmd does.
  assert.deepEqual(call.args, ['/d', '/s', '/c', `""${bin}" --version"`]);
  assert.equal(call.args[3].slice(1, -1), `"${bin}" --version`,
    'stripping cmd\'s outer pair must leave a runnable command line');
  // `/d` is not decoration: without it a machine with a `Command Processor\AutoRun` value in the
  // registry runs that command inside every check this helper drives.
  assert.equal(call.args[0], '/d');
  assert.equal(call.options.windowsVerbatimArguments, true);
  assert.equal(call.options.shell, undefined, 'DEP0190 is the whole reason this helper exists');
});

test('C67 — ComSpec is honoured, because that is what Windows itself reads', () => {
  assert.equal(comSpec({ ComSpec: 'D:\\alt\\cmd.exe' }), 'D:\\alt\\cmd.exe');
  assert.equal(comSpec({ COMSPEC: 'D:\\alt\\cmd.exe' }), 'D:\\alt\\cmd.exe');
  assert.equal(comSpec({}), 'cmd.exe', 'a machine with no ComSpec still gets a command processor');
});

test('C67 — the CRT\'s quoting rules, including the cases a Windows path actually produces', () => {
  assert.equal(quoteForCmd('--version'), '--version', 'a plain token is not quoted for no reason');
  assert.equal(quoteForCmd(''), '""', 'an empty argument must survive as an argument');
  assert.equal(quoteForCmd('C:\\Users\\Иван\\npm.cmd'), 'C:\\Users\\Иван\\npm.cmd',
    'a non-ASCII path needs no quoting — the colleague\'s profile path is Cyrillic');
  assert.equal(quoteForCmd('C:\\Program Files\\x'), '"C:\\Program Files\\x"');
  // A trailing backslash would otherwise escape the closing quote and swallow it.
  assert.equal(quoteForCmd('C:\\Program Files\\'), '"C:\\Program Files\\\\"');
  assert.equal(quoteForCmd('a"b'), '"a\\"b"');
});

test('C67 — a `%` is refused with a sentence, never passed and silently expanded', () => {
  /*
   * cmd expands `%NAME%` even inside double quotes, and there is no command-line escape for it
   * (`%%` is a batch-FILE rule). A path containing `%` is legal on Windows and rare. The choice is
   * between a sentence saying we will not run it and a command that quietly differs from the one
   * asked for, and for a diagnostic tool the sentence is the only defensible half.
   */
  assert.throws(() => quoteForCmd('C:\\odd%name\\npm.cmd'), BatchArgumentError);
  assert.throws(() => batchCommand('C:\\x\\npm.cmd', ['%PATH%']), BatchArgumentError);
  try {
    quoteForCmd('C:\\50%\\npm.cmd');
    assert.fail('no refusal');
  } catch (e) {
    assert.match(e.message, /expanded by the command processor/, 'the refusal must say WHY');
    assert.equal(e.token, 'C:\\50%\\npm.cmd', 'and which argument it was about');
  }
});

test('C67 — only a .cmd or .bat is a batch file', () => {
  for (const f of ['npm.cmd', 'npm.CMD', 'x.bat', 'x.BAT']) assert.equal(isBatch(f), true, f);
  for (const f of ['git.exe', 'node', '/usr/bin/npm', 'x.cmd.exe']) assert.equal(isBatch(f), false, f);
});

test('C69/C70 — nothing in this repository spawns with an args array AND a shell', async (t) => {
  const { offenders, unresolved, files } = await scanSpawnShapes({
    roots: ['tools/snowarch/lib', 'tools/snowarch/tests', 'tests', 'scripts'].map((d) => join(root, d)),
  });
  assert.ok(files > 150, `the reader saw only ${files} files — it is not reading the repository`);
  assert.deepEqual(offenders.map((o) => o.slice(root.length + 1)), [],
    'a spawn passes an args array with a shell (DEP0190) — use `spawnFor` from spawn-batch.mjs');
  /*
   * A spread the reader could not follow is REPORTED rather than assumed clean — "could not tell" and
   * "nothing here" being one value is the defect this programme keeps finding. It is a DIAGNOSTIC and not
   * an assertion, and the reason is measured: of the 40, most are `...opts` / `...options` where the name
   * is a function PARAMETER, so the object belongs to the caller and one hop cannot reach it, and the
   * rest are `...call.options` where `call` came from `spawnFor(…)` — a call, not a literal, so nothing
   * static can say what is in it. Asserting zero would be asserting that no wrapper forwards its options
   * and that nobody spreads a helper's return, neither of which is true or desirable.
   *
   * What the hard rule above DOES cover is the shape the architect's control caught the reader missing:
   * an options object written as a literal in the same file and spread in.
   */
  t.diagnostic(`spreads the reader could not follow one hop: ${unresolved.length}`);
});

test('C69/C70 — the reader catches both spellings of the defect, and neither false-positives', async (t) => {
  /*
   * THE PLANTED FIXTURE GOES THROUGH THE REAL READER, which is the whole point of `spawn-scan.mjs`
   * being a module. The previous version of this case re-implemented the walk over a string, so a
   * degradation of the reader left the case green — a copy, not a proof.
   *
   * Both spellings are here because the architect's control found the second one: options assembled
   * elsewhere and spread in were not flagged while the same defect written inline was, and the spread is
   * how `test-all.mjs`, the harnesses and `makeGateRunner` all pass options.
   */
  const dir = tempDir('spawn-scan-', t);
  writeFileSync(join(dir, 'planted.mjs'), [
    "import { spawnSync } from 'node:child_process';",
    "// 1. inline — the shape C67 removed from the product",
    "spawnSync('npm.cmd', ['run', 'x'], { shell: true });",
    "// 2. assembled elsewhere and spread in — the shape the architect's control found",
    "const call = { file: 'npm.cmd', args: ['test'], options: { shell: true } };",
    "spawnSync(call.file, call.args, { cwd: '.', ...call.options });",
    "// 3. a bare identifier spread, the other way this gets written",
    "const opts = { shell: process.platform === 'win32' };",
    "spawnSync('npm.cmd', ['ci'], { cwd: '.', ...opts });",
    "// 4. NOT the defect: one command string with a shell — no args array to leave unescaped",
    "spawnSync('a-command --with args', { shell: true });",
    "// 5. NOT the defect: a spread carrying no shell at all",
    "const clean = { options: { windowsVerbatimArguments: true } };",
    "spawnSync('cmd.exe', ['/d', '/s', '/c', 'x'], { ...clean.options });",
    "// 6. NOT the defect: an explicit false",
    "spawnSync('node', ['x.mjs'], { shell: false });",
  ].join('\n'));

  const { offenders } = await scanSpawnShapes({ roots: [dir] });
  assert.deepEqual(offenders.map((o) => o.slice(dir.length + 1)),
    ['planted.mjs:3', 'planted.mjs:6', 'planted.mjs:9'],
    'the reader must catch the inline and both spread spellings, and flag none of the three that are fine');
});
