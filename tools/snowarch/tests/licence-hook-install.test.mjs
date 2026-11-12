// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C271 — the test hook picks its API by what `node:module` has, and both branches are held.
 *
 * Node 26 deprecates `module.register()` (DEP0205) and prints a warning on stderr in every process the hook is loaded into. The hook
 * installs through `registerHooks` where the module has it and through `register()` only where it does not. The choice is by feature, not by
 * version, so it is held here by handing `installHook` a module that has the function, one that has not, and one that has both.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { installHook } from './helpers/licence-hook/hooks.mjs';
import { fixtureKeysHook } from './helpers/licence-hook/index.mjs';
import { tempDir } from './helpers/temp.mjs';

const HOOKS_URL = 'file:///checkout/tools/snowarch/tests/helpers/licence-hook/hooks.mjs';
const FIXTURE_KEYS = 'file:///tmp/run/fixture-keys.mjs';

test('ARC-09-C271 — a module that has registerHooks gets registerHooks, and register() is never called', () => {
  const calls = [];
  installHook({ registerHooks: (hooks) => calls.push(['registerHooks', hooks]), register: () => calls.push(['register']) }, HOOKS_URL, FIXTURE_KEYS);
  assert.deepEqual(calls.map((c) => c[0]), ['registerHooks']);
  assert.equal(typeof calls[0][1].resolve, 'function');
});

test('ARC-09-C271 — a module without registerHooks gets register(), with the hooks file and the fixture keys as data', () => {
  const calls = [];
  installHook({ register: (...args) => calls.push(args) }, HOOKS_URL, FIXTURE_KEYS);
  assert.deepEqual(calls, [[HOOKS_URL, { data: { keysUrl: FIXTURE_KEYS } }]]);
  // A registerHooks that is present but not a function is absent for this purpose: the test is on the feature, not on the name.
  const odd = [];
  installHook({ registerHooks: 'not a function', register: (...args) => odd.push(args) }, HOOKS_URL, FIXTURE_KEYS);
  assert.equal(odd.length, 1);
});

test('ARC-09-C271 — the rule installed through registerHooks is the hook\'s rule: the two keys modules become the fixture, nothing else does', () => {
  let installed;
  installHook({ registerHooks: (hooks) => { installed = hooks; } }, HOOKS_URL, FIXTURE_KEYS);
  const next = (url) => () => ({ url, format: 'module' });
  for (const keys of ['file:///checkout/packages/snowarch/dist/licence/keys.js', 'file:///checkout/tools/snowarch/lib/licence/keys.mjs']) {
    assert.deepEqual(installed.resolve('./keys.js', {}, next(keys)), { url: FIXTURE_KEYS, format: 'module', shortCircuit: true }, keys);
  }
  const other = 'file:///checkout/tools/snowarch/lib/other.mjs';
  assert.deepEqual(installed.resolve('./other.mjs', {}, next(other)), { url: other, format: 'module' });
});

test('ARC-09-C271 — the file a child imports calls installHook with the real module, the hooks file and the fixture keys', (t) => {
  const dir = tempDir('hook-install-', t);
  const hook = fixtureKeysHook(dir, []);
  const text = readFileSync(join(dir, 'register-hook.mjs'), 'utf8');
  assert.match(text, /^import \* as nodeModule from 'node:module';$/m);
  assert.match(text, /^import \{ installHook \} from "file:[^"]*licence-hook\/hooks\.mjs";$/m);
  assert.ok(text.includes(`installHook(nodeModule, `) && text.includes(JSON.stringify(hook.keysUrl)));
  // No call to either API is written here: the choice lives in one place.
  assert.equal(/\bregister\(|registerHooks\(/.test(text), false, text);
});
