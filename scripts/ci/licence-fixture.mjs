#!/usr/bin/env node
// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-11-C6 — a fixture licence for the CI steps that run the product outside the allowed set.
 *
 * From 2.0.13 the CLI refuses every command but the allowed ones without a licence it trusts, and CI holds no
 * product key: the private halves are the owner's. So a step that runs `docs sync`, `instance add` or
 * `store migrate` takes the hook the tests take (tools/snowarch/tests/helpers/licence-hook) and a licence
 * signed with a key made for this run, NEVER a product key.
 *
 * PER STEP, NEVER JOB-WIDE (the architect's ruling, 2026-10-12). A hook in the job's environment would reach
 * the test runner, and licence-keys-guard.test.mjs, which checks the keys the product ships, would check the
 * fixture instead. So this writes, and a step takes its outputs as `env:` on itself alone.
 *
 * Writes, under <dir> (default $RUNNER_TEMP/snowarch-licence):
 *   hook/                      the fixture keys module and the register module;
 *   root/.local/licence.json   LIC-2026-9000, live and perpetual.
 * and appends to $GITHUB_OUTPUT (stdout without it) `node_options` (the --import flag) and `root` (for
 * SNOWARCH_STATE_ROOT and CLAUDE_PROJECT_DIR). The directory must persist for the job, which is why it is not a
 * temp directory removed at exit. It refuses a directory inside this checkout, as licensedEnv does.
 *
 * Usage: node scripts/ci/licence-fixture.mjs [<dir>]
 * Exit 0 written · 2 no directory to write to, or one inside this checkout.
 */
import { appendFileSync, mkdirSync, writeFileSync, writeSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FIXTURE_LICENCE, fixtureKeysHook } from '../../tools/snowarch/tests/helpers/licence-hook/index.mjs';
import { keyPair, licenceText, productKeys } from '../../tools/snowarch/tests/helpers/licence.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const fail = (text) => { writeSync(2, `licence-fixture: ${text}\n`); process.exitCode = 2; };

function main(argv) {
  const given = argv[0] ?? (process.env.RUNNER_TEMP ? join(process.env.RUNNER_TEMP, 'snowarch-licence') : null);
  if (!given) return fail('no directory given, and no RUNNER_TEMP to put one in');
  const dir = resolve(given);
  const rel = relative(ROOT, dir);
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
    return fail(`${dir} is inside this checkout — a fixture licence there would replace the one in its .local/`);
  }
  const primary = keyPair();
  const hookDir = join(dir, 'hook');
  mkdirSync(hookDir, { recursive: true });
  const hook = fixtureKeysHook(hookDir, productKeys(primary, keyPair()));
  const root = join(dir, 'root');
  mkdirSync(join(root, '.local'), { recursive: true, mode: 0o700 });
  writeFileSync(join(root, '.local', 'licence.json'), licenceText({ ...FIXTURE_LICENCE }, primary));
  const lines = `node_options=${hook.nodeOptions}\nroot=${root}\n`;
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, lines);
  else process.stdout.write(lines);
  process.stdout.write(`licence-fixture: ${FIXTURE_LICENCE.id} under ${root}, signed by a key made for this run\n`);
}

main(process.argv.slice(2));
