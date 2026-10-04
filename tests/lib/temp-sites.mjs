/**
 * Where a test file makes a directory in the machine's temp location — the scan behind ARC-09-C80.
 *
 * A function here, not inlined in `tests/fixture-leftovers.test.mjs`, for the reason
 * `tests/lib/lint-rules.mjs` gives: the negative cases must run the SAME code the real-tree check
 * runs, because a control that re-implements its rule proves only that the re-implementation works.
 *
 * IT PARSES; IT DOES NOT PATTERN-MATCH. The first version stripped comments with the repo's usual
 * regex pair and then searched the text, and an adversarial review found what that pair has always
 * done (ARC-07-C35b removed it from `scripts/ci/launcher-audit.mjs` for the same reason): a `/*`
 * inside a line comment or a string pairs with a `*\/` far below and blanks everything between. On
 * this tree that hid 552 lines of real code in 9 of the 140 files scanned, 325 of them in
 * `gen-governance.test.mjs` — so a bare `mkdtempSync` planted in
 * `gen-governance.test.mjs`, `workflows.test.mjs`, `eol.test.mjs` or `no-legacy-names.test.mjs` was
 * not reported — and it reported hits that were only mentions in strings and regexes. A syntax tree
 * has neither fault: comments are not nodes, and a string is not an identifier. `typescript` is
 * already a pinned dependency here (`scripts/ci/launcher-extract.mjs` parses with it for the same
 * reason).
 *
 * WHAT COUNTS AS A SITE.
 *   - any use of `mkdtemp`, `mkdtempSync`, `mkdtempDisposable…`: a call, a reference
 *     (`const make = fs.mkdtempSync`), a re-export, an alias (`import { mkdtempSync as make }`,
 *     `{ mkdtempSync: make }`) or computed access (`fs['mkdtempSync']`). An UNALIASED import or
 *     destructure binds no new name, so it is not a site on its own — every use of the binding is.
 *   - a call to `tmpdir()` (`os.tmpdir()`, `os?.tmpdir()`), a reference to `os.tmpdir`, or an alias.
 *     The only legitimate reason left to ask where the temp location is, once fixtures come from
 *     `tempDir()`, is a test ABOUT the temp location; any other use is a hand-rolled fixture root —
 *     `mkdirSync(join(tmpdir(), 'x'))` makes a directory without a single `mkdtemp` in sight. A
 *     plain identifier called `tmpdir` that is never called is a local variable and is left alone.
 *
 * WHAT IS ALLOWED. `tempDir(prefix, t)` contains neither word in the file that calls it, so it is not
 * a site. A site inside the FIRST ARGUMENT of `trackTempDir(…)` is `tracked` and allowed on its shape:
 * the helper takes a directory somebody else made and registers it, which is the form a caller needs
 * when the parent is not `os.tmpdir()`. The two-step `const d = mkdtempSync(…); trackTempDir(d)` is
 * deliberately NOT recognised — nothing here follows a variable — so write the wrapped form.
 *
 * WHAT IT CANNOT SEE, said here so nobody reads it as wider than it is: a directory made from a path
 * that never touches `tmpdir()` (`process.env.TMPDIR`, a literal `/tmp`, a spawned `mktemp`), and a
 * directory made by PRODUCT code that a test imports or spawns. Case 1 of
 * `tests/fixture-leftovers.test.mjs` and a whole-suite count against a private TMPDIR cover
 * behaviour; this covers spelling.
 */
import ts from 'typescript';

/** `mkdtemp`, `mkdtempSync`, and Node 24's `mkdtempDisposable`/`mkdtempDisposableSync`. */
const MKDTEMP = /^mkdtemp\w*$/;
const isTarget = (name) => MKDTEMP.test(name) || name === 'tmpdir';
const callOf = (name) => (name === 'tmpdir' ? 'tmpdir' : 'mkdtemp');

function scriptKind(fileName) {
  if (/\.tsx$/.test(fileName)) return ts.ScriptKind.TSX;
  if (/\.[cm]?ts$/.test(fileName)) return ts.ScriptKind.TS;
  if (/\.jsx$/.test(fileName)) return ts.ScriptKind.JSX;
  return ts.ScriptKind.JS;
}

/** Is `node` inside the first argument of a `trackTempDir(...)` call? */
function insideTracker(node) {
  for (let child = node, up = node.parent; up; child = up, up = up.parent) {
    if (ts.isCallExpression(up) && up.arguments[0] === child) {
      const callee = up.expression;
      const name = ts.isIdentifier(callee) ? callee.text
        : ts.isPropertyAccessExpression(callee) ? callee.name.text : '';
      if (name === 'trackTempDir') return true;
    }
  }
  return false;
}

