/**
 * ARC-09-C69/C70 — the reader that finds a spawn passing an args array together with a shell.
 *
 * WHY IT IS A MODULE AND NOT A BLOCK INSIDE THE TEST. The first version lived in the case, and the
 * case that "proved the reader works" re-implemented the same walk over a planted string. That is a
 * copy, not a proof: a degradation of the real reader left the copy green, which is the identical
 * mistake as asserting a helper instead of the product's output (ARC-07's BC control). Exported here,
 * one function is both what runs over the repository and what the planted fixture is fed to.
 *
 * IT PARSES, with the `typescript` already pinned for `scripts/ci/launcher-extract.mjs`, because the
 * shape is what is wrong rather than the text. `scripts/ci/control.mjs` spawns ONE command string with
 * `shell: true` — the form DEP0190 does not deprecate, since there is no args array to leave unescaped —
 * and a textual rule would either flag it, needing an exemption that names a file doing nothing wrong,
 * or match loosely enough to miss a real site.
 *
 * THREE THINGS IT LEARNED FROM CONTROLS, each having passed while the defect was present:
 *
 *   1. The CALLEE'S NAME is not part of the rule. `test-all.mjs` spawns through `run`, an injected seam
 *      whose default is `spawnSync`, so a rule keyed on names could not see it — nor `runNpm`, nor a
 *      harness's `run(dir, cmd, args)`, nor a spy.
 *   2. The ARGS POSITION holds whatever the caller put there — `step.args` is a property access, not an
 *      array literal or a bare identifier. How arguments are spelled was never part of the defect.
 *   3. A SPREAD is followed one hop. Options assembled elsewhere and spread in
 *      (`{ ...call.options }`) are how `test-all.mjs`, the harnesses and `makeGateRunner` all pass
 *      them, so the shape the reader could not see was the shape the repository uses.
 *
 * One hop and no further, deliberately: resolving a spread to an object literal bound in the same file
 * covers every way this codebase writes it, and a general resolver would need types. A spread this
 * cannot resolve is REPORTED as unresolved rather than treated as clean, because "could not tell" and
 * "nothing here" being the same value is the defect this programme keeps finding.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** `{ offenders, unresolved, files }` — offenders as `path:line`, files as the count actually read. */
export async function scanSpawnShapes({ roots = [], read = readFileSync } = {}) {
  const ts = (await import('typescript')).default;

  const files = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.mjs$/.test(e.name) && statSync(p).size < 2_000_000) files.push(p);
    }
  };
  for (const root of roots) walk(root);

  const offenders = [];
  const unresolved = [];

  for (const file of files) {
    const src = ts.createSourceFile(file, String(read(file, 'utf8')), ts.ScriptTarget.Latest, true);

    /** Every `const x = { … }` in the file, for the one-hop spread resolution. */
    const bindings = new Map();
    const bind = (node) => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)
        && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
        bindings.set(node.name.getText(), node.initializer);
      }
      ts.forEachChild(node, bind);
    };
    bind(src);

    /** `call.options` → the object literal at that path; `opts` → its own literal; else `null`. */
    const resolveSpread = (expr) => {
      const parts = expr.getText().split('.');
      let node = bindings.get(parts[0]) ?? null;
      for (const key of parts.slice(1)) {
        if (!node || !ts.isObjectLiteralExpression(node)) return null;
        const prop = node.properties.find((pr) => ts.isPropertyAssignment(pr)
          && pr.name?.getText?.() === key);
        node = prop && ts.isObjectLiteralExpression(prop.initializer) ? prop.initializer : null;
      }
      return node && ts.isObjectLiteralExpression(node) ? node : null;
    };

    const shellIsOn = (node, at) => {
      if (!ts.isObjectLiteralExpression(node)) return false;
      for (const pr of node.properties) {
        if (ts.isPropertyAssignment(pr) && pr.name?.getText?.() === 'shell'
          && pr.initializer.kind !== ts.SyntaxKind.FalseKeyword) return true;
        if (ts.isSpreadAssignment(pr)) {
          const target = resolveSpread(pr.expression);
          if (!target) { unresolved.push(`${at}: ...${pr.expression.getText()}`); continue; }
          if (shellIsOn(target, at)) return true;
        }
      }
      return false;
    };

    const visit = (node) => {
      if (ts.isCallExpression(node)) {
        const args = node.arguments;
        const second = args[1];
        // Anything in the args position that is not the options object counts as arguments passed
        // separately — which, with a shell, is the deprecated shape. A call given one string and
        // options has an object there, and is not this defect.
        const hasArgs = second && !ts.isObjectLiteralExpression(second);
        const options = args.find((a, i) => i > 0 && ts.isObjectLiteralExpression(a));
        const where = `${file}:${src.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
        if (hasArgs && options && shellIsOn(options, where)) offenders.push(where);
      }
      ts.forEachChild(node, visit);
    };
    visit(src);
  }

  return { offenders, unresolved, files: files.length };
}
