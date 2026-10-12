// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-11-C6 step 4b (ruling R3) — ONE gate for both doors: ./snowarch and the package CLI.
 *
 * The set of commands that run without a licence, and the decision, live in `packages/snowarch/src/licence/gate.ts`;
 * the engine re-exports the build of it. Two copies held equal by a test would still be two doors that can differ
 * between a change and its test, so the first case asserts IDENTITY, and the second that no other source defines them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import * as engine from '../lib/licence/state.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const NAMES = ['REFUSED', 'CLI_ALLOWED', 'CLI_ALLOWED_FORMS', 'allowedCommand', 'refusesCommand'];

test('ARC-11-C6 — the engine\'s gate IS the package\'s: the same objects, not equal copies', async () => {
  const gate = await import(pathToFileURL(join(ROOT, 'packages', 'snowarch', 'dist', 'licence', 'gate.js')).href);
  for (const name of NAMES) {
    assert.notEqual(gate[name], undefined, `dist/licence/gate.js exports ${name}`);
    assert.equal(engine[name], gate[name], `the engine's ${name} is the package's own`);
  }
});

test('ARC-11-C6 — no other source defines the set or the decision', () => {
  const roots = ['packages/snowarch/src', 'tools/snowarch/lib', 'tools/snowarch/bin', 'tools/snowarch/hooks'];
  const definition = new RegExp(`\\b(?:const|let|var|function)\\s+(${NAMES.join('|')})\\b`);
  const found = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(?:m?[jt]s|cjs)$/.test(e.name) && !/\.d\.m?ts$/.test(e.name)) {
        for (const line of readFileSync(p, 'utf8').split('\n')) {
          const m = definition.exec(line);
          if (m) found.push(`${relative(ROOT, p).split(sep).join('/')}: ${m[1]}`);
        }
      }
    }
  };
  for (const r of roots) walk(join(ROOT, r));
  assert.deepEqual(found.sort(), NAMES.map((n) => `packages/snowarch/src/licence/gate.ts: ${n}`).sort());
});
