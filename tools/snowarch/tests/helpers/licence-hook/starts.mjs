// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-11-C6 step 1 — the reader that finds every place a test starts the product.
 *
 * From 2.0.13 a CLI, server or launcher started without a licence it trusts refuses (C6), so a test that
 * starts one gives it a licence through `licensedEnv()` beside this file: the test-only hook, and a fixture
 * licence where the child reads one. This reader finds the starts, and `licence-spawn-class.test.mjs` holds
 * every one of them to the helper.
 *
 * A START is a call to a `node:child_process` function under whatever local name the file imported it as
 * (`spawnSync`, `execFileSync as run`, `cp.spawn` through a namespace), or a `new StdioClientTransport`. A
 * seam's own name is not part of the rule: a harness's `run` is found where it finally calls child_process,
 * which is in a scanned file too.
 *
 * WHAT IT STARTS is read from the command and, when the command is a runner (node, or a shell), from the
 * script it is given; never from the options (a temp directory called `snowarch` is not a launcher), and
 * never from a git or npm call's arguments (`git ls-files snowarch.cmd` starts nothing). Both are followed
 * to their values: `const` and `let` declarations, plain assignments, a `for…of` variable (bound to what it
 * iterates), destructured names, a function's return expressions, and a name imported from a relative
 * module, followed into that module once. A name from a package or a built-in is known and not followed.
 *
 * A start is a PRODUCT START when that value names an entry point: the CLI (`snowarch.mjs`), the server
 * (`server.js`) or a launcher (`snowarch`, `snowarch.cmd`). When the program cannot be followed (a command,
 * or the script node is given, that is a parameter) in a file that names an entry point, it is PRESUMED one:
 * "could not tell" and "nothing here" are different answers, and only the second may pass silently.
 *
 * It is LICENSED when its arguments, followed the same way, call `licensedEnv(`. The hooks (`session-start.mjs`)
 * are not in the class: a hook refuses nothing, and its `Licence:` line is its own suite's assertion.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const CHILD_PROCESS = new Set(['node:child_process', 'child_process']);
const SPAWNERS = new Set(['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']);
const SOURCE = /\.(mjs|js|cjs|ts|mts)$/;
/** A script the call names by its file, wherever its directory is. */
const SCRIPT_FILE = /\.(?:mjs|cjs|js|ts|cmd|bat|sh|ps1|py)$/;
/** References that are not bindings and say nothing about what is started. */
const GLOBALS = new Set(['process', 'JSON', 'String', 'Object', 'Array', 'Number', 'Boolean', 'Buffer', 'URL',
  'Math', 'Date', 'console', 'undefined', 'globalThis', 'Error', 'RegExp', 'Promise', 'Map', 'Set', 'Symbol', 'require']);
/** node and the shells: the program they run is their first argument that is not a flag. */
const RUNNER = /process\.execPath|COMSPEC|(['"`])(?:node|node\.exe|sh|bash|\/bin\/sh|\/bin\/bash|cmd|cmd\.exe|pwsh|pwsh\.exe|powershell|powershell\.exe)\1/;
const LAUNCHER = /^(?:\.[\\/]|\$\{[^}]*\}[\\/])?snowarch(?:\.cmd)?(?:\s|$)/;

/** The entry points a string value IS: a path ending in the CLI or the server, or the launcher's spellings. */
export function entryPointsOf(value) {
  const v = value.trim();
  return [/(?:^|[\\/])snowarch\.mjs(?:\s|$)/.test(v) && 'cli', /(?:^|[\\/])server\.js(?:\s|$)/.test(v) && 'server',
    LAUNCHER.test(v) && 'launcher'].filter(Boolean);
}

/** The entry points a piece of code names anywhere in it — `-e` code that imports the CLI. */
export function entryPointsIn(code) {
  return [/snowarch\.mjs\b/.test(code) && 'cli', /\bserver\.js\b/.test(code) && 'server'].filter(Boolean);
}

/** Every source file under `roots`, outside `node_modules`; declaration files are not code. */
function sources(roots) {
  const files = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (SOURCE.test(e.name) && !/\.d\.m?ts$/.test(e.name) && statSync(p).size < 2_000_000) files.push(p);
    }
  };
  for (const r of roots) if (existsSync(r)) walk(r);
  return files.sort();
}

/**
 * `{ starts, unresolved, files }`.
 * - `starts`: every product start, as `{ file, line, entry, licensed }`, where `entry` is what it names
 *   (`cli`, `server`, `launcher`, joined with `+`) or `presumed`.
 * - `unresolved`: files that reach `child_process` in a way the reader does not follow (a `require`, a
 *   dynamic `import()`), as `path: why`. Reported, never passed.
 * - `files`: how many files were read.
 *
 * `read`, `exists` and `files` are parameters so a planted source can be fed to the same reader the
 * repository is.
 */
