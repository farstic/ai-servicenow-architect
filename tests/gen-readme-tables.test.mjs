// The README generator, proved on a tree with no `node_modules` — which is every fresh clone.
//
// It used to `import()` the server's built modules, and one of them pulls the whole tool tree and
// its runtime dependencies. On a clone where `npm ci` had not run it died with
// `ERR_MODULE_NOT_FOUND`; `gen-all --check` counted the crash as "1 generator(s) stale" and the
// doctor's E-21 reported it as "packages/snowarch/README.md differs from generator output" on a
// freshly bootstrapped design-only install, where having no dependencies is the DESIGN.
//
// So the first test here is the fresh clone: every tracked file, nothing else, and the generator
// has to answer. The second is the guard on how it now reads the bundle map — as text — against
// the module itself, wherever the dependencies exist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { parseBundleMap, readBundleMap, BundleMapError } from '../scripts/lib/bundles.mjs';
import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUILT_TOOLS = join(root, 'packages/snowarch/dist/tools/index.js');

/**
 * Every TRACKED file, copied — the working tree's content, not HEAD's.
 *
 * `git archive HEAD` would test the last commit rather than the change under test, and the fix and
 * its proof have to travel in one commit. What matters is what a clone HAS: tracked files, no
 * `node_modules`, no `.git`.
 */
function freshClone(t) {
  const dest = tempDir('snowarch-clone-', t);
  const files = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
    .split('\n').filter(Boolean);
  let copied = 0;
  for (const rel of files) {
    const from = join(root, rel);
    // A gitlink (`vendor/ServiceNowDocs`) is listed like a file and is a directory. It is also
    // exactly what a fresh clone does NOT have until `docs sync` runs, so skipping it makes the
    // fixture more like the case under test rather than less.
    let st;
    try { st = statSync(from); } catch { continue; }
    if (!st.isFile()) continue;
    mkdirSync(join(dest, dirname(rel)), { recursive: true });
    cpSync(from, join(dest, rel));
    copied += 1;
  }
  return { dest, count: copied };
}

test('the README generator runs on a clone with no node_modules', (t) => {
  const { dest, count } = freshClone(t);
  // Preconditions, asserted before the thing under test acts: a fixture that quietly had
  // dependencies would prove nothing at all.
  assert.ok(count > 100, `only ${count} tracked files were copied`);
  assert.equal(existsSync(join(dest, 'node_modules')), false, 'the fixture has node_modules');
  assert.equal(existsSync(join(dest, 'packages/snowarch/node_modules')), false,
    'the fixture has the package\'s node_modules');
  assert.ok(existsSync(join(dest, 'packages/snowarch/dist/contract.json')), 'the contract is missing');
  // A clone has TRACKED files and nothing else, so an untracked module the generator imports is
  // this failure. The message says so, because "cannot find module" in a temp directory does not.
  for (const rel of ['scripts/gen-readme-tables.mjs', 'scripts/lib/bundles.mjs']) {
    assert.ok(existsSync(join(dest, rel)), `${rel} is not tracked — git add it, or a clone has no copy`);
  }

  const r = spawnSync(process.execPath, [join(dest, 'scripts/gen-readme-tables.mjs'), '--check'],
    { cwd: dest, encoding: 'utf8' });
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
  assert.match(r.stdout, /README\.md generated blocks are current/);
  assert.equal(/ERR_MODULE_NOT_FOUND|Cannot find package/.test(`${r.stdout}${r.stderr}`), false);
});

test('gen-all --check is clean on a clone with no node_modules', (t) => {
  const { dest } = freshClone(t);
  const r = spawnSync(process.execPath, [join(dest, 'scripts/gen-all.mjs'), '--check'],
    { cwd: dest, encoding: 'utf8' });
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
  assert.match(r.stdout, /generator\(s\) current/);
});

test('the bundle map read as text is the bundle map the server exports', async () => {
  const parsed = readBundleMap(BUILT_TOOLS);
  assert.ok(Object.keys(parsed).length > 5, 'suspiciously few bundles');
  let real;
  try {
    // `pathToFileURL`, never a bare absolute path: `import('C:\\…')` is not a URL on Windows.
    ({ ROLE_BUNDLE_MAP: real } = await import(pathToFileURL(BUILT_TOOLS).href));
  } catch (e) {
    // No dependencies here — which is the very condition the generator now survives. The parity
    // claim is made wherever they exist, which includes every CI cell.
    assert.match(String(e.code ?? e.message), /ERR_MODULE_NOT_FOUND|Cannot find/);
    return;
  }
  assert.deepEqual(parsed, real, 'the text reading and the module have drifted');
});

test('the flags and presets in the README come from the same declaration the server enforces', async () => {
  const contract = JSON.parse(readFileSync(join(root, 'packages/snowarch/dist/contract.json'), 'utf8'));
  let perms;
  try {
    perms = await import(pathToFileURL(join(root, 'packages/snowarch/dist/utils/permissions.js')).href);
  } catch (e) {
    assert.match(String(e.code ?? e.message), /ERR_MODULE_NOT_FOUND|Cannot find/);
    return;
  }
  assert.deepEqual(contract.flags.map((f) => f.name), perms.FLAG_NAMES);
  assert.deepEqual(contract.presets, perms.PRESETS);
});

test('an unrecognisable bundle map throws with the file named — it never reads as empty', () => {
  assert.throws(() => parseBundleMap('export const SOMETHING_ELSE = {};', 'fixture.js'),
    (e) => e instanceof BundleMapError && /fixture\.js/.test(e.message));
  assert.throws(() => parseBundleMap('export const ROLE_BUNDLE_MAP = { a: [1] };', 'fixture.js'),
    (e) => e instanceof BundleMapError && /not a list of tool names/.test(e.message));
  // A brace inside a tool name must not close the literal early.
  // Deliberately NOT `snow_*` names: L01 checks every such token against the contract, and a
  // fixture that invented one would be a finding in a file whose subject is something else.
  const odd = "export const ROLE_BUNDLE_MAP = { a: ['tool_x_}', 'tool_y'], b: ['tool_z'] };";
  assert.deepEqual(parseBundleMap(odd, 'fixture.js'), { a: ['tool_x_}', 'tool_y'], b: ['tool_z'] });
});
