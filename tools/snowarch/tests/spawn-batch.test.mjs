import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { BatchArgumentError, batchCommand, comSpec, isBatch, quoteForCmd }
  from '../lib/spawn-batch.mjs';
import { root } from '../lib/config.mjs';

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

test('C67 — no engine module spawns with `shell: true` and an args array', () => {
  /*
   * THE RULE, ASSERTED RATHER THAN REMEMBERED. DEP0190 fires on exactly that combination, and the
   * warning printed on every launcher run — bootstrap, doctor, `mode live`, and three times during
   * an upgrade, once between `Proceed? [Y/n]` and the answer, which is the worst place a stray line
   * can land. A second site would reintroduce it silently, on Windows only, where nobody here looks.
   *
   * Comments are blanked first: this repository's own rule for a source scan, because in a comment a
   * spawn option is the lesson and in code it is the call — and the four times this arc mistook one
   * for the other are in `docs/CONTRIBUTING.md`.
   */
  const files = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.mjs') && statSync(p).size < 2_000_000) files.push(p);
    }
  };
  walk(join(root, 'tools', 'snowarch', 'lib'));
  assert.ok(files.length > 30, `the scan found only ${files.length} files — it is not reading the lib`);

  const offenders = [];
  for (const p of files) {
    const code = readFileSync(p, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
      .replace(/(^|[^:])\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));
    if (/shell:\s*true/.test(code)) offenders.push(p.slice(root.length + 1));
  }
  assert.deepEqual(offenders, [],
    'a module spawns with `shell: true` — use `batchCommand` from spawn-batch.mjs instead');
});
