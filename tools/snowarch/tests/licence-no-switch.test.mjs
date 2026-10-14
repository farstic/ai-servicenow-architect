// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-11-C6 step 3 — the switch is gone from everything that ships, by name.
 *
 * From 2.0.13 enforcement takes no switch (`licence-unconditional.test.mjs` holds the behaviour). A shipped
 * file that still names the variable is either a reader of it, which is the defect itself, or a sentence
 * telling a user about a switch that does nothing, which sends them looking for a way out the product does
 * not have. So the name appears in no file the product ships: the server's build, the CLI's library and
 * entry point, and the hooks. Tests may name it, to show it changes nothing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SHIPPED = ['packages/snowarch/dist', 'tools/snowarch/lib', 'tools/snowarch/bin', 'tools/snowarch/hooks'];
// Built from parts, so this file does not name it either way a reader would search for.
const NAME = ['SNOW', 'LICENCE', 'ENFORCE'].join('_');

function files(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...files(p));
    else if (statSync(p).size < 8_000_000) out.push(p);
  }
  return out;
}

test('ARC-11-C6 — no shipped file names the enforcement variable', () => {
  const read = SHIPPED.flatMap((d) => files(join(ROOT, d)));
  // An instrument that read nothing would pass: the four trees held 288 files on 2026-10-12.
  assert.ok(read.length > 250, `read ${read.length} files`);
  const naming = read.filter((f) => readFileSync(f, 'utf8').includes(NAME)).map((f) => relative(ROOT, f).split('\\').join('/'));
  assert.deepEqual(naming, [], `${naming.length} shipped file(s) still name ${NAME}`);
});