export async function scanProductStarts({ roots = [], base = process.cwd(), read = (f) => readFileSync(f, 'utf8'),
  exists = (f) => existsSync(f) && statSync(f).isFile(), files: given } = {}) {
  const ts = (await import('typescript')).default;
  const parsed = new Map();

  const bindName = (name, node, add) => {
    if (ts.isIdentifier(name)) add(name.text, node);
    else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
      for (const el of name.elements) if (!ts.isOmittedExpression(el)) bindName(el.name, node, add);
    }
  };

  const parse = (file) => {
    if (parsed.has(file)) return parsed.get(file);
    const src = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
    const p = { src, bindings: new Map(), imports: new Map(), spawners: new Set(), namespaces: new Set(), transport: null,
      dynamic: null };
    const add = (name, node) => p.bindings.set(name, [...(p.bindings.get(name) ?? []), node]);
    const loaded = new Set();
    const visit = (node) => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const spec = node.moduleSpecifier.text;
        const clause = node.importClause;
        const named = clause?.namedBindings;
        if (CHILD_PROCESS.has(spec)) {
          if (named && ts.isNamespaceImport(named)) p.namespaces.add(named.name.text);
          if (named && ts.isNamedImports(named)) {
            for (const el of named.elements) if (SPAWNERS.has((el.propertyName ?? el.name).text)) p.spawners.add(el.name.text);
          }
          if (clause?.name) p.namespaces.add(clause.name.text);
        } else {
          if (clause?.name) p.imports.set(clause.name.text, { spec, imported: 'default' });
          if (named && ts.isNamespaceImport(named)) p.imports.set(named.name.text, { spec, imported: '*' });
          if (named && ts.isNamedImports(named)) {
            for (const el of named.elements) {
              const imported = (el.propertyName ?? el.name).text;
              if (imported === 'StdioClientTransport') p.transport = el.name.text;
              p.imports.set(el.name.text, { spec, imported });
            }
          }
        }
      }
      if (ts.isCallExpression(node) && node.arguments[0] && ts.isStringLiteral(node.arguments[0])
        && CHILD_PROCESS.has(node.arguments[0].text) && !loaded.has(node)) {
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword) p.dynamic = 'a dynamic import of child_process';
        if (ts.isIdentifier(node.expression) && node.expression.text === 'require') p.dynamic = 'a require of child_process';
      }
      // `const { execFileSync } = await import('node:child_process')`, and the same with `require`: followed.
      if (ts.isVariableDeclaration(node) && node.initializer) {
        let init = node.initializer;
        if (ts.isAwaitExpression(init)) init = init.expression;
        const loads = ts.isCallExpression(init) && init.arguments[0] && ts.isStringLiteral(init.arguments[0])
          && CHILD_PROCESS.has(init.arguments[0].text)
          && (init.expression.kind === ts.SyntaxKind.ImportKeyword
            || (ts.isIdentifier(init.expression) && init.expression.text === 'require'));
        if (loads) {
          loaded.add(init);
          if (ts.isIdentifier(node.name)) p.namespaces.add(node.name.text);
          if (ts.isObjectBindingPattern(node.name)) {
            for (const el of node.name.elements) {
              const imported = (el.propertyName ?? el.name).getText();
              if (SPAWNERS.has(imported) && ts.isIdentifier(el.name)) p.spawners.add(el.name.text);
            }
          }
        }
      }
      if (ts.isVariableDeclaration(node) && node.initializer) bindName(node.name, node.initializer, add);
      if (ts.isForOfStatement(node) && ts.isVariableDeclarationList(node.initializer)) {
        for (const d of node.initializer.declarations) bindName(d.name, node.expression, add);
      }
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(node.left)) {
        add(node.left.text, node.right);
      }
      if (ts.isFunctionDeclaration(node) && node.name && node.body) add(node.name.text, node);
      ts.forEachChild(node, visit);
    };
    visit(src);
    parsed.set(file, p);
    return p;
  };

  /** Where `name` is bound, seen from `file`: here, or in the relative module it was imported from, once. */
  const lookup = (file, name, hopped) => {
    const p = parse(file);
    if (p.bindings.has(name)) return { file, nodes: p.bindings.get(name), hopped };
    const imp = p.imports.get(name);
    if (imp && !imp.spec.startsWith('.')) return { file, nodes: [], hopped };
    if (!imp || hopped) return null;
    const target = [imp.spec, imp.spec.replace(/\.js$/, '.ts'), imp.spec.replace(/\.mjs$/, '.mts')]
      .map((s) => resolve(dirname(file), s)).find((f) => exists(f));
    if (!target) return null;
    return lookup(target, imp.imported, true);
  };

  const isFunction = (n) => ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n);

  /** A function's value is what it returns: a concise body, or each `return`'s expression. */
  const valueNodes = (node) => {
    if (!isFunction(node)) return [node];
    if (node.body && !ts.isBlock(node.body)) return [node.body];
    const out = [];
    const walk = (n) => {
      if (n !== node.body && (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n))) return;
      if (ts.isReturnStatement(n) && n.expression) out.push(n.expression);
      ts.forEachChild(n, walk);
    };
    if (node.body) walk(node.body);
    return out;
  };

  /** The identifiers in `node` that are references: not property names, not a member's name, not a parameter. */
  const references = (node) => {
    const out = new Set();
    const local = new Set();
    const walk = (n) => {
      if (ts.isParameter(n)) bindName(n.name, n, (name) => local.add(name));
      if (ts.isIdentifier(n)) {
        const parent = n.parent;
        const isName = (ts.isPropertyAssignment(parent) && parent.name === n)
          || (ts.isPropertyAccessExpression(parent) && parent.name === n)
          || (ts.isMethodDeclaration(parent) && parent.name === n)
          || (ts.isBindingElement(parent) && parent.propertyName === n)
          || ts.isParameter(parent);
        if (!isName) out.add(n.text);
      }
      ts.forEachChild(n, walk);
    };
    walk(node);
    return [...out].filter((n) => !local.has(n) && !GLOBALS.has(n));
  };

  /** The string values a node can take, followed through its references; and the references that led nowhere. */
  const expand = (file, node, seen = new Set(), hopped = false, depth = 0) => {
    const values = [];
    const lost = [];
    let text = '';
    for (const v of valueNodes(node)) {
      text += `\n${v.getText()}`;
      const lits = (n) => {
        if (ts.isStringLiteralLike(n)) values.push(n.text);
        if (ts.isTemplateExpression(n)) values.push(n.getText().slice(1, -1));
        // A path is named by its last segment: `join(root, 'tools', 'snowarch', 'tests')` is not the launcher.
        if (ts.isCallExpression(n) && /(?:^|\.)(?:join|resolve)$/.test(n.expression.getText()) && n.arguments.length) {
          lits(n.arguments[n.arguments.length - 1]);
          return;
        }
        ts.forEachChild(n, lits);
      };
      lits(v);
      for (const name of references(v)) {
        const key = `${file}#${name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const found = lookup(file, name, hopped);
        if (!found) { lost.push(name); continue; }
        if (depth >= 8) continue;
        for (const n of found.nodes) {
          const sub = expand(found.file, n, seen, found.hopped, depth + 1);
          values.push(...sub.values);
          // What a helper's body could not follow is the helper's business: only a reference on the value's own
          // chain, such as a seam's parameter, leaves the program unknown.
          if (!isFunction(n)) lost.push(...sub.lost);
          text += sub.text;
        }
      }
    }
    return { values, lost, text };
  };

  const names = (values) => [...new Set(values.flatMap(entryPointsOf))];

  /** The array literal a node is, or is bound to: `[CLI, ...args]`, or `ARGS` where `const ARGS = [...]`. */
  const arrayOf = (file, node, hopped = false) => {
    if (ts.isArrayLiteralExpression(node)) return { file, node };
    if (ts.isIdentifier(node)) {
      const found = lookup(file, node.text, hopped);
      const only = found?.nodes.length === 1 ? found.nodes[0] : null;
      return only ? arrayOf(found.file, only, found.hopped) : null;
    }
    return null;
  };

  /**
   * The program a runner is given, as `{ named, unknown }`: its first argument that is not a flag (`-e` and `-p`
   * code included, read as text). `named` is the entry points it names; `unknown` when it does not follow to a
   * value: a parameter, or arguments the reader cannot see into.
   */
  const scriptOf = (file, args) => {
    const arr = arrayOf(file, args);
    if (!arr) {
      const e = expand(file, args);
      return { named: names(e.values), unknown: e.lost.length > 0 };
    }
    let code = false;
    for (const el of arr.node.elements) {
      const expr = ts.isSpreadElement(el) ? el.expression : el;
      if (!code && ts.isStringLiteralLike(expr)) {
        // `node --test` starts the test runner; the test files' own starts are read where they are written.
        if (/^--test(?:=|$)/.test(expr.text)) return { named: [], unknown: false };
        if (/^-(e|p|-eval|-print)$/.test(expr.text)) { code = true; continue; }
        if (expr.text.startsWith('-') || /^\/[cds]$/i.test(expr.text)) continue;
      }
      const e = expand(arr.file, expr);
      // Code is read for what it names anywhere in it; a script, by what its path ends in.
      const named = code ? [...new Set(e.values.flatMap((v) => entryPointsIn(v)))] : names(e.values);
      const known = code || e.values.some((v) => SCRIPT_FILE.test(v.trim()));
      return { named, unknown: !named.length && !known && e.lost.length > 0 };
    }
    return { named: [], unknown: false };
  };

  /** `x.file` and `x.args` where `x = spawnFor(cmd, args)`: the command and the arguments it was given. */
  const unwrapSpawnFor = (file, node) => {
    if (!ts.isPropertyAccessExpression(node) || !ts.isIdentifier(node.expression)) return null;
    const found = lookup(file, node.expression.text, false);
    const call = found?.nodes.length === 1 ? found.nodes[0] : null;
    if (!call || !ts.isCallExpression(call) || !/(?:^|\.)spawnFor$/.test(call.expression.getText())) return null;
    return { file: found.file, cmd: call.arguments[0] ?? null, args: call.arguments[1] ?? null };
  };

  /** What a start starts: the entry points it names, `presumed`, or `null` for a program that is not the product. */
  const classify = (file, node, fileNames) => {
    let cmd = node.arguments?.[0];
    let args = node.arguments?.[1] && !ts.isObjectLiteralExpression(node.arguments[1]) ? node.arguments[1] : null;
    if (ts.isNewExpression(node) && cmd && ts.isObjectLiteralExpression(cmd)) {
      const prop = (k) => cmd.properties.find((pr) => ts.isPropertyAssignment(pr) && pr.name.getText() === k)?.initializer
        ?? cmd.properties.find((pr) => ts.isShorthandPropertyAssignment(pr) && pr.name.text === k)?.name ?? null;
      [cmd, args] = [prop('command'), prop('args')];
    }
    if (!cmd) return fileNames ? 'presumed' : null;
    let at = file;
    const wrapped = unwrapSpawnFor(file, cmd);
    if (wrapped?.cmd) ({ file: at, cmd, args } = wrapped);
    const c = expand(at, cmd);
    const named = names(c.values);
    if (named.length) return named.join('+');
    if (!RUNNER.test(c.text)) return fileNames && c.lost.length ? 'presumed' : null;
    if (!args) return null;
    const s = scriptOf(at, args);
    if (s.named.length) return s.named.join('+');
    return fileNames && s.unknown ? 'presumed' : null;
  };

  /**
   * The reason a start is declared not to go through `licensedEnv`, or `null`: a `// unlicensed start: <why>`
   * comment on one of the two lines above the line the start is on. It is for a start that must stay bare,
   * such as the spike's measurement of the hook itself, or a seam that only ever starts something else.
   */
  const declaration = (src, line) => {
    const lines = src.getFullText().split('\n');
    for (const l of lines.slice(Math.max(0, line - 3), line - 1).reverse()) {
      const m = /\/\/ unlicensed start: (.+)$/.exec(l);
      if (m) return m[1].trim();
    }
    return null;
  };

  const starts = [];
  const unresolved = [];
  const files = given ?? sources(roots);
  for (const file of files) {
    const p = parse(file);
    if (p.dynamic) unresolved.push(`${relative(base, file)}: ${p.dynamic}`);
    if (!p.spawners.size && !p.namespaces.size && !p.transport) continue;
    const fileNames = names(expand(file, p.src).values).length > 0;
    const visit = (node) => {
      let isStart = false;
      if (ts.isCallExpression(node)) {
        const c = node.expression;
        if (ts.isIdentifier(c) && p.spawners.has(c.text)) isStart = true;
        if (ts.isPropertyAccessExpression(c) && ts.isIdentifier(c.expression) && p.namespaces.has(c.expression.text)
          && SPAWNERS.has(c.name.text)) isStart = true;
      }
      if (ts.isNewExpression(node) && p.transport && ts.isIdentifier(node.expression) && node.expression.text === p.transport) {
        isStart = true;
      }
      if (isStart) {
        const entry = classify(file, node, fileNames);
        if (entry) {
          const licensed = (node.arguments ?? []).some((a) => /\blicensedEnv\(/.test(expand(file, a).text));
          const line = p.src.getLineAndCharacterOfPosition(node.getStart()).line + 1;
          starts.push({ file: relative(base, file), line, entry, licensed, declared: declaration(p.src, line) });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(p.src);
  }
  return { starts, unresolved, files: files.length };
}
