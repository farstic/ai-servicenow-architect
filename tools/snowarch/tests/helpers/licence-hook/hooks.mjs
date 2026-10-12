// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-11-C6, the spike — the module hook that gives a SPAWNED process a fixture key, and nothing else.
 *
 * A spawned server or CLI trusts only the two keys its build ships (`PRODUCT_KEYS`), whose private
 * halves are on the owner's machine, so a test that spawns one cannot hand it a valid licence. Shape A
 * (the architect's ruling, 2026-10-12) keeps every shipped module free of a seam: this file, loaded
 * through Node's `--import` by the helper beside it, resolves the two keys modules to a fixture module
 * written for the run. Nothing under `packages/snowarch/dist/`, `tools/snowarch/lib/` or the hooks
 * reads a key from the environment, argv, `NODE_OPTIONS` or a path; the keys modules import nothing.
 *
 * It lives under the test helpers and nowhere else. A user can hook a client they run, as anyone can
 * patch one; the product offers no switch for it (C7's stated bound).
 */
let keysUrl = null;

/** The fixture keys module's URL, from the `register()` call the helper writes. */
export async function initialize(data) {
  keysUrl = data?.keysUrl ?? null;
}

/** The two keys modules, by the URL they resolve to: the server's build and the CLI's library. */
const KEYS_MODULES = [/\/packages\/snowarch\/dist\/licence\/keys\.js$/, /\/tools\/snowarch\/lib\/licence\/keys\.mjs$/];

export async function resolve(specifier, context, nextResolve) {
  const resolved = await nextResolve(specifier, context);
  if (keysUrl !== null && KEYS_MODULES.some((re) => re.test(resolved.url))) {
    return { url: keysUrl, format: 'module', shortCircuit: true };
  }
  return resolved;
}
