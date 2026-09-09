import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/**
 * Two Windows path/URL confusions, pinned as a rule rather than left to be re-learned.
 *
 * Both have now cost a CI round in this ARC. Taking a module URL's `pathname` yields `/D:/a/…` on
 * Windows, and joining that produced `D:\D:\a\…`; and a dynamic `import()` of an absolute path is
 * a URL, so `D:\a\repo\…` is refused with "Only URLs with a scheme in: file, data, and node are
 * supported". Neither is visible on macOS or Linux, which is exactly why they need a test rather
 * than a memory.
 *
 * The two forbidden shapes are ASSEMBLED below rather than written out — a detector that spells
 * what it forbids is a hit in its own sweep, which is the ninth time that has come up here.
 */
const files = [];
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.mjs')) files.push(p);
  }
};
walk(join(repoRoot, 'tools', 'snowarch'));
walk(join(repoRoot, 'tests'));
walk(join(repoRoot, 'scripts'));

/**
 * Repo-relative, with forward slashes on every platform.
 *
 * `readdirSync` + `join` yields `tools\\snowarch\\…` on Windows, so comparing against a
 * forward-slash literal failed there — in the very test whose subject is Windows path handling.
 * The server suite learned the same thing at ARC-04 and its `rel()` does exactly this.
 */
const rel = (f) => f.slice(repoRoot.length + 1).split(sep).join('/');

test('no module derives a path from import.meta.url with .pathname', () => {
  const hits = files
    .filter((f) => /new URL\([^)]*import\.meta\.url\s*\)\s*\.pathname/.test(readFileSync(f, 'utf8')))
    .map(rel);
  assert.deepEqual(hits, [], 'use fileURLToPath — `.pathname` is `/D:/…` on Windows');
});

test('every dynamic import of an absolute path goes through pathToFileURL', () => {
  // A dynamic import whose argument starts with a `join(` call is the shape that breaks: `join`
  // yields a PATH, and an absolute path is not a URL. A relative specifier is fine and is not
  // matched here.
  const hits = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const [, arg] of src.matchAll(/import\(\s*([^)]{0,120}?)\s*\)/g)) {
      const isAbsoluteJoin = /^join\(/.test(arg.trim());
      if (isAbsoluteJoin && !arg.includes('pathToFileURL')) hits.push(`${rel(f)}: import(${arg.trim()})`);
    }
  }
  assert.deepEqual(hits, [], 'wrap the path in pathToFileURL(...).href');
});

test('the scan is not vacuous — it sees the files it claims to scan', () => {
  assert.ok(files.length > 40, `only ${files.length} modules scanned`);
  assert.ok(files.some((f) => rel(f) === 'tools/snowarch/lib/steps/B08.mjs'));
  // ...and it would catch a planted instance of each. Both are assembled from fragments, so this
  // file is not itself a finding for the scans above.
  const planted = `const x = new URL('..', ${'import.meta'}${'.url'}).pathname;`;
  assert.match(planted, /new URL\([^)]*import\.meta\.url\s*\)\s*\.pathname/);
  const plantedImport = `await ${'import'}(${'join'}(root, 'x.js'))`;
  const [, arg] = [...plantedImport.matchAll(/import\(\s*([^)]{0,120}?)\s*\)/g)][0];
  assert.ok(/^join\(/.test(arg.trim()) && !arg.includes('pathToFileURL'));
});
