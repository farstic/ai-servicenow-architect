// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-11-C6 step 8 — the reader that finds every way a shipped module could take a key, and holds each to
 * PRODUCT_KEYS.
 *
 * A licence or a revocation list is trusted when it verifies against a key in the list the build ships, so a
 * shipped module that took a key from the environment, argv, `NODE_OPTIONS` or a path would be a switch: copy
 * a key in, and a licence signed with its private half is in force. The test helper's module hook (shape A)
 * substitutes the keys module for a test run and is the only way a key other than the shipped two reaches a
 * process; this reader holds the shipped tree to that. `licence-key-sources.test.mjs` runs it on the step-3
 * universe (the server's build, the CLI's library and entry point, and the hooks), and on planted sources.
 *
 * WHAT IT FOLLOWS, by binding and never by name, so a function that merely shares a name is not confused with
 * one that takes keys:
 * - THE SINK: node:crypto's `verify`, under any local name. Its key must be `createPublicKey(<entry>.publicKey)`,
 *   where the entry is found in a key list (`<list>.find(…)`, or a `for…of` over it).
 * - THE SLOTS a key list is handed through:
 *   - a parameter named `keys`, positional or a destructured option: its default;
 *   - a call to a function with a positional `keys` parameter, resolved through local declarations, imports and
 *     re-exports: the argument at that index. Such a function is only ever called directly: one that escapes as a
 *     value, into a table say, is a violation, because its callers could not all be held;
 *   - a call to a function that takes `keys` as an option, itself or by handing its own options on (worked out
 *     to a fixpoint, so `startLicence` counts): the object's `keys` property, any spread into it, or, when the
 *     object is not a literal, its `keys` field followed to the object's binding;
 *   - a call whose callee the reader cannot resolve, such as the licence command's table of subcommands: the
 *     `keys` property of any object literal it is handed.
 * - WHAT A SLOT MAY HOLD: PRODUCT_KEYS imported from a keys module; a `keys` parameter, whose own callers are
 *   held by the rules above; the test seams, `<ctx>.licenceKeys` read off a parameter and a `licenceKeys`
 *   parameter, which no shipped file fills; a `.keys` field of an object whose every assignment holds one of
 *   these; `??`, `||` and `?:` over them; a spread of one into an array; and `.map`, `.filter`, `.find` or
 *   `.slice` on one, with a callback that reads nothing but its own parameters. Anything else is a VIOLATION: a
 *   call, `process`, a file read, a literal key, a parameter whose callers the reader cannot see.
 * - A DECLARED SITE: a slot that holds anything else may carry `// owner key from path: <why>` on one of the two
 *   lines above it. The owner's `licence revoke` is the one: it verifies the owner's own list file with the key
 *   it is about to sign with, which no licensee's state ever reads. The test holds the count to exactly 1 (the
 *   architect's ruling, 2026-10-12): an exclusion by command name would hide a second site.
 *
 * AND FOUR CLASS RULES that need no flow:
 * - the keys modules are constant leaves: one exported `Object.freeze([…])` of `Object.freeze({ role,
 *   fingerprint, publicKey })` string literals, importing nothing;
 * - one list per side: no other file declares PRODUCT_KEYS, imports it from anywhere but a keys module, or
 *   carries public-key armour;
 * - no shipped file names `NODE_OPTIONS`: it is the test hook's channel, and nothing shipped reads it;
 * - no shipped file reaches node:module's `register`, the API the test hook is installed through.
 *
 * `read` and `files` are parameters, so a planted source is fed to the same reader the repository is.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, posix, relative } from 'node:path';

/** The step-3 universe: what the product ships. */
export const SHIPPED = Object.freeze(['packages/snowarch/dist', 'tools/snowarch/lib', 'tools/snowarch/bin',
  'tools/snowarch/hooks']);
/** The two shipped keys modules: the server's build and the CLI's library. */
export const KEYS_MODULES = Object.freeze(['packages/snowarch/dist/licence/keys.js', 'tools/snowarch/lib/licence/keys.mjs']);
/** The declaration a slot outside the grammar may carry, and the least it must say. */
export const DECLARED = /\/\/\s*owner key from path:\s*(.*)$/;
export const DECLARED_MIN = 20;

const CRYPTO = new Set(['node:crypto', 'crypto']);
const MODULE = new Set(['node:module', 'module']);
const CODE = /\.(mjs|js|cjs)$/;
const LIST_METHODS = new Set(['map', 'filter', 'find', 'slice']);

