/**
 * ARC-08-S01 AC 6 — the doctor is what you run when the install went wrong, so it may not depend
 * on the install having worked.
 *
 * WHAT THE ACCEPTANCE PASS MEASURED (item B08-01), on a worktree with no `node_modules`:
 *
 *   node --test tests/doctor/*.test.mjs   →  231 tests, 222 pass, 9 fail
 *
 * The nine are in three files and every one of them needs a LOADED INSTANCE, which needs the
 * server, which cannot start without its runtime dependencies — `Cannot find package
 * '@modelcontextprotocol/sdk' imported from packages/snowarch/dist/server.js`. They fail loudly
 * rather than quietly, because each asserts its own precondition first ("not a live run: Mode:
 * design-only …"), which is the behaviour that made this measurable at all.
 *
 * So the criterion's literal claim — the whole `tests/doctor/` suite passes before `npm ci` — is
 * not true and cannot be, for a reason that is not a defect: three of its files drive the server on
 * purpose. Two things are true and worth keeping, and this file asserts the first:
 *
 *   1. THE ENGINE'S DOCTOR AND ITS TESTS IMPORT NOTHING BUT THE STANDARD LIBRARY. Measured: 43
 *      files, zero bare specifiers. That is the property that lets the doctor run on a broken
 *      install, and it is the one a future import would silently take away.
 *   2. `./snowarch doctor` ITSELF runs before `npm ci`, on all three operating systems — proven by
 *      the `bootstrap (node-cli)` cells, which run it before any install step, and which this
 *      commit extends to run the stdlib subset of this suite too.
 *
 * AC 6's text is amended to say exactly that (STORIES.md, dated note), including the invocation:
 * `node --test tests/doctor/` does not work on Node 24 at all — with or without an install, it
 * reports `Cannot find module '<cwd>/tests/doctor'`, because a bare directory is not a test target
 * on that line. `tests/run.mjs` computes a file list for the same reason, in its own words: "whether
 * `node --test` expands a glob argument itself varies by Node line".
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const posix = (p) => p.split(sep).join('/');

/** The two trees the criterion is about: the doctor's own code, and the tests that drive it. */
export const TREES = ['tools/snowarch/lib/doctor', 'tests/doctor'];

/**
 * This file, exempt from its own scan — the same reason the retired-name detectors are exempt from
 * theirs: a detector cannot detect what it may not spell. The control below names `zod`, `undici`
 * and `chalk` on purpose, and they are the proof the scan works.
 */
export const SELF = 'tests/doctor/stdlib-only.test.mjs';

const files = (rel) => {
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(join(root, d), { withFileTypes: true })) {
      const r = posix(join(d, e.name));
      if (e.isDirectory()) walk(r);
      else if (e.name.endsWith('.mjs')) out.push(r);
    }
  };
  walk(rel);
  return out;
};

/** Every source scan strips comments (CONTRIBUTING) — a specifier in prose is not an import. */
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

/**
 * Specifiers this file resolves without `node_modules`: `node:` built-ins and relative paths.
 *
 * A bare specifier is the offence whatever it names — including a workspace package, which is a
 * symlink `npm ci` creates and a fresh clone does not have.
 */
export function bareSpecifiers(text) {
  const src = strip(text);
  const out = [];
  const add = (s) => {
    if (!s.startsWith('node:') && !s.startsWith('.') && !s.startsWith('/')) out.push(s);
  };
  for (const m of src.matchAll(/(?:^|[\s;])(?:import|export)[\s\S]{0,300}?from\s+['"]([^'"]+)['"]/g)) add(m[1]);
  for (const m of src.matchAll(/\bimport\(\s*['"]([^'"]+)['"]/g)) add(m[1]);
  // `require()` is deliberately NOT scanned. This tree is `.mjs`, where `require` does not exist,
  // so a bare one could not execute and is no risk — while the pattern produced a false finding on
  // the first run: `checks/legacy.mjs:141` prints the remedy `node -e 'JSON.parse(require("fs")…'`,
  // a one-liner for the USER to run, inside a string. A scan that reports a remedy as an import is
  // a scan people learn to ignore.
  return out;
}

test('AC 6 — the doctor and its tests import only the standard library', () => {
  const scanned = TREES.flatMap(files);
  assert.ok(scanned.length > 30, `only ${scanned.length} file(s) scanned — the walk is wrong`);

  const findings = [];
  for (const rel of scanned.filter((f) => f !== SELF)) {
    for (const s of bareSpecifiers(readFileSync(join(root, rel), 'utf8'))) {
      findings.push(`${rel}: ${s}`);
    }
  }
  assert.deepEqual(findings, [],
    `${findings.length} import(s) that need node_modules:\n  ${findings.join('\n  ')}`);
  // The exemption is one file wide and really is in the scanned set, so it cannot quietly become a
  // name that matches nothing while this file stops being checked for anything else.
  assert.ok(scanned.includes(SELF), `${SELF} is not in the scanned set — the exemption is stale`);
});

test('AC 6 — the scan finds a bare specifier, and is not fooled by prose or by `node:`', () => {
  // Both directions. Without the first half this passes on a scan that matches nothing; without
  // the second it passes on a scan that matches everything.
  assert.deepEqual(bareSpecifiers("import { z } from 'zod';"), ['zod']);
  assert.deepEqual(bareSpecifiers("import { x } from '@farstic/snowarch';"), ['@farstic/snowarch']);
  assert.deepEqual(bareSpecifiers("const m = await import('undici');"), ['undici']);
  // `require()` is not scanned, and the reason is in `bareSpecifiers` — this asserts the decision
  // rather than leaving it to be rediscovered as a gap.
  assert.deepEqual(bareSpecifiers("const c = require('chalk');"), []);

  assert.deepEqual(bareSpecifiers("import { readFileSync } from 'node:fs';"), []);
  assert.deepEqual(bareSpecifiers("import { x } from '../lib/y.mjs';"), []);
  assert.deepEqual(bareSpecifiers("import { x } from './y.mjs';"), []);

  // Prose is not an import — the rule this repository states and the one ARC-06-C1 was about.
  assert.deepEqual(bareSpecifiers("// we deliberately do not import { z } from 'zod' here"), []);
  assert.deepEqual(bareSpecifiers("/**\n * Never `import x from 'undici'` in this tree.\n */"), []);
});
