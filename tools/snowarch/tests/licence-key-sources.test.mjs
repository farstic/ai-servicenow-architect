// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-11-C6 step 8 — nothing the product ships takes a key from the environment, argv, `NODE_OPTIONS` or a path.
 *
 * The architect's condition for shape A (2026-10-11): the test hook lives only under the test helpers, and a class
 * guard asserts that no shipped file reads a key from anywhere else. `helpers/key-sources.mjs` is the reader; this
 * file runs it on the step-3 universe and on planted sources, one or more per rule, so each rule is shown able to
 * fail. The one declared site, the owner's `licence revoke`, is held to a count of exactly 1 (the architect's
 * ruling, 2026-10-12).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DECLARED_MIN, keysModuleWrites, scanKeySources } from './helpers/key-sources.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const real = scanKeySources({ base: ROOT });

test('ARC-11-C6 step 8 — nothing shipped takes a key from anywhere but the keys modules', async () => {
  const r = await real;
  // An instrument that read nothing, or saw no sink, would pass: on 2026-10-12 the universe held 291 files, 190 of
  // them code, the sink was core's verify once per side, and 38 slots were held.
  assert.ok(r.files > 250 && r.code > 150, `read ${r.files} files, ${r.code} of them code`);
  assert.deepEqual(r.sinks.map((s) => s.file), ['packages/snowarch/dist/licence/core.js', 'tools/snowarch/lib/licence/core.mjs']);
  assert.ok(r.slots >= 30, `held ${r.slots} slots`);
  assert.deepEqual(r.violations, [], r.violations.map((v) => `${v.rule} ${v.file}:${v.line} ${v.what}`).join('\n'));
});

test('ARC-11-C6 step 8 — one declared site: the owner\'s revoke, which checks its own list with the key it signs with', async () => {
  const r = await real;
  assert.deepEqual(r.declared.map((d) => d.file), ['tools/snowarch/lib/commands/licence.mjs']);
  assert.ok(r.declared[0].why.length >= DECLARED_MIN, r.declared[0].why);
});

// ── Planted sources ─────────────────────────────────────────────────────────────────────────────────────────
// A small tree in the product's shape: a keys module, a core with the sink, a state module with the default, and a
// consumer. Clean as given; each case changes one file, and the rule it breaks must say so.
const KEYS = 'tools/snowarch/lib/licence/keys.mjs';
const CORE = 'tools/snowarch/lib/licence/core.mjs';
const STATE = 'tools/snowarch/lib/licence/state.mjs';
const USE = 'tools/snowarch/lib/commands/consumer.mjs';
const BASE = {
  [KEYS]: "export const PRODUCT_KEYS = Object.freeze([\n  Object.freeze({ role: 'primary', fingerprint: 'sha256:00', publicKey: 'k' }),\n]);\n",
  [CORE]: "import { createPublicKey, verify } from 'node:crypto';\n"
    + 'export function verifyBody(body, signature, keys) {\n'
    + '  const key = keys.find((k) => k.fingerprint === signature.key);\n'
    + "  return verify(null, Buffer.from(body), createPublicKey(key.publicKey), Buffer.from(signature.value, 'base64'));\n"
    + '}\n'
    + 'export function checkLicence(text, { keys, now }) { return verifyBody(text, { now }, keys); }\n',
  [STATE]: "import { checkLicence } from './core.mjs';\nimport { PRODUCT_KEYS } from './keys.mjs';\n"
    + 'export function licenceStatus(root, { keys = PRODUCT_KEYS, now = new Date() } = {}) {\n'
    + '  return checkLicence(root, { keys, now });\n}\n',
  [USE]: "import { licenceStatus } from '../licence/state.mjs';\nexport const run = (root) => licenceStatus(root);\n",
};
const scan = (over = {}) => {
  const tree = { ...BASE, ...over };
  for (const [k, v] of Object.entries(tree)) if (v === null) delete tree[k];
  return scanKeySources({ base: ROOT, files: Object.keys(tree), read: (f) => tree[f] });
};
const use = (body, imports = '') => ({
  [USE]: `import { licenceStatus } from '../licence/state.mjs';\n${imports}${body}\n`,
});