/** `foo()`, `x.foo()`, `x?.foo()`: is this identifier the thing being CALLED? */
function isCallee(node) {
  const parent = node.parent;
  if (ts.isCallExpression(parent) && parent.expression === node) return true;
  return ts.isPropertyAccessExpression(parent) && parent.name === node
    && ts.isCallExpression(parent.parent) && parent.parent.expression === parent;
}

/**
 * How an identifier named like a target is being used — `'call'`, `'alias'`, `'reference'`, or
 * `null` for a use that is not a site (a binding, a property KEY, a local variable).
 */
function classify(node, name) {
  const parent = node.parent;
  if (ts.isImportSpecifier(parent)) {
    if (parent.propertyName === node) return 'alias';   // `import { mkdtempSync as make }`
    return null;                                          // the binding itself, aliased or not
  }
  if (ts.isExportSpecifier(parent)) return 'alias';       // a re-export hides the name from callers
  if (ts.isBindingElement(parent)) {
    if (parent.propertyName === node) return 'alias';     // `{ mkdtempSync: make }`
    return null;                                          // `{ mkdtempSync }` binds, it does not use
  }
  // A property KEY (`{ tmpdir: dir }`, a class member, an interface member) names nothing here.
  if ((ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent) || ts.isMethodDeclaration(parent)
    || ts.isPropertyDeclaration(parent) || ts.isMethodSignature(parent)) && parent.name === node) return null;
  // Declarations of something with that name (a parameter, a local, a function) are not uses.
  if ((ts.isParameter(parent) || ts.isVariableDeclaration(parent) || ts.isFunctionDeclaration(parent)
    || ts.isFunctionExpression(parent)) && parent.name === node) return null;

  if (isCallee(node)) return 'call';
  // `os.tmpdir` / `fs.mkdtempSync` passed or stored, not called.
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return 'reference';
  // A BARE identifier that is not called: for `mkdtemp*` it is the function itself being passed
  // around; for `tmpdir` it is far more likely a local variable holding a path.
  return name === 'tmpdir' ? null : 'reference';
}

/**
 * Every site in one file's source, with how it is wrapped.
 *
 * `kind` is `tracked` for a site inside `trackTempDir(…)`'s first argument and `bare` for everything
 * else. `call` is `mkdtemp`, `tmpdir` or `alias`. `line` is 1-based; `text` is the source line,
 * trimmed, which is also what `EXEMPT` needles match against.
 */
export function findSites(source, fileName = 'planted.mjs') {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKind(fileName));
  const lines = source.split('\n');
  const sites = [];
  const add = (node, call, how) => {
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    sites.push({
      call: how === 'alias' ? 'alias' : call,
      kind: how !== 'alias' && insideTracker(node) ? 'tracked' : 'bare',
      line,
      text: (lines[line - 1] ?? '').trim(),
    });
  };
  const visit = (node) => {
    if (ts.isIdentifier(node) && isTarget(node.text)) {
      const how = classify(node, node.text);
      if (how) add(node, callOf(node.text), how);
    } else if (ts.isElementAccessExpression(node)) {
      // `fs['mkdtempSync']` and fs[`mkdtempSync`]
      const arg = node.argumentExpression;
      if ((ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) && isTarget(arg.text)) {
        add(arg, callOf(arg.text), 'alias');
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return sites.sort((a, b) => a.line - b.line);
}

/** How many times `source` calls any of `names` (a bare identifier or `x.name`). */
export function countCalls(source, names, fileName = 'planted.mjs') {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKind(fileName));
  let count = 0;
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const name = ts.isIdentifier(callee) ? callee.text
        : ts.isPropertyAccessExpression(callee) ? callee.name.text : '';
      if (names.includes(name)) count += 1;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return count;
}

/**
 * The sites a file is not allowed to have, given the exemptions that name it.
 *
 * `exempt` is `[{ file, needle, reason }]`, keyed on a SUBSTRING of the matching line and never on a
 * line number (CONTRIBUTING: "a line number is a fact about everything above it"). `file` is a
 * repository-relative path with `/` separators. A needle exempts every site on the lines it matches,
 * so it should be specific enough to name one statement.
 */
export function violations(file, source, exempt = []) {
  return findSites(source, file)
    .filter((s) => s.kind === 'bare')
    .filter((s) => !exempt.some((e) => e.file === file && s.text.includes(e.needle)))
    .map((s) => ({ file, ...s }));
}
