// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-11-C6 (A1) — the release's docs gate runs `node scripts/docs.mjs verify`, and that cannot drift from what
 * the launcher's `docs verify` runs.
 *
 * From 2.0.13 `./snowarch docs verify` is refused without a licence, and the release dry run holds none: its
 * test gate and its docs gate run in one process tree, so no per-step licence can reach the one without the
 * other (the architect's ruling, 2026-10-12). The gate takes the maintainer entry, `scripts/docs.mjs`, which is
 * not the gated CLI. What the launcher's spelling bought, a gate that passes only when the product's own path
 * works, is kept by parity: both entry points hand the one `runDocs` the same arguments, and say the same thing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { gatePlan } from '../scripts/lib/release/gates.mjs';
import { licensedEnv } from '../tools/snowarch/tests/helpers/licence-hook/index.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

test('ARC-11-C6 (A1) — the release docs gate is `node scripts/docs.mjs verify`, on every platform', () => {
  for (const platform of ['darwin', 'linux', 'win32']) {
    const docs = gatePlan({ platform, env: {} }).find((g) => g.name === 'docs');
    assert.deepEqual(docs.argv, ['node', 'scripts/docs.mjs', 'verify'], platform);
  }
});

test('ARC-11-C6 (A1) — both entry points hand runDocs the same arguments: the shim its own, the CLI what follows `docs`', () => {
  const shim = read('scripts/docs.mjs');
  assert.match(shim, /^import \{ runDocs \} from '\.\.\/tools\/snowarch\/lib\/docs\/cli\.mjs';$/m);
  assert.match(shim, /^process\.exitCode = runDocs\(process\.argv\.slice\(2\)\);$/m);
  const cli = read('tools/snowarch/lib/cli.mjs');
  assert.match(cli, /async function docsCommand\(\{ argv \}\) \{\n {2}const \{ runDocs \} = await import\('\.\/docs\/cli\.mjs'\);\n {2}return runDocs\(argv\);\n\}/);
});

test('ARC-11-C6 (A1) — and they say the same thing: `verify --json` through each is the same report', () => {
  const opts = (env) => ({ cwd: ROOT, encoding: 'utf8', env, maxBuffer: 1 << 26 });
  const viaShim = spawnSync(process.execPath, [join(ROOT, 'scripts', 'docs.mjs'), 'verify', '--json'], opts(process.env));
  const viaCli = spawnSync(process.execPath, [join(ROOT, 'tools', 'snowarch', 'bin', 'snowarch.mjs'), 'docs', 'verify', '--json'],
    opts(licensedEnv(process.env)));
  assert.equal(viaShim.status, viaCli.status, `${viaShim.stderr}\n${viaCli.stderr}`);
  assert.deepEqual(JSON.parse(viaCli.stdout), JSON.parse(viaShim.stdout));
});