test('ARC-11-C6 step 8 — planted: the tree as given is clean, with its one sink', async () => {
  const r = await scan();
  assert.deepEqual(r.violations, []);
  assert.deepEqual(r.sinks.map((s) => s.file), [CORE]);
  assert.deepEqual(r.declared, []);
});

const CASES = [
  // The sink.
  ['the sink is handed a key from the environment', 'sink', {
    [CORE]: BASE[CORE].replace('createPublicKey(key.publicKey)', 'createPublicKey(process.env.SNOW_KEY)') }],
  ['the sink is handed a key read from a path', 'sink', {
    [CORE]: `import { readFileSync } from 'node:fs';\n${BASE[CORE].replace('createPublicKey(key.publicKey)', "createPublicKey(readFileSync('/k.pem'))")}` }],
  ['the sink under another name, handed an argv key', 'sink', {
    [CORE]: BASE[CORE].replace('createPublicKey, verify }', 'createPublicKey, verify as check }')
      .replace('return verify(null', 'return check(null').replace('createPublicKey(key.publicKey)', 'createPublicKey(process.argv[2])') }],
  ['a second kind of sink, createVerify', 'sink', {
    [CORE]: BASE[CORE].replace('createPublicKey, verify }', 'createPublicKey, createVerify, verify }')
      .replace('export function checkLicence', "export const v = () => createVerify('sha256');\nexport function checkLicence") }],
  // The slots.
  ['an option parsed from the environment', 'slot', use('export const a = (r) => licenceStatus(r, { keys: JSON.parse(process.env.SNOW_KEYS) });')],
  ['a binding loaded from argv', 'slot', use('const list = JSON.parse(process.argv[2]);\nexport const a = (r) => licenceStatus(r, { keys: list });')],
  ['a key list with an entry read from a path', 'slot', use(
    "export const a = (r) => licenceStatus(r, { keys: [...PRODUCT_KEYS, { role: 'x', publicKey: readFileSync('/k.pem', 'utf8') }] });",
    "import { readFileSync } from 'node:fs';\nimport { PRODUCT_KEYS } from '../licence/keys.mjs';\n")],
  ['a default that prefers the environment', 'slot', {
    [STATE]: BASE[STATE].replace('keys = PRODUCT_KEYS', 'keys = process.env.K ? JSON.parse(process.env.K) : PRODUCT_KEYS') }],
  ['a positional argument, called in the same module', 'slot', {
    [CORE]: BASE[CORE].replace('verifyBody(text, { now }, keys)', 'verifyBody(text, { now }, JSON.parse(process.env.K))') }],
  ['a positional argument, called through an import', 'slot', use(
    'export const a = (t) => verifyBody(t, {}, process.env.K);', "import { verifyBody } from '../licence/core.mjs';\n")],
  ['an option handed through a function that forwards its options', 'slot', use(
    "function wrap(opts) { return licenceStatus('.', opts); }\nexport const a = () => wrap({ keys: process.env.K });")],
  ['an options object built in a binding', 'slot', use('const opts = { keys: process.env.K };\nexport const a = (r) => licenceStatus(r, opts);')],
  ['a stored field assigned from the environment', 'slot', use(
    'let held = null;\nexport function set() { held = { keys: process.env.K }; }\nexport const a = (r) => licenceStatus(r, { keys: held.keys });')],
  ['an option through a table the reader cannot resolve', 'slot', use(
    'const T = { s: licenceStatus };\nexport const a = (r) => T.s(r, { keys: process.env.K });')],
  ['a map whose callback reads the environment', 'slot', use(
    'export const a = (r) => licenceStatus(r, { keys: PRODUCT_KEYS.map((k) => ({ ...k, publicKey: process.env.K })) });',
    "import { PRODUCT_KEYS } from '../licence/keys.mjs';\n")],
  ['a function that takes keys by position, stored in a table', 'slot', use(
    'const T = { v: verifyBody };\nexport const a = (t) => T.v(t, {}, process.env.K);', "import { verifyBody } from '../licence/core.mjs';\n")],
  // The seams.
  ['the doctor\'s seam read off the environment', 'slot', use('export const a = (r) => licenceStatus(r, { keys: process.env.licenceKeys });')],
  ['a shipped object fills the licenceKeys seam', 'seam', use('export const a = (banner) => banner({ licenceKeys: [] });')],
  ['the licenceKeys seam defaults to the environment', 'seam', use('export function banner({ licenceKeys = process.env.K } = {}) { return licenceKeys; }')],
  ['a shipped module assigns the seam', 'seam', use('export const a = (ctx) => { ctx.licenceKeys = []; };')],
  // The keys modules.
  ['the keys module imports', 'leaf', { [KEYS]: `import { readFileSync } from 'node:fs';\n${BASE[KEYS]}` }],
  ['the keys module reads the environment', 'leaf', { [KEYS]: BASE[KEYS].replace("publicKey: 'k'", 'publicKey: process.env.K') }],
  // One list per side.
  ['a second PRODUCT_KEYS', 'one-list', use('export const PRODUCT_KEYS = Object.freeze([]);')],
  ['PRODUCT_KEYS imported from a module that is not a keys module', 'one-list', {
    ...use('export const a = (r) => licenceStatus(r, { keys: PRODUCT_KEYS });', "import { PRODUCT_KEYS } from './other.mjs';\n"),
    'tools/snowarch/lib/commands/other.mjs': 'export const PRODUCT_KEYS = [];\n' }],
  ['public-key armour outside the keys module', 'one-list', use("export const K = '-----BEGIN PUBLIC KEY-----';")],
  // The hook's channel and its API.
  ['a shipped module names NODE_OPTIONS', 'node-options', use('export const a = () => process.env.NODE_OPTIONS;')],
  ['a shipped module imports node:module\'s register', 'register', use('export const a = () => register;', "import { register } from 'node:module';\n")],
  ['a shipped module reaches register through a namespace', 'register', use("export const a = () => m.register('x');", "import * as m from 'node:module';\n")],
  // The declaration.
  ['a declaration that gives no reason', 'slot', use(
    '// owner key from path: x\nexport const a = (r) => licenceStatus(r, { keys: process.env.K });')],
];

