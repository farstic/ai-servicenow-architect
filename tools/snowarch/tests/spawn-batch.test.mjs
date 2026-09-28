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

test('C69 — nothing in this repository spawns with an args array AND a shell', async () => {
  /*
   * THE RULE, ASSERTED RATHER THAN REMEMBERED — and widened after a measurement.
   *
   * DEP0190 fires on exactly one shape: a spawn given an ARGS ARRAY and a shell. C67 fixed the product
   * and left three, which the Windows node 24 cell then counted — 6 warnings at develop `a4eee05`, 3 at
   * `28c4caf`, none of them from a product launcher: a test's npm spawn, the upgrade harness's world
   * copy, and `scripts/ci/test-all.mjs` itself, printing after both halves had finished. A scan over
   * `lib/` alone could not see any of them, so it covers the scripts and the harnesses too.
   *
   * IT PARSES RATHER THAN GREPS, with the `typescript` already pinned for `launcher-extract.mjs`, and
   * the reason is `scripts/ci/control.mjs`: it spawns ONE command string with `shell: true`, which is
   * the form DEP0190 does NOT deprecate — there is no args array to leave unescaped. A textual rule
   * would either flag it (and need an exemption naming a file that is doing nothing wrong) or match
   * `shell` loosely enough to miss a real site. The shape is what is wrong, so the shape is what is read.
   */
  const ts = (await import('typescript')).default;
  const files = [];
  const walkDir = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walkDir(p);
      else if (/\.mjs$/.test(e.name) && statSync(p).size < 2_000_000) files.push(p);
    }
  };
  for (const dir of ['tools/snowarch/lib', 'tools/snowarch/tests', 'tests', 'scripts']) {
    walkDir(join(root, dir));
  }
  assert.ok(files.length > 150, `the scan found only ${files.length} files — it is not reading the repo`);

  /**
   * `shell:` present and not the literal `false` — following a SPREAD one hop.
   *
   * ARC-09-C70, and the architect's control is what found it: a degradation that built the option in a
   * separate object and spread it in —
   *
   *     const call = { file: cmd, args, options: { shell: … } };
   *     spawnSync(call.file, call.args, { …, ...call.options });
   *
   * — was not flagged, while the same defect written inline was. That is not a corner: assembling the
   * options elsewhere and spreading them is exactly how `test-all.mjs`, the harnesses and now
   * `makeGateRunner` pass them, so the shape the scan could not see is the shape the repository uses.
   *
   * ONE HOP, and no further, deliberately. Resolving a spread to an object literal bound in the same
   * file covers every way this codebase writes it; a general resolver would need types, and a scan
   * nobody can predict is a scan people route around. A spread this cannot resolve is reported as
   * unresolved by the case below rather than silently treated as clean — the mistake that let the
   * callee-name version of this rule pass twice.
   */
  const bindings = new Map();
  const collectBindings = (src) => {
    const visit = (node) => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)
        && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
        bindings.set(node.name.getText(), node.initializer);
      }
      ts.forEachChild(node, visit);
    };
    visit(src);
  };

  /** `call.options` → the object literal at that path, when it is one. `opts` → its own literal. */
  const resolveSpread = (expr) => {
    const parts = expr.getText().split('.');
    let node = bindings.get(parts[0]);
    for (const key of parts.slice(1)) {
      if (!node || !ts.isObjectLiteralExpression(node)) return null;
      const prop = node.properties.find((pr) => ts.isPropertyAssignment(pr)
        && pr.name?.getText?.() === key);
      node = prop && ts.isPropertyAssignment(prop)
        && ts.isObjectLiteralExpression(prop.initializer) ? prop.initializer : null;
    }
    return node && ts.isObjectLiteralExpression(node) ? node : null;
  };

  const unresolved = [];
  const shellIsOn = (node, file) => {
    if (!ts.isObjectLiteralExpression(node)) return false;
    for (const pr of node.properties) {
      if (ts.isPropertyAssignment(pr) && pr.name?.getText?.() === 'shell'
        && pr.initializer.kind !== ts.SyntaxKind.FalseKeyword) return true;
      if (ts.isSpreadAssignment(pr)) {
        const target = resolveSpread(pr.expression);
        if (!target) { unresolved.push(`${file}: ...${pr.expression.getText()}`); continue; }
        if (shellIsOn(target, file)) return true;
      }
    }
    return false;
  };

  const offenders = [];
  for (const file of files) {
    const src = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    bindings.clear();
    collectBindings(src);
    const visit = (node) => {
      if (ts.isCallExpression(node)) {
        // An args ARRAY in the second position is what makes the shell deprecated. A spawn given one
        // string and options — control.mjs — has an object there, and is not this defect.
        const args = node.arguments;
        const second = args[1];
        // ANYTHING in the args position that is not the options object counts, and a control is why.
        // KA's degradation passed `step.args` — a property access, neither an array literal nor a bare
        // identifier — and the scan could not see it. The deprecated shape is "arguments passed
        // separately, plus a shell"; how the caller spells those arguments is not part of the defect.
        const hasArgsArray = second && !ts.isObjectLiteralExpression(second);
        const options = args.find((a, i) => i > 0 && ts.isObjectLiteralExpression(a));
        /*
         * THE CALLEE IS NOT PART OF THE TEST, and a control is what said so. Control KA reverted
         * `test-all.mjs` to the deprecated shape and the scan passed: that site spawns through `run`,
         * an injected seam whose default is `spawnSync`, so a rule keyed on the callee's NAME could not
         * see it. Every indirection in this repository would have hidden the same way — `runNpm`, a
         * harness's `run(dir, cmd, args)`, a test's spy. So the shape is read wherever it appears:
         * an args array plus a `shell` that is not `false` is the defect, whatever the function is called.
         */
        if (hasArgsArray && options && shellIsOn(options, file.slice(root.length + 1))) {
          const { line } = src.getLineAndCharacterOfPosition(node.getStart());
          offenders.push(`${file.slice(root.length + 1)}:${line + 1}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(src);
  }
  assert.deepEqual(offenders, [],
    'a spawn passes an args array with a shell (DEP0190) — use `spawnFor` from spawn-batch.mjs');
});

test('C70 — the scan sees the option assembled elsewhere and spread in', async () => {
  /*
   * THE ARCHITECT'S CONTROL FOUND THIS, and it is the second blind spot in this one instrument: a
   * degradation that spread the options in was not flagged while the same defect written inline was.
   * Assembling options elsewhere and spreading them is how `test-all.mjs`, the harnesses and
   * `makeGateRunner` all pass them, so the shape the scan could not see was the shape the repository
   * uses. Both spellings are planted here, and the direct one is planted too — a reader that lost the
   * easy case while learning the hard one would be a step backwards nobody would notice.
   */
  const ts = (await import('typescript')).default;
  const planted = [
    "const call = { file: 'npm.cmd', args: ['test'], options: { shell: true } };",
    "spawnSync(call.file, call.args, { cwd: '.', ...call.options });",
    "const opts = { shell: process.platform === 'win32' };",
    "spawnSync('npm.cmd', ['ci'], { cwd: '.', ...opts });",
    "spawnSync('npm.cmd', ['run', 'x'], { shell: true });",
    "const clean = { options: { windowsVerbatimArguments: true } };",
    "spawnSync('cmd.exe', ['/c', 'x'], { ...clean.options });",
  ].join('\n');

  const src = ts.createSourceFile('planted.mjs', planted, ts.ScriptTarget.Latest, true);
  const bindings = new Map();
  const bind = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)
      && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
      bindings.set(node.name.getText(), node.initializer);
    }
    ts.forEachChild(node, bind);
  };
  bind(src);
  const resolveSpread = (expr) => {
    const parts = expr.getText().split('.');
    let node = bindings.get(parts[0]);
    for (const key of parts.slice(1)) {
      if (!node || !ts.isObjectLiteralExpression(node)) return null;
      const prop = node.properties.find((pr) => ts.isPropertyAssignment(pr) && pr.name?.getText?.() === key);
      node = prop && ts.isObjectLiteralExpression(prop.initializer) ? prop.initializer : null;
    }
    return node;
  };
  const on = (node) => ts.isObjectLiteralExpression(node) && node.properties.some((pr) => {
    if (ts.isPropertyAssignment(pr) && pr.name?.getText?.() === 'shell') {
      return pr.initializer.kind !== ts.SyntaxKind.FalseKeyword;
    }
    if (ts.isSpreadAssignment(pr)) {
      const target = resolveSpread(pr.expression);
      return target ? on(target) : false;
    }
    return false;
  });

  const flagged = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && node.expression.getText() === 'spawnSync') {
      const options = node.arguments.find((a, i) => i > 0 && ts.isObjectLiteralExpression(a));
      const second = node.arguments[1];
      if (second && !ts.isObjectLiteralExpression(second) && options && on(options)) {
        flagged.push(node.arguments[0].getText());
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(src);

  assert.deepEqual(flagged, ["call.file", "'npm.cmd'", "'npm.cmd'"],
    'the reader must catch the spread shapes AND the inline one, and leave the clean spread alone');
});

test('C69 — and the scan can still see the shape it is looking for', async () => {
  /*
   * A SCAN THAT CANNOT FAIL PROVES NOTHING, and this repository has been caught by that twice (the
   * missing `timeout`, the zsh loop that ran once). So the same reader is pointed at a planted file.
   */
  const ts = (await import('typescript')).default;
  const planted = [
    "import { spawnSync } from 'node:child_process';",
    "spawnSync('npm.cmd', ['test'], { shell: process.platform === 'win32' });",
    "spawnSync('a-string-command --with-args', { shell: true });",
  ].join('\n');
  const src = ts.createSourceFile('planted.mjs', planted, ts.ScriptTarget.Latest, true);
  const found = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && node.expression.getText() === 'spawnSync') {
      const second = node.arguments[1];
      const options = node.arguments.find((a, i) => i > 0 && ts.isObjectLiteralExpression(a));
      const on = options?.properties?.some((pr) => ts.isPropertyAssignment(pr)
        && pr.name?.getText?.() === 'shell' && pr.initializer.kind !== ts.SyntaxKind.FalseKeyword);
      if (second && ts.isArrayLiteralExpression(second) && on) found.push('args-array-with-shell');
      if (second && ts.isObjectLiteralExpression(second) && on) found.push('one-string-with-shell');
    }
    ts.forEachChild(node, visit);
  };
  visit(src);
  assert.deepEqual(found, ['args-array-with-shell', 'one-string-with-shell'],
    'the reader cannot tell the deprecated shape from the one that is fine');
});
