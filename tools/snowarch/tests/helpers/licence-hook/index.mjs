// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-11-C6, the spike — how a test starts a process that trusts a fixture key.
 *
 * `fixtureKeysHook(dir, keys)` writes two files into a test's own temp directory:
 * - `keys.mjs`, a fixture keys module in the shape of the shipped ones (`PRODUCT_KEYS` and nothing else);
 * - `register.mjs`, which registers `hooks.mjs` with that module's URL baked in, so the hook reads no
 *   variable at all.
 *
 * It returns `nodeOptions`, the `--import` flag for `NODE_OPTIONS` (which reaches a node started through
 * a launcher), and `importArgs`, the same flag for a node started directly. URLs, never paths: on
 * Windows `--import` refuses an absolute path that is not a `file:` URL, and a URL carries no space.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const HOOKS_URL = new URL('./hooks.mjs', import.meta.url).href;

export function fixtureKeysHook(dir, keys) {
  const keysFile = join(dir, 'fixture-keys.mjs');
  writeFileSync(keysFile, `export const PRODUCT_KEYS = Object.freeze(${JSON.stringify(keys, null, 2)}.map((k) => Object.freeze(k)));\n`);
  const keysUrl = pathToFileURL(keysFile).href;
  const registerFile = join(dir, 'register-hook.mjs');
  writeFileSync(registerFile, "import { register } from 'node:module';\n"
    + `register(${JSON.stringify(HOOKS_URL)}, { data: { keysUrl: ${JSON.stringify(keysUrl)} } });\n`);
  const registerUrl = pathToFileURL(registerFile).href;
  return { keysUrl, registerUrl, importArgs: [`--import=${registerUrl}`], nodeOptions: `--import=${registerUrl}` };
}