for (const [name, rule, over] of CASES) {
  test(`ARC-11-C6 step 8 — planted: ${name} is a ${rule} violation`, async () => {
    const r = await scan(over);
    assert.ok(r.violations.some((v) => v.rule === rule), JSON.stringify(r.violations, null, 1));
  });
}

test('ARC-11-C6 step 8 — planted: a declared site with its reason is reported, not a violation', async () => {
  const r = await scan(use('// owner key from path: the owner\'s own list file, checked before it is re-signed\n'
    + 'export const a = (r) => licenceStatus(r, { keys: process.env.K });'));
  assert.deepEqual(r.violations, []);
  assert.deepEqual(r.declared.map((d) => [d.file, d.line]), [[USE, 3]]);
});

// ── In the tests: the hook is the one mechanism (ARC-11-C6 step 9) ──────────────────────────────────────────
test('ARC-11-C6 step 9 — no test writes a keys module of its own: a fixture key reaches a process only through the hook', async () => {
  assert.deepEqual(await keysModuleWrites({ base: ROOT }), []);
});

test('ARC-11-C6 step 9 — planted: a keys module written directly or from a binding is found; the helper\'s, and a string, are not', async () => {
  const tree = {
    'packages/snowarch/tests/a.test.ts': "writeFileSync(p, `export const PRODUCT_KEYS = Object.freeze(${k});`);\n",
    'tests/b.test.mjs': "const body = 'export const PRODUCT_KEYS = [];';\nfs.writeFileSync(p, body);\n",
    'tools/snowarch/tests/helpers/licence-hook/c.mjs': "writeFileSync(p, 'export const PRODUCT_KEYS = [];');\n",
    'tools/snowarch/tests/d.test.mjs': "const planted = 'export const PRODUCT_KEYS = [];';\nscan(planted);\n",
  };
  const writes = await keysModuleWrites({ base: ROOT, files: Object.keys(tree), read: (f) => tree[f] });
  assert.deepEqual(writes, [{ file: 'packages/snowarch/tests/a.test.ts', line: 1 }, { file: 'tests/b.test.mjs', line: 2 }]);
});