/** Every file under `roots` (relative to `base`), as repo-relative POSIX paths. */
export function shippedFiles(base, roots = SHIPPED) {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (statSync(p).size < 8_000_000) out.push(relative(base, p).split('\\').join('/'));
    }
  };
  for (const r of roots) if (existsSync(join(base, r))) walk(join(base, r));
  return out.sort();
}

/**
 * `{ files, code, sinks, slots, declared, violations }`.
 * - `files`: every file read; `code`: the JavaScript among them, which the flow rules parse.
 * - `sinks`: each verification call, `{ file, line }`. `slots`: how many slots were held to the grammar.
 * - `declared`: each declared site, `{ file, line, why }`. `violations`: `{ file, line, rule, what }`, each a reason.
 */
export async function scanKeySources({ base, files, read = (rel) => readFileSync(join(base, rel), 'utf8') }) {
  const ts = (await import('typescript')).default;
  const all = files ?? shippedFiles(base);
  const code = all.filter((f) => CODE.test(f) && !/\.d\.[mc]?ts$/.test(f));
  const has = new Set(all);
  const text = new Map(all.map((f) => [f, read(f)]));
  const violations = [];
  const declared = [];
  const sinks = [];
  let slots = 0;

  const parsed = new Map();
  const parse = (file) => {
    if (!parsed.has(file)) {
      parsed.set(file, ts.createSourceFile(file, text.get(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS));
    }
    return parsed.get(file);
  };
  const lineOf = (node) => node.getSourceFile().getLineAndCharacterOfPosition(node.getStart()).line + 1;
  const fileOf = (node) => node.getSourceFile().fileName;
  const flag = (node, rule, what) => violations.push({ file: fileOf(node), line: lineOf(node), rule, what });

  /** A relative specifier, resolved against `from` to a file the reader has, or `null`. POSIX joins on repo paths. */
  const target = (from, spec) => {
    if (!spec.startsWith('.')) return null;
    const p = posix.normalize(posix.join(posix.dirname(from), spec));
    return has.has(p) ? p : null;
  };
  const isKeysModule = (file) => KEYS_MODULES.includes(file);

  // ── Bindings ────────────────────────────────────────────────────────────────────────────────────────────
  /** The names a binding pattern binds, each with the element that binds it. */
  const namesIn = (name, out = []) => {
    if (ts.isIdentifier(name)) out.push(name);
    else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
      for (const el of name.elements) if (!ts.isOmittedExpression(el)) namesIn(el.name, out);
    }
    return out;
  };
  /** Does declaration `d` bind `name`? Is statement `s` a function or class declaration named `name`? */
  const binds = (d, name) => namesIn(d.name).some((b) => b.text === name);
  const declares = (s, name) => (ts.isFunctionDeclaration(s) || ts.isClassDeclaration(s)) && s.name?.text === name;
  /** What `id` is bound to, by walking out through its scopes: `{ kind, node, … }`, or `null` when undeclared. */
  const bindingOf = (id) => {
    const name = id.text;
    for (let n = id.parent; n; n = n.parent) {
      if (ts.isFunctionLike(n)) {
        for (const [i, p] of (n.parameters ?? []).entries()) {
          for (const b of namesIn(p.name)) {
            if (b.text === name) return { kind: 'param', fn: n, index: i, element: b.parent, param: p };
          }
        }
        if ((ts.isFunctionExpression(n)) && n.name?.text === name) return { kind: 'function', node: n };
      }
      if (ts.isForOfStatement(n) && ts.isVariableDeclarationList(n.initializer)) {
        for (const d of n.initializer.declarations) {
          if (binds(d, name)) return { kind: 'for-of', node: d, over: n.expression };
        }
      }
      if (ts.isCatchClause(n) && n.variableDeclaration && binds(n.variableDeclaration, name)) {
        return { kind: 'catch', node: n };
      }
      const statements = ts.isSourceFile(n) || ts.isBlock(n) || ts.isModuleBlock(n) ? n.statements
        : ts.isCaseClause(n) || ts.isDefaultClause(n) ? n.statements : null;
      if (!statements) continue;
      for (const s of statements) {
        if (ts.isVariableStatement(s)) {
          for (const d of s.declarationList.declarations) {
            if (binds(d, name)) return { kind: 'var', node: d, scope: n };
          }
        }
        if (declares(s, name)) return { kind: 'function', node: s };
        if (ts.isImportDeclaration(s) && s.importClause) {
          const c = s.importClause;
          const spec = s.moduleSpecifier.text;
          if (c.name?.text === name) return { kind: 'import', spec, imported: 'default', file: fileOf(s) };
          if (c.namedBindings && ts.isNamespaceImport(c.namedBindings) && c.namedBindings.name.text === name) {
            return { kind: 'import', spec, imported: '*', file: fileOf(s) };
          }
          if (c.namedBindings && ts.isNamedImports(c.namedBindings)) {
            for (const el of c.namedBindings.elements) {
              if (el.name.text !== name) continue;
              return { kind: 'import', spec, imported: (el.propertyName ?? el.name).text, file: fileOf(s) };
            }
          }
        }
      }
    }
    return null;
  };

  /** The declaration a module exports as `name`, following `export { … } from` and `export *` once each. */
  const exportOf = (file, name, seen = new Set()) => {
    if (!file || seen.has(`${file}#${name}`)) return null;
    seen.add(`${file}#${name}`);
    const src = parse(file);
    for (const s of src.statements) {
      const exported = s.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      if (exported && declares(s, name)) return { file, node: s };
      if (exported && ts.isVariableStatement(s)) {
        for (const d of s.declarationList.declarations) if (binds(d, name)) return { file, node: d };
      }
      if (ts.isExportDeclaration(s) && s.exportClause && ts.isNamedExports(s.exportClause)) {
        for (const el of s.exportClause.elements) {
          if (el.name.text !== name) continue;
          const local = (el.propertyName ?? el.name).text;
          if (s.moduleSpecifier) return exportOf(target(file, s.moduleSpecifier.text), local, seen);
          // `export { name }` of a local binding, or of one this module imported: followed to where it is declared.
          const b = bindingAt(src, local);
          if (!b) return null;
          return b.kind === 'import' ? exportOf(target(file, b.spec), b.imported, seen) : { file, node: b.node };
        }
      }
      if (ts.isExportDeclaration(s) && !s.exportClause && s.moduleSpecifier) {
        const r = exportOf(target(file, s.moduleSpecifier.text), name, seen);
        if (r) return r;
      }
    }
    return null;
  };
  /** A top-level binding of `name` in `src`, found the way `bindingOf` finds one. */
  const bindingAt = (src, name) => {
    for (const s of src.statements) {
      if (ts.isVariableStatement(s)) {
        for (const d of s.declarationList.declarations) if (binds(d, name)) return { kind: 'var', node: d, scope: src };
      }
      if (declares(s, name)) return { kind: 'function', node: s };
      const named = s.importClause?.namedBindings;
      if (ts.isImportDeclaration(s) && named && ts.isNamedImports(named)) {
        for (const el of named.elements) {
          if (el.name.text !== name) continue;
          return { kind: 'import', spec: s.moduleSpecifier.text, imported: (el.propertyName ?? el.name).text, file: src.fileName };
        }
      }
    }
    return null;
  };

  /** The function a callee expression denotes, through local bindings, imports and re-exports, or `null`. */
  const calleeFunction = (expr) => {
    let b = null;
    if (ts.isIdentifier(expr)) b = bindingOf(expr);
    else if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.expression)) {
      const ns = bindingOf(expr.expression);
      if (ns?.kind === 'import' && ns.imported === '*') {
        const r = exportOf(target(ns.file, ns.spec), expr.name.text);
        return r ? functionOfNode(r.node) : null;
      }
      return null;
    }
    if (!b) return null;
    if (b.kind === 'function') return b.node;
    if (b.kind === 'var') return functionOfNode(b.node);
    if (b.kind === 'import' && b.imported !== '*') {
      const r = exportOf(target(b.file, b.spec), b.imported);
      return r ? functionOfNode(r.node) : null;
    }
    return null;
  };
  const functionOfNode = (node) => {
    if (ts.isFunctionDeclaration(node)) return node;
    if (ts.isVariableDeclaration(node) && node.initializer
      && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) return node.initializer;
    return null;
  };

  /** Where a function takes keys: `{ positional: index }`, `{ option: index }`, or `null`. */
  const keysParam = (fn) => {
    for (const [i, p] of (fn?.parameters ?? []).entries()) {
      if (ts.isIdentifier(p.name) && p.name.text === 'keys') return { positional: i };
      if (ts.isObjectBindingPattern(p.name) && p.name.elements.some((el) => (el.propertyName ?? el.name).getText() === 'keys')) {
        return { option: i };
      }
    }
    return null;
  };

  // ── The grammar ─────────────────────────────────────────────────────────────────────────────────────────
  /** Every identifier `fn`'s body reads that its own parameters do not bind. */
  const freeIn = (fn) => {
    const own = new Set(fn.parameters.flatMap((p) => namesIn(p.name).map((b) => b.text)));
    const free = [];
    const visit = (n) => {
      if (ts.isIdentifier(n) && !own.has(n.text)) {
        const p = n.parent;
        const isName = (ts.isPropertyAccessExpression(p) && p.name === n) || (ts.isPropertyAssignment(p) && p.name === n)
          || (ts.isBindingElement(p) && p.propertyName === n);
        if (!isName) free.push(n.text);
      }
      ts.forEachChild(n, visit);
    };
    visit(fn.body);
    return free;
  };

  /** Why `expr` is not a key list the grammar allows, or `null` when it is. */
  const notKeys = (expr, seen = new Set()) => {
    if (!expr) return null;
    if (seen.has(expr)) return null;
    seen.add(expr);
    while (ts.isParenthesizedExpression(expr) || ts.isAsExpression?.(expr) || ts.isNonNullExpression(expr)) expr = expr.expression;
    if (ts.isIdentifier(expr)) {
      if (expr.text === 'undefined') return null;
      const b = bindingOf(expr);
      if (!b) return `${expr.text} is not declared here`;
      if (b.kind === 'import') {
        const from = target(b.file, b.spec);
        if (b.imported === 'PRODUCT_KEYS' && from && isKeysModule(from)) return null;
        if (b.imported === 'PRODUCT_KEYS' && from) {
          const r = exportOf(from, 'PRODUCT_KEYS');
          if (r && isKeysModule(r.file)) return null;
        }
        return `${expr.text} is imported from ${b.spec}, not the keys module`;
      }
      if (b.kind === 'param') {
        const prop = ts.isBindingElement(b.element) ? (b.element.propertyName ?? b.element.name).getText() : expr.text;
        if (prop === 'keys' || prop === 'licenceKeys') return null;
        return `${expr.text} is a parameter that is not a keys slot, so its callers are not held`;
      }
      if (b.kind === 'var') {
        if (ts.isIdentifier(b.node.name) && b.node.name.text === expr.text) {
          const assigned = [b.node.initializer, ...assignmentsTo(b.scope, expr.text)];
          for (const value of assigned) {
            const why = notKeys(value, seen);
            if (why) return why;
          }
          return null;
        }
        return `${expr.text} is destructured from a value the reader does not follow`;
      }
      return `${expr.text} is a ${b.kind}, not a key list`;
    }
    if (ts.isPropertyAccessExpression(expr)) {
      // The doctor's seam, read off its ctx: a parameter, which no shipped object fills (the seam rule).
      if (expr.name.text === 'licenceKeys') {
        return ts.isIdentifier(expr.expression) && bindingOf(expr.expression)?.kind === 'param' ? null
          : `${expr.getText().slice(0, 60)} reads the seam off something other than a parameter`;
      }
      if (expr.name.text === 'keys') return notKeysField(expr.expression, seen);
      return `${expr.getText().slice(0, 60)} is not a key list`;
    }
    if (ts.isBinaryExpression(expr)) {
      const op = expr.operatorToken.kind;
      if (op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.BarBarToken) {
        return notKeys(expr.left, seen) ?? notKeys(expr.right, seen);
      }
      if (op === ts.SyntaxKind.CommaToken) return notKeys(expr.right, seen);
      return `a ${ts.tokenToString(op)} expression is not a key list`;
    }
    if (ts.isConditionalExpression(expr)) return notKeys(expr.whenTrue, seen) ?? notKeys(expr.whenFalse, seen);
    if (ts.isArrayLiteralExpression(expr)) {
      for (const el of expr.elements) {
        if (ts.isSpreadElement(el)) {
          const why = notKeys(el.expression, seen);
          if (why) return why;
        } else return 'an array literal adds an entry of its own, which is a key outside the keys module';
      }
      return null;
    }
    if (ts.isCallExpression(expr) && ts.isPropertyAccessExpression(expr.expression)
      && LIST_METHODS.has(expr.expression.name.text)) {
      const why = notKeys(expr.expression.expression, seen);
      if (why) return why;
      for (const a of expr.arguments) {
        if (ts.isArrowFunction(a) || ts.isFunctionExpression(a)) {
          const free = freeIn(a);
          if (free.length > 0) return `.${expr.expression.name.text}'s callback reads ${free.join(', ')}`;
        } else if (!ts.isNumericLiteral(a)) return `.${expr.expression.name.text} is given ${a.getText().slice(0, 40)}`;
      }
      return null;
    }
    if (expr.kind === ts.SyntaxKind.NullKeyword) return null;
    return `${expr.getText().slice(0, 60)} is not a key list`;
  };

  /** Why the `keys` field of `obj` is not a key list, or `null`, following the object to what was assigned. */
  const notKeysField = (obj, seen) => {
    if (!obj) return null;
    while (ts.isParenthesizedExpression(obj)) obj = obj.expression;
    if (ts.isObjectLiteralExpression(obj)) {
      const p = obj.properties.find((q) => q.name && q.name.getText() === 'keys');
      if (!p) return obj.properties.some((q) => ts.isSpreadAssignment(q)) ? 'a spread may carry keys the reader cannot see' : null;
      if (ts.isShorthandPropertyAssignment(p)) return notKeys(p.name, seen);
      if (ts.isPropertyAssignment(p)) return notKeys(p.initializer, seen);
      return 'a keys member that is not a value';
    }
    if (ts.isIdentifier(obj)) {
      const b = bindingOf(obj);
      if (b?.kind === 'var' && ts.isIdentifier(b.node.name)) {
        for (const value of [b.node.initializer, ...assignmentsTo(b.scope, obj.text)]) {
          const why = notKeysField(value, seen);
          if (why) return why;
        }
        return null;
      }
      return `${obj.text}.keys comes from ${b ? `a ${b.kind}` : 'nowhere declared'}, which the reader does not follow`;
    }
    if (ts.isBinaryExpression(obj)) {
      const op = obj.operatorToken.kind;
      if (op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.BarBarToken) {
        return notKeysField(obj.left, seen) ?? notKeysField(obj.right, seen);
      }
      if (op === ts.SyntaxKind.CommaToken) return notKeysField(obj.right, seen);
    }
    if (obj.kind === ts.SyntaxKind.NullKeyword) return null;
    return `${obj.getText().slice(0, 60)}.keys is not followed`;
  };

  /** Every value assigned to `name` with `=` inside `scope`, outside a nested scope that rebinds it. */
  const assignmentsTo = (scope, name) => {
    const out = [];
    const visit = (n) => {
      if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken
        && ts.isIdentifier(n.left) && n.left.text === name) out.push(n.right);
      ts.forEachChild(n, visit);
    };
    visit(scope);
    return out;
  };

  /** Hold `value` at a slot: a violation, a declared site, or nothing. */
  const holdSlot = (node, value, what) => {
    slots += 1;
    const why = notKeys(value);
    if (!why) return;
    const lines = text.get(fileOf(node)).split('\n');
    const at = lineOf(node);
    const decl = [lines[at - 2], lines[at - 3]].map((l) => (l ?? '').match(DECLARED)).find(Boolean);
    if (decl && decl[1].trim().length >= DECLARED_MIN) {
      declared.push({ file: fileOf(node), line: at, why: decl[1].trim() });
      return;
    }
    flag(node, 'slot', `${what}: ${why}${decl ? ` (its declaration gives no reason of ${DECLARED_MIN} characters)` : ''}`);
  };

  // ── Which functions take keys as an option: by a destructured `keys`, or by handing their options on ────────
  /** `a` as a parameter handed on whole, or the rest of a destructured one: `{ fn, index }`, or `null`. */
  const forwardedParam = (a) => {
    if (!ts.isIdentifier(a)) return null;
    const b = bindingOf(a);
    if (b?.kind !== 'param') return null;
    const whole = b.element === b.param;
    const rest = ts.isBindingElement(b.element) && Boolean(b.element.dotDotDotToken) && b.element.parent === b.param.name;
    return whole || rest ? { fn: b.fn, index: b.index } : null;
  };
  const forwarded = (a) => forwardedParam(a) !== null;
  const takesOptions = new Map();
  const takes = (fn, i) => {
    const at = takesOptions.get(fn) ?? new Set();
    if (at.has(i)) return false;
    takesOptions.set(fn, at.add(i));
    return true;
  };
  const calls = [];
  for (const file of code) {
    const visit = (n) => {
      if (ts.isFunctionLike(n)) {
        const kp = keysParam(n);
        if (kp?.option !== undefined) takes(n, kp.option);
      }
      if (ts.isCallExpression(n)) calls.push(n);
      ts.forEachChild(n, visit);
    };
    visit(parse(file));
  }
  // A function that hands its own options to one that takes keys takes them too, to a fixpoint (`startLicence`).
  const callees = new Map(calls.map((c) => [c, calleeFunction(c.expression)]));
  for (let changed = true; changed;) {
    changed = false;
    for (const c of calls) {
      const fn = callees.get(c);
      for (const i of (fn && takesOptions.get(fn)) ?? []) {
        const f = c.arguments[i] && forwardedParam(c.arguments[i]);
        if (f && takes(f.fn, f.index)) changed = true;
      }
    }
  }

  // The local names a function with a positional keys parameter goes by: its own, and every import of it.
  const positionalNames = new Set();
  for (const file of code) {
    const visit = (n) => {
      if (ts.isFunctionLike(n) && keysParam(n)?.positional !== undefined) {
        const own = n.name ?? (ts.isVariableDeclaration(n.parent) ? n.parent.name : null);
        if (own && ts.isIdentifier(own)) positionalNames.add(own.text);
      }
      ts.forEachChild(n, visit);
    };
    visit(parse(file));
  }
  for (const file of code) {
    for (const s of parse(file).statements) {
      if (!ts.isImportDeclaration(s) || !s.importClause?.namedBindings || !ts.isNamedImports(s.importClause.namedBindings)) continue;
      for (const el of s.importClause.namedBindings.elements) {
        if (positionalNames.has((el.propertyName ?? el.name).text)) positionalNames.add(el.name.text);
      }
    }
  }
  const isCallee = (id) => ts.isCallExpression(id.parent) && id.parent.expression === id;
  const isDeclarationName = (id) => {
    const p = id.parent;
    return ((ts.isFunctionDeclaration(p) || ts.isVariableDeclaration(p) || ts.isFunctionExpression(p)) && p.name === id)
      || ts.isImportSpecifier(p) || ts.isExportSpecifier(p) || ts.isImportClause(p)
      || (ts.isPropertyAccessExpression(p) && p.name === id) || (ts.isPropertyAssignment(p) && p.name === id)
      || (ts.isBindingElement(p) && p.propertyName === id) || ts.isParameter(p);
  };

  // ── The flow rules, file by file ────────────────────────────────────────────────────────────────────────
  for (const file of code) {
    const src = parse(file);
    const crypto = { verify: new Set(), createVerify: new Set(), createPublicKey: new Set(), ns: new Set() };
    const moduleNs = new Set();
    for (const s of src.statements) {
      if (!ts.isImportDeclaration(s) || !s.importClause) continue;
      const spec = s.moduleSpecifier.text;
      const c = s.importClause;
      if (CRYPTO.has(spec)) {
        if (c.name) crypto.ns.add(c.name.text);
        if (c.namedBindings && ts.isNamespaceImport(c.namedBindings)) crypto.ns.add(c.namedBindings.name.text);
        if (c.namedBindings && ts.isNamedImports(c.namedBindings)) {
          for (const el of c.namedBindings.elements) {
            const imported = (el.propertyName ?? el.name).text;
            if (crypto[imported] instanceof Set) crypto[imported].add(el.name.text);
          }
        }
      }
      if (MODULE.has(spec)) {
        if (c.name) moduleNs.add(c.name.text);
        if (c.namedBindings && ts.isNamespaceImport(c.namedBindings)) moduleNs.add(c.namedBindings.name.text);
        if (c.namedBindings && ts.isNamedImports(c.namedBindings)) {
          for (const el of c.namedBindings.elements) {
            if ((el.propertyName ?? el.name).text === 'register') flag(el, 'register', 'imports node:module\'s register');
          }
        }
      }
    }
    const cryptoCall = (callee, name) => (ts.isIdentifier(callee) && crypto[name].has(callee.text))
      || (ts.isPropertyAccessExpression(callee) && callee.name.text === name && ts.isIdentifier(callee.expression)
        && crypto.ns.has(callee.expression.text));

    const visit = (n) => {
      // node:module's register, through a namespace, a dynamic import or a require.
      if (ts.isPropertyAccessExpression(n) && n.name.text === 'register') {
        const on = n.expression;
        const loaded = ts.isCallExpression(on) && on.arguments[0] && ts.isStringLiteral(on.arguments[0])
          && MODULE.has(on.arguments[0].text);
        if ((ts.isIdentifier(on) && moduleNs.has(on.text)) || loaded) flag(n, 'register', 'reaches node:module\'s register');
      }
      // A function with a positional keys parameter is only ever called directly, so every caller is held.
      if (ts.isIdentifier(n) && positionalNames.has(n.text) && !isCallee(n) && !isDeclarationName(n)) {
        const fn = calleeFunction(n);
        if (fn && keysParam(fn)?.positional !== undefined) {
          flag(n, 'slot', `${n.text} takes keys by position and escapes as a value, so its callers cannot be held`);
        }
      }
      if (ts.isCallExpression(n)) {
        // The sink.
        if (cryptoCall(n.expression, 'createVerify')) flag(n, 'sink', 'createVerify is not the shipped sink, which is verify');
        if (cryptoCall(n.expression, 'verify') || (ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'verify'
          && ts.isPropertyAccessExpression(n.expression.expression) && n.expression.expression.name.text === 'subtle')) {
          sinks.push({ file, line: lineOf(n) });
          const key = n.arguments[2];
          const ok = key && ts.isCallExpression(key) && cryptoCall(key.expression, 'createPublicKey') && key.arguments.length === 1
            && ts.isPropertyAccessExpression(key.arguments[0]) && key.arguments[0].name.text === 'publicKey'
            && ts.isIdentifier(key.arguments[0].expression) && entryOfList(key.arguments[0].expression);
          if (!ok) flag(n, 'sink', `the key is ${key ? key.getText().slice(0, 60) : 'absent'}, not createPublicKey(<an entry of a key list>.publicKey)`);
        }
        const fn = calleeFunction(n.expression);
        const holdOption = (a) => {
          for (const p of a.properties) {
            if (p.name?.getText() === 'keys') holdSlot(p, ts.isShorthandPropertyAssignment(p) ? p.name : p.initializer, 'a keys option');
          }
        };
        if (!fn) {
          // A callee the reader cannot resolve (a table, a parameter, a method): any object it is handed with a
          // keys property is held, since the reader cannot tell that the callee takes none.
          for (const a of n.arguments) if (ts.isObjectLiteralExpression(a)) holdOption(a);
        } else {
          const kp = keysParam(fn);
          if (kp?.positional !== undefined && n.arguments[kp.positional]) {
            holdSlot(n.arguments[kp.positional], n.arguments[kp.positional], 'a positional keys argument');
          }
          // A callee that takes keys as an option, itself or by handing its own options on: that argument.
          for (const i of takesOptions.get(fn) ?? []) {
            const a = n.arguments[i];
            if (!a) continue;
            if (ts.isObjectLiteralExpression(a)) {
              holdOption(a);
              for (const p of a.properties) {
                if (!ts.isSpreadAssignment(p)) continue;
                slots += 1;
                const why = notKeysField(p.expression, new Set());
                if (why) flag(p, 'slot', `a spread into a keys option: ${why}`);
              }
            } else if (!forwarded(a)) {
              slots += 1;
              const why = notKeysField(a, new Set());
              if (why) flag(a, 'slot', `an options object: ${why}`);
            }
          }
        }
      }
      // Every keys parameter's default, and the seam's.
      if (ts.isParameter(n) || ts.isBindingElement(n)) {
        const name = ts.isBindingElement(n) ? (n.propertyName ?? n.name).getText() : n.name.getText();
        const inParams = ts.isParameter(n) || ancestorIsParameter(n);
        if (inParams && name === 'keys' && n.initializer) holdSlot(n, n.initializer, 'a keys default');
        if (inParams && name === 'licenceKeys' && n.initializer && n.initializer.getText() !== 'undefined') {
          flag(n, 'seam', `the licenceKeys seam defaults to ${n.initializer.getText().slice(0, 40)}`);
        }
      }
      // The seams no shipped file fills, and fields no shipped file overwrites.
      if ((ts.isPropertyAssignment(n) || ts.isShorthandPropertyAssignment(n)) && n.name.getText() === 'licenceKeys') {
        flag(n, 'seam', 'a shipped object fills the licenceKeys seam, which only a test may');
      }
      if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken
        && ts.isPropertyAccessExpression(n.left) && ['keys', 'licenceKeys'].includes(n.left.name.text)) {
        flag(n, 'seam', `.${n.left.name.text} is assigned, which the reader cannot hold`);
      }
      // One list: PRODUCT_KEYS is declared only in a keys module, and imported only from one.
      if (!isKeysModule(file) && ts.isVariableDeclaration(n) && binds(n, 'PRODUCT_KEYS')) {
        flag(n, 'one-list', 'declares a PRODUCT_KEYS of its own');
      }
      if (ts.isImportSpecifier(n) && (n.propertyName ?? n.name).text === 'PRODUCT_KEYS') {
        const decl = n.parent.parent.parent;
        const from = target(file, decl.moduleSpecifier.text);
        const r = from && (isKeysModule(from) ? { file: from } : exportOf(from, 'PRODUCT_KEYS'));
        if (!r || !isKeysModule(r.file)) flag(n, 'one-list', `imports PRODUCT_KEYS from ${decl.moduleSpecifier.text}, not a keys module`);
      }
      ts.forEachChild(n, visit);
    };
    visit(src);
  }

  /** Is `id` an entry of a key list: `const id = <list>.find(…)`, or a for…of over one? */
  function entryOfList(id) {
    const b = bindingOf(id);
    if (b?.kind === 'for-of') return !notKeys(b.over);
    if (b?.kind !== 'var' || !b.node.initializer) return false;
    const init = b.node.initializer;
    return ts.isCallExpression(init) && ts.isPropertyAccessExpression(init.expression) && init.expression.name.text === 'find'
      && !notKeys(init.expression.expression);
  }
  function ancestorIsParameter(n) {
    for (let p = n.parent; p; p = p.parent) {
      if (ts.isParameter(p)) return true;
      if (ts.isFunctionLike(p) || ts.isVariableDeclaration(p) || ts.isSourceFile(p)) return false;
    }
    return false;
  }

  // ── The class rules that need no flow ───────────────────────────────────────────────────────────────────
  for (const file of KEYS_MODULES.filter((f) => has.has(f))) {
    const src = parse(file);
    const only = src.statements.length === 1 ? src.statements[0] : null;
    const decl = only && ts.isVariableStatement(only) && only.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
      && (only.declarationList.flags & ts.NodeFlags.Const) && only.declarationList.declarations.length === 1
      ? only.declarationList.declarations[0] : null;
    const frozen = (e) => e && ts.isCallExpression(e) && e.expression.getText() === 'Object.freeze' && e.arguments.length === 1;
    const literal = (e) => ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e);
    const entries = decl && decl.name.getText() === 'PRODUCT_KEYS' && frozen(decl.initializer)
      && ts.isArrayLiteralExpression(decl.initializer.arguments[0]) ? decl.initializer.arguments[0].elements : null;
    const constant = entries && entries.every((el) => frozen(el) && ts.isObjectLiteralExpression(el.arguments[0])
      && el.arguments[0].properties.length === 3
      && el.arguments[0].properties.every((p) => ts.isPropertyAssignment(p) && ['role', 'fingerprint', 'publicKey'].includes(p.name.getText())
        && literal(p.initializer)));
    if (!constant) {
      flag(src.statements[0] ?? src, 'leaf', 'is not one exported Object.freeze([…]) of { role, fingerprint, publicKey } string literals');
    }
  }
  for (const [file, body] of text) {
    if (!isKeysModule(file) && body.includes('BEGIN PUBLIC KEY')) {
      violations.push({ file, line: body.slice(0, body.indexOf('BEGIN PUBLIC KEY')).split('\n').length, rule: 'one-list', what: 'carries public-key armour' });
    }
    const at = body.indexOf('NODE_OPTIONS');
    if (at >= 0) {
      violations.push({ file, line: body.slice(0, at).split('\n').length, rule: 'node-options', what: 'names NODE_OPTIONS, the test hook\'s channel' });
    }
  }

  return { files: all.length, code: code.length, sinks, slots, declared, violations };
}
