// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C242 — every call of `maskForJson` passes the store's values.
 *
 * `--json` is the form that travels, and `maskForJson` masks it. Called without `storeMaskValues(…)` it masks a label
 * and a ServiceNow-hosted URL and leaves the store's own hosts and names as they are, so a caller that forgets them is a
 * leak that no other test sees. The regression hunt (wf_9be5c51c-184, area 3 F6) found the guard that held this read two
 * named files, and a third caller would have escaped it.
 *
 * It reads every module under tools/snowarch/lib with the TypeScript compiler that tests/lib/temp-sites.mjs already
 * uses, so a comment, a string, a regex literal or a template is never mistaken for code. A call's arguments must hold
 * `storeMaskValues(…)`; the function may be imported, statically or with `await import()`, under its own name only, and
 * never passed on as a value. It lives beside the other tree-wide guards, not in tests/doctor/: AC 6 holds the doctor's
 * tests to the standard library, and the compiler is not part of it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const lib = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'tools', 'snowarch', 'lib');
const files = readdirSync(lib, { recursive: true }).map((p) => String(p).replace(/\\/g, '/')).filter((p) => p.endsWith('.mjs')).sort();

/** The call sites, as `file:line: ok|MISSING`, and every other use of the name that is not an import or the definition. */
function scan(read = (f) => readFileSync(join(lib, f), 'utf8'), names = files) {
  const calls = [];
  const loose = [];
  for (const f of names) {
    const source = ts.createSourceFile(f, read(f), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const at = (node) => `${f}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`;
    const calls_ = (node, name) => {
      let found = false;
      const look = (n) => {
        if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === name) found = true;
        else ts.forEachChild(n, look);
      };
      look(node);
      return found;
    };
    const visit = (node) => {
      if (ts.isIdentifier(node) && node.text === 'maskForJson') {
        const p = node.parent;
        if (ts.isCallExpression(p) && p.expression === node) {
          calls.push(`${at(node)}: ${p.arguments.some((a) => calls_(a, 'storeMaskValues')) ? 'ok' : 'MISSING'}`);
        } else if ((ts.isFunctionDeclaration(p) && p.name === node)
          || ((ts.isImportSpecifier(p) || ts.isBindingElement(p) || ts.isExportSpecifier(p)) && !p.propertyName)) {
          // the definition, or an import or a re-export under its own name
        } else {
          loose.push(at(node));
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return { calls, loose };
}

test('ARC-09-C242 — every maskForJson call passes the store\'s values, in every lib module', () => {
  const { calls, loose } = scan();
  assert.equal(calls.length, 3, `expected the 3 known call sites: ${calls.join(' | ')}`);
  assert.deepEqual(calls.filter((c) => c.endsWith('MISSING')), [], 'a call site masks without the store\'s values');
  assert.deepEqual(loose, [], 'maskForJson is imported under another name or passed on as a value');
});

// The guard is proved against a planted module for each way it must fail and each way it must not, so a guard that
// cannot fail is not a guard (the same discipline as tests/snowarch-skill.test.mjs).
const planted = (text) => scan(() => text, ['planted.mjs']);

test('ARC-09-C242 — the guard fails a call without the store\'s values, an aliased import, and the name passed on', () => {
  assert.deepEqual(planted('export const a = (r) => maskForJson(r);').calls, ['planted.mjs:1: MISSING']);
  assert.equal(planted('import { maskForJson as mfj } from "../x.mjs";\nexport const b = mfj;').loose.length, 1, 'an aliased import');
  assert.equal(planted('export const c = (rs) => rs.map(maskForJson);').loose.length, 1, 'passed as a value');
  assert.equal(planted('const h = maskForJson;').loose.length, 1, 'assigned');
  assert.equal(planted('export const d = { maskForJson };').loose.length, 1, 'a shorthand property');
});

test('ARC-09-C242 — the guard passes a comment, a string or a regex that names the function, and reads a call across lines', () => {
  assert.deepEqual(planted('/** maskForJson(report) is the boundary */\n// maskForJson(x)\nexport const s = "maskForJson(";\nexport const r = /maskForJson\\(/;'),
    { calls: [], loose: [] });
  assert.deepEqual(planted('export const x = maskForJson(report, { home, ...storeMaskValues(root) });').calls, ['planted.mjs:1: ok']);
  assert.deepEqual(planted('export const y = maskForJson(report, {\n  home,\n  ...storeMaskValues(root) });').calls, ['planted.mjs:1: ok']);
  assert.deepEqual(planted('const { maskForJson, storeMaskValues } = await import("../doctor/json-boundary.mjs");\nmaskForJson(r, storeMaskValues(root));'),
    { calls: ['planted.mjs:2: ok'], loose: [] }, 'a lazy import under its own name is an import');
});

test('ARC-09-C242 — the guard sees a call after a regex literal that holds a backtick, and inside a template', () => {
  // The first version blanked comments and strings with regexes and lost step at a character class holding a backtick.
  assert.deepEqual(planted('const HOME = /[^\\\\/\\s"\'`,;:]*/g;\nexport const m = (report) => maskForJson(report);').calls, ['planted.mjs:2: MISSING']);
  assert.deepEqual(planted('export const t = (report) => `${JSON.stringify(maskForJson(report))}`;').calls, ['planted.mjs:1: MISSING']);
});
