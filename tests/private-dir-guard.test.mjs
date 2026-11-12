// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C272 — nothing in the engine or the server makes a private folder by hand.
 *
 * A folder made with `mkdirSync(dir, { recursive: true, mode: 0o700 })` is private on POSIX and, on Windows, whatever its parent
 * hands down: a folder directly under `C:\` inherits `BUILTIN\Users` read and `Authenticated Users` modify. The row's rule is that the
 * engine locks a private folder when it creates it, and that is only true while every place that creates one goes through the helper
 * (`makePrivateDir`, in `tools/snowarch/lib/private-dir.mjs` and `packages/snowarch/src/store/acl.ts`). So this is a SEARCH over the
 * tree, not a list of the places its author knew: a new `mkdirSync` with mode 0o700 anywhere else fails here by default.
 *
 * A call is read with its arguments (the parentheses are counted), after comments are removed, because a mode can sit on the line
 * below the call and a comment may name it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TREES = [
  { dir: 'tools/snowarch/lib', ext: '.mjs' },
  { dir: 'packages/snowarch/src', ext: '.ts' },
];
/** The only files that may make a private folder themselves. */
const HELPERS = new Set(['tools/snowarch/lib/private-dir.mjs', 'packages/snowarch/src/store/acl.ts']);

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

/** The text between the parentheses of the call whose name ends at `from` (exclusive of the parens), or null when they do not close. */
function callArgs(src, from) {
  let i = src.indexOf('(', from);
  if (i < 0) return null;
  let depth = 0;
  const start = i + 1;
  for (; i < src.length; i += 1) {
    if (src[i] === '(') depth += 1;
    else if (src[i] === ')') { depth -= 1; if (depth === 0) return src.slice(start, i); }
  }
  return null;
}

/** Every `mkdirSync(...)` in `src` whose arguments set a mode of 0o700, as the argument text. */
export function privateMkdirs(src) {
  const code = stripComments(src);
  const found = [];
  for (const m of code.matchAll(/\bmkdirSync\s*\(/g)) {
    const args = callArgs(code, m.index);
    if (args !== null && /\b0o7[0-7]{2}\b/.test(args)) found.push(args.replace(/\s+/g, ' ').trim());
  }
  return found;
}

function walk(dir, ext, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'node_modules') walk(p, ext, out); } else if (name.endsWith(ext)) out.push(p);
  }
  return out;
}

test('ARC-09-C272 — the reader sees a private mkdir wherever its mode sits, and does not see one that is not', () => {
  assert.deepEqual(privateMkdirs("mkdirSync(join(root, '.local'), { recursive: true, mode: 0o700 });"),
    ["join(root, '.local'), { recursive: true, mode: 0o700 }"]);
  assert.equal(privateMkdirs("mkdirSync(dirname(p), {\n  recursive: true,\n  mode: 0o700,\n});").length, 1);
  assert.equal(privateMkdirs("mkdirSync(dir, { recursive: true });").length, 0);
  assert.equal(privateMkdirs("// mkdirSync(dir, { mode: 0o700 })\n/* mkdirSync(dir, { mode: 0o700 }) */").length, 0);
  assert.equal(privateMkdirs("mkdirSync(dir, { recursive: true, mode: 0o755 });").length, 1, 'any permission mode names a private-folder intent');
});

test('ARC-09-C272 — no module outside the two helpers makes a folder with a permission mode', () => {
  const offenders = [];
  let scanned = 0;
  for (const { dir, ext } of TREES) {
    for (const file of walk(join(root, dir), ext)) {
      scanned += 1;
      const rel = relative(root, file).split(sep).join('/');
      if (HELPERS.has(rel)) continue;
      for (const args of privateMkdirs(readFileSync(file, 'utf8'))) offenders.push(`${rel}: mkdirSync(${args})`);
    }
  }
  assert.ok(scanned > 100, `only ${scanned} modules scanned — is the walk right?`);
  assert.deepEqual(offenders, [], 'a private folder is made by makePrivateDir, which locks it on Windows when it creates it');
});

test('ARC-09-C272 — the helpers are where the folders are made, and the sites use them', () => {
  for (const rel of HELPERS) {
    assert.ok(privateMkdirs(readFileSync(join(root, rel), 'utf8')).length >= 1, `${rel} makes no private folder: the rule has no home`);
  }
  const use = (dir, ext) => walk(join(root, dir), ext).filter((f) => /\bmakePrivateDir\s*\(/.test(stripComments(readFileSync(f, 'utf8')))).length;
  assert.ok(use('tools/snowarch/lib', '.mjs') >= 10, 'the engine\'s private folders do not go through makePrivateDir');
  assert.ok(use('packages/snowarch/src', '.ts') >= 4, 'the server\'s private folders do not go through makePrivateDir');
});
